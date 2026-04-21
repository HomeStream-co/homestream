/**
 * Setup Step 2 — Media Folder
 * Set the media directory, download quality, and auto-import preferences.
 */
import { HardDrive, FolderOpen, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { SetupStepProps } from './types';
import { apiPost } from './types';

export default function StepMediaFolder({ form, set, status, setStatus, onNext, onBack }: SetupStepProps) {
  const saveMediaDir = async () => {
    setStatus(s => ({ ...s, mediaDir: 'saving' }));
    try {
      await apiPost('save', {
        mediaDir: form.mediaDir,
        watchFolderEnabled: String(form.watchFolderEnabled),
        autoTranscode: String(form.autoTranscode),
        preferredQuality: form.preferredQuality,
      });
      setStatus(s => ({ ...s, mediaDir: 'done' }));
      onNext();
    } catch {
      setStatus(s => ({ ...s, mediaDir: 'error' }));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <HardDrive className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-heading font-bold text-foreground">Media Folder</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Where should HomeStream store your media? On a RAID array, use your mount point.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Media directory path</label>
          <div className="relative">
            <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={form.mediaDir}
              onChange={e => set('mediaDir', e.target.value)}
              placeholder="/media"
              className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            HomeStream will create: <code className="bg-muted px-1 rounded">{form.mediaDir}/downloads</code> and <code className="bg-muted px-1 rounded">{form.mediaDir}/library</code>
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Preferred download quality</label>
          <div className="grid grid-cols-4 gap-2">
            {(['720p', '1080p', '4k', 'best'] as const).map(q => (
              <button
                key={q}
                onClick={() => set('preferredQuality', q)}
                className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${form.preferredQuality === q ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-border text-muted-foreground hover:border-primary/50'}`}
              >
                {q === 'best' ? 'Best' : q}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">1080p recommended — great quality, reasonable storage use</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium text-foreground">Auto-import from downloads folder</p>
              <p className="text-xs text-muted-foreground">Watch for new files and add them automatically</p>
            </div>
            <button
              onClick={() => set('watchFolderEnabled', !form.watchFolderEnabled)}
              className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 focus:outline-none ${form.watchFolderEnabled ? 'bg-primary' : 'bg-muted'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${form.watchFolderEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium text-foreground">Auto-transcode to H.264</p>
              <p className="text-xs text-muted-foreground">Ensures all files play in any browser</p>
            </div>
            <button
              onClick={() => set('autoTranscode', !form.autoTranscode)}
              className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 focus:outline-none ${form.autoTranscode ? 'bg-primary' : 'bg-muted'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${form.autoTranscode ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </label>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" />Back
        </button>
        <button
          onClick={saveMediaDir}
          disabled={!form.mediaDir || status.mediaDir === 'saving'}
          className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60"
        >
          {status.mediaDir === 'saving'
            ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
            : <>Save &amp; Continue <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}
