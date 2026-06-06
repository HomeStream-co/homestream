/**
 * Setup Step 8 — Finish
 * Config summary, existing media scan, and final launch button.
 */
import { useEffect, useState } from 'react';
import {
  CheckCircle2, ChevronLeft, Loader2, AlertCircle, ScanSearch, PackageOpen, Zap,
  Smartphone, QrCode, Copy, Check, AlertTriangle, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import type { SetupStepProps } from './types';
import { apiPost } from './types';
import UpdateBanner from '@/components/UpdateBanner';

export default function StepFinish({
  form, status, setStatus, onBack,
  qbitVersion, jellyfinVersion,
  scanState, setScanState,
  scanFound, scanFiles,
  scanSkipped,
  importExisting, setImportExisting,
}: SetupStepProps) {
  const navigate = useNavigate();

  // ── QR code for phone remote ───────────────────────────────────────────────
  const [qrData, setQrData] = useState<{ url: string; qr: string; lanIP?: string; mdnsUrl?: string; ipUrl?: string; port?: string } | null>(null);
  const [qrError, setQrError] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Live qBit health check ─────────────────────────────────────────────────
  const [qbitLive, setQbitLive] = useState<'checking' | 'ok' | 'down' | 'unconfigured'>('checking');

  useEffect(() => {
    if (!form.qbitUrl) { setQbitLive('unconfigured'); return; }

    let cancelled = false;
    fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test_qbit',
        qbitUrl: form.qbitUrl,
        qbitUsername: form.qbitUsername,
        qbitPassword: form.qbitPassword,
      }),
    })
      .then(r => r.json())
      .then((d: { ok: boolean }) => { if (!cancelled) setQbitLive(d.ok ? 'ok' : 'down'); })
      .catch(() => { if (!cancelled) setQbitLive('unconfigured'); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 4;
    const RETRY_DELAY_MS = 1500;

    function tryFetch() {
      fetch('/api/remote/qr', { credentials: 'include' })
        .then(r => {
          if (r.status === 401) { if (!cancelled) setQrError(true); return null; }
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((d: { url?: string; qr?: string; lanIP?: string; mdnsUrl?: string; ipUrl?: string; port?: string } | null) => {
          if (cancelled || !d) return;
          if (d?.url && d?.qr) setQrData({ url: d.url, qr: d.qr, lanIP: d.lanIP, mdnsUrl: d.mdnsUrl, ipUrl: d.ipUrl, port: d.port });
          else setQrError(true);
        })
        .catch(() => {
          if (cancelled) return;
          attempts++;
          if (attempts < MAX_ATTEMPTS) {
            setTimeout(tryFetch, RETRY_DELAY_MS);
          } else {
            setQrError(true);
          }
        });
    }

    tryFetch();
    return () => { cancelled = true; };
  }, []);

  const lanIP = qrData?.lanIP ?? window.location.hostname;
  const qrPointsToLocalhost =
    !qrData ||
    lanIP === 'localhost' ||
    lanIP === '127.0.0.1' ||
    lanIP === '::1';
  const remoteUrl = qrData?.url ?? `http://${window.location.hostname}:${qrData?.port ?? '3000'}/remote`;

  function copyUrl() {
    navigator.clipboard.writeText(remoteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  const completeSetup = async () => {
    setStatus(s => ({ ...s, complete: 'saving' }));
    try {
      await apiPost('save', {
        omdbApiKey:         form.omdbApiKey,
        tmdbApiKey:         form.tmdbApiKey,
        // Use the unified aiApiKey saved by StepApiKeys — do NOT overwrite with
        // the legacy googleAiApiKey field which may be empty at this point.
        ...(form.aiApiKey ? { aiApiKey: form.aiApiKey } : {}),
        aiProvider:         form.aiProvider,
        ollamaUrl:          form.ollamaUrl,
        ollamaModel:        form.ollamaModel,
        mediaDir:           form.mediaDir,
        preferredQuality:   form.preferredQuality,
        watchFolderEnabled: String(form.watchFolderEnabled),
        autoTranscode:      String(form.autoTranscode),
      });

      if (importExisting && scanFound > 0) {
        setScanState('importing');
        try {
          await fetch('/api/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'import_existing' }),
          });
        } catch { /* non-fatal */ }
        setScanState('imported');
      }
      const result = await apiPost('complete') as { ok: boolean; error?: string };
      if (result.ok) {
        setStatus(s => ({ ...s, complete: 'done' }));
        toast.success(
          scanFound > 0 && importExisting
            ? `HomeStream is ready! Importing ${scanFound} existing files in the background.`
            : 'HomeStream is ready!'
        );
        setTimeout(() => navigate('/'), 1800);
      } else {
        setStatus(s => ({ ...s, complete: 'error' }));
      }
    } catch {
      setStatus(s => ({ ...s, complete: 'error' }));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="text-center pb-1">
        <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-7 h-7 text-green-400" />
        </div>
        <h2 className="text-2xl font-heading font-bold text-foreground">You're all set!</h2>
        <p className="text-muted-foreground mt-1.5 text-sm">Review your configuration and launch HomeStream.</p>
      </div>

      <UpdateBanner />

      {/* Config summary — card grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Media folder', value: form.mediaDir || 'Not set', ok: !!form.mediaDir, wide: true },
          { label: 'Quality', value: form.preferredQuality, ok: true },
          { label: 'Auto-import', value: form.watchFolderEnabled ? 'On' : 'Off', ok: form.watchFolderEnabled },
          { label: 'qBittorrent', value: status.qbit === 'ok' ? `v${qbitVersion}` : 'Not configured', ok: status.qbit === 'ok' },
          { label: 'Jellyfin', value: status.jellyfin === 'ok' ? `v${jellyfinVersion}` : 'Not configured', ok: status.jellyfin === 'ok' },
          { label: 'TMDB / OMDB', value: 'Built-in', ok: true },
          { label: 'AI', value: form.aiApiKey ? (form.aiProvider === 'ollama' ? 'Ollama' : form.aiProvider === 'anthropic' ? 'Anthropic' : form.aiProvider === 'openai' ? 'OpenAI' : 'Gemini') : 'No key (optional)', ok: !!form.aiApiKey },
        ].map(({ label, value, ok, wide }) => (
          <div key={label} className={`flex items-center gap-2.5 p-3 rounded-xl border bg-muted/20 ${wide ? 'col-span-2' : ''} ${ok ? 'border-border' : 'border-border/50'}`}>
            {ok
              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground">{label}</p>
              <p className={`text-xs font-medium truncate ${ok ? 'text-foreground' : 'text-muted-foreground'}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Phone Remote QR */}
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Smartphone className="w-4 h-4 text-primary flex-shrink-0" />
          <p className="text-sm font-semibold text-foreground">Phone Remote</p>
          <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Optional</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            {!qrData && !qrError && (
              <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {qrData && !qrPointsToLocalhost && (
              <div
                className="w-24 h-24 rounded-lg overflow-hidden bg-white p-1.5 [&_svg]:w-full [&_svg]:h-full"
                dangerouslySetInnerHTML={{ __html: qrData.qr }}
              />
            )}
            {(qrError || qrPointsToLocalhost) && (
              <div className="w-24 h-24 rounded-lg bg-muted flex flex-col items-center justify-center gap-1 text-center px-2">
                <QrCode className="w-6 h-6 text-muted-foreground/40" />
                <p className="text-[9px] text-muted-foreground leading-tight">Open in Electron for QR</p>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {qrPointsToLocalhost
                ? 'Run HomeStream on your home server to get a scannable QR code for your phone.'
                : 'Scan with your phone camera to open the remote — no app needed.'}
            </p>
            {!qrPointsToLocalhost && qrData && (
              <button
                onClick={copyUrl}
                className="flex items-center gap-1.5 bg-muted hover:bg-muted/80 rounded-lg px-2.5 py-1.5 transition-colors group w-full"
              >
                <code className="flex-1 text-[10px] text-muted-foreground truncate text-left font-mono">{remoteUrl}</code>
                {copied
                  ? <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                  : <Copy className="w-3 h-3 text-muted-foreground flex-shrink-0 group-hover:text-foreground transition-colors" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Existing media scan */}
      <div className={`rounded-xl border p-4 transition-colors ${scanState === 'done' && scanFound > 0 ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20'}`}>
        <div className="flex items-center gap-2 mb-2">
          <ScanSearch className="w-4 h-4 text-primary flex-shrink-0" />
          <p className="text-sm font-semibold text-foreground">Existing Media</p>
          {scanState === 'scanning' && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto" />}
        </div>

        {scanState === 'scanning' && (
          <p className="text-xs text-muted-foreground">Scanning <code className="bg-muted px-1 rounded">{form.mediaDir}</code>…</p>
        )}
        {scanState === 'done' && scanFound === 0 && scanSkipped === 0 && (
          <p className="text-xs text-muted-foreground">No video files found. Files will appear as you download content.</p>
        )}
        {scanState === 'done' && scanSkipped > 0 && scanFound === 0 && (
          <p className="text-xs text-green-400 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" />All {scanSkipped} existing files are already in your library.</p>
        )}
        {scanState === 'done' && scanFound > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary">{scanFound} file{scanFound !== 1 ? 's' : ''} found</p>
                <p className="text-xs text-muted-foreground">{scanSkipped > 0 ? `${scanSkipped} already in library · ` : ''}Ready to import</p>
              </div>
              <PackageOpen className="w-8 h-8 text-primary/40" />
            </div>
            {scanFiles.length > 0 && (
              <div className="max-h-28 overflow-y-auto flex flex-col gap-0.5 rounded-lg bg-background/60 p-2">
                {scanFiles.slice(0, 50).map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px] py-0.5">
                    <span className="text-foreground truncate max-w-[260px]">{f.name}</span>
                    <span className="text-muted-foreground flex-shrink-0 ml-2">{(f.size / (1024 * 1024 * 1024)).toFixed(1)} GB</span>
                  </div>
                ))}
                {scanFiles.length > 50 && <p className="text-[10px] text-muted-foreground text-center pt-1">+{scanFiles.length - 50} more files</p>}
              </div>
            )}
            <label className="flex items-center justify-between cursor-pointer bg-background/60 rounded-lg px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold text-foreground">Import all into HomeStream</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Files stay in place — nothing is moved or deleted</p>
              </div>
              <button onClick={() => setImportExisting(!importExisting)}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ml-3 focus:outline-none ${importExisting ? 'bg-primary' : 'bg-muted'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${importExisting ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </label>
          </div>
        )}
        {(scanState === 'importing' || scanState === 'imported') && (
          <div className="flex items-center gap-2 text-xs text-green-400">
            {scanState === 'importing'
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Importing {scanFound} files…</>
              : <><CheckCircle2 className="w-3.5 h-3.5" />Import started — files will appear shortly</>}
          </div>
        )}
      </div>

      {/* Jellyfin tip */}
      {status.jellyfin === 'ok' && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Jellyfin tip:</strong> Add{' '}
          <code className="bg-muted px-1 rounded">{form.mediaDir}/library</code> as a media library in Jellyfin.
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex-1 flex flex-col gap-2">
          {qbitLive === 'checking' && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" /> Checking qBittorrent…
            </div>
          )}
          {qbitLive === 'ok' && (
            <div className="flex items-center gap-2 text-[11px] text-green-400 px-1">
              <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> qBittorrent is running — downloads ready
            </div>
          )}
          {qbitLive === 'down' && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-amber-300 leading-snug">
                qBittorrent isn't running — you can still launch, but downloads won't work until you open it.
              </p>
            </div>
          )}
          {qbitLive === 'unconfigured' && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/40 border border-border">
              <Download className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-snug">
                qBittorrent not configured — add it later in Settings.
              </p>
            </div>
          )}

          {status.complete === 'error' && (
            <p className="text-[11px] text-destructive text-center">Setup failed — check your settings and try again.</p>
          )}

          <button
            onClick={completeSetup}
            disabled={status.complete === 'saving' || status.complete === 'done' || scanState === 'scanning'}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-3.5 rounded-xl font-bold text-base transition-all disabled:opacity-60 shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.01] active:scale-[0.99]"
          >
            {status.complete === 'saving' || scanState === 'importing'
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Starting HomeStream…</>
              : status.complete === 'done'
              ? <><CheckCircle2 className="w-5 h-5" /> Done! Redirecting…</>
              : scanState === 'scanning'
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Scanning media…</>
              : <><Zap className="w-5 h-5" /> Launch HomeStream</>}
          </button>
        </div>
      </div>
    </div>
  );
}
