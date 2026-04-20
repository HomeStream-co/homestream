/**
 * crashLogger — persistent crash log for HomeStream.
 *
 * Writes every unhandled error to /shared-storage/public/assets/crash-log.json
 * (persistent across restarts). Keeps the last 100 entries so the file never
 * grows unbounded.
 *
 * Each entry contains:
 *  - timestamp    ISO-8601 when the crash happened
 *  - type         'uncaughtException' | 'unhandledRejection' | 'expressError' | 'manual'
 *  - message      Short error message
 *  - stack        Full stack trace (if available)
 *  - context      Optional extra context string (e.g. route, component)
 *  - nodeVersion  Node.js version at time of crash
 *  - uptime       Server uptime in seconds at time of crash
 *
 * The log is readable via GET /api/crash-log and displayed in the Debug Panel
 * with a one-click "Copy for support" button.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Storage path ──────────────────────────────────────────────────────────────
// Use persistent storage so crashes survive server restarts.
// Falls back to local ./crash-log.json if persistent storage isn't available.
const PERSISTENT_DIR = '/shared-storage/public/assets';
const LOCAL_FALLBACK  = path.resolve('./crash-log.json');

function getCrashLogPath(): string {
  try {
    if (fs.existsSync(PERSISTENT_DIR)) {
      return path.join(PERSISTENT_DIR, 'crash-log.json');
    }
  } catch { /* ignore */ }
  return LOCAL_FALLBACK;
}

const MAX_ENTRIES = 100;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CrashEntry {
  id: string;
  timestamp: string;
  type: 'uncaughtException' | 'unhandledRejection' | 'expressError' | 'manual' | 'startup';
  message: string;
  stack?: string;
  context?: string;
  nodeVersion: string;
  platform: string;
  uptime: number; // seconds
}

// ── Read / write helpers ──────────────────────────────────────────────────────

function readLog(): CrashEntry[] {
  const logPath = getCrashLogPath();
  try {
    if (!fs.existsSync(logPath)) return [];
    return JSON.parse(fs.readFileSync(logPath, 'utf-8')) as CrashEntry[];
  } catch {
    return [];
  }
}

function writeLog(entries: CrashEntry[]): void {
  const logPath = getCrashLogPath();
  try {
    // Ensure directory exists
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify(entries, null, 2));
  } catch (writeErr) {
    // Last resort — stderr only, never throw from the crash logger itself
    process.stderr.write(`[crashLogger] Failed to write log: ${writeErr}\n`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function logCrash(
  type: CrashEntry['type'],
  error: unknown,
  context?: string,
): void {
  const err = error instanceof Error ? error : new Error(String(error));

  const entry: CrashEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    type,
    message: err.message || String(error),
    stack: err.stack,
    context,
    nodeVersion: process.version,
    platform: `${os.platform()} ${os.arch()} (${os.release()})`,
    uptime: Math.floor(process.uptime()),
  };

  // Always print to stderr so it appears in Docker/Electron logs too
  process.stderr.write(
    `[HomeStream CRASH] [${type}] ${entry.message}\n${entry.stack ?? ''}\n`
  );

  const existing = readLog();
  const updated = [entry, ...existing].slice(0, MAX_ENTRIES);
  writeLog(updated);
}

export function getCrashLog(): CrashEntry[] {
  return readLog();
}

export function clearCrashLog(): void {
  writeLog([]);
}

// ── Process-level handlers ────────────────────────────────────────────────────
// Call once at server startup. Guards via a process-level property so that
// HMR module re-evaluation in dev mode does NOT register duplicate listeners
// (which would trigger MaxListenersExceededWarning and connection drops).

const HANDLERS_KEY = '__homestreamCrashHandlersInstalled__' as keyof NodeJS.Process;

export function installCrashHandlers(): void {
  // Use a property on `process` itself — survives module cache invalidation
  // during Vite HMR restarts, unlike a plain module-level boolean.
  if ((process as Record<string, unknown>)[HANDLERS_KEY]) return;
  (process as Record<string, unknown>)[HANDLERS_KEY] = true;

  // Raise the listener limit slightly to accommodate other libraries that also
  // attach process listeners (e.g. vite-plugin-api-routes, tsx watch mode).
  process.setMaxListeners(20);

  process.on('uncaughtException', (err) => {
    logCrash('uncaughtException', err);
    // Give the log a moment to flush, then exit — uncaughtException leaves
    // the process in an undefined state so we must exit.
    setTimeout(() => process.exit(1), 500);
  });

  process.on('unhandledRejection', (reason) => {
    logCrash('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
    // unhandledRejection is non-fatal — log and continue
  });

  console.log('[crashLogger] Process crash handlers installed');
}
