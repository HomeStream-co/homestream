import { KeyRound, Loader2, CheckCircle2, Clock, AlertTriangle, RefreshCw, ExternalLink, Zap } from 'lucide-react';
import { SectionHeader, ApiKeyField } from './shared';
import { useState, useEffect } from 'react';

export interface ApiKeysState {
  omdbApiKey: string;
  googleAiApiKey: string;
  tmdbApiKey: string;
  realDebridApiKey: string;
}

export interface ApiKeysSavedState {
  omdb: boolean;
  googleAi: boolean;
  tmdb: boolean;
  realDebrid: boolean;
}

interface ApiKeyTimestamps {
  omdb: string | null;
  googleAi: string | null;
  tmdb: string | null;
}

interface SettingsApiKeysProps {
  apiKeys: ApiKeysState;
  apiKeysSavedState: ApiKeysSavedState;
  apiKeyTimestamps: ApiKeyTimestamps;
  apiKeysSaving: boolean;
  apiKeysSaved: boolean;
  onChangeKey: (key: keyof ApiKeysState, value: string) => void;
  onSave: () => void;
  onTestOmdb: () => Promise<{ ok: boolean; message?: string }>;
  onTestTmdb: () => Promise<{ ok: boolean; message?: string }>;
  onTestGemini: () => Promise<{ ok: boolean; message?: string }>;
  onTestRealDebrid: () => Promise<{ ok: boolean; message?: string }>;
}

// ── Key metadata ──────────────────────────────────────────────────────────────

