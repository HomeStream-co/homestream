import { useState, useMemo, useRef } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useSearchParams } from 'react-router-dom';
import {
  Library, Upload, Search, SlidersHorizontal, Grid3X3, List,
  X, ChevronDown, Film, Tv2, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMedia } from '@/context/MediaContext';
import MediaCard from '@/components/MediaCard';
import Spinner from '@/components/Spinner';
import EnrichmentWizard from '@/components/EnrichmentWizard';
import type { MediaItem } from '@/types/media';

type SortKey = 'title' | 'year' | 'rating' | 'added' | 'progress';
type ViewMode = 'grid' | 'list';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'added',    label: 'Recently Added' },
  { key: 'title',    label: 'Title A–Z' },
  { key: 'year',     label: 'Year' },
  { key: 'rating',   label: 'IMDb Rating' },
  { key: 'progress', label: 'Watch Progress' },
];

function sortItems(items: MediaItem[], key: SortKey): MediaItem[] {
  return [...items].sort((a, b) => {
    switch (key) {
      case 'title':    return a.title.localeCompare(b.title);
      case 'year':     return parseInt(b.year) - parseInt(a.year);
      case 'rating':   return (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0);
      case 'added':    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      case 'progress': return (b.watchProgress ?? 0) - (a.watchProgress ?? 0);
      default:         return 0;
    }
  });
}

export default function LibraryPage() {
  const { library, loading, refreshLibrary } = useMedia();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('added');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [enrichTarget, setEnrichTarget] = useState<MediaItem | null>(null);

  const typeFilter = searchParams.get('type') as 'movie' | 'series' | null;
  const genreFilter = searchParams.get('genre') ?? '';

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    library.forEach(m => m.genre.forEach(g => set.add(g)));
    return [...set].sort();
  }, [library]);

  const filtered = useMemo(() => {
    let items = library;
    if (typeFilter) items = items.filter(m => m.type === typeFilter);
    if (genreFilter) items = items.filter(m => m.genre.includes(genreFilter));
    if (query) {
      const q = query.toLowerCase();
      items = items.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.director.toLowerCase().includes(q) ||
        (typeof m.actors === 'string' ? m.actors : m.actors.join(', ')).toLowerCase().includes(q)
      );
    }
    return sortItems(items, sortKey);
  }, [library, typeFilter, genreFilter, query, sortKey]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadProgress(0);
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('video', f));
    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => xhr.status < 400 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.open('POST', '/api/upload');
        xhr.withCredentials = true;
        xhr.send(formData);
      });
      await refreshLibrary();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  if (loading && !library.length) {
    return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;
  }

  return (
    <>
      <Helmet>
        <title>My Library — HomeStream</title>
        <meta name="description" content="Browse and manage your personal media library." />
      </Helmet>

      <div className="pt-20 pb-16 px-4 sm:px-6 lg:px-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Library className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-heading text-foreground">My Library</h1>
              <p className="text-xs text-muted-foreground">{library.length} title{library.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="video/*" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-semibold rounded-xl transition-all disabled:opacity-60"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? `${uploadProgress}%` : 'Upload'}
            </button>
          </div>
        </div>

        {/* Search + filters bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search titles, directors, actors…"
              className="w-full bg-card border border-border rounded-xl pl-9 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Type filter */}
          <div className="flex rounded-xl overflow-hidden border border-border text-xs">
            {[
              { value: null,     label: 'All',    Icon: null },
              { value: 'movie',  label: 'Movies', Icon: Film },
              { value: 'series', label: 'Series', Icon: Tv2 },
            ].map(({ value, label, Icon }) => (
              <button
                key={label}
                onClick={() => {
                  const p = new URLSearchParams(searchParams);
                  if (value) p.set('type', value); else p.delete('type');
                  setSearchParams(p);
                }}
                className={`flex items-center gap-1 px-3 py-2 transition-colors ${typeFilter === value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
              >
                {Icon && <Icon className="w-3 h-3" />}
                {label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              className="appearance-none bg-card border border-border rounded-xl pl-3 pr-8 py-2 text-xs text-foreground focus:outline-none focus:border-primary/60 cursor-pointer"
            >
              {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>

          {/* Genre filter */}
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs transition-colors ${showFilters || genreFilter ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {genreFilter || 'Genre'}
          </button>

          {/* View mode */}
          <div className="flex rounded-xl overflow-hidden border border-border">
            <button onClick={() => setViewMode('grid')} className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}><Grid3X3 className="w-3.5 h-3.5" /></button>
            <button onClick={() => setViewMode('list')} className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}><List className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        {/* Genre chips */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className="flex flex-wrap gap-2 py-2">
                <button
                  onClick={() => { const p = new URLSearchParams(searchParams); p.delete('genre'); setSearchParams(p); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${!genreFilter ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/40'}`}
                >
                  All Genres
                </button>
                {allGenres.map(g => (
                  <button
                    key={g}
                    onClick={() => { const p = new URLSearchParams(searchParams); p.set('genre', g); setSearchParams(p); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${genreFilter === g ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/40'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active filters summary */}
        {(typeFilter || genreFilter || query) && (
          <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
            <span>Showing {filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            <button onClick={() => { setQuery(''); setSearchParams({}); }} className="text-primary hover:underline">Clear all filters</button>
          </div>
        )}

        {/* Grid / List */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <Library className="w-10 h-10 opacity-30" />
            <p className="text-sm">No titles match your filters.</p>
            <button onClick={() => { setQuery(''); setSearchParams({}); }} className="text-primary text-xs hover:underline">Clear filters</button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map(item => (
              <div key={item.id} className="relative group">
                <MediaCard item={item} />
                <button
                  onClick={() => setEnrichTarget(item)}
                  className="absolute bottom-2 right-2 p-1 rounded-lg bg-black/60 hover:bg-primary/80 text-white opacity-0 group-hover:opacity-100 transition-all z-10 text-[9px] font-semibold"
                  title="AI Enrich"
                >
                  AI
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-4 p-3 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-card/80 cursor-pointer transition-all group"
              >
                <img src={item.poster} alt={item.title} className="w-12 h-16 object-cover rounded-lg flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.year} · {item.genre.slice(0, 2).join(', ')}</p>
                  {item.imdbRating !== 'N/A' && <p className="text-xs text-yellow-400">★ {item.imdbRating}</p>}
                </div>
                {item.watchProgress > 0 && item.watchProgress < 95 && (
                  <div className="w-20 flex-shrink-0">
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${item.watchProgress}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{item.watchProgress}%</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enrichment wizard */}
      {enrichTarget && (
        <EnrichmentWizard
          mediaId={enrichTarget.id}
          title={enrichTarget.title}
          onComplete={() => { setEnrichTarget(null); refreshLibrary(); }}
          onError={() => setEnrichTarget(null)}
        />
      )}
    </>
  );
}
