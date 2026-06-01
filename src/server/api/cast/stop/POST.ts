/**
 * POST /api/cast/stop
 *
 * Sends a UPnP AVTransport Stop command to a DLNA device.
 * Body: { deviceLocation: string }
 */

import type { Request, Response } from 'express';
import http from 'http';
import { URL } from 'url';
import { requireAuth } from '../../../authMiddleware.js';
import { stopTracking } from '../../../dlnaPositionTracker.js';

const AV_TRANSPORT = 'urn:schemas-upnp-org:service:AVTransport:1';

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
          resolve(res.statusCode && res.statusCode < 300 ? { ok: true } : { ok: false, error: data.slice(0, 200) });
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
          const m = body.match(/<serviceType>[^<]*AVTransport[^<]*<\/serviceType>[\s\S]*?<controlURL>([^<]+)<\/controlURL>/i);
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
      resolve(null); // non-fatal — ignore
    }
  });
}

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { deviceLocation } = req.body as { deviceLocation?: string };
  if (!deviceLocation) {
    res.status(400).json({ error: 'deviceLocation is required' });
    return;
  }

  try {
    const controlPath = await getAVTransportControlUrl(deviceLocation);
    if (!controlPath) {
      // Device may have gone offline — treat as success so UI clears
      res.json({ ok: true, message: 'Device unreachable — cast cleared' });
      return;
    }

    const baseUrl = new URL(deviceLocation);
    const deviceBase = `${baseUrl.protocol}//${baseUrl.hostname}:${baseUrl.port || 80}`;

    await sendSOAP(deviceBase, controlPath, AV_TRANSPORT, 'Stop', '<InstanceID>0</InstanceID>');

    stopTracking(); // stop server-side DLNA position polling
    res.json({ ok: true });
  } catch (err) {
    // Non-fatal — if stop fails the TV will eventually time out
    res.json({ ok: true, warning: String(err) });
  }
}
