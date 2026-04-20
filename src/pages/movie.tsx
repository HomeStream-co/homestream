/**
 * Movie Detail Page — /movie/:id
 *
 * Full-screen detail view for a single movie in the library.
 * Shows:
 *   - Blurred backdrop hero with poster, title, metadata
 *   - Play / Resume / Watchlist actions
 *   - Plot, cast, director, runtime, rating
 *   - AI enrichment: summary, why-watch, mood, tags, themes, content warnings
 *   - Similar titles carousel (from library + AI suggestions)
 *   - Watch progress bar
 */

import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Plus, Check, Star, Clock, Calendar, Film,
  ArrowLeft, Tag, Zap, AlertTriangle, Users, ChevronRight,
  BookOpen, Heart, Layers, Download,
} from 'lucide-react';
import { useMedia } from '@/context/MediaContext';
import { toActorsString } from '@/lib/utils';
import { useProfile } from '@/context/ProfileContext';
import { useTheme } from '@/context/ThemeContext';
import MediaCard from '@/components/MediaCard';
import TrailerButton from '@/components/TrailerButton';
import RestrictedContentGuard from '@/components/RestrictedContentGuard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRuntime(runtime?: string): string {
  if (!runtime || runtime === 'N/A') return '';
  const mins = parseInt(runtime);
  if (isNaN(mins)) return runtime;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtProgress(seconds?: number, total?: number): string {
  if (!seconds || seconds <= 0) return '';
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`;
  };
  return total ? `${fmt(seconds)} / ${fmt(total)}` : fmt(seconds);
}

// ─── Pill component ───────────────────────────────────────────────────────────

function Pill({ label, color = 'default' }: { label: string; color?: 'default' | 'primary' | 'mood' | 'warning' }) {
  const cls = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/15 text-primary',
    mood: 'bg-accent/15 text-accent-foreground',
    warning: 'bg-orange-500/15 text-orange-400',
  }[color];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-primary" />
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{label}</h3>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MoviePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { library, watchlist, addToWatchlist, removeFromWatchlist, continueWatching } = useMedia();
  const { isAllowed } = useProfile();
  const { settings } = useTheme();
  const [imgError, setImgError] = useState(false);

  // ── Find the item ──
  const item = useMemo(() => library.find(m => m.id === id), [library, id]);

  // ── Continue-watching progress ──
  const cwEntry = continueWatching.find(c => c.id === id);
  const progress = cwEntry?.progress ?? item?.watchProgress ?? 0;
  // watchedSeconds lives on the library item (server is source of truth)
  const watchedSeconds = item?.watchedSeconds ?? 0;
  const isResuming = progress > 2 && progress < 95;

  // ── Watchlist ──
  const inWatchlist = watchlist.includes(id ?? '');

  // ── Similar titles from library ──
  const similarInLibrary = useMemo(() => {
    if (!item) return [];
    const genres = new Set(item.genre.map(g => g.toLowerCase()));
    return library
      .filter(m =>
        m.id !== item.id &&
        isAllowed(m.rated) &&
        m.genre.some(g => genres.has(g.toLowerCase()))
      )
      .sort((a, b) => (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0))
      .slice(0, 12);
  }, [item, library, isAllowed]);

  // ── AI similar titles (names only, not in library) ──
  const aiSimilar = useMemo(() => {
    if (!item?.enrichment?.similarTitles) return [];
    const inLibraryTitles = new Set(library.map(m => m.title.toLowerCase()));
    return item.enrichment.similarTitles.filter(t => !inLibraryTitles.has(t.toLowerCase())).slice(0, 6);
  }, [item, library]);

  // ── Not found ──
  if (!item) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Film className="w-16 h-16 text-muted-foreground/30" />
        <p className="text-muted-foreground text-lg">Movie not found.</p>
        <button onClick={() => navigate(-1)} className="text-primary text-sm hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Go back
        </button>
      </div>
    );
  }

  const handlePlay = () => navigate(`/player/${item.id}`);
  const handleWatchlist = () => inWatchlist ? removeFromWatchlist(item.id) : addToWatchlist(item.id);

  const ratedColor =
    item.rated === 'G' || item.rated === 'TV-G' || item.rated === 'TV-Y' ? 'text-green-400 border-green-400/40' :
    item.rated === 'PG' || item.rated === 'TV-PG' || item.rated === 'TV-Y7' ? 'text-yellow-400 border-yellow-400/40' :
    item.rated === 'PG-13' || item.rated === 'TV-14' ? 'text-orange-400 border-orange-400/40' :
    'text-red-400 border-red-400/40';

  return (
    <RestrictedContentGuard rated={item.rated} contentTitle={item.title}>
    <>
      <title>{item.title} — HomeStream</title>
      <meta name="description" content={item.plot || `Watch ${item.title} on HomeStream.`} />

      <div className="min-h-screen bg-background">

        {/* ── Hero backdrop ── */}
        <div className="relative w-full" style={{ minHeight: '70vh' }}>
          {/* Blurred backdrop */}
          <div className="absolute inset-0 overflow-hidden">
            {!imgError && item.poster ? (
              <img
                src={item.poster}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover scale-110 blur-2xl opacity-30"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/10 to-background" />
            )}
            {/* Gradient overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />
          </div>

          {/* Back button */}
          <div className="relative z-10 pt-20 px-4 sm:px-8 lg:px-16">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm mb-8"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>

          {/* Content */}
          <div className="relative z-10 px-4 sm:px-8 lg:px-16 pb-12">
            <div className="flex flex-col md:flex-row gap-8 max-w-6xl">

              {/* Poster */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex-shrink-0"
              >
                <div className="w-44 sm:w-56 rounded-xl overflow-hidden shadow-2xl border border-border/30">
                  {!imgError && item.poster ? (
                    <img
                      src={item.poster}
                      alt={item.title}
                      className="w-full aspect-[2/3] object-cover"
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <div className="w-full aspect-[2/3] bg-card flex flex-col items-center justify-center gap-3 p-4">
                      <Film className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-xs text-muted-foreground text-center leading-snug">{item.title}</p>
                    </div>
                  )}
                </div>

                {/* Progress bar under poster */}
                {progress > 0 && progress < 95 && (
                  <div className="mt-2">
                    <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 text-center">
                      {fmtProgress(watchedSeconds, item.totalSeconds)}
                    </p>
                  </div>
                )}
              </motion.div>

              {/* Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.08 }}
                className="flex-1 min-w-0"
              >
                {/* Type badge */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                    {item.type === 'series' ? 'TV Series' : 'Movie'}
                  </span>
                  {item.year && (
                    <span className="text-[10px] text-muted-foreground">{item.year}</span>
                  )}
                </div>

                {/* Title */}
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-foreground leading-tight mb-3">
                  {item.title}
                </h1>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-muted-foreground">
                  {item.imdbRating && item.imdbRating !== 'N/A' && (
                    <span className="flex items-center gap-1 text-yellow-400 font-semibold">
                      <Star className="w-3.5 h-3.5 fill-yellow-400" />
                      {item.imdbRating}
                      <span className="text-muted-foreground font-normal text-xs">/10 IMDb</span>
                    </span>
                  )}
                  {item.rated && item.rated !== 'N/A' && (
                    <span className={`text-xs font-bold border rounded px-1.5 py-0.5 ${ratedColor}`}>
                      {item.rated}
                    </span>
                  )}
                  {item.runtime && item.runtime !== 'N/A' && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {fmtRuntime(item.runtime)}
                    </span>
                  )}
                  {item.year && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {item.year}
                    </span>
                  )}
                </div>

                {/* Genre pills */}
                {item.genre.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {item.genre.map(g => (
                      <Link
                        key={g}
                        to={`/browse?q=${encodeURIComponent(g)}`}
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary transition-colors"
                      >
                        {g}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-3 mb-6">
                  <button
                    onClick={handlePlay}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    {isResuming ? 'Resume' : 'Play'}
                  </button>

                  <TrailerButton title={item.title} year={item.year} type={item.type} />

                  {/* Download to device */}
                  <a
                    href={`/api/stream/${item.filename}`}
                    download={item.filename ?? item.title}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-card border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors"
                    title="Download file to your device"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>

                  <button
                    onClick={handleWatchlist}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl border font-semibold text-sm transition-colors ${
                      inWatchlist
                        ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
                        : 'bg-card border-border text-foreground hover:bg-muted'
                    }`}
                  >
                    {inWatchlist ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                  </button>
                </div>

                {/* AI summary or plot */}
                {(item.enrichment?.aiSummary || item.plot) && (
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-2xl">
                    {item.enrichment?.aiSummary || item.plot}
                  </p>
                )}

                {/* Why Watch hook */}
                {item.enrichment?.whyWatch && (
                  <div className="flex items-start gap-2 mb-5 bg-primary/5 border border-primary/15 rounded-xl px-4 py-3 max-w-2xl">
                    <Zap className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground font-medium italic">{item.enrichment.whyWatch}</p>
                  </div>
                )}

                {/* Director / Cast */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                  {item.director && item.director !== 'N/A' && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Director</p>
                      <p className="text-sm text-foreground">{item.director}</p>
                    </div>
                  )}
                  {item.actors && item.actors !== 'N/A' && (
                    <div>
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

          {/* AI Enrichment — only shown when setting is on and data exists */}
          <AnimatePresence>
            {settings.showEnrichmentTags && item.enrichment && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {/* Mood */}
                {item.enrichment.mood?.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <SectionTitle icon={Heart} label="Mood" />
                    <div className="flex flex-wrap gap-1.5">
                      {item.enrichment.mood.map(m => <Pill key={m} label={m} color="mood" />)}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {item.enrichment.tags?.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <SectionTitle icon={Tag} label="Tags" />
                    <div className="flex flex-wrap gap-1.5">
                      {item.enrichment.tags.map(t => <Pill key={t} label={t} color="primary" />)}
                    </div>
                  </div>
                )}

                {/* Themes */}
                {item.enrichment.themes?.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <SectionTitle icon={Layers} label="Themes" />
                    <div className="flex flex-wrap gap-1.5">
                      {item.enrichment.themes.map(t => <Pill key={t} label={t} />)}
                    </div>
                  </div>
                )}

                {/* Pacing + Audience */}
                {(item.enrichment.pacing || item.enrichment.audienceAge) && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <SectionTitle icon={Zap} label="Pacing &amp; Audience" />
                    <div className="flex flex-wrap gap-1.5">
                      {item.enrichment.pacing && <Pill label={`${item.enrichment.pacing} pacing`} />}
                      {item.enrichment.audienceAge && <Pill label={item.enrichment.audienceAge} />}
                    </div>
                  </div>
                )}

                {/* Content warnings */}
                {item.enrichment.contentWarnings?.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <SectionTitle icon={AlertTriangle} label="Content Warnings" />
                    <div className="flex flex-wrap gap-1.5">
                      {item.enrichment.contentWarnings.map(w => <Pill key={w} label={w} color="warning" />)}
                    </div>
                  </div>
                )}

                {/* Full plot (if different from AI summary) */}
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

          {/* AI similar titles (not in library) */}
          {aiSimilar.length > 0 && (
            <div>
              <SectionTitle icon={Users} label="You Might Also Like" />
              <div className="flex flex-wrap gap-2">
                {aiSimilar.map(title => (
                  <Link
                    key={title}
                    to={`/browse?q=${encodeURIComponent(title)}`}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-card border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    {title}
                    <ChevronRight className="w-3 h-3 opacity-50" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Similar in library */}
          {similarInLibrary.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Film className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">More Like This</h3>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {similarInLibrary.map(m => (
                  <div key={m.id} className="flex-shrink-0">
                    <MediaCard item={m} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
    </RestrictedContentGuard>
  );
}
