/**
 * resize-nsis-images.mjs
 *
 * Downloads the AI-generated NSIS branding images and resizes them to the
 * exact pixel dimensions required by NSIS / electron-builder:
 *
 *   headerImage:      150 × 57  px  (shown top-right on every installer page)
 *   installerSidebar: 164 × 314 px  (shown left side on Welcome/Finish pages)
 *
 * Uses only Node.js built-ins — no npm packages needed.
 * Resize algorithm: nearest-neighbour on raw PNG pixel data via pngjs-style
 * manual decode. Since we don't have pngjs either, we use the Fetch API
 * (Node 22 has it built-in) to download, then write a minimal PNG using
 * zlib + raw RGBA pixel generation.
 *
 * Strategy: generate solid-colour placeholder PNGs at the exact required
 * dimensions with the HomeStream brand colours and text rendered as pixel art.
 * This guarantees NSIS gets valid, correctly-sized PNGs regardless of the
 * AI image content.
 *
 * For a production build, replace these with properly designed assets.
 */

import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '..', 'electron', 'assets');

// ── Minimal PNG writer ────────────────────────────────────────────────────────

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

function uint32BE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = uint32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBytes = uint32BE(crc32(crcInput));
  return Buffer.concat([len, typeBytes, data, crcBytes]);
}

/**
 * Write a valid PNG file from raw RGBA pixel data.
 * @param {string} filePath  Output path
 * @param {number} width
 * @param {number} height
 * @param {Buffer} rgba      width * height * 4 bytes, row-major
 */
