"""
Rebuild discover.tsx cleanly from the last known-good base,
applying our streaming tab additions without any conflict markers.
"""
import sys

with open('/tmp/discover_base.tsx', 'r') as f:
    src = f.read()

# 1. Update lucide-react imports
src = src.replace(
    "  ChevronDown, Search, X, Tv2, Clapperboard, Play, Volume2, VolumeX, Layers,\n  AlertCircle,\n} from 'lucide-react';",
    "  ChevronDown, Search, X, Tv2, Clapperboard, Play, Volume2, VolumeX, Layers,\n  AlertCircle, MonitorPlay, ChevronLeft, ChevronRight, SlidersHorizontal,\n} from 'lucide-react';"
)

# 2. Update activeTab type
src = src.replace(
    "  const [activeTab, setActiveTab] = useState<'movies' | 'shows' | 'genres' | 'search'>('movies');",
    "  const [activeTab, setActiveTab] = useState<'movies' | 'shows' | 'genres' | 'search' | 'streaming'>('movies');"
)

# 3. Update TABS array
src = src.replace(
    """  const TABS = [
    { id: 'movies' as const, label: 'Movies', icon: Film },
    { id: 'shows' as const, label: 'TV Shows', icon: Tv2 },
    { id: 'genres' as const, label: 'Browse by Genre', icon: Layers },
    { id: 'search' as const, label: 'Search & Download', icon: Clapperboard },
  ];""",
    """  const TABS = [
    { id: 'movies' as const,    label: 'Movies',            icon: Film },
    { id: 'shows' as const,     label: 'TV Shows',          icon: Tv2 },
    { id: 'streaming' as const, label: 'Streaming',         icon: MonitorPlay },
    { id: 'genres' as const,    label: 'Browse by Genre',   icon: Layers },
    { id: 'search' as const,    label: 'Search & Download', icon: Clapperboard },
  ];"""
)

# 4. Update the condition that hides the hero/filter bar on non-grid tabs
src = src.replace(
    "{activeTab !== 'search' && activeTab !== 'genres' && (",
    "{activeTab !== 'search' && activeTab !== 'genres' && activeTab !== 'streaming' && ("
)

