const { createRequire } = require('module');
const https = require('https');
const zlib = require('zlib');
const req = createRequire(__filename);
const { getSecret } = req('#airo/secrets');
const tok = getSecret('GH_TOKEN');

function get(path) {
  return new Promise((res, rej) => {
    https.get({
      hostname: 'api.github.com', path,
      headers: { Authorization: 'token ' + tok, 'User-Agent': 'hs' }
    }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{res(JSON.parse(d))}catch(e){res({_raw:d.slice(0,500)})} }); }).on('error',rej);
  });
}

function fetchLog(url) {
  return new Promise(res => {
    function fetch(u, redirects) {
      if (redirects > 5) { res('TOO MANY REDIRECTS'); return; }
      const parsed = new URL(u);
      const isGH = parsed.hostname === 'api.github.com';
      const headers = { 'User-Agent': 'hs', 'Accept-Encoding': 'gzip' };
      if (isGH) headers.Authorization = 'token ' + tok;
      https.get({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers }, r => {
        if (r.statusCode === 301 || r.statusCode === 302) {
          r.resume();
          fetch(r.headers.location, redirects + 1);
          return;
        }
        const chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => {
          const buf = Buffer.concat(chunks);
          if ((r.headers['content-encoding'] || '').includes('gzip')) {
            zlib.gunzip(buf, (e, d) => res(e ? 'GUNZIP ERR' : d.toString('utf8')));
          } else {
            res(buf.toString('utf8'));
          }
        });
      }).on('error', e => res('FETCH ERR: ' + e.message));
    }
    fetch(url, 0);
  });
}

(async () => {
  // Get latest release run
  const runsData = await get('/repos/trevorrossworn-code/homestream/actions/runs?per_page=15');
  const releaseRun = runsData.workflow_runs.find(r =>
    r.name === 'Release' || r.path === '.github/workflows/release.yml'
  );
  if (!releaseRun) { console.log('No release run found'); return; }

  console.log('Run:', releaseRun.id, releaseRun.status, releaseRun.conclusion || 'running', releaseRun.created_at.slice(0,16), 'sha:' + releaseRun.head_sha.slice(0,8));

  const jobs = await get(`/repos/trevorrossworn-code/homestream/actions/runs/${releaseRun.id}/jobs`);
  if (jobs._raw) { console.log('Jobs API raw:', jobs._raw); return; }

  for (const j of jobs.jobs) {
    console.log('\nJOB:', j.id, j.name, '|', j.conclusion || j.status);
    for (const s of j.steps) {
      const icon = s.conclusion === 'failure' ? '❌' : s.conclusion === 'success' ? '✓' : ' -';
      console.log('  ', icon, s.number, s.name, '|', s.conclusion || s.status || '');
    }

    if (j.conclusion === 'failure') {
      console.log('\n  --- FETCHING FAILURE LOG ---');
      const log = await fetchLog(`https://api.github.com/repos/trevorrossworn-code/homestream/actions/jobs/${j.id}/logs`);
      const lines = log.split('\n');
      // Find error lines
      const errLines = lines.filter(l =>
        /error|Error|ERROR|fail|Fail|FAIL|Unknown|Cannot|ENOENT|exit code|rejected/i.test(l) &&
        !/##\[group\]|##\[endgroup\]/.test(l)
      );
      console.log('\n  KEY ERROR LINES:');
      errLines.slice(0, 40).forEach(l => console.log('  ', l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, '')));

      // Also dump last 60 lines of the log
      console.log('\n  LAST 60 LINES:');
      lines.slice(Math.max(0, lines.length - 60)).forEach(l =>
        console.log('  ', l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, ''))
      );
    }
  }
})().catch(e => console.error('FATAL:', e.message));
