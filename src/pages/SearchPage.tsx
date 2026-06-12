import { useState, useEffect, useMemo } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Search, X, SlidersHorizontal, Film, Tv2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useMedia } from '@/context/MediaContext';
import MediaCard from '@/components/MediaCard';
import Spinner from '@/components/Spinner';
import { toActorsString } from '@/lib/utils';

export default function SearchPage() {
  const { library, loading } = useMedia();
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState(searchParams.get('q') ?? '');
  const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'series'>('all');
  const [genreFilter, setGenreFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const query = searchParams.get('q') ?? '';

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(searchParams);
      if (inputValue.trim()) p.set('q', inputValue.trim());
      else p.delete('q');
      setSearchParams(p, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [inputValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    library.forEach(m => m.genre.forEach(g => set.add(g)));
    return [...set].sort();
  }, [library]);

  const results = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return library.filter(m => {
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (genreFilter && !m.genre.includes(genreFilter)) return false;
      return (
        m.title.toLowerCase().includes(q) ||
        (m.director ?? '').toLowerCase().includes(q) ||
        toActorsString(m.actors).toLowerCase().includes(q) ||
        m.genre.some(g => g.toLowerCase().includes(q)) ||
        (m.plot ?? '').toLowerCase().includes(q) ||
        m.enrichment?.tags.some(t => t.toLowerCase().includes(q)) ||
        m.enrichment?.mood.some(t => t.toLowerCase().includes(q))
      );
    });
  }, [library, query, typeFilter, genreFilter]);

  if (loading && !library.length) {
    return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;
  }

  return (
    <>
      <Helmet>
        <title>{query ? `"${query}" — Search` : 'Search'} — HomeStream</title>
        <meta name="description" content="Search your media library." />
      </Helmet>

      <div className="pt-20 pb-16 px-4 sm:px-6 lg:px-10">
        {/* Search bar */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Search titles, directors, actors, genres, moods…"
              autoFocus
              className="w-full bg-card border border-border rounded-2xl pl-12 pr-12 py-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
            />
            {inputValue && (
              <button onClick={() => { setInputValue(''); setSearchParams({}); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-2 mt-3">
            <div className="flex rounded-xl overflow-hidden border border-border text-xs">
              {([
                { value: 'all', label: 'All' },
                { value: 'movie', label: 'Movies', Icon: Film },
                { value: 'series', label: 'Series', Icon: Tv2 },
              ] as { value: 'all' | 'movie' | 'series'; label: string; Icon?: React.ElementType }[]).map(({ value, label, Icon }) => (
                <button key={value} onClick={() => setTypeFilter(value)} className={`flex items-center gap-1 px-3 py-2 transition-colors ${typeFilter === value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
                  {Icon && <Icon className="w-3 h-3" />}{label}
                </button>
              ))}
            </div>
            <button onClick={() => setShowFilters(v => !v)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs transition-colors ${showFilters || genreFilter ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}>
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {genreFilter || 'Genre'}
            </button>
            {genreFilter && <button onClick={() => setGenreFilter('')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear genre</button>}
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {allGenres.map(g => (
                <button key={g} onClick={() => setGenreFilter(genreFilter === g ? '' : g)} className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${genreFilter === g ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/40'}`}>{g}</button>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        {!query && (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Search className="w-12 h-12 opacity-20" />
            <p className="text-sm">Start typing to search your library</p>
            <p className="text-xs">Search by title, director, actor, genre, mood, or AI tags</p>
          </div>
        )}

        {query && results.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Search className="w-10 h-10 opacity-20" />
            <p className="text-sm">No results for &ldquo;{query}&rdquo;</p>
            <p className="text-xs">Try a different search term or remove filters</p>
          </div>
        )}

        {query && results.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground mb-4">{results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {results.map(item => (
                <MediaCard key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
