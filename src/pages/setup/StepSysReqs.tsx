/**
 * Setup Step 0 — System Requirements
 * Informs the user of OS, hardware, and software prerequisites.
 */
import {
  HardDrive, Wifi, CheckCircle2, ChevronRight,
  ExternalLink, Film, Monitor, Server, Cpu, MemoryStick, Folder, Terminal, Info,
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
          Make sure your machine meets these requirements so HomeStream runs without issues.
        </p>
      </div>

      {/* OS Support */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Supported Operating Systems</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Windows', sub: '10 / 11 (64-bit)', icon: '🪟' },
            { label: 'Linux', sub: 'Ubuntu, Debian, Arch…', icon: '🐧' },
            { label: 'macOS', sub: '12 Monterey or later', icon: '🍎' },
          ].map(os => (
            <div key={os.label} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted/40 border border-border text-center">
              <span className="text-2xl">{os.icon}</span>
              <p className="text-xs font-semibold text-foreground">{os.label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{os.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Hardware requirements */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Minimum Hardware</p>
        <div className="flex flex-col gap-2">
          {[
            { icon: Cpu, label: 'CPU', req: '2-core processor (4-core recommended for transcoding)' },
            { icon: MemoryStick, label: 'RAM', req: '2 GB free RAM (4 GB recommended)' },
            { icon: HardDrive, label: 'Disk', req: 'Space for your media library + ~500 MB for the app' },
            { icon: Wifi, label: 'Network', req: 'Local network connection (no internet required for playback)' },
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

      {/* Pre-installed software */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pre-installed Software</p>
        <div className="flex flex-col gap-2">

          {/* Node.js */}
          <div className="p-3 rounded-xl border border-border bg-muted/20">
            <div className="flex items-center gap-2 mb-1.5">
              <Server className="w-4 h-4 text-green-400" />
              <p className="text-sm font-semibold text-foreground">Node.js ≥ 22</p>
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">REQUIRED</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
              HomeStream runs on Node.js. You need version 22 or newer.
            </p>
            <div className="flex flex-col gap-1 text-[11px]">
              <p className="font-medium text-foreground/70">Check if you have it:</p>
              <code className="bg-background border border-border rounded px-2 py-1 font-mono text-foreground/80 select-all">node --version</code>
              <p className="font-medium text-foreground/70 mt-1">Install / upgrade:</p>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-14 flex-shrink-0">Windows:</span>
                  <a href="https://nodejs.org/en/download" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">nodejs.org/download <ExternalLink className="w-2.5 h-2.5" /></a>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-14 flex-shrink-0">Linux:</span>
                  <code className="bg-background border border-border rounded px-1.5 py-0.5 font-mono text-foreground/80 select-all">curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -</code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-14 flex-shrink-0">macOS:</span>
                  <code className="bg-background border border-border rounded px-1.5 py-0.5 font-mono text-foreground/80 select-all">brew install node@22</code>
                </div>
              </div>
            </div>
          </div>

          {/* FFmpeg — bundled */}
          <div className="p-3 rounded-xl border border-green-500/20 bg-green-500/5">
            <div className="flex items-center gap-2 mb-1">
              <Film className="w-4 h-4 text-green-400" />
              <p className="text-sm font-semibold text-foreground">FFmpeg</p>
              <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold">BUNDLED — NO ACTION NEEDED</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              FFmpeg is included with HomeStream via <code className="bg-background/60 px-1 rounded">ffmpeg-static</code>. You do <strong className="text-foreground/70">not</strong> need to install it manually. If you already have a system FFmpeg and prefer to use it, set the <code className="bg-background/60 px-1 rounded">FFMPEG_PATH</code> environment variable.
            </p>
          </div>

          {/* Media folder */}
          <div className="p-3 rounded-xl border border-border bg-muted/20">
            <div className="flex items-center gap-2 mb-1">
              <Folder className="w-4 h-4 text-yellow-400" />
              <p className="text-sm font-semibold text-foreground">A folder of video files</p>
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">REQUIRED</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Have a folder ready with your <code className="bg-background/60 px-1 rounded">.mp4</code>, <code className="bg-background/60 px-1 rounded">.mkv</code>, <code className="bg-background/60 px-1 rounded">.avi</code>, or other video files. HomeStream reads from it in-place — nothing is moved or copied.
            </p>
            <div className="mt-2 text-[10px] text-muted-foreground">
              <p className="font-medium text-foreground/60 mb-0.5">Example paths:</p>
              <div className="flex flex-col gap-0.5">
                <code className="bg-background border border-border rounded px-1.5 py-0.5 font-mono">Windows: C:\Users\You\Videos\Movies</code>
                <code className="bg-background border border-border rounded px-1.5 py-0.5 font-mono">Linux:   /home/you/media  or  /mnt/raid/movies</code>
                <code className="bg-background border border-border rounded px-1.5 py-0.5 font-mono">macOS:   /Users/you/Movies</code>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Windows note */}
      <div className="flex items-start gap-2.5 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          <p className="font-semibold text-blue-400 mb-0.5">Windows users</p>
          Use forward slashes or double backslashes in paths when entering them in the next step:
          <code className="block bg-background/60 border border-border/50 rounded px-2 py-1 mt-1 font-mono">C:/Users/You/Videos  or  C:\\Users\\You\\Videos</code>
        </div>
      </div>

      {/* Linux permission note */}
      <div className="flex items-start gap-2.5 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
        <Terminal className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          <p className="font-semibold text-yellow-400 mb-0.5">Linux / NAS users</p>
          Make sure the user running HomeStream has <strong className="text-foreground/70">read access</strong> to your media folder. If you see "Permission denied" errors after setup, run:
          <code className="block bg-background/60 border border-border/50 rounded px-2 py-1 mt-1 font-mono">chmod -R 755 /your/media/folder</code>
        </div>
      </div>

      {/* Docker shortcut */}
      <div className="flex items-start gap-2.5 p-3 bg-muted/30 border border-dashed border-border rounded-xl">
        <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-green-400">Using Docker?</strong> Node.js and all dependencies are already inside the container — skip straight to the next step. Just make sure your media folder is mounted as a volume.
        </p>
      </div>

      <button
        onClick={onNext}
        className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-3 rounded-xl font-semibold transition-colors"
      >
        My machine is ready — Let&apos;s go <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
