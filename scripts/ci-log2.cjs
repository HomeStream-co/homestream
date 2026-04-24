const { createRequire } = require('module');
const https = require('https');
const zlib = require('zlib');
const req = createRequire(__filename);
const { getSecret } = req('#airo/secrets');
const tok = getSecret('GH_TOKEN');

// Will be set dynamically below

function httpsGet(opts) {
  return new Promise((res, rej) => {
    https.get(opts, r => {
      if (r.statusCode === 301 || r.statusCode === 302) {
        const u = new URL(r.headers.location);
        r.resume();
        httpsGet({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'hs', 'Accept-Encoding': 'gzip' } }).then(res).catch(rej);
        return;
      }
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const buf = Buffer.concat(chunks);
        if ((r.headers['content-encoding'] || '').includes('gzip')) {
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
  console.log('TOTAL LINES:', lines.length);

  // Find lines mentioning electron-builder, error, nsis, publish
  const keywords = ['error', 'Error', 'ERROR', 'failed', 'Failed', 'FAILED', 'nsis', 'NSIS', 'publish', 'electron-builder', 'Cannot', 'cannot', 'exit', 'Exit', 'ENOENT', 'EPERM', 'rejected', 'Unhandled'];
  const hits = [];
  lines.forEach((l, i) => {
    const clean = l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, '');
    if (keywords.some(k => l.includes(k))) {
      hits.push(`[${i}] ${clean}`);
    }
  });
  console.log('\n=== KEYWORD HITS ===');
  console.log(hits.slice(0, 150).join('\n'));

  // Also dump lines 400-600 (likely where step 9 runs)
  console.log('\n=== LINES 350-550 ===');
  lines.slice(350, 550).forEach((l, i) => {
    console.log(`[${350+i}] ${l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, '')}`);
  });
})().catch(e => console.error('FATAL:', e.message, e.stack));
