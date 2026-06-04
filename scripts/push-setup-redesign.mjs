import fs from 'fs';
import https from 'https';

const TOKEN = process.env.TOKEN;
const FILES = [
  'src/pages/setup.tsx',
  'src/pages/setup/StepSysReqs.tsx',
  'src/pages/setup/StepMediaFolder.tsx',
  'src/pages/setup/StepOptional.tsx',
  'src/pages/setup/StepApiKeys.tsx',
  'src/pages/setup/StepFinish.tsx',
];

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

for (const f of FILES) {
  const content = fs.readFileSync(f).toString('base64');
  const cur = await req('GET', `/repos/HomeStream-co/homestream/contents/${f}`);
  const sha = cur.sha || undefined;
  const body = { message: `feat(setup): redesign ${f}`, content, sha };
  const result = await req('PUT', `/repos/HomeStream-co/homestream/contents/${f}`, body);
  console.log(f, '->', result.commit?.sha?.slice(0, 7) || result.message);
}
