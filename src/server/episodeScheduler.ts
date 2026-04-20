/**
 * episodeScheduler — background job that auto-downloads new episodes.
 *
 * How it works:
 *   1. On startup, scheduleAllSubscriptions() is called from configure.js.
 *   2. For each enabled subscription, a timer is set to fire at nextCheckAt.
 *   3. When a timer fires, checkSubscription() runs:
 *        a. Fetches streams from Torrentio for each season, starting from
 *           the episode AFTER lastFoundEpisode.
 *        b. Any new episodes found are queued via the same download pipeline
 *           as manual downloads (qBit → WebTorrent fallback, VPN wrap,
 *           security scan).
 *        c. lastFoundEpisode and nextCheckAt are updated in the store.
 *        d. The timer is rescheduled for the next interval.
 *   4. checkNow(imdbId) can be called from the API to trigger an immediate
 *      check outside the normal schedule.
 *
 * Timer management:
 *   - One NodeJS timer per subscription, stored in _timers map.
 *   - Timers are cleared and re-created whenever a subscription is updated.
 *   - All timers are cleared on process exit (graceful shutdown).
 */

import {
  getAllSubscriptions,
  getSubscription,
  updateAfterCheck,
  getDueSubscriptions,
  SCHEDULE_MS,
  type ShowSubscription,
} from './subscriptionStore.js';

// ── Timer registry ────────────────────────────────────────────────────────────

const _timers = new Map<string, ReturnType<typeof setTimeout>>();

// ── Torrentio fetch (same logic as stremio/stream/POST.ts) ────────────────────

interface TorrentioStream {
  name?: string;
  title?: string;
  infoHash?: string;
  sources?: string[];
}

interface StreamResult {
  infoHash: string;
  magnet: string;
  quality: string;
  name: string;
}

function buildMagnet(infoHash: string, sources?: string[]): string {
  const trackers = (sources ?? [])
    .filter(s => s.startsWith('tracker:'))
    .map(s => `&tr=${encodeURIComponent(s.replace('tracker:', ''))}`)
    .join('');
  return `magnet:?xt=urn:btih:${infoHash}${trackers}`;
}

async function fetchStreamsForEpisode(
  imdbId: string,
  season: number,
  episode: number,
): Promise<StreamResult[]> {
  const streamId = `${imdbId}:${season}:${episode}`;
  const url = `https://torrentio.strem.fun/stream/series/${streamId}.json`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HomeStream/1.0' },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json() as { streams?: TorrentioStream[] };
    return (data.streams ?? [])
      .filter(s => s.infoHash)
      .slice(0, 10)
      .map(s => ({
        infoHash: s.infoHash!,
        magnet: buildMagnet(s.infoHash!, s.sources),
        quality: (s.name ?? 'Unknown').split('\n')[0],
        name: s.name ?? 'Stream',
      }));
  } catch {
    clearTimeout(t);
    return [];
  }
}

function pickBestStream(streams: StreamResult[]): StreamResult | null {
  if (streams.length === 0) return null;
  const prefer = ['2160p', '4K', '1080p', '720p'];
  for (const q of prefer) {
    const match = streams.find(s => s.quality.includes(q));
    if (match) return match;
  }
  return streams[0];
}

// ── Core check logic ──────────────────────────────────────────────────────────

