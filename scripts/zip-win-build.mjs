/**
 * zip-win-build.mjs
 *
 * Post-build step for electron:win.
 *
 * electron-builder --dir produces an unpacked Windows app at:
 *   dist-electron/win-unpacked/
 *
 * This script packages that directory into a proper .zip file using:
 *   1. System `zip` command (macOS / Linux with zip installed)
 *   2. Pure-JS ZIP writer (Node.js built-ins only — no dependencies)
 *
 * Why this exists:
 *   The build environment is Alpine Linux (musl). electron-builder's
 *   zip/nsis/portable targets all invoke app-builder which requires
 *   7zip (glibc binary) to extract winCodeSign. Since 7zip can't run
 *   on musl, we use --dir to skip that step and zip manually here.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { deflateRawSync } from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Read version from package.json
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = pkg.version;

const unpacked = path.join(root, 'dist-electron', 'win-unpacked');
const outDir = path.join(root, 'dist-electron');
const zipName = `HomeStream-${version}-win-x64.zip`;
const zipPath = path.join(outDir, zipName);

if (!existsSync(unpacked)) {
  console.error(`[zip-win] ERROR: unpacked dir not found: ${unpacked}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

// ── Attempt 1: system zip ────────────────────────────────────────────────────
const hasZip = (() => {
  try { execSync('which zip', { stdio: 'pipe' }); return true; }
  catch { return false; }
})();

if (hasZip) {
  try {
    execSync(`cd "${outDir}" && zip -r "${zipName}" win-unpacked/`, { stdio: 'inherit' });
    console.log(`[zip-win] ✓ Created ${zipName}`);
    process.exit(0);
  } catch {
    console.warn('[zip-win] system zip failed, falling back to pure-JS writer...');
  }
}

// ── Attempt 2: pure-JS ZIP writer ────────────────────────────────────────────
// Minimal but spec-compliant ZIP implementation using Node.js built-ins only.
// Handles deflate compression and CRC-32 checksums correctly.

function crc32(buf) {
  if (!crc32._table) {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    crc32._table = t;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crc32._table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u16(buf, off, val) {
  buf[off] = val & 0xFF;
  buf[off + 1] = (val >> 8) & 0xFF;
}
function u32(buf, off, val) {
  buf[off]     =  val        & 0xFF;
  buf[off + 1] = (val >>  8) & 0xFF;
  buf[off + 2] = (val >> 16) & 0xFF;
  buf[off + 3] = (val >> 24) & 0xFF;
}

function collectFiles(dir, base = '') {
  const results = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel  = base ? `${base}/${name}` : name;
    const st   = statSync(full);
    if (st.isDirectory()) {
      results.push(...collectFiles(full, rel));
    } else {
      results.push({ full, rel });
    }
  }
  return results;
}

console.log('[zip-win] Building ZIP with pure-JS writer...');

const files = collectFiles(unpacked, 'win-unpacked');
const entries = [];  // { nameBytes, crc, compSize, rawSize, method, offset, payload }
const parts   = [];
let   offset  = 0;

for (const { full, rel } of files) {
  const nameBytes = Buffer.from(rel, 'utf-8');
  const data      = readFileSync(full);
  const deflated  = deflateRawSync(data, { level: 6 });
  const useDeflate = deflated.length < data.length;
  const payload   = useDeflate ? deflated : data;
  const crc       = crc32(data);
  const method    = useDeflate ? 8 : 0;

  // Local file header (30 bytes + filename)
  const lh = Buffer.alloc(30 + nameBytes.length);
  u32(lh,  0, 0x04034b50);          // local file header signature
  u16(lh,  4, 20);                   // version needed: 2.0
  u16(lh,  6, 0x0800);               // general purpose bit flag: UTF-8
  u16(lh,  8, method);               // compression method
  u16(lh, 10, 0);                    // last mod time
  u16(lh, 12, 0);                    // last mod date
  u32(lh, 14, crc);                  // crc-32
  u32(lh, 18, payload.length);       // compressed size
  u32(lh, 22, data.length);          // uncompressed size
  u16(lh, 26, nameBytes.length);     // file name length
  u16(lh, 28, 0);                    // extra field length
  nameBytes.copy(lh, 30);

  entries.push({ nameBytes, crc, compSize: payload.length, rawSize: data.length, method, offset });
  parts.push(lh, payload);
  offset += lh.length + payload.length;
}

// Central directory
const cdOffset = offset;
for (const { nameBytes, crc, compSize, rawSize, method, offset: localOffset } of entries) {
  const cd = Buffer.alloc(46 + nameBytes.length);
  u32(cd,  0, 0x02014b50);           // central directory file header signature
  u16(cd,  4, 20);                   // version made by
  u16(cd,  6, 20);                   // version needed
  u16(cd,  8, 0x0800);               // general purpose bit flag: UTF-8
  u16(cd, 10, method);               // compression method
  u16(cd, 12, 0);                    // last mod time
  u16(cd, 14, 0);                    // last mod date
  u32(cd, 16, crc);
  u32(cd, 20, compSize);
  u32(cd, 24, rawSize);
  u16(cd, 28, nameBytes.length);
  u16(cd, 30, 0);                    // extra field length
  u16(cd, 32, 0);                    // file comment length
  u16(cd, 34, 0);                    // disk number start
  u16(cd, 36, 0);                    // internal file attributes
  u32(cd, 38, 0);                    // external file attributes
  u32(cd, 42, localOffset);          // relative offset of local header
  nameBytes.copy(cd, 46);
  parts.push(cd);
  offset += cd.length;
}

const cdSize = offset - cdOffset;

// End of central directory record
const eocd = Buffer.alloc(22);
u32(eocd,  0, 0x06054b50);           // end of central dir signature
u16(eocd,  4, 0);                    // disk number
u16(eocd,  6, 0);                    // disk with start of central dir
u16(eocd,  8, entries.length);       // entries on this disk
u16(eocd, 10, entries.length);       // total entries
u32(eocd, 12, cdSize);               // size of central directory
u32(eocd, 16, cdOffset);             // offset of central directory
u16(eocd, 20, 0);                    // comment length
parts.push(eocd);

writeFileSync(zipPath, Buffer.concat(parts));

const sizeMB = (statSync(zipPath).size / 1024 / 1024).toFixed(1);
console.log(`[zip-win] ✓ Created ${zipName} (${sizeMB} MB, ${entries.length} files)`);
