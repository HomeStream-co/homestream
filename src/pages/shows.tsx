import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Tv2, ChevronLeft, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMedia } from '@/context/MediaContext';
import EpisodeTracker from '@/components/EpisodeTracker';
import type { MediaItem, Episode } from '@/types/media';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

export default function ShowsPage() {
  const { library, loading, updateMedia } = useMedia();
  const navigate = useNavigate();
  const [selectedShow, setSelectedShow] = useState<MediaItem | null>(null);

  const shows = library.filter(m => m.type === 'series');

  const getShowProgress = (show: MediaItem) => {
    const eps = show.episodes || [];
    if (eps.length === 0) return null;
    const watched = eps.filter(e => e.watched).length;
    return { watched, total: eps.length, pct: (watched / eps.length) * 100 };
  };

  const handleEpisodeUpdate = async (show: MediaItem, episodes: Episode[]) => {
    await updateMedia(show.id, { episodes } as Partial<MediaItem>);
  };

  return (
    <div className="min-h-screen bg-background pt-20 pb-16">
      <title>TV Shows — HomeStream</title>
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          {selectedShow && (
            <button
              onClick={() => setSelectedShow(null)}
              className="p-2 hover:bg-card rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-4xl font-heading text-foreground">
              {selectedShow ? selectedShow.title : 'TV Shows'}
            </h1>
            {!selectedShow && (
              <p className="text-muted-foreground mt-1">
                {shows.length} show{shows.length !== 1 ? 's' : ''} in your library
              </p>
            )}
          </div>
        </div>

        {/* Show Detail View */}
        <AnimatePresence mode="wait">
          {selectedShow ? (
            <motion.div
              key="detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Left: Show Info */}
                <div className="lg:w-64 flex-shrink-0">
                  <div className="sticky top-24">
                    <img
                      src={selectedShow.poster}
                      alt={selectedShow.title}
                      className="w-full aspect-[2/3] object-cover rounded-xl shadow-2xl mb-4"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <button
                      onClick={() => navigate(`/player/${selectedShow.id}`)}
                      className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/80 text-white py-2.5 rounded-lg font-medium text-sm transition-colors mb-3"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      Play
                    </button>

                    {/* Show meta */}
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Year</span>
                        <span className="text-foreground">{selectedShow.year}</span>
                      </div>
                      {selectedShow.imdbRating !== 'N/A' && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Rating</span>
                          <span className="text-accent flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 fill-accent" />
                            {selectedShow.imdbRating}
                          </span>
                        </div>
                      )}
                      {selectedShow.rated && selectedShow.rated !== 'N/A' && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Rated</span>
                          <span className="text-foreground border border-border px-1.5 py-0.5 rounded text-xs">{selectedShow.rated}</span>
                        </div>
                      )}
                      {(() => {
                        const prog = getShowProgress(selectedShow);
                        if (!prog) return null;
                        return (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-muted-foreground">Progress</span>
                              <span className="text-foreground">{prog.watched}/{prog.total}</span>
                            </div>
                            <Progress value={prog.pct} className="h-1.5" />
                          </div>
                        );
                      })()}
                    </div>

                    <div className="flex flex-wrap gap-1 mt-3">
                      {selectedShow.genre.map(g => (
                        <span key={g} className="bg-secondary text-foreground text-xs px-2 py-0.5 rounded-full">{g}</span>
                      ))}
                    </div>

                    {selectedShow.plot && (
                      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{selectedShow.plot}</p>
                    )}
                  </div>
                </div>

                {/* Right: Episode Tracker */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-heading text-foreground mb-4">Episode Tracker</h2>
                  <EpisodeTracker
                    show={selectedShow}
                    onUpdate={eps => handleEpisodeUpdate(selectedShow, eps)}
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            /* Show Grid */
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i}>
                      <Skeleton className="aspect-[2/3] rounded-xl" />
                      <Skeleton className="h-3 mt-2 rounded" />
                    </div>
                  ))}
                </div>
              ) : shows.length === 0 ? (
                <div className="text-center py-20">
                  <Tv2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                  <p className="text-lg text-muted-foreground mb-2">No TV shows yet</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    Upload a TV show file — HomeStream will detect it as a series automatically.
                  </p>
                  <button
                    onClick={() => navigate('/library')}
                    className="bg-primary hover:bg-primary/80 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    Go to Library
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                  {shows.map(show => {
                    const prog = getShowProgress(show);
                    return (
                      <motion.div
                        key={show.id}
                        whileHover={{ scale: 1.03 }}
                        transition={{ duration: 0.15 }}
                        className="cursor-pointer group"
                        onClick={() => setSelectedShow(show)}
                      >
                        <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-card shadow-lg">
                          <img
                            src={show.poster}
                            alt={show.title}
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = `https://via.placeholder.com/300x450/141420/e50914?text=${encodeURIComponent(show.title)}`; }}
                          />
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="text-center">
                              <Tv2 className="w-8 h-8 text-white mx-auto mb-1" />
                              <p className="text-white text-xs font-medium">Track Episodes</p>
                            </div>
                          </div>
                          {/* Progress bar at bottom */}
                          {prog && prog.total > 0 && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${prog.pct}%` }}
                              />
                            </div>
                          )}
                          {/* Watched badge */}
                          {prog && prog.watched === prog.total && prog.total > 0 && (
                            <div className="absolute top-2 right-2 bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                              ✓ Done
                            </div>
                          )}
                        </div>
                        <div className="mt-2">
                          <p className="text-sm font-medium text-foreground truncate">{show.title}</p>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">{show.year}</p>
                            {prog ? (
                              <p className="text-xs text-muted-foreground">{prog.watched}/{prog.total} ep</p>
                            ) : (
                              <p className="text-xs text-muted-foreground">No episodes</p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
