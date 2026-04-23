/**
 * MediaCarousel — premium horizontal scroll carousel.
 *
 * v2 improvements:
 *  - Section label with accent line + count badge
 *  - Larger, more visible scroll arrows with glass morphism
 *  - Edge fade peek effect (shows partial next card)
 *  - Smooth momentum scrolling
 *  - Arrow appears on hover with animation
 */

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import MediaCard from '@/components/MediaCard';
import TrailerHover from '@/components/TrailerHover';
import type { MediaItem } from '@/types/media';

interface MediaCarouselProps {
  title: string;
  items: MediaItem[];
  showProgress?: boolean;
  titleIcon?: React.ReactNode;
  trailerPreview?: boolean;
  /** Optional accent color class for the section line */
  accentClass?: string;
}

export default function MediaCarousel({
  title,
  items,
  showProgress,
  titleIcon,
  trailerPreview = true,
  accentClass = 'bg-primary',
}: MediaCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);

  if (items.length === 0) return null;

  const SCROLL_AMOUNT = 340;

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT, behavior: 'smooth' });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 20);
    setShowRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 20);
  };

  return (
    <section className="mb-10">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4 px-4 sm:px-6 lg:px-8">
        <div className={`w-1 h-5 rounded-full ${accentClass} flex-shrink-0`} />
        <h2 className="text-base font-heading tracking-widest text-foreground uppercase flex items-center gap-2">
          {titleIcon}
          {title}
        </h2>
        <span className="text-xs text-muted-foreground font-medium ml-1 tabular-nums">
          {items.length}
        </span>
        <div className="flex-1 h-px bg-border/40 ml-2" />
      </div>

      {/* Scroll container with edge fades */}
      <div className="relative group/carousel">
        {/* Left fade + arrow */}
        <AnimatePresence>
          {showLeft && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 top-0 bottom-6 z-10 w-20 bg-gradient-to-r from-background via-background/80 to-transparent flex items-center justify-start pl-2 pointer-events-none"
            >
              <button
                onClick={() => scroll('left')}
                className="w-9 h-9 rounded-full glass-dark flex items-center justify-center text-white hover:bg-white/20 transition-all pointer-events-auto shadow-lg"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scroll track */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-8 pb-3"
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
          {/* Trailing spacer so last card isn't flush against edge */}
          <div className="w-4 flex-shrink-0" />
        </div>

        {/* Right fade + arrow */}
        <AnimatePresence>
          {showRight && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-0 bottom-6 z-10 w-20 bg-gradient-to-l from-background via-background/80 to-transparent flex items-center justify-end pr-2 pointer-events-none"
            >
              <button
                onClick={() => scroll('right')}
                className="w-9 h-9 rounded-full glass-dark flex items-center justify-center text-white hover:bg-white/20 transition-all pointer-events-auto shadow-lg"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
