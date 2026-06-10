/**
 * SettingsDownloads — Download quality preference.
 *
 * Lets the user change their preferred torrent quality without re-running
 * the setup wizard.  Reads/writes `preferredQuality` via POST /api/setup.
 */
import { useEffect, useState, useCallback } from 'react';
import { Download, Check, Loader2, RefreshCw, XCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
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

  // qBittorrent settings
  const [qbitUrl, setQbitUrl] = useState('');
  const [qbitApiKey, setQbitApiKey] = useState('');
  const [qbitUsername, setQbitUsername] = useState('');
  const [qbitPassword, setQbitPassword] = useState('');
  const [showQbitPass, setShowQbitPass] = useState(false);
  const [qbitTest, setQbitTest] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [qbitTestMsg, setQbitTestMsg] = useState('');


  // Load current value from server
  useEffect(() => {
    fetch('/api/setup', { credentials: 'include' })
      .then(r => r.json())
      .then((data: any) => {
        if (data.preferredQuality) setQuality(data.preferredQuality);
        if (data.qbitUrl) setQbitUrl(data.qbitUrl);
        if (data.qbitUsername) setQbitUsername(data.qbitUsername);
        if (data.hasQbitApiKey) setQbitApiKey('••••••••');
        if (data.hasQbitPassword) setQbitPassword('••••••••');
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

  const testQbit = async () => {
    if (!qbitUrl) return;
    setQbitTest('testing');
    try {
      const r = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'test_qbit', 
          qbitUrl, 
          qbitApiKey: qbitApiKey === '••••••••' ? undefined : qbitApiKey,
          qbitUsername, 
          qbitPassword: qbitPassword === '••••••••' ? undefined : qbitPassword 
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setQbitTest('ok');
        setQbitTestMsg(`v${d.version}`);
      } else {
        setQbitTest('error');
        setQbitTestMsg(d.error || 'Failed to connect');
      }
    } catch {
      setQbitTest('error');
      setQbitTestMsg('Network error');
    }
  };

  const handleSaveQbit = async () => {
    setSaving(true);
    try {
      await fetch('/api/setup', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          qbitUrl,
          qbitApiKey: qbitApiKey === '••••••••' ? undefined : qbitApiKey,
          qbitUsername,
          qbitPassword: qbitPassword === '••••••••' ? undefined : qbitPassword
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      // ignore
    }
    finally { setSaving(true); setSaving(false); }
  };

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

      <div className="border-t border-border/50 px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-foreground leading-tight">qBittorrent Connection</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Configure how HomeStream connects to qBittorrent</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={testQbit} disabled={!qbitUrl || qbitTest === 'testing'}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40">
              {qbitTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Test
            </button>
            <button onClick={handleSaveQbit} disabled={saving}
              className="flex items-center justify-center px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium transition-colors disabled:opacity-40">
              Save
            </button>
          </div>
        </div>
        
        {qbitTest !== 'idle' && (
          <div className={`mb-3 p-2 rounded-lg text-xs flex items-center gap-2 ${qbitTest === 'ok' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
            {qbitTest === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {qbitTestMsg}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Web UI URL</label>
            <input type="text" value={qbitUrl} onChange={e => { setQbitUrl(e.target.value); setQbitTest('idle'); }}
              placeholder="http://localhost:8080"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">API Key <span className="text-muted-foreground/60">(v5.2.0+)</span></label>
            <input type="text" value={qbitApiKey} onChange={e => { setQbitApiKey(e.target.value); setQbitTest('idle'); }}
              placeholder="qbt_..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Username <span className="text-muted-foreground/60">(Legacy)</span></label>
            <input type="text" value={qbitUsername} onChange={e => { setQbitUsername(e.target.value); setQbitTest('idle'); }}
              placeholder="admin"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Password <span className="text-muted-foreground/60">(Legacy)</span></label>
            <div className="relative">
              <input type={showQbitPass ? 'text' : 'password'} value={qbitPassword} onChange={e => { setQbitPassword(e.target.value); setQbitTest('idle'); }}
                placeholder="••••••••"
                className="w-full bg-background border border-border rounded-lg px-3 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
              <button onClick={() => setShowQbitPass(!showQbitPass)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showQbitPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
