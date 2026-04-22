/**
 * episodeScheduler — background job that auto-downloads new episodes.
 *
 * How it works:
 *   1. On startup, scheduleAllSubscriptions() is called from configure.js.
 *   2. For each enabled subscription, a timer is set to fire at nextCheckAt.
 *   3. When a timer fires, checkSubscription() runs:
 *        a. Fetches streams from Torrentio for each season, starting from
 *           the episode AFTER lastFoundEpisode.
 *        b. Any new episodes found are queued by calling the existing
 *           POST /api/stremio/download handler directly (reuses all VPN,
 *           qBit/WebTorrent, and security-scan logic — no duplication).
 *        c. lastFoundEpisode and nextCheckAt are updated in the store.
 *        d. The timer is rescheduled for the next interval.
 *   4. checkNow(imdbId) can be called from the API to trigger an immediate
 *      check outside the normal schedule.
 *
 * Queue strategy: rather than duplicating the download pipeline, we call
 * the download handler module directly (server-side function call, not HTTP).
 * This avoids the need for an internal HTTP client and keeps VPN/qBit logic
 * in one place.
 */

import {
  getAllSubscriptions,
  getSubscription,
  updateAfterCheck,
  getDueSubscriptions,
  SCHEDULE_MS,
  type ShowSubscription,
} from './subscriptionStore.js';
import { dataPath } from './dataDir.js';

// ── Timer registry ────────────────────────────────────────────────────────────

const _timers = new Map<string, ReturnType<typeof setTimeout>>();

// ── Torrentio stream fetch ────────────────────────────────────────────────────

interface StreamResult {
  infoHash: string;
  magnet: string;
  quality: string;
  name: string;
}

function buildMagnet(infoHash: string, sources?: string[]): string {
  const trackers = (sources ?? [])
    .filter((s: string) => s.startsWith('tracker:'))
    .map((s: string) => `&tr=${encodeURIComponent(s.replace('tracker:', ''))}`)
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
    const data = await res.json() as {
      streams?: Array<{ name?: string; infoHash?: string; sources?: string[] }>
    };
    return (data.streams ?? [])
      .filter(s => !!s.infoHash)
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
  // Prefer 1080p → 720p → 4K (4K last to avoid wasting storage on TV episodes)
  const prefer = ['1080p', '720p', '2160p', '4K'];
  for (const q of prefer) {
    const match = streams.find(s => s.quality.includes(q));
    if (match) return match;
  }
  return streams[0];
}

// ── Core check logic ──────────────────────────────────────────────────────────

