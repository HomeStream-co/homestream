/**
 * RestrictedContentGuard
 *
 * Wraps any page that shows a single piece of content (movie detail, show
 * detail, player). When the active profile is restricted AND the content's
 * MPAA rating is not in the allowed list, the page is replaced with a PIN
 * challenge overlay.
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, ArrowLeft, ShieldAlert } from 'lucide-react';
import { useProfile, KIDS_ALLOWED_RATINGS } from '@/context/ProfileContext';

const SESSION_TTL_MS = 30 * 60 * 1000;

function sessionKey(profileId: string) {
  return `homestream-parental-unlock-${profileId}`;
}

function isUnlocked(profileId: string): boolean {
  try {
    const raw = sessionStorage.getItem(sessionKey(profileId));
    if (!raw) return false;
    const { expiresAt } = JSON.parse(raw) as { expiresAt: number };
    if (Date.now() > expiresAt) { sessionStorage.removeItem(sessionKey(profileId)); return false; }
    return true;
  } catch { return false; }
}

function grantUnlock(profileId: string) {
  sessionStorage.setItem(sessionKey(profileId), JSON.stringify({ expiresAt: Date.now() + SESSION_TTL_MS }));
}

interface PinInputProps {
  profileId: string;
  profileName: string;
  onSuccess: () => void;
  onBack: () => void;
}

function PinInput({ profileId, profileName, onSuccess, onBack }: PinInputProps) {
  const { verifyPin } = useProfile();
  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [shake, setShake] = useState(false);

  const submit = useCallback(async (pin: string) => {
    if (checking) return;
    setChecking(true);
    setError('');
    try {
      const ok = await verifyPin(profileId, pin);
      if (ok) { grantUnlock(profileId); onSuccess(); }
      else {
        setShake(true);
        setError('Incorrect PIN');
        setDigits('');
        setTimeout(() => setShake(false), 500);
      }
    } catch {
      setError('Could not verify PIN. Try again.');
      setDigits('');
    } finally { setChecking(false); }
  }, [checking, profileId, verifyPin, onSuccess]);

  const handleDigit = useCallback((d: string) => {
    const next = (digits + d).slice(0, 8);
    setDigits(next);
    setError('');
    if (next.length >= 4) { setTimeout(() => submit(next), 80); }
  }, [digits, submit]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (/^\d$/.test(e.key)) handleDigit(e.key);
    else if (e.key === 'Backspace') { setDigits(d => d.slice(0, -1)); setError(''); }
    else if (e.key === 'Enter' && digits.length >= 4) submit(digits);
  }, [digits, handleDigit, submit]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center gap-6 p-6"
      onKeyDown={handleKey}
      tabIndex={-1}
      autoFocus
    >
      <button onClick={onBack} className="absolute top-6 left-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" aria-label="Go back">
        <ArrowLeft className="w-4 h-4" />Back
      </button>

      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Lock className="w-7 h-7 text-primary" />
      </motion.div>

      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">Parental PIN Required</h2>
        <p className="text-sm text-muted-foreground mt-1">
          This content is restricted for <span className="text-foreground font-medium">{profileName}</span>
        </p>
      </div>

      <motion.div
        animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="flex gap-3"
        aria-label="PIN entry"
      >
        {Array.from({ length: Math.max(4, digits.length) }).map((_, i) => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${i < digits.length ? 'bg-primary border-primary scale-110' : 'bg-transparent border-muted-foreground/40'}`} />
        ))}
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.p key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-destructive">
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-3 gap-3 w-64">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key) => (
          <button
            key={key}
            disabled={!key || checking}
            onClick={() => {
              if (key === '⌫') { setDigits(d => d.slice(0, -1)); setError(''); }
              else if (key) handleDigit(key);
            }}
            className={`h-14 rounded-xl text-lg font-semibold transition-all
              ${!key ? 'invisible' : ''}
              ${key === '⌫'
                ? 'bg-muted/50 text-muted-foreground hover:bg-muted active:scale-95'
                : 'bg-muted/30 text-foreground hover:bg-muted active:scale-95 border border-border/30'
              }
              disabled:opacity-40 disabled:cursor-not-allowed
            `}
            aria-label={key === '⌫' ? 'Delete' : key}
          >
            {key}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
        Enter the PIN for this profile to access restricted content. Access is granted for 30 minutes.
      </p>
    </div>
  );
}

interface BlockedProps {
  profileName: string;
  contentTitle?: string;
  onBack: () => void;
}

function BlockedScreen({ profileName, contentTitle, onBack }: BlockedProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center gap-6 p-6 text-center">
      <button onClick={onBack} className="absolute top-6 left-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />Back
      </button>
      <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
        <ShieldAlert className="w-7 h-7 text-destructive" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-foreground">Content Restricted</h2>
        {contentTitle && (
          <p className="text-sm text-muted-foreground mt-1">
            <span className="text-foreground font-medium">{contentTitle}</span> is not available for this profile.
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-2">
          <span className="text-foreground font-medium">{profileName}</span> is a restricted profile. Ask an adult to set a PIN to allow access.
        </p>
      </div>
      <button onClick={onBack} className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
        Go Back
      </button>
    </div>
  );
}

interface RestrictedContentGuardProps {
  rated?: string;
  contentTitle?: string;
  children: ReactNode;
}

export default function RestrictedContentGuard({ rated, contentTitle, children }: RestrictedContentGuardProps) {
  const { activeProfile } = useProfile();
  const navigate = useNavigate();

  const [unlocked, setUnlocked] = useState(() => {
    if (!activeProfile) return false;
    return isUnlocked(activeProfile.id);
  });

  useEffect(() => {
    if (!activeProfile) return;
    setUnlocked(isUnlocked(activeProfile.id));
  }, [activeProfile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeProfile || rated === undefined) return <>{children}</>;
  if (!activeProfile.restricted) return <>{children}</>;

  const normalised = rated.trim().toUpperCase();
  const allowed = normalised === 'N/A' || normalised === '' || KIDS_ALLOWED_RATINGS.includes(normalised);

  if (allowed) return <>{children}</>;
  if (unlocked) return <>{children}</>;

  const handleBack = () => navigate(-1);

  if (!activeProfile.hasPin) {
    return <BlockedScreen profileName={activeProfile.name} contentTitle={contentTitle} onBack={handleBack} />;
  }

  return (
    <PinInput
      profileId={activeProfile.id}
      profileName={activeProfile.name}
      onSuccess={() => setUnlocked(true)}
      onBack={handleBack}
    />
  );
}
