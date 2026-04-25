/**
 * TV Show Detail Page — /show/:id
 *
 * Full-screen detail view for a single TV series in the library.
 * Sections:
 *   - Blurred backdrop hero with poster, title, metadata, actions
 *   - Season progress overview (watched / total per season)
 *   - Full EpisodeTracker (mark episodes watched, add/remove)
 *   - AI enrichment: summary, why-watch, mood, tags, themes, content warnings
 *   - Similar shows in library + AI suggestions
 */

import { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Plus, Check, Star, Calendar, Tv2,
  ArrowLeft, Tag, Zap, AlertTriangle, Users, ChevronRight,
  BookOpen, Heart, Layers, CheckCircle2, ListVideo, Download,
  Bell, BellOff, RefreshCw,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useMedia } from '@/context/MediaContext';
import { useProfile } from '@/context/ProfileContext';
import { useTheme } from '@/context/ThemeContext';
import { toActorsString } from '@/lib/utils';
import EpisodeTracker from '@/components/EpisodeTracker';
import { Progress } from '@/components/ui/progress';
import type { MediaItem, Episode } from '@/types/media';
import TrailerButton from '@/components/TrailerButton';
import RestrictedContentGuard from '@/components/RestrictedContentGuard';
import ShowDownloadDialog from '@/components/ShowDownloadDialog';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getShowProgress(show: MediaItem) {
  const eps = show.episodes || [];
  if (eps.length === 0) return null;
  const watched = eps.filter(e => e.watched).length;
  return { watched, total: eps.length, pct: (watched / eps.length) * 100 };
}

function groupSeasons(episodes: Episode[]) {
  const map = new Map<number, Episode[]>();
  for (const ep of episodes) {
    if (!map.has(ep.season)) map.set(ep.season, []);
    map.get(ep.season)!.push(ep);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([num, eps]) => ({
      number: num,
      episodes: eps.sort((a, b) => a.episode - b.episode),
      watched: eps.filter(e => e.watched).length,
      total: eps.length,
    }));
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

function Pill({ label, color = 'default' }: { label: string; color?: 'default' | 'primary' | 'mood' | 'warning' }) {
  const cls = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/15 text-primary',
    mood: 'bg-accent/15 text-accent-foreground',
    warning: 'bg-orange-500/15 text-orange-400',
  }[color];
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-primary" />
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{label}</h3>
    </div>
  );
}

// ─── Season progress mini-card ────────────────────────────────────────────────