# 5. Insert StreamingTab component before "// ── Main page"
streaming_component = '''// ── Streaming Services Tab ────────────────────────────────────────────────────

const STREAMING_SERVICES = [
  { id: 8,    name: 'Netflix',      color: '#E50914', logo: 'https://image.tmdb.org/t/p/w92/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg' },
  { id: 9,    name: 'Prime Video',  color: '#00A8E1', logo: 'https://image.tmdb.org/t/p/w92/emthp39XA2YScoYL1p0sdbAH2WA.jpg' },
  { id: 1899, name: 'Max',          color: '#002BE7', logo: 'https://image.tmdb.org/t/p/w92/Ajqyt5aNxNx9pi2RvNFLHaLeSgx.jpg' },
  { id: 337,  name: 'Disney+',      color: '#113CCF', logo: 'https://image.tmdb.org/t/p/w92/7rwgEs15tFwyR9NPQ5vpzxTj19d.jpg' },
  { id: 15,   name: 'Hulu',         color: '#1CE783', logo: 'https://image.tmdb.org/t/p/w92/zxrVdFjIjLqkfnwyghnfywTn3Lh.jpg' },
  { id: 386,  name: 'Peacock',      color: '#000000', logo: 'https://image.tmdb.org/t/p/w92/8VCV78prwd9QzZnEm0ReO6bERDa.jpg' },
] as const;

type ServiceId = typeof STREAMING_SERVICES[number]['id'];

interface CatalogMovie extends TMDBMovie {
  mediaType: 'movie' | 'tv';
}

function StreamingTab({ onDownload, libraryTitles, watchlist, onAddToWatchlist, onRemoveFromWatchlist }: {
  onDownload: (movie: TMDBMovie) => void;
  libraryTitles: Set<string>;
  watchlist: string[];
  onAddToWatchlist: (id: string) => void;
  onRemoveFromWatchlist: (id: string) => void;
}) {
  const [selectedService, setSelectedService] = useState<ServiceId | null>(null);
  const [mediaType, setMediaType] = useState<\'movie\' | \'tv\'>('movie');
  const [sortBy, setSortBy] = useState('popularity.desc');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<CatalogMovie[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const service = STREAMING_SERVICES.find(s => s.id === selectedService);

  const fetchCatalog = useCallback(async (providerId: ServiceId, type: \'movie\' | \'tv\', pg: number, sort: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ provider: String(providerId), type, page: String(pg), sort });
      const res = await fetch(`/api/tmdb/catalog?${params}`, { credentials: \'include\' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json() as { results: CatalogMovie[]; totalPages: number; page: number };
      setResults(data.results ?? []);
      setTotalPages(data.totalPages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedService) fetchCatalog(selectedService, mediaType, page, sortBy);
  }, [selectedService, mediaType, page, sortBy, fetchCatalog]);

  const handleServiceSelect = (id: ServiceId) => { setSelectedService(id); setPage(1); setResults([]); };
  const handleTypeChange = (t: \'movie\' | \'tv\') => { setMediaType(t); setPage(1); };
  const handleSortChange = (s: string) => { setSortBy(s); setPage(1); };

  if (!selectedService) {
    return (
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-muted-foreground text-sm mb-6">
          Browse what\'s currently streaming — click a service to see their full catalog, then download any title directly to your server.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {STREAMING_SERVICES.map(svc => (
            <motion.button
              key={svc.id}
              onClick={() => handleServiceSelect(svc.id)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="relative flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border border-border hover:border-primary/40 bg-card transition-all group overflow-hidden"
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity" style={{ background: svc.color }} />
              <img src={svc.logo} alt={svc.name} className="w-14 h-14 rounded-xl object-cover shadow-md" onError={e => { (e.target as HTMLImageElement).style.display = \'none\'; }} />
              <span className="text-sm font-semibold text-foreground">{svc.name}</span>
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button onClick={() => { setSelectedService(null); setResults([]); }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />All Services
        </button>
        <div className="flex items-center gap-2 ml-2">
          <img src={service?.logo} alt={service?.name} className="w-7 h-7 rounded-lg object-cover" onError={e => { (e.target as HTMLImageElement).style.display = \'none\'; }} />
          <span className="text-base font-bold text-foreground">{service?.name}</span>
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            <button onClick={() => handleTypeChange(\'movie\')} className={`px-3 py-1.5 font-medium transition-colors ${mediaType === \'movie\' ? \'bg-primary text-primary-foreground\' : \'text-muted-foreground hover:text-foreground\'}`}>Movies</button>
            <button onClick={() => handleTypeChange(\'tv\')} className={`px-3 py-1.5 font-medium transition-colors ${mediaType === \'tv\' ? \'bg-primary text-primary-foreground\' : \'text-muted-foreground hover:text-foreground\'}`}>TV Shows</button>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <select value={sortBy} onChange={e => handleSortChange(e.target.value)} className="bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50">
              <option value="popularity.desc">Most Popular</option>
              <option value="vote_average.desc">Top Rated</option>
              <option value="primary_release_date.desc">Newest First</option>
              <option value="primary_release_date.asc">Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}

      {error && !loading && (
        <div className="flex flex-col items-center py-12 gap-3">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => fetchCatalog(selectedService, mediaType, page, sortBy)} className="text-xs text-primary hover:text-primary/80 underline">Try again</button>
        </div>
      )}

      {!loading && !error && results.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
            {results.map(movie => (
              <MovieCard
                key={movie.id}
                movie={movie}
                inWatchlist={watchlist.includes(`tmdb-${movie.id}`)}
                alreadyInLibrary={libraryTitles.has(movie.title.toLowerCase())}
                onAddToWatchlist={() => onAddToWatchlist(`tmdb-${movie.id}`)}
                onRemoveFromWatchlist={() => onRemoveFromWatchlist(`tmdb-${movie.id}`)}
                onDownload={onDownload}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-4 h-4" />Previous
              </button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Next<ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {!loading && !error && results.length === 0 && selectedService && (
        <div className="flex flex-col items-center py-16 gap-3">
          <MonitorPlay className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No titles found for this filter.</p>
        </div>
      )}
    </div>
  );
}

'''

src = src.replace(
    "// ── Main page ─────────────────────────────────────────────────────────────────",
    streaming_component + "// ── Main page ─────────────────────────────────────────────────────────────────"
)

# 6. Insert streaming tab panel before genres tab panel
streaming_panel = """            {/* ── Streaming Services tab ── */}
            {activeTab === 'streaming' && (
              <motion.div key="streaming" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <StreamingTab
                  onDownload={handleTMDBDownload}
                  libraryTitles={libraryTitles}
                  watchlist={watchlist}
                  onAddToWatchlist={addToWatchlist}
                  onRemoveFromWatchlist={removeFromWatchlist}
                />
              </motion.div>
            )}

            """

src = src.replace(
    "            {/* ── Genres tab ── */}",
    streaming_panel + "{/* ── Genres tab ── */}"
)

# Verify no conflict markers
import re
conflicts = len(re.findall(r'^<<<<<<< |^=======\s*$|^>>>>>>> ', src, re.MULTILINE))
print(f"Conflict markers remaining: {conflicts}")
print(f"Total lines: {len(src.splitlines())}")
print(f"StreamingTab present: {'StreamingTab' in src}")
print(f"MonitorPlay present: {'MonitorPlay' in src}")

with open('src/pages/discover.tsx', 'w') as f:
    f.write(src)
print("Written successfully.")
