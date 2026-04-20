const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/server/demoLibrary.ts');
let content = fs.readFileSync(file, 'utf8');

const svgToJpg = [
  'sintel', 'elephants-dream', 'tears-of-steel', 'cosmos',
  'sprite-fright', 'coffee-run', 'hero', 'caminandes',
];

for (const slug of svgToJpg) {
  content = content.replace(new RegExp(`/demo/${slug}-poster\\.svg`, 'g'),  `/demo/${slug}-poster.jpg`);
  content = content.replace(new RegExp(`/demo/${slug}-backdrop\\.svg`, 'g'), `/demo/${slug}-backdrop.jpg`);
}

fs.writeFileSync(file, content);
console.log('Patched demoLibrary.ts — all .svg → .jpg');
