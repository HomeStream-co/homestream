import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Play, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { MediaItem as LibraryItem } from '@/types/media';

interface Props {
  mediaId: string;
  isPaused: boolean;
  playerAccent: string;
}

export default function PlayerPauseRecommendations({ mediaId, isPaused, playerAccent }: Props) {
  const navigate = useNavigate();
  const [inLibrary, setInLibrary] = useState<LibraryItem[]>([]);
  const [online, setOnline] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPaused || !mediaId) return;

    // Only fetch once per pause (or cache it)
    let mounted = true;
    const fetchRecommendations = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/recommendations/${mediaId}`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        if (mounted) {
          setInLibrary(data.inLibrary || []);
          setOnline(data.online || []);
        }
      } catch (e) {
        console.error('Failed to fetch recommendations', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchRecommendations();

    return () => {
      mounted = false;
    };
  }, [mediaId, isPaused]);

  if (!isPaused || (!loading && inLibrary.length === 0 && online.length === 0)) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="absolute bottom-24 left-0 right-0 z-40 px-8 pointer-events-none flex flex-col gap-4"
    >
      <div className="max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* In Library */}
        {inLibrary.length > 0 && (
          <div className="bg-black/60 backdrop-blur-md rounded-xl p-4 border border-white/10 pointer-events-auto">
            <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
              <Play className="w-4 h-4" /> Recommended from your Library
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {inLibrary.map((item) => (
                <div 
                  key={item.id} 
                  className="relative group cursor-pointer rounded-lg overflow-hidden aspect-[2/3] bg-white/5"
                  onClick={() => navigate(`/player/${item.id}`)}
                >
                  {item.posterPath ? (
                    <img src={item.posterPath} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-xs">
                      {item.title}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="w-8 h-8 text-white fill-white" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Online / Discover */}
        {online.length > 0 && (
          <div className="bg-black/60 backdrop-blur-md rounded-xl p-4 border border-white/10 pointer-events-auto">
            <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
              <Download className="w-4 h-4" /> More Like This (Online)
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {online.map((item) => (
                <a 
                  key={item.id} 
                  className="relative group cursor-pointer rounded-lg overflow-hidden aspect-[2/3] bg-white/5 block"
                  href={`/discover?q=${encodeURIComponent(item.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.posterPath ? (
                    <img src={item.posterPath} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-xs">
                      {item.title}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Download className="w-8 h-8 text-white" />
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

      </div>
    </motion.div>
  );
}
