/**
 * PlayerPage — full-screen video player route.
 *
 * The player sub-components (PlayerControlsOverlay, PlayerEndOverlay, etc.)
 * are tightly coupled and manage their own internal state via refs and
 * callbacks. This page acts as the host: it resolves the media item from the
 * library, renders the player shell, and wires progress reporting back to
 * MediaContext.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import { useMedia } from '@/context/MediaContext';
import PlayerBelowFold from '@/components/player/PlayerBelowFold';

// ── Inline minimal player ─────────────────────────────────────────────────────
// The full PlayerControlsOverlay requires a large set of internal state props
// that are managed by the (not-yet-built) usePlayerState hook. Until that hook
// ships, we render a clean native <video> player with progress reporting so the
// page is fully functional. The overlay will be swapped in when the hook lands.

function NativePlayer({
  streamUrl,
  hlsUrl,
  initialTime,
  onProgress,
  onEnded,
}: {
  streamUrl: string;
  hlsUrl: string;
  initialTime: number;
  onProgress: (pct: number, currentTime: number, duration: number) => void;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reportedRef = useRef(0);

  // Try HLS first, fall back to direct stream
  const [src, setSrc] = useState(hlsUrl);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (initialTime > 0) video.currentTime = initialTime;
  }, [initialTime]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const pct = Math.round((video.currentTime / video.duration) * 100);
    if (Math.abs(pct - reportedRef.current) >= 2) {
      reportedRef.current = pct;
      onProgress(pct, video.currentTime, video.duration);
    }
  }, [onProgress]);

  const handleError = useCallback(() => {
    if (src === hlsUrl) {
      setSrc(streamUrl);
    } else {
      setError('Could not load video. Check that the file is accessible on the server.');
    }
    setLoading(false);
  }, [src, hlsUrl, streamUrl]);

  return (
    <div className="relative w-full h-full bg-black">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 text-white/70">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <p className="text-sm text-center max-w-xs">{error}</p>
        </div>
      )}
      <video
        ref={videoRef}
        src={src}
        controls
        autoPlay
        className="w-full h-full"
        onLoadedData={() => setLoading(false)}
        onTimeUpdate={handleTimeUpdate}
        onEnded={onEnded}
        onError={handleError}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { library, loading, updateProgress, triggerPostWatchRecommendation } = useMedia();

  const item = library.find(m => m.id === id);

  useEffect(() => {
    if (!loading && !item && id) {
      const t = setTimeout(() => navigate('/library'), 2000);
      return () => clearTimeout(t);
    }
  }, [loading, item, id, navigate]);

  if (loading && !library.length) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black gap-4">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-sm text-white/50">Title not found — redirecting…</p>
        <button onClick={() => navigate('/library')} className="text-primary text-sm hover:underline">Go to Library</button>
      </div>
    );
  }

  const streamUrl = `/api/stream/${item.id}`;
  const hlsUrl = `/api/hls/${item.id}/index.m3u8`;
  const initialTime = item.watchedSeconds ?? 0;

  const handleProgress = (pct: number, currentTime: number, duration: number) => {
    updateProgress(item.id, pct, currentTime, duration);
    if (pct >= 95) triggerPostWatchRecommendation(item.id);
  };

  const handleEnded = () => {
    triggerPostWatchRecommendation(item.id);
  };

  return (
    <>
      <Helmet>
        <title>{item.title} — HomeStream</title>
        <meta name="description" content={item.plot} />
      </Helmet>

      <div className="min-h-screen bg-black flex flex-col">
        {/* Back button */}
        <div className="absolute top-4 left-4 z-30">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/50 hover:bg-black/70 text-white text-sm transition-all border border-white/10"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        {/* Video */}
        <div className="relative w-full bg-black" style={{ aspectRatio: '16/9', maxHeight: '80vh' }}>
          <NativePlayer
            streamUrl={streamUrl}
            hlsUrl={hlsUrl}
            initialTime={initialTime}
            onProgress={handleProgress}
            onEnded={handleEnded}
          />
        </div>

        {/* Below fold — info, related, episodes */}
        <div className="flex-1">
          <PlayerBelowFold
            item={item}
            similarItems={library.filter(m => m.id !== item.id && m.genre.some(g => item.genre.includes(g))).slice(0, 10)}
            continueWatching={[]}
            enrichRunning={false}
            enrichError={null}
            runEnrichment={() => {}}
          />
        </div>
      </div>
    </>
  );
}
