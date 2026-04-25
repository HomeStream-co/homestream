/**
 * SettingsRealDebrid — Real-Debrid premium download backend settings.
 *
 * When an RD API key is configured, HomeStream uses Real-Debrid as the
 * preferred download backend. Torrents are resolved on RD's servers and
 * downloaded as direct HTTPS links — no qBittorrent or WebTorrent needed.
 *
 * Priority: Real-Debrid > qBittorrent > WebTorrent (fallback)
 */
import { useState, useEffect } from 'react';
import { Zap, CheckCircle2, XCircle, Loader2, Eye, EyeOff, ExternalLink, Info } from 'lucide-react';
import { SectionHeader } from './shared';

interface SettingsRealDebridProps {
  onSaved?: () => void;
}

type TestState = 'idle' | 'testing' | 'ok' | 'error';

interface RDUser {
  username: string;
  email: string;
  premium: number; // seconds remaining
  expiration: string;
}

export default function SettingsRealDebrid({ onSaved }: SettingsRealDebridProps) {
  const [apiKey, setApiKey]           = useState('');
  const [showKey, setShowKey]         = useState(false);
  const [loaded, setLoaded]           = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [testState, setTestState]     = useState<TestState>('idle');
  const [testMsg, setTestMsg]         = useState('');
  const [rdUser, setRdUser]           = useState<RDUser | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    if (loaded) return;
    fetch('/api/setup', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { config?: { realDebridApiKey?: string } }) => {
        setIsConfigured(!!(data.config?.realDebridApiKey));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [loaded]);

  const testConnection = async () => {
    const key = apiKey.trim();
    if (!key && !isConfigured) {
      setTestState('error');
      setTestMsg('Enter your Real-Debrid API key first');
      return;
    }
    setTestState('testing');
    setTestMsg('');
    setRdUser(null);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_real_debrid', realDebridApiKey: key || undefined }),
      });
      const data = await res.json() as { ok: boolean; user?: RDUser; error?: string };
      if (data.ok && data.user) {
        setTestState('ok');
        setRdUser(data.user);
        const premDays = Math.floor((data.user.premium ?? 0) / 86400);
        setTestMsg(`Connected as ${data.user.username} — ${premDays > 0 ? `${premDays} days premium remaining` : 'Premium expired'}`);
      } else {
        setTestState('error');
        setTestMsg(data.error ?? 'Connection failed — check your API key');
      }
    } catch {
      setTestState('error');
      setTestMsg('Cannot reach Real-Debrid — check your internet connection');
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
          realDebridApiKey: apiKey.trim() || undefined,
        }),
      });
      setSaved(true);
      setIsConfigured(!!apiKey.trim());
      setTimeout(() => setSaved(false), 3000);
      onSaved?.();
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setApiKey('');
    setTestState('idle');
    setTestMsg('');
    setRdUser(null);
    setSaving(true);
    try {
      await fetch('/api/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', realDebridApiKey: '' }),
      });
      setIsConfigured(false);
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const premDays = rdUser ? Math.floor((rdUser.premium ?? 0) / 86400) : 0;

  return (
    <div className="border-t border-border/50">
      <SectionHeader icon={Zap} label="Real-Debrid" />
      <div className="px-4 pb-4 flex flex-col gap-3">

        {/* Description */}
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Real-Debrid resolves torrents on their servers and delivers direct HTTPS download links.
          When configured, it replaces qBittorrent as the download backend — no torrent client needed.
        </p>

        {/* How it works */}
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
          <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <div className="text-[10px] text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">Priority order: </span>
            Real-Debrid → qBittorrent → WebTorrent.
            Torrents are found via Torrentio (same as always) — RD just handles the download.
          </div>
        </div>

        {/* Status badge */}
        {isConfigured && testState === 'idle' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <Zap className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <p className="text-[11px] text-green-300">Real-Debrid configured — active as primary download backend</p>
          </div>
        )}
        {!isConfigured && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border">
            <Zap className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <p className="text-[11px] text-muted-foreground">Not configured — qBittorrent / WebTorrent will be used</p>
          </div>
        )}

        {/* API Key field */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setTestState('idle'); setRdUser(null); }}
              placeholder={isConfigured ? '••••••••  (saved — enter new key to change)' : 'Paste your Real-Debrid API key'}
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
            Find it at{' '}
            <a
              href="https://real-debrid.com/apitoken"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              real-debrid.com/apitoken
            </a>
          </p>
        </div>

        {/* Test result */}
        {testState !== 'idle' && (
          <div className={`flex flex-col gap-1.5 px-3 py-2 rounded-lg text-[11px] ${
            testState === 'ok'
              ? 'bg-green-500/10 border border-green-500/20 text-green-300'
              : testState === 'error'
                ? 'bg-destructive/10 border border-destructive/20 text-destructive'
                : 'bg-muted/40 border border-border text-muted-foreground'
          }`}>
            <div className="flex items-center gap-2">
              {testState === 'testing' && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
              {testState === 'ok'      && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
              {testState === 'error'   && <XCircle className="w-3.5 h-3.5 shrink-0" />}
              {testState === 'testing' ? 'Testing connection…' : testMsg}
            </div>
            {/* Premium expiry warning */}
            {testState === 'ok' && rdUser && premDays <= 7 && premDays > 0 && (
              <p className="text-yellow-400 text-[10px] pl-5">
                ⚠ Premium expires soon — renew at real-debrid.com
              </p>
            )}
            {testState === 'ok' && rdUser && premDays <= 0 && (
              <p className="text-red-400 text-[10px] pl-5">
                Premium has expired — downloads will fail until renewed
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={testConnection}
            disabled={testState === 'testing' || (!apiKey.trim() && !isConfigured)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40"
          >
            {testState === 'testing'
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Testing…</>
              : <><Zap className="w-3.5 h-3.5" />Test Connection</>
            }
          </button>

          <button
            onClick={save}
            disabled={saving || !apiKey.trim()}
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

        {/* Clear / help links */}
        <div className="flex items-center justify-between">
          {isConfigured && (
            <button
              onClick={clear}
              className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              Remove Real-Debrid key
            </button>
          )}
          <a
            href="https://real-debrid.com"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            real-debrid.com
          </a>
        </div>
      </div>
    </div>
  );
}
