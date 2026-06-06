/**
 * Setup Step 0 — System Requirements
 * Clean checklist — shows what's bundled vs what the user needs to provide.
 * FFmpeg status is live from the server; everything else is static info.
 */
import { useState, useEffect } from 'react';
import {
  CheckCircle2, ChevronRight, Film, Cpu, HardDrive,
  Download, AlertTriangle, ExternalLink, Loader2, Wifi,
} from 'lucide-react';
import type { SetupStepProps } from './types';
import { getIsLinux } from './platformUtils';

interface FfmpegStatus {
  available: boolean;
  version: string;
}

export default function StepSysReqs({ onNext, serverPlatform }: SetupStepProps) {
  const isLinux = getIsLinux(serverPlatform);
  const [ffmpeg, setFfmpeg] = useState<FfmpegStatus | null>(null);

  useEffect(() => {
    fetch('/api/setup', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { ffmpeg?: FfmpegStatus }) => setFfmpeg(d.ffmpeg ?? null))
      .catch(() => setFfmpeg(null));
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="text-center pb-1">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
          <Film className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Welcome to HomeStream</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Let's get you set up in about 2 minutes. Here's what you need before we start.
        </p>
      </div>

      {/* Bundled — no action needed */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Already included — nothing to install</p>
        <div className="flex flex-col gap-2">
          {/* FFmpeg — live status */}
          <div className={`flex items-center gap-3 p-3 rounded-xl border ${ffmpeg?.available ? 'border-green-500/25 bg-green-500/5' : 'border-border bg-muted/20'}`}>
            <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <Film className="w-4 h-4 text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">FFmpeg</p>
              <p className="text-[11px] text-muted-foreground">Video transcoding &amp; HLS streaming</p>
            </div>
            {ffmpeg === null ? (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
            ) : ffmpeg.available ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-[10px] text-green-400 font-mono">{ffmpeg.version || 'ready'}</span>
              </div>
            ) : (
              <span className="text-[10px] text-destructive font-semibold flex-shrink-0">NOT FOUND</span>
            )}
          </div>

          {/* Node.js */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-green-500/25 bg-green-500/5">
            <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <Cpu className="w-4 h-4 text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Node.js runtime</p>
              <p className="text-[11px] text-muted-foreground">
                {isLinux ? 'Uses your system Node.js (installed by setup script)' : 'Bundled inside the installer — no separate install needed'}
              </p>
            </div>
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          </div>
        </div>
      </div>

      {/* You provide */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">You provide</p>
        <div className="flex flex-col gap-2">
          {/* Media folder */}
          <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/20">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <HardDrive className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">A folder of video files</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                Any folder with <code className="bg-background/60 px-1 rounded">.mp4</code>, <code className="bg-background/60 px-1 rounded">.mkv</code>, or <code className="bg-background/60 px-1 rounded">.avi</code> files.
                HomeStream reads in-place — nothing is moved or copied.
              </p>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {(isLinux
                  ? ['/home/you/Videos', '/mnt/media', '/data/movies']
                  : ['C:\\Users\\You\\Videos', 'D:\\Media', 'E:\\RAID\\movies']
                ).map(p => (
                  <code key={p} className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 font-mono text-muted-foreground">{p}</code>
                ))}
              </div>
            </div>
          </div>

          {/* qBittorrent */}
          <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-500/25 bg-amber-500/5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Download className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold text-foreground">qBittorrent</p>
                <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">For downloading only</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Required if you want to download movies &amp; shows. Must be running with Web UI enabled on port 8080.
                {!isLinux && (
                  <> <a href="https://www.qbittorrent.org/download" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">Download <ExternalLink className="w-2.5 h-2.5" /></a></>
                )}
              </p>
              <div className="mt-2 flex items-start gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-amber-300">qBittorrent must be open whenever you want to download. You can skip this if you already have media files.</p>
              </div>
            </div>
          </div>

          {/* Internet (optional) */}
          <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/20">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Wifi className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Internet connection <span className="text-[10px] font-normal text-muted-foreground">(optional)</span></p>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                Only needed for movie posters, ratings, and AI features. Playback works 100% offline on your local network.
              </p>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onNext}
        className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-3 rounded-xl font-semibold transition-colors mt-1"
      >
        Got it — let's set up <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
