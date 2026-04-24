const { createRequire } = require('module');
const https = require('https');
const req = createRequire(__filename);
const { getSecret } = req('#airo/secrets');
const tok = getSecret('GH_TOKEN');

function get(path) {
  return new Promise((res, rej) => {
    https.get({
      hostname: 'api.github.com', path,
      headers: { Authorization: 'token ' + tok, 'User-Agent': 'hs' }
    }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{res(JSON.parse(d))}catch(e){res({err:d.slice(0,300)})} }); }).on('error',rej);
  });
}

(async () => {
  const runsData = await get('/repos/trevorrossworn-code/homestream/actions/runs?per_page=10&event=push');
  const latestRelease = runsData.workflow_runs.find(r => r.name === 'Release');
  if (!latestRelease) { console.log('No release run found'); return; }
  const RUN_ID = latestRelease.id;
  console.log('Latest Release run:', RUN_ID, latestRelease.status, latestRelease.conclusion || 'in-progress', latestRelease.created_at.slice(0,16));

  const jobs = await get(`/repos/trevorrossworn-code/homestream/actions/runs/${RUN_ID}/jobs`);
  if (jobs.err) { console.log('API ERR:', jobs.err); return; }
  for (const j of jobs.jobs) {
    console.log('\nJOB:', j.id, j.name, '|', j.conclusion || j.status);
    for (const s of j.steps) {
      const icon = s.conclusion==='failure' ? '❌ FAIL' : s.conclusion==='success' ? '✓' : '  -';
      console.log('  ', icon, s.number, s.name, '|', s.conclusion || s.status || '');
    }
  }
})();