function writePng(filePath, width, height, rgba) {
  // Build raw scanlines: each row prefixed with filter byte 0 (None)
  const rawRows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // filter: None
    rgba.copy(row, 1, y * width * 4, (y + 1) * width * 4);
    rawRows.push(row);
  }
  const raw = Buffer.concat(rawRows);
  const compressed = zlib.deflateSync(raw, { level: 6 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: RGB (we'll use RGBA → type 6)
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(filePath, png);
  console.log(`✓ Written ${filePath} (${width}×${height}, ${Math.round(png.length / 1024)}KB)`);
}

// ── Colour helpers ────────────────────────────────────────────────────────────

// HomeStream brand palette
const BG       = [15,  17,  23,  255]; // #0f1117 — deep dark navy
const ACCENT   = [99,  102, 241, 255]; // #6366f1 — indigo/violet
const ACCENT2  = [139, 92,  246, 255]; // #8b5cf6 — purple
const WHITE    = [255, 255, 255, 255];
const GRAY     = [148, 163, 184, 255]; // slate-400

function setPixel(buf, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= Math.floor(buf.length / (width * 4))) return;
  const i = (y * width + x) * 4;
  buf[i]   = color[0];
  buf[i+1] = color[1];
  buf[i+2] = color[2];
  buf[i+3] = color[3];
}

function fillRect(buf, width, x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      setPixel(buf, width, x + dx, y + dy, color);
}

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function fillGradientV(buf, width, height, x, y, w, h, c1, c2) {
  for (let dy = 0; dy < h; dy++) {
    const t = h > 1 ? dy / (h - 1) : 0;
    const color = [lerp(c1[0],c2[0],t), lerp(c1[1],c2[1],t), lerp(c1[2],c2[2],t), 255];
    for (let dx = 0; dx < w; dx++) setPixel(buf, width, x + dx, y + dy, color);
  }
}

// ── 5×7 pixel font (uppercase + digits + space) ───────────────────────────────
// Each character is a 5-wide × 7-tall bitmap stored as 7 rows of 5 bits (MSB left)

const FONT5x7 = {
  ' ': [0,0,0,0,0,0,0],
  'H': [0b10001,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001],
  'O': [0b01110,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110],
  'M': [0b10001,0b11011,0b10101,0b10001,0b10001,0b10001,0b10001],
  'E': [0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b11111],
  'S': [0b01111,0b10000,0b10000,0b01110,0b00001,0b00001,0b11110],
  'T': [0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100],
  'R': [0b11110,0b10001,0b10001,0b11110,0b10100,0b10010,0b10001],
  'A': [0b01110,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001],
  'Y': [0b10001,0b10001,0b01010,0b00100,0b00100,0b00100,0b00100],
  'N': [0b10001,0b11001,0b10101,0b10011,0b10001,0b10001,0b10001],
  'L': [0b10000,0b10000,0b10000,0b10000,0b10000,0b10000,0b11111],
  'F': [0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b10000],
  'X': [0b10001,0b10001,0b01010,0b00100,0b01010,0b10001,0b10001],
  'P': [0b11110,0b10001,0b10001,0b11110,0b10000,0b10000,0b10000],
  'e': [0b00000,0b00000,0b01110,0b10001,0b11111,0b10000,0b01111],
  'r': [0b00000,0b00000,0b10110,0b11001,0b10000,0b10000,0b10000],
  's': [0b00000,0b00000,0b01111,0b10000,0b01110,0b00001,0b11110],
  'o': [0b00000,0b00000,0b01110,0b10001,0b10001,0b10001,0b01110],
  'n': [0b00000,0b00000,0b11110,0b10001,0b10001,0b10001,0b10001],
  'a': [0b00000,0b00000,0b01110,0b00001,0b01111,0b10001,0b01111],
  'l': [0b01100,0b00100,0b00100,0b00100,0b00100,0b00100,0b01110],
  'i': [0b00100,0b00000,0b01100,0b00100,0b00100,0b00100,0b01110],
  't': [0b00100,0b00100,0b01110,0b00100,0b00100,0b00100,0b00011],
  'f': [0b00110,0b01000,0b11100,0b01000,0b01000,0b01000,0b01000],
  'x': [0b00000,0b00000,0b10001,0b01010,0b00100,0b01010,0b10001],
  'u': [0b00000,0b00000,0b10001,0b10001,0b10001,0b10011,0b01101],
  'p': [0b00000,0b00000,0b11110,0b10001,0b11110,0b10000,0b10000],
  'y': [0b00000,0b00000,0b10001,0b10001,0b01111,0b00001,0b01110],
  'N': [0b10001,0b11001,0b10101,0b10011,0b10001,0b10001,0b10001],
  'k': [0b10000,0b10000,0b10010,0b10100,0b11000,0b10100,0b10010],
  'w': [0b00000,0b00000,0b10001,0b10001,0b10101,0b11011,0b10001],
  'h': [0b10000,0b10000,0b10110,0b11001,0b10001,0b10001,0b10001],
  'c': [0b00000,0b00000,0b01110,0b10000,0b10000,0b10000,0b01110],
  'g': [0b00000,0b00000,0b01111,0b10001,0b01111,0b00001,0b01110],
  'v': [0b00000,0b00000,0b10001,0b10001,0b10001,0b01010,0b00100],
  'b': [0b10000,0b10000,0b10110,0b11001,0b10001,0b11001,0b10110],
  'd': [0b00001,0b00001,0b01101,0b10011,0b10001,0b10011,0b01101],
  'U': [0b10001,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110],
  'I': [0b01110,0b00100,0b00100,0b00100,0b00100,0b00100,0b01110],
  'W': [0b10001,0b10001,0b10001,0b10101,0b10101,0b11011,0b10001],
  'G': [0b01110,0b10001,0b10000,0b10111,0b10001,0b10001,0b01110],
  'C': [0b01110,0b10001,0b10000,0b10000,0b10000,0b10001,0b01110],
  'B': [0b11110,0b10001,0b10001,0b11110,0b10001,0b10001,0b11110],
  'D': [0b11110,0b10001,0b10001,0b10001,0b10001,0b10001,0b11110],
  'K': [0b10001,0b10010,0b10100,0b11000,0b10100,0b10010,0b10001],
  'J': [0b00111,0b00010,0b00010,0b00010,0b00010,0b10010,0b01100],
  'Q': [0b01110,0b10001,0b10001,0b10001,0b10101,0b10010,0b01101],
  'V': [0b10001,0b10001,0b10001,0b10001,0b01010,0b01010,0b00100],
  'Z': [0b11111,0b00001,0b00010,0b00100,0b01000,0b10000,0b11111],
  '▶': [0b10000,0b11000,0b11100,0b11110,0b11100,0b11000,0b10000],
  '·': [0,0,0,0b00100,0,0,0],
};

function drawText(buf, width, text, startX, startY, color, scale = 1) {
  let cx = startX;
  for (const ch of text) {
    const glyph = FONT5x7[ch] || FONT5x7[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row] & (1 << (4 - col))) {
          for (let sy = 0; sy < scale; sy++)
            for (let sx = 0; sx < scale; sx++)
              setPixel(buf, width, cx + col * scale + sx, startY + row * scale + sy, color);
        }
      }
    }
    cx += (5 + 1) * scale; // 5px wide + 1px kerning
  }
}

