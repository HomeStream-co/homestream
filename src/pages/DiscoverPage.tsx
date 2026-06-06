import { useState, useMemo } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Compass, Shuffle, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMedia } from '@/context/MediaContext';
import GenreBrowser from '@/components/GenreBrowser';
import MediaCarousel from '@/components/MediaCarousel';
import Spinner from '@/components/Spinner';
import type { MediaItem } from '@/types/media';

function RandomPickCard({ item }: { item: MediaItem }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(`/player/${item.id}`)}
      className="relative rounded-2xl overflow-hidden cursor-pointer group border border-border hover:border-primary/40 transition-all"
    >
      <img src={item.poster} alt={item.title} className="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-500" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <p className="text-xs text-primary font-semibold uppercase tracking-wider mb-1">Random Pick</p>
        <h3 className="text-lg font-heading text-white">{item.title}</h3>
        <p className="text-xs text-white/60">{item.year} · {item.genre[0]}</p>
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  const { library, loading } = useMedia();
  const [randomItem, setRandomItem] = useState<MediaItem | null>(null);

  const unwatched = useMemo(() =>
    library.filter(m => m.watchProgress < 5),
    [library]
  );

  const pickRandom = () => {
    const pool = unwatched.length > 0 ? unwatched : library;
    if (!pool.length) return;
    setRandomItem(pool[Math.floor(Math.random() * pool.length)]);
  };

  const highlyRated = useMemo(() =>
    [...library]
      .filter(m => m.imdbRating !== 'N/A' && parseFloat(m.imdbRating) >= 7.5)
      .sort((a, b) => parseFloat(b.imdbRating) - parseFloat(a.imdbRating))
      .slice(0, 20),
    [library]
  );

  const hidden = useMemo(() =>
    [...library]
      .filter(m => m.watchProgress < 5 && m.imdbRating !== 'N/A' && parseFloat(m.imdbRating) >= 7.0)
      .sort(() => Math.random() - 0.5)
      .slice(0, 20),
    [library]
  );

  if (loading && !library.length) {
    return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;
  }

  return (
    <>
      <Helmet>
        <title>Discover — HomeStream</title>
        <meta name="description" content="Discover what to watch next from your personal library." />
      </Helmet>

      <div className="pt-20 pb-16 px-4 sm:px-6 lg:px-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Compass className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-heading text-foreground">Discover</h1>
              <p className="text-xs text-muted-foreground">Find something new to watch</p>
            </div>
          </div>
          <button
            onClick={pickRandom}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary rounded-xl text-sm font-semibold transition-all"
          >
            <Shuffle className="w-4 h-4" />
            Surprise Me
          </button>
        </div>

        {/* Random pick result */}
        {randomItem && (
          <div className="mb-10 max-w-lg">
            <RandomPickCard item={randomItem} />
          </div>
        )}

        {/* AI enriched picks */}
        {library.some(m => m.enrichment) && (
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">AI-Enriched Picks</h2>
            </div>
            <MediaCarousel
              title=""
              items={library.filter(m => m.enrichment).slice(0, 20)}
            />
          </div>
        )}

        {/* Genre browser */}
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-foreground mb-4">Browse by Genre</h2>
          <GenreBrowser />
        </div>

        {/* Highly rated */}
        {highlyRated.length > 0 && (
          <div className="mb-10">
            <MediaCarousel title="Highly Rated (7.5+)" items={highlyRated} />
          </div>
        )}

        {/* Hidden gems */}
        {hidden.length > 0 && (
          <MediaCarousel title="Hidden Gems — Unwatched" items={hidden} />
        )}
      </div>
    </>
  );
}
