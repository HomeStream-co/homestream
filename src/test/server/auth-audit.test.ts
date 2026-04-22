/**
 * auth-audit.test.ts
 *
 * Automated security audit: every API endpoint file must contain either:
 *   - requireAuth(       — HomeStream session auth
 *   - requireJellyfinAuth(  — Jellyfin token auth
 *   - OR be on the explicit allowlist of intentionally-open endpoints
 *
 * If this test fails, you added a new endpoint without auth.
 * Either add auth to the new file, or add it to OPEN_ENDPOINTS below
 * with a comment explaining WHY it is intentionally open.
 *
 * Run: npm test -- auth-audit
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// ── Intentionally open endpoints ─────────────────────────────────────────────
// Each entry must have a reason comment.
const OPEN_ENDPOINTS = new Set([
  // Auth flow — must be open so users can log in
  'src/server/api/auth/check/GET.ts',
  'src/server/api/auth/login/POST.ts',
  'src/server/api/auth/logout/POST.ts',

  // Health — intentionally open so Electron waitForServer() can poll it
  // and Docker health checks work without credentials
  'src/server/api/health/GET.ts',

  // Crash log write — must be open so the React error boundary can POST
  // crash reports even before the user has logged in
  'src/server/api/crash-log/POST.ts',

  // Setup wizard — open ONLY before setup is complete (enforced in handler)
  // The handler itself calls isSetupComplete() and then requireAuth()
  'src/server/api/setup/GET.ts',
  'src/server/api/setup/POST.ts',

  // Jellyfin auth — must be open so TV apps can authenticate
  'src/server/api/jellyfin/Users/AuthenticateByName/POST.ts',

  // Jellyfin public info — called before auth by some TV apps to identify the server
  'src/server/api/jellyfin/System/Info/Public/GET.ts',

  // Jellyfin image proxy — serves only poster/backdrop image URLs (no library
  // data, no file paths, no secrets). TV apps load artwork before they have a
  // token; blocking this breaks artwork display in Infuse / Jellyfin clients.
  'src/server/api/jellyfin/Items/[id]/Images/[imageType]/GET.ts',

  // Jellyfin user list — called before auth by some TV apps to enumerate users
  // Returns only static data (no library content, no secrets)
  'src/server/api/jellyfin/Users/GET.ts',
  'src/server/api/jellyfin/Users/[userId]/GET.ts',

  // Profile PIN endpoint — must be open so the PIN numpad can verify
  // without a session (the PIN IS the auth for profile switching)
  'src/server/api/profiles/[id]/pin/POST.ts',

  // Electron platform info — returns only OS/platform metadata (no library
  // data, no secrets). Called by the setup wizard before any auth exists to
  // pre-populate the default media directory for the user's OS.
  'src/server/api/electron/GET.ts',

  // Graceful shutdown — only accepts requests from 127.0.0.1/::1 (enforced
  // in handler). Called by the Electron main process before killing the server
  // child process on Windows (SIGTERM is an immediate kill on Windows).
  // Changed from GET to POST to prevent CSRF.
  'src/server/api/shutdown/POST.ts',

  // API key tester — called from the setup wizard (step 4) before setup is
  // complete and before any admin password exists. Tests TMDB/OMDB/GoogleAI
  // keys server-side so the browser doesn't need cross-origin access.
  'src/server/api/setup/test-keys/POST.ts',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function walkTs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkTs(full));
    } else if (entry.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

const API_DIR = join(process.cwd(), 'src/server/api');

// ── Test ──────────────────────────────────────────────────────────────────────

describe('API auth audit', () => {
  it('every endpoint has requireAuth, requireJellyfinAuth, or is on the open allowlist', () => {
    const files = walkTs(API_DIR);
    const violations: string[] = [];

    for (const file of files) {
      const rel = relative(process.cwd(), file).replace(/\\/g, '/');
      if (OPEN_ENDPOINTS.has(rel)) continue;

      const src = readFileSync(file, 'utf-8');
      const hasAuth =
        src.includes('requireAuth(') ||
        src.includes('requireJellyfinAuth(');

      if (!hasAuth) {
        violations.push(rel);
      }
    }

    if (violations.length > 0) {
      const msg = [
        '',
        '╔══════════════════════════════════════════════════════════════╗',
        '║  AUTH AUDIT FAILED — unguarded API endpoints found:         ║',
        '╚══════════════════════════════════════════════════════════════╝',
        '',
        ...violations.map(v => `  ✗  ${v}`),
        '',
        'Fix: add  if (!requireAuth(req, res)) return;  as the first',
        'line inside the handler, OR add the file to OPEN_ENDPOINTS in',
        'src/tests/server/auth-audit.test.ts with a reason comment.',
        '',
      ].join('\n');
      expect.fail(msg);
    }
  });
});
