/**
 * GET /api/cast/position?deviceLocation=<url>
 *
 * Polls a DLNA/UPnP AVTransport renderer for its current playback position
 * using the GetPositionInfo SOAP action.
 *
 * Returns:
 *   { ok: true, currentTime: number, duration: number }   — seconds
 *   { ok: false, error: string }                          — device unreachable
 *
 * Called by the phone remote's CastPanel every 5 s to keep the seek bar live
 * for DLNA casts (Samsung/LG TVs).  Chromecast position comes from the Cast
 * SDK via WebSocket, so this endpoint is DLNA-only.
 *
 * Note: Not all DLNA renderers implement GetPositionInfo — the handler returns
 * ok:false with a descriptive error rather than crashing so the UI degrades
 * gracefully (seek bar stays static rather than throwing).
 */

import type { Request, Response } from 'express';
import http from 'http';
import { URL } from 'url';
import { requireAuth } from '../../../authMiddleware.js';

const AV_TRANSPORT = 'urn:schemas-upnp-org:service:AVTransport:1';

// ── SOAP helpers ──────────────────────────────────────────────────────────────

function soapEnvelope(action: string, service: string, body: string): string {
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

/** Fetch the AVTransport controlURL from the device description XML. */
function getAVTransportControlUrl(location: string): Promise<string | null> {
  return new Promise(resolve => {
    try {
      const url = new URL(location);
      const req = http.request({
        hostname: url.hostname,
        port: parseInt(url.port || '80'),
        path: url.pathname + url.search,
        method: 'GET',
        timeout: 3000,
      }, res => {
        let body = '';
        res.on('data', (c: string) => { body += c; });
        res.on('end', () => {
          const m = body.match(
            /<serviceType>[^<]*AVTransport[^<]*<\/serviceType>[\s\S]*?<controlURL>([^<]+)<\/controlURL>/i
          );
          if (!m) { resolve(null); return; }
          let p = m[1].trim();
          if (!p.startsWith('/')) p = '/' + p;
          resolve(p);
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

/** Send a SOAP request and return the raw response body. */
function sendSOAP(
  deviceBase: string,
  controlPath: string,
  service: string,
  action: string,
  body: string,
): Promise<{ ok: boolean; body?: string; error?: string }> {
  return new Promise(resolve => {
    try {
      const url = new URL(deviceBase);
      const soap = soapEnvelope(action, service, body);
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
        res.on('data', (c: string) => { data += c; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode < 300) {
            resolve({ ok: true, body: data });
          } else {
            resolve({ ok: false, error: `HTTP ${res.statusCode}: ${data.slice(0, 200)}` });
          }
        });
      });
      req.on('error', (err: Error) => resolve({ ok: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
      req.write(soap);
      req.end();
    } catch (err) {
      resolve({ ok: false, error: String(err) });
    }
  });
}

/** Parse HH:MM:SS or MM:SS into seconds. Returns 0 on parse failure. */
function parseRelTime(relTime: string): number {
  if (!relTime || relTime === 'NOT_IMPLEMENTED') return 0;
  const parts = relTime.split(':').map(Number);
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  return 0;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { deviceLocation } = req.query as { deviceLocation?: string };

  if (!deviceLocation) {
    res.status(400).json({ ok: false, error: 'deviceLocation query param is required' });
    return;
  }

  try {
    const controlPath = await getAVTransportControlUrl(deviceLocation);
    if (!controlPath) {
      res.json({ ok: false, error: 'Device unreachable or AVTransport not found' });
      return;
    }

    const baseUrl = new URL(deviceLocation);
    const deviceBase = `${baseUrl.protocol}//${baseUrl.hostname}:${baseUrl.port || 80}`;

    const result = await sendSOAP(
      deviceBase,
      controlPath,
      AV_TRANSPORT,
      'GetPositionInfo',
      '<InstanceID>0</InstanceID>',
    );

    if (!result.ok || !result.body) {
      res.json({ ok: false, error: result.error ?? 'Empty response from device' });
      return;
    }

    // Parse RelTime (current position) and TrackDuration from SOAP response XML
    const relTimeMatch    = result.body.match(/<RelTime>([^<]+)<\/RelTime>/i);
    const durationMatch   = result.body.match(/<TrackDuration>([^<]+)<\/TrackDuration>/i);

    const currentTime = parseRelTime(relTimeMatch?.[1] ?? '');
    const duration    = parseRelTime(durationMatch?.[1] ?? '');

    res.json({ ok: true, currentTime, duration });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
}
