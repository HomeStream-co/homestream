import https from 'https';
import fs from 'fs';
import path from 'path';

const config = JSON.parse(fs.readFileSync('/alloc/config.json', 'utf8'));
const ghToken = config.GH_TOKEN?.VALUE || config.GH_TOKEN;

function ghGet(filePath) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'api.github.com',
      path: `/repos/trevorrossworn-code/homestream/contents/${filePath}`,
      headers: { 'Authorization': 'token ' + ghToken, 'User-Agent': 'homestream-builder', 'Accept': 'application/vnd.github.v3+json' }
    };
    https.get(opts, res => {
      let d = '';
      res.on('data', x => d += x);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
  });
}

function ghPut(filePath, content, sha, message) {
  return new Promise((resolve) => {
    const encoded = Buffer.from(content).toString('base64');
    const bodyObj = { message, content: encoded };
    if (sha) bodyObj.sha = sha;
    const body = JSON.stringify(bodyObj);
    const opts = {
      hostname: 'api.github.com',
      path: `/repos/trevorrossworn-code/homestream/contents/${filePath}`,
      method: 'PUT',
      headers: {
        'Authorization': 'token ' + ghToken,
        'User-Agent': 'homestream-builder',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', x => d += x);
      res.on('end', () => {
        const r = JSON.parse(d);
        if (r.content) console.log('✅ PUSHED:', filePath);
        else console.log('❌ ERROR pushing', filePath, ':', r.message);
        resolve(r);
      });
    });
    req.write(body);
    req.end();
  });
}

async function pushFile(localPath, remotePath, message) {
  if (!fs.existsSync(localPath)) {
    console.log('⚠️  MISSING LOCALLY, skipping:', localPath);
    return;
  }
  const content = fs.readFileSync(localPath, 'utf8');
  const existing = await ghGet(remotePath);
  const sha = existing.status === 200 ? existing.body.sha : null;
  await ghPut(remotePath, content, sha, message || `Sync ${remotePath}`);
}

async function main() {
  // Push all files that differ or are missing
  await pushFile('vite.config.ts', 'vite.config.ts', 'Fix esbuild externalize plugin for #airo/secrets and webtorrent');
  await pushFile('package.json', 'package.json', 'Sync package.json with imports field');
  await pushFile('src/server/configure.js', 'src/server/configure.js', 'Sync configure.js');
  await pushFile('electron/electron-builder.yml', 'electron/electron-builder.yml', 'Add missing electron-builder.yml');

  console.log('\nAll files pushed. Ready to re-tag.');
}

main().catch(console.error);