async function checkSubscription(sub: ShowSubscription): Promise<void> {
  console.log(`[scheduler] Checking "${sub.title}" (${sub.imdbId})`);

  const startSeason = sub.lastFoundEpisode?.season ?? 1;
  const startEpisode = sub.lastFoundEpisode
    ? sub.lastFoundEpisode.episode + 1
    : 1;

  const MAX_EPS = 50;
  let lastFound = sub.lastFoundEpisode;
  let newEpisodesQueued = 0;

  // Lazily import the download handler to avoid circular deps at module load.
  // We call the handler's internal queue function directly (server-side call).
  const { connectForDownload, disconnectAfterDownload } = await import('./vpnService.js');
  const { readConfig } = await import('./configStore.js');
  const { runPreDownloadScan } = await import('./security/threatScanner.js');
  const cfg = readConfig();
  const fullCfg = cfg as unknown as Record<string, unknown>;
  const vpnCfg = fullCfg.vpn as Parameters<typeof connectForDownload>[0] | undefined;
  const useQbit = !!cfg.qbitUrl;

  let vpnConnected = false;

  // Lazy-import the qBit addMagnet or WebTorrent queueDownload
  const { addMagnet, isReachable } = await import('./qbittorrentClient.js');
  const { queueDownload } = await import('./torrentManager.js');
  const { upsertJob } = await import('./downloadJobStore.js');
  const qbitActuallyReachable = useQbit && await isReachable();

  try {
    for (let s = startSeason; s <= sub.totalSeasons; s++) {
      // Only offset the starting episode for the very first season we check.
      // All subsequent seasons always start at episode 1.
      const epStart = (s === startSeason) ? startEpisode : 1;

      for (let ep = epStart; ep <= MAX_EPS; ep++) {
        const streams = await fetchStreamsForEpisode(sub.imdbId, s, ep);

        // No streams → this season has ended, move to next
        if (streams.length === 0) {
          console.log(`[scheduler] "${sub.title}" S${s} ends at E${ep - 1}`);
          break;
        }

        const best = pickBestStream(streams);
        if (!best) continue;

        const epTitle = `${sub.title} S${String(s).padStart(2, '0')}E${String(ep).padStart(2, '0')}`;

        // Security scan
        const scan = await runPreDownloadScan({ infoHash: best.infoHash, title: epTitle });
        if (!scan.allowed) {
          console.warn(`[scheduler] Blocked ${epTitle}: ${scan.reason}`);
          continue;
        }

        // Connect VPN before first actual download (lazy)
        if (!vpnConnected && vpnCfg?.enabled) {
          const result = await connectForDownload(vpnCfg);
          if (result.ok) {
            vpnConnected = true;
          } else {
            console.warn('[scheduler] VPN connect failed (non-fatal):', result.error);
          }
        }

        const savePath = cfg.mediaDir ? `${cfg.mediaDir}/downloads` : dataPath('downloads');
        const jobId = `sched-${best.infoHash}-${Date.now()}`;

        if (qbitActuallyReachable) {
          try {
            const hash = await addMagnet(best.magnet, {
              savepath: savePath,
              category: 'homestream',
              tags: 'series',
            });
            // Use the returned hash as the job ID when qBit provides one;
            // always use best.infoHash for the infoHash field (the qBit return
            // value is the torrent hash which equals infoHash, but fall back
            // to best.infoHash if addMagnet returns empty/null).
            upsertJob({
              jobId: hash || jobId,
              infoHash: best.infoHash,
              title: epTitle,
              quality: best.quality,
              type: 'series',
              season: s,
              episode: ep,
              status: 'queued',
              addedAt: new Date().toISOString(),
              poster: sub.poster,
              imdbId: sub.imdbId,
              backend: 'qbittorrent',
            });
          } catch (err) {
            console.error(`[scheduler] qBit queue failed for ${epTitle}:`, err);
            continue;
          }
        } else {
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
    if (vpnConnected && vpnCfg) {
      try {
        await disconnectAfterDownload(vpnCfg);
      } catch { /* non-fatal */ }
    }
  }

  updateAfterCheck(sub.imdbId, lastFound ?? undefined);

  if (newEpisodesQueued > 0) {
    console.log(`[scheduler] "${sub.title}" — queued ${newEpisodesQueued} new episode(s)`);
  } else {
    console.log(`[scheduler] "${sub.title}" — no new episodes found`);
  }
}

// ── Timer scheduling ──────────────────────────────────────────────────────────

function scheduleOne(sub: ShowSubscription): void {
  const existing = _timers.get(sub.imdbId);
  if (existing) clearTimeout(existing);

  if (!sub.enabled) return;

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

    const updated = getSubscription(sub.imdbId);
    if (updated?.enabled) scheduleOne(updated);
  }, nextMs);

  // .unref() so this timer never prevents a clean process exit
  timer.unref();
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

  // Immediately check any that were due while the server was offline,
  // then reschedule them for their next interval once the check completes.
  const due = getDueSubscriptions();
  const dueIds = new Set(due.map(s => s.imdbId));

  for (const sub of due) {
    checkSubscription(sub)
      .catch(err =>
        console.error(`[scheduler] Catch-up check failed for "${sub.title}":`, err)
      )
      .finally(() => {
        // Reschedule after catch-up so the sub isn't orphaned.
        const updated = getSubscription(sub.imdbId);
        if (updated?.enabled) scheduleOne(updated);
      });
  }

  // Schedule all non-due subs normally. Due subs are handled above and will
  // be rescheduled via .finally() — skip them here to avoid a double-fire.
  for (const sub of subs) {
    if (!dueIds.has(sub.imdbId)) scheduleOne(sub);
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
export async function checkNow(imdbId: string): Promise<{ message: string }> {
  const sub = getSubscription(imdbId);
  if (!sub) return { message: 'Subscription not found' };

  try {
    await checkSubscription(sub);
    const updated = getSubscription(imdbId);
    if (updated?.enabled) scheduleOne(updated);
    return { message: 'Check complete — see Downloads for new episodes' };
  } catch (err) {
    return { message: `Check failed: ${String(err)}` };
  }
}

// Exported so server shutdown can cancel all timers explicitly if needed.
export function cancelAllSubscriptions(): void {
  _timers.forEach(t => clearTimeout(t));
  _timers.clear();
}
