import https from 'https';

const TOKEN = process.env.TOKEN;
const FILE = '.github/workflows/ci.yml';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const d = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'User-Agent': 'node',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(d),
      },
    };
    const r = https.request(opts, resp => {
      let s = '';
      resp.on('data', c => s += c);
      resp.on('end', () => resolve(JSON.parse(s)));
    });
    r.on('error', reject);
    if (d) r.write(d);
    r.end();
  });
}

const cur = await req('GET', `/repos/HomeStream-co/homestream/contents/${FILE}`);
const content = Buffer.from(cur.content, 'base64').toString();

const patched = content
  .replace(
    '# Pass 120000ms wait timeout — Windows CI runners are slower than Linux.',
    '# Pass 180000ms wait timeout — NSIS installer startup can take ~2 min on Windows CI.'
  )
  .replace(
    'run: node scripts/smoke-test.mjs http://127.0.0.1:3000 120000',
    'run: node scripts/smoke-test.mjs http://127.0.0.1:3000 180000'
  );

if (patched === content) {
  console.error('ERROR: pattern not found — nothing changed');
  process.exit(1);
}

const result = await req('PUT', `/repos/HomeStream-co/homestream/contents/${FILE}`, {
  message: 'fix(ci): bump Windows NSIS smoke-test wait to 180s (server takes ~2min to start)',
  content: Buffer.from(patched).toString('base64'),
  sha: cur.sha,
});

console.log(result.commit?.sha?.slice(0, 7) || result.message);
