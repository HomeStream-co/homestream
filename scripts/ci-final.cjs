const { createRequire } = require('module');
const https = require('https');
const { getSecret } = createRequire('/app/package.json')('#airo/secrets');
const tok = getSecret('GH_TOKEN');

function get(p) {
  return new Promise((r, j) => {
    https.get({ hostname: 'api.github.com', path: p, headers: { Authorization: 'token ' + tok, 'User-Agent': 'hs' } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => r(JSON.parse(d))); }).on('error', j);
  });
}

(async () => {
  const run = await get('/repos/trevorrossworn-code/homestream/actions/runs/24870230147');
  console.log('RUN:', run.status, '|', run.conclusion || 'running');

  const jobs = await get('/repos/trevorrossworn-code/homestream/actions/runs/24870230147/jobs');
  for (const j of jobs.jobs) {
    console.log('\nJOB:', j.name, '|', j.conclusion || j.status);
    for (const s of j.steps) {
      const icon = s.conclusion === 'failure' ? '❌' : s.conclusion === 'success' ? '✓' : s.status === 'in_progress' ? '▶' : ' -';
      console.log(' ', icon, s.number, s.name, '|', s.conclusion || s.status || '');
    }
  }

  const rel = await get('/repos/trevorrossworn-code/homestream/releases/tags/v1.5.8');
  if (rel.assets && rel.assets.length) {
    console.log('\nRELEASE ASSETS on GitHub:');
    rel.assets.forEach(a => console.log(' ', a.name, (a.size / 1024 / 1024).toFixed(1) + ' MB', a.state));
  } else {
    console.log('\nNo release assets yet (or release not found)');
    if (rel.message) console.log('API msg:', rel.message);
  }
})();