async function checkSubscription(sub: ShowSubscription): Promise<void> {
  console.log(`[scheduler] Checking "${sub.title}" (${sub.imdbId})`);

  // Determine where to start looking — one episode past what we already have
  const startSeason = sub.lastFoundEpisode?.season ?? 1;
  const startEpisode = sub.lastFoundEpisode
    ? sub.lastFoundEpisode.episode + 1
    : 1;

  const MAX_EPS = 50;
  let lastFound = sub.lastFoundEpisode;
  let newEpisodesQueued = 0;

  // Dynamically import the download pipeline (avoids circular deps at module load)
  const { default: vpnService } = await import('./vpnService.js');
  const { runPreDownloadScan } = await import('./security/threatScanner.js');
  const { readConfig } = await import('./configStore.js');
  const cfg = readConfig();
  const useQbit = !!cfg.qbittorrentUrl;

  let vpnConnected = false;

  try {
    for (let s = startSeason; s <= sub.totalSeasons; s++) {
      const epStart = s === startSeason ? startEpisode : 1;

      for (let ep = epStart; ep <= MAX_EPS; ep++) {
        const streams = await fetchStreamsForEpisode(sub.imdbId, s, ep);

        // No streams = season ended, move to next season
        if (streams.length === 0) {
          console.log(`[scheduler] "${sub.title}" S${s} ends at E${ep - 1}`);
          break;
        }

        const best = pickBestStream(streams);
        if (!best) continue;

        const epTitle = `${sub.title} S${String(s).padStart(2, '0')}E${String(ep).padStart(2, '0')}`;

        // Security scan before queuing
        const scan = await runPreDownloadScan({ infoHash: best.infoHash, title: epTitle });
        if (!scan.allowed) {
          console.warn(`[scheduler] Blocked ${epTitle}: ${scan.reason}`);
          continue;
        }

        // Connect VPN before first download (lazy — only if we actually have something to download)
        if (!vpnConnected && cfg.vpnEnabled) {
          try {
            await vpnService.connect();
            vpnConnected = true;
          } catch (err) {
            console.warn('[scheduler] VPN connect failed (non-fatal):', err);
          }
        }

        if (useQbit) {
          const { queueViaQbit } = await import('./qbittorrentClient.js');
          await queueViaQbit({
            infoHash: best.infoHash,
            magnet: best.magnet,
            quality: best.quality,
            title: epTitle,
            type: 'series',
            season: s,
            episode: ep,
            imdbId: sub.imdbId,
            poster: sub.poster,
          });
        } else {
          const { queueDownload } = await import('./torrentManager.js');
          queueDownload({
            infoHash: best.infoHash,
            magnet: best.magnet,
            quality: best.quality,
            title: epTitle,
            type: 'series',
            season: s,
            episode: ep,
            imdbId: sub.imdbId,
            poster: sub.poster,
          });
        }

        lastFound = { season: s, episode: ep };
        newEpisodesQueued++;
        console.log(`[scheduler] Queued ${epTitle}`);
      }
    }
  } finally {
    if (vpnConnected && cfg.vpnEnabled) {
      try { await vpnService.disconnect(); } catch { /* non-fatal */ }
    }
  }

  // Persist check result
  updateAfterCheck(sub.imdbId, lastFound ?? undefined);

  if (newEpisodesQueued > 0) {
    console.log(`[scheduler] "${sub.title}" — queued ${newEpisodesQueued} new episode(s)`);
  } else {
    console.log(`[scheduler] "${sub.title}" — no new episodes found`);
  }
}

// ── Timer scheduling ──────────────────────────────────────────────────────────

function scheduleOne(sub: ShowSubscription): void {
  // Clear any existing timer for this subscription
  const existing = _timers.get(sub.imdbId);
  if (existing) clearTimeout(existing);

  if (!sub.enabled) return;

  // Calculate delay until next check
  const nextMs = sub.nextCheckAt
    ? Math.max(0, new Date(sub.nextCheckAt).getTime() - Date.now())
    : SCHEDULE_MS[sub.schedule];

  const timer = setTimeout(async () => {
    _timers.delete(sub.imdbId);
    const fresh = getSubscription(sub.imdbId);
    if (!fresh || !fresh.enabled) return;

    try {
      await checkSubscription(fresh);
    } catch (err) {
      console.error(`[scheduler] Check failed for "${sub.title}":`, err);
    }

    // Reschedule for next interval
    const updated = getSubscription(sub.imdbId);
    if (updated?.enabled) scheduleOne(updated);
  }, nextMs);

  _timers.set(sub.imdbId, timer);

  const nextDate = new Date(Date.now() + nextMs);
  console.log(`[scheduler] "${sub.title}" next check at ${nextDate.toLocaleString()}`);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Called on server boot — schedules timers for all existing subscriptions */
export function scheduleAllSubscriptions(): void {
  const subs = getAllSubscriptions();
  if (subs.length === 0) return;
  console.log(`[scheduler] Scheduling ${subs.length} subscription(s)`);

  // Also immediately check any that were due while the server was offline
  const due = getDueSubscriptions();
  for (const sub of due) {
    checkSubscription(sub).catch(err =>
      console.error(`[scheduler] Catch-up check failed for "${sub.title}":`, err)
    );
  }

  for (const sub of subs) {
    scheduleOne(sub);
  }
}

/** Re-schedule a single subscription (call after upsert/update) */
export function rescheduleSubscription(imdbId: string): void {
  const sub = getSubscription(imdbId);
  if (sub) scheduleOne(sub);
}

/** Cancel a subscription's timer (call after delete) */
export function cancelSubscription(imdbId: string): void {
  const t = _timers.get(imdbId);
  if (t) { clearTimeout(t); _timers.delete(imdbId); }
}

/** Trigger an immediate check outside the normal schedule */
export async function checkNow(imdbId: string): Promise<{ queued: number; message: string }> {
  const sub = getSubscription(imdbId);
  if (!sub) return { queued: 0, message: 'Subscription not found' };

  try {
    await checkSubscription(sub);
    // Reschedule from now
    const updated = getSubscription(imdbId);
    if (updated?.enabled) scheduleOne(updated);
    return { queued: 0, message: 'Check complete — see Downloads for new episodes' };
  } catch (err) {
    return { queued: 0, message: `Check failed: ${String(err)}` };
  }
}

// Graceful shutdown
process.on('exit', () => {
  _timers.forEach(t => clearTimeout(t));
  _timers.clear();
});
