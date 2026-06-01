/**
 * POST /api/cast/send
 *
 * Sends a video stream URL to a DLNA/UPnP MediaRenderer device.
 * Uses the UPnP AVTransport service to:
 *   1. SetAVTransportURI — tell the device what to play
 *   2. Play             — start playback
 *
 * Body: { deviceLocation: string, streamUrl: string, title: string }
 *
 * The streamUrl should be the full HTTP URL to the video file, e.g.:
 *   http://192.168.1.10:3000/api/stream/my-movie.mp4
 *
 * This works with any DLNA-compliant TV (Samsung, LG, Sony, Vizio, etc.)
 * and media players like Kodi, VLC, and BubbleUPnP.
 */

import type { Request, Response } from 'express';
import http from 'http';
import { URL } from 'url';
import { startTracking } from '../../../dlnaPositionTracker.js';
import os from 'os';
import { requireAuth } from '../../../authMiddleware.js';
import { readLibrary } from '../../../libraryStore.js';

// ── Resolve LAN IP (same logic as /api/remote/qr) ────────────────────────────

function getLanIP(): string {
  const interfaces = os.networkInterfaces();
  const candidates: string[] = [];
  for (const [name, iface] of Object.entries(interfaces)) {
    if (!iface) continue;
    const nameLower = name.toLowerCase();
    const isVirtual = nameLower.includes('vethernet') || nameLower.includes('docker') ||
      nameLower.includes('vmware') || nameLower.includes('virtualbox') ||
      nameLower.includes('wsl') || nameLower.includes('loopback');
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        candidates.push(isVirtual ? `__virtual__${addr.address}` : addr.address);
      }
    }
  }
  const real = candidates.filter(ip => !ip.startsWith('__virtual__'));
  const pool = real.length > 0 ? real : candidates.map(ip => ip.replace('__virtual__', ''));
  return pool.find(ip => ip.startsWith('192.168.')) ||
    pool.find(ip => ip.startsWith('10.')) ||
    pool[0] || 'localhost';
}

// ── Resolve stream URL from mediaId ──────────────────────────────────────────

function resolveStreamUrl(mediaId: string, port: string): string | null {
  try {
    const library = readLibrary<{ id: string; filePath?: string; filename?: string }>();
    const item = library.find(i => i.id === mediaId);
    if (!item) return null;
    const filename = item.filename ?? item.filePath?.split('/').pop() ?? item.filePath;
    if (!filename) return null;
    const lanIP = getLanIP();
    // Prefer HLS for broadest TV codec support; fall back to direct stream
    return `http://${lanIP}:${port}/api/hls/${mediaId}/index.m3u8`;
  } catch {
    return null; // non-fatal — ignore
  }
}

// ── UPnP SOAP helpers ─────────────────────────────────────────────────────────

