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
    const req = https.request(opts, res => { let d=''; res.on('data',x=>d+=x); res.on('end',()=>resolve({ status: res.statusCode, body: JSON.parse(d) })); });
    if (body) req.write(body);
    req.end();
  });
}

async function pushFile(localPath, remotePath, message) {
  const content = fs.readFileSync(localPath, 'utf8');
  const encoded = Buffer.from(content).toString('base64');
  const existing = await apiCall('GET', `/repos/trevorrossworn-code/homestream/contents/${remotePath}`);
  const sha = existing.status === 200 ? existing.body.sha : null;
  const result = await apiCall('PUT', `/repos/trevorrossworn-code/homestream/contents/${remotePath}`, { message, content: encoded, sha });
  if (result.body.content) console.log('✅ PUSHED:', remotePath);
  else console.log('❌ ERROR:', result.body.message);
}

async function main() {
  await pushFile('electron/electron-builder.yml', 'electron/electron-builder.yml',
    'Fix: use from/to/filter in files array so electron/main.js lands at correct asar path');
}
main().catch(console.error);
