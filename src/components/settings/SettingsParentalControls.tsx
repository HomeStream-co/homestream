import { ShieldCheck, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useProfile } from '@/context/ProfileContext';
import { SectionHeader } from './shared';
import type { ConfirmDialogState } from './shared';

interface SettingsParentalControlsProps {
  onClose: () => void;
  onOpenConfirm: (state: Omit<ConfirmDialogState, 'open'>) => void;
  pinMode: 'idle' | 'set' | 'change' | 'confirm';
  pinInput: string;
  pinConfirm: string;
  pinError: string | null;
  onSetPinMode: (mode: 'idle' | 'set' | 'change' | 'confirm') => void;
  onSetPinInput: (v: string) => void;
  onSetPinConfirm: (v: string) => void;
  onSetPinError: (v: string | null) => void;
}

export default function SettingsParentalControls({
  onClose, onOpenConfirm,
  pinMode, pinInput, pinConfirm, pinError,
  onSetPinMode, onSetPinInput, onSetPinConfirm, onSetPinError,
}: SettingsParentalControlsProps) {
  const navigate = useNavigate();
  const { profiles, setPin, clearPin, activeProfile } = useProfile();
  const adultProfile = profiles.find(p => p.id === 'adult');
  const adultPinEnabled = adultProfile?.hasPin ?? false;

  if (activeProfile?.restricted) return null;

  return (
    <div className="border-t border-border/50">
      <SectionHeader icon={ShieldCheck} label="Parental Controls" />
      <div className="px-4 pb-4 space-y-4">
        {/* Explainer */}
        <div className="rounded-xl bg-yellow-500/8 border border-yellow-500/20 p-3 space-y-2">
          <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> How parental controls work
          </p>
          <ul className="text-[11px] text-muted-foreground space-y-1 leading-relaxed">
            <li>
              <span className="text-foreground font-medium">Kids Mode</span> — restricts a profile
              to G, PG, TV-Y, TV-Y7, TV-G and TV-PG rated content only.
            </li>
            <li>
              <span className="text-foreground font-medium">PIN on a kids profile</span> — lets a
              parent temporarily unlock restricted content (30-min session).
            </li>
            <li>
              <span className="text-foreground font-medium">PIN on your adult profile</span> —
              prevents kids from switching to your profile.
            </li>
          </ul>
        </div>

        {/* Profile list */}
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
            All profiles
          </p>
          {profiles.map(p => (
            <div
              key={p.id}
              className="flex items-center gap-3 bg-background rounded-xl px-3 py-2.5 border border-border"
            >
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-xl flex-shrink-0">
                {p.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {p.restricted ? (
                    <span className="text-[10px] bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                      <ShieldCheck className="w-2.5 h-2.5" /> Kids Mode ON
                    </span>
                  ) : (
                    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                      Adult profile
                    </span>
                  )}
                  {p.hasPin ? (
                    <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                      <Lock className="w-2.5 h-2.5" /> PIN set
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60 px-1.5 py-0.5 rounded-full border border-border/40">
                      No PIN
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => { onClose(); navigate('/profiles'); }}
                className="text-[11px] text-primary hover:underline flex-shrink-0"
              >
                Edit
              </button>
            </div>
          ))}
        </div>

        {/* Manage button */}
        <button
          onClick={() => { onClose(); navigate('/profiles'); }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-sm font-medium text-foreground"
        >
          <ShieldCheck className="w-4 h-4 text-yellow-400" />
          Manage Profiles &amp; Parental Controls
        </button>

        {/* Adult PIN */}
        <div className="border-t border-border/40 pt-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">
            Adult profile PIN
          </p>
          <p className="text-[11px] text-muted-foreground mb-3">
            Require a PIN to switch to the Adult profile from the &ldquo;Who&rsquo;s watching?&rdquo; screen.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground">
              PIN lock:{' '}
              <span className={adultPinEnabled ? 'text-green-400' : 'text-muted-foreground'}>
                {adultPinEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </span>
            {adultPinEnabled ? (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onSetPinMode('change');
                    onSetPinInput('');
                    onSetPinConfirm('');
                    onSetPinError(null);
                  }}
                  className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                >
                  Change PIN
                </button>
                <button
                  onClick={() =>
                    onOpenConfirm({
                      title: 'Remove Adult PIN?',
                      message: 'This will allow anyone to switch to the Adult profile without a PIN.',
                      confirmLabel: 'Remove PIN',
                      variant: 'warning',
                      onConfirm: async () => {
                        try {
                          await clearPin('adult', '');
                          onSetPinMode('idle');
                          toast.success('Adult PIN removed');
                        } catch {
                          toast.error('Enter current PIN on the Profiles page to remove it');
                        }
                      },
                    })
                  }
                  className="text-[11px] text-destructive hover:text-destructive/80 transition-colors"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  onSetPinMode('set');
                  onSetPinInput('');
                  onSetPinConfirm('');
                  onSetPinError(null);
                }}
                className="text-[11px] text-primary hover:text-primary/80 transition-colors"
              >
                Set PIN
              </button>
            )}
          </div>

          {(pinMode === 'set' || pinMode === 'change') && (
            <div className="space-y-2 pt-1">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinInput}
                onChange={e => {
                  if (/^\d{0,4}$/.test(e.target.value)) {
                    onSetPinInput(e.target.value);
                    onSetPinError(null);
                  }
                }}
                placeholder="New PIN (4 digits)"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest text-center"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinConfirm}
                onChange={e => {
                  if (/^\d{0,4}$/.test(e.target.value)) {
                    onSetPinConfirm(e.target.value);
                    onSetPinError(null);
                  }
                }}
                placeholder="Confirm PIN"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest text-center"
              />
              {pinError && (
                <p className="text-[11px] text-destructive text-center">{pinError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (pinInput.length < 4) { onSetPinError('PIN must be 4 digits'); return; }
                    if (pinInput !== pinConfirm) { onSetPinError('PINs do not match'); return; }
                    void setPin('adult', pinInput)
                      .then(() => {
                        onSetPinMode('idle');
                        onSetPinInput('');
                        onSetPinConfirm('');
                        toast.success('Adult PIN saved');
                      })
                      .catch(err => onSetPinError(String(err)));
                  }}
                  className="flex-1 bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-xs font-semibold py-2 rounded-lg transition-colors"
                >
                  Save PIN
                </button>
                <button
                  onClick={() => {
                    onSetPinMode('idle');
                    onSetPinInput('');
                    onSetPinConfirm('');
                    onSetPinError(null);
                  }}
                  className="flex-1 bg-muted hover:bg-muted/70 text-muted-foreground text-xs font-semibold py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
