import https from 'https';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('/alloc/config.json', 'utf8'));
const token = config.GH_TOKEN?.VALUE || config.GH_TOKEN;

function apiCall(method, urlPath, bodyObj) {
  return new Promise((resolve) => {
    const body = bodyObj ? JSON.stringify(bodyObj) : null;
    const opts = {
      hostname: 'api.github.com', path: urlPath, method,
      headers: {
        'Authorization': 'token ' + token, 'User-Agent': 'hs',
        'Accept': 'application/vnd.github.v3+json',
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {})
      }
    };
    const req = https.request(opts, res => { let d = ''; res.on('data', x => d += x); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) })); });
    if (body) req.write(body);
    req.end();
  });
}

async function pushFile(localPath, remotePath, message) {
  const content = fs.readFileSync(localPath, 'utf8');
  const encoded = Buffer.from(content).toString('base64');
  const existing = await apiCall('GET', `/repos/trevorrossworn-code/homestream/contents/${remotePath}`);
  const sha = existing.status === 200 ? existing.body.sha : null;
  const result = await apiCall('PUT', `/repos/trevorrossworn-code/homestream/contents/${remotePath}`, {
    message, content: encoded, sha
  });
  if (result.body.content) console.log('✅ PUSHED:', remotePath);
  else console.log('❌ ERROR:', remotePath, result.body.message);
}

async function main() {
  const msg = 'Fix: rename electron files to .cjs to avoid ESM/CJS conflict (package.json type:module)';
  await pushFile('electron/main.cjs',            'electron/main.cjs',            msg);
  await pushFile('electron/updater.cjs',         'electron/updater.cjs',         msg);
  await pushFile('electron/preload.cjs',         'electron/preload.cjs',         msg);
  await pushFile('package.json',                 'package.json',                 msg);
  await pushFile('electron/electron-builder.yml','electron/electron-builder.yml', msg);
}

main().catch(console.error);
