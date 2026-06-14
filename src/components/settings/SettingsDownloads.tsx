/**
 * SettingsDownloads — Download quality preference.
 *
 * Lets the user change their preferred torrent quality without re-running
 * the setup wizard.  Reads/writes `preferredQuality` via POST /api/setup.
 */
import { useEffect, useState, useCallback } from 'react';
import { Download, Check, Loader2, Info } from 'lucide-react';
import { SectionHeader } from './shared';

type Quality = '720p' | '1080p' | '4k' | 'best';

const QUALITY_OPTIONS: { value: Quality; label: string; hint: string }[] = [
  { value: '720p',  label: '720p',  hint: 'Smaller files, good for slow drives' },
  { value: '1080p', label: '1080p', hint: 'Recommended — great quality, reasonable size' },
  { value: '4k',    label: '4K',    hint: 'Best picture, very large files' },
  { value: 'best',  label: 'Best',  hint: 'Highest seeds regardless of resolution' },
];

export default function SettingsDownloads() {
  const [quality, setQuality]   = useState<Quality>('1080p');
  const [loaded, setLoaded]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  // Load current value from server
  useEffect(() => {
    fetch('/api/setup', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { config?: { preferredQuality?: Quality } }) => {
        if (data.config?.preferredQuality) setQuality(data.config.preferredQuality);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handleSelect = useCallback(async (q: Quality) => {
    if (q === quality || saving) return;
    setQuality(q);
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', preferredQuality: q }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // non-fatal — quality is already updated in UI
    } finally {
      setSaving(false);
    }
  }, [quality, saving]);

  return (
    <div className="border-t border-border/50">
      <SectionHeader icon={Download} label="Downloads" />
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm text-foreground leading-tight">Preferred torrent quality</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Used when auto-selecting a torrent from search results
            </p>
          </div>
          {saving && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin flex-shrink-0" />}
          {saved && !saving && <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {QUALITY_OPTIONS.map(opt => {
            const active = quality === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                disabled={!loaded || saving}
                title={opt.hint}
                className={`py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                  active
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {loaded && (
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {QUALITY_OPTIONS.find(o => o.value === quality)?.hint}
          </p>
        )}
      </div>

      {/* Auto-Seeding Instructions */}
      <div className="px-4 pb-4 border-t border-border/20 pt-3 flex flex-col gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground leading-tight">qBittorrent Auto-Seeding</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            How to stop seeding/sharing downloads automatically
          </p>
        </div>
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/30 border border-border">
          <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-[11.5px] text-muted-foreground leading-snug">
            <p className="font-semibold text-foreground/80 mb-1.5">To disable auto-seeding:</p>
            <ol className="flex flex-col gap-1 list-none pl-0">
              <li><span className="text-primary font-bold mr-1">1.</span> Open the <strong>qBittorrent</strong> application</li>
              <li><span className="text-primary font-bold mr-1">2.</span> Go to <strong>Tools → Options → BitTorrent</strong> (or Preferences on macOS)</li>
              <li><span className="text-primary font-bold mr-1">3.</span> Under <strong>Share Ratio Limit</strong>, tick the box <strong>"Limit share ratio to"</strong></li>
              <li><span className="text-primary font-bold mr-1">4.</span> Set the value to <code className="bg-background/80 px-1 py-0.5 rounded font-mono text-foreground font-bold">0</code></li>
              <li><span className="text-primary font-bold mr-1">5.</span> For <strong>"When ratio limit is reached"</strong>, select <strong>"Pause torrent"</strong> (or "Remove torrent")</li>
              <li><span className="text-primary font-bold mr-1">6.</span> Click <strong>Apply</strong> and then <strong>OK</strong></li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
