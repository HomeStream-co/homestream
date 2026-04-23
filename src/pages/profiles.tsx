/**
 * Profiles — /profiles
 *
 * Netflix-style "Who's watching?" screen with full multi-user management:
 *   - Select a profile (with PIN gate if locked)
 *   - Create / edit / delete custom profiles
 *   - Set / clear PIN per profile
 *   - Kids profile badge (content-restricted)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Pencil, Trash2, Lock, LockOpen, Check, X, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useProfile, type Profile } from '@/context/ProfileContext';
import PinLock from '@/components/PinLock';

// ── Avatar & colour options ───────────────────────────────────────────────────
const AVATAR_OPTIONS = ['🎬', '🎭', '🎮', '🎵', '📚', '🌙', '⚡', '🔥', '🌊', '🦁', '🐉', '🚀', '🧒', '👩', '👨', '🧑'];
const COLOR_OPTIONS = [
  { label: 'Blue',   value: 'ring-primary' },
  { label: 'Yellow', value: 'ring-yellow-400' },
  { label: 'Green',  value: 'ring-green-400' },
  { label: 'Pink',   value: 'ring-pink-400' },
  { label: 'Purple', value: 'ring-purple-400' },
  { label: 'Orange', value: 'ring-orange-400' },
  { label: 'Red',    value: 'ring-red-400' },
  { label: 'Teal',   value: 'ring-teal-400' },
];

// ── Colour ring → background tint map ────────────────────────────────────────
const RING_TO_BG: Record<string, string> = {
  'ring-primary':    'bg-primary/10',
  'ring-yellow-400': 'bg-yellow-950/40',
  'ring-green-400':  'bg-green-950/40',
  'ring-pink-400':   'bg-pink-950/40',
  'ring-purple-400': 'bg-purple-950/40',
  'ring-orange-400': 'bg-orange-950/40',
  'ring-red-400':    'bg-red-950/40',
  'ring-teal-400':   'bg-teal-950/40',
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface ProfileCardProps {
  profile: Profile;
  index: number;
  isManaging: boolean;
  onSelect: (p: Profile) => void;
  onEdit: (p: Profile) => void;
  onDelete: (p: Profile) => void;
}

function ProfileCard({ profile, index, isManaging, onSelect, onEdit, onDelete }: ProfileCardProps) {
  const bg = RING_TO_BG[profile.color] ?? 'bg-card';

  return (
    <motion.div
      key={profile.id}
      initial={{ opacity: 0, scale: 0.85, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.07, duration: 0.35, ease: 'backOut' as const }}
      className="flex flex-col items-center gap-3"
    >
      <motion.button
        whileHover={{ scale: isManaging ? 1.02 : 1.08 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => isManaging ? onEdit(profile) : onSelect(profile)}
        className="relative group focus:outline-none"
      >
        {/* Avatar */}
        <div className={`
          w-28 h-28 sm:w-32 sm:h-32 rounded-xl flex items-center justify-center text-5xl
          ${bg} border-2 border-transparent
          ${!isManaging ? 'group-hover:border-white' : 'group-hover:border-primary'}
          transition-all duration-200
        `}>
          {profile.avatar}
        </div>

        {/* Badges */}
        {profile.hasPin && (
          <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg">
            <Lock className="w-3 h-3 text-primary-foreground" />
          </div>
        )}
        {profile.restricted && (
          <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg">
            <ShieldCheck className="w-3 h-3 text-black" />
          </div>
        )}

        {/* Edit overlay */}
        {isManaging && (
          <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Pencil className="w-6 h-6 text-white" />
          </div>
        )}
      </motion.button>

      {/* Name */}
      <span className="text-muted-foreground group-hover:text-foreground text-sm font-medium tracking-wide text-center max-w-[8rem] truncate">
        {profile.name}
      </span>

      {/* Delete button (manage mode, non-built-in only) */}
      {isManaging && !profile.isBuiltIn && (
        <button
          onClick={() => onDelete(profile)}
          className="text-xs text-destructive/70 hover:text-destructive flex items-center gap-1 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      )}
    </motion.div>
  );
}

