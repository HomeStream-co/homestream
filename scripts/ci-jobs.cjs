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
    }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{res(JSON.parse(d))}catch(e){res({err:d.slice(0,200)})} }); }).on('error',rej);
  });
}

const RUN_ID = '24869363139';
(async()=>{
  const jobs = await get(`/repos/trevorrossworn-code/homestream/actions/runs/${RUN_ID}/jobs`);
  if (jobs.err) { console.log('API ERR:', jobs.err); return; }
  for (const j of jobs.jobs) {
    console.log('\nJOB:', j.id, j.name, '|', j.conclusion);
    for (const s of j.steps) {
      const icon = s.conclusion==='failure'?'❌ FAIL':s.conclusion==='success'?'✓':'  -';
      console.log('  ',icon, s.number, s.name, '|', s.conclusion||'');
    }
  }
})();
