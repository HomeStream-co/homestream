/**
 * zip-win-build.mjs
 *
 * Post-build step for electron:win.
 *
 * electron-builder --dir produces an unpacked Windows app at:
 *   dist-electron/win-unpacked/
 *
 * This script packages that directory into a distributable archive:
 *   dist-electron/HomeStream-<version>-win-x64.zip   (if zip available)
 *   dist-electron/HomeStream-<version>-win-x64.tar.gz (fallback via tar)
 *   dist-electron/HomeStream-<version>-win-x64.zip   (pure-JS fallback)
 *
 * Why this exists:
 *   The build environment is Alpine Linux (musl). electron-builder's
 *   zip/nsis/portable targets all invoke app-builder which requires
 *   7zip (glibc binary) to extract winCodeSign. Since 7zip can't run
 *   on musl, we use --dir to skip that step and archive manually here.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, createWriteStream, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGzip } from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Read version from package.json
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = pkg.version;

const unpacked = path.join(root, 'dist-electron', 'win-unpacked');
const outDir = path.join(root, 'dist-electron');

if (!existsSync(unpacked)) {
  console.error(`[zip-win] ERROR: unpacked dir not found: ${unpacked}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

// ── Attempt 1: system zip ────────────────────────────────────────────────────
const zipName = `HomeStream-${version}-win-x64.zip`;
const zipPath = path.join(outDir, zipName);

try {
  execSync(
    `cd "${outDir}" && zip -r "${zipName}" win-unpacked/`,
    { stdio: 'inherit' }
  );
  console.log(`[zip-win] ✓ Created ${zipName}`);
  process.exit(0);
} catch {
  console.warn('[zip-win] system zip not available, trying tar.gz...');
}

// ── Attempt 2: tar.gz via system tar ────────────────────────────────────────
const tarName = `HomeStream-${version}-win-x64.tar.gz`;
const tarPath = path.join(outDir, tarName);

try {
  execSync(
    `tar -czf "${tarPath}" -C "${outDir}" win-unpacked/`,
    { stdio: 'inherit' }
  );
  console.log(`[zip-win] ✓ Created ${tarName} (tar.gz archive)`);
  console.log('[zip-win] Note: Windows users can extract with 7-Zip or WinRAR');
  process.exit(0);
} catch {
  console.warn('[zip-win] tar.gz also failed, using pure-JS ZIP writer...');
}

// ── Attempt 3: pure-JS ZIP writer ────────────────────────────────────────────
// Minimal ZIP implementation using Node.js built-ins only.
// Produces a valid ZIP file without any external dependencies.

import { deflateRawSync } from 'zlib';

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function writeUint16LE(buf, offset, val) { buf[offset] = val & 0xFF; buf[offset+1] = (val >> 8) & 0xFF; }
function writeUint32LE(buf, offset, val) {
  buf[offset] = val & 0xFF; buf[offset+1] = (val >> 8) & 0xFF;
  buf[offset+2] = (val >> 16) & 0xFF; buf[offset+3] = (val >> 24) & 0xFF;
}

function collectFiles(dir, base = '') {
  const results = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...collectFiles(full, rel));
    } else {
      results.push({ full, rel, size: st.size });
    }
  }
  return results;
}

console.log('[zip-win] Building ZIP with pure-JS writer...');

const files = collectFiles(unpacked, 'win-unpacked');
const localHeaders = [];
const centralHeaders = [];
let offset = 0;
const parts = [];

for (const { full, rel, size } of files) {
  const nameBytes = Buffer.from(rel, 'utf-8');
  const data = readFileSync(full);
  const compressed = deflateRawSync(data, { level: 6 });
  const useCompressed = compressed.length < data.length;
  const payload = useCompressed ? compressed : data;
  const crc = crc32(data);

  // Local file header (30 bytes + name)
  const lh = Buffer.alloc(30 + nameBytes.length);
  writeUint32LE(lh, 0, 0x04034b50);   // signature
  writeUint16LE(lh, 4, 20);            // version needed
  writeUint16LE(lh, 6, 0x0800);        // flags: UTF-8
  writeUint16LE(lh, 8, useCompressed ? 8 : 0); // compression
  writeUint16LE(lh, 10, 0);            // mod time
  writeUint16LE(lh, 12, 0);            // mod date
  writeUint32LE(lh, 14, crc);
  writeUint32LE(lh, 18, payload.length);
  writeUint32LE(lh, 22, data.length);
  writeUint16LE(lh, 26, nameBytes.length);
  writeUint16LE(lh, 28, 0);            // extra length
  nameBytes.copy(lh, 30);

  localHeaders.push({ offset, nameBytes, crc, compressedSize: payload.length, uncompressedSize: data.length, method: useCompressed ? 8 : 0 });
  parts.push(lh, payload);
  offset += lh.length + payload.length;
}

// Central directory
const cdStart = offset;
for (let i = 0; i < files.length; i++) {
  const { nameBytes, crc, compressedSize, uncompressedSize, method } = localHeaders[i];
  const cd = Buffer.alloc(46 + nameBytes.length);
  writeUint32LE(cd, 0, 0x02014b50);   // signature
  writeUint16LE(cd, 4, 20);            // version made by
  writeUint16LE(cd, 6, 20);            // version needed
  writeUint16LE(cd, 8, 0x0800);        // flags: UTF-8
  writeUint16LE(cd, 10, method);
  writeUint16LE(cd, 12, 0);            // mod time
  writeUint16LE(cd, 14, 0);            // mod date
  writeUint32LE(cd, 16, crc);
  writeUint32LE(cd, 20, compressedSize);
  writeUint32LE(cd, 24, uncompressedSize);
  writeUint16LE(cd, 28, nameBytes.length);
  writeUint16LE(cd, 30, 0);            // extra length
  writeUint16LE(cd, 32, 0);            // comment length
  writeUint16LE(cd, 34, 0);            // disk start
  writeUint16LE(cd, 36, 0);            // internal attrs
  writeUint32LE(cd, 38, 0);            // external attrs
  writeUint32LE(cd, 42, localHeaders[i].offset);
  nameBytes.copy(cd, 46);
  parts.push(cd);
  offset += cd.length;
}

// End of central directory record
const eocd = Buffer.alloc(22);
writeUint32LE(eocd, 0, 0x06054b50);
writeUint16LE(eocd, 4, 0);
writeUint16LE(eocd, 6, 0);
writeUint16LE(eocd, 8, files.length);
writeUint16LE(eocd, 10, files.length);
writeUint32LE(eocd, 12, offset - cdStart);
writeUint32LE(eocd, 16, cdStart);
writeUint16LE(eocd, 20, 0);
parts.push(eocd);

writeFileSync(zipPath, Buffer.concat(parts));
console.log(`[zip-win] ✓ Created ${zipName} (pure-JS, ${files.length} files)`);
process.exit(0);
