/**
 * HomePageSkeleton — content-shaped loading placeholder for the home page.
 *
 * Renders while the media library is loading on first paint.
 * Matches the exact layout of the real home page so there's no layout shift:
 *   1. Hero banner skeleton (full-width, tall)
 *   2. Search bar skeleton
 *   3. 3 carousel rows (title + poster strip)
 *
 * Uses CSS animation (animate-pulse) — no JS timers needed.
 */

export default function HomePageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero banner ── */}
      <div className="relative w-full h-[56vw] max-h-[680px] min-h-[320px] bg-muted/40 animate-pulse overflow-hidden">
        {/* Gradient overlay shape */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        {/* Fake title block bottom-left */}
        <div className="absolute bottom-16 left-8 sm:left-12 lg:left-16 flex flex-col gap-3">
          <div className="h-8 w-64 sm:w-80 bg-muted/60 rounded-lg" />
          <div className="h-4 w-48 bg-muted/40 rounded" />
          <div className="flex gap-2 mt-2">
            <div className="h-10 w-28 bg-muted/60 rounded-xl" />
            <div className="h-10 w-28 bg-muted/40 rounded-xl" />
          </div>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 relative z-10 mb-8">
        <div className="h-12 bg-card border border-border rounded-2xl animate-pulse" />
      </div>

      {/* ── Carousel rows ── */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-10 pb-16">
        {[
          { title: 'Continue Watching', count: 5 },
          { title: 'Recently Added',    count: 8 },
          { title: 'Movies',            count: 8 },
        ].map(row => (
          <div key={row.title}>
            {/* Row title */}
            <div className="flex items-center gap-3 mb-3">
              <div className="h-5 w-40 bg-muted/50 rounded animate-pulse" />
              <div className="h-4 w-4 bg-muted/30 rounded animate-pulse" />
            </div>
            {/* Poster strip */}
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: row.count }).map((_, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 rounded-xl bg-muted/40 animate-pulse"
                  style={{
                    width: 'clamp(100px, 12vw, 160px)',
                    aspectRatio: '2/3',
                    // Stagger the pulse slightly for a wave effect
                    animationDelay: `${i * 60}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
