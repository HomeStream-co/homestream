/**
 * ScheduleModal
 *
 * A compact date/time picker modal that lets the user schedule a download
 * for a future time. Opened from the StremioPanel "Schedule" button next to
 * each stream row.
 *
 * Props:
 *   open         — whether the modal is visible
 *   onClose      — called when the user cancels
 *   onSchedule   — called with the chosen ISO timestamp
 *   title        — movie/show name (shown in the header)
 *   loading      — show spinner on the confirm button
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Clock, CheckCircle2, Loader2 } from 'lucide-react';

interface ScheduleModalProps {
  open: boolean;
  onClose: () => void;
  onSchedule: (isoTimestamp: string) => void;
  title: string;
  loading?: boolean;
}

// Quick-pick presets relative to now
const PRESETS = [
  { label: 'Tonight 11 PM',  getDate: () => nextOccurrence(23, 0) },
  { label: 'Tomorrow 6 AM',  getDate: () => nextOccurrence(6, 0, 1) },
  { label: 'Tomorrow noon',  getDate: () => nextOccurrence(12, 0, 1) },
  { label: 'In 2 hours',     getDate: () => new Date(Date.now() + 2 * 3600_000) },
  { label: 'In 6 hours',     getDate: () => new Date(Date.now() + 6 * 3600_000) },
  { label: 'In 12 hours',    getDate: () => new Date(Date.now() + 12 * 3600_000) },
];

function nextOccurrence(hour: number, minute: number, daysAhead = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  // If the time has already passed today, push to tomorrow
  if (daysAhead === 0 && d.getTime() <= Date.now()) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** Format a Date to the value expected by <input type="datetime-local"> */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Minimum value for the datetime-local input (now + 1 minute) */
function minInputValue(): string {
  return toLocalInputValue(new Date(Date.now() + 60_000));
}

export default function ScheduleModal({ open, onClose, onSchedule, title, loading = false }: ScheduleModalProps) {
  const [inputValue, setInputValue] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      const tonight = nextOccurrence(23, 0);
      setInputValue(toLocalInputValue(tonight));
      setSelectedPreset(0);
    }
  }, [open]);

  const handlePreset = (idx: number) => {
    const d = PRESETS[idx].getDate();
    setInputValue(toLocalInputValue(d));
    setSelectedPreset(idx);
  };

  const handleInputChange = (val: string) => {
    setInputValue(val);
    setSelectedPreset(null);
  };

  const handleConfirm = () => {
    if (!inputValue) return;
    const iso = new Date(inputValue).toISOString();
    onSchedule(iso);
  };

  const isValid = inputValue && new Date(inputValue).getTime() > Date.now();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2, ease: 'easeOut' as const }}
            className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Schedule Download</p>
                    <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{title}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Quick presets */}
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wide">Quick pick</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRESETS.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => handlePreset(i)}
                        className={`text-xs px-3 py-2 rounded-xl border transition-all text-left font-medium ${
                          selectedPreset === i
                            ? 'bg-primary/10 border-primary/40 text-primary'
                            : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom datetime */}
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                    <Clock className="w-3 h-3" /> Custom date & time
                  </label>
                  <input
                    type="datetime-local"
                    value={inputValue}
                    min={minInputValue()}
                    onChange={e => handleInputChange(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
                  />
                </div>

                {/* Summary */}
                {isValid && (
                  <div className="flex items-center gap-2 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                    Will download on {new Date(inputValue).toLocaleString(undefined, {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={!isValid || loading}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Scheduling…</>
                      : <><Calendar className="w-3.5 h-3.5" />Schedule</>
                    }
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
