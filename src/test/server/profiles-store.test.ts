/**
 * profiles-store.test.ts
 *
 * Unit tests for src/server/profilesStore.ts
 *
 * Profiles are the multi-user system. Bugs here mean:
 *   - Built-in profiles (adult/kids) can be deleted — breaks the whole app
 *   - PINs stored in plain text — security hole
 *   - pinHash exposed in API responses — security hole
 *   - 6-profile cap not enforced — unlimited profile creation
 *   - Profile not found errors crash the server
 *
 * bcryptjs is mocked (pure-JS but slow) so tests run fast.
 * fs is mocked so no disk I/O occurs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock bcryptjs ─────────────────────────────────────────────────────────────

vi.mock('bcryptjs', () => ({
  default: {
    hash:    (plain: string, _rounds: number) => Promise.resolve(`hashed:${plain}`),
    compare: (plain: string, hash: string)    => Promise.resolve(hash === `hashed:${plain}`),
  },
  hash:    (plain: string, _rounds: number) => Promise.resolve(`hashed:${plain}`),
  compare: (plain: string, hash: string)    => Promise.resolve(hash === `hashed:${plain}`),
}));

// ── In-memory fs mock ─────────────────────────────────────────────────────────

let diskData: string | null = null;

vi.mock('fs', () => ({
  default: {
    existsSync:    () => diskData !== null,
    readFileSync:  () => { if (diskData === null) throw new Error('ENOENT'); return diskData; },
    writeFileSync: (_p: string, data: string) => { diskData = data; },
  },
  existsSync:    () => diskData !== null,
  readFileSync:  () => { if (diskData === null) throw new Error('ENOENT'); return diskData; },
  writeFileSync: (_p: string, data: string) => { diskData = data; },
}));

vi.mock('../../server/dataDir.js', () => ({
  dataPath: (name: string) => `/tmp/test-${name}`,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────

const {
  readProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  setPin,
  verifyPin,
  clearPin,
  hasPin,
  toPublic,
} = await import('../../server/profilesStore.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetDisk() { diskData = null; }

const SAMPLE_PROFILE = {
  name: 'Alice',
  avatar: '🎭',
  color: 'ring-blue-400',
  restricted: false,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('readProfiles() — built-in profiles', () => {
  beforeEach(resetDisk);

  it('always includes the adult built-in profile', () => {
    const profiles = readProfiles();
    expect(profiles.some(p => p.id === 'adult')).toBe(true);
  });

  it('always includes the kids built-in profile', () => {
    const profiles = readProfiles();
    expect(profiles.some(p => p.id === 'kids')).toBe(true);
  });

  it('kids profile has restricted: true', () => {
    const kids = readProfiles().find(p => p.id === 'kids');
    expect(kids?.restricted).toBe(true);
  });

  it('adult profile has restricted: false', () => {
    const adult = readProfiles().find(p => p.id === 'adult');
    expect(adult?.restricted).toBe(false);
  });

  it('re-inserts missing built-ins when file exists but lacks them', () => {
    // File with only a custom profile — built-ins must be re-added
    diskData = JSON.stringify([{
      id: 'profile_custom',
      name: 'Custom',
      avatar: '🎭',
      color: 'ring-primary',
      restricted: false,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
    }]);
    const profiles = readProfiles();
    expect(profiles.some(p => p.id === 'adult')).toBe(true);
    expect(profiles.some(p => p.id === 'kids')).toBe(true);
  });

  it('returns built-ins on JSON parse error', () => {
    diskData = '{ bad json';
    const profiles = readProfiles();
    expect(profiles.some(p => p.id === 'adult')).toBe(true);
  });
});

describe('getProfile()', () => {
  beforeEach(resetDisk);

  it('returns the adult profile by id', () => {
    const p = getProfile('adult');
    expect(p?.id).toBe('adult');
  });

  it('returns undefined for unknown id', () => {
    expect(getProfile('nonexistent')).toBeUndefined();
  });
});

describe('createProfile()', () => {
  beforeEach(resetDisk);

  it('creates a new profile and returns it', () => {
    const p = createProfile(SAMPLE_PROFILE);
    expect(p.name).toBe('Alice');
    expect(p.avatar).toBe('🎭');
    expect(p.isBuiltIn).toBe(false);
  });

  it('trims and truncates name to 24 chars', () => {
    const p = createProfile({ ...SAMPLE_PROFILE, name: '  ' + 'A'.repeat(30) + '  ' });
    expect(p.name.length).toBeLessThanOrEqual(24);
    expect(p.name).not.toMatch(/^\s|\s$/);
  });

  it('persists the new profile so readProfiles sees it', () => {
    createProfile(SAMPLE_PROFILE);
    const found = readProfiles().find(p => p.name === 'Alice');
    expect(found).toBeDefined();
  });

  it('assigns a unique id starting with profile_', () => {
    const p = createProfile(SAMPLE_PROFILE);
    expect(p.id).toMatch(/^profile_\d+/);
  });

  it('throws when 6-profile cap is reached', () => {
    // Built-ins count as 2, so we can add 4 more (total 6)
    for (let i = 0; i < 4; i++) {
      createProfile({ ...SAMPLE_PROFILE, name: `User${i}` });
    }
    // 7th profile should throw
    expect(() => createProfile({ ...SAMPLE_PROFILE, name: 'TooMany' })).toThrow('Maximum');
  });
});

describe('updateProfile()', () => {
  beforeEach(resetDisk);

  it('updates name and returns the updated profile', () => {
    const p = createProfile(SAMPLE_PROFILE);
    const updated = updateProfile(p.id, { name: 'Bob' });
    expect(updated.name).toBe('Bob');
  });

  it('updates restricted flag', () => {
    const p = createProfile(SAMPLE_PROFILE);
    const updated = updateProfile(p.id, { restricted: true });
    expect(updated.restricted).toBe(true);
  });

  it('only updates specified fields', () => {
    const p = createProfile(SAMPLE_PROFILE);
    updateProfile(p.id, { name: 'Bob' });
    const found = getProfile(p.id);
    expect(found?.avatar).toBe('🎭'); // unchanged
    expect(found?.color).toBe('ring-blue-400'); // unchanged
  });

  it('throws when profile not found', () => {
    expect(() => updateProfile('nonexistent', { name: 'X' })).toThrow('Profile not found');
  });

  it('can update built-in profiles (name/avatar/color)', () => {
    // Built-ins CAN be renamed — they just can't be deleted
    expect(() => updateProfile('adult', { name: 'Main' })).not.toThrow();
  });
});

describe('deleteProfile()', () => {
  beforeEach(resetDisk);

  it('deletes a custom profile', () => {
    const p = createProfile(SAMPLE_PROFILE);
    deleteProfile(p.id);
    expect(getProfile(p.id)).toBeUndefined();
  });

  it('throws when trying to delete the adult built-in', () => {
    expect(() => deleteProfile('adult')).toThrow('Built-in profiles cannot be deleted');
  });

  it('throws when trying to delete the kids built-in', () => {
    expect(() => deleteProfile('kids')).toThrow('Built-in profiles cannot be deleted');
  });

  it('throws when profile not found', () => {
    expect(() => deleteProfile('nonexistent')).toThrow('Profile not found');
  });
});

describe('PIN management — setPin / verifyPin / clearPin / hasPin', () => {
  beforeEach(resetDisk);

  it('setPin hashes the PIN (never stores plain text)', async () => {
    const p = createProfile(SAMPLE_PROFILE);
    await setPin(p.id, '1234');
    const stored = readProfiles().find(x => x.id === p.id);
    // pinHash should NOT equal the plain PIN
    expect(stored?.pinHash).not.toBe('1234');
    // Our mock hashes as 'hashed:1234'
    expect(stored?.pinHash).toBe('hashed:1234');
  });

  it('verifyPin returns true for correct PIN', async () => {
    const p = createProfile(SAMPLE_PROFILE);
    await setPin(p.id, '1234');
    expect(await verifyPin(p.id, '1234')).toBe(true);
  });

  it('verifyPin returns false for wrong PIN', async () => {
    const p = createProfile(SAMPLE_PROFILE);
    await setPin(p.id, '1234');
    expect(await verifyPin(p.id, '9999')).toBe(false);
  });

  it('verifyPin returns true when no PIN is set (open profile)', async () => {
    const p = createProfile(SAMPLE_PROFILE);
    // No setPin called
    expect(await verifyPin(p.id, 'anything')).toBe(true);
  });

  it('verifyPin throws for unknown profile', async () => {
    await expect(verifyPin('nonexistent', '1234')).rejects.toThrow('Profile not found');
  });

  it('clearPin removes the PIN', async () => {
    const p = createProfile(SAMPLE_PROFILE);
    await setPin(p.id, '1234');
    clearPin(p.id);
    expect(hasPin(p.id)).toBe(false);
    // After clearing, verifyPin should return true (open)
    expect(await verifyPin(p.id, 'anything')).toBe(true);
  });

  it('hasPin returns false when no PIN set', () => {
    const p = createProfile(SAMPLE_PROFILE);
    expect(hasPin(p.id)).toBe(false);
  });

  it('hasPin returns true after setPin', async () => {
    const p = createProfile(SAMPLE_PROFILE);
    await setPin(p.id, '0000');
    expect(hasPin(p.id)).toBe(true);
  });
});

describe('toPublic() — strips pinHash from API response', () => {
  beforeEach(resetDisk);

  it('does not include pinHash in the public shape', async () => {
    const p = createProfile(SAMPLE_PROFILE);
    await setPin(p.id, '1234');
    const stored = readProfiles().find(x => x.id === p.id)!;
    const pub = toPublic(stored);
    expect((pub as Record<string, unknown>).pinHash).toBeUndefined();
  });

  it('includes hasPin: true when PIN is set', async () => {
    const p = createProfile(SAMPLE_PROFILE);
    await setPin(p.id, '1234');
    const stored = readProfiles().find(x => x.id === p.id)!;
    expect(toPublic(stored).hasPin).toBe(true);
  });

  it('includes hasPin: false when no PIN set', () => {
    const p = createProfile(SAMPLE_PROFILE);
    const stored = readProfiles().find(x => x.id === p.id)!;
    expect(toPublic(stored).hasPin).toBe(false);
  });

  it('includes all expected public fields', () => {
    const p = createProfile(SAMPLE_PROFILE);
    const stored = readProfiles().find(x => x.id === p.id)!;
    const pub = toPublic(stored);
    expect(pub).toHaveProperty('id');
    expect(pub).toHaveProperty('name');
    expect(pub).toHaveProperty('avatar');
    expect(pub).toHaveProperty('color');
    expect(pub).toHaveProperty('restricted');
    expect(pub).toHaveProperty('isBuiltIn');
    expect(pub).toHaveProperty('hasPin');
    expect(pub).toHaveProperty('createdAt');
  });
});
