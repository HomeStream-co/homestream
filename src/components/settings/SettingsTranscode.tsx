/**
 * SettingsTranscode — Hardware encoder status + transcode quality presets.
 *
 * Shows:
 *   • Detected encoder (NVENC / VAAPI / VideoToolbox / QSV / AMF / Software)
 *   • A "Re-detect" button (forces a fresh probe — useful after driver install)
 *   • Quality preset picker: Fast / Balanced / Quality / Lossless
 *
 * Quality presets map to CRF offsets applied on top of the resolution-based
 * defaults in transcodeWorker.ts:
 *   Fast      → +4 CRF  (smaller files, slightly lower quality)
 *   Balanced  → ±0 CRF  (default — matches HandBrake RF presets)
 *   Quality   → -3 CRF  (larger files, noticeably better quality)
 *   Lossless  → copy stream where possible, CRF 0 for re-encodes
 *
 * Stored in homestream-config.json as `transcodePreset`.
 * Read/written via POST /api/setup.
 */
import { useEffect, useState, useCallback } from 'react';
import { Cpu, RefreshCw, Check, Loader2, Zap } from 'lucide-react';
import { SectionHeader, Toggle } from './shared';

// ── Types ─────────────────────────────────────────────────────────────────────

type TranscodePreset = 'fast' | 'balanced' | 'quality' | 'lossless';

interface EncoderStatus {
  encoder: string | null;
  label: string;
  detected: boolean;
}

const PRESET_OPTIONS: {
  value: TranscodePreset;
  label: string;
  hint: string;
  badge?: string;
}[] = [
  {
    value: 'fast',
    label: 'Fast',
    hint: 'Smaller files, slightly softer image',
    badge: 'CRF +4',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    hint: 'Default — matches HandBrake RF presets',
    badge: 'Default',
  },
  {
    value: 'quality',
    label: 'Quality',
    hint: 'Larger files, noticeably sharper',
    badge: 'CRF −3',
  },
  {
    value: 'lossless',
    label: 'Lossless',
    hint: 'Copy stream when possible, CRF 0 for re-encodes',
    badge: 'CRF 0',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsTranscode() {
  const [encoder, setEncoder]   = useState<EncoderStatus | null>(null);
  const [detecting, setDetecting] = useState(false);

  const [preset, setPreset]     = useState<TranscodePreset>('balanced');
  const [hwEnabled, setHwEnabled] = useState(false);
  const [presetLoaded, setPresetLoaded] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  // ── Load encoder status ──────────────────────────────────────────────────
  const loadEncoder = useCallback(async (force = false) => {
    setDetecting(true);
    try {
      const url = force
        ? '/api/encoder/status?refresh=1'
        : '/api/encoder/status';
      const r = await fetch(url, { credentials: 'include' });
      if (r.ok) {
        const data = await r.json() as EncoderStatus;
        setEncoder(data);
      }
    } catch { /* non-fatal */ }
    setDetecting(false);
  }, []);

  // ── Load config ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/setup', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { config?: { transcodePreset?: TranscodePreset; enableHwTranscode?: boolean } }) => {
        if (data.config?.transcodePreset) setPreset(data.config.transcodePreset);
        if (data.config?.enableHwTranscode !== undefined) setHwEnabled(data.config.enableHwTranscode);
        setPresetLoaded(true);
      })
      .catch(() => setPresetLoaded(true));

    loadEncoder();
  }, [loadEncoder]);

  // ── Save preset ──────────────────────────────────────────────────────────
  const handlePreset = useCallback(async (p: TranscodePreset) => {
    if (p === preset || saving) return;
    setPreset(p);
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', transcodePreset: p }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* non-fatal */ }
    setSaving(false);
  }, [preset, saving]);

  // ── Save HW Toggle ───────────────────────────────────────────────────────
  const handleHwToggle = useCallback(async (checked: boolean) => {
    setHwEnabled(checked);
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', enableHwTranscode: checked }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* non-fatal */ }
    setSaving(false);
  }, []);

  // ── Encoder badge colour ─────────────────────────────────────────────────
  const isHw = encoder?.detected ?? false;
  const encoderColour = isHw
    ? 'text-green-400 bg-green-500/10 border-green-500/30'
    : 'text-muted-foreground bg-muted border-border';

  return (
    <div className="border-t border-border/50">
      <SectionHeader icon={Cpu} label="Transcoding" />
      <div className="px-4 pb-3 space-y-4">

        {/* ── Encoder status ── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-sm text-foreground leading-tight">Active encoder</p>
            <button
              onClick={() => loadEncoder(true)}
              disabled={detecting}
              title="Re-detect hardware encoder"
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${detecting ? 'animate-spin' : ''}`} />
              Re-detect
            </button>
          </div>

          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${encoderColour}`}>
            {detecting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                <span>Detecting…</span>
              </>
            ) : encoder ? (
              <>
                {isHw
                  ? <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                  : <Cpu className="w-3.5 h-3.5 flex-shrink-0" />
                }
                <span>{encoder.label}</span>
                {isHw && (
                  <span className="ml-auto text-green-500/70 font-normal">GPU accelerated</span>
                )}
              </>
            ) : (
              <>
                <Cpu className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Not yet detected</span>
              </>
            )}
          </div>

          {!isHw && !detecting && encoder && (
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
              No GPU encoder found. Install NVIDIA, AMD, or Intel GPU drivers to enable hardware acceleration.
            </p>
          )}
        </div>

        {/* ── Hardware Acceleration Switch ── */}
        <div className="border-t border-border/20 pt-1">
          <Toggle
            checked={hwEnabled}
            onChange={handleHwToggle}
            label="Hardware Acceleration (GPU)"
            description="Use GPU to speed up transcoding. Keep disabled if you see playback issues on 10-bit files."
            icon={Zap}
          />
        </div>

        {/* ── Quality preset ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm text-foreground leading-tight">Quality preset</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Controls CRF value used when re-encoding video
              </p>
            </div>
            {saving && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin flex-shrink-0" />}
            {saved && !saving && <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {PRESET_OPTIONS.map(opt => {
              const active = preset === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handlePreset(opt.value)}
                  disabled={!presetLoaded || saving}
                  className={`relative flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border text-left transition-all ${
                    active
                      ? 'bg-primary/10 border-primary/50 text-primary'
                      : 'bg-muted/50 border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-semibold">{opt.label}</span>
                    {opt.badge && (
                      <span className={`text-[10px] font-mono px-1 rounded ${
                        active ? 'text-primary/70' : 'text-muted-foreground/60'
                      }`}>
                        {opt.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] leading-tight opacity-70">{opt.hint}</span>
                  {active && (
                    <div className="absolute top-1.5 right-1.5">
                      <Check className="w-2.5 h-2.5 text-primary" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