function soapAction(action: string, service: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="${service}">
      ${body}
    </u:${action}>
  </s:Body>
</s:Envelope>`;
}

function sendSOAP(
  deviceUrl: string,
  controlPath: string,
  service: string,
  action: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise(resolve => {
    try {
      const url = new URL(deviceUrl);
      const soap = soapAction(action, service, body);
      const options = {
        hostname: url.hostname,
        port: parseInt(url.port || '80'),
        path: controlPath,
        method: 'POST',
        timeout: 5000,
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'Content-Length': Buffer.byteLength(soap),
          'SOAPAction': `"${service}#${action}"`,
        },
      };

      const req = http.request(options, res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: `HTTP ${res.statusCode}: ${data.slice(0, 200)}` });
          }
        });
      });

      req.on('error', err => resolve({ ok: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
      req.write(soap);
      req.end();
    } catch (err) {
      resolve({ ok: false, error: String(err) });
    }
  });
}

// ── Fetch AVTransport control URL from device description ─────────────────────

async function getAVTransportControlUrl(location: string): Promise<string | null> {
  return new Promise(resolve => {
    try {
      const url = new URL(location);
      const options = {
        hostname: url.hostname,
        port: parseInt(url.port || '80'),
        path: url.pathname + url.search,
        method: 'GET',
        timeout: 3000,
      };

      const req = http.request(options, res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          try {
            // Find AVTransport service control URL
            const avTransportMatch = body.match(
              /<serviceType>[^<]*AVTransport[^<]*<\/serviceType>[\s\S]*?<controlURL>([^<]+)<\/controlURL>/i
            );
            if (!avTransportMatch) { resolve(null); return; }

            let controlPath = avTransportMatch[1].trim();
            if (!controlPath.startsWith('/')) controlPath = '/' + controlPath;
            resolve(controlPath);
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

const AV_TRANSPORT = 'urn:schemas-upnp-org:service:AVTransport:1';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { deviceLocation, streamUrl: rawStreamUrl, mediaId, title } = req.body as {
    deviceLocation?: string;
    streamUrl?: string;
    mediaId?: string;
    title?: string;
  };

  if (!deviceLocation) {
    res.status(400).json({ error: 'deviceLocation is required' });
    return;
  }

  // Resolve stream URL — accept either a pre-built URL or a mediaId
  let streamUrl = rawStreamUrl;
  if (!streamUrl && mediaId) {
    const port = process.env.PORT ?? '3000';
    streamUrl = resolveStreamUrl(mediaId, port) ?? undefined;
    if (!streamUrl) {
      res.status(404).json({ error: `Media item '${mediaId}' not found in library` });
      return;
    }
  }

  if (!streamUrl) {
    res.status(400).json({ error: 'Either streamUrl or mediaId is required' });
    return;
  }

  try {
    // Step 1: get AVTransport control URL
    const controlPath = await getAVTransportControlUrl(deviceLocation);
    if (!controlPath) {
      res.status(422).json({
        error: 'Device does not support AVTransport',
        hint: 'This device may not be a DLNA MediaRenderer. Try copying the stream URL and opening it manually in VLC.',
      });
      return;
    }

    const baseUrl = new URL(deviceLocation);
    const deviceBase = `${baseUrl.protocol}//${baseUrl.hostname}:${baseUrl.port || 80}`;

    // Step 2: SetAVTransportURI
    const setUriBody = `
      <InstanceID>0</InstanceID>
      <CurrentURI>${streamUrl.replace(/&/g, '&amp;')}</CurrentURI>
      <CurrentURIMetaData>&lt;DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"&gt;
        &lt;item id="1" parentID="0" restricted="1"&gt;
          &lt;dc:title&gt;${(title ?? 'HomeStream').replace(/[<>&]/g, '')}&lt;/dc:title&gt;
          &lt;upnp:class&gt;object.item.videoItem&lt;/upnp:class&gt;
          &lt;res protocolInfo="http-get:*:video/mp4:*"&gt;${streamUrl.replace(/&/g, '&amp;')}&lt;/res&gt;
        &lt;/item&gt;
      &lt;/DIDL-Lite&gt;</CurrentURIMetaData>
    `;

    const setResult = await sendSOAP(deviceBase, controlPath, AV_TRANSPORT, 'SetAVTransportURI', setUriBody);
    if (!setResult.ok) {
      res.status(502).json({ error: 'Failed to set stream URL on device', detail: setResult.error });
      return;
    }

    // Step 3: Play
    const playBody = `<InstanceID>0</InstanceID><Speed>1</Speed>`;
    const playResult = await sendSOAP(deviceBase, controlPath, AV_TRANSPORT, 'Play', playBody);
    if (!playResult.ok) {
      res.status(502).json({ error: 'Failed to start playback on device', detail: playResult.error });
      return;
    }

    res.json({ ok: true, message: `Now casting to device` });

    // Start server-side DLNA position polling so position is preserved even
    // when the CastTab is closed and reopened.
    if (mediaId) startTracking(deviceLocation, mediaId);
  } catch (err) {
    res.status(500).json({ error: 'Cast failed', message: String(err) });
  }
}