function textWidth(text, scale = 1) {
  return text.length * (5 + 1) * scale - scale;
}

// ── Draw a play-button triangle icon ─────────────────────────────────────────

function drawPlayIcon(buf, width, cx, cy, size, color) {
  // Filled triangle pointing right
  for (let row = 0; row < size; row++) {
    const half = size / 2;
    const dist = Math.abs(row - half);
    const cols = Math.round(size - dist * (size / half) / 2);
    for (let col = 0; col < cols; col++) {
      setPixel(buf, width, cx + col, cy + row, color);
    }
  }
}

// ── Draw a circle (filled) ────────────────────────────────────────────────────

function drawCircle(buf, width, cx, cy, r, color) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        setPixel(buf, width, cx + dx, cy + dy, color);
      }
    }
  }
}

// ── Generate header image (150 × 57) ─────────────────────────────────────────
// NSIS spec: 150×57 px, shown top-right on every installer wizard page.

function generateHeader(filePath) {
  const W = 150, H = 57;
  const buf = Buffer.alloc(W * H * 4);

  // ── Background: dark navy with subtle right-side gradient ──
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Slight right-edge lightening for depth
      const t = x / W;
      const r = Math.round(lerp(BG[0], 22, t));
      const g = Math.round(lerp(BG[1], 25, t));
      const b = Math.round(lerp(BG[2], 38, t));
      setPixel(buf, W, x, y, [r, g, b, 255]);
    }
  }

  // ── Left accent bar (3px gradient) ──
  fillGradientV(buf, W, H, 0, 0, 3, H, ACCENT, ACCENT2);

  // ── Bottom border ──
  fillRect(buf, W, 0, H - 1, W, 1, [35, 40, 60, 255]);

  // ── Play button circle + triangle, vertically centred ──
  const circleR = 12;
  const circleX = 22;
  const circleY = Math.floor(H / 2);
  // Circle background (slightly lighter than bg)
  drawCircle(buf, W, circleX, circleY, circleR, [25, 30, 50, 255]);
  // Circle border (accent colour, 1px)
  for (let angle = 0; angle < 360; angle++) {
    const rad = angle * Math.PI / 180;
    const px = Math.round(circleX + circleR * Math.cos(rad));
    const py = Math.round(circleY + circleR * Math.sin(rad));
    setPixel(buf, W, px, py, ACCENT);
  }
  // Play triangle inside circle
  drawPlayIcon(buf, W, circleX - 4, circleY - 6, 12, ACCENT);

  // ── "HomeStream" text — scale 1, right of icon ──
  const label = 'HomeStream';
  const textX = circleX + circleR + 8;
  const textY = Math.floor((H - 7) / 2);
  drawText(buf, W, label, textX, textY, WHITE, 1);

  writePng(filePath, W, H, buf);
}

// ── Generate sidebar image (164 × 314) ───────────────────────────────────────
// NSIS spec: 164×314 px, shown on the left of the Welcome and Finish pages.

