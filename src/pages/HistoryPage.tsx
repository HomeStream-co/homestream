import { useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { History, Search, X, Trash2, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMedia } from '@/context/MediaContext';
import Spinner from '@/components/Spinner';
import type { MediaItem } from '@/types/media';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function groupByDate(items: MediaItem[]): { label: string; items: MediaItem[] }[] {
  const groups = new Map<string, MediaItem[]>();
  for (const item of items) {
    const date = item.watchedAt ?? item.lastWatchedAt ?? item.addedAt;
    const label = fmtDate(date);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

export default function HistoryPage() {
  const { library, loading, updateProgress } = useMedia();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'watched' | 'partial'>('all');

  const historyItems = useMemo(() => {
    return [...library]
      .filter(m => {
        const hasHistory = m.watchProgress > 0 || m.watchedAt || m.lastWatchedAt;
        if (!hasHistory) return false;
        if (filter === 'watched') return m.watchProgress >= 90;
        if (filter === 'partial') return m.watchProgress > 0 && m.watchProgress < 90;
        return true;
      })
      .filter(m => !query || m.title.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        const ta = new Date(a.watchedAt ?? a.lastWatchedAt ?? a.addedAt).getTime();
        const tb = new Date(b.watchedAt ?? b.lastWatchedAt ?? b.addedAt).getTime();
        return tb - ta;
      });
  }, [library, filter, query]);

  const grouped = useMemo(() => groupByDate(historyItems), [historyItems]);

  if (loading && !library.length) {
    return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;
  }

  return (
    <>
      <Helmet>
        <title>Watch History — HomeStream</title>
        <meta name="description" content="Your watch history." />
      </Helmet>

      <div className="pt-20 pb-16 px-4 sm:px-6 lg:px-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <History className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-heading text-foreground">Watch History</h1>
            <p className="text-xs text-muted-foreground">{historyItems.length} title{historyItems.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search history…"
              className="w-full bg-card border border-border rounded-xl pl-9 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
            />
            {query && <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <div className="flex rounded-xl overflow-hidden border border-border text-xs">
            {(['all', 'watched', 'partial'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 capitalize transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}>{f}</button>
            ))}
          </div>
        </div>

        {/* Empty state */}
        {historyItems.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <History className="w-10 h-10 opacity-30" />
            <p className="text-sm">{library.length === 0 ? 'No media in your library yet.' : 'Nothing watched yet — start streaming!'}</p>
          </div>
        )}

        {/* Grouped list */}
        {grouped.map(group => (
          <div key={group.label} className="mb-8">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{group.label}</h2>
            <div className="flex flex-col gap-2">
              {group.items.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-all group cursor-pointer"
                  onClick={() => navigate(`/player/${item.id}`)}
                >
                  <div className="relative flex-shrink-0">
                    <img src={item.poster} alt={item.title} className="w-12 h-16 object-cover rounded-lg" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                      <Play className="w-5 h-5 text-white fill-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.year} · {item.genre.slice(0, 2).join(', ')}</p>
                    {item.watchProgress > 0 && item.watchProgress < 95 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden max-w-24">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${item.watchProgress}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{item.watchProgress}%</span>
                      </div>
                    )}
                    {item.watchProgress >= 95 && (
                      <span className="text-[10px] text-green-400 font-medium">✓ Watched</span>
                    )}
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      updateProgress(item.id, 0);
                    }}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
                    title="Remove from history"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
