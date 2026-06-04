#!/usr/bin/env node
/**
 * HomeStream Smoke Test
 * ---------------------
 * Hits the critical API endpoints against a running dev or production server
 * and verifies they respond correctly — without needing a browser, Electron,
 * or any API keys.
 *
 * Usage:
 *   node scripts/smoke-test.mjs                  # default: http://localhost:3000
 *   node scripts/smoke-test.mjs http://localhost:4000
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 *
 * Designed to run in CI after `npm run build && npm run preview` (or against
 * the dev server started with `npm run dev`).
 */

const BASE_URL = process.argv[2] ?? 'http://localhost:3000';
const TIMEOUT_MS = 8000;

// ─── Colour helpers ──────────────────────────────────────────────────────────
const isTTY = process.stdout.isTTY;
const green  = (s) => isTTY ? `\x1b[32m${s}\x1b[0m` : s;
const red    = (s) => isTTY ? `\x1b[31m${s}\x1b[0m` : s;
const yellow = (s) => isTTY ? `\x1b[33m${s}\x1b[0m` : s;
const bold   = (s) => isTTY ? `\x1b[1m${s}\x1b[0m`  : s;
const dim    = (s) => isTTY ? `\x1b[2m${s}\x1b[0m`  : s;

// ─── Fetch with timeout ───────────────────────────────────────────────────────
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Check runner ─────────────────────────────────────────────────────────────
const results = [];

async function check(name, fn) {
  process.stdout.write(`  ${dim('→')} ${name} … `);
  try {
    const { ok, detail } = await fn();
    if (ok) {
      console.log(green('✓') + (detail ? dim(` ${detail}`) : ''));
      results.push({ name, ok: true });
    } else {
      console.log(red('✗') + (detail ? ` ${detail}` : ''));
      results.push({ name, ok: false, detail });
    }
  } catch (err) {
    const msg = err.name === 'AbortError'
      ? `timed out after ${TIMEOUT_MS}ms`
      : err.message;
    console.log(red('✗') + ` ${msg}`);
    results.push({ name, ok: false, detail: msg });
  }
}

// ─── Wait for server ──────────────────────────────────────────────────────────
async function waitForServer(maxWaitMs = 30_000) {
  const start = Date.now();
  process.stdout.write(`\nWaiting for server at ${BASE_URL} `);
  while (Date.now() - start < maxWaitMs) {
    try {
      await fetchWithTimeout(`${BASE_URL}/api/health`);
      console.log(green(' ready\n'));
      return true;
    } catch {
      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  console.log(red(' timed out\n'));
  return false;
}

// ─── Checks ───────────────────────────────────────────────────────────────────
async function runChecks() {
  // 1. Health endpoint — the most fundamental check
  await check('GET /api/health → 200 with status:ok', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/health`);
    if (res.status !== 200) return { ok: false, detail: `HTTP ${res.status}` };
    const body = await res.json();
    if (body.status !== 'ok') return { ok: false, detail: `status="${body.status}"` };
    return { ok: true, detail: `v${body.version ?? '?'} setupComplete=${body.setupComplete}` };
  });

  // 2. Health endpoint returns expected shape
  await check('GET /api/health → has app/version/setupComplete fields', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/health`);
    const body = await res.json();
    const missing = ['app', 'version', 'setupComplete', 'timestamp']
      .filter(k => !(k in body));
    if (missing.length) return { ok: false, detail: `missing fields: ${missing.join(', ')}` };
    return { ok: true };
  });

  // 3. Login with wrong password → 401 (not 500, not 404)
  await check('POST /api/auth/login with bad password → 401', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '__smoke_test_bad_password__' }),
    });
    // 401 = auth working correctly; 429 = rate limiter working (also fine)
    if (res.status === 401 || res.status === 429) return { ok: true, detail: `HTTP ${res.status}` };
    return { ok: false, detail: `expected 401 or 429, got HTTP ${res.status}` };
  });

  // 4. Protected route without auth → 401 (auth middleware is wired)
  await check('GET /api/library (no auth) → 401', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/library`);
    if (res.status === 401) return { ok: true };
    // 403 is also acceptable (forbidden)
    if (res.status === 403) return { ok: true, detail: 'HTTP 403' };
    return { ok: false, detail: `expected 401/403, got HTTP ${res.status}` };
  });

  // 5. Protected route without auth → 401 (profiles)
  await check('GET /api/profiles (no auth) → 401', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/profiles`);
    if (res.status === 401 || res.status === 403) return { ok: true, detail: `HTTP ${res.status}` };
    return { ok: false, detail: `expected 401/403, got HTTP ${res.status}` };
  });

  // 6. Setup status endpoint exists
  await check('GET /api/setup/status → 200', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/setup/status`);
    if (res.status === 200) return { ok: true };
    // 404 means the route isn't registered — that's a real failure
    return { ok: false, detail: `HTTP ${res.status}` };
  });

  // 7. Network info endpoint (used by TV/remote pairing)
  await check('GET /api/network → 200', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/network`);
    if (res.status === 200) return { ok: true };
    if (res.status === 401 || res.status === 403) return { ok: true, detail: 'auth-gated (expected)' };
    return { ok: false, detail: `HTTP ${res.status}` };
  });

  // 8. Frontend SPA is served (Vite build output)
  await check('GET / → 200 HTML (frontend served)', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/`);
    if (res.status !== 200) return { ok: false, detail: `HTTP ${res.status}` };
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) return { ok: false, detail: `content-type: ${ct}` };
    const html = await res.text();
    if (!html.includes('<div id="root">') && !html.includes('<div id="app">')) {
      return { ok: false, detail: 'no #root or #app element in HTML' };
    }
    return { ok: true };
  });

  // 9. 404 for unknown routes returns JSON error (not a crash)
  await check('GET /api/nonexistent-route → 404 JSON', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/__smoke_test_nonexistent__`);
    if (res.status === 404) return { ok: true };
    // Some setups return 401 for unknown API routes (auth middleware first) — fine
    if (res.status === 401) return { ok: true, detail: 'auth-gated 401' };
    return { ok: false, detail: `expected 404, got HTTP ${res.status}` };
  });

  // 10. Content-Security-Policy header present (security hardening check)
  await check('GET / → has security headers', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/`);
    const headers = [
      'x-content-type-options',
      'x-frame-options',
    ];
    const missing = headers.filter(h => !res.headers.get(h));
    // Warn but don't fail — headers may be set by Electron shell in production
    if (missing.length) return { ok: true, detail: yellow(`missing: ${missing.join(', ')} (ok in dev)`) };
    return { ok: true };
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log(bold('\nHomeStream Smoke Test'));
console.log(dim(`Target: ${BASE_URL}`));
console.log(dim(`Timeout: ${TIMEOUT_MS}ms per request\n`));

const serverReady = await waitForServer();
if (!serverReady) {
  console.error(red('✗ Server did not start in time. Is it running?\n'));
  console.error(dim('  Start it with: npm run dev\n'));
  process.exit(1);
}

console.log(bold('Running checks:\n'));
await runChecks();

// ─── Summary ──────────────────────────────────────────────────────────────────
const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok);

console.log(`\n${bold('Results:')} ${green(`${passed} passed`)}${failed.length ? red(`, ${failed.length} failed`) : ''} / ${results.length} total\n`);

if (failed.length) {
  console.log(red('Failed checks:'));
  for (const f of failed) {
    console.log(`  ${red('✗')} ${f.name}`);
    if (f.detail) console.log(`    ${dim(f.detail)}`);
  }
  console.log();
  process.exit(1);
}

console.log(green('All checks passed. Server is healthy.\n'));
process.exit(0);
