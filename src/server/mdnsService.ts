/**
 * mDNS Service — homestream.local
 *
 * Advertises HomeStream on the local network via mDNS/Bonjour so users
 * can access it at http://homestream.local:3000 instead of typing an IP.
 *
 * Also advertises as a Jellyfin-compatible service so TV apps that
 * discover Jellyfin servers via mDNS find HomeStream automatically.
 *
 * Usage: call startMDNS(port) from the server startup.
 */

import Bonjour from 'bonjour-service';

let bonjour: InstanceType<typeof Bonjour> | null = null;

export function startMDNS(port: number = 3000): void {
  try {
    bonjour = new Bonjour();

    // Advertise as a generic HTTP service at homestream.local
    bonjour.publish({
      name: 'HomeStream',
      type: 'http',
      port,
      txt: {
        path: '/',
        version: '1.0.0',
        description: 'HomeStream Media Server',
      },
    });

    // Also advertise as Jellyfin-compatible so TV apps find it
    bonjour.publish({
      name: 'HomeStream',
      type: 'jellyfin',
      port,
      txt: {
        path: '/api/jellyfin',
        version: '10.8.0',
        deviceId: 'homestream-server-001',
      },
    });

    console.log(`[mdns] Advertising HomeStream at homestream.local:${port}`);
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
