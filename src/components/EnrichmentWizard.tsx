/**
 * EnrichmentWizard
 *
 * Live step-by-step panel shown during AI categorization.
 * Connects to /api/enrich/:id via SSE and animates each step as it completes.
 * When done, shows the full enrichment result as a tag cloud.
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, CheckCircle2, AlertCircle, Loader2,
  Tag, Heart, BookOpen, Users, ShieldAlert, Lightbulb, Film,
} from 'lucide-react';
import type { MediaEnrichment } from '@/types/media';

interface WizardStep {
  key: string;
  label: string;
  detail?: string;
  status: 'waiting' | 'running' | 'done' | 'error';
}

interface EnrichmentWizardProps {
  mediaId: string;
  title: string;
  /** Called when enrichment finishes with the result */
  onComplete?: (enrichment: MediaEnrichment) => void;
  /** Called on unrecoverable error */
  onError?: (msg: string) => void;
}

const STEP_LABELS: Record<string, string> = {
  init:     'Initializing analysis',
  metadata: 'Checking metadata',
  ai:       'AI deep analysis',
  parse:    'Parsing categories',
  save:     'Saving to library',
  complete: 'Complete',
};

const MOOD_COLORS: Record<string, string> = {
  tense:        'bg-red-900/40 text-red-300 border-red-800',
  dark:         'bg-gray-800 text-gray-300 border-gray-700',
  funny:        'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  heartwarming: 'bg-pink-900/40 text-pink-300 border-pink-800',
  uplifting:    'bg-green-900/40 text-green-300 border-green-800',
  suspenseful:  'bg-orange-900/40 text-orange-300 border-orange-800',
  romantic:     'bg-rose-900/40 text-rose-300 border-rose-800',
  scary:        'bg-purple-900/40 text-purple-300 border-purple-800',
};

function moodClass(mood: string): string {
  return MOOD_COLORS[mood.toLowerCase()] || 'bg-primary/20 text-primary border-primary/30';
}

function TagPill({ label, className }: { label: string; className?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${className || 'bg-secondary text-foreground border-border'}`}
    >
      {label}
    </motion.span>
  );
}

export default function EnrichmentWizard({ mediaId, title, onComplete, onError }: EnrichmentWizardProps) {
  const [steps, setSteps] = useState<WizardStep[]>([
    { key: 'init',     label: STEP_LABELS['init'],     status: 'waiting' },
    { key: 'metadata', label: STEP_LABELS['metadata'], status: 'waiting' },
    { key: 'ai',       label: STEP_LABELS['ai'],       status: 'waiting' },
    { key: 'parse',    label: STEP_LABELS['parse'],    status: 'waiting' },
    { key: 'save',     label: STEP_LABELS['save'],     status: 'waiting' },
  ]);
  const [enrichment, setEnrichment] = useState<MediaEnrichment | null>(null);
  const [failed, setFailed] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/enrich/${mediaId}`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as { step: string; status: string; detail?: string };

        if (event.step === 'complete' && event.status === 'done' && event.detail) {
          try {
            const result = JSON.parse(event.detail) as MediaEnrichment;
            setEnrichment(result);
            onComplete?.(result);
          } catch { /* ignore */ }
          es.close();
          return;
        }

        if (event.step === 'error' && event.status === 'error') {
          setFailed(true);
          onError?.(event.detail || 'Enrichment failed');
          es.close();
          return;
        }

        setSteps(prev => prev.map(s =>
          s.key === event.step
            ? { ...s, status: event.status as WizardStep['status'], detail: event.detail }
            : s
        ));
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [mediaId, onComplete, onError]);

  const allDone = enrichment !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-card/80">
        <Sparkles className={`w-4 h-4 ${allDone ? 'text-primary' : 'text-primary animate-pulse'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            AI Enrichment — <span className="text-muted-foreground font-normal">{title}</span>
          </p>
        </div>
        {allDone && (
          <span className="text-[10px] text-green-400 flex items-center gap-1 flex-shrink-0">
            <CheckCircle2 className="w-3 h-3" /> Enriched
          </span>
        )}
        {failed && (
          <span className="text-[10px] text-destructive flex items-center gap-1 flex-shrink-0">
            <AlertCircle className="w-3 h-3" /> Failed
          </span>
        )}
      </div>

      {/* Steps */}
      {!allDone && !failed && (
        <div className="px-4 py-3 flex flex-col gap-2">
          {steps.map((step, _i) => (
            <div key={step.key} className="flex items-start gap-2.5">
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {step.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                {step.status === 'running' && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />}
                {step.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
                {step.status === 'waiting' && (
                  <div className="w-3.5 h-3.5 rounded-full border border-border" />
                )}
              </div>
              {/* Label + detail */}
              <div className="flex-1 min-w-0">
                <p className={`text-xs ${
                  step.status === 'done' ? 'text-muted-foreground' :
                  step.status === 'running' ? 'text-foreground font-medium' :
                  step.status === 'error' ? 'text-destructive' :
                  'text-muted-foreground/50'
                }`}>
                  {step.label}
                </p>
                {step.detail && step.status !== 'waiting' && (
                  <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">{step.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Result — tag cloud shown when enrichment completes */}
      <AnimatePresence>
        {allDone && enrichment && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
            className="px-4 pb-4 pt-3 flex flex-col gap-3"
          >
            {/* AI Summary */}
            {enrichment.aiSummary && (
              <div className="flex gap-2">
                <Lightbulb className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">{enrichment.aiSummary}</p>
              </div>
            )}

            {/* Why Watch */}
            {enrichment.whyWatch && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
                <p className="text-xs text-primary font-medium">✦ {enrichment.whyWatch}</p>
              </div>
            )}

            {/* Tags */}
            {enrichment.tags.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tags</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {enrichment.tags.map(tag => (
                    <TagPill key={tag} label={tag} />
                  ))}
                </div>
              </div>
            )}

            {/* Mood */}
            {enrichment.mood.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Heart className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Mood</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {enrichment.mood.map(m => (
                    <TagPill key={m} label={m} className={moodClass(m)} />
                  ))}
                </div>
              </div>
            )}

            {/* Themes */}
            {enrichment.themes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <BookOpen className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Themes</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {enrichment.themes.map(t => (
                    <TagPill key={t} label={t} className="bg-accent/20 text-accent border-accent/30" />
                  ))}
                </div>
              </div>
            )}

            {/* Audience + Pacing row */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Users className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Audience:</span>
                <span className="text-[10px] text-foreground font-medium capitalize">{enrichment.audienceAge}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Film className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Pacing:</span>
                <span className="text-[10px] text-foreground font-medium capitalize">{enrichment.pacing}</span>
              </div>
            </div>

            {/* Content Warnings */}
            {enrichment.contentWarnings.length > 0 && (
              <div className="flex items-start gap-1.5">
                <ShieldAlert className="w-3 h-3 text-yellow-500 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-yellow-500">
                  {enrichment.contentWarnings.join(' · ')}
                </p>
              </div>
            )}

            {/* Similar Titles */}
            {enrichment.similarTitles.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">If you like this, watch</span>
                <div className="flex flex-wrap gap-1">
                  {enrichment.similarTitles.map(t => (
                    <TagPill key={t} label={t} className="bg-secondary text-muted-foreground border-border" />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {failed && (
        <div className="px-4 py-3 text-xs text-muted-foreground">
          Enrichment failed — recommendations will use basic genre matching. You can re-run enrichment from the library.
        </div>
      )}
    </motion.div>
  );
}
