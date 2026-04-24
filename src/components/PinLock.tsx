/**
 * PinLock
 *
 * Netflix-style 4-digit PIN entry overlay shown when the user tries to
 * select a PIN-protected profile.
 *
 * Props:
 *   onVerify    — async function that returns true if the PIN is correct
 *   onSuccess   — called after onVerify resolves true
 *   onCancel    — called when the user dismisses without entering PIN
 *   profileName — shown in the heading ("Enter PIN for Adult")
 */
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Lock } from 'lucide-react';

interface PinLockProps {
  onSuccess: () => void;
  onCancel: () => void;
  profileName?: string;
  /** Async verifier — returns true if PIN is correct. Defaults to always-true. */
  onVerify?: (pin: string) => Promise<boolean>;
}

const PIN_LENGTH = 4;

export default function PinLock({
  onSuccess, onCancel, profileName = 'Adult', onVerify,
}: PinLockProps) {
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''));
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    setError(false);

    if (value && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (value && index === PIN_LENGTH - 1) {
      const pin = [...next.slice(0, PIN_LENGTH - 1), value].join('');
      void checkPin(pin);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Escape') onCancel();
  };

  const checkPin = async (pin: string) => {
    setChecking(true);
    try {
      const valid = onVerify ? await onVerify(pin) : true;
      if (valid) {
        onSuccess();
      } else {
        setError(true);
        setShake(true);
        setTimeout(() => {
          setShake(false);
          setDigits(Array(PIN_LENGTH).fill(''));
          inputRefs.current[0]?.focus();
        }, 600);
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        onClick={e => e.stopPropagation()}
        className={`bg-card border border-border rounded-2xl p-8 w-full max-w-xs shadow-2xl ${shake ? 'animate-shake' : ''}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" />
            <h2 className="text-base font-heading text-foreground">
              Enter PIN for {profileName}
            </h2>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* PIN inputs */}
        <div className="flex justify-center gap-3 mb-6">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              disabled={checking}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className={`w-12 h-14 text-center text-xl font-bold rounded-lg border-2 bg-background text-foreground focus:outline-none transition-colors disabled:opacity-50 ${
                error
                  ? 'border-destructive'
                  : d
                    ? 'border-primary'
                    : 'border-border focus:border-primary/60'
              }`}
            />
          ))}
        </div>

        {/* Checking spinner */}
        {checking && (
          <p className="text-xs text-muted-foreground text-center mb-4 animate-pulse">
            Checking…
          </p>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && !checking && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-destructive text-center mb-4"
            >
              Incorrect PIN — try again
            </motion.p>
          )}
        </AnimatePresence>

        <p className="text-xs text-muted-foreground text-center">
          Enter your 4-digit PIN to access {profileName}
        </p>
      </motion.div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </motion.div>
  );
}
