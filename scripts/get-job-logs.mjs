import https from 'https';

const token = process.env.GH_TOKEN;
const JOB_ID = process.env.JOB_ID;

// Step 1: get redirect URL from GitHub
function getRedirectUrl() {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.github.com',
      path: `/repos/HomeStream-co/homestream/actions/jobs/${JOB_ID}/logs`,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'HomeStream'
      }
    }, res => {
      res.resume();
      if (res.statusCode === 302) resolve(res.headers.location);
      else reject(new Error('Expected 302, got ' + res.statusCode));
    }).on('error', reject);
  });
}

// Step 2: fetch from Azure without auth
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'HomeStream' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

const redirectUrl = await getRedirectUrl();
const raw = await fetchUrl(redirectUrl);
const lines = raw.split('\n');

// Strip timestamps (format: 2026-05-31T19:08:01.1234567Z )
const clean = lines.map(l => l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z /, ''));

// Find error lines
const errorLines = clean.map((l, i) => ({ l, i })).filter(({ l }) =>
  /error|Error|ERROR|failed|Failed|FAILED|cannot|Cannot|exit code/i.test(l)
);

console.log('=== ERROR LINES ===');
errorLines.slice(0, 20).forEach(({ l, i }) => {
  const ctx = clean.slice(Math.max(0, i - 2), i + 3);
  console.log(`\n[line ${i}]`);
  console.log(ctx.join('\n'));
});

console.log('\n=== LAST 40 LINES ===');
console.log(clean.slice(-40).join('\n'));
