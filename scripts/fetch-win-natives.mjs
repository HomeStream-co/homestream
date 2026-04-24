/**
 * fetch-win-natives.mjs
 *
 * Downloads Windows x64 prebuilt native binaries for packages that ship
 * Linux-only builds when installed on the build machine (Alpine/Linux).
 *
 * Run this BEFORE electron-builder packages the app so the correct
 * platform-specific .node files are in node_modules when the asar is built.
 *
 * Currently handles:
 *   - node-datachannel  (webtorrent → @thaunknown/simple-peer → webrtc-polyfill)
 *
 * How it works:
 *   1. Downloads the GitHub Releases prebuild tarball for win32-x64
 *   2. Extracts the .node file
 *   3. Replaces the Linux build/Release/node_datachannel.node with the Windows one
 *   4. After electron-builder runs, the restore step puts the Linux binary back
 *      so the dev server keeps working normally.
 */

import { execSync } from 'child_process';
import { createWriteStream, existsSync, mkdirSync, copyFileSync, renameSync, readFileSync } from 'fs';
import { createGunzip } from 'zlib';
import { extract } from 'tar';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// ── node-datachannel ──────────────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync(path.join(root, 'node_modules/node-datachannel/package.json'), 'utf-8'));
const version = pkg.version;  // e.g. "0.32.2"
const napiVersion = pkg.binary?.napi_versions?.[0] ?? 8;

const tarUrl = `https://github.com/murat-dogan/node-datachannel/releases/download/v${version}/node-datachannel-v${version}-napi-v${napiVersion}-win32-x64.tar.gz`;
const destDir  = path.join(root, 'node_modules/node-datachannel/build/Release');
const destFile = path.join(destDir, 'node_datachannel.node');
const backupFile = path.join(destDir, 'node_datachannel.node.linux-backup');
const tmpTar   = path.join(root, 'node_modules/node-datachannel', `win32-x64-napi${napiVersion}.tar.gz`);

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    function get(u) {
      https.get(u, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          return;
        }
        const out = createWriteStream(dest);
        res.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
      }).on('error', reject);
    }
    get(url);
  });
}

async function extractNodeFile(tarPath, destDir) {
  // The tarball contains: build/Release/node_datachannel.node
  // cwd must be the package root so the path resolves correctly:
  //   node_modules/node-datachannel/ + build/Release/node_datachannel.node
  const pkgRoot = path.resolve(destDir, '..', '..');  // node_modules/node-datachannel
  await extract({
    file: tarPath,
    cwd: pkgRoot,
    filter: (p) => p.includes('node_datachannel.node'),
  });
}

async function main() {
  const mode = process.argv[2]; // "fetch" or "restore"

  if (mode === 'restore') {
    // Put the Linux binary back after packaging
    if (existsSync(backupFile)) {
      renameSync(backupFile, destFile);
      console.log('[win-natives] ✓ Restored Linux node-datachannel binary');
    } else {
      console.log('[win-natives] No backup found — nothing to restore');
    }
    return;
  }

  // Default: fetch Windows binary
  console.log(`[win-natives] Fetching node-datachannel v${version} win32-x64 (napi-v${napiVersion})...`);

  mkdirSync(destDir, { recursive: true });

  // Backup the Linux binary
  if (existsSync(destFile) && !existsSync(backupFile)) {
    copyFileSync(destFile, backupFile);
    console.log('[win-natives] Backed up Linux binary');
  }

  // Download
  await downloadFile(tarUrl, tmpTar);
  console.log('[win-natives] Downloaded tarball');

  // Extract
  await extractNodeFile(tmpTar, destDir);
  console.log('[win-natives] Extracted Windows .node binary');

  // Verify
  if (!existsSync(destFile)) {
    throw new Error('Extraction failed — node_datachannel.node not found after extract');
  }

  // Clean up tarball
  try { execSync(`rm -f "${tmpTar}"`); } catch { /* ignore */ }

  console.log('[win-natives] ✓ node-datachannel win32-x64 binary in place');
}

main().catch(err => {
  console.error('[win-natives] ERROR:', err.message);
  process.exit(1);
});
