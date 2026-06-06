/**
 * TasteRecommendationsShelf
 *
 * Homepage row: "You'd probably like" — driven by the taste engine.
 * Shows unwatched titles ranked by predicted match %, with a coloured
 * match badge on each card.
 *
 * Only renders once the user has at least 3 watch events so the
 * recommendations are meaningful.
 */
import { useNavigate } from 'react-router-dom';
import { Sparkles, Play, ChevronRight } from 'lucide-react';
import type { MediaItem } from '@/types/media';
import type { TasteRecommendation } from '@/hooks/useTasteScores';

interface Props {
  library:         MediaItem[];
  recommendations: TasteRecommendation[];
  scores:          Map<string, number>;
  loading:         boolean;
}

function matchColor(score: number): string {
  if (score >= 80) return 'bg-green-500 text-white';
  if (score >= 60) return 'bg-yellow-500 text-black';
  if (score >= 40) return 'bg-orange-500 text-white';
  return 'bg-muted text-muted-foreground';
}

function matchLabel(score: number): string {
  if (score >= 85) return 'Great match';
  if (score >= 70) return 'Good match';
  if (score >= 55) return 'Decent match';
  return 'Possible match';
}

export default function TasteRecommendationsShelf({ library, recommendations, scores, loading }: Props) {
  const navigate = useNavigate();

  if (loading && recommendations.length === 0) {
    return (
      <div className="px-6 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-sm font-semibold text-foreground">Learning your taste…</span>
        </div>
        <div className="flex gap-3 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-36 h-52 bg-muted/40 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (recommendations.length === 0) return null;

  // Resolve full MediaItem objects from recommendations
  const items = recommendations
    .map(r => library.find(m => m.id === r.mediaId))
    .filter((m): m is MediaItem => !!m)
    .slice(0, 10);

  if (items.length === 0) return null;

  return (
    <section className="px-4 md:px-6 py-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">You'd probably like</h2>
          <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium">
            AI picks
          </span>
        </div>
        <button
          onClick={() => navigate('/discover')}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          See all <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scrollable row */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
        {items.map(item => {
          const score = scores.get(item.id) ?? 50;
          return (
            <button
              key={item.id}
              onClick={() => navigate(`/player/${item.id}`)}
              className="flex-shrink-0 w-36 snap-start group relative rounded-xl overflow-hidden bg-card border border-border hover:border-primary/50 transition-all hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {/* Poster */}
              <div className="relative w-full aspect-[2/3] bg-muted">
                {item.poster ? (
                  <img
                    src={item.poster}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Play className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}

                {/* Match badge */}
                <div className={`absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${matchColor(score)}`}>
                  {score}%
                </div>

                {/* Play overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-5 h-5 text-black fill-black ml-0.5" />
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="p-2">
                <p className="text-xs font-semibold text-foreground truncate leading-tight">{item.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{item.year}</p>
                <p className={`text-[9px] font-medium mt-1 ${matchColor(score).split(' ')[1]}`}>
                  {matchLabel(score)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