const KEY_META = {
  omdb: {
    label: 'OMDB',
    lifespanDays: 365,
    warnDays: 30,
    renewUrl: 'https://www.omdbapi.com/apikey.aspx',
    renewLabel: 'omdbapi.com',
  },
  googleAi: {
    label: 'Google Gemini',
    lifespanDays: 90,
    warnDays: 14,
    renewUrl: 'https://aistudio.google.com/app/apikey',
    renewLabel: 'aistudio.google.com',
  },
  tmdb: {
    label: 'TMDB',
    lifespanDays: 365,
    warnDays: 30,
    renewUrl: 'https://www.themoviedb.org/settings/api',
    renewLabel: 'themoviedb.org',
  },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntilExpiry(isoDate: string, lifespanDays: number): number {
  return lifespanDays - daysSince(isoDate);
}

function formatAge(days: number): string {
  if (days < 1)   return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30)  return `${days} days ago`;
  if (days < 60)  return '1 month ago';
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

// ── KeyLifespanBadge ──────────────────────────────────────────────────────────

interface KeyLifespanBadgeProps {
  savedAt: string | null;
  lifespanDays: number;
  warnDays: number;
  renewUrl: string;
  renewLabel: string;
}

function KeyLifespanBadge({ savedAt, lifespanDays, warnDays, renewUrl, renewLabel }: KeyLifespanBadgeProps) {
  if (!savedAt) return null;

  const age      = daysSince(savedAt);
  const daysLeft = daysUntilExpiry(savedAt, lifespanDays);
  const pct      = Math.min(100, Math.max(0, (age / lifespanDays) * 100));

  const isExpired = daysLeft <= 0;
  const isWarning = !isExpired && daysLeft <= warnDays;
  const isHealthy = !isExpired && !isWarning;

  const barColor    = isExpired ? 'bg-red-500'    : isWarning ? 'bg-yellow-500' : 'bg-green-500';
  const textColor   = isExpired ? 'text-red-400'  : isWarning ? 'text-yellow-400' : 'text-green-400';
  const borderColor = isExpired ? 'border-red-500/20' : isWarning ? 'border-yellow-500/20' : 'border-green-500/20';
  const bgColor     = isExpired ? 'bg-red-500/5'  : isWarning ? 'bg-yellow-500/5' : 'bg-green-500/5';

  return (
    <div className={`mt-1.5 rounded-lg border ${borderColor} ${bgColor} px-2.5 py-2`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          {isHealthy
            ? <Clock className={`w-3 h-3 ${textColor} flex-shrink-0`} />
            : <AlertTriangle className={`w-3 h-3 ${textColor} flex-shrink-0`} />
          }
          <span className={`text-[10px] font-medium ${textColor}`}>
            {isExpired
              ? `Expired ${formatAge(age)} — regenerate recommended`
              : isWarning
              ? `${daysLeft}d left — consider regenerating`
              : `${daysLeft}d remaining`}
          </span>
        </div>

        {(isExpired || isWarning) && (
          <a
            href={renewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1 text-[10px] font-semibold ${textColor} hover:underline flex-shrink-0`}
          >
            <RefreshCw className="w-2.5 h-2.5" />
            Regenerate
            <ExternalLink className="w-2 h-2 opacity-60" />
          </a>
        )}
        {isHealthy && (
          <a
            href={renewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground hover:underline flex-shrink-0 transition-colors"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            {renewLabel}
          </a>
        )}
      </div>

      <div className="h-1 rounded-full bg-white/8 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-[9px] text-muted-foreground mt-1">
        Saved {formatAge(age)} · {lifespanDays}-day rotation reminder
      </p>
    </div>
  );
}

// ── RealDebridPremiumBadge ────────────────────────────────────────────────────

interface RDStatus {
  ok: boolean;
  cached?: boolean;
  daysLeft?: number;
  premiumExpiry?: string;
  checkedAt?: string;
  username?: string;
  reason?: string;
  error?: string;
}

function RealDebridPremiumBadge({ hasSavedKey }: { hasSavedKey: boolean }) {
  const [status, setStatus] = useState<RDStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasSavedKey) return;
    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    fetch('/api/real-debrid/status', { credentials: 'include', signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: RDStatus) => setStatus(data))
      .catch(() => setStatus({ ok: false, reason: 'fetch_failed' }))
      .finally(() => { clearTimeout(timeout); setLoading(false); });
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [hasSavedKey]);

  if (!hasSavedKey) return null;

  if (loading) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Checking Real-Debrid subscription…
      </div>
    );
  }

  if (!status || !status.ok) {
    const msg = status?.reason === 'no_key'
      ? 'No API key configured'
      : (status?.error ?? 'Could not reach Real-Debrid');
    return (
      <div className="mt-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-2 flex items-center gap-1.5">
        <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />
        <span className="text-[10px] text-red-400">{msg}</span>
      </div>
    );
  }

  const days      = status.daysLeft ?? 0;
  const isExpired = days <= 0;
  const isWarning = !isExpired && days <= 14;
  const isHealthy = !isExpired && !isWarning;

  const barPct      = isExpired ? 100 : Math.min(100, Math.max(2, ((180 - days) / 180) * 100));
  const barColor    = isExpired ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-green-500';
  const textColor   = isExpired ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-green-400';
  const borderColor = isExpired ? 'border-red-500/20' : isWarning ? 'border-yellow-500/20' : 'border-green-500/20';
  const bgColor     = isExpired ? 'bg-red-500/5' : isWarning ? 'bg-yellow-500/5' : 'bg-green-500/5';

  const expiryLabel = status.premiumExpiry
    ? new Date(status.premiumExpiry).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className={`mt-1.5 rounded-lg border ${borderColor} ${bgColor} px-2.5 py-2`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          {isHealthy
            ? <CheckCircle2 className={`w-3 h-3 ${textColor} flex-shrink-0`} />
            : <AlertTriangle className={`w-3 h-3 ${textColor} flex-shrink-0`} />
          }
          <span className={`text-[10px] font-medium ${textColor}`}>
            {isExpired
              ? 'Premium expired — renew at real-debrid.com'
              : isWarning
              ? `${days}d left — renew soon`
              : `${days} days of premium remaining`}
          </span>
        </div>
        <a
          href="https://real-debrid.com/premium"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-1 text-[10px] ${isHealthy ? 'text-muted-foreground hover:text-foreground' : `font-semibold ${textColor}`} hover:underline flex-shrink-0 transition-colors`}
        >
          {(isExpired || isWarning) && <RefreshCw className="w-2.5 h-2.5" />}
          {isExpired || isWarning ? 'Renew' : 'real-debrid.com'}
          <ExternalLink className="w-2 h-2 opacity-60" />
        </a>
      </div>

      <div className="h-1 rounded-full bg-white/8 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${barPct}%` }}
        />
      </div>

      <p className="text-[9px] text-muted-foreground mt-1">
        {status.username && <span className="font-medium text-foreground/60">{status.username} · </span>}
        {expiryLabel ? `Expires ${expiryLabel}` : ''}
        {status.cached ? ' · cached' : ' · live from Real-Debrid'}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SettingsApiKeys({
  apiKeys, apiKeysSavedState, apiKeyTimestamps, apiKeysSaving, apiKeysSaved,
  onChangeKey, onSave, onTestOmdb, onTestTmdb, onTestGemini, onTestRealDebrid,
}: SettingsApiKeysProps) {
  return (
    <div className="border-t border-border/50">
      <SectionHeader icon={KeyRound} label="API Keys" />
      <div className="px-4 pb-4 divide-y divide-border/30">

        {/* ── OMDB ── */}
        <div className="py-2 first:pt-0">
          {apiKeysSavedState.omdb && !apiKeys.omdbApiKey && (
            <div className="flex items-center gap-1.5 pb-1 text-[11px] text-green-400">
              <CheckCircle2 className="w-3 h-3" /> OMDB key saved — enter a new value to replace it
            </div>
          )}
          <ApiKeyField
            label="OMDB"
            description="Movie metadata (posters, ratings, plot). Get free key at omdbapi.com"
            value={apiKeys.omdbApiKey}
            onChange={v => onChangeKey('omdbApiKey', v)}
            onTest={onTestOmdb}
            placeholder={apiKeysSavedState.omdb ? '(key saved — enter new to replace)' : 'e.g. a1b2c3d4'}
          />
          <KeyLifespanBadge savedAt={apiKeyTimestamps.omdb} {...KEY_META.omdb} />
        </div>

        {/* ── TMDB ── */}
        <div className="py-2">
          {apiKeysSavedState.tmdb && !apiKeys.tmdbApiKey && (
            <div className="flex items-center gap-1.5 pb-1 text-[11px] text-green-400">
              <CheckCircle2 className="w-3 h-3" /> TMDB key saved — enter a new value to replace it
            </div>
          )}
          <ApiKeyField
            label="TMDB"
            description="Discover page, trending movies & TV. Get key at themoviedb.org"
            value={apiKeys.tmdbApiKey}
            onChange={v => onChangeKey('tmdbApiKey', v)}
            onTest={onTestTmdb}
            placeholder={apiKeysSavedState.tmdb ? '(key saved — enter new to replace)' : 'v3 API key or Bearer token'}
          />
          <KeyLifespanBadge savedAt={apiKeyTimestamps.tmdb} {...KEY_META.tmdb} />
        </div>

        {/* ── Google Gemini ── */}
        <div className="py-2">
          {apiKeysSavedState.googleAi && !apiKeys.googleAiApiKey && (
            <div className="flex items-center gap-1.5 pb-1 text-[11px] text-green-400">
              <CheckCircle2 className="w-3 h-3" /> Google AI key saved — enter a new value to replace it
            </div>
          )}
          <ApiKeyField
            label="Google Gemini"
            description="AI enrichment & chat assistant. Get key at aistudio.google.com"
            value={apiKeys.googleAiApiKey}
            onChange={v => onChangeKey('googleAiApiKey', v)}
            onTest={onTestGemini}
            placeholder={apiKeysSavedState.googleAi ? '(key saved — enter new to replace)' : 'AIza…'}
          />
          <KeyLifespanBadge savedAt={apiKeyTimestamps.googleAi} {...KEY_META.googleAi} />
        </div>

        {/* ── Real-Debrid ── */}
        <div className="py-2">
          {apiKeysSavedState.realDebrid && !apiKeys.realDebridApiKey && (
            <div className="flex items-center gap-1.5 pb-1 text-[11px] text-green-400">
              <CheckCircle2 className="w-3 h-3" /> Real-Debrid key saved — enter a new value to replace it
            </div>
          )}
          <ApiKeyField
            label="Real-Debrid"
            labelIcon={<Zap className="w-3 h-3 text-yellow-400" />}
            description="Premium download backend — resolves torrents server-side, no torrent client needed."
            descriptionLink={{ href: 'https://real-debrid.com/apitoken', label: 'Get API key →' }}
            value={apiKeys.realDebridApiKey}
            onChange={v => onChangeKey('realDebridApiKey', v)}
            onTest={onTestRealDebrid}
            placeholder={apiKeysSavedState.realDebrid ? '(key saved — enter new to replace)' : 'Paste your RD API token'}
          />
          <RealDebridPremiumBadge hasSavedKey={apiKeysSavedState.realDebrid} />
        </div>

        {/* ── Save button ── */}
        <div className="pt-3">
          <button
            onClick={onSave}
            disabled={apiKeysSaving}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              apiKeysSaved
                ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                : 'bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary'
            } disabled:opacity-60`}
          >
            {apiKeysSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
             apiKeysSaved  ? <CheckCircle2 className="w-3.5 h-3.5" /> :
             <KeyRound className="w-3.5 h-3.5" />}
            {apiKeysSaving ? 'Saving…' : apiKeysSaved ? 'Saved!' : 'Save API Keys'}
          </button>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Keys are stored in homestream-config.json on your server
          </p>
        </div>
      </div>
    </div>
  );
}