function SeasonCard({ number, watched, total }: { number: number; watched: number; total: number }) {
  const pct = total > 0 ? (watched / total) * 100 : 0;
  const done = watched === total && total > 0;
  return (
    <div className={`bg-card border rounded-xl p-3 min-w-[100px] ${done ? 'border-primary/40' : 'border-border'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-foreground">S{number}</span>
        {done && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
      </div>
      <Progress value={pct} className="h-1 mb-1.5" />
      <p className="text-[10px] text-muted-foreground">{watched}/{total} ep</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ShowPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { library, watchlist, addToWatchlist, removeFromWatchlist, updateMedia } = useMedia();
  const { isAllowed } = useProfile();
  const { settings } = useTheme();
  const [imgError, setImgError] = useState(false);

  const item = useMemo(() => library.find(m => m.id === id), [library, id]);

  const inWatchlist = watchlist.includes(id ?? '');

  // ── Subscription state ───────────────────────────────────────────────────
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [subSchedule, setSubSchedule] = useState<string>('weekly');
  const [subStatus, setSubStatus] = useState<'idle' | 'subscribed' | 'loading'>('idle');
  const [checkingNow, setCheckingNow] = useState(false);

  // Load existing subscription on mount
  // Use imdbId if present, fall back to id (legacy items use id as IMDB ID)
  const showImdbId = item?.imdbId ?? item?.id;

  useEffect(() => {
    if (!showImdbId) return;
    fetch('/api/subscriptions', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { subscriptions: Array<{ imdbId: string; schedule: string; enabled: boolean }> }) => {
        const existing = data.subscriptions?.find(s => s.imdbId === showImdbId);
        if (existing) {
          setSubStatus('subscribed');
          setSubSchedule(existing.schedule);
        }
      })
      .catch(() => {/* non-fatal */});
  }, [showImdbId]);

  const handleSubscribe = async () => {
    if (!item || !showImdbId) return;
    setSubStatus('loading');
    try {
      await fetch('/api/subscriptions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imdbId: showImdbId,
          title: item.title,
          poster: item.poster,
          totalSeasons: Math.max(...(item.episodes?.map(e => e.season) ?? [1])),
          schedule: subSchedule,
          enabled: true,
        }),
      });
      setSubStatus('subscribed');
      setSubDialogOpen(false);
    } catch {
      setSubStatus('idle');
      toast.error('Failed to subscribe — check your connection and try again');
    }
  };

  const handleUnsubscribe = async () => {
    if (!showImdbId) return;
    await fetch('/api/subscriptions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imdbId: showImdbId, action: 'unsubscribe' }),
    });
    setSubStatus('idle');
  };

  const handleCheckNow = async () => {
    if (!showImdbId) return;
    setCheckingNow(true);
    try {
      await fetch(`/api/subscriptions/${showImdbId}/check`, { method: 'POST', credentials: 'include' });
    } finally {
      setCheckingNow(false);
    }
  };

  // ── Download dialog state ────────────────────────────────────────────────
  const [dlDialogOpen, setDlDialogOpen] = useState(false);

  const seasons = useMemo(() => groupSeasons(item?.episodes || []), [item]);
  const overallProgress = useMemo(() => item ? getShowProgress(item) : null, [item]);

  // Find the last-watched episode to show a "Resume" button
  const resumeEpisode = useMemo(() => {
    if (!item?.episodes || item.episodes.length === 0) return null;
    // Find the first unwatched episode after the last watched one
    const sorted = [...item.episodes].sort((a, b) =>
      a.season !== b.season ? a.season - b.season : a.episode - b.episode
    );
    const lastWatchedIdx = sorted.reduce((best, ep, idx) => ep.watched ? idx : best, -1);
    if (lastWatchedIdx === -1) return sorted[0]; // nothing watched yet — start from S01E01
    const next = sorted[lastWatchedIdx + 1];
    return next ?? null; // null = all watched
  }, [item]);

  // Similar shows in library (by genre)
  const similarInLibrary = useMemo(() => {
    if (!item) return [];
    const genres = new Set((item.genre ?? []).map(g => g.toLowerCase()));
    return library
      .filter(m =>
        m.id !== item.id &&
        m.type === 'series' &&
        isAllowed(m.rated) &&
        (m.genre ?? []).some(g => genres.has(g.toLowerCase()))
      )
      .sort((a, b) => (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0))
      .slice(0, 10);
  }, [item, library, isAllowed]);

  // AI similar titles not in library
  const aiSimilar = useMemo(() => {
    if (!item?.enrichment?.similarTitles) return [];
    const inLib = new Set(library.map(m => m.title.toLowerCase()));
    return item.enrichment.similarTitles.filter(t => !inLib.has(t.toLowerCase())).slice(0, 6);
  }, [item, library]);

  const handleEpisodeUpdate = async (episodes: Episode[]) => {
    if (!item) return;
    await updateMedia(item.id, { episodes } as Partial<MediaItem>);
  };

  // ── Not found ──
  if (!item) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Tv2 className="w-16 h-16 text-muted-foreground/30" />
        <p className="text-muted-foreground text-lg">Show not found.</p>
        <button onClick={() => navigate(-1)} className="text-primary text-sm hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Go back
        </button>
      </div>
    );
  }

  const ratedColor =
    item.rated === 'G' || item.rated === 'TV-G' || item.rated === 'TV-Y' ? 'text-green-400 border-green-400/40' :
    item.rated === 'PG' || item.rated === 'TV-PG' || item.rated === 'TV-Y7' ? 'text-yellow-400 border-yellow-400/40' :
    item.rated === 'PG-13' || item.rated === 'TV-14' ? 'text-orange-400 border-orange-400/40' :
    'text-red-400 border-red-400/40';

  return (
    <>
    <RestrictedContentGuard rated={item.rated} contentTitle={item.title}>
      <title>{item.title} — HomeStream</title>
      <meta name="description" content={item.plot || `Watch ${item.title} on HomeStream.`} />

      <div className="min-h-screen bg-background">

        {/* ── Cinematic hero backdrop ── */}
        <div className="relative w-full" style={{ minHeight: '68vh' }}>
          {/* Full-bleed blurred backdrop */}
          <div className="absolute inset-0 overflow-hidden">
            {!imgError && item.poster ? (
              <img
                src={item.poster}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover scale-110 blur-3xl opacity-25"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/10 to-background" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-transparent" />
          </div>

          {/* Back button */}
          <div className="relative z-10 pt-20 px-4 sm:px-8 lg:px-16">
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm mb-8 group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              Back
            </motion.button>
          </div>

          {/* Content */}
          <div className="relative z-10 px-4 sm:px-8 lg:px-16 pb-12">
            <div className="flex flex-col md:flex-row gap-8 max-w-6xl">

              {/* Poster */}
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: 'easeOut' as const }}
                className="flex-shrink-0"
              >
                <div className="w-44 sm:w-56 rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-white/10 relative">
                  {!imgError && item.poster ? (
                    <img
                      src={item.poster}
                      alt={item.title}
                      className="w-full aspect-[2/3] object-cover"
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <div className="w-full aspect-[2/3] bg-card flex flex-col items-center justify-center gap-3 p-4">
                      <Tv2 className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-xs text-muted-foreground text-center leading-snug">{item.title}</p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none" />
                </div>

                {/* Overall progress bar under poster */}
                {overallProgress && overallProgress.total > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-primary rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${overallProgress.pct}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' as const }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 text-center">
                      {overallProgress.watched}/{overallProgress.total} episodes watched
                    </p>
                  </div>
                )}
              </motion.div>

              {/* Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.1, ease: 'easeOut' as const }}
                className="flex-1 min-w-0"
              >
                {/* Type badge */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1 h-4 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary">TV Series</span>
                  </div>
                  {item.year && <span className="text-[10px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">{item.year}</span>}
                  {item.totalSeasons && (
                    <span className="text-[10px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                      {item.totalSeasons} Season{item.totalSeasons !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-foreground leading-tight mb-4 drop-shadow-sm">
                  {item.title}
                </h1>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-2.5 mb-4 text-sm text-muted-foreground">
                  {item.imdbRating && item.imdbRating !== 'N/A' && (
                    <span className="flex items-center gap-1 text-yellow-400 font-semibold bg-yellow-400/10 px-2.5 py-1 rounded-full">
                      <Star className="w-3.5 h-3.5 fill-yellow-400" />
                      {item.imdbRating}
                      <span className="text-yellow-400/70 font-normal text-xs">/10</span>
                    </span>
                  )}
                  {item.rated && item.rated !== 'N/A' && (
                    <span className={`text-xs font-bold border rounded-lg px-2 py-0.5 ${ratedColor}`}>
                      {item.rated}
                    </span>
                  )}
                  {item.year && (
                    <span className="flex items-center gap-1 bg-muted/60 px-2.5 py-1 rounded-full">
                      <Calendar className="w-3.5 h-3.5" />
                      {item.year}
                    </span>
                  )}
                  {overallProgress && (
                    <span className="flex items-center gap-1 text-primary font-medium bg-primary/10 px-2.5 py-1 rounded-full">
                      <ListVideo className="w-3.5 h-3.5" />
                      {overallProgress.watched}/{overallProgress.total} ep
                    </span>
                  )}
                </div>

                {/* Genre pills */}
                {(item.genre ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-6">
                    {(item.genre ?? []).map(g => (
                      <Link
                        key={g}
                        to={`/?q=${encodeURIComponent(g)}`}
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted/60 text-muted-foreground hover:bg-primary/15 hover:text-primary transition-colors border border-border/50"
                      >
                        {g}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-3 mb-6">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => navigate(
                      resumeEpisode
                        ? `/player/${resumeEpisode.id}`
                        : `/player/${item.id}`
                    )}
                    className="flex items-center gap-2 px-7 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors shadow-[0_4px_20px_hsl(var(--primary)/0.35)]"
                    title={resumeEpisode
                      ? `Play S${String(resumeEpisode.season).padStart(2,'0')}E${String(resumeEpisode.episode).padStart(2,'0')}: ${resumeEpisode.title}`
                      : 'Play from beginning'
                    }
                  >
                    <Play className="w-4 h-4 fill-current" />
                    {resumeEpisode && resumeEpisode.season === 1 && resumeEpisode.episode === 1
                      ? 'Play'
                      : resumeEpisode
                        ? `Continue S${String(resumeEpisode.season).padStart(2,'0')}E${String(resumeEpisode.episode).padStart(2,'0')}`
                        : 'Play Again'
                    }
                  </motion.button>

                  <button
                    onClick={() => inWatchlist ? removeFromWatchlist(item.id) : addToWatchlist(item.id)}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl border font-semibold text-sm transition-colors ${
                      inWatchlist
                        ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
                        : 'bg-card border-border text-foreground hover:bg-muted'
                    }`}
                  >
                    {inWatchlist ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                  </button>

                  <TrailerButton title={item.title} year={item.year} type={item.type} />

                  {/* Download episodes */}
                  <button
                    onClick={() => setDlDialogOpen(true)}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-card border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors"
                    title="Download episodes to your library"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>

                  {/* Auto-download subscription */}
                  {subStatus === 'subscribed' ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleUnsubscribe}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary/10 border border-primary/30 text-primary font-semibold text-sm hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors"
                        title="Unsubscribe from auto-downloads"
                      >
                        <BellOff className="w-4 h-4" />
                        Subscribed
                      </button>
                      <button
                        onClick={handleCheckNow}
                        disabled={checkingNow}
                        className="flex items-center gap-2 px-3 py-3 rounded-xl bg-card border border-border text-muted-foreground font-semibold text-sm hover:bg-muted transition-colors disabled:opacity-50"
                        title="Check for new episodes now"
                      >
                        <RefreshCw className={`w-4 h-4 ${checkingNow ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSubDialogOpen(true)}
                      disabled={subStatus === 'loading'}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl bg-card border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors disabled:opacity-50"
                      title="Auto-download new episodes"
                    >
                      <Bell className="w-4 h-4" />
                      Auto-Download
                    </button>
                  )}
                </div>

                {/* AI summary or plot */}
                {(item.enrichment?.aiSummary || item.plot) && (
                  <p className="text-sm text-muted-foreground leading-relaxed mb-5 max-w-2xl">
                    {item.enrichment?.aiSummary || item.plot}
                  </p>
                )}

                {/* Why Watch hook */}
                {item.enrichment?.whyWatch && (
                  <div className="flex items-start gap-2.5 mb-5 bg-primary/8 border border-primary/20 rounded-2xl px-4 py-3.5 max-w-2xl">
                    <Zap className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground font-medium italic">{item.enrichment.whyWatch}</p>
                  </div>
                )}

                {/* Director / Cast */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                  {item.director && item.director !== 'N/A' && (
                    <div className="bg-card/60 border border-border/50 rounded-xl px-3.5 py-3">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Creator / Director</p>
                      <p className="text-sm text-foreground font-medium">{item.director}</p>
                    </div>
                  )}
                  {item.actors && item.actors !== 'N/A' && (
                    <div className="bg-card/60 border border-border/50 rounded-xl px-3.5 py-3">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Cast</p>
                      <p className="text-sm text-foreground line-clamp-2">{toActorsString(item.actors)}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* ── Details section ── */}
        <div className="max-w-6xl mx-auto px-4 sm:px-8 lg:px-16 pb-16 space-y-10">

          {/* Season progress overview */}
          {seasons.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
            >
              <SectionTitle icon={ListVideo} label="Season Progress" />
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {seasons.map(s => (
                  <SeasonCard key={s.number} number={s.number} watched={s.watched} total={s.total} />
                ))}
              </div>
            </motion.div>
          )}

          {/* Episode Tracker */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
          >
            <SectionTitle icon={CheckCircle2} label="Episode Tracker" />
            <EpisodeTracker
              show={item}
              onUpdate={handleEpisodeUpdate}
            />
          </motion.div>

          {/* AI Enrichment */}
          <AnimatePresence>
            {settings.showEnrichmentTags && item.enrichment && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {item.enrichment.mood?.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <SectionTitle icon={Heart} label="Mood" />
                    <div className="flex flex-wrap gap-1.5">
                      {item.enrichment.mood.map(m => <Pill key={m} label={m} color="mood" />)}
                    </div>
                  </div>
                )}
                {item.enrichment.tags?.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <SectionTitle icon={Tag} label="Tags" />
                    <div className="flex flex-wrap gap-1.5">
                      {item.enrichment.tags.map(t => <Pill key={t} label={t} color="primary" />)}
                    </div>
                  </div>
                )}
                {item.enrichment.themes?.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <SectionTitle icon={Layers} label="Themes" />
                    <div className="flex flex-wrap gap-1.5">
                      {item.enrichment.themes.map(t => <Pill key={t} label={t} />)}
                    </div>
                  </div>
                )}
                {(item.enrichment.pacing || item.enrichment.audienceAge) && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <SectionTitle icon={Zap} label="Pacing &amp; Audience" />
                    <div className="flex flex-wrap gap-1.5">
                      {item.enrichment.pacing && <Pill label={`${item.enrichment.pacing} pacing`} />}
                      {item.enrichment.audienceAge && <Pill label={item.enrichment.audienceAge} />}
                    </div>
                  </div>
                )}
                {item.enrichment.contentWarnings?.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <SectionTitle icon={AlertTriangle} label="Content Warnings" />
                    <div className="flex flex-wrap gap-1.5">
                      {item.enrichment.contentWarnings.map(w => <Pill key={w} label={w} color="warning" />)}
                    </div>
                  </div>
                )}
                {item.plot && item.enrichment.aiSummary && item.plot !== item.enrichment.aiSummary && (
                  <div className="bg-card border border-border rounded-xl p-4 sm:col-span-2 lg:col-span-1">
                    <SectionTitle icon={BookOpen} label="Plot" />
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.plot}</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Full plot when enrichment is off */}
          {(!settings.showEnrichmentTags || !item.enrichment) && item.plot && (
            <div>
              <SectionTitle icon={BookOpen} label="Plot" />
              <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">{item.plot}</p>
            </div>
          )}

          {/* AI similar titles not in library */}
          {aiSimilar.length > 0 && (
            <div>
              <SectionTitle icon={Users} label="You Might Also Like" />
              <div className="flex flex-wrap gap-2">
                {aiSimilar.map(title => (
                  <Link
                    key={title}
                    to={`/?q=${encodeURIComponent(title)}`}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-card border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    {title}
                    <ChevronRight className="w-3 h-3 opacity-50" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Similar shows in library */}
          {similarInLibrary.length > 0 && (
            <div>
              <SectionTitle icon={Tv2} label="More Like This" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {similarInLibrary.map(show => {
                  const prog = getShowProgress(show);
                  return (
                    <motion.div
                      key={show.id}
                      whileHover={{ scale: 1.03 }}
                      transition={{ duration: 0.15 }}
                      className="cursor-pointer group"
                      onClick={() => navigate(`/show/${show.id}`)}
                    >
                      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-card shadow-md">
                        {show.poster ? (
                          <img
                            src={show.poster}
                            alt={show.title}
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Tv2 className="w-8 h-8 text-muted-foreground/30" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <ChevronRight className="w-6 h-6 text-white" />
                        </div>
                        {prog && prog.total > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                            <div className="h-full bg-primary" style={{ width: `${prog.pct}%` }} />
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-medium text-foreground mt-1.5 truncate">{show.title}</p>
                      <p className="text-[10px] text-muted-foreground">{show.year}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </RestrictedContentGuard>

    {/* ── Download selector dialog ─────────────────────────────────────── */}
    <ShowDownloadDialog
      open={dlDialogOpen}
      onOpenChange={setDlDialogOpen}
      item={item}
      seasons={seasons}
    />

    {/* ── Subscribe dialog ─────────────────────────────────────────────── */}
    <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Auto-Download New Episodes
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-4">
          <p className="text-sm text-muted-foreground">
            HomeStream will automatically check for new episodes of{' '}
            <span className="font-semibold text-foreground">{item?.title}</span>{' '}
            and download them to your library.
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Check frequency</label>
            <Select value={subSchedule} onValueChange={setSubSchedule}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Every day</SelectItem>
                <SelectItem value="every3days">Every 3 days</SelectItem>
                <SelectItem value="weekly">Every week</SelectItem>
                <SelectItem value="every2weeks">Every 2 weeks</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Only episodes newer than what you already have will be downloaded.
            HomeStream must be running for checks to fire.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setSubDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubscribe} disabled={subStatus === 'loading'}>
            <Bell className="w-4 h-4 mr-2" />
            Subscribe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
