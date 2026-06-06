/**
 * SettingsProwlarr — Prowlarr indexer integration settings.
 *
 * Lets the user enter their Prowlarr URL + API key, test the connection,
 * and save. When configured, Prowlarr results are merged into every
 * stream/download search alongside Torrentio.
 */
import { useState, useEffect } from 'react';
import { Search, CheckCircle2, XCircle, Loader2, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { SectionHeader } from './shared';

interface SettingsProwlarrProps {
  /** Called after a successful save so parent can show a toast */
  onSaved?: () => void;
}

type TestState = 'idle' | 'testing' | 'ok' | 'error';

export default function SettingsProwlarr({ onSaved }: SettingsProwlarrProps) {
  const [prowlarrUrl, setProwlarrUrl]       = useState('');
  const [prowlarrApiKey, setProwlarrApiKey] = useState('');
  const [showKey, setShowKey]               = useState(false);
  const [loaded, setLoaded]                 = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [saved, setSaved]                   = useState(false);
  const [testState, setTestState]           = useState<TestState>('idle');
  const [testMsg, setTestMsg]               = useState('');
  const [isConfigured, setIsConfigured]     = useState(false);

  // Load current config on mount
  useEffect(() => {
    if (loaded) return;
    fetch('/api/setup', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { config?: { prowlarrUrl?: string; prowlarrApiKey?: string } }) => {
        if (data.config) {
          setProwlarrUrl(data.config.prowlarrUrl ?? '');
          setIsConfigured(!!(data.config.prowlarrUrl && data.config.prowlarrApiKey));
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [loaded]);

  const testConnection = async () => {
    const url = prowlarrUrl.trim();
    const key  = prowlarrApiKey.trim();
    if (!url || !key) {
      setTestState('error');
      setTestMsg('Enter both URL and API key first');
      return;
    }
    setTestState('testing');
    setTestMsg('');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_prowlarr', prowlarrUrl: url, prowlarrApiKey: key }),
      });
      const data = await res.json() as { ok: boolean; version?: string; indexers?: number; error?: string };
      if (data.ok) {
        setTestState('ok');
        const parts = [];
        if (data.version) parts.push(`v${data.version}`);
        if (data.indexers != null) parts.push(`${data.indexers} indexer${data.indexers !== 1 ? 's' : ''}`);
        setTestMsg(parts.length ? `Connected — ${parts.join(', ')}` : 'Connected');
      } else {
        setTestState('error');
        setTestMsg(data.error ?? 'Connection failed');
      }
    } catch {
      setTestState('error');
      setTestMsg('Cannot reach Prowlarr — is it running?');
    }
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          prowlarrUrl: prowlarrUrl.trim(),
          prowlarrApiKey: prowlarrApiKey.trim() || undefined,
        }),
      });
      setSaved(true);
      setIsConfigured(!!(prowlarrUrl.trim() && prowlarrApiKey.trim()));
      setTimeout(() => setSaved(false), 3000);
      onSaved?.();
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setProwlarrUrl('');
    setProwlarrApiKey('');
    setTestState('idle');
    setTestMsg('');
    setSaving(true);
    try {
      await fetch('/api/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', prowlarrUrl: '', prowlarrApiKey: '' }),
      });
      setIsConfigured(false);
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-border/50">
      <SectionHeader icon={Search} label="Prowlarr Indexers" />
      <div className="px-4 pb-4 flex flex-col gap-3">

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Connect Prowlarr to search your private indexers alongside Torrentio.
          Results are merged and deduplicated automatically.
        </p>

        {isConfigured && testState === 'idle' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <p className="text-[11px] text-green-300">Prowlarr configured — active on all searches</p>
          </div>
        )}
        {!isConfigured && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <p className="text-[11px] text-muted-foreground">Not configured — only Torrentio will be used</p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Prowlarr URL
          </label>
          <input
            type="url"
            value={prowlarrUrl}
            onChange={e => { setProwlarrUrl(e.target.value); setTestState('idle'); }}
            placeholder="http://localhost:9696"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={prowlarrApiKey}
              onChange={e => { setProwlarrApiKey(e.target.value); setTestState('idle'); }}
              placeholder={isConfigured ? '••••••••  (saved — enter new key to change)' : 'Paste your Prowlarr API key'}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-9 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Find it in Prowlarr → Settings → General → API Key
          </p>
        </div>

        {testState !== 'idle' && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] ${
            testState === 'ok'
              ? 'bg-green-500/10 border border-green-500/20 text-green-300'
              : testState === 'error'
                ? 'bg-destructive/10 border border-destructive/20 text-destructive'
                : 'bg-muted/40 border border-border text-muted-foreground'
          }`}>
            {testState === 'testing' && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
            {testState === 'ok'      && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
            {testState === 'error'   && <XCircle className="w-3.5 h-3.5 shrink-0" />}
            {testState === 'testing' ? 'Testing connection…' : testMsg}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={testConnection}
            disabled={testState === 'testing' || (!prowlarrUrl.trim() && !isConfigured)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40"
          >
            {testState === 'testing'
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Testing…</>
              : <><Search className="w-3.5 h-3.5" />Test Connection</>
            }
          </button>

          <button
            onClick={save}
            disabled={saving || (!prowlarrUrl.trim() && !prowlarrApiKey.trim())}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary hover:bg-primary/85 text-primary-foreground text-xs font-semibold transition-colors disabled:opacity-40"
          >
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
              : saved
                ? <><CheckCircle2 className="w-3.5 h-3.5" />Saved!</>
                : 'Save'
            }
          </button>
        </div>

        <div className="flex items-center justify-between">
          {isConfigured && (
            <button
              onClick={clear}
              className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              Clear Prowlarr config
            </button>
          )}
          <a
            href="https://wiki.servarr.com/prowlarr"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Prowlarr docs
          </a>
        </div>
      </div>
    </div>
  );
}
