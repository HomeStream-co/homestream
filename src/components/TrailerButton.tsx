/**
 * TrailerButton — opens a YouTube trailer in a new tab.
 * variant="menuitem" renders as a full-width menu row.
 * variant="button" renders as a compact icon button.
 */
import { useState } from 'react';
import { Youtube, Loader2 } from 'lucide-react';

interface TrailerButtonProps {
  title: string;
  year?: string | number;
  type?: 'movie' | 'series';
  variant?: 'button' | 'menuitem';
}

export default function TrailerButton({ title, year, type = 'movie', variant = 'button' }: TrailerButtonProps) {
  const [loading, setLoading] = useState(false);

  const openTrailer = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    const query = encodeURIComponent(`${title} ${year ?? ''} ${type === 'series' ? 'TV show' : 'movie'} official trailer`);
    // Use youtube-nocookie for privacy
    window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank', 'noopener,noreferrer');
    setTimeout(() => setLoading(false), 800);
  };

  if (variant === 'menuitem') {
    return (
      <button
        onClick={openTrailer}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
          {loading ? <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" /> : <Youtube className="w-3.5 h-3.5 text-red-400" />}
        </div>
        <span className="text-sm font-medium text-foreground">Play Trailer</span>
      </button>
    );
  }

  return (
    <button
      onClick={openTrailer}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors"
      title="Watch trailer on YouTube"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Youtube className="w-3 h-3" />}
      Trailer
    </button>
  );
}
