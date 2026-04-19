import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MediaCard from '@/components/MediaCard';
import TrailerHover from '@/components/TrailerHover';
import type { MediaItem } from '@/types/media';

interface MediaCarouselProps {
  title: string;
  items: MediaItem[];
  showProgress?: boolean;
  titleIcon?: React.ReactNode;
  /** Enable trailer-on-hover previews (default: true) */
  trailerPreview?: boolean;
}

export default function MediaCarousel({
  title,
  items,
  showProgress,
  titleIcon,
  trailerPreview = true,
}: MediaCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (items.length === 0) return null;

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 300;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <section className="mb-8">
      <h2 className="text-lg font-heading tracking-wide text-foreground mb-3 px-4 sm:px-6 lg:px-8 flex items-center gap-2">
        {titleIcon}
        {title}
      </h2>
      <div className="relative group/carousel">
        {/* Left Arrow */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-0 bottom-6 z-10 w-10 bg-gradient-to-r from-background to-transparent flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>

        {/* Scroll container */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-8 pb-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map(item => (
            trailerPreview ? (
              <TrailerHover key={item.id} item={item}>
                <MediaCard item={item} showProgress={showProgress} />
              </TrailerHover>
            ) : (
              <MediaCard key={item.id} item={item} showProgress={showProgress} />
            )
          ))}
        </div>

        {/* Right Arrow */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-0 bottom-6 z-10 w-10 bg-gradient-to-l from-background to-transparent flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
      </div>
    </section>
  );
}
