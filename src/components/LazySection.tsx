/**
 * LazySection — renders children only when the section scrolls into view.
 *
 * Uses IntersectionObserver with a 200px rootMargin so content starts
 * loading just before it enters the viewport (no pop-in).
 *
 * Shows a skeleton placeholder while not yet visible.
 * Once visible, stays rendered (no unmount on scroll away).
 *
 * Usage:
 *   <LazySection skeletonHeight={220}>
 *     <GenreCarousel items={movies} />
 *   </LazySection>
 */

import { useRef, useState, useEffect } from 'react';

interface LazySectionProps {
  children: React.ReactNode;
  skeletonHeight?: number;
  className?: string;
}

export default function LazySection({
  children,
  skeletonHeight = 200,
  className = '',
}: LazySectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Already in viewport on mount (e.g. above the fold)
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 400) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {visible ? children : (
        <div
          className="w-full rounded-xl bg-muted/30 animate-pulse"
          style={{ height: skeletonHeight }}
        />
      )}
    </div>
  );
}
