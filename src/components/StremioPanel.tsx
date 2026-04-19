import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Search, ChevronRight, Loader2,
  Tv2, Film, AlertCircle, ExternalLink, Magnet, Star,
  LogIn, LogOut, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StremioMeta {
  id: string;           // tt1234567
  name: string;
  year?: number;
  poster?: string;
  description?: string;
  imdbRating?: string;
  genres?: string[];
  type: 'movie' | 'series';
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

// ─── Stremio SVG Logo ────────────────────────────────────────────────────────

function StremioLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="50" fill="#8A5FFF" />
      <path
        d="M30 38 L50 28 L70 38 L70 62 L50 72 L30 62 Z"
        fill="white"
        opacity="0.15"
      />
      <polygon points="42,35 68,50 42,65" fill="white" />
    </svg>
  );
}

// ─── Stremio Panel Component ─────────────────────────────────────────────────

export default function StremioPanel() {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<StremioAccount | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'series'>('all');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<StremioMeta[]>([]);
  const [searchError, setSearchError] = useState('');

  const [selected, setSelected] = useState<StremioMeta | null>(null);
  const [streams, setStreams] = useState<StreamResult[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [streamsError, setStreamsError] = useState('');

  // Episode picker for series
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);

  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist login across sessions
  useEffect(() => {
    const saved = localStorage.getItem('stremio_account');
    if (saved) {
      try { setAccount(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  // Auto-focus search when panel opens
  useEffect(() => {
    if (open && account) {
      setTimeout(() => searchRef.current?.focus(), 150);
    }
  }, [open, account]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selected) { setSelected(null); setStreams([]); }
        else setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected]);

  // ── Login (Stremio Central API) ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('https://api.strem.io/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json() as { result?: { user?: { email: string; avatar?: string } }; error?: string };
      if (data.result?.user) {
        const acc: StremioAccount = {
          email: data.result.user.email,
          avatar: data.result.user.avatar,
        };
        setAccount(acc);
        localStorage.setItem('stremio_account', JSON.stringify(acc));
        setLoginEmail('');
        setLoginPassword('');
        toast.success(`Signed in as ${acc.email}`);
      } else {
        setLoginError(data.error ?? 'Invalid email or password');
      }
    } catch {
      setLoginError('Could not reach Stremio — check your connection');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setAccount(null);
    localStorage.removeItem('stremio_account');
    setResults([]);
    setSelected(null);
    setQuery('');
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

  // Re-search when type filter changes
  useEffect(() => {
    if (query.trim()) doSearch(query);
  }, [typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch streams for a selected title ──
  const fetchStreams = async (meta: StremioMeta, s?: number, ep?: number) => {
    setSelected(meta);
    setStreams([]);
    setStreamsLoading(true);
    setStreamsError('');
    try {
      const res = await fetch('/api/stremio/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imdbId: meta.id,
          type: meta.type,
          season: s ?? season,
          episode: ep ?? episode,
        }),
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

  // ── Open magnet link ──
  const openMagnet = (magnet: string, title: string) => {
    window.open(magnet, '_blank');
    toast.success(`Opening torrent for "${title}" in your torrent client`);
  };

  // ── Quality color ──
  const qualityColor = (q: string) => {
    const ql = q.toLowerCase();
    if (ql.includes('4k') || ql.includes('2160')) return 'text-yellow-400';
    if (ql.includes('1080')) return 'text-green-400';
    if (ql.includes('720')) return 'text-blue-400';
    return 'text-muted-foreground';
  };

  return (
    <>
      {/* ── Stremio Button in Header ── */}
      <button
        onClick={() => setOpen(true)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/10 transition-colors"
        title="Stremio — Browse & download torrents"
      >
        <StremioLogo className="w-6 h-6" />
        {account && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 border border-background" />
        )}
      </button>

      {/* ── Slide-in Panel ── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
              onClick={() => { setOpen(false); setSelected(null); setStreams([]); }}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-[61] flex flex-col shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <StremioLogo className="w-7 h-7" />
                  <div>
                    <p className="text-sm font-semibold text-foreground leading-none">Stremio</p>
                    {account ? (
                      <p className="text-[10px] text-green-400 mt-0.5">{account.email}</p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Not signed in</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {account && (
                    <button
                      onClick={handleLogout}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      title="Sign out"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => { setOpen(false); setSelected(null); setStreams([]); }}
                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">

                  {/* ── Login View ── */}
                  {!account && (
                    <motion.div
                      key="login"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-6 flex flex-col gap-5"
                    >
                      <div className="text-center">
                        <StremioLogo className="w-16 h-16 mx-auto mb-3" />
                        <h2 className="text-xl font-heading text-foreground">Sign in to Stremio</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          Search and download torrents from your Stremio library
                        </p>
                      </div>

                      <form onSubmit={handleLogin} className="flex flex-col gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                          <input
                            type="email"
                            value={loginEmail}
                            onChange={e => setLoginEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Password</label>
                          <input
                            type="password"
                            value={loginPassword}
                            onChange={e => setLoginPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                          />
                        </div>
                        {loginError && (
                          <div className="flex items-center gap-2 text-destructive text-xs">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            {loginError}
                          </div>
                        )}
                        <button
                          type="submit"
                          disabled={loginLoading}
                          className="flex items-center justify-center gap-2 bg-[#8A5FFF] hover:bg-[#7a4fff] text-white py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-60"
                        >
                          {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                          {loginLoading ? 'Signing in…' : 'Sign In'}
                        </button>
                      </form>

                      <div className="text-center">
                        <a
                          href="https://www.stremio.com/register"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#8A5FFF] hover:underline flex items-center justify-center gap-1"
                        >
                          Create a Stremio account <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground leading-relaxed">
                        <strong className="text-foreground">How it works:</strong> Search any movie or show,
                        pick a quality, and click the magnet icon to open it in your torrent client (qBittorrent,
                        Transmission, etc.). Once downloaded, upload it to HomeStream from the Library page.
                      </div>
                    </motion.div>
                  )}

                  {/* ── Search View ── */}
                  {account && !selected && (
                    <motion.div
                      key="search"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col"
                    >
                      {/* Search bar */}
                      <div className="px-4 pt-4 pb-3 border-b border-border">
                        <div className="relative mb-3">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            ref={searchRef}
                            type="text"
                            value={query}
                            onChange={e => handleQueryChange(e.target.value)}
                            placeholder="Search movies & shows…"
                            className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                          />
                          {searching && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                          )}
                        </div>
                        {/* Type filter */}
                        <div className="flex gap-1.5">
                          {(['all', 'movie', 'series'] as const).map(t => (
                            <button
                              key={t}
                              onClick={() => setTypeFilter(t)}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                                typeFilter === t
                                  ? 'bg-[#8A5FFF] text-white'
                                  : 'bg-muted text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'TV Shows'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Results */}
                      <div className="px-4 py-3">
                        {searchError && (
                          <div className="flex items-center gap-2 text-destructive text-sm py-4">
                            <AlertCircle className="w-4 h-4" /> {searchError}
                          </div>
                        )}

                        {!query.trim() && !searching && (
                          <div className="text-center py-12 text-muted-foreground">
                            <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">Search for any movie or TV show</p>
                            <p className="text-xs mt-1 opacity-60">Powered by Stremio Cinemeta + Torrentio</p>
                          </div>
                        )}

                        {results.length > 0 && (
                          <div className="flex flex-col gap-2">
                            {results.map(item => (
                              <motion.button
                                key={item.id}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                onClick={() => fetchStreams(item)}
                                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/60 transition-colors text-left w-full group"
                              >
                                {/* Poster */}
                                <div className="w-10 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                                  {item.poster ? (
                                    <img src={item.poster} alt={item.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      {item.type === 'series'
                                        ? <Tv2 className="w-4 h-4 text-muted-foreground" />
                                        : <Film className="w-4 h-4 text-muted-foreground" />
                                      }
                                    </div>
                                  )}
                                </div>
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] text-muted-foreground">{item.year}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                      item.type === 'series' ? 'bg-blue-500/20 text-blue-400' : 'bg-primary/20 text-primary'
                                    }`}>
                                      {item.type === 'series' ? 'TV' : 'Movie'}
                                    </span>
                                    {item.imdbRating && (
                                      <span className="text-[10px] text-yellow-400 flex items-center gap-0.5">
                                        <Star className="w-2.5 h-2.5 fill-yellow-400" /> {item.imdbRating}
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

                  {/* ── Streams View ── */}
                  {account && selected && (
                    <motion.div
                      key="streams"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex flex-col"
                    >
                      {/* Back + title */}
                      <div className="px-4 pt-4 pb-3 border-b border-border">
                        <button
                          onClick={() => { setSelected(null); setStreams([]); }}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
                        >
                          <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back to results
                        </button>
                        <div className="flex items-start gap-3">
                          {selected.poster && (
                            <img src={selected.poster} alt={selected.name} className="w-12 h-16 object-cover rounded-lg flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-semibold text-foreground leading-tight">{selected.name}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{selected.year}</p>
                            {selected.description && (
                              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{selected.description}</p>
                            )}
                          </div>
                        </div>

                        {/* Episode picker for series */}
                        {selected.type === 'series' && (
                          <div className="flex items-center gap-3 mt-3">
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs text-muted-foreground">Season</label>
                              <input
                                type="number"
                                min={1}
                                value={season}
                                onChange={e => setSeason(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-14 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary text-center"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs text-muted-foreground">Episode</label>
                              <input
                                type="number"
                                min={1}
                                value={episode}
                                onChange={e => setEpisode(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-14 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary text-center"
                              />
                            </div>
                            <button
                              onClick={() => fetchStreams(selected, season, episode)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-[#8A5FFF] hover:bg-[#7a4fff] text-white text-xs rounded font-medium transition-colors"
                            >
                              <Search className="w-3 h-3" /> Find
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Stream list */}
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
                            <p className="text-xs text-muted-foreground opacity-60">
                              No public torrents found for this title right now.
                            </p>
                          </div>
                        )}

                        {!streamsLoading && streams.length > 0 && (
                          <div className="flex flex-col gap-2">
                            <p className="text-xs text-muted-foreground mb-1">
                              {streams.length} stream{streams.length !== 1 ? 's' : ''} found — click to open in your torrent client
                            </p>
                            {streams.map((stream, i) => (
                              <motion.div
                                key={stream.infoHash + i}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.03 }}
                                className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border hover:border-[#8A5FFF]/50 transition-colors group"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-semibold ${qualityColor(stream.quality)}`}>
                                    {stream.quality}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {stream.size && (
                                      <span className="text-[10px] text-muted-foreground">{stream.size}</span>
                                    )}
                                    {stream.seeds && (
                                      <span className="text-[10px] text-green-400 flex items-center gap-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                                        {stream.seeds} seeds
                                      </span>
                                    )}
                                    <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[80px]">
                                      {stream.infoHash.slice(0, 8)}…
                                    </span>
                                  </div>
                                </div>
                                {/* Actions */}
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <button
                                    onClick={() => openMagnet(stream.magnet, selected.name)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8A5FFF] hover:bg-[#7a4fff] text-white text-xs rounded-lg font-medium transition-colors"
                                    title="Open magnet link in torrent client"
                                  >
                                    <Magnet className="w-3.5 h-3.5" />
                                    Download
                                  </button>
                                </div>
                              </motion.div>
                            ))}

                            {/* Tip */}
                            <div className="mt-3 p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground leading-relaxed">
                              <strong className="text-foreground flex items-center gap-1 mb-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> After downloading
                              </strong>
                              Go to <strong className="text-foreground">My Library</strong> and upload the file —
                              HomeStream will transcode it and fetch metadata automatically.
                            </div>
                          </div>
                        )}
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
