/**
 * DownloadTab — search & queue downloads from the phone remote.
 * Extracted from remote.tsx for maintainability.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, X, Film, Download, Loader2, CheckCircle2, Clock,
  Pause as PauseIcon, Play as PlayIcon, Trash2,
} from 'lucide-react';
import { useDownloadSocket } from '@/hooks/useDownloadSocket';
import { remoteAuthHeaders } from './types';

function haptic(pattern: number | number[] = 30) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

interface DownloadJob {
  hash?: string;
  jobId?: string;
  title: string;
  poster?: string;
  progress: number;
  dlspeed?: number;
  eta?: number;
  status: 'queued' | 'downloading' | 'done' | 'paused' | 'error' | 'seeding' | 'stalled';
  quality?: string;
  type?: 'movie' | 'series';
  backend?: 'qbittorrent' | 'webtorrent';
}

interface TMDBSearchResult {
  id: number;
  title?: string;
  name?: string;
  media_type: 'movie' | 'tv';
  poster_path?: string;
  release_date?: string;
  first_air_date?: string;
  imdb_id?: string;
  overview?: string;
}

function fmtSpeed(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} KB/s`;
  return `${bps} B/s`;
}

function fmtEta(secs: number): string {
  if (secs <= 0 || secs > 86400 * 7) return '∞';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function statusColor(s: DownloadJob['status']): string {
  if (s === 'done' || s === 'seeding') return 'text-green-400';
  if (s === 'error') return 'text-red-400';
  if (s === 'paused') return 'text-yellow-400';
  if (s === 'stalled') return 'text-orange-400';
  return 'text-primary';
}

function statusLabel(s: DownloadJob['status']): string {
  if (s === 'done') return 'Done';
  if (s === 'seeding') return 'Seeding';
  if (s === 'error') return 'Error';
  if (s === 'paused') return 'Paused';
  if (s === 'stalled') return 'Stalled';
  if (s === 'queued') return 'Queued';
  return 'Downloading';
}

export default function DownloadTab() {
  // Use WebSocket push instead of polling
  const socketState = useDownloadSocket();
  const jobs: DownloadJob[] = [
    ...(socketState.qbitTorrents ?? []),
    ...(socketState.jobs ?? []).filter(j => !socketState.qbitTorrents?.some(q => q.hash === (j as DownloadJob).jobId)),
  ] as DownloadJob[];
  const loadingJobs = socketState.qbitTorrents === undefined && socketState.jobs === undefined;
  const qbitOnline = socketState.qbitOnline ?? false;
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TMDBSearchResult[]>([]);
  const [queueing, setQueueing] = useState<number | null>(null);
  const [queueMsg, setQueueMsg] = useState<{ id: number; ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const r = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&page=1`);
      if (!r.ok) throw new Error('search failed');
      const data = await r.json() as { results?: TMDBSearchResult[] };
      setResults((data.results ?? []).filter(x => x.media_type === 'movie' || x.media_type === 'tv').slice(0, 12));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 500);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const queueDownload = useCallback(async (item: TMDBSearchResult) => {
    haptic([30, 20, 30]);
    setQueueing(item.id);
    setQueueMsg(null);
    try {
      const type = item.media_type === 'tv' ? 'series' : 'movie';
      const title = item.title ?? item.name ?? 'Unknown';
      const poster = item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : undefined;
      const detailUrl = `/api/tmdb/${type === 'movie' ? 'movie' : 'tv'}/${item.id}`;
      const detailRes = await fetch(detailUrl);
      let imdbId = item.imdb_id ?? '';
      if (detailRes.ok) {
        const detail = await detailRes.json() as { imdb_id?: string; external_ids?: { imdb_id?: string } };
        imdbId = detail.imdb_id ?? detail.external_ids?.imdb_id ?? imdbId;
      }
      if (!imdbId) {
        setQueueMsg({ id: item.id, ok: false, text: 'No IMDb ID found — try searching on the Discover page instead' });
        return;
      }
      const r = await fetch('/api/stremio/download', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...remoteAuthHeaders() },
        body: JSON.stringify({ imdbId, type, title, poster }),
      });
      const data = await r.json() as { queued?: number; error?: string; message?: string };
      if (!r.ok) throw new Error(data.message ?? data.error ?? 'Queue failed');
      setQueueMsg({ id: item.id, ok: true, text: `Queued ${data.queued ?? 1} file${(data.queued ?? 1) !== 1 ? 's' : ''}` });
      setQuery('');
      setResults([]);
    } catch (err) {
      setQueueMsg({ id: item.id, ok: false, text: String(err) });
    } finally {
      setQueueing(null);
    }
  }, []);

  const pauseJob = useCallback(async (hash: string) => {
    haptic(20);
    await fetch('/api/stremio/downloads/pause', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...remoteAuthHeaders() }, body: JSON.stringify({ hash }) });
  }, []);

  const resumeJob = useCallback(async (hash: string) => {
    haptic(20);
    await fetch('/api/stremio/downloads/resume', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...remoteAuthHeaders() }, body: JSON.stringify({ hash }) });
  }, []);

  const deleteJob = useCallback(async (hash: string) => {
    haptic([30, 20, 60]);
    await fetch(`/api/stremio/downloads/${encodeURIComponent(hash)}`, { method: 'DELETE', credentials: 'include', headers: remoteAuthHeaders() });
  }, []);

  const activeJobs = jobs.filter(j => j.status !== 'done' && j.status !== 'seeding');
  const doneJobs = jobs.filter(j => j.status === 'done' || j.status === 'seeding');

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Search to queue */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="search"
              placeholder="Search to download…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {searching && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />}
        </div>

        <AnimatePresence>
          {results.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-2">
              {results.map(item => {
                const title = item.title ?? item.name ?? '';
                const year = (item.release_date ?? item.first_air_date ?? '').slice(0, 4);
                const poster = item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : null;
                const isQueuing = queueing === item.id;
                const msg = queueMsg?.id === item.id ? queueMsg : null;
                return (
                  <motion.div key={item.id} layout className="flex items-center gap-3 bg-card border border-border rounded-xl p-2.5">
                    {poster ? (
                      <img src={poster} alt="" className="w-9 h-12 object-cover rounded-lg flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-12 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                        <Film className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{title}</p>
                      <p className="text-[10px] text-muted-foreground">{year} · {item.media_type === 'tv' ? 'TV Show' : 'Movie'}</p>
                      {msg && <p className={`text-[10px] mt-0.5 font-medium ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>}
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      onClick={() => queueDownload(item)}
                      disabled={isQueuing || !!msg?.ok}
                      className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${msg?.ok ? 'bg-green-500/20 text-green-400' : 'bg-primary/15 text-primary active:bg-primary/30'}`}
                    >
                      {isQueuing ? <Loader2 className="w-4 h-4 animate-spin" /> : msg?.ok ? <CheckCircle2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                    </motion.button>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
        {query && !searching && results.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">No results for "{query}"</p>
        )}
      </div>

      {/* Active downloads */}
      {loadingJobs ? (
        <div className="flex items-center justify-center gap-2 py-6">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading downloads…</p>
        </div>
      ) : jobs.length === 0 ? (
        !query && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Download className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No active downloads</p>
            <p className="text-xs text-muted-foreground/60">Search above to queue something</p>
            {!qbitOnline && <p className="text-[10px] text-yellow-400 mt-1">qBittorrent offline — using built-in downloader</p>}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {activeJobs.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Downloading · {activeJobs.length}</p>
              {activeJobs.map(job => {
                const hash = job.hash ?? job.jobId ?? '';
                return (
                  <div key={hash} className="bg-card border border-border rounded-2xl p-3 flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      {job.poster ? (
                        <img src={job.poster} alt="" className="w-8 h-11 object-cover rounded-lg flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-11 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                          <Film className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{job.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-medium ${statusColor(job.status)}`}>{statusLabel(job.status)}</span>
                          {job.dlspeed != null && job.dlspeed > 0 && <span className="text-[10px] text-muted-foreground">{fmtSpeed(job.dlspeed)}</span>}
                          {job.eta != null && job.eta > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />{fmtEta(job.eta)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        {job.status === 'paused' ? (
                          <button onClick={() => resumeJob(hash)} className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                            <PlayIcon className="w-3.5 h-3.5 fill-primary" />
                          </button>
                        ) : job.status === 'downloading' ? (
                          <button onClick={() => pauseJob(hash)} className="w-7 h-7 rounded-lg bg-muted text-muted-foreground flex items-center justify-center">
                            <PauseIcon className="w-3.5 h-3.5 fill-muted-foreground" />
                          </button>
                        ) : null}
                        <button onClick={() => deleteJob(hash)} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${job.status === 'error' ? 'bg-red-500' : job.status === 'paused' ? 'bg-yellow-400' : 'bg-primary'}`}
                          style={{ width: `${job.progress}%` }}
                          animate={{ width: `${job.progress}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono w-8 text-right flex-shrink-0">{job.progress}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {doneJobs.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Completed · {doneJobs.length}</p>
              {doneJobs.map(job => {
                const hash = job.hash ?? job.jobId ?? '';
                return (
                  <div key={hash} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-2">
                    {job.poster ? (
                      <img src={job.poster} alt="" className="w-8 h-11 object-cover rounded-lg flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-11 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                        <Film className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{job.title}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3 text-green-400" />
                        <span className="text-[10px] text-green-400 font-medium">{job.status === 'seeding' ? 'Seeding' : 'Complete'}</span>
                      </div>
                    </div>
                    <button onClick={() => deleteJob(hash)} className="w-7 h-7 rounded-lg bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
