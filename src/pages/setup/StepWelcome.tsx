/**
 * Setup Step 1 — Welcome
 * Overview of what HomeStream needs and what's optional.
 */
import {
  HardDrive, Wifi, KeyRound, CheckCircle2, ChevronRight, ExternalLink, Zap, Tv2,
} from 'lucide-react';
import type { SetupStepProps } from './types';

export default function StepWelcome({ onNext }: SetupStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Zap className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Welcome to HomeStream</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Let&apos;s get your self-hosted media server set up. This takes about 5 minutes.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {/* Media Folder */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <HardDrive className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">Media Folder</p>
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">REQUIRED</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">The folder where your video files live. HomeStream reads from here — nothing is moved or copied.</p>
          </div>
        </div>

        {/* qBittorrent */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Wifi className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">qBittorrent</p>
              <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full font-bold">OPTIONAL</span>
              <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold">FREE</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Adds in-app downloading. <strong className="text-foreground/70">Without it:</strong> you can still play any files already in your media folder — just no download button.</p>
          </div>
        </div>

        {/* Jellyfin */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Tv2 className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">Jellyfin</p>
              <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full font-bold">OPTIONAL</span>
              <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold">FREE</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Enables Roku, Fire TV, Apple TV, and Kodi apps via Jellyfin&apos;s API. <strong className="text-foreground/70">Without it:</strong> HomeStream&apos;s own browser UI and phone remote still work perfectly.</p>
          </div>
        </div>

        {/* API Keys */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border">
          <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <KeyRound className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">API Keys</p>
              <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full font-bold">OPTIONAL</span>
              <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold">ALL FREE</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">TMDB for movie art &amp; trending, OMDB for IMDb ratings, Google AI for recommendations. <strong className="text-foreground/70">Without them:</strong> HomeStream still plays your files — just no posters, metadata, or AI chat.</p>
          </div>
        </div>
      </div>

      {/* Minimum viable setup */}
      <div className="flex items-start gap-2.5 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
        <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-green-400">Minimum setup:</strong> Just set a media folder and you&apos;re done. HomeStream will play any video files it finds immediately — everything else is a bonus.
        </p>
      </div>

      <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Running with Docker?</strong> Check your <code className="bg-muted px-1 rounded">.env</code> file — most settings are pre-filled from environment variables.
      </div>

      <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <a href="https://github.com/homestream-app/homestream#readme" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-primary hover:underline">
          <ExternalLink className="w-3 h-3" /> Full documentation
        </a>
        <span className="text-border">·</span>
        <a href="https://github.com/homestream-app/homestream/blob/main/docker-compose.yml" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-primary hover:underline">
          <ExternalLink className="w-3 h-3" /> Docker Compose quickstart
        </a>
      </div>

      <button
        onClick={onNext}
        className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-3 rounded-xl font-semibold transition-colors"
      >
        Get Started <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
