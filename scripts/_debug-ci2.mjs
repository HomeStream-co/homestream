import { getSecret } from '#airo/secrets';
const token = getSecret('GH_TOKEN');
const h = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };
const BASE = 'https://api.github.com/repos/HomeStream-co/homestream';

async function tailLog(jobId, keyword) {
  const r = await fetch(`${BASE}/actions/jobs/${jobId}/logs`, { headers: h });
  const log = await r.text();
  const lines = log.split('\n');
  if (keyword) {
    const idx = lines.findIndex(l => l.includes(keyword));
    if (idx >= 0) return lines.slice(Math.max(0, idx - 3), idx + 30).join('\n');
  }
  // last 40 lines
  return lines.slice(-40).join('\n');
}

// Tests job: AssertionError about fetch('/api/setup')
console.log('=== Tests — around AssertionError ===');
console.log(await tailLog(79650054817, 'AssertionError'));

// Linux job: full tail
console.log('\n=== Linux — tail ===');
console.log(await tailLog(79650085136, null));

// Windows: 401 Unauthorized context
console.log('\n=== Windows — around 401 ===');
console.log(await tailLog(79650085127, '401 Unauthorized'));
