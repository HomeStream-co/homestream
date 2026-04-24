/**
 * EnrichmentRevealModal
 *
 * Netflix-style full-screen overlay that pops up when AI categorization
 * finishes. Poster fills the background, categories animate in one by one,
 * then the user dismisses it to return to the library.
 */
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Sparkles, Tag, Heart, BookOpen, Users,
  ShieldAlert, Film, Star, CheckCircle2,
} from 'lucide-react';
import type { MediaEnrichment, MediaItem } from '@/types/media';

interface EnrichmentRevealModalProps {
  item: MediaItem;
  enrichment: MediaEnrichment;
  onClose: () => void;
}

// ── Pill component with staggered entrance ──
function Pill({
  label,
  delay,
  className,
}: {
  label: string;
  delay: number;
  className?: string;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.7, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, duration: 0.25, ease: 'backOut' as const }}
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${className}`}
    >
      {label}
    </motion.span>
  );
}

const MOOD_COLORS: Record<string, string> = {
  tense:        'bg-red-900/50 text-red-300 border-red-700',
  dark:         'bg-gray-800 text-gray-300 border-gray-600',
  funny:        'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  heartwarming: 'bg-pink-900/50 text-pink-300 border-pink-700',
  uplifting:    'bg-green-900/50 text-green-300 border-green-700',
  suspenseful:  'bg-orange-900/50 text-orange-300 border-orange-700',
  romantic:     'bg-rose-900/50 text-rose-300 border-rose-700',
  scary:        'bg-purple-900/50 text-purple-300 border-purple-700',
  thrilling:    'bg-red-900/50 text-red-300 border-red-700',
  emotional:    'bg-blue-900/50 text-blue-300 border-blue-700',
};

function moodClass(mood: string) {
  return MOOD_COLORS[mood.toLowerCase()] ?? 'bg-primary/20 text-primary border-primary/40';
}

const AUDIENCE_LABEL: Record<string, string> = {
  kids:   '👶 Kids',
  family: '👨‍👩‍👧 Family',
  teens:  '🧑 Teens',
  adults: '🎬 Adults',
  mature: '🔞 Mature',
};

const PACING_LABEL: Record<string, string> = {
  slow:     '🐢 Slow burn',
  moderate: '🚶 Moderate',
  fast:     '⚡ Fast-paced',
  varied:   '🎭 Varied',
};

export default function EnrichmentRevealModal({
  item,
  enrichment,
  onClose,
}: EnrichmentRevealModalProps) {
  // Dismiss on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Build a flat stagger index across all pill groups
  let pillIndex = 0;
  const nextDelay = (base = 0.04) => {
    const d = 0.55 + pillIndex * base;
    pillIndex++;
    return d;
  };

  return (
    <AnimatePresence>
      <motion.div
        key="enrichment-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        onClick={onClose}
      >
        {/* ── Backdrop — blurred poster ── */}
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={item.poster}
            alt=""
            className="w-full h-full object-cover scale-110"
            style={{ filter: 'blur(18px) brightness(0.25)' }}
          />
          {/* Extra dark vignette so text pops */}
          <div className="absolute inset-0 bg-black/60" />
        </div>

        {/* ── Modal card ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.4, ease: 'easeOut' as const }}
          className="relative z-10 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto rounded-2xl bg-black/80 border border-white/10 backdrop-blur-xl shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header — poster + title ── */}
          <div className="relative h-52 overflow-hidden rounded-t-2xl flex-shrink-0">
            <img
              src={item.poster}
              alt={item.title}
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center 20%' }}
            />
            {/* Gradient fade to card */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/40 to-black/90" />

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center hover:bg-black/80 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>

            {/* Title overlay */}
            <div className="absolute bottom-0 left-0 right-0 px-6 pb-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.35 }}
                className="flex items-end gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white/60 text-xs mb-0.5 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-primary" />
                    AI Categorization Complete
                  </p>
                  <h2 className="text-2xl font-bold text-white truncate">{item.title}</h2>
                  <p className="text-white/60 text-xs mt-0.5">
                    {item.year}
                    {item.runtime && item.runtime !== 'Unknown' && ` · ${item.runtime}`}
                    {item.imdbRating !== 'N/A' && (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-yellow-400">
                        <Star className="w-3 h-3 fill-yellow-400" /> {item.imdbRating}
                      </span>
                    )}
                  </p>
                </div>
                <span className="flex-shrink-0 flex items-center gap-1 text-green-400 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Enriched
                </span>
              </motion.div>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="px-6 py-5 flex flex-col gap-5">

            {/* Why Watch hook */}
            {enrichment.whyWatch && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.3 }}
                className="bg-primary/15 border border-primary/30 rounded-xl px-4 py-3"
              >
                <p className="text-primary text-sm font-medium leading-relaxed">
                  ✦ {enrichment.whyWatch}
                </p>
              </motion.div>
            )}

            {/* AI Summary */}
            {enrichment.aiSummary && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.3 }}
                className="text-white/70 text-sm leading-relaxed"
              >
                {enrichment.aiSummary}
              </motion.p>
            )}

            {/* ── Tags ── */}
            {enrichment.tags.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionLabel icon={<Tag className="w-3.5 h-3.5" />} label="Tags" delay={0.45} />
                <div className="flex flex-wrap gap-1.5">
                  {enrichment.tags.map(tag => (
                    <Pill
                      key={tag}
                      label={tag}
                      delay={nextDelay()}
                      className="bg-white/8 text-white/80 border-white/15"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Mood ── */}
            {enrichment.mood.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionLabel icon={<Heart className="w-3.5 h-3.5" />} label="Mood" delay={0.5} />
                <div className="flex flex-wrap gap-1.5">
                  {enrichment.mood.map(m => (
                    <Pill key={m} label={m} delay={nextDelay()} className={moodClass(m)} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Themes ── */}
            {enrichment.themes.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionLabel icon={<BookOpen className="w-3.5 h-3.5" />} label="Themes" delay={0.55} />
                <div className="flex flex-wrap gap-1.5">
                  {enrichment.themes.map(t => (
                    <Pill
                      key={t}
                      label={t}
                      delay={nextDelay()}
                      className="bg-accent/20 text-accent border-accent/30"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Audience + Pacing row ── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65, duration: 0.3 }}
              className="flex items-center gap-6 flex-wrap"
            >
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-white/40" />
                <span className="text-xs text-white/50">Audience</span>
                <span className="text-xs text-white font-medium">
                  {AUDIENCE_LABEL[enrichment.audienceAge] ?? enrichment.audienceAge}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Film className="w-3.5 h-3.5 text-white/40" />
                <span className="text-xs text-white/50">Pacing</span>
                <span className="text-xs text-white font-medium">
                  {PACING_LABEL[enrichment.pacing] ?? enrichment.pacing}
                </span>
              </div>
            </motion.div>

            {/* ── Content Warnings ── */}
            {enrichment.contentWarnings.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7, duration: 0.3 }}
                className="flex items-start gap-2"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-400/80">
                  <span className="font-medium text-yellow-400">Content: </span>
                  {enrichment.contentWarnings.join(' · ')}
                </p>
              </motion.div>
            )}

            {/* ── Similar Titles ── */}
            {enrichment.similarTitles.length > 0 && (
              <div className="flex flex-col gap-2 pb-1">
                <SectionLabel
                  icon={<Sparkles className="w-3.5 h-3.5" />}
                  label="If you like this, you'll love"
                  delay={0.75}
                />
                <div className="flex flex-wrap gap-1.5">
                  {enrichment.similarTitles.map(t => (
                    <Pill
                      key={t}
                      label={t}
                      delay={nextDelay(0.035)}
                      className="bg-white/5 text-white/60 border-white/10"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Dismiss button ── */}
            <motion.button
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1, duration: 0.3 }}
              onClick={onClose}
              className="w-full mt-1 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-white/90 transition-colors"
            >
              Got it — go to library
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Small labelled section header
function SectionLabel({
  icon,
  label,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.25 }}
      className="flex items-center gap-1.5"
    >
      <span className="text-white/40">{icon}</span>
      <span className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">{label}</span>
    </motion.div>
  );
}
