// Deletes the v1.5.1 release via API so the next workflow run creates it fresh
import { createRequire } from 'module';
import https from 'https';
const require = createRequire(import.meta.url);
const { getSecret } = require('#airo/secrets');
const token = getSecret('GH_TOKEN');
const REPO = 'trevorrossworn-code/homestream';
const TAG  = 'v1.5.1';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const r = https.request({
      hostname: 'api.github.com', path, method,
      headers: {
        'Authorization': 'token ' + token,
        'User-Agent': 'homestream-builder',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(d ? JSON.parse(d) : {}));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// 1. Get release id
const rel = await req('GET', `/repos/${REPO}/releases/tags/${TAG}`);
if (rel.id) {
  console.log('Deleting release id:', rel.id);
  await req('DELETE', `/repos/${REPO}/releases/${rel.id}`);
  console.log('Deleted.');
} else {
  console.log('No release found for', TAG);
}
