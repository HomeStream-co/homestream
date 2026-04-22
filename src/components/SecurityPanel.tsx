/**
 * SecurityPanel — HomeStream security dashboard
 *
 * Shows:
 *  - Security layer status (which layers are active)
 *  - Quarantine queue (files flagged by the scanner)
 *  - Per-file actions: delete permanently or restore to library
 *  - VirusTotal API key configuration
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck, ShieldAlert, ShieldX, Shield,
  Trash2, RotateCcw, RefreshCw, X, ChevronDown,
  ChevronRight, AlertTriangle, CheckCircle2, Lock,
  FileX, Archive, Cpu, Hash, Eye, EyeOff, Loader2,
  Info, ChevronLeft,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuarantineEntry {
  id: string;
  originalPath: string;
  quarantinePath: string;
  reason: string;
  layer: string;
  infoHash?: string;
  title?: string;
  quarantinedAt: string;
  sizeBytes?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function layerIcon(layer: string) {
  if (layer.includes('1') || layer.includes('File List')) return <FileX className="w-3.5 h-3.5" />;
  if (layer.includes('2') || layer.includes('VirusTotal')) return <Hash className="w-3.5 h-3.5" />;
  if (layer.includes('3') || layer.includes('Magic')) return <Cpu className="w-3.5 h-3.5" />;
  if (layer.includes('4') || layer.includes('Archive')) return <Archive className="w-3.5 h-3.5" />;
  return <Shield className="w-3.5 h-3.5" />;
}

// ── Layer status cards ────────────────────────────────────────────────────────

const LAYERS = [
  {
    num: 1,
    name: 'File List Scan',
    desc: 'Blocks torrents containing .exe, .bat, .ps1 and other executables before download starts',
    icon: FileX,
    always: true,
  },
  {
    num: 2,
    name: 'VirusTotal Hash Lookup',
    desc: 'Checks the torrent info hash against VirusTotal\'s database of known malware',
    icon: Hash,
    always: false,
    requiresKey: true,
  },
  {
    num: 3,
    name: 'Magic Bytes Verification',
    desc: 'Reads the first 16 bytes of downloaded files to confirm they are actual video containers',
    icon: Cpu,
    always: true,
  },
  {
    num: 4,
    name: 'Archive Inspection',
    desc: 'Peeks inside ZIP archives to check for dangerous files without extracting anything',
    icon: Archive,
    always: true,
  },
];

// ── Quarantine entry row ──────────────────────────────────────────────────────

function QuarantineRow({
  entry,
  onDelete,
  onRestore,
}: {
  entry: QuarantineEntry;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState<'delete' | 'restore' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filename = entry.originalPath.split('/').pop() ?? entry.originalPath;

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setActing('delete');
    await onDelete(entry.id);
  };

  const handleRestore = async () => {
    setActing('restore');
    await onRestore(entry.id);
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
          <ShieldX className="w-4 h-4 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{entry.title ?? filename}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1 text-[10px] text-red-400">
              {layerIcon(entry.layer)}
              {entry.layer}
            </span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{timeAgo(entry.quarantinedAt)}</span>
            {entry.sizeBytes && (
              <>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground">{formatBytes(entry.sizeBytes)}</span>
              </>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
              {/* Reason */}
              <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/15">
                <p className="text-[11px] font-semibold text-red-400 mb-1">Threat detected</p>
                <p className="text-xs text-foreground">{entry.reason}</p>
              </div>

              {/* Details */}
              <div className="space-y-1.5 text-[11px]">
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-24 flex-shrink-0">Original path</span>
                  <span className="text-foreground font-mono break-all">{entry.originalPath}</span>
                </div>
                {entry.infoHash && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 flex-shrink-0">Info hash</span>
                    <span className="text-foreground font-mono">{entry.infoHash}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-24 flex-shrink-0">Quarantined</span>
                  <span className="text-foreground">{new Date(entry.quarantinedAt).toLocaleString()}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleRestore}
                  disabled={!!acting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:border-primary/40 hover:bg-primary/5 text-foreground transition-colors disabled:opacity-50"
                >
                  {acting === 'restore' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  Restore to library
                </button>
                <button
                  onClick={handleDelete}
                  disabled={!!acting}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                    confirmDelete
                      ? 'bg-red-500 text-white border border-red-500 hover:bg-red-600'
                      : 'border border-red-500/30 text-red-400 hover:bg-red-500/10'
                  }`}
                >
                  {acting === 'delete' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  {confirmDelete ? 'Confirm delete' : 'Delete permanently'}
                </button>
                {confirmDelete && (
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SecurityPanelProps {
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
}

export default function SecurityPanel({ open, onClose, onBack }: SecurityPanelProps) {
  const [quarantine, setQuarantine] = useState<QuarantineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [vtKey, setVtKey] = useState('');
  const [showVtKey, setShowVtKey] = useState(false);
  const [vtSaving, setVtSaving] = useState(false);
  const [vtSaved, setVtSaved] = useState(false);
  const [vtHasKey, setVtHasKey] = useState(false);

  const fetchQuarantine = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/security/quarantine');
      const data = await res.json() as { entries?: QuarantineEntry[] };
      setQuarantine(data.entries ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  // Load VT key status from setup endpoint
  useEffect(() => {
    if (!open) return;
    fetchQuarantine();
    fetch('/api/setup')
      .then(r => r.json())
      .then((d: { config?: { virusTotalApiKey?: string } }) => {
        if (d.config?.virusTotalApiKey) {
          setVtHasKey(true);
          setVtKey(d.config.virusTotalApiKey);
        }
      })
      .catch(() => { /* ignore */ });
  }, [open, fetchQuarantine]);

  const handleDelete = async (id: string) => {
    await fetch('/api/security/quarantine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    setQuarantine(q => q.filter(e => e.id !== id));
  };

  const handleRestore = async (id: string) => {
    await fetch('/api/security/quarantine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', id }),
    });
    setQuarantine(q => q.filter(e => e.id !== id));
  };

  const saveVtKey = async () => {
    setVtSaving(true);
    try {
      await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', virusTotalApiKey: vtKey }),
      });
      setVtSaved(true);
      setVtHasKey(!!vtKey);
      setTimeout(() => setVtSaved(false), 3000);
    } catch { /* ignore */ } finally {
      setVtSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 h-full w-full max-w-lg bg-card border-l border-border shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3">
                {onBack && (
                  <button
                    onClick={onBack}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Back to Settings"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Security Center</h2>
                  <p className="text-[11px] text-muted-foreground">Download protection & quarantine</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* ── Active Layers ── */}
              <div className="px-6 py-5 border-b border-border/50">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Protection Layers
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {LAYERS.map(layer => {
                    const active = layer.always || (layer.requiresKey && vtHasKey);
                    const Icon = layer.icon;
                    return (
                      <div
                        key={layer.num}
                        className={`p-3 rounded-xl border transition-colors ${
                          active
                            ? 'bg-green-500/5 border-green-500/20'
                            : 'bg-muted/30 border-border opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                            active ? 'bg-green-500/15' : 'bg-muted'
                          }`}>
                            <Icon className={`w-3.5 h-3.5 ${active ? 'text-green-400' : 'text-muted-foreground'}`} />
                          </div>
                          <span className={`text-[10px] font-bold ${active ? 'text-green-400' : 'text-muted-foreground'}`}>
                            {active ? '● ACTIVE' : '○ INACTIVE'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-foreground leading-tight">
                          Layer {layer.num}: {layer.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                          {layer.requiresKey && !vtHasKey
                            ? 'Add VirusTotal API key below to activate'
                            : layer.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── VirusTotal API Key ── */}
              <div className="px-6 py-5 border-b border-border/50">
                <div className="flex items-center gap-2 mb-3">
                  <Hash className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    VirusTotal API Key
                  </h3>
                  {vtHasKey && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-green-400 font-semibold">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
                  Free tier at{' '}
                  <a href="https://www.virustotal.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    virustotal.com
                  </a>
                  {' '}— 4 lookups/min, 500/day. Enough for a home server.
                  Hash lookups are instant and never upload your files.
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showVtKey ? 'text' : 'password'}
                      value={vtKey}
                      onChange={e => setVtKey(e.target.value)}
                      placeholder="Paste your VirusTotal API key…"
                      className="w-full pr-8 pl-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowVtKey(s => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showVtKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    onClick={saveVtKey}
                    disabled={vtSaving || !vtKey.trim()}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex-shrink-0 ${
                      vtSaved
                        ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                        : 'bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary'
                    }`}
                  >
                    {vtSaving ? <Loader2 className="w-3 h-3 animate-spin" /> :
                     vtSaved ? <CheckCircle2 className="w-3 h-3" /> :
                     <Lock className="w-3 h-3" />}
                    {vtSaved ? 'Saved!' : 'Save'}
                  </button>
                </div>
              </div>

              {/* ── Quarantine ── */}
              <div className="px-6 py-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-orange-400" />
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Quarantine
                    </h3>
                    {quarantine.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold">
                        {quarantine.length}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={fetchQuarantine}
                    disabled={loading}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {loading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}

                {!loading && quarantine.length === 0 && (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-3">
                      <ShieldCheck className="w-6 h-6 text-green-400" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">Quarantine is empty</p>
                    <p className="text-[11px] text-muted-foreground">
                      All downloads have passed security checks
                    </p>
                  </div>
                )}

                {!loading && quarantine.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-orange-500/5 border border-orange-500/15 mb-4">
                      <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-orange-300 leading-snug">
                        These files were blocked by the security scanner. Review each one before restoring or deleting permanently. Files in quarantine are not served to any device.
                      </p>
                    </div>
                    {quarantine.map(entry => (
                      <QuarantineRow
                        key={entry.id}
                        entry={entry}
                        onDelete={handleDelete}
                        onRestore={handleRestore}
                      />
                    ))}
                  </div>
                )}

                {/* Info box */}
                <div className="mt-6 p-3 rounded-xl bg-muted/30 border border-border">
                  <div className="flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Quarantined files are moved to <code className="font-mono bg-muted px-1 rounded">/media/quarantine/</code> on your server. They are never deleted automatically — you always review first.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
