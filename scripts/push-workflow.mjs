import https from 'https';
import fs from 'fs';

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
        else console.log('❌ ERROR:', r.message);
        resolve(r);
      });
    });
    req.write(body);
    req.end();
  });
}

async function main() {
  const files = [
    '.github/workflows/release.yml',
  ];
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    const existing = await ghGet(f);
    const sha = existing.status === 200 ? existing.body.sha : null;
    await ghPut(f, content, sha, `Fix: use -c flag and add description/author to package.json`);
  }
}

main().catch(console.error);
