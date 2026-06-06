/* eslint-disable react-refresh/only-export-components */
/**
 * ProfileContext — multi-user profile management
 *
 * Profiles are stored server-side in homestream-profiles.json.
 * Two built-in profiles (adult / kids) are always present.
 * Users can create up to 6 custom profiles.
 *
 * Active profile is persisted to localStorage so it survives page refresh.
 * On first load (no profile chosen) the app shows the profile selector screen.
 *
 * PIN lock: PINs are hashed server-side with bcrypt.
 *   Verifying a PIN calls POST /api/profiles/:id/pin { action: 'verify', pin }
 */
import {
  createContext, useContext, useState, useCallback, useEffect,
  type ReactNode,
} from 'react';

// ── MPAA ratings safe for Kids profile (default restricted set) ──────────────
export const KIDS_ALLOWED_RATINGS = ['G', 'PG', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG'];

// ── Rating order (mirrors ratingGate.ts) ─────────────────────────────────────
const MOVIE_ORDER = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'X'];
const TV_ORDER    = ['TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'];
const DEFAULT_RESTRICTED = new Set(KIDS_ALLOWED_RATINGS);

function ratingScore(rating: string): number {
  const r = rating.trim().toUpperCase();
  const tvIdx = TV_ORDER.indexOf(r);
  if (tvIdx !== -1) return tvIdx;
  const mvIdx = MOVIE_ORDER.indexOf(r);
  if (mvIdx !== -1) return mvIdx;
  return 99; // unknown → treat as adult
}

function isRatingAllowed(rated: string, maxRating?: string): boolean {
  const r = rated.trim().toUpperCase();
  if (!r || r === 'N/A' || r === 'NR' || r === 'UNKNOWN' || r === 'NOT RATED') return false;
  if (maxRating) return ratingScore(r) <= ratingScore(maxRating);
  return DEFAULT_RESTRICTED.has(r);
}

// ── Public profile shape (mirrors server PublicProfile) ──────────────────────
export interface Profile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  restricted: boolean;
  isBuiltIn: boolean;
  isAdmin: boolean;
  hasPin: boolean;
  createdAt: string;
  maxRating?: string;
}

// ── Context type ─────────────────────────────────────────────────────────────
interface ProfileContextType {
  profiles: Profile[];
  activeProfile: Profile | null;
  loading: boolean;

  /** Select a profile locally (no PIN check, no server cookie). */
  setActiveProfile: (id: string) => void;
  /**
   * Switch to a profile server-side (sets hs-profile cookie) then updates
   * local state. If the profile has a PIN, caller must verify it first via
   * verifyPin() before calling switchProfile().
   */
  switchProfile: (id: string) => Promise<void>;
  clearProfile: () => void;
  refreshProfiles: () => Promise<void>;

  /** Returns true if the given MPAA rating is allowed for the active profile */
  isAllowed: (rated?: string) => boolean;

  /** Create a new custom profile */
  createProfile: (data: { name: string; avatar: string; color: string; restricted: boolean; isAdmin?: boolean }) => Promise<Profile>;
  /** Update an existing profile */
  updateProfile: (id: string, data: Partial<{ name: string; avatar: string; color: string; restricted: boolean; maxRating?: string; isAdmin?: boolean }>) => Promise<Profile>;
  /** Delete a custom profile */
  deleteProfile: (id: string) => Promise<void>;

