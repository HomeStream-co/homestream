/**
 * Jellyfin UDP Server Discovery
 *
 * Broadcasts HomeStream's presence on the local network so Jellyfin-compatible
 * TV apps (Infuse, Jellyfin for Roku/Fire TV, etc.) can find the server
 * automatically without the user needing to type an IP address.
 *
 * Protocol:
 *  - Listens on UDP port 7359 (Jellyfin discovery port)
 *  - When a client sends "Who is JellyfinServer?" to the broadcast address,
 *    we respond with our server info in Jellyfin format
 *
 * Usage: call startJellyfinDiscovery(port) from the main server entry point.
 */

import dgram from 'dgram';
import os from 'os';

const DISCOVERY_PORT = 7359;
const SERVER_ID = 'homestream-server-001';
const SERVER_NAME = 'HomeStream';

/** Get the primary LAN IP address of this machine */
function getLanIp(): string {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return '127.0.0.1';
}

let discoverySocket: dgram.Socket | null = null;

export function startJellyfinDiscovery(httpPort: number = 3000): void {
  if (discoverySocket) return; // Already running

  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  discoverySocket = socket;

  socket.on('error', (err) => {
    // Non-fatal — discovery is a nice-to-have, not required
    console.warn('[jellyfin-discovery] UDP error (non-fatal):', err.message);
    try { socket.close(); } catch { /* ignore */ }
    discoverySocket = null;
  });

  socket.on('message', (msg, rinfo) => {
    const text = msg.toString().trim();

    // Jellyfin clients send this exact string to discover servers
    if (text === 'Who is JellyfinServer?') {
      const lanIp = getLanIp();
      const response = JSON.stringify({
        Address: `http://${lanIp}:${httpPort}/api/jellyfin`,
        Id: SERVER_ID,
        Name: SERVER_NAME,
        EndpointAddress: `${rinfo.address}:${rinfo.port}`,
      });

      const buf = Buffer.from(response);
      socket.send(buf, 0, buf.length, rinfo.port, rinfo.address, (err) => {
        if (err) console.warn('[jellyfin-discovery] Send error:', err.message);
      });

      console.log(`[jellyfin-discovery] Responded to discovery from ${rinfo.address}`);
    }
  });

  socket.bind(DISCOVERY_PORT, () => {
    try {
      socket.setBroadcast(true);
      socket.addMembership('239.255.255.250');
    } catch { /* non-fatal */ }
    console.log(`[jellyfin-discovery] Listening on UDP :${DISCOVERY_PORT}`);
  });
}

export function stopJellyfinDiscovery(): void {
  if (discoverySocket) {
    try { discoverySocket.close(); } catch { /* ignore */ }
    discoverySocket = null;
  }
}
