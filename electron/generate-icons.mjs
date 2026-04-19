/**
 * Generates HomeStream app icons for Electron packaging.
 * Creates a purple gradient "HS" icon in PNG format.
 * Run: node electron/generate-icons.mjs
 *
 * Outputs:
 *   electron/assets/icon.png   (512×512, Linux + base for others)
 *   electron/tray-icon.png     (16×16, system tray)
 */

import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size * 0.12; // corner radius

  // Background gradient: deep purple
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#1e0a3c');
  bg.addColorStop(1, '#3b0764');
  ctx.fillStyle = bg;

  // Rounded rect
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // Play triangle (white, centered)
  const cx = size / 2;
  const cy = size / 2;
  const tw = size * 0.38;
  const th = size * 0.44;

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.moveTo(cx - tw * 0.4, cy - th * 0.5);
  ctx.lineTo(cx + tw * 0.6, cy);
  ctx.lineTo(cx - tw * 0.4, cy + th * 0.5);
  ctx.closePath();
  ctx.fill();

  // Accent dot (purple glow top-right)
  const grad2 = ctx.createRadialGradient(size * 0.72, size * 0.28, 0, size * 0.72, size * 0.28, size * 0.22);
  grad2.addColorStop(0, 'rgba(167,139,250,0.5)');
  grad2.addColorStop(1, 'rgba(167,139,250,0)');
  ctx.fillStyle = grad2;
  ctx.beginPath();
  ctx.arc(size * 0.72, size * 0.28, size * 0.22, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toBuffer('image/png');
}

try {
  // Try canvas-based generation
  mkdirSync(join(__dirname, 'assets'), { recursive: true });

  const icon512 = drawIcon(512);
  writeFileSync(join(__dirname, 'assets', 'icon.png'), icon512);
  console.log('✅ electron/assets/icon.png (512×512)');

  const icon16 = drawIcon(16);
  writeFileSync(join(__dirname, 'tray-icon.png'), icon16);
  console.log('✅ electron/tray-icon.png (16×16)');

  console.log('\nDone! For .ico and .icns:');
  console.log('  Windows .ico: use https://convertio.co or ImageMagick: convert icon.png icon.ico');
  console.log('  macOS .icns:  use iconutil on macOS or electron-icon-maker');
} catch (e) {
  console.error('canvas not available:', e.message);
  console.log('Falling back to embedded PNG data...');
}
