import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Search, ChevronRight, Loader2,
  Tv2, Film, AlertCircle, ExternalLink, Star,
  LogIn, LogOut, CheckCircle2, Download, HardDrive,
  Wifi, Clock, ChevronDown, ChevronUp, RefreshCw, CalendarClock,
} from 'lucide-react';
import { toast } from 'sonner';
import ScheduleModal from './ScheduleModal.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StremioMeta {
  id: string;
  name: string;
  year?: number;
  poster?: string;
  description?: string;
  imdbRating?: string;
  genres?: string[];
  type: 'movie' | 'series';
  totalSeasons?: number;
}

interface StreamResult {
  name: string;
  quality: string;
  size: string;
  seeds: string;
  magnet: string;
  infoHash: string;
}

interface StremioAccount {
  email: string;
  avatar?: string;
}

type TorrentJobStatus = 'queued' | 'downloading' | 'transcoding' | 'done' | 'error';

interface TorrentJob {
  jobId: string;
  title: string;
  quality: string;
  type: 'movie' | 'series';
  season?: number;
  episode?: number;
  status: TorrentJobStatus;
  progress: number;
  downloadSpeed: number;
  peers: number;
  eta: number;
  error?: string;
  addedAt: string;
  completedAt?: string;
  poster?: string;
}

// ─── Stremio SVG Logo ────────────────────────────────────────────────────────

function StremioLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="50" fill="#8A5FFF" />
      <path d="M30 38 L50 28 L70 38 L70 62 L50 72 L30 62 Z" fill="white" opacity="0.15" />
      <polygon points="42,35 68,50 42,65" fill="white" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSpeed(bps: number): string {
  if (bps > 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`;
  if (bps > 1_000) return `${(bps / 1_000).toFixed(0)} KB/s`;
  return `${bps} B/s`;
}

function formatEta(secs: number): string {
  if (!secs || secs === Infinity) return '—';
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  return `${(secs / 3600).toFixed(1)}h`;
}

function qualityColor(q: string): string {
  const ql = q.toLowerCase();
  if (ql.includes('4k') || ql.includes('2160')) return 'text-yellow-400';
  if (ql.includes('1080')) return 'text-green-400';
  if (ql.includes('720')) return 'text-blue-400';
  return 'text-muted-foreground';
}

function statusColor(s: TorrentJobStatus): string {
  if (s === 'done') return 'text-green-400';
  if (s === 'error') return 'text-destructive';
  if (s === 'transcoding') return 'text-yellow-400';
  if (s === 'downloading') return 'text-blue-400';
  return 'text-muted-foreground';
}

function statusLabel(s: TorrentJobStatus): string {
  if (s === 'queued') return 'Queued';
  if (s === 'downloading') return 'Downloading';
  if (s === 'transcoding') return 'Transcoding';
  if (s === 'done') return 'Done';
  if (s === 'error') return 'Error';
  return s;
}

// ─── Main Component ───────────────────────────────────────────────────────────

type View = 'login' | 'search' | 'streams' | 'downloads';

export default function StremioPanel() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('search');

  // Auth
  const [account, setAccount] = useState<StremioAccount | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Search
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'series'>('all');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<StremioMeta[]>([]);
  const [searchError, setSearchError] = useState('');

  // Streams view
  const [selected, setSelected] = useState<StremioMeta | null>(null);
  const [streams, setStreams] = useState<StreamResult[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [streamsError, setStreamsError] = useState('');
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Series season picker for bulk download
  const [bulkSeason, setBulkSeason] = useState<number | 'all'>(1);
  const [totalEpisodes, setTotalEpisodes] = useState(10);
  const [showBulkOptions, setShowBulkOptions] = useState(false);

  // Schedule modal
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleStream, setScheduleStream] = useState<StreamResult | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);

  // Downloads tab
  const [jobs, setJobs] = useState<TorrentJob[]>([]);
  const [jobsLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active download count badge
  const activeCount = jobs.filter(j => j.status === 'queued' || j.status === 'downloading' || j.status === 'transcoding').length;

  // ── Persist login ──
  useEffect(() => {
    let saved = null;
    try {
      saved = localStorage.getItem('stremio_account');
    } catch { /* ignore */ }
    if (saved) {
      try { setAccount(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  // ── Auto-focus search ──
  useEffect(() => {
    if (open && account && view === 'search') {
      setTimeout(() => searchRef.current?.focus(), 150);
    }
  }, [open, account, view]);

  // ── Escape key ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view === 'streams') { setView('search'); setSelected(null); setStreams([]); }
        else setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view]);

  // ── Poll downloads ──
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/stremio/downloads', { credentials: 'include' });
      const data = await res.json() as { jobs?: TorrentJob[] };
      if (data.jobs) setJobs(data.jobs);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open) {
      fetchJobs();
      pollRef.current = setInterval(fetchJobs, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, fetchJobs]);

  // ── Login ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      // Proxy through our backend to avoid CORS / mixed-content blocks
      const res = await fetch('/api/stremio/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json() as { result?: { user?: { email: string; avatar?: string } }; error?: string | { message?: string } };
      if (data.result?.user) {
        const acc: StremioAccount = { email: data.result.user.email, avatar: data.result.user.avatar };
        setAccount(acc);
        try {
          localStorage.setItem('stremio_account', JSON.stringify(acc));
        } catch { /* ignore */ }
        setLoginEmail('');
        setLoginPassword('');
        setView('search');
        toast.success(`Signed in as ${acc.email}`);
      } else {
        // Normalise error — server may forward Stremio's object shape or a plain string
        const raw = data.error;
        const msg = typeof raw === 'object' && raw !== null
          ? (raw.message ?? 'Invalid email or password')
          : (raw ?? 'Invalid email or password');
        setLoginError(msg);
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Could not reach HomeStream server — is it running?');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setAccount(null);
    try { localStorage.removeItem('stremio_account'); } catch { /* non-fatal — ignore in restricted environments */ }
    setResults([]);
    setSelected(null);
    setQuery('');
    setView('login');
    toast.success('Signed out of Stremio');
  };

  // ── Search ──
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    setSearchError('');
    try {
      const res = await fetch('/api/stremio/search', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, type: typeFilter === 'all' ? undefined : typeFilter }),
      });
      const data = await res.json() as { results?: StremioMeta[]; error?: string };
      if (data.results) setResults(data.results);
      else setSearchError(data.error ?? 'Search failed');
    } catch {
      setSearchError('Search failed — check your connection');
    } finally {
      setSearching(false);
    }
  }, [typeFilter]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  };

  useEffect(() => {
    if (query.trim()) doSearch(query);
  }, [typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch streams for a title ──
  const fetchStreams = async (meta: StremioMeta, s?: number, ep?: number) => {
    setSelected(meta);
    setView('streams');
    setStreams([]);
    setStreamsLoading(true);
    setStreamsError('');
    setShowBulkOptions(false);
    try {
      const res = await fetch('/api/stremio/stream', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imdbId: meta.id, type: meta.type, season: s ?? season, episode: ep ?? episode }),
      });
      const data = await res.json() as { streams?: StreamResult[]; error?: string };
      if (data.streams) setStreams(data.streams);
      else setStreamsError(data.error ?? 'No streams found');
    } catch {
      setStreamsError('Could not fetch streams');
    } finally {
      setStreamsLoading(false);
    }
  };

  // ── Queue server-side download ──
  const handleDownload = async (meta: StremioMeta, opts?: {
    allEpisodes?: boolean;
    season?: number;
    totalEpisodes?: number;
    streams?: StreamResult[];
  }) => {
    const key = meta.id + (opts?.season ?? '');
    setDownloadingId(key);
    try {
      const body: Record<string, unknown> = {
        imdbId: meta.id,
        type: meta.type,
        title: meta.name,
        poster: meta.poster,
        year: meta.year?.toString(),
        streams: opts?.streams,
      };

      if (meta.type === 'series' && opts?.allEpisodes) {
        body.season = opts.season !== undefined ? opts.season : undefined;
        body.totalSeasons = meta.totalSeasons ?? 1;
        body.totalEpisodes = opts.totalEpisodes ?? 10;
      }

      const res = await fetch('/api/stremio/download', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { queued?: number; jobs?: TorrentJob[]; error?: string; message?: string };

      if (data.error) {
        // Show the detailed message when available (e.g. qBit offline / WebTorrent unavailable)
        toast.error(data.message ?? data.error);
      } else {
        const count = data.queued ?? 1;
        if (meta.type === 'series' && opts?.allEpisodes) {
          toast.success(`Queued ${count} episode${count !== 1 ? 's' : ''} of "${meta.name}" for download`);
        } else {
          toast.success(`"${meta.name}" queued for download — check the Downloads tab`);
        }
        await fetchJobs();
        setView('downloads');
      }
    } catch {
      toast.error('Failed to queue download');
    } finally {
      setDownloadingId(null);
    }
  };

  const currentView = !account ? 'login' : view;

  // ── Schedule a download for a future time ──
  const handleScheduleConfirm = async (isoTimestamp: string) => {
    if (!selected || !scheduleStream) return;
    setSchedulingId(scheduleStream.infoHash);
    try {
      const res = await fetch('/api/stremio/schedule', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imdbId: selected.id,
          type: selected.type,
          title: selected.name,
          poster: selected.poster,
          year: selected.year?.toString(),
          streams: [scheduleStream],
          scheduledFor: isoTimestamp,
          ...(selected.type === 'series' ? { season, episode } : {}),
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        toast.success(`"${selected.name}" scheduled — will download automatically`);
        setScheduleModalOpen(false);
        setScheduleStream(null);
      } else {
        toast.error(data.error ?? 'Failed to schedule download');
      }
    } catch {
      toast.error('Failed to schedule download');
    } finally {
      setSchedulingId(null);
    }
  };

  return (
    <>
      {/* ── Schedule Modal ── */}
      <ScheduleModal
        open={scheduleModalOpen}
        onClose={() => { setScheduleModalOpen(false); setScheduleStream(null); }}
        onSchedule={handleScheduleConfirm}
        title={selected?.name ?? ''}
        loading={!!schedulingId}
      />

      {/* ── Header Button ── */}
      <button
        onClick={() => setOpen(true)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/10 transition-colors"
        title="Stremio — Search & download"
      >
        <StremioLogo className="w-6 h-6" />
        {account && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 border border-background" />
        )}
        {activeCount > 0 && (
          <span className="absolute -bottom-0.5 -right-0.5 min-w-[14px] h-3.5 bg-[#8A5FFF] text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
            {activeCount}
          </span>
        )}
      </button>

      {/* ── Panel ── */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
              onClick={() => { setOpen(false); }}
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-[61] flex flex-col shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* ── Panel Header ── */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <StremioLogo className="w-7 h-7" />
                  <div>
                    <p className="text-sm font-semibold text-foreground leading-none">Stremio</p>
                    {account
                      ? <p className="text-[10px] text-green-400 mt-0.5">{account.email}</p>
                      : <p className="text-[10px] text-muted-foreground mt-0.5">Not signed in</p>
                    }
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {account && (
                    <>
                      {/* Tab: Search */}
                      <button
                        onClick={() => setView('search')}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${view === 'search' || view === 'streams' ? 'bg-[#8A5FFF] text-white' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Search
                      </button>
                      {/* Tab: Downloads */}
                      <button
                        onClick={() => setView('downloads')}
                        className={`relative px-2.5 py-1 rounded text-xs font-medium transition-colors ${view === 'downloads' ? 'bg-[#8A5FFF] text-white' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Downloads
                        {activeCount > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 bg-primary text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                            {activeCount}
                          </span>
                        )}
                      </button>
                      <button onClick={handleLogout} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors ml-1" title="Sign out">
                        <LogOut className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button onClick={() => setOpen(false)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* ── Body ── */}
              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">

                  {/* ── LOGIN ── */}
                  {currentView === 'login' && (
                    <motion.div key="login" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-6 flex flex-col gap-5">
                      <div className="text-center">
                        <StremioLogo className="w-16 h-16 mx-auto mb-3" />
                        <h2 className="text-xl font-heading text-foreground">Sign in to Stremio</h2>
                        <p className="text-sm text-muted-foreground mt-1">Optional — search and streams work without an account</p>
                      </div>
                      <form onSubmit={handleLogin} className="flex flex-col gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                          <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="you@example.com"
                            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Password</label>
                          <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="••••••••"
                            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                        </div>
                        {loginError && (
                          <div className="flex flex-col gap-1 bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-destructive text-xs font-medium">
                              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{String(loginError)}
                            </div>
                            {String(loginError).includes('reach') && (
                              <p className="text-[10px] text-muted-foreground pl-5">
                                Stremio login requires your HomeStream server to have internet access. You can still search and download without signing in.
                              </p>
                            )}
                          </div>
                        )}
                        <button type="submit" disabled={loginLoading || !loginEmail || !loginPassword}
                          className="flex items-center justify-center gap-2 bg-[#8A5FFF] hover:bg-[#7a4fff] text-white py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50">
                          {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                          {loginLoading ? 'Signing in…' : 'Sign In'}
                        </button>
                      </form>

                      {/* Skip login — account not required for public Torrentio streams */}
                      <div className="relative flex items-center gap-3">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">or</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                      <button
                        onClick={() => {
                          const guest: StremioAccount = { email: 'guest' };
                          setAccount(guest);
                          try { localStorage.setItem('stremio_account', JSON.stringify(guest)); } catch { /* non-fatal */ }
                          setView('search');
                        }}
                        className="flex items-center justify-center gap-2 border border-border hover:border-primary/40 text-foreground py-2.5 rounded-lg font-medium text-sm transition-colors"
                      >
                        <Search className="w-4 h-4" />
                        Continue without account
                      </button>

                      <div className="flex items-center justify-between">
                        <a href="https://www.stremio.com/register" target="_blank" rel="noopener noreferrer"
                          className="text-xs text-[#8A5FFF] hover:underline flex items-center gap-1">
                          Create account <ExternalLink className="w-3 h-3" />
                        </a>
                        <a href="https://www.stremio.com/forgot-password" target="_blank" rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                          Forgot password <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground leading-relaxed">
                        <strong className="text-foreground">How it works:</strong> Search any movie or show, click Download — the server fetches the torrent, transcodes it, and adds it to your library automatically. No torrent client needed.
                      </div>
                    </motion.div>
                  )}

                  {/* ── SEARCH ── */}
                  {currentView === 'search' && (
                    <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col">
                      <div className="px-4 pt-4 pb-3 border-b border-border">
                        <div className="relative mb-3">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input ref={searchRef} type="text" value={query} onChange={e => handleQueryChange(e.target.value)}
                            placeholder="Search movies & shows…"
                            className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                          {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />}
                        </div>
                        <div className="flex gap-1.5">
                          {(['all', 'movie', 'series'] as const).map(t => (
                            <button key={t} onClick={() => setTypeFilter(t)}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${typeFilter === t ? 'bg-[#8A5FFF] text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                              {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'TV Shows'}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="px-4 py-3">
                        {searchError && (
                          <div className="flex items-center gap-2 text-destructive text-sm py-4">
                            <AlertCircle className="w-4 h-4" />{searchError}
                          </div>
                        )}
                        {!query.trim() && !searching && (
                          <div className="text-center py-12 text-muted-foreground">
                            <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">Search for any movie or TV show</p>
                            <p className="text-xs mt-1 opacity-60">Auto-downloads to your server at ≥720p</p>
                          </div>
                        )}
                        {results.length > 0 && (
                          <div className="flex flex-col gap-2">
                            {results.map(item => (
                              <motion.button key={item.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                                onClick={() => fetchStreams(item)}
                                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/60 transition-colors text-left w-full group">
                                <div className="w-10 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                                  {item.poster
                                    ? <img src={item.poster} alt={item.name} className="w-full h-full object-cover" />
                                    : <div className="w-full h-full flex items-center justify-center">
                                        {item.type === 'series' ? <Tv2 className="w-4 h-4 text-muted-foreground" /> : <Film className="w-4 h-4 text-muted-foreground" />}
                                      </div>
                                  }
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className="text-[10px] text-muted-foreground">{item.year}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${item.type === 'series' ? 'bg-blue-500/20 text-blue-400' : 'bg-primary/20 text-primary'}`}>
                                      {item.type === 'series' ? 'TV' : 'Movie'}
                                    </span>
                                    {item.imdbRating && (
                                      <span className="text-[10px] text-yellow-400 flex items-center gap-0.5">
                                        <Star className="w-2.5 h-2.5 fill-yellow-400" />{item.imdbRating}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                              </motion.button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* ── STREAMS ── */}
                  {currentView === 'streams' && selected && (
                    <motion.div key="streams" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex flex-col">
                      {/* Back */}
                      <div className="px-4 pt-4 pb-3 border-b border-border">
                        <button onClick={() => { setView('search'); setSelected(null); setStreams([]); }}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
                          <ChevronRight className="w-3.5 h-3.5 rotate-180" />Back to results
                        </button>
                        <div className="flex items-start gap-3">
                          {selected.poster && <img src={selected.poster} alt={selected.name} className="w-12 h-16 object-cover rounded-lg flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-semibold text-foreground leading-tight">{selected.name}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{selected.year}</p>
                            {selected.description && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{selected.description}</p>}
                          </div>
                        </div>

                        {/* Episode picker for single-episode stream lookup */}
                        {selected.type === 'series' && (
                          <div className="flex items-center gap-3 mt-3">
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs text-muted-foreground">S</label>
                              <input type="number" min={1} value={season} onChange={e => setSeason(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-12 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary text-center" />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs text-muted-foreground">E</label>
                              <input type="number" min={1} value={episode} onChange={e => setEpisode(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-12 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary text-center" />
                            </div>
                            <button onClick={() => fetchStreams(selected, season, episode)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs rounded font-medium transition-colors">
                              <Search className="w-3 h-3" />Find
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="px-4 py-3">
                        {streamsLoading && (
                          <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
                            <Loader2 className="w-8 h-8 animate-spin text-[#8A5FFF]" />
                            <p className="text-sm">Finding streams…</p>
                          </div>
                        )}
                        {streamsError && !streamsLoading && (
                          <div className="flex flex-col items-center gap-2 py-10 text-center">
                            <AlertCircle className="w-8 h-8 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">{streamsError}</p>
                          </div>
                        )}

                        {!streamsLoading && streams.length > 0 && (
                          <div className="flex flex-col gap-3">

                            {/* ── SERIES: Bulk download section ── */}
                            {selected.type === 'series' && (
                              <div className="bg-[#8A5FFF]/10 border border-[#8A5FFF]/30 rounded-xl p-3">
                                <button
                                  onClick={() => setShowBulkOptions(v => !v)}
                                  className="flex items-center justify-between w-full text-left"
                                >
                                  <div className="flex items-center gap-2">
                                    <HardDrive className="w-4 h-4 text-[#8A5FFF]" />
                                    <span className="text-sm font-semibold text-foreground">Download All Episodes</span>
                                  </div>
                                  {showBulkOptions ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                </button>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Auto-picks best quality ≥720p per episode, downloads to server
                                </p>

                                <AnimatePresence>
                                  {showBulkOptions && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                      <div className="flex items-center gap-3 mt-3 flex-wrap">
                                        <div className="flex items-center gap-1.5">
                                          <label className="text-xs text-muted-foreground">Season</label>
                                          <select
                                            value={bulkSeason}
                                            onChange={e => setBulkSeason(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                                            className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                                          >
                                            <option value="all">All seasons</option>
                                            {Array.from({ length: selected.totalSeasons ?? 5 }, (_, i) => i + 1).map(s => (
                                              <option key={s} value={s}>Season {s}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <label className="text-xs text-muted-foreground">Episodes/season</label>
                                          <input type="number" min={1} max={50} value={totalEpisodes}
                                            onChange={e => setTotalEpisodes(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
                                            className="w-14 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary text-center" />
                                        </div>
                                      </div>
                                      <button
                                        disabled={downloadingId === selected.id + 'bulk'}
                                        onClick={() => handleDownload(selected, {
                                          allEpisodes: true,
                                          season: bulkSeason === 'all' ? undefined : bulkSeason,
                                          totalEpisodes,
                                        })}
                                        className="mt-3 w-full flex items-center justify-center gap-2 bg-[#8A5FFF] hover:bg-[#7a4fff] text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                                      >
                                        {downloadingId === selected.id + 'bulk'
                                          ? <><Loader2 className="w-4 h-4 animate-spin" />Queuing episodes…</>
                                          : <><Download className="w-4 h-4" />Download {bulkSeason === 'all' ? 'All Seasons' : `Season ${bulkSeason}`}</>
                                        }
                                      </button>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}

                            {/* ── Stream list ── */}
                            <p className="text-xs text-muted-foreground">
                              {streams.length} stream{streams.length !== 1 ? 's' : ''} — server downloads directly, no torrent client needed
                            </p>
                            {streams.map((stream, i) => (
                              <motion.div key={stream.infoHash + i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                                className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border hover:border-[#8A5FFF]/40 transition-colors">
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-semibold ${qualityColor(stream.quality)}`}>{stream.quality}</p>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {stream.size && <span className="text-[10px] text-muted-foreground">{stream.size}</span>}
                                    {stream.seeds && (
                                      <span className="text-[10px] text-green-400 flex items-center gap-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />{stream.seeds} seeds
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  disabled={!!downloadingId}
                                  onClick={() => handleDownload(selected, { streams: [stream] })}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8A5FFF] hover:bg-[#7a4fff] text-white text-xs rounded-lg font-medium transition-colors disabled:opacity-60 flex-shrink-0"
                                >
                                  {downloadingId === selected.id
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Download className="w-3.5 h-3.5" />
                                  }
                                  Download
                                </button>
                                <button
                                  disabled={!!downloadingId || !!schedulingId}
                                  onClick={() => { setScheduleStream(stream); setScheduleModalOpen(true); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/70 border border-border text-muted-foreground hover:text-foreground text-xs rounded-lg font-medium transition-colors disabled:opacity-60 flex-shrink-0"
                                  title="Schedule for later"
                                >
                                  <CalendarClock className="w-3.5 h-3.5" />
                                </button>
                              </motion.div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* ── DOWNLOADS ── */}
                  {currentView === 'downloads' && (
                    <motion.div key="downloads" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col">
                      <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b border-border">
                        <p className="text-sm font-semibold text-foreground">Download Queue</p>
                        <button onClick={fetchJobs} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Refresh">
                          <RefreshCw className={`w-4 h-4 ${jobsLoading ? 'animate-spin' : ''}`} />
                        </button>
                      </div>

                      <div className="px-4 py-3">
                        {jobs.length === 0 && (
                          <div className="text-center py-12 text-muted-foreground">
                            <HardDrive className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No downloads yet</p>
                            <p className="text-xs mt-1 opacity-60">Search for a title and click Download</p>
                          </div>
                        )}

                        <div className="flex flex-col gap-2">
                          {jobs.map(job => (
                            <motion.div key={job.jobId} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                              className="p-3 rounded-xl bg-background border border-border">
                              <div className="flex items-start gap-2.5">
                                {job.poster
                                  ? <img src={job.poster} alt={job.title} className="w-8 h-11 object-cover rounded flex-shrink-0" />
                                  : <div className="w-8 h-11 bg-muted rounded flex-shrink-0 flex items-center justify-center">
                                      {job.type === 'series' ? <Tv2 className="w-3.5 h-3.5 text-muted-foreground" /> : <Film className="w-3.5 h-3.5 text-muted-foreground" />}
                                    </div>
                                }
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-foreground leading-tight truncate">{job.title}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-[10px] font-semibold ${statusColor(job.status)}`}>{statusLabel(job.status)}</span>
                                    <span className={`text-[10px] ${qualityColor(job.quality)}`}>{job.quality}</span>
                                  </div>

                                  {/* Progress bar */}
                                  {(job.status === 'downloading' || job.status === 'transcoding') && (
                                    <div className="mt-1.5">
                                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                                        <motion.div
                                          className={`h-full rounded-full ${job.status === 'transcoding' ? 'bg-yellow-400' : 'bg-[#8A5FFF]'}`}
                                          style={{ width: `${job.progress}%` }}
                                          transition={{ duration: 0.5 }}
                                        />
                                      </div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[9px] text-muted-foreground">{job.progress}%</span>
                                        {job.status === 'downloading' && (
                                          <>
                                            {job.downloadSpeed > 0 && (
                                              <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                                                <Wifi className="w-2.5 h-2.5" />{formatSpeed(job.downloadSpeed)}
                                              </span>
                                            )}
                                            {job.eta > 0 && (
                                              <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                                                <Clock className="w-2.5 h-2.5" />{formatEta(job.eta)}
                                              </span>
                                            )}
                                            {job.peers > 0 && (
                                              <span className="text-[9px] text-muted-foreground">{job.peers} peers</span>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {job.status === 'done' && (
                                    <p className="text-[10px] text-green-400 flex items-center gap-1 mt-1">
                                      <CheckCircle2 className="w-3 h-3" />Added to library
                                    </p>
                                  )}
                                  {job.status === 'error' && (
                                    <p className="text-[10px] text-destructive mt-1 truncate">{job.error}</p>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
