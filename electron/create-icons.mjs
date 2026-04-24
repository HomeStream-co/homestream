/**
 * Creates HomeStream icons using pure Node.js (no native deps).
 * Generates a minimal valid PNG with the HomeStream purple brand color.
 *
 * Run: node electron/create-icons.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import zlib from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Pure-JS PNG encoder ───────────────────────────────────────────────────────

function crc32(buf) {
  let crc = 0xffffffff;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(crcBuf));
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

function makePNG(size, pixelFn) {
  // RGBA pixels
  const pixels = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter byte
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size);
      row.push(r, g, b, a);
    }
    pixels.push(...row);
  }

  const raw = Buffer.from(pixels);
  const compressed = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Icon pixel function ───────────────────────────────────────────────────────
// Purple rounded-rect background + white play triangle

function iconPixel(x, y, size) {
  const cx = size / 2, cy = size / 2;
  const r = size * 0.12; // corner radius

  // Rounded rect bounds check
  const inRect = x >= r && x <= size - r && y >= 0 && y <= size
    || x >= 0 && x <= size && y >= r && y <= size - r
    || Math.hypot(x - r, y - r) <= r
    || Math.hypot(x - (size - r), y - r) <= r
    || Math.hypot(x - r, y - (size - r)) <= r
    || Math.hypot(x - (size - r), y - (size - r)) <= r;

  if (!inRect) return [0, 0, 0, 0]; // transparent

  // Purple gradient background
  const t = (x + y) / (size * 2);
  const bgR = Math.round(30 + t * 59);   // 30→89
  const bgG = Math.round(10 + t * 7);    // 10→17
  const bgB = Math.round(60 + t * 40);   // 60→100

  // Play triangle: pointing right, centered
  const tw = size * 0.35;
  const th = size * 0.42;
  const tx = cx - tw * 0.35;
  const ty = cy;

  // Point-in-triangle test
  const x1 = tx, y1 = ty - th / 2;
  const x2 = tx + tw, y2 = ty;
  const x3 = tx, y3 = ty + th / 2;

  const d1 = (x - x2) * (y1 - y2) - (x1 - x2) * (y - y2);
  const d2 = (x - x3) * (y2 - y3) - (x2 - x3) * (y - y3);
  const d3 = (x - x1) * (y3 - y1) - (x3 - x1) * (y - y1);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  const inTriangle = !(hasNeg && hasPos);

  if (inTriangle) return [255, 255, 255, 240]; // white play icon

  return [bgR, bgG, bgB, 255];
}

// ── Generate icons ────────────────────────────────────────────────────────────

mkdirSync(join(__dirname, 'assets'), { recursive: true });

// 512×512 app icon
const icon512 = makePNG(512, iconPixel);
writeFileSync(join(__dirname, 'assets', 'icon.png'), icon512);
console.log('✅ electron/assets/icon.png (512×512)');

// 256×256 for Windows
const icon256 = makePNG(256, iconPixel);
writeFileSync(join(__dirname, 'assets', 'icon-256.png'), icon256);
console.log('✅ electron/assets/icon-256.png (256×256)');

// 16×16 tray icon
const icon16 = makePNG(16, iconPixel);
writeFileSync(join(__dirname, 'tray-icon.png'), icon16);
console.log('✅ electron/tray-icon.png (16×16)');

console.log('\n✅ Icons generated. For production builds:');
console.log('  Windows .ico : use electron-icon-maker or ImageMagick');
console.log('  macOS .icns  : use iconutil on macOS');
console.log('  Or place your own icon.png (512×512) in electron/assets/');
