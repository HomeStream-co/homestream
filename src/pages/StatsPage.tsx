import { useMemo } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { BarChart3, Film, Tv2, Clock, Star, TrendingUp, Eye, Bookmark } from 'lucide-react';
import { useMedia } from '@/context/MediaContext';
import Spinner from '@/components/Spinner';

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center`}>
          <Icon className={`w-4.5 h-4.5 ${color}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground font-heading">{value}</p>
      <p className="text-sm font-medium text-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function BarRow({ label, value, max, color = 'bg-primary' }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-24 truncate flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-foreground font-mono w-6 text-right flex-shrink-0">{value}</span>
    </div>
  );
}

export default function StatsPage() {
  const { library, loading, watchlist } = useMedia();

  const stats = useMemo(() => {
    const movies = library.filter(m => m.type === 'movie');
    const series = library.filter(m => m.type === 'series');
    const watched = library.filter(m => m.watchProgress >= 90);
    const inProgress = library.filter(m => m.watchProgress > 5 && m.watchProgress < 90);

    const totalWatchSeconds = library.reduce((s, m) => s + (m.watchedSeconds ?? 0), 0);
    const totalHours = Math.round(totalWatchSeconds / 3600);

    const genreCounts = new Map<string, number>();
    library.forEach(m => m.genre.forEach(g => genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1)));
    const topGenres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    const directorCounts = new Map<string, number>();
    library.forEach(m => { if (m.director) directorCounts.set(m.director, (directorCounts.get(m.director) ?? 0) + 1); });
    const topDirectors = [...directorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const ratedItems = library.filter(m => m.imdbRating !== 'N/A');
    const avgRating = ratedItems.length
      ? (ratedItems.reduce((s, m) => s + parseFloat(m.imdbRating), 0) / ratedItems.length).toFixed(1)
      : 'N/A';

    const yearCounts = new Map<string, number>();
    library.forEach(m => { if (m.year) yearCounts.set(m.year, (yearCounts.get(m.year) ?? 0) + 1); });
    const topYears = [...yearCounts.entries()].sort((a, b) => parseInt(b[0]) - parseInt(a[0])).slice(0, 8);

    return { movies, series, watched, inProgress, totalHours, topGenres, topDirectors, avgRating, topYears };
  }, [library]);

  if (loading && !library.length) {
    return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;
  }

  const maxGenre = stats.topGenres[0]?.[1] ?? 1;
  const maxDir = stats.topDirectors[0]?.[1] ?? 1;
  const maxYear = stats.topYears[0]?.[1] ?? 1;

  return (
    <>
      <Helmet>
        <title>Stats — HomeStream</title>
        <meta name="description" content="Your HomeStream library statistics." />
      </Helmet>

      <div className="pt-20 pb-16 px-4 sm:px-6 lg:px-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-heading text-foreground">Library Stats</h1>
            <p className="text-xs text-muted-foreground">Your viewing at a glance</p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-10">
          <StatCard icon={Film} label="Total Titles" value={library.length} sub={`${stats.movies.length} movies · ${stats.series.length} series`} />
          <StatCard icon={Eye} label="Watched" value={stats.watched.length} sub={`${Math.round((stats.watched.length / Math.max(library.length, 1)) * 100)}% of library`} color="text-green-400" />
          <StatCard icon={TrendingUp} label="In Progress" value={stats.inProgress.length} color="text-yellow-400" />
          <StatCard icon={Clock} label="Hours Watched" value={stats.totalHours} sub="total watch time" />
          <StatCard icon={Star} label="Avg IMDb Rating" value={stats.avgRating} sub="across rated titles" color="text-yellow-400" />
          <StatCard icon={Bookmark} label="Watchlist" value={watchlist.length} sub="saved to watch" />
          <StatCard icon={Film} label="Movies" value={stats.movies.length} />
          <StatCard icon={Tv2} label="TV Series" value={stats.series.length} />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Genres */}
          {stats.topGenres.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Top Genres</h2>
              <div className="flex flex-col gap-2.5">
                {stats.topGenres.map(([genre, count]) => (
                  <BarRow key={genre} label={genre} value={count} max={maxGenre} />
                ))}
              </div>
            </div>
          )}

          {/* Directors */}
          {stats.topDirectors.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Top Directors</h2>
              <div className="flex flex-col gap-2.5">
                {stats.topDirectors.map(([dir, count]) => (
                  <BarRow key={dir} label={dir} value={count} max={maxDir} color="bg-accent" />
                ))}
              </div>
            </div>
          )}

          {/* Years */}
          {stats.topYears.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">By Release Year</h2>
              <div className="flex flex-col gap-2.5">
                {stats.topYears.map(([year, count]) => (
                  <BarRow key={year} label={year} value={count} max={maxYear} color="bg-secondary" />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Watch completion donut-style */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Watch Completion</h2>
          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--primary))" strokeWidth="3"
                  strokeDasharray={`${(stats.watched.length / Math.max(library.length, 1)) * 100} 100`}
                  strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-foreground">
                  {Math.round((stats.watched.length / Math.max(library.length, 1)) * 100)}%
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded-full bg-primary" /><span className="text-muted-foreground">Watched ({stats.watched.length})</span></div>
              <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded-full bg-yellow-400" /><span className="text-muted-foreground">In Progress ({stats.inProgress.length})</span></div>
              <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded-full bg-muted" /><span className="text-muted-foreground">Unwatched ({library.length - stats.watched.length - stats.inProgress.length})</span></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
