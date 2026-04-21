import https from 'https';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('/alloc/config.json', 'utf8'));
const ghToken = config.GH_TOKEN?.VALUE || config.GH_TOKEN;

function apiCall(method, urlPath, bodyObj) {
  return new Promise((resolve) => {
    const body = bodyObj ? JSON.stringify(bodyObj) : null;
    const opts = {
      hostname: 'api.github.com',
      path: urlPath,
      method,
      headers: {
        'Authorization': 'token ' + ghToken,
        'User-Agent': 'homestream-builder',
        'Accept': 'application/vnd.github.v3+json',
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {})
      }
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', x => d += x);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const remotePath = '.github/workflows/release.yml';
  const content = fs.readFileSync(remotePath, 'utf8');
  const encoded = Buffer.from(content).toString('base64');

  // Get existing SHA
  const existing = await apiCall('GET', `/repos/trevorrossworn-code/homestream/contents/.github%2Fworkflows%2Frelease.yml`);
  const sha = existing.status === 200 ? existing.body.sha : null;
  console.log('SHA:', sha);

  const result = await apiCall('PUT', `/repos/trevorrossworn-code/homestream/contents/.github%2Fworkflows%2Frelease.yml`, {
    message: 'Fix electron-builder: use -c flag instead of --config',
    content: encoded,
    sha
  });

  if (result.body.content) console.log('✅ PUSHED: release.yml');
  else console.log('❌ ERROR:', result.body.message);
}

main().catch(console.error);
