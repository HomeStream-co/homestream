/**
 * GET /api/cast/devices
 *
 * Discovers DLNA/UPnP media renderers on the local network using SSDP
 * (Simple Service Discovery Protocol). Returns a list of devices that
 * can receive a cast URL (smart TVs, Chromecast via BubbleUPnP, Kodi, etc.)
 *
 * How it works:
 *   1. Sends an SSDP M-SEARCH multicast to 239.255.255.250:1900
 *   2. Listens for responses for 3 seconds
 *   3. For each responding device, fetches its XML description to get
 *      the friendly name and device type
 *   4. Returns only MediaRenderer devices (TVs, speakers, etc.)
 *
 * This is 100% LAN-only — no cloud, no pairing, no accounts.
 */

import type { Request, Response } from 'express';
import dgram from 'dgram';
import http from 'http';
import { requireAuth } from '../../../authMiddleware.js';
import { URL } from 'url';

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const SEARCH_TIMEOUT_MS = 3000;

// ── SSDP M-SEARCH message ─────────────────────────────────────────────────────

const MSEARCH = [
  'M-SEARCH * HTTP/1.1',
  `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
  'MAN: "ssdp:discover"',
  'MX: 2',
  'ST: ssdp:all',
  '',
  '',
].join('\r\n');

// ── Fetch device XML description ──────────────────────────────────────────────

interface DeviceInfo {
  id: string;
  name: string;
  type: string;
  location: string;
  manufacturer?: string;
  modelName?: string;
  isRenderer: boolean;
}

function fetchDeviceDescription(location: string): Promise<DeviceInfo | null> {
  return new Promise(resolve => {
    try {
      const url = new URL(location);
      const options = {
        hostname: url.hostname,
        port: parseInt(url.port || '80'),
        path: url.pathname + url.search,
        method: 'GET',
        timeout: 2000,
      };

      const req = http.request(options, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const friendlyName = body.match(/<friendlyName>([^<]+)<\/friendlyName>/)?.[1] ?? 'Unknown Device';
            const deviceType = body.match(/<deviceType>([^<]+)<\/deviceType>/)?.[1] ?? '';
            const manufacturer = body.match(/<manufacturer>([^<]+)<\/manufacturer>/)?.[1];
            const modelName = body.match(/<modelName>([^<]+)<\/modelName>/)?.[1];

            const isRenderer =
              deviceType.toLowerCase().includes('mediarenderer') ||
              deviceType.toLowerCase().includes('mediaplayer');

            resolve({
              id: location,
              name: friendlyName,
              type: deviceType,
              location,
              manufacturer,
              modelName,
              isRenderer,
            });
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

// ── SSDP discovery ────────────────────────────────────────────────────────────

function discoverDevices(): Promise<DeviceInfo[]> {
  return new Promise(resolve => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const locations = new Set<string>();

    socket.on('error', () => {
      try { socket.close(); } catch { /* ignore */ }
      resolve([]);
    });

    socket.on('message', (msg) => {
      const text = msg.toString();
      const locationMatch = text.match(/LOCATION:\s*([^\r\n]+)/i);
      if (locationMatch) {
        const loc = locationMatch[1].trim();
        if (loc.startsWith('http')) locations.add(loc);
      }
    });

    socket.bind(0, () => {
      socket.setBroadcast(true);
      try {
        socket.addMembership(SSDP_ADDR);
      } catch { /* may fail on some systems — non-fatal */ }

      const msg = Buffer.from(MSEARCH);
      socket.send(msg, 0, msg.length, SSDP_PORT, SSDP_ADDR);

      setTimeout(async () => {
        try { socket.close(); } catch { /* ignore */ }

        // Fetch descriptions in parallel (cap at 20 to avoid flooding)
        const locs = Array.from(locations).slice(0, 20);
        const results = await Promise.all(locs.map(fetchDeviceDescription));
        const devices = results.filter((d): d is DeviceInfo => d !== null);
        resolve(devices);
      }, SEARCH_TIMEOUT_MS);
    });
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const devices = await discoverDevices();

    // Sort: renderers first, then alphabetically
    devices.sort((a, b) => {
      if (a.isRenderer && !b.isRenderer) return -1;
      if (!a.isRenderer && b.isRenderer) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      devices: devices.map(d => ({
        id: d.id,
        name: d.name,
        manufacturer: d.manufacturer,
        modelName: d.modelName,
        isRenderer: d.isRenderer,
        location: d.location,
      })),
      count: devices.length,
      scannedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Discovery failed', message: String(err) });
  }
}
