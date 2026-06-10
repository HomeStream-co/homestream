/**
 * vpnKillSwitch.ts
 *
 * Monitors the configured VPN network interface every 10 seconds.
 * If the interface disappears (VPN disconnected), all active qBittorrent
 * downloads are paused immediately so no traffic leaks over the real IP.
 * When the interface comes back, downloads are resumed automatically.
 *
 * Only runs when vpnKillSwitch === true and vpnInterface is set in config.
 */
import os from 'os';
import { readConfig } from './configStore.js';

const POLL_INTERVAL_MS = 10_000;

let timer: ReturnType<typeof setInterval> | null = null;
let wasUp = true; // assume up on first start to avoid false pause on boot

function isInterfaceUp(name: string): boolean {
  const raw = os.networkInterfaces();
  const addrs = raw[name];
  return !!(addrs && addrs.some(a => a.family === 'IPv4'));
}

async function qbitPauseAll(qbitUrl: string, apiKey: string, username: string, password: string): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      const loginRes = await fetch(`${qbitUrl}/api/v2/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password }).toString(),
        signal: AbortSignal.timeout(4000),
      });
      if (!loginRes.ok) return;
      headers['Cookie'] = loginRes.headers.get('set-cookie') ?? '';
    }

    await fetch(`${qbitUrl}/api/v2/torrents/pause`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({ hashes: 'all' }).toString(),
      signal: AbortSignal.timeout(4000),
    });
    console.log('[vpn-killswitch] VPN down — paused all torrents');
  } catch (err) {
    console.warn('[vpn-killswitch] Could not pause torrents:', (err as Error).message);
  }
}

async function qbitResumeAll(qbitUrl: string, apiKey: string, username: string, password: string): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      const loginRes = await fetch(`${qbitUrl}/api/v2/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password }).toString(),
        signal: AbortSignal.timeout(4000),
      });
      if (!loginRes.ok) return;
      headers['Cookie'] = loginRes.headers.get('set-cookie') ?? '';
    }

    await fetch(`${qbitUrl}/api/v2/torrents/resume`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({ hashes: 'all' }).toString(),
      signal: AbortSignal.timeout(4000),
    });
    console.log('[vpn-killswitch] VPN restored — resumed all torrents');
  } catch (err) {
    console.warn('[vpn-killswitch] Could not resume torrents:', (err as Error).message);
  }
}

async function poll(): Promise<void> {
  const cfg = readConfig();
  if (!cfg.vpnKillSwitch || !cfg.vpnInterface) return;

  const up = isInterfaceUp(cfg.vpnInterface);

  if (wasUp && !up) {
    // VPN just dropped — pause everything
    wasUp = false;
    if (cfg.qbitUrl && (cfg.qbitApiKey || cfg.qbitUsername)) {
      await qbitPauseAll(cfg.qbitUrl, cfg.qbitApiKey ?? '', cfg.qbitUsername, cfg.qbitPassword ?? '');
    }
  } else if (!wasUp && up) {
    // VPN came back — resume
    wasUp = true;
    if (cfg.qbitUrl && (cfg.qbitApiKey || cfg.qbitUsername)) {
      await qbitResumeAll(cfg.qbitUrl, cfg.qbitApiKey ?? '', cfg.qbitUsername, cfg.qbitPassword ?? '');
    }
  }
}

export function startVpnKillSwitch(): void {
  if (timer) return; // already running
  const cfg = readConfig();
  if (!cfg.vpnKillSwitch || !cfg.vpnInterface) return;

  console.log(`[vpn-killswitch] Monitoring interface "${cfg.vpnInterface}" every ${POLL_INTERVAL_MS / 1000}s`);
  wasUp = isInterfaceUp(cfg.vpnInterface); // seed initial state
  // .unref() so this timer never prevents a clean process exit (SIGTERM/SIGINT)
  timer = setInterval(() => { poll().catch(() => {}); }, POLL_INTERVAL_MS).unref();
}

export function stopVpnKillSwitch(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
