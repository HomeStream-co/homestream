const { createRequire } = require('module');
const https = require('https');
const zlib = require('zlib');
const req = createRequire(__filename);
const { getSecret } = req('#airo/secrets');
const tok = getSecret('GH_TOKEN');

const JOB_ID = '72812322414'; // the failed job

function httpsGet(opts) {
  return new Promise((res, rej) => {
    https.get(opts, r => {
      // handle redirect
      if (r.statusCode === 301 || r.statusCode === 302) {
        const loc = r.headers.location;
        r.resume();
        const u = new URL(loc);
        httpsGet({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'hs', 'Accept-Encoding': 'gzip' } }).then(res).catch(rej);
        return;
      }
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const buf = Buffer.concat(chunks);
        const enc = r.headers['content-encoding'];
        if (enc === 'gzip') {
          zlib.gunzip(buf, (e, d) => e ? rej(e) : res(d.toString('utf8')));
        } else {
          res(buf.toString('utf8'));
        }
      });
    }).on('error', rej);
  });
}

(async () => {
  const log = await httpsGet({
    hostname: 'api.github.com',
    path: `/repos/trevorrossworn-code/homestream/actions/jobs/${JOB_ID}/logs`,
    headers: { Authorization: 'token ' + tok, 'User-Agent': 'hs', 'Accept-Encoding': 'gzip' }
  });

  const lines = log.split('\n');
  // Find the NSIS step - look for step 9
  let inStep9 = false;
  const relevant = [];
  for (const line of lines) {
    if (line.includes('##[group]Run npx electron-builder') || line.includes('Package & publish NSIS')) inStep9 = true;
    if (inStep9) relevant.push(line);
    if (inStep9 && line.includes('##[endgroup]') && relevant.length > 5) break;
  }

  if (relevant.length > 0) {
    console.log('=== NSIS STEP OUTPUT ===');
    console.log(relevant.slice(0, 200).join('\n'));
  } else {
    // Just dump last 200 lines
    console.log('=== LAST 200 LINES ===');
    console.log(lines.slice(Math.max(0, lines.length - 200)).join('\n'));
  }
})().catch(e => console.error('FATAL:', e.message));
