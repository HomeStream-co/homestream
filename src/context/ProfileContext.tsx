/**
 * ProfileContext
 *
 * Manages the two built-in profiles:
 *   - Adult  — sees everything; optionally PIN-locked
 *   - Kids   — only G and PG rated content is shown across all pages
 *
 * Active profile is persisted to localStorage so it survives page refresh.
 * On first load (no profile chosen yet) the app shows the profile selector screen.
 *
 * PIN lock (Adult profile):
 *   - PIN stored in localStorage under 'homestream-adult-pin'
 *   - If set, selecting Adult profile shows PinLock overlay
 *   - PIN management (set / change / clear) exposed via context
 */
import {
  createContext, useContext, useState, useCallback,
  type ReactNode,
} from 'react';

// ── MPAA ratings that are safe for the Kids profile ──
export const KIDS_ALLOWED_RATINGS = ['G', 'PG', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG'];

export type ProfileId = 'adult' | 'kids';

export interface Profile {
  id: ProfileId;
  name: string;
  avatar: string;           // emoji used as avatar
  color: string;            // Tailwind bg class for avatar ring
  restricted: boolean;      // true = apply content filter
  allowedRatings: string[]; // empty = allow all
}

export const PROFILES: Profile[] = [
  {
    id: 'adult',
    name: 'Adult',
    avatar: '🎬',
    color: 'ring-primary',
    restricted: false,
    allowedRatings: [],
  },
  {
    id: 'kids',
    name: 'Kids',
    avatar: '🧒',
    color: 'ring-yellow-400',
    restricted: true,
    allowedRatings: KIDS_ALLOWED_RATINGS,
  },
];

const PIN_STORAGE_KEY = 'homestream-adult-pin';

interface ProfileContextType {
  activeProfile: Profile | null;
  setActiveProfile: (id: ProfileId) => void;
  clearProfile: () => void;
  /** Returns true if the given MPAA rating is allowed for the active profile */
  isAllowed: (rated?: string) => boolean;
  /** PIN management for Adult profile */
  adultPinEnabled: boolean;
  setAdultPin: (pin: string) => void;
  clearAdultPin: () => void;
  verifyAdultPin: (pin: string) => boolean;
}

const ProfileContext = createContext<ProfileContextType | null>(null);

const STORAGE_KEY = 'homestream-active-profile';

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [activeProfileId, setActiveProfileId] = useState<ProfileId | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ProfileId | null;
      return stored && PROFILES.find(p => p.id === stored) ? stored : null;
    } catch { return null; }
  });

  const [adultPinEnabled, setAdultPinEnabled] = useState(() => {
    try { return !!localStorage.getItem(PIN_STORAGE_KEY); } catch { return false; }
  });

  const activeProfile = activeProfileId
    ? PROFILES.find(p => p.id === activeProfileId) ?? null
    : null;

  const setActiveProfile = useCallback((id: ProfileId) => {
    setActiveProfileId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const clearProfile = useCallback(() => {
    setActiveProfileId(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const isAllowed = useCallback((rated?: string): boolean => {
    if (!activeProfile || !activeProfile.restricted) return true;
    const normalized = (rated ?? '').trim().toUpperCase();
    if (!normalized || normalized === 'N/A' || normalized === 'UNKNOWN' || normalized === 'NR') return false;
    return activeProfile.allowedRatings.includes(normalized);
  }, [activeProfile]);

  const setAdultPin = useCallback((pin: string) => {
    localStorage.setItem(PIN_STORAGE_KEY, pin);
    setAdultPinEnabled(true);
  }, []);

  const clearAdultPin = useCallback(() => {
    localStorage.removeItem(PIN_STORAGE_KEY);
    setAdultPinEnabled(false);
  }, []);

  const verifyAdultPin = useCallback((pin: string): boolean => {
    const stored = localStorage.getItem(PIN_STORAGE_KEY) ?? '';
    return !stored || pin === stored;
  }, []);

  return (
    <ProfileContext.Provider value={{
      activeProfile, setActiveProfile, clearProfile, isAllowed,
      adultPinEnabled, setAdultPin, clearAdultPin, verifyAdultPin,
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
