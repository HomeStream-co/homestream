/**
 * patch-server-host.mjs
 *
 * Patches node_modules/vite-plugin-api-routes/.api/server.js to replace the
 * hardcoded SERVER_HOST default of "127.0.0.1" with
 * process.env.SERVER_HOST || "0.0.0.0".
 *
 * WHY THIS IS NEEDED:
 *   vite-plugin-api-routes uses dotenv-local to read SERVER_HOST. dotenv-local
 *   reads from .env files only — it NEVER reads process.env. The envInitial
 *   value is used as a fallback when no .env file sets SERVER_HOST. Since the
 *   packaged Electron app has no .env file, the server always binds to
 *   127.0.0.1 (loopback only), blocking all LAN/phone/TV access.
 *
 *   Electron's utilityProcess injects SERVER_HOST='0.0.0.0' into the child
 *   process env, but dotenv-local ignores process.env entirely, so that env
 *   var has zero effect on the listen address.
 *
 * THIS SCRIPT runs as a prebuild step (see package.json "prebuild") so the
 * patch is in place before Vite SSR-compiles server.js → dist/app.js.
 * vite.config.ts also patches dist/app.js after SSR compile as a safety net.
 *
 * The patch is idempotent — running it twice is safe.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverJsPath = resolve(__dirname, '../node_modules/vite-plugin-api-routes/.api/server.js');

let src;
try {
  src = readFileSync(serverJsPath, 'utf-8');
} catch (err) {
  console.error('[patch-server-host] Could not read server.js:', err.message);
  process.exit(1);
}

// Already patched — idempotent
if (src.includes('process.env.SERVER_HOST')) {
  console.log('[patch-server-host] Already patched — skipping.');
  process.exit(0);
}

const patched = src.replace(
  /SERVER_HOST:\s*["']127\.0\.0\.1["']/g,
  'SERVER_HOST: process.env.SERVER_HOST || "0.0.0.0"'
);

if (patched === src) {
  console.error('[patch-server-host] ERROR: Pattern not found in server.js — patch failed!');
  console.error('  File path:', serverJsPath);
  console.error('  File contents (first 500 chars):', src.slice(0, 500));
  process.exit(1);
}

writeFileSync(serverJsPath, patched, 'utf-8');
console.log('[patch-server-host] ✓ Patched server.js: SERVER_HOST default → process.env.SERVER_HOST || "0.0.0.0"');