// ── Edit / Create modal ───────────────────────────────────────────────────────

interface EditModalProps {
  profile: Profile | null; // null = create mode
  onClose: () => void;
  onSave: (data: { name: string; avatar: string; color: string; restricted: boolean }) => Promise<void>;
  onSetPin: (pin: string) => Promise<void>;
  onClearPin: (currentPin: string) => Promise<void>;
  onVerifyPin: (pin: string) => Promise<boolean>;
}

function EditModal({ profile, onClose, onSave, onSetPin, onClearPin, onVerifyPin }: EditModalProps) {
  const isCreate = !profile;
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar ?? '🎭');
  const [color, setColor] = useState(profile?.color ?? 'ring-primary');
  const [restricted, setRestricted] = useState(profile?.restricted ?? false);
  const [saving, setSaving] = useState(false);

  // PIN sub-panel
  const [pinMode, setPinMode] = useState<'idle' | 'set' | 'clear-verify' | 'clear-confirm'>('idle');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), avatar, color, restricted });
      onClose();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSetPin() {
    if (newPin.length < 4) { setPinError('PIN must be at least 4 digits'); return; }
    if (newPin !== confirmPin) { setPinError('PINs do not match'); return; }
    setPinSaving(true);
    try {
      await onSetPin(newPin);
      toast.success('PIN set successfully');
      setPinMode('idle');
      setNewPin(''); setConfirmPin(''); setPinError('');
    } catch (err) {
      setPinError(String(err));
    } finally {
      setPinSaving(false);
    }
  }

  async function handleClearPin() {
    setPinSaving(true);
    try {
      const valid = await onVerifyPin(currentPin);
      if (!valid) { setPinError('Incorrect PIN'); setPinSaving(false); return; }
      await onClearPin(currentPin);
      toast.success('PIN removed');
      setPinMode('idle');
      setCurrentPin(''); setPinError('');
    } catch (err) {
      setPinError(String(err));
    } finally {
      setPinSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-heading text-foreground">
            {isCreate ? 'New Profile' : `Edit — ${profile.name}`}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview */}
        <div className="flex justify-center mb-6">
          <div className={`w-24 h-24 rounded-xl flex items-center justify-center text-5xl ${RING_TO_BG[color] ?? 'bg-card'} ring-4 ${color}`}>
            {avatar}
          </div>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value.slice(0, 24))}
            placeholder="Profile name"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Avatar picker */}
        <div className="mb-4">
          <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Avatar</label>
          <div className="grid grid-cols-8 gap-1.5">
            {AVATAR_OPTIONS.map(em => (
              <button
                key={em}
                onClick={() => setAvatar(em)}
                className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center transition-all ${
                  avatar === em ? 'bg-primary/20 ring-2 ring-primary' : 'bg-background hover:bg-muted'
                }`}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        {/* Colour picker */}
        <div className="mb-4">
          <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Colour</label>
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                title={c.label}
                className={`w-8 h-8 rounded-full ring-4 ${c.value} transition-transform ${
                  color === c.value ? 'scale-110 ring-offset-2 ring-offset-card' : 'opacity-60 hover:opacity-100'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Kids mode toggle */}
        {!profile?.isBuiltIn && (
          <div className="mb-5 rounded-xl border border-yellow-500/25 bg-yellow-500/5 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                <div>
                  <p className="text-sm text-foreground font-medium">Kids Mode</p>
                  <p className="text-xs text-muted-foreground">Restricts to G, PG, TV-Y, TV-Y7, TV-G, TV-PG only</p>
                </div>
              </div>
            <button
              onClick={() => setRestricted(r => !r)}
              className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${restricted ? 'bg-yellow-500' : 'bg-muted'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${restricted ? 'translate-x-4' : ''}`} />
            </button>
          </div>
          {restricted && (
            <div className="px-3 pb-3 text-[11px] text-yellow-400/80 leading-relaxed">
              This profile will only see G, PG, TV-Y, TV-Y7, TV-G and TV-PG content.
              Any attempt to open restricted content shows a block screen.
              Set a PIN below to let a parent temporarily unlock it.
            </div>
          )}
        </div>
        )}

        {/* PIN management — shown for all non-built-in profiles in edit mode */}
        {!isCreate && (
          <div className="mb-5 border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 bg-background">
              <div className="flex items-center gap-2">
                {profile?.hasPin ? <Lock className="w-4 h-4 text-primary" /> : <LockOpen className="w-4 h-4 text-muted-foreground" />}
                <div>
                  <p className="text-sm text-foreground font-medium">
                    {profile?.restricted ? 'Parental unlock PIN' : 'Profile PIN lock'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {profile?.restricted
                      ? (profile?.hasPin ? 'PIN set — parents can unlock restricted content' : 'No PIN — restricted content is hard-blocked')
                      : (profile?.hasPin ? 'PIN required to select this profile' : 'No PIN — anyone can select this profile')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setPinMode(profile?.hasPin ? 'clear-verify' : 'set'); setPinError(''); }}
                className="text-xs text-primary hover:underline"
              >
                {profile?.hasPin ? 'Remove PIN' : 'Set PIN'}
              </button>
            </div>

            <AnimatePresence>
              {pinMode === 'set' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 py-3 border-t border-border space-y-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="New PIN (4–8 digits)"
                      value={newPin}
                      onChange={e => { setNewPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                      className="w-full bg-card border border-border rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="Confirm PIN"
                      value={confirmPin}
                      onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                      className="w-full bg-card border border-border rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                    {pinError && <p className="text-xs text-destructive">{pinError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSetPin}
                        disabled={pinSaving}
                        className="flex-1 bg-primary text-primary-foreground rounded px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {pinSaving ? 'Saving…' : 'Save PIN'}
                      </button>
                      <button
                        onClick={() => { setPinMode('idle'); setNewPin(''); setConfirmPin(''); setPinError(''); }}
                        className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {pinMode === 'clear-verify' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 py-3 border-t border-border space-y-2">
                    <p className="text-xs text-muted-foreground">Enter current PIN to remove it</p>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="Current PIN"
                      value={currentPin}
                      onChange={e => { setCurrentPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                      className="w-full bg-card border border-border rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                    {pinError && <p className="text-xs text-destructive">{pinError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleClearPin}
                        disabled={pinSaving}
                        className="flex-1 bg-destructive text-destructive-foreground rounded px-3 py-1.5 text-xs font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                      >
                        {pinSaving ? 'Removing…' : 'Remove PIN'}
                      </button>
                      <button
                        onClick={() => { setPinMode('idle'); setCurrentPin(''); setPinError(''); }}
                        className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Save / Cancel */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 bg-primary text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <span className="animate-pulse">Saving…</span>
            ) : (
              <><Check className="w-4 h-4" />{isCreate ? 'Create Profile' : 'Save Changes'}</>
            )}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({ profile, onConfirm, onCancel }: { profile: Profile; onConfirm: () => void; onCancel: () => void }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl"
      >
        <div className="text-center mb-5">
          <div className="text-5xl mb-3">{profile.avatar}</div>
          <h2 className="text-base font-heading text-foreground mb-1">Delete "{profile.name}"?</h2>
          <p className="text-xs text-muted-foreground">Watch history for this profile will be removed. This cannot be undone.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={async () => { setDeleting(true); onConfirm(); }}
            disabled={deleting}
            className="flex-1 bg-destructive text-destructive-foreground rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button onClick={onCancel} className="flex-1 border border-border rounded-lg px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProfilesPage() {
  const {
    profiles, loading, activeProfile,
    setActiveProfile, createProfile, updateProfile, deleteProfile,
    setPin, verifyPin, clearPin,
  } = useProfile();
  const navigate = useNavigate();

  const [isManaging, setIsManaging] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null | 'new'>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [pinTarget, setPinTarget] = useState<Profile | null>(null);

  // ── Profile selection ──
  function handleSelect(profile: Profile) {
    if (profile.hasPin) {
      setPinTarget(profile);
    } else {
      setActiveProfile(profile.id);
      navigate('/');
    }
  }

  function handlePinSuccess() {
    if (!pinTarget) return;
    setActiveProfile(pinTarget.id);
    setPinTarget(null);
    navigate('/');
  }

  // ── CRUD handlers ──
  async function handleSave(data: { name: string; avatar: string; color: string; restricted: boolean }) {
    if (editTarget === 'new') {
      await createProfile(data);
      toast.success('Profile created');
    } else if (editTarget) {
      await updateProfile(editTarget.id, data);
      toast.success('Profile updated');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteProfile(deleteTarget.id);
      toast.success(`"${deleteTarget.name}" deleted`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDeleteTarget(null);
    }
  }

  const canAddMore = profiles.length < 6;

  // Hide management controls when the active profile is kids/restricted
  const activeIsRestricted = activeProfile?.restricted ?? false;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start pt-16 px-4 pb-12">
      <title>HomeStream — Who's Watching?</title>

      {/* Logo */}
      <motion.p
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-primary font-heading text-3xl font-bold tracking-widest mb-12"
      >
        HOMESTREAM
      </motion.p>

      {/* Heading */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="text-3xl sm:text-4xl font-heading text-foreground mb-10 tracking-wide"
      >
        {isManaging ? 'Manage Profiles' : "Who's watching?"}
      </motion.h1>

      {/* Profile grid */}
      {loading ? (
        <div className="flex gap-8">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex flex-col items-center gap-3 animate-pulse">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl bg-muted" />
              <div className="h-3 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-start gap-6 sm:gap-10 flex-wrap justify-center">
          {profiles.map((profile, i) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              index={i}
              isManaging={isManaging}
              onSelect={handleSelect}
              onEdit={p => setEditTarget(p)}
              onDelete={p => setDeleteTarget(p)}
            />
          ))}

          {/* Add profile button */}
          {isManaging && canAddMore && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + profiles.length * 0.07, duration: 0.3 }}
              className="flex flex-col items-center gap-3"
            >
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setEditTarget('new')}
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl border-2 border-dashed border-border hover:border-primary flex items-center justify-center transition-colors group"
              >
                <Plus className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
              </motion.button>
              <span className="text-muted-foreground text-sm">Add Profile</span>
            </motion.div>
          )}
        </div>
      )}

      {/* Manage / Done button — hidden when a kids/restricted profile is active */}
      {!activeIsRestricted && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-12 flex flex-col items-center gap-3"
      >
        <button
          onClick={() => setIsManaging(m => !m)}
          className="px-6 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors tracking-wide"
        >
          {isManaging ? 'Done' : 'Manage Profiles'}
        </button>

        {/* Switch profile hint (when a profile is already active) */}
        {activeProfile && !isManaging && (
          <p className="text-xs text-muted-foreground/50">
            Currently watching as <span className="text-muted-foreground">{activeProfile.name}</span>
          </p>
        )}

        {/* Kids mode legend */}
        {!isManaging && (
          <p className="text-xs text-muted-foreground/40 text-center max-w-xs mt-1">
            <ShieldCheck className="w-3 h-3 inline mr-1 text-yellow-500" />
            Kids profiles only show G and PG rated content.
          </p>
        )}
      </motion.div>
      )}

      {/* PIN gate overlay */}
      <AnimatePresence>
        {pinTarget && (
          <PinLock
            profileName={pinTarget.name}
            onSuccess={handlePinSuccess}
            onCancel={() => setPinTarget(null)}
            onVerify={pin => verifyPin(pinTarget.id, pin)}
          />
        )}
      </AnimatePresence>

      {/* Edit / Create modal */}
      <AnimatePresence>
        {editTarget !== null && (
          <EditModal
            profile={editTarget === 'new' ? null : editTarget}
            onClose={() => setEditTarget(null)}
            onSave={handleSave}
            onSetPin={pin => setPin(editTarget === 'new' ? '' : (editTarget as Profile).id, pin)}
            onClearPin={currentPin => clearPin(editTarget === 'new' ? '' : (editTarget as Profile).id, currentPin)}
            onVerifyPin={pin => verifyPin(editTarget === 'new' ? '' : (editTarget as Profile).id, pin)}
          />
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteModal
            profile={deleteTarget}
            onConfirm={handleDelete}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
