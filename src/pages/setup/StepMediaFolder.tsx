/**
 * Setup Step 2 — Media Folder
 * Set the media directory, download quality, and auto-import preferences.
 */
import { useState } from 'react';
import { HardDrive, FolderOpen, ChevronLeft, ChevronRight, Loader2, Info } from 'lucide-react';
import type { SetupStepProps } from './types';
import { apiPost } from './types';
import { getIsLinux } from './platformUtils';
import FolderBrowser from './FolderBrowser';

export default function StepMediaFolder({
  form, set, status, setStatus, onNext, onBack,
  platformDefaultsReady, availableDrives, serverPlatform,
  isElectron,
}: SetupStepProps) {
  const isLinux = getIsLinux(serverPlatform);
  const [showBrowser, setShowBrowser] = useState(false);

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

  const switchDrive = (drive: string) => {
    const current = form.mediaDir;
    const withoutDrive = current.replace(/^[A-Za-z]:[/\\]?/, '');
    const folder = withoutDrive || 'HomeStream';
    set('mediaDir', drive + folder);
  };

  const currentDrive = form.mediaDir.match(/^([A-Za-z]:\\)/)?.[1]?.toUpperCase() ?? '';

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <HardDrive className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-xl font-heading font-bold text-foreground">Media Folder</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Where are your video files? HomeStream will watch this folder and build your library from it.
        </p>
      </div>

      {/* Drive selector — Windows only, multiple drives */}
      {availableDrives.length > 1 && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">Drive</label>
          <div className="flex gap-2 flex-wrap">
            {availableDrives.map(drive => (
              <button
                key={drive}
                onClick={() => switchDrive(drive)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors ${
                  currentDrive === drive.toUpperCase().replace(/\\/g, '\\')
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {drive}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Path input */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Path to your media folder</label>
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={form.mediaDir}
              onChange={e => set('mediaDir', e.target.value)}
              placeholder={isLinux ? '/home/you/Videos/HomeStream' : 'D:\\HomeStream'}
              className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono transition-colors"
            />
          </div>
          {/* Browse button */}
          <button
            type="button"
            onClick={() => setShowBrowser(v => !v)}
            title="Browse filesystem"
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-colors flex-shrink-0 ${
              showBrowser
                ? 'bg-primary border-primary text-primary-foreground'
                : 'bg-background border-border text-muted-foreground hover:border-primary/60 hover:text-foreground'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Browse</span>
          </button>
        </div>

        {/* Inline folder browser */}
        {showBrowser && (
          <div className="mt-2">
            <FolderBrowser
              initialPath={form.mediaDir || (isLinux ? '/home' : 'C:\\')}
              isElectron={!!isElectron}
              onSelect={p => {
                set('mediaDir', p);
                setShowBrowser(false);
              }}
              onClose={() => setShowBrowser(false)}
            />
          </div>
        )}

        <div className="flex items-start gap-1.5 mt-2">
          <Info className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            HomeStream creates two subfolders here automatically:{' '}
            <code className="bg-muted px-1 rounded">downloads/</code> for new files and{' '}
            <code className="bg-muted px-1 rounded">library/</code> for your transcoded library.
            {isLinux ? ' Tilde (~) expansion is supported.' : ' Forward slashes and backslashes both work.'}
          </p>
        </div>
      </div>

      {/* Quality */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">Preferred download quality</label>
        <div className="grid grid-cols-4 gap-2">
          {(['720p', '1080p', '4k', 'best'] as const).map(q => (
            <button
              key={q}
              onClick={() => set('preferredQuality', q)}
              className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                form.preferredQuality === q
                  ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                  : 'bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
              }`}
            >
              {q === 'best' ? 'Best' : q}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          1080p is the sweet spot — great quality without eating too much storage.
        </p>
      </div>

      {/* Toggles */}
      <div className="flex flex-col gap-0 rounded-xl border border-border overflow-hidden">
        {[
          {
            key: 'watchFolderEnabled' as const,
            label: 'Auto-import new files',
            desc: 'Automatically add files dropped into your downloads folder',
          },
          {
            key: 'autoTranscode' as const,
            label: 'Auto-transcode to H.264',
            desc: 'Ensures every file plays in any browser without plugins',
          },
        ].map((item, i) => (
          <label
            key={item.key}
            className={`flex items-center justify-between gap-4 px-4 py-3.5 cursor-pointer hover:bg-muted/30 transition-colors ${i > 0 ? 'border-t border-border' : ''}`}
          >
            <div>
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
            </div>
            <button
              onClick={() => set(item.key, !form[item.key])}
              className={`relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 focus:outline-none ${form[item.key] ? 'bg-primary' : 'bg-muted'}`}
              style={{ height: '22px', width: '40px' }}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${form[item.key] ? 'translate-x-[18px]' : 'translate-x-0'}`}
              />
            </button>
          </label>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex-1 flex flex-col gap-1.5">
          {status.mediaDir === 'error' && (
            <p className="text-[11px] text-destructive text-center">Could not save — check the path and try again.</p>
          )}
          <button
            onClick={saveMediaDir}
            disabled={!form.mediaDir || status.mediaDir === 'saving' || !platformDefaultsReady}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {!platformDefaultsReady ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Loading defaults…</>
            ) : status.mediaDir === 'saving' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : (
              <>Save &amp; Continue <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