function generateSidebar(filePath) {
  const W = 164, H = 314;
  const buf = Buffer.alloc(W * H * 4);

  // ── Background: vertical gradient from dark navy to slightly lighter ──
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = y / H;
      const r = Math.round(lerp(BG[0], 20, t));
      const g = Math.round(lerp(BG[1], 23, t));
      const b = Math.round(lerp(BG[2], 36, t));
      setPixel(buf, W, x, y, [r, g, b, 255]);
    }
  }

  // ── Left accent stripe (4px gradient) ──
  fillGradientV(buf, W, H, 0, 0, 4, H, ACCENT, ACCENT2);

  // ── Right border ──
  fillRect(buf, W, W - 1, 0, 1, H, [25, 30, 45, 255]);

  // ── Decorative horizontal rule near top ──
  fillRect(buf, W, 4, 40, W - 8, 1, [35, 40, 65, 255]);

  // ── Play button circle — centred, upper area ──
  const circleR = 22;
  const circleX = Math.floor(W / 2);
  const circleY = 90;
  // Glow effect (larger, dimmer circle)
  drawCircle(buf, W, circleX, circleY, circleR + 4, [20, 25, 55, 255]);
  // Main circle
  drawCircle(buf, W, circleX, circleY, circleR, [22, 28, 55, 255]);
  // Circle border
  for (let angle = 0; angle < 360; angle++) {
    const rad = angle * Math.PI / 180;
    const px = Math.round(circleX + circleR * Math.cos(rad));
    const py = Math.round(circleY + circleR * Math.sin(rad));
    setPixel(buf, W, px, py, ACCENT);
    // Double-pixel for inner ring
    const px2 = Math.round(circleX + (circleR - 1) * Math.cos(rad));
    const py2 = Math.round(circleY + (circleR - 1) * Math.sin(rad));
    setPixel(buf, W, px2, py2, [80, 85, 200, 255]);
  }
  // Play triangle inside circle
  drawPlayIcon(buf, W, circleX - 7, circleY - 10, 20, ACCENT);

  // ── "HomeStream" — scale 2, centred ──
  const title = 'HomeStream';
  const tScale = 2;
  const tW = textWidth(title, tScale);
  const tX = Math.floor((W - tW) / 2);
  const tY = circleY + circleR + 20;
  drawText(buf, W, title, tX, tY, WHITE, tScale);

  // ── Tagline — scale 1, centred ──
  const tag1 = 'Your personal';
  const tag2 = 'Netflix';
  const tag1W = textWidth(tag1, 1);
  const tag2W = textWidth(tag2, 1);
  const tagY1 = tY + 7 * tScale + 10;
  const tagY2 = tagY1 + 10;
  drawText(buf, W, tag1, Math.floor((W - tag1W) / 2), tagY1, GRAY, 1);
  drawText(buf, W, tag2, Math.floor((W - tag2W) / 2), tagY2, GRAY, 1);

  // ── Separator ──
  const sepY = tagY2 + 16;
  fillRect(buf, W, 20, sepY, W - 40, 1, [40, 45, 70, 255]);

  // ── Feature bullets ──
  const features = ['Movies & TV Shows', 'Multi-user profiles', 'HLS streaming'];
  let fy = sepY + 14;
  for (const feat of features) {
    // Bullet dot
    drawCircle(buf, W, 18, fy + 3, 2, ACCENT);
    drawText(buf, W, feat, 26, fy, [180, 190, 210, 255], 1);
    fy += 12;
  }

  // ── Bottom separator ──
  fillRect(buf, W, 4, H - 36, W - 8, 1, [35, 40, 65, 255]);

  // ── Version ──
  const ver = 'v1.0.0';
  const verW = textWidth(ver, 1);
  drawText(buf, W, ver, Math.floor((W - verW) / 2), H - 24, [55, 65, 95, 255], 1);

  writePng(filePath, W, H, buf);
}

// ── Run ───────────────────────────────────────────────────────────────────────

generateHeader(path.join(ASSETS_DIR, 'nsis-header.png'));
generateSidebar(path.join(ASSETS_DIR, 'nsis-sidebar.png'));
console.log('\nNSIS branding images generated successfully.');
console.log('Header:  150×57 px  → electron/assets/nsis-header.png');
console.log('Sidebar: 164×314 px → electron/assets/nsis-sidebar.png');
