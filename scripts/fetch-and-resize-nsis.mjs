/**
 * fetch-and-resize-nsis.mjs
 *
 * Downloads the AI-edited NSIS branding images and resizes them to exact
 * NSIS pixel dimensions using pure Node.js (no npm packages).
 *
 * NSIS requirements:
 *   headerImage:      150 × 57  px
 *   installerSidebar: 164 × 314 px
 *
 * Uses Node 22 built-in fetch + zlib for PNG decode/encode.
 */

import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '..', 'electron', 'assets');

// ── PNG decode (minimal — handles DEFLATE-compressed RGBA/RGB PNGs) ───────────

function decodePng(buf) {
  // Validate signature
  const sig = [137,80,78,71,13,10,26,10];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== sig[i]) throw new Error('Not a PNG');
  }

  let width, height, bitDepth, colorType;
  const idatChunks = [];
  let pos = 8;

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); pos += 4;
    const type = buf.slice(pos, pos + 4).toString('ascii'); pos += 4;
    const data = buf.slice(pos, pos + len); pos += len;
    pos += 4; // skip CRC

    if (type === 'IHDR') {
      width     = data.readUInt32BE(0);
      height    = data.readUInt32BE(4);
      bitDepth  = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!width || !height) throw new Error('No IHDR found');

  const compressed = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(compressed);

  // Channels per pixel
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4;
  const bytesPerRow = 1 + width * channels; // +1 for filter byte

  // Output: always RGBA
  const rgba = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    const rowStart = y * bytesPerRow;
    const filter = raw[rowStart];
    const row = raw.slice(rowStart + 1, rowStart + 1 + width * channels);
    const prevRow = y > 0 ? raw.slice((y-1) * bytesPerRow + 1, (y-1) * bytesPerRow + 1 + width * channels) : Buffer.alloc(width * channels);

    // Apply PNG filter
    const recon = Buffer.alloc(row.length);
    for (let i = 0; i < row.length; i++) {
      const a = i >= channels ? recon[i - channels] : 0;
      const b = prevRow[i] || 0;
      const c = (i >= channels && y > 0) ? prevRow[i - channels] : 0;
      switch (filter) {
        case 0: recon[i] = row[i]; break;
        case 1: recon[i] = (row[i] + a) & 0xff; break;
        case 2: recon[i] = (row[i] + b) & 0xff; break;
        case 3: recon[i] = (row[i] + Math.floor((a + b) / 2)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          recon[i] = (row[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default: recon[i] = row[i];
      }
    }

    // Write to RGBA output
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      if (channels === 4) {
        rgba[di]   = recon[x * 4];
        rgba[di+1] = recon[x * 4 + 1];
        rgba[di+2] = recon[x * 4 + 2];
        rgba[di+3] = recon[x * 4 + 3];
      } else if (channels === 3) {
        rgba[di]   = recon[x * 3];
        rgba[di+1] = recon[x * 3 + 1];
        rgba[di+2] = recon[x * 3 + 2];
        rgba[di+3] = 255;
      } else {
        rgba[di] = rgba[di+1] = rgba[di+2] = recon[x];
        rgba[di+3] = 255;
      }
    }
  }

  return { width, height, rgba };
}

// ── Bilinear resize ───────────────────────────────────────────────────────────

function resizeRgba(src, srcW, srcH, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const sx = dx * xRatio;
      const sy = dy * yRatio;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const fx = sx - x0, fy = sy - y0;

      const di = (dy * dstW + dx) * 4;
      for (let c = 0; c < 4; c++) {
        const tl = src[(y0 * srcW + x0) * 4 + c];
        const tr = src[(y0 * srcW + x1) * 4 + c];
        const bl = src[(y1 * srcW + x0) * 4 + c];
        const br = src[(y1 * srcW + x1) * 4 + c];
        dst[di + c] = Math.round(
          tl * (1-fx) * (1-fy) +
          tr * fx * (1-fy) +
          bl * (1-fx) * fy +
          br * fx * fy
        );
      }
    }
  }
  return dst;
}

// ── PNG encode ────────────────────────────────────────────────────────────────

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32BE(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n, 0); return b; }

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = uint32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  return Buffer.concat([len, typeBytes, data, uint32BE(crc32(crcInput))]);
}

function encodePng(width, height, rgba) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // filter: None
    rgba.copy(row, 1, y * width * 4, (y + 1) * width * 4);
    rows.push(row);
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Download helper ───────────────────────────────────────────────────────────

async function fetchBuf(url, redirects = 5) {
  const res = await fetch(url);
  if ((res.status === 301 || res.status === 302) && redirects > 0) {
    return fetchBuf(res.headers.get('location'), redirects - 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function processImage(url, destPath, targetW, targetH, label) {
  console.log(`Downloading ${label}…`);
  const raw = await fetchBuf(url);
  console.log(`  Downloaded ${raw.length} bytes`);

  let decoded;
  try {
    decoded = decodePng(raw);
    console.log(`  Decoded: ${decoded.width}×${decoded.height} RGBA`);
  } catch (e) {
    console.warn(`  PNG decode failed (${e.message}) — keeping pixel-art placeholder`);
    return;
  }

  const resized = resizeRgba(decoded.rgba, decoded.width, decoded.height, targetW, targetH);
  const encoded = encodePng(targetW, targetH, resized);
  fs.writeFileSync(destPath, encoded);
  console.log(`  ✓ Written ${destPath} (${targetW}×${targetH}, ${Math.round(encoded.length/1024)}KB)`);
}

await processImage(
  'https://isteam.wsimg.com/genai-assistant/images/6e83386b-7c5f-4d52-b921-7a3f0fff5413/32d07781-db68-48e4-a7a8-e1d10ce4e23c/77b0d612-original.png',
  path.join(ASSETS_DIR, 'nsis-header.png'),
  150, 57,
  'header (150×57)'
);

await processImage(
  'https://isteam.wsimg.com/genai-assistant/images/6e83386b-7c5f-4d52-b921-7a3f0fff5413/c896ac2d-6107-49e0-9d34-833ae42bd0fd/7acd20fa-original.png',
  path.join(ASSETS_DIR, 'nsis-sidebar.png'),
  164, 314,
  'sidebar (164×314)'
);

console.log('\nDone. Verifying…');
['nsis-header.png', 'nsis-sidebar.png'].forEach(f => {
  const buf = fs.readFileSync(path.join(ASSETS_DIR, f));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const valid = buf.slice(0,8).toString('hex') === '89504e470d0a1a0a';
  console.log(`  ${f}: ${w}×${h} ${valid ? '✓' : '✗ INVALID'}`);
});
