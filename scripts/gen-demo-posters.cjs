/**
 * Generates SVG poster and backdrop images for all demo library items.
 * Run: node scripts/gen-demo-posters.js
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../public/demo');

const POSTERS = [
  { name: 'sintel',          title: 'Sintel',             color1: '#1a1a2e', color2: '#16213e', accent: '#e94560', year: '2010' },
  { name: 'elephants-dream', title: 'Elephants Dream',    color1: '#0f3460', color2: '#533483', accent: '#a78bfa', year: '2006' },
  { name: 'tears-of-steel',  title: 'Tears of Steel',     color1: '#1b1b2f', color2: '#2c2c54', accent: '#706fd3', year: '2012' },
  { name: 'cosmos',          title: 'Cosmos Laundromat',  color1: '#2d132c', color2: '#6b1a2a', accent: '#f87171', year: '2015' },
  { name: 'caminandes',      title: 'Caminandes',         color1: '#1a3a4a', color2: '#2d6a4f', accent: '#52b788', year: '2013' },
  { name: 'sprite-fright',   title: 'Sprite Fright',      color1: '#1b4332', color2: '#081c15', accent: '#95d5b2', year: '2021' },
  { name: 'hero',            title: 'Hero',               color1: '#370617', color2: '#6a040f', accent: '#f48c06', year: '2018' },
  { name: 'coffee-run',      title: 'Coffee Run',         color1: '#3d405b', color2: '#1a1c2c', accent: '#f2cc8f', year: '2020' },
  // TV show episodes
  { name: 'caminandes-ep1',  title: 'Caminandes: Ep 1',   color1: '#1a3a4a', color2: '#2d6a4f', accent: '#52b788', year: '2012' },
  { name: 'caminandes-ep2',  title: 'Caminandes: Ep 2',   color1: '#1a3a4a', color2: '#2d6a4f', accent: '#74c69d', year: '2013' },
  { name: 'caminandes-ep3',  title: 'Caminandes: Ep 3',   color1: '#1a3a4a', color2: '#2d6a4f', accent: '#95d5b2', year: '2013' },
];

const BACKDROPS = [
  { name: 'sintel',          color1: '#0d1b2a', color2: '#1b263b' },
  { name: 'elephants-dream', color1: '#0f3460', color2: '#16213e' },
  { name: 'tears-of-steel',  color1: '#1b1b2f', color2: '#393e46' },
  { name: 'cosmos',          color1: '#2d132c', color2: '#1a0a1a' },
  { name: 'caminandes',      color1: '#1a3a4a', color2: '#0d2137' },
  { name: 'sprite-fright',   color1: '#1b4332', color2: '#0a1f14' },
  { name: 'hero',            color1: '#370617', color2: '#1a0208' },
  { name: 'coffee-run',      color1: '#3d405b', color2: '#1a1c2c' },
];

function makePoster({ name, title, color1, color2, accent, year }) {
  // Split long titles for wrapping
  const words = title.split(' ');
  let line1 = title, line2 = '';
  if (words.length > 2) {
    const mid = Math.ceil(words.length / 2);
    line1 = words.slice(0, mid).join(' ');
    line2 = words.slice(mid).join(' ');
  }
  const titleY = line2 ? 300 : 320;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0%" stop-color="${color1}"/>
      <stop offset="100%" stop-color="${color2}"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${accent}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="400" height="600" fill="url(#g)"/>
  <rect width="400" height="600" fill="url(#shine)"/>
  <!-- Top accent line -->
  <rect x="40" y="40" width="320" height="2" fill="${accent}" opacity="0.9"/>
  <!-- Bottom accent line -->
  <rect x="40" y="558" width="320" height="2" fill="${accent}" opacity="0.9"/>
  <!-- Corner marks -->
  <rect x="40" y="40" width="2" height="20" fill="${accent}" opacity="0.7"/>
  <rect x="358" y="40" width="2" height="20" fill="${accent}" opacity="0.7"/>
  <rect x="40" y="540" width="2" height="20" fill="${accent}" opacity="0.7"/>
  <rect x="358" y="540" width="2" height="20" fill="${accent}" opacity="0.7"/>
  <!-- Title -->
  <text x="200" y="${titleY}" font-family="Georgia,serif" font-size="34" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${line1}</text>
  ${line2 ? `<text x="200" y="${titleY + 44}" font-family="Georgia,serif" font-size="34" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${line2}</text>` : ''}
  <!-- Year -->
  <text x="200" y="${line2 ? titleY + 100 : titleY + 56}" font-family="Arial,sans-serif" font-size="15" fill="${accent}" text-anchor="middle" opacity="0.9" letter-spacing="4">${year}</text>
  <!-- Demo badge -->
  <text x="200" y="545" font-family="Arial,sans-serif" font-size="10" fill="white" text-anchor="middle" opacity="0.35" letter-spacing="2">DEMO · CC BY</text>
</svg>`;
}

function makeBackdrop({ name, color1, color2 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color1}"/>
      <stop offset="100%" stop-color="${color2}"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#g)"/>
</svg>`;
}

POSTERS.forEach(p => {
  const svg = makePoster(p);
  fs.writeFileSync(path.join(OUT, `${p.name}-poster.svg`), svg);
  console.log(`✓ ${p.name}-poster.svg`);
});

BACKDROPS.forEach(b => {
  const svg = makeBackdrop(b);
  fs.writeFileSync(path.join(OUT, `${b.name}-backdrop.svg`), svg);
  console.log(`✓ ${b.name}-backdrop.svg`);
});

console.log('\nAll demo images generated!');
