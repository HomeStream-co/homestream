/**
 * SettingsDownloads — Download quality preference.
 */
import { useEffect, useState, useCallback } from 'react';
import { Download, Check, Loader2 } from 'lucide-react';
import { SectionHeader } from './shared';

type Quality = '720p' | '1080p' | '4k' | 'best';

const QUALITY_OPTIONS: { value: Quality; label: string; hint: string }[] = [
  { value: '720p',  label: '720p',  hint: 'Smaller files, good for slow drives' },
  { value: '1080p', label: '1080p', hint: 'Recommended — great quality, reasonable size' },
  { value: '4k',    label: '4K',    hint: 'Best picture, very large files' },
  { value: 'best',  label: 'Best',  hint: 'Highest seeds regardless of resolution' },
];

export default function SettingsDownloads() {
  const [quality, setQuality] = useState<Quality>('1080p');
  const [loaded, setLoaded]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

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
      // non-fatal
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
    </div>
  );
}
