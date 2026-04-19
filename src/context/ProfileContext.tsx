/**
 * ProfileContext
 *
 * Manages the two built-in profiles:
 *   - Adult  — sees everything, no restrictions
 *   - Kids   — only G and PG rated content is shown across all pages
 *
 * Active profile is persisted to localStorage so it survives page refresh.
 * On first load (no profile chosen yet) the app shows the profile selector screen.
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

interface ProfileContextType {
  activeProfile: Profile | null;
  setActiveProfile: (id: ProfileId) => void;
  clearProfile: () => void;
  /** Returns true if the given MPAA rating is allowed for the active profile */
  isAllowed: (rated?: string) => boolean;
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

  /**
   * Returns true if the media item's rating is allowed for the current profile.
   * Adult profile always returns true.
   * Kids profile only allows G, PG, and equivalent TV ratings.
   * Items with no rating (N/A, Unknown, undefined) are blocked on Kids profile
   * to be safe — better to hide than show something inappropriate.
   */
  const isAllowed = useCallback((rated?: string): boolean => {
    if (!activeProfile || !activeProfile.restricted) return true;
    if (!rated || rated === 'N/A' || rated === 'Unknown' || rated === 'NR') return false;
    return activeProfile.allowedRatings.includes(rated.trim().toUpperCase());
  }, [activeProfile]);

  return (
    <ProfileContext.Provider value={{ activeProfile, setActiveProfile, clearProfile, isAllowed }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
