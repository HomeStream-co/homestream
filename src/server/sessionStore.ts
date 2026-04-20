/**
 * sessionStore — persistent session management.
 *
 * Replaces the in-memory Map in auth/login/POST.ts with a file-backed store
 * so sessions survive server restarts. Users stay logged in across reboots.
 *
 * Storage: homestream-sessions.json
 * Format:  Record<token, expiryTimestamp>
 *
 * Write strategy: same queue pattern as libraryStore — all writes serialised
 * to prevent concurrent-write corruption.
 *
 * Cleanup: expired sessions are pruned on load and every hour at runtime.
 */

import fs from 'fs';
import crypto from 'crypto';

import { dataPath } from './dataDir.js';
const SESSIONS_PATH = dataPath('homestream-sessions.json');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Write queue (same pattern as libraryStore) ────────────────────────────────

let writeQueue: Promise<void> = Promise.resolve();

function readRaw(): Record<string, number> {
  if (!fs.existsSync(SESSIONS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf-8')) as Record<string, number>;
  } catch {
    return {};
  }
}

function writeRaw(data: Record<string, number>): void {
  fs.writeFileSync(SESSIONS_PATH, JSON.stringify(data), 'utf-8');
}

function enqueueWrite(updater: (current: Record<string, number>) => Record<string, number>): void {
  writeQueue = writeQueue.then(() => {
    const current = readRaw();
    const next = updater(current);
    writeRaw(next);
  }).catch(err => {
    console.error('[sessionStore] Write failed:', err);
  });
}

// ── Prune expired entries ─────────────────────────────────────────────────────

function pruneExpired(sessions: Record<string, number>): Record<string, number> {
  const now = Date.now();
  const pruned: Record<string, number> = {};
  for (const [token, expiry] of Object.entries(sessions)) {
    if (expiry > now) pruned[token] = expiry;
  }
  return pruned;
}

// Prune on startup
enqueueWrite(pruneExpired);

// Prune every hour at runtime
// .unref() so this timer never prevents a clean process exit (SIGTERM/SIGINT)
setInterval(() => {
  enqueueWrite(pruneExpired);
}, 60 * 60 * 1000).unref();

// ── Public API ────────────────────────────────────────────────────────────────

export function createSession(): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiry = Date.now() + SESSION_TTL_MS;
  enqueueWrite(sessions => ({ ...sessions, [token]: expiry }));
  return token;
}

export function isValidSession(token: string): boolean {
  const sessions = readRaw();
  const expiry = sessions[token];
  if (!expiry) return false;
  if (Date.now() > expiry) {
    // Lazy delete
    enqueueWrite(s => {
      const next = { ...s };
      delete next[token];
      return next;
    });
    return false;
  }
  return true;
}

export function deleteSession(token: string): void {
  enqueueWrite(sessions => {
    const next = { ...sessions };
    delete next[token];
    return next;
  });
}

export function clearAllSessions(): void {
  enqueueWrite(() => ({}));
}

export function getSessionCount(): number {
  return Object.keys(readRaw()).length;
}

export { SESSION_TTL_MS };
