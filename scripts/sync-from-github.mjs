// Syncs missing dirs from commit 90fc9b5 on GitHub to local sandbox
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const TOKEN = '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';
const REF = '90fc9b5b8e6e96c7cf6dac208a678472b6a660a1';
const REPO = 'HomeStream-co/homestream';

async function ghGet(path) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${REF}`, {
    headers: { Authorization: `token ${TOKEN}`, 'User-Agent': 'node' }
  });
  return res.json();
}

async function downloadFile(ghPath, localPath) {
  const data = await ghGet(ghPath);
  if (data.message) { console.log(`SKIP ${ghPath}: ${data.message}`); return; }
  const content = Buffer.from(data.content, 'base64');
  mkdirSync(dirname(localPath), { recursive: true });
  writeFileSync(localPath, content);
  console.log(`✓ ${localPath} (${content.length} bytes)`);
}

async function syncDir(ghDir, localDir) {
  const items = await ghGet(ghDir);
  if (!Array.isArray(items)) { console.log(`SKIP dir ${ghDir}: ${items.message}`); return; }
  for (const item of items) {
    if (item.type === 'dir') {
      await syncDir(item.path, `${localDir}/${item.name}`);
    } else {
      await downloadFile(item.path, `${localDir}/${item.name}`);
    }
  }
}

// Sync these dirs
for (const dir of ['electron', 'aur', 'e2e']) {
  await syncDir(dir, dir);
}

// Sync individual missing root files
const rootFiles = [
  'CHANGELOG.md', 'CONTRIBUTING.md', 'Dockerfile', 'INSTALL.md', 'LICENSE',
  'AUDIT.md', 'docker-compose.yml', 'homestream-downloads.json',
  'homestream-sessions.json', 'install-linux.sh', 'install.bat', 'install.sh',
  'launch.bat', 'launch.sh', 'playwright.config.ts', 'tailwind.config.js',
  'tsconfig.json', 'tsconfig.node.json', 'vitest.config.ts'
];
for (const f of rootFiles) {
  await downloadFile(f, f);
}

// Sync scripts dir (all files)
await syncDir('scripts', 'scripts');

console.log('\nDone.');
