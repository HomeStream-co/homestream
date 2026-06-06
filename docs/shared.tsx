/**
 * settings/shared.tsx
 *
 * Primitives shared across all SettingsPanel section files.
 * Nothing here has its own state beyond local UI state.
 */

/* eslint-disable react-refresh/only-export-components */

import { memo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle, X, Eye, EyeOff,
  Loader2, CheckCircle2, XCircle,
} from 'lucide-react';

// ── Format bytes ──────────────────────────────────────────────────────────────

export function fmtBytes(bytes: number): string {
  if (bytes >= 1_099_511_627_776) return `${(bytes / 1_099_511_627_776).toFixed(1)} TB`;
  if (bytes >= 1_073_741_824)     return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576)         return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// ── Toggle ────────────────────────────────────────────────────────────────────

export const Toggle = memo(function Toggle({
  checked, onChange, label, description, icon: Icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  icon?: React.ElementType;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group py-2">
      {Icon && (
        <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0 group-hover:text-foreground transition-colors" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-tight">{label}</p>
        {description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
});

// ── SectionHeader ─────────────────────────────────────────────────────────────

export const SectionHeader = memo(function SectionHeader({
  icon: Icon, label,
}: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-1">
      <Icon className="w-3.5 h-3.5 text-primary" />
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
        {label}
      </p>
    </div>
  );
});

// ── ConfirmDialog ─────────────────────────────────────────────────────────────

export interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  variant?: 'destructive' | 'warning';
}

export function ConfirmDialog({
  open, title, message, confirmLabel, onConfirm, onCancel, variant = 'destructive',
}: ConfirmDialogState & { onCancel: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="relative z-10 w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
              variant === 'destructive' ? 'bg-destructive/15' : 'bg-yellow-500/15'
            }`}
          >
            <AlertTriangle
              className={`w-5 h-5 ${
                variant === 'destructive' ? 'text-destructive' : 'text-yellow-400'
              }`}
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{message}</p>
          </div>
          <button
            onClick={onCancel}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
              variant === 'destructive'
                ? 'bg-destructive/20 hover:bg-destructive/30 text-destructive border border-destructive/30'
                : 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30'
            }`}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/70 text-muted-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── ApiKeyField ───────────────────────────────────────────────────────────────

export type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

export function ApiKeyField({
  label, labelIcon, description, descriptionLink, value, onChange, onTest, placeholder, testLabel,
}: {
  label: string;
  labelIcon?: ReactNode;
  description: string;
  descriptionLink?: { href: string; label: string };
  value: string;
  onChange: (v: string) => void;
  onTest?: () => Promise<{ ok: boolean; message?: string }>;
  placeholder?: string;
  testLabel?: string;
}) {
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<TestStatus>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [dirty, setDirty] = useState(false);

  const handleTest = async () => {
    if (!onTest) return;
    setStatus('testing');
    setTestMsg('');
    try {
      const result = await onTest();
      setStatus(result.ok ? 'ok' : 'error');
      setTestMsg(result.message ?? (result.ok ? 'Connected' : 'Failed'));
    } catch (err) {
      setStatus('error');
      setTestMsg(String(err));
    }
  };

  return (
    <div className="py-2.5">
      <p className="text-sm text-foreground font-medium mb-0.5 flex items-center gap-1.5">
        {labelIcon}{label}
      </p>
      <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
        {description}
        {descriptionLink && (
          <> <a href={descriptionLink.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">{descriptionLink.label}</a></>
        )}
      </p>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={e => { onChange(e.target.value); setDirty(true); setStatus('idle'); }}
            placeholder={placeholder ?? 'Enter API key…'}
            className="w-full pr-8 pl-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        {onTest && (
          <button
            onClick={handleTest}
            disabled={!value.trim() || status === 'testing'}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors disabled:opacity-40 flex-shrink-0 bg-muted hover:bg-muted/80 border-border text-foreground"
          >
            {status === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" /> :
             status === 'ok'      ? <CheckCircle2 className="w-3 h-3 text-green-400" /> :
             status === 'error'   ? <XCircle className="w-3 h-3 text-destructive" /> : null}
            {testLabel ?? 'Test'}
          </button>
        )}
      </div>
      {testMsg && (
        <p className={`text-[10px] mt-1.5 ${status === 'ok' ? 'text-green-400' : 'text-destructive'}`}>
          {status === 'ok' ? '✓ ' : '✗ '}{testMsg}
        </p>
      )}
      {dirty && status === 'idle' && (
        <p className="text-[10px] text-yellow-400 mt-1">Unsaved — click Save below</p>
      )}
    </div>
  );
}
