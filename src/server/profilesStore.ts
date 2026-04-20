/**
 * profilesStore — persistent multi-user profile store
 *
 * Profiles are stored in homestream-profiles.json alongside the library.
 * Two built-in profiles (adult / kids) are always present and cannot be deleted.
 * Users can create up to 6 custom profiles total.
 *
 * PIN hashing: bcryptjs (same as admin password) — PINs are never stored in plain text.
 */

import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const PROFILES_PATH = fs.existsSync('/private') ? '/private/homestream-profiles.json' : path.resolve('./homestream-profiles.json');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoredProfile {
  id: string;
  name: string;
  avatar: string;       // emoji
  color: string;        // Tailwind ring class e.g. "ring-primary"
  restricted: boolean;  // true = kids mode (G/PG only)
  isBuiltIn: boolean;   // true = cannot be deleted
  pinHash?: string;     // bcrypt hash of PIN, undefined = no PIN
  createdAt: string;
}

// ── Built-in profiles (always seeded) ────────────────────────────────────────

const BUILT_INS: StoredProfile[] = [
  {
    id: 'adult',
    name: 'Adult',
    avatar: '🎬',
    color: 'ring-primary',
    restricted: false,
    isBuiltIn: true,
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'kids',
    name: 'Kids',
    avatar: '🧒',
    color: 'ring-yellow-400',
    restricted: true,
    isBuiltIn: true,
    createdAt: new Date(0).toISOString(),
  },
];

// ── Read / write ──────────────────────────────────────────────────────────────

export function readProfiles(): StoredProfile[] {
  if (!fs.existsSync(PROFILES_PATH)) {
    return [...BUILT_INS];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf-8')) as StoredProfile[];
    // Ensure built-ins are always present (merge, don't duplicate)
    const ids = new Set(raw.map(p => p.id));
    const merged = [...raw];
    for (const bi of BUILT_INS) {
      if (!ids.has(bi.id)) merged.unshift(bi);
    }
    return merged;
  } catch {
    return [...BUILT_INS];
  }
}

function writeProfiles(profiles: StoredProfile[]): void {
  fs.writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2));
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function getProfile(id: string): StoredProfile | undefined {
  return readProfiles().find(p => p.id === id);
}

export function createProfile(data: {
  name: string;
  avatar: string;
  color: string;
  restricted: boolean;
}): StoredProfile {
  const profiles = readProfiles();
  if (profiles.length >= 6) throw new Error('Maximum of 6 profiles reached');

  const profile: StoredProfile = {
    id: `profile_${Date.now()}`,
    name: data.name.trim().slice(0, 24),
    avatar: data.avatar,
    color: data.color,
    restricted: data.restricted,
    isBuiltIn: false,
    createdAt: new Date().toISOString(),
  };

  writeProfiles([...profiles, profile]);
  return profile;
}

export function updateProfile(id: string, data: Partial<Pick<StoredProfile, 'name' | 'avatar' | 'color' | 'restricted'>>): StoredProfile {
  const profiles = readProfiles();
  const idx = profiles.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('Profile not found');

  const updated: StoredProfile = {
    ...profiles[idx],
    ...(data.name      !== undefined ? { name: data.name.trim().slice(0, 24) } : {}),
    ...(data.avatar    !== undefined ? { avatar: data.avatar } : {}),
    ...(data.color     !== undefined ? { color: data.color } : {}),
    ...(data.restricted !== undefined ? { restricted: data.restricted } : {}),
  };

  profiles[idx] = updated;
  writeProfiles(profiles);
  return updated;
}

export function deleteProfile(id: string): void {
  const profiles = readProfiles();
  const profile = profiles.find(p => p.id === id);
  if (!profile) throw new Error('Profile not found');
  if (profile.isBuiltIn) throw new Error('Built-in profiles cannot be deleted');
  writeProfiles(profiles.filter(p => p.id !== id));
}

// ── PIN management ────────────────────────────────────────────────────────────

export async function setPin(id: string, pin: string): Promise<void> {
  const profiles = readProfiles();
  const idx = profiles.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('Profile not found');
  profiles[idx].pinHash = await bcrypt.hash(pin, 10);
  writeProfiles(profiles);
}

export async function verifyPin(id: string, pin: string): Promise<boolean> {
  const profile = getProfile(id);
  if (!profile) throw new Error('Profile not found');
  if (!profile.pinHash) return true; // no PIN set — always passes
  return bcrypt.compare(pin, profile.pinHash);
}

export function clearPin(id: string): void {
  const profiles = readProfiles();
  const idx = profiles.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('Profile not found');
  delete profiles[idx].pinHash;
  writeProfiles(profiles);
}

export function hasPin(id: string): boolean {
  const profile = getProfile(id);
  return !!profile?.pinHash;
}

// ── Safe public shape (no pinHash exposed) ───────────────────────────────────

export interface PublicProfile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  restricted: boolean;
  isBuiltIn: boolean;
  hasPin: boolean;
  createdAt: string;
}

export function toPublic(p: StoredProfile): PublicProfile {
  return {
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    color: p.color,
    restricted: p.restricted,
    isBuiltIn: p.isBuiltIn,
    hasPin: !!p.pinHash,
    createdAt: p.createdAt,
  };
}
