/**
 * dlnaPositionTracker — server-side DLNA position polling.
 *
 * Problem: the CastTab polls GET /api/cast/position every 5 s to keep the
 * seek bar live for DLNA casts.  When the user closes the CastTab the
 * polling stops and position is lost — reopening the tab shows 0:00.
 *
 * Solution: when a DLNA cast starts (POST /api/cast/send), the server begins
 * its own independent polling loop.  The latest position is stored in memory
 * and served via GET /api/cast/position/server so any client can read it
 * without hammering the TV.
 *
 * API:
 *   startTracking(deviceLocation, mediaId)  — called by POST /api/cast/send
 *   stopTracking()                           — called by POST /api/cast/stop
 *   getPosition()                            — returns latest DlnaPosition or null
 */

import http from 'http';
import { URL } from 'url';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DlnaPosition {
  mediaId: string;
  deviceLocation: string;
  currentTime: number;
  duration: number;
  updatedAt: number; // Date.now()
}

// ── State ─────────────────────────────────────────────────────────────────────

let currentPosition: DlnaPosition | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Cache the AVTransport control path per device so we don't re-fetch the
 *  device description XML on every poll tick. */
const controlPathCache = new Map<string, string>();

// ── SOAP helpers ──────────────────────────────────────────────────────────────

const AV_TRANSPORT = 'urn:schemas-upnp-org:service:AVTransport:1';

function soapEnvelope(action: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="${AV_TRANSPORT}">
      ${body}
    </u:${action}>
  </s:Body>
</s:Envelope>`;
}

function getAVTransportControlUrl(location: string): Promise<string | null> {
  const cached = controlPathCache.get(location);
  if (cached) return Promise.resolve(cached);

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
            /<serviceType>[^<]*AVTransport[^<]*<\/serviceType>[\s\S]*?<controlURL>([^<]+)<\/controlURL>/i,
          );
          if (!m) { resolve(null); return; }
          let p = m[1].trim();
          if (!p.startsWith('/')) p = '/' + p;
          controlPathCache.set(location, p);
          resolve(p);
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    } catch { resolve(null); }
  });
}

function parseRelTime(relTime: string): number {
  if (!relTime || relTime === 'NOT_IMPLEMENTED') return 0;
  const parts = relTime.split(':').map(Number);
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  return 0;
}

async function pollOnce(deviceLocation: string, mediaId: string): Promise<void> {
  try {
    const controlPath = await getAVTransportControlUrl(deviceLocation);
    if (!controlPath) return;

    const url = new URL(deviceLocation);
    const deviceBase = `${url.protocol}//${url.hostname}:${url.port || 80}`;
    const soap = soapEnvelope('GetPositionInfo', '<InstanceID>0</InstanceID>');

    await new Promise<void>(resolve => {
      const options = {
        hostname: url.hostname,
        port: parseInt(url.port || '80'),
        path: controlPath,
        method: 'POST',
        timeout: 5000,
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'Content-Length': Buffer.byteLength(soap),
          'SOAPAction': `"${AV_TRANSPORT}#GetPositionInfo"`,
        },
      };
      const req = http.request(options, res => {
        let data = '';
        res.on('data', (c: string) => { data += c; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode < 300) {
            const relTimeMatch  = data.match(/<RelTime>([^<]+)<\/RelTime>/i);
            const durationMatch = data.match(/<TrackDuration>([^<]+)<\/TrackDuration>/i);
            currentPosition = {
              mediaId,
              deviceLocation,
              currentTime: parseRelTime(relTimeMatch?.[1] ?? ''),
              duration:    parseRelTime(durationMatch?.[1] ?? ''),
              updatedAt:   Date.now(),
            };
          }
          resolve();
        });
      });
      req.on('error', () => resolve());
      req.on('timeout', () => { req.destroy(); resolve(); });
      req.write(soap);
      req.end();
    });

    void deviceBase; // suppress unused-variable lint warning
  } catch { /* non-fatal — device may be temporarily unreachable */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Begin server-side position polling for a DLNA cast session.
 * Call this immediately after a successful SetAVTransportURI + Play sequence.
 */
export function startTracking(deviceLocation: string, mediaId: string): void {
  stopTracking(); // clear any previous session first
  currentPosition = {
    mediaId,
    deviceLocation,
    currentTime: 0,
    duration: 0,
    updatedAt: Date.now(),
  };
  // Poll immediately, then every 5 s
  void pollOnce(deviceLocation, mediaId);
  pollTimer = setInterval(() => { void pollOnce(deviceLocation, mediaId); }, 5000);
  console.log(`[dlnaTracker] Started tracking device for media ${mediaId}`);
}

/**
 * Stop server-side position polling.
 * Call this when the cast session ends (POST /api/cast/stop).
 */
export function stopTracking(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  currentPosition = null;
  controlPathCache.clear();
}

/**
 * Return the most recent DLNA position, or null if nothing is casting.
 */
export function getPosition(): DlnaPosition | null {
  return currentPosition;
}
