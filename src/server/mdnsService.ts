/**
 * mDNS Service — hs.local
 *
 * Advertises HomeStream on the local network via mDNS/Bonjour so users
 * can access it at http://hs.local:3000 instead of typing an IP address.
 *
 * Also advertises as a Jellyfin-compatible service so TV apps that
 * discover Jellyfin servers via mDNS find HomeStream automatically.
 *
 * Usage: call startMDNS(port) from the server startup.
 */

import Bonjour from 'bonjour-service';

// Version baked in at build time — no runtime package.json read needed.
declare const __APP_VERSION__: string;
const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : '0.0.0';

/** The mDNS hostname advertised on the LAN (without .local suffix). */
export const MDNS_HOSTNAME = 'hs';

/** Full .local address family members type in the browser. */
export const MDNS_LOCAL = `${MDNS_HOSTNAME}.local`;

let bonjour: InstanceType<typeof Bonjour> | null = null;

export function startMDNS(port: number = 3000): void {
  try {
    bonjour = new Bonjour();

    // Advertise as a generic HTTP service — resolves as hs.local on the LAN
    bonjour.publish({
      name: MDNS_HOSTNAME,
      type: 'http',
      port,
      txt: {
        path: '/',
        version: APP_VERSION,
        description: 'HomeStream Media Server',
      },
    });

    // Also advertise as Jellyfin-compatible so TV apps find it automatically
    bonjour.publish({
      name: MDNS_HOSTNAME,
      type: 'jellyfin',
      port,
      txt: {
        path: '/api/jellyfin',
        version: '10.8.0',
        deviceId: 'homestream-server-001',
      },
    });

    console.log(`[mdns] Advertising HomeStream at http://${MDNS_LOCAL}:${port}`);
  } catch (err) {
    // mDNS is a nice-to-have — don't crash if it fails
    console.warn('[mdns] Failed to start (non-fatal):', String(err));
  }
}

export function stopMDNS(): void {
  if (bonjour) {
    try { bonjour.unpublishAll(); bonjour.destroy(); } catch { /* ignore */ }
    bonjour = null;
  }
}
