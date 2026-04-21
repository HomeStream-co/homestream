/**
 * ownershipSeed — Developer ownership lock-in.
 *
 * Runs once at server startup (called from configure.js serverBefore hook).
 *
 * What it does:
 *  1. If ADMIN_PASSWORD secret is set and no admin password is stored yet,
 *     bcrypt-hash it and write it to homestream-config.json automatically.
 *     This means the developer owns the admin account from the first boot —
 *     no one can access the app without the password you set in Secrets.
 *
 *  2. If TMDB_API_KEY secret is set and no TMDB key is stored, seed it.
 *     Same for GOOGLE_AI_API_KEY. This means the app works out of the box
 *     on the cloud deployment without going through the setup wizard for keys.
 *
 *  3. If DEVELOPER_LOCK=true is set, the /api/setup POST endpoint will refuse
 *     to overwrite the admin password — only the developer (via Secrets) can
 *     change it. This prevents any end-user from locking you out of your own app.
 *
 * Security model:
 *  - Secrets live in the platform secret store (never in source code or .env files)
 *  - homestream-config.json stores the bcrypt hash, never the plaintext
 *  - DEVELOPER_LOCK prevents the setup wizard from overwriting the seeded password
 *
 * GitHub safety:
 *  - This file contains NO secrets — it only reads from environment variables
 *  - Safe to commit to a public repository
 */

import bcrypt from 'bcryptjs';
import { readConfig, writeConfig } from './configStore.js';

// Resolve a secret value from process.env.
// The platform injects all secrets as environment variables at runtime,
// so process.env is the correct and only source needed here.
// (getSecret from #airo/secrets is only needed in files that are bundled
// by esbuild for the production server bundle — configure.js is not bundled
// that way, so we use process.env directly.)
function resolveSecret(name: string): string | undefined {
  return process.env[name] || undefined;
}

export async function runOwnershipSeed(): Promise<void> {
  const cfg = readConfig();
  const updates: Record<string, string | boolean> = {};
  let didSeed = false;

  // ── 1. Admin password ──────────────────────────────────────────────────────
  const secretPassword = resolveSecret('ADMIN_PASSWORD');
  if (secretPassword && !cfg.adminPassword) {
    const hashed = await bcrypt.hash(secretPassword, 12);
    updates.adminPassword = hashed;
    didSeed = true;
    console.log('[ownership] Admin password seeded from ADMIN_PASSWORD secret (bcrypt hash stored)');
  }

  // ── 2. TMDB API key ────────────────────────────────────────────────────────
  const secretTmdb = resolveSecret('TMDB_API_KEY');
  if (secretTmdb && !cfg.tmdbApiKey) {
    updates.tmdbApiKey = secretTmdb;
    didSeed = true;
    console.log('[ownership] TMDB API key seeded from TMDB_API_KEY secret');
  }

  // ── 3. Google AI API key ───────────────────────────────────────────────────
  const secretGoogleAi = resolveSecret('GOOGLE_AI_API_KEY');
  if (secretGoogleAi && !cfg.googleAiApiKey) {
    updates.googleAiApiKey = secretGoogleAi;
    didSeed = true;
    console.log('[ownership] Google AI key seeded from GOOGLE_AI_API_KEY secret');
  }

  if (didSeed) {
    writeConfig(updates as Parameters<typeof writeConfig>[0]);
    console.log('[ownership] Config seeded from secrets — stored to homestream-config.json');
  }

  // ── 4. Developer lock status ───────────────────────────────────────────────
  const locked = resolveSecret('DEVELOPER_LOCK') === 'true';
  if (locked) {
    console.log('[ownership] DEVELOPER_LOCK=true — setup wizard cannot overwrite admin password');
  }
}

/**
 * Returns true if DEVELOPER_LOCK=true is set.
 * Used by the setup POST handler to refuse password overwrites.
 * Synchronous — reads process.env only (no async needed at request time).
 */
export function isDeveloperLocked(): boolean {
  return process.env.DEVELOPER_LOCK === 'true';
}
