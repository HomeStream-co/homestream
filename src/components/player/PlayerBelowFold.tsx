/**
 * PlayerBelowFold — the section below the video player.
 *
 * Contains:
 *   - Poster + metadata (title, year, rating, genres)
 *   - AI enrichment section (mood, tags, content warnings, or run-enrichment CTA)
 *   - Plot / AI summary + director + cast
 *   - "More Like This" grid
 *   - "Ask AI" banner
 */

import { Loader2, Wand2, Star, Sparkles, MessageCircle, CheckCircle2 } from 'lucide-react';
import MediaCard from '@/components/MediaCard';
import type { MediaItem } from '@/types/media';
import { toActorsString } from '@/lib/utils';

interface Props {
  item: MediaItem;
  similarItems: MediaItem[];
  continueWatching: { id: string; progress: number }[];
  enrichRunning: boolean;
  enrichError: string | null;
  runEnrichment: () => void;
}

export default function PlayerBelowFold({
  item, similarItems, continueWatching, enrichRunning, enrichError, runEnrichment,
}: Props) {
  return (
    <div className="bg-background px-4 sm:px-6 lg:px-8 py-8 max-w-screen-2xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-6 mb-10">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-heading text-foreground mb-2">{item.title}</h1>
          <div className="flex flex-wrap items-center gap-3 mb-3 text-sm text-muted-foreground">
            <span>{item.year}</span>
            {item.rated && item.rated !== 'N/A' && (
              <span className="border border-border px-1.5 py-0.5 rounded text-xs">{item.rated}</span>
            )}
            {item.runtime && <span>{item.runtime}</span>}
            {item.imdbRating !== 'N/A' && (
              <span className="flex items-center gap-1 text-accent">
                <Star className="w-3.5 h-3.5 fill-accent" /> {item.imdbRating}/10 IMDb
              </span>
            )}
          </div>

          {/* Genre chips */}
          <div className="flex flex-wrap gap-1 mb-3">
            {(item.genre ?? []).map((g: string) => (
              <span key={g} className="bg-secondary text-foreground text-xs px-2 py-0.5 rounded-full">{g}</span>
            ))}
          </div>

          {/* AI Enrichment */}
          {item.enrichment ? (
            <div className="mb-4 space-y-2">
              {item.enrichment.whyWatch && (
                <p className="text-sm text-primary font-medium italic">"{item.enrichment.whyWatch}"</p>
              )}
              {item.enrichment.mood.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider mr-1">Mood</span>
                  {item.enrichment.mood.map((m: string) => (
                    <span key={m} className="bg-primary/10 text-primary border border-primary/20 text-xs px-2 py-0.5 rounded-full capitalize">{m}</span>
                  ))}
                </div>
              )}
              {item.enrichment.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider mr-1">Tags</span>
                  {item.enrichment.tags.map((t: string) => (
                    <span key={t} className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              )}
              {item.enrichment.contentWarnings.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider mr-1">Contains</span>
                  {item.enrichment.contentWarnings.map((w: string) => (
                    <span key={w} className="bg-destructive/10 text-destructive border border-destructive/20 text-xs px-2 py-0.5 rounded-full">{w}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mb-4">
              {enrichRunning ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>Analysing with AI — this takes about 10–20 seconds…</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={runEnrichment}
                    className="inline-flex items-center gap-2 self-start bg-primary/10 hover:bg-primary/20 border border-primary/30 hover:border-primary/50 text-primary text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Wand2 className="w-4 h-4" />
                    Run AI Analysis
                  </button>
                  {enrichError && <p className="text-xs text-destructive">{enrichError}</p>}
                  <p className="text-xs text-muted-foreground">
                    Adds mood tags, themes, content warnings, and a personalised summary using Gemini.
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            {item.enrichment?.aiSummary || item.plot}
          </p>
          {item.director !== 'Unknown' && (
            <p className="text-sm text-muted-foreground mt-2">
              <span className="text-foreground">Director:</span> {item.director}
            </p>
          )}
          {item.actors !== 'Unknown' && (
            <p className="text-sm text-muted-foreground mt-1">
              <span className="text-foreground">Cast:</span> {toActorsString(item.actors)}
            </p>
          )}
        </div>
      </div>

      {/* More Like This */}
      {similarItems.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-5">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-heading text-foreground">More Like This</h2>
            <span className="text-xs text-muted-foreground ml-1">matched by genre, director &amp; cast</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {similarItems.map(m => {
              const watched = (continueWatching.find(c => c.id === m.id)?.progress ?? 0) >= 90;
              return (
                <div key={m.id} className="relative">
                  {watched && (
                    <div className="absolute inset-0 z-10 rounded-lg bg-black/50 flex flex-col items-center justify-center gap-1 pointer-events-none">
                      <CheckCircle2 className="w-6 h-6 text-white/70" />
                      <span className="text-white/60 text-[10px] font-medium">Watched</span>
                    </div>
                  )}
                  <MediaCard item={m} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ask AI banner */}
      <div className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Want a smarter recommendation?</p>
          <p className="text-xs text-muted-foreground">Ask the AI assistant — it knows your whole library and can match by mood, tone, or theme.</p>
        </div>
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('homestream:open-chat', {
              detail: { message: `I'm watching "${item.title}". What else in my library would I enjoy?` },
            }));
          }}
          className="flex-shrink-0 flex items-center gap-1.5 bg-primary hover:bg-primary/80 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          Ask AI
        </button>
      </div>
    </div>
  );
}
