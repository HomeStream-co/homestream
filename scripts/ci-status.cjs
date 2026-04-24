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
  // No event filter — get ALL recent runs
  const runsData = await get('/repos/trevorrossworn-code/homestream/actions/runs?per_page=15');
  console.log('All recent runs:');
  runsData.workflow_runs.forEach(r => {
    console.log(' ', r.id, r.name.padEnd(35), r.event.padEnd(12), r.status.padEnd(12), (r.conclusion||'...').padEnd(10), r.created_at.slice(0,16), 'sha:'+r.head_sha.slice(0,8));
  });
})();
