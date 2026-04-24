/**
 * Setup Step 8 — Finish
 * Config summary, existing media scan, and final launch button.
 */
import { useEffect, useState } from 'react';
import {
  CheckCircle2, ChevronLeft, Loader2, AlertCircle, ScanSearch, PackageOpen, Zap,
  Smartphone, QrCode, Copy, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import type { SetupStepProps } from './types';
import { apiPost } from './types';

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
  const [qrData, setQrData] = useState<{ url: string; qr: string; lanIP?: string; port?: string } | null>(null);
  const [qrError, setQrError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 4;
    const RETRY_DELAY_MS = 1500;

    function tryFetch() {
      fetch('/api/remote/qr')
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then((d: { url?: string; qr?: string; lanIP?: string; port?: string }) => {
          if (cancelled) return;
          if (d?.url && d?.qr) setQrData({ url: d.url, qr: d.qr, lanIP: d.lanIP, port: d.port });
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
  // Hide the QR only if the server itself couldn't find a real LAN IP —
  // i.e. the QR URL would point to localhost, which is useless on a phone.
  // We do NOT hide it just because the browser is on localhost (Electron app).
  const qrPointsToLocalhost =
    !qrData ||
    lanIP === 'localhost' ||
    lanIP === '127.0.0.1' ||
    lanIP === '::1';
  const remoteUrl = qrData?.url ?? `http://${lanIP}:${qrData?.port ?? '3000'}/remote`;

  function copyUrl() {
    navigator.clipboard.writeText(remoteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  const completeSetup = async () => {
    setStatus(s => ({ ...s, complete: 'saving' }));
    try {
      // Re-save the full form state before completing — the user may have gone
      // Back and changed API keys or other settings without clicking "Save & Continue"
      // again. This ensures the final config always reflects what's shown on screen.
      await apiPost('save', {
        adminPassword:   form.adminPassword,
        omdbApiKey:      form.omdbApiKey,
        googleAiApiKey:  form.googleAiApiKey,
        tmdbApiKey:      form.tmdbApiKey,
        aiProvider:      form.aiProvider,
        ollamaUrl:       form.ollamaUrl,
        ollamaModel:     form.ollamaModel,
        mediaDir:        form.mediaDir,
        preferredQuality: form.preferredQuality,
        watchFolderEnabled: String(form.watchFolderEnabled),
        autoTranscode:   String(form.autoTranscode),
      });

      if (importExisting && scanFound > 0) {
        setScanState('importing');
        await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'import_existing' }),
        });
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
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-2xl font-heading font-bold text-foreground">You&apos;re all set!</h2>
        <p className="text-muted-foreground mt-2 text-sm">Here&apos;s your HomeStream configuration summary.</p>
      </div>

      {/* Config summary */}
      <div className="flex flex-col gap-1.5 text-sm">
        {[
          { label: 'Media folder', value: form.mediaDir, ok: !!form.mediaDir },
          { label: 'qBittorrent', value: status.qbit === 'ok' ? `Connected (${qbitVersion})` : 'Not configured', ok: status.qbit === 'ok' },
          { label: 'Jellyfin', value: status.jellyfin === 'ok' ? `Connected (${jellyfinVersion})` : 'Not configured', ok: status.jellyfin === 'ok' },
          { label: 'TMDB (hero/discover)', value: form.tmdbApiKey ? 'API key set ✓' : 'Not configured — Discover page disabled', ok: !!form.tmdbApiKey },
          { label: 'OMDB metadata', value: form.omdbApiKey ? 'API key set' : 'Not configured', ok: !!form.omdbApiKey },
          { label: 'AI assistant', value: form.aiProvider === 'gemini'
              ? (form.googleAiApiKey ? 'Google Gemini — API key set ✓' : 'Google Gemini — API key missing')
              : `Ollama (${form.ollamaModel || 'llama3'}) @ ${form.ollamaUrl}`,
            ok: form.aiProvider === 'ollama' || !!form.googleAiApiKey },
          { label: 'Auto-import', value: form.watchFolderEnabled ? 'Enabled' : 'Disabled', ok: form.watchFolderEnabled },
          { label: 'Preferred quality', value: form.preferredQuality, ok: true },
        ].map(({ label, value, ok }) => (
          <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className={`flex items-center gap-1.5 font-medium text-xs ${ok ? 'text-foreground' : 'text-muted-foreground'}`}>
              {ok ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <AlertCircle className="w-3 h-3 text-muted-foreground" />}
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* ── Phone Remote QR ── */}
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Smartphone className="w-4 h-4 text-primary flex-shrink-0" />
          <p className="text-sm font-semibold text-foreground">Phone Remote</p>
          <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Optional</span>
        </div>
        <div className="flex items-center gap-4">
          {/* QR code */}
          <div className="flex-shrink-0">
            {!qrData && !qrError && (
              <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {qrData && !qrPointsToLocalhost && (
              <div className="w-24 h-24 rounded-lg overflow-hidden bg-white p-1.5">
                <img src={qrData.qr} alt="Remote QR code" className="w-full h-full object-contain" />
              </div>
            )}
            {(qrError || qrPointsToLocalhost) && (
              <div className="w-24 h-24 rounded-lg bg-muted flex flex-col items-center justify-center gap-1 text-center px-2">
                <QrCode className="w-6 h-6 text-muted-foreground/40" />
                <p className="text-[9px] text-muted-foreground leading-tight">Open in Electron for QR</p>
              </div>
            )}
          </div>
          {/* Instructions */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {qrPointsToLocalhost
                ? 'Run HomeStream on your home server to get a scannable QR code for your phone.'
                : 'Scan with your phone camera to open the remote control — no app needed.'}
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
            <p className="text-[10px] text-muted-foreground">
              You can also find this QR code on the home screen after setup.
            </p>
          </div>
        </div>
      </div>

      {/* Existing media scan panel */}
      <div className={`rounded-xl border p-4 transition-colors ${scanState === 'done' && scanFound > 0 ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20'}`}>
        <div className="flex items-center gap-2 mb-2">
          <ScanSearch className="w-4 h-4 text-primary flex-shrink-0" />
          <p className="text-sm font-semibold text-foreground">Existing Media on RAID</p>
          {scanState === 'scanning' && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto" />}
        </div>

        {scanState === 'scanning' && (
          <p className="text-xs text-muted-foreground">Scanning <code className="bg-muted px-1 rounded">{form.mediaDir}</code> for existing video files…</p>
        )}
        {scanState === 'done' && scanFound === 0 && scanSkipped === 0 && (
          <p className="text-xs text-muted-foreground">No existing video files found in <code className="bg-muted px-1 rounded">{form.mediaDir}</code>. Files will appear here as you download content.</p>
        )}
        {scanState === 'done' && scanSkipped > 0 && scanFound === 0 && (
          <p className="text-xs text-green-400"><CheckCircle2 className="w-3 h-3 inline mr-1" />All {scanSkipped} existing files are already in your library.</p>
        )}
        {scanState === 'done' && scanFound > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary">{scanFound} file{scanFound !== 1 ? 's' : ''} found</p>
                <p className="text-xs text-muted-foreground">{scanSkipped > 0 ? `${scanSkipped} already in library · ` : ''}Ready to import into HomeStream</p>
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
                <p className="text-xs font-semibold text-foreground">Import all into HomeStream library</p>
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
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Importing {scanFound} files in background…</>
              : <><CheckCircle2 className="w-3.5 h-3.5" />Import started — files will appear in your library shortly</>}
          </div>
        )}
      </div>

      {/* Jellyfin tip — only shown when Jellyfin was successfully connected */}
      {status.jellyfin === 'ok' && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Jellyfin tip:</strong> Open Jellyfin at{' '}
          <a href={form.jellyfinUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{form.jellyfinUrl}</a>{' '}
          and add <code className="bg-muted px-1 rounded">{form.mediaDir}/library</code> as a media library.
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" />Back
        </button>
        <button onClick={completeSetup} disabled={status.complete === 'saving' || status.complete === 'done' || scanState === 'scanning'}
          className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-60">
          {status.complete === 'saving' || scanState === 'importing'
            ? <><Loader2 className="w-4 h-4 animate-spin" />Starting HomeStream…</>
            : status.complete === 'done'
            ? <><CheckCircle2 className="w-4 h-4" />Done! Redirecting…</>
            : scanState === 'scanning'
            ? <><Loader2 className="w-4 h-4 animate-spin" />Scanning media…</>
            : <>Launch HomeStream <Zap className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}
