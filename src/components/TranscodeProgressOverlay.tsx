/**
 * TranscodeProgressOverlay
 *
 * Shown inside the video player when a transcode job is active.
 * Replaces the generic spinner with real FFmpeg progress data:
 *   - Animated progress bar (0–100%)
 *   - Status label (Queued / Transcoding / Done / Error)
 *   - Live stats: FPS, encode speed, ETA
 *   - Error message if FFmpeg failed
 */
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, AlertCircle, Zap, Clock, Film } from 'lucide-react';
import type { TranscodeProgress } from '@/hooks/useTranscodeProgress';

interface Props {
  job: TranscodeProgress;
}

function formatEta(secs: number): string {
  if (secs <= 0) return '—';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function TranscodeProgressOverlay({ job }: Props) {
  const isQueued     = job.status === 'queued';
  const isActive     = job.status === 'transcoding';
  const isDone       = job.status === 'done';
  const isError      = job.status === 'error';
  const isSkipped    = job.status === 'skipped';

  // Don't render for terminal-success states — player takes over
  if (isDone || isSkipped) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="transcode-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm z-20 px-8"
      >
        {/* ── Error state ── */}
        {isError && (
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-lg mb-1">Transcode Failed</p>
              <p className="text-white/60 text-sm leading-relaxed">
                {job.error ?? 'FFmpeg encountered an error. Check that FFmpeg is installed on your server.'}
              </p>
            </div>
          </div>
        )}

        {/* ── Queued / Transcoding state ── */}
        {(isQueued || isActive) && (
          <div className="flex flex-col items-center gap-6 w-full max-w-xs">

            {/* Icon */}
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                {isQueued
                  ? <Clock className="w-7 h-7 text-primary/70" />
                  : <Film className="w-7 h-7 text-primary" />
                }
              </div>
              {isActive && (
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </div>

            {/* Label */}
            <div className="text-center">
              <p className="text-white font-semibold text-base mb-1">
                {isQueued ? 'Preparing…' : 'Transcoding'}
              </p>
              <p className="text-white/50 text-xs">
                {isQueued
                  ? 'Your video is queued for processing'
                  : 'Converting to browser-compatible format'}
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/60 text-xs">Progress</span>
                <span className="text-white font-mono text-xs font-semibold">
                  {isQueued ? '—' : `${job.progress}%`}
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: isQueued ? '0%' : `${job.progress}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
            </div>

            {/* Live stats row */}
            {isActive && (job.fps || job.speed || job.eta) && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 text-xs text-white/50"
              >
                {job.fps != null && job.fps > 0 && (
                  <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-primary/60" />
                    <span>{job.fps.toFixed(0)} fps</span>
                  </div>
                )}
                {job.speed && job.speed !== '?x' && (
                  <div className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 text-primary/60" />
                    <span>{job.speed}</span>
                  </div>
                )}
                {job.eta != null && job.eta > 0 && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-primary/60" />
                    <span>{formatEta(job.eta)} left</span>
                  </div>
                )}
              </motion.div>
            )}

            {/* Playback note */}
            <p className="text-white/30 text-[11px] text-center leading-relaxed">
              Playback will start automatically when ready
            </p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
