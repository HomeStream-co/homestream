/**
 * Setup Step 0 — System Requirements
 * Informs the user of OS, hardware, and software prerequisites.
 * Written for the Electron .exe installer — no Node.js install required.
 */
import {
  HardDrive, Wifi, CheckCircle2, ChevronRight,
  Film, Monitor, Cpu, MemoryStick, Folder, Info,
  Download, AlertTriangle, ExternalLink,
} from 'lucide-react';
import type { SetupStepProps } from './types';

export default function StepSysReqs({ onNext }: SetupStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Monitor className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Before You Begin</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Make sure your PC meets these requirements so HomeStream runs without issues.
        </p>
      </div>

      {/* Hardware requirements */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Minimum Hardware</p>
        <div className="flex flex-col gap-2">
          {[
            { icon: Cpu, label: 'CPU', req: '2-core processor (4-core recommended for transcoding)' },
            { icon: MemoryStick, label: 'RAM', req: '2 GB free RAM (4 GB recommended)' },
            { icon: HardDrive, label: 'Disk', req: 'Space for your media library + ~500 MB for the app' },
            { icon: Wifi, label: 'Network', req: 'Local network connection — no internet required for playback' },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30 border border-border">
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <item.icon className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{item.label}</p>
                <p className="text-[11px] text-muted-foreground leading-snug">{item.req}</p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            </div>
          ))}
        </div>
      </div>

      {/* What's already included */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">What&apos;s Already Included</p>
        <div className="flex flex-col gap-2">

          {/* Node.js — bundled */}
          <div className="p-3 rounded-xl border border-green-500/20 bg-green-500/5">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <p className="text-sm font-semibold text-foreground">Node.js runtime</p>
              <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold">BUNDLED — NO INSTALL NEEDED</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              HomeStream ships its own Node.js runtime inside the installer. You do <strong className="text-foreground/70">not</strong> need to install Node.js separately — just run the <code className="bg-background/60 px-1 rounded">.exe</code> and you&apos;re done.
            </p>
          </div>

          {/* FFmpeg — bundled */}
          <div className="p-3 rounded-xl border border-green-500/20 bg-green-500/5">
            <div className="flex items-center gap-2 mb-1">
              <Film className="w-4 h-4 text-green-400" />
              <p className="text-sm font-semibold text-foreground">FFmpeg (video transcoding)</p>
              <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold">BUNDLED — NO INSTALL NEEDED</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              FFmpeg is included with HomeStream. You do <strong className="text-foreground/70">not</strong> need to install it manually — it works out of the box for HLS streaming and transcoding.
            </p>
          </div>

          {/* Media folder */}
          <div className="p-3 rounded-xl border border-border bg-muted/20">
            <div className="flex items-center gap-2 mb-1">
              <Folder className="w-4 h-4 text-yellow-400" />
              <p className="text-sm font-semibold text-foreground">A folder of video files</p>
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">YOU PROVIDE THIS</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Have a folder ready with your <code className="bg-background/60 px-1 rounded">.mp4</code>, <code className="bg-background/60 px-1 rounded">.mkv</code>, <code className="bg-background/60 px-1 rounded">.avi</code>, or other video files. HomeStream reads from it in-place — nothing is moved or copied.
            </p>
            <div className="mt-2 text-[10px] text-muted-foreground">
              <p className="font-medium text-foreground/60 mb-0.5">Example paths:</p>
              <div className="flex flex-col gap-0.5">
                <code className="bg-background border border-border rounded px-1.5 py-0.5 font-mono">C:\Users\You\Videos\Movies</code>
                <code className="bg-background border border-border rounded px-1.5 py-0.5 font-mono">D:\Media\Library</code>
                <code className="bg-background border border-border rounded px-1.5 py-0.5 font-mono">E:\RAID\movies</code>
              </div>
            </div>
          </div>

          {/* qBittorrent — required for downloading */}
          <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
            <div className="flex items-center gap-2 mb-1">
              <Download className="w-4 h-4 text-amber-400" />
              <p className="text-sm font-semibold text-foreground">qBittorrent</p>
              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-bold">REQUIRED FOR DOWNLOADING</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
              HomeStream uses qBittorrent to download movies and TV shows. It must be installed, running, and have its Web UI enabled — otherwise the Download button won't work.
            </p>

            <div className="flex flex-col gap-1.5 mb-2">
              <p className="text-[10px] font-semibold text-foreground/70 uppercase tracking-wider">Setup checklist:</p>
              {[
                'Download & install qBittorrent from qbittorrent.org',
                'Open qBittorrent — keep it running in the background',
                'Go to Tools → Options → Web UI → check "Enable Web UI"',
                'Set a username and password (you\'ll enter them in the next step)',
                'Default port is 8080 — leave it unless you changed it',
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-[11px] text-muted-foreground leading-snug">{step}</p>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-amber-300 leading-snug">
                <strong>qBittorrent must be open every time you want to download.</strong> If it's closed, downloads will fail with a "service unavailable" error. You can minimize it to the system tray — it doesn't need to be in focus.
              </p>
            </div>

            <a
              href="https://www.qbittorrent.org/download"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1.5 text-[11px] text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Download qBittorrent — qbittorrent.org
            </a>
          </div>
        </div>
      </div>

      {/* Windows path tip */}
      <div className="flex items-start gap-2.5 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          <p className="font-semibold text-blue-400 mb-0.5">Path tip</p>
          You can use forward slashes or backslashes — HomeStream accepts both:
          <code className="block bg-background/60 border border-border/50 rounded px-2 py-1 mt-1 font-mono">C:/Users/You/Videos  or  C:\Users\You\Videos</code>
        </div>
      </div>

      <button
        onClick={onNext}
        className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-3 rounded-xl font-semibold transition-colors"
      >
        My PC is ready — Let&apos;s go <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