  /** PIN operations — all talk to the server */
  setPin: (id: string, pin: string) => Promise<void>;
  verifyPin: (id: string, pin: string) => Promise<boolean>;
  clearPin: (id: string, currentPin: string) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | null>(null);

const STORAGE_KEY = 'homestream-active-profile';

// ── Provider ─────────────────────────────────────────────────────────────────
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });

  // ── Load profiles from server ──
  const refreshProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/profiles', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch profiles');
      const data = await res.json() as { profiles: Profile[] };
      setProfiles(data.profiles);
    } catch {
      // Fallback: seed built-ins so the app is never stuck
      setProfiles([
        { id: 'adult', name: 'Adult', avatar: '🎬', color: 'ring-primary',      restricted: false, isBuiltIn: true, isAdmin: true,  hasPin: false, createdAt: '' },
        { id: 'kids',  name: 'Kids',  avatar: '🧒', color: 'ring-yellow-400',   restricted: true,  isBuiltIn: true, isAdmin: false, hasPin: false, createdAt: '' },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshProfiles(); }, [refreshProfiles]);

  const activeProfile = profiles.find(p => p.id === activeProfileId) ?? null;

  const setActiveProfile = useCallback((id: string) => {
    setActiveProfileId(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
  }, []);

  /**
   * Switch profile server-side (sets hs-profile cookie) then syncs local state.
   * Caller must have already verified the PIN if one is set.
   */
  const switchProfile = useCallback(async (id: string): Promise<void> => {
    const res = await fetch('/api/profiles/switch', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? 'Failed to switch profile');
    }
    // Mirror to local state so UI updates immediately
    setActiveProfileId(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
  }, []);

  const clearProfile = useCallback(() => {
    setActiveProfileId(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const isAllowed = useCallback((rated?: string): boolean => {
    // Admin profiles and unrestricted profiles see everything
    if (!activeProfile?.restricted || activeProfile.isAdmin) return true;
    const r = (rated ?? '').trim().toUpperCase();
    if (!r || r === 'N/A' || r === 'NR' || r === 'UNKNOWN' || r === 'NOT RATED') return false;
    return isRatingAllowed(r, activeProfile.maxRating);
  }, [activeProfile]);

  // ── CRUD ──
  const createProfile = useCallback(async (data: { name: string; avatar: string; color: string; restricted: boolean; isAdmin?: boolean }): Promise<Profile> => {
    const res = await fetch('/api/profiles', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? 'Failed to create profile');
    }
    const { profile } = await res.json() as { profile: Profile };
    await refreshProfiles();
    return profile;
  }, [refreshProfiles]);

  const updateProfile = useCallback(async (id: string, data: Partial<{ name: string; avatar: string; color: string; restricted: boolean }>): Promise<Profile> => {
    const res = await fetch(`/api/profiles/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? 'Failed to update profile');
    }
    const { profile } = await res.json() as { profile: Profile };
    await refreshProfiles();
    return profile;
  }, [refreshProfiles]);

  const deleteProfile = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/profiles/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? 'Failed to delete profile');
    }
    // If the deleted profile was active, clear it
    if (activeProfileId === id) clearProfile();
    await refreshProfiles();
  }, [activeProfileId, clearProfile, refreshProfiles]);

  // ── PIN ──
  const setPin = useCallback(async (id: string, pin: string): Promise<void> => {
    const res = await fetch(`/api/profiles/${id}/pin`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', pin }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? 'Failed to set PIN');
    }
    await refreshProfiles();
  }, [refreshProfiles]);

  const verifyPin = useCallback(async (id: string, pin: string): Promise<boolean> => {
    const res = await fetch(`/api/profiles/${id}/pin`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', pin }),
    });
    if (!res.ok) return false;
    const { valid } = await res.json() as { valid: boolean };
    return valid;
  }, []);

  const clearPin = useCallback(async (id: string, currentPin: string): Promise<void> => {
    const res = await fetch(`/api/profiles/${id}/pin`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear', pin: currentPin }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? 'Failed to clear PIN');
    }
    await refreshProfiles();
  }, [refreshProfiles]);

  return (
    <ProfileContext.Provider value={{
      profiles, activeProfile, loading,
      setActiveProfile, switchProfile, clearProfile, refreshProfiles, isAllowed,
      createProfile, updateProfile, deleteProfile,
      setPin, verifyPin, clearPin,
    }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}

// ── Legacy compat — ProfileId type still used in a few places ────────────────
export type ProfileId = string;
