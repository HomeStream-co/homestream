/**
 * POST /api/cast/control
 *
 * Sends UPnP AVTransport control commands to a DLNA device that is already
 * playing a stream (set via POST /api/cast/send).
 *
 * Body: {
 *   deviceLocation: string,          // UPnP device description URL
 *   action: 'pause' | 'resume' | 'seek' | 'stop',
 *   position?: number,               // seconds — required for action='seek'
 * }
 *
 * Used by the phone remote's CastPanel to control DLNA playback without
 * needing to re-send the full stream URL.
 *
 * Note: Not all DLNA renderers support Seek or Pause — the handler returns
 * { ok: true, warning } rather than an error so the UI doesn't break.
 */

import type { Request, Response } from 'express';
import http from 'http';
import { URL } from 'url';
import { requireAuth } from '../../../authMiddleware.js';

const AV_TRANSPORT = 'urn:schemas-upnp-org:service:AVTransport:1';

// ── SOAP helpers (duplicated from cast/send — kept local to avoid shared state) ──

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
  deviceBase: string,
  controlPath: string,
  service: string,
  action: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise(resolve => {
    try {
      const url = new URL(deviceBase);
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
          resolve(res.statusCode && res.statusCode < 300
            ? { ok: true }
            : { ok: false, error: `HTTP ${res.statusCode}: ${data.slice(0, 200)}` });
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
        res.on('data', c => { body += c; });
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

/** Format seconds as HH:MM:SS for UPnP RelTime */
function toRelTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { deviceLocation, action, position } = req.body as {
    deviceLocation?: string;
    action?: 'pause' | 'resume' | 'seek' | 'stop';
    position?: number;
  };

  if (!deviceLocation) {
    res.status(400).json({ error: 'deviceLocation is required' });
    return;
  }
  if (!action || !['pause', 'resume', 'seek', 'stop'].includes(action)) {
    res.status(400).json({ error: 'action must be one of: pause, resume, seek, stop' });
    return;
  }
  if (action === 'seek' && typeof position !== 'number') {
    res.status(400).json({ error: 'position (seconds) is required for seek' });
    return;
  }

  try {
    const controlPath = await getAVTransportControlUrl(deviceLocation);
    if (!controlPath) {
      // Device may have gone offline — return gracefully so UI doesn't break
      res.json({ ok: true, warning: 'Device unreachable — command skipped' });
      return;
    }

    const baseUrl = new URL(deviceLocation);
    const deviceBase = `${baseUrl.protocol}//${baseUrl.hostname}:${baseUrl.port || 80}`;

    let result: { ok: boolean; error?: string };

    switch (action) {
      case 'pause':
        result = await sendSOAP(deviceBase, controlPath, AV_TRANSPORT, 'Pause',
          '<InstanceID>0</InstanceID>');
        break;

      case 'resume':
        result = await sendSOAP(deviceBase, controlPath, AV_TRANSPORT, 'Play',
          '<InstanceID>0</InstanceID><Speed>1</Speed>');
        break;

      case 'seek':
        // UPnP Seek uses RelTime (HH:MM:SS) for absolute position
        result = await sendSOAP(deviceBase, controlPath, AV_TRANSPORT, 'Seek',
          `<InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>${toRelTime(position!)}</Target>`);
        break;

      case 'stop':
        result = await sendSOAP(deviceBase, controlPath, AV_TRANSPORT, 'Stop',
          '<InstanceID>0</InstanceID>');
        break;

      default:
        res.status(400).json({ error: 'Unknown action' });
        return;
    }

    if (!result.ok) {
      // Many TVs don't support Pause/Seek — treat as non-fatal warning
      res.json({ ok: true, warning: result.error });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Cast control failed', message: String(err) });
  }
}
