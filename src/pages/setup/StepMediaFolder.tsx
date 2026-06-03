/**
 * Setup Step 2 — Media Folder
 * Set the media directory, download quality, and auto-import preferences.
 */
import { HardDrive, FolderOpen, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { SetupStepProps } from './types';
import { apiPost } from './types';

// Detect Linux at render time (same pattern as StepSysReqs)
const isLinux = typeof navigator !== 'undefined' && /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);

export default function StepMediaFolder({ form, set, status, setStatus, onNext, onBack, platformDefaultsReady, availableDrives }: SetupStepProps) {
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

  // When user clicks a drive shortcut, replace only the drive letter in the current path
  const switchDrive = (drive: string) => {
    // drive is like "D:\" — replace the drive portion of the current path
    const current = form.mediaDir;
    // Strip existing drive letter if present (e.g. "C:\HomeStream" → "HomeStream")
    const withoutDrive = current.replace(/^[A-Za-z]:[/\\]?/, '');
    const folder = withoutDrive || 'HomeStream';
    set('mediaDir', drive + folder);
  };

  // Detect current drive from the path
  const currentDrive = form.mediaDir.match(/^([A-Za-z]:\\)/)?.[1]?.toUpperCase() ?? '';

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
        {/* Drive selector — only shown on Windows when multiple drives are detected */}
        {availableDrives.length > 1 && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Select drive</label>
            <div className="flex gap-2 flex-wrap">
              {availableDrives.map(drive => {
                const isActive = currentDrive === drive.toUpperCase().replace(/\\/g, '\\');
                return (
                  <button
                    key={drive}
                    onClick={() => switchDrive(drive)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors ${
                      isActive
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {drive}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Click a drive to switch — your folder name is preserved.
            </p>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Media directory path</label>
          <div className="relative">
            <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={form.mediaDir}
              onChange={e => set('mediaDir', e.target.value)}
              placeholder={isLinux ? '/home/you/media/HomeStream' : 'D:\\HomeStream'}
              className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            HomeStream will create subfolders here automatically.
            {isLinux
              ? ' Use an absolute path or start with ~ for your home directory.'
              : ' Both forward slashes and backslashes are accepted.'}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Subfolders:{' '}
            <code className="bg-muted px-1 rounded">{isLinux ? 'downloads/' : 'downloads\\'}</code>
            {' '}and{' '}
            <code className="bg-muted px-1 rounded">{isLinux ? 'library/' : 'library\\'}</code>
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
        <div className="flex-1 flex flex-col gap-1.5">
          {status.mediaDir === 'error' && (
            <p className="text-[11px] text-destructive text-center">Could not save folder — check the path and try again.</p>
          )}
          <button
            onClick={saveMediaDir}
            disabled={!form.mediaDir || status.mediaDir === 'saving' || !platformDefaultsReady}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {!platformDefaultsReady
              ? <><Loader2 className="w-4 h-4 animate-spin" />Loading defaults…</>
              : status.mediaDir === 'saving'
              ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
              : <>Save &amp; Continue <ChevronRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
