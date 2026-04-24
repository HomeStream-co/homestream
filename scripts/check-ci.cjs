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
    }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); }).on('error',rej);
  });
}

function follow(url) {
  return new Promise(res => {
    function fetch(u) {
      const parsed = new URL(u);
      const opts = { hostname: parsed.hostname, path: parsed.pathname+parsed.search, headers: { Authorization:'token '+tok, 'User-Agent':'hs' } };
      https.get(opts, r => {
        if (r.statusCode === 302 || r.statusCode === 301) { fetch(r.headers.location); return; }
        let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d));
      }).on('error',()=>res(''));
    }
    fetch(url);
  });
}

const RUN_ID = '24869363139';

(async()=>{
  const jobs = await get(`/repos/trevorrossworn-code/homestream/actions/runs/${RUN_ID}/jobs`);
  for (const j of jobs.jobs) {
    console.log('\nJOB:', j.name, '|', j.conclusion);
    for (const s of j.steps) {
      const icon = s.conclusion==='failure'?'FAIL':s.conclusion==='success'?'OK':'-';
      console.log(' ',icon, s.number, s.name);
    }
    if (j.conclusion === 'failure') {
      console.log('\n=== LOG (last 120 lines) ===');
      const log = await follow(`https://api.github.com/repos/trevorrossworn-code/homestream/actions/jobs/${j.id}/logs`);
      const lines = log.split('\n');
      console.log(lines.slice(Math.max(0,lines.length-120)).join('\n'));
    }
  }
})();
