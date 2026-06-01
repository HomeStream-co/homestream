/**
 * Unit tests for profilesStore.ts
 *
 * Strategy: vi.mock() fs so no files are ever touched on disk.
 * Each test group resets the mock store to a known state via beforeEach.
 *
 * Coverage:
 *  - readProfiles: file missing, valid file, built-in merge
 *  - createProfile: success, max-profiles guard, name trimming
 *  - updateProfile: success, not-found
 *  - deleteProfile: success, not-found, built-in guard
 *  - setPin / verifyPin / clearPin / hasPin
 *  - toPublic: never exposes pinHash
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

// ── fs mock ───────────────────────────────────────────────────────────────────

let mockFileExists = false;
let mockFileContent = '';

vi.mock('fs', () => ({
  default: {
    existsSync: () => mockFileExists,
    readFileSync: () => mockFileContent,
    writeFileSync: vi.fn((_path: string, data: string) => {
      // Captures tmp writes; renameSync commits them
      mockFileContent = data;
      mockFileExists = true;
    }),
    renameSync: vi.fn((_src: string, _dest: string) => {
      // Atomic rename: tmp → dest. In the mock, writeFileSync already
      // captured the data, so renameSync is a no-op.
    }),
    // dataDir.ts calls mkdirSync to create the data directory on first access
    mkdirSync: vi.fn(),
  },
}));

// Import AFTER mocking fs
const {
  readProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  setPin,
  verifyPin,
  clearPin,
  hasPin,
  toPublic,
} = await import('../../server/profilesStore');

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetStore(profiles: object[] = []) {
  mockFileExists = profiles.length > 0;
  mockFileContent = JSON.stringify(profiles);
}

const ADULT_BUILTIN = {
  id: 'adult',
  name: 'Adult',
  avatar: '🎬',
  color: 'ring-primary',
  restricted: false,
  isBuiltIn: true,
  isAdmin: true,
  createdAt: new Date(0).toISOString(),
};

const KIDS_BUILTIN = {
  id: 'kids',
  name: 'Kids',
  avatar: '🧒',
  color: 'ring-yellow-400',
  restricted: true,
  isBuiltIn: true,
  isAdmin: false,
  createdAt: new Date(0).toISOString(),
};

// ── readProfiles ──────────────────────────────────────────────────────────────

describe('readProfiles', () => {
  it('returns built-ins when file does not exist', () => {
    resetStore();
    mockFileExists = false;
    const profiles = readProfiles();
    expect(profiles).toHaveLength(2);
    expect(profiles.map(p => p.id)).toEqual(['adult', 'kids']);
  });

  it('returns profiles from file when it exists', () => {
    resetStore([ADULT_BUILTIN, KIDS_BUILTIN]);
    const profiles = readProfiles();
    expect(profiles).toHaveLength(2);
  });

  it('merges missing built-ins into existing file data', () => {
    // File only has adult — kids should be injected
    resetStore([ADULT_BUILTIN]);
    const profiles = readProfiles();
    const ids = profiles.map(p => p.id);
    expect(ids).toContain('adult');
    expect(ids).toContain('kids');
  });

  it('returns built-ins on corrupt JSON', () => {
    mockFileExists = true;
    mockFileContent = 'not valid json {{';
    const profiles = readProfiles();
    expect(profiles.map(p => p.id)).toEqual(['adult', 'kids']);
  });

  it('does not duplicate built-ins if already present in file', () => {
    resetStore([ADULT_BUILTIN, KIDS_BUILTIN]);
    const profiles = readProfiles();
    const adultCount = profiles.filter(p => p.id === 'adult').length;
    expect(adultCount).toBe(1);
  });
});

// ── createProfile ─────────────────────────────────────────────────────────────

describe('createProfile', () => {
  beforeEach(() => resetStore([ADULT_BUILTIN, KIDS_BUILTIN]));

  it('creates a new profile and persists it', () => {
    const profile = createProfile({ name: 'Alice', avatar: '🦊', color: 'ring-red-400', restricted: false });
    expect(profile.name).toBe('Alice');
    expect(profile.avatar).toBe('🦊');
    expect(profile.restricted).toBe(false);
    expect(profile.isBuiltIn).toBe(false);
    expect(profile.id).toMatch(/^profile_/);
    // Should now be in the store
    const all = readProfiles();
    expect(all.find(p => p.id === profile.id)).toBeDefined();
  });

  it('trims and truncates name to 24 chars', () => {
    const profile = createProfile({
      name: '  ' + 'A'.repeat(30) + '  ',
      avatar: '🎭',
      color: 'ring-primary',
      restricted: false,
    });
    expect(profile.name).toHaveLength(24);
    expect(profile.name.startsWith('A')).toBe(true);
  });

  it('throws when 6 profiles already exist', () => {
    // Add 4 custom profiles to the 2 built-ins = 6 total
    for (let i = 0; i < 4; i++) {
      createProfile({ name: `User${i}`, avatar: '😀', color: 'ring-primary', restricted: false });
    }
    expect(() =>
      createProfile({ name: 'One Too Many', avatar: '😀', color: 'ring-primary', restricted: false })
    ).toThrow('Maximum');
  });

  it('sets createdAt to a valid ISO date', () => {
    const profile = createProfile({ name: 'Bob', avatar: '🐻', color: 'ring-blue-400', restricted: false });
    expect(() => new Date(profile.createdAt)).not.toThrow();
    expect(new Date(profile.createdAt).getTime()).toBeGreaterThan(0);
  });
});

// ── updateProfile ─────────────────────────────────────────────────────────────

describe('updateProfile', () => {
  let customId: string;

  beforeEach(() => {
    resetStore([ADULT_BUILTIN, KIDS_BUILTIN]);
    const p = createProfile({ name: 'Charlie', avatar: '🐱', color: 'ring-green-400', restricted: false });
    customId = p.id;
  });

  it('updates name', () => {
    const updated = updateProfile(customId, { name: 'Charles' });
    expect(updated.name).toBe('Charles');
  });

  it('updates avatar', () => {
    const updated = updateProfile(customId, { avatar: '🐶' });
    expect(updated.avatar).toBe('🐶');
  });

  it('updates color', () => {
    const updated = updateProfile(customId, { color: 'ring-purple-400' });
    expect(updated.color).toBe('ring-purple-400');
  });

  it('updates restricted flag', () => {
    const updated = updateProfile(customId, { restricted: true });
    expect(updated.restricted).toBe(true);
  });

  it('partial update preserves other fields', () => {
    const before = readProfiles().find(p => p.id === customId)!;
    const updated = updateProfile(customId, { name: 'NewName' });
    expect(updated.avatar).toBe(before.avatar);
    expect(updated.color).toBe(before.color);
  });

  it('throws on unknown id', () => {
    expect(() => updateProfile('nonexistent', { name: 'X' })).toThrow('not found');
  });

  it('trims and truncates name on update', () => {
    const updated = updateProfile(customId, { name: '  ' + 'Z'.repeat(30) });
    expect(updated.name).toHaveLength(24);
  });
});

// ── deleteProfile ─────────────────────────────────────────────────────────────

describe('deleteProfile', () => {
  let customId: string;

  beforeEach(() => {
    resetStore([ADULT_BUILTIN, KIDS_BUILTIN]);
    const p = createProfile({ name: 'DeleteMe', avatar: '🗑️', color: 'ring-gray-400', restricted: false });
    customId = p.id;
  });

  it('removes the profile from the store', () => {
    deleteProfile(customId);
    const all = readProfiles();
    expect(all.find(p => p.id === customId)).toBeUndefined();
  });

  it('throws on unknown id', () => {
    expect(() => deleteProfile('nonexistent')).toThrow('not found');
  });

  it('throws when trying to delete a built-in profile', () => {
    expect(() => deleteProfile('adult')).toThrow('Built-in');
    expect(() => deleteProfile('kids')).toThrow('Built-in');
  });

  it('leaves other profiles intact after deletion', () => {
    deleteProfile(customId);
    const all = readProfiles();
    expect(all.find(p => p.id === 'adult')).toBeDefined();
    expect(all.find(p => p.id === 'kids')).toBeDefined();
  });
});

// ── PIN management ────────────────────────────────────────────────────────────

describe('PIN management', () => {
  let customId: string;

  beforeEach(() => {
    resetStore([ADULT_BUILTIN, KIDS_BUILTIN]);
    const p = createProfile({ name: 'PinUser', avatar: '🔐', color: 'ring-primary', restricted: false });
    customId = p.id;
  });

  it('hasPin returns false when no PIN is set', () => {
    expect(hasPin(customId)).toBe(false);
  });

  it('setPin stores a bcrypt hash (not plaintext)', async () => {
    await setPin(customId, '1234');
    // Read raw stored data — pinHash should not equal '1234'
    const raw = JSON.parse(mockFileContent) as Array<{ id: string; pinHash?: string }>;
    const stored = raw.find(p => p.id === customId);
    expect(stored?.pinHash).toBeDefined();
    expect(stored?.pinHash).not.toBe('1234');
    expect(stored?.pinHash?.startsWith('$2')).toBe(true); // bcrypt prefix
  });

  it('hasPin returns true after setPin', async () => {
    await setPin(customId, '1234');
    expect(hasPin(customId)).toBe(true);
  });

  it('verifyPin returns true for correct PIN', async () => {
    await setPin(customId, '5678');
    const valid = await verifyPin(customId, '5678');
    expect(valid).toBe(true);
  });

  it('verifyPin returns false for wrong PIN', async () => {
    await setPin(customId, '5678');
    const valid = await verifyPin(customId, '0000');
    expect(valid).toBe(false);
  });

  it('verifyPin returns true when no PIN is set (open profile)', async () => {
    // No PIN set — should always pass
    const valid = await verifyPin(customId, 'anything');
    expect(valid).toBe(true);
  });

  it('clearPin removes the PIN', async () => {
    await setPin(customId, '1234');
    clearPin(customId);
    expect(hasPin(customId)).toBe(false);
  });

  it('verifyPin returns true after PIN is cleared', async () => {
    await setPin(customId, '1234');
    clearPin(customId);
    const valid = await verifyPin(customId, 'anything');
    expect(valid).toBe(true);
  });

  it('setPin throws on unknown profile id', async () => {
    await expect(setPin('nonexistent', '1234')).rejects.toThrow('not found');
  });

  it('verifyPin throws on unknown profile id', async () => {
    await expect(verifyPin('nonexistent', '1234')).rejects.toThrow('not found');
  });

  it('clearPin throws on unknown profile id', () => {
    expect(() => clearPin('nonexistent')).toThrow('not found');
  });

  it('PIN hash is valid bcrypt and can be verified independently', async () => {
    await setPin(customId, '9999');
    const raw = JSON.parse(mockFileContent) as Array<{ id: string; pinHash?: string }>;
    const stored = raw.find(p => p.id === customId);
    const directCheck = await bcrypt.compare('9999', stored!.pinHash!);
    expect(directCheck).toBe(true);
  });
});

// ── toPublic ──────────────────────────────────────────────────────────────────

describe('toPublic', () => {
  it('never exposes pinHash', async () => {
    resetStore([ADULT_BUILTIN, KIDS_BUILTIN]);
    const p = createProfile({ name: 'SafeUser', avatar: '🛡️', color: 'ring-primary', restricted: false });
    await setPin(p.id, '1234');
    const all = readProfiles();
    const stored = all.find(pr => pr.id === p.id)!;
    const pub = toPublic(stored);
    expect((pub as unknown as Record<string, unknown>).pinHash).toBeUndefined();
  });

  it('exposes hasPin as true when PIN is set', async () => {
    resetStore([ADULT_BUILTIN, KIDS_BUILTIN]);
    const p = createProfile({ name: 'PinCheck', avatar: '🔑', color: 'ring-primary', restricted: false });
    await setPin(p.id, '4321');
    const stored = readProfiles().find(pr => pr.id === p.id)!;
    expect(toPublic(stored).hasPin).toBe(true);
  });

  it('exposes hasPin as false when no PIN is set', () => {
    resetStore([ADULT_BUILTIN, KIDS_BUILTIN]);
    const p = createProfile({ name: 'NoPinUser', avatar: '🔓', color: 'ring-primary', restricted: false });
    const stored = readProfiles().find(pr => pr.id === p.id)!;
    expect(toPublic(stored).hasPin).toBe(false);
  });

  it('includes all expected public fields', () => {
    const pub = toPublic({ ...ADULT_BUILTIN });
    expect(pub).toMatchObject({
      id: 'adult',
      name: 'Adult',
      avatar: '🎬',
      color: 'ring-primary',
      restricted: false,
      isBuiltIn: true,
      hasPin: false,
      createdAt: expect.any(String),
    });
  });
});
