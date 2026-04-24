import { createRequire } from 'module';
import https from 'https';

const req = createRequire(import.meta.url);
const { getSecret } = req('#airo/secrets');
const tok = getSecret('GH_TOKEN');

function get(path) {
  return new Promise((res, rej) => {
    const opts = {
      hostname: 'api.github.com', path,
      headers: { Authorization: 'token ' + tok, 'User-Agent': 'homestream-ci' }
    };
    https.get(opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

function getLog(url) {
  return new Promise((res) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search,
      headers: { Authorization: 'token ' + tok, 'User-Agent': 'homestream-ci' }
    };
    https.get(opts, r => {
      if (r.statusCode === 302 || r.statusCode === 301) {
        // follow redirect
        const u2 = new URL(r.headers.location);
        https.get({ hostname: u2.hostname, path: u2.pathname + u2.search, headers: { 'User-Agent': 'homestream-ci' } }, r2 => {
          let d = '';
          r2.on('data', c => d += c);
          r2.on('end', () => res(d));
        }).on('error', () => res(''));
      } else {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => res(d));
      }
    }).on('error', () => res(''));
  });
}

const RUN_ID = '24869363139';

const jobs = await get(`/repos/trevorrossworn-code/homestream/actions/runs/${RUN_ID}/jobs`);
for (const j of jobs.jobs) {
  console.log('\nJOB:', j.name, j.status, j.conclusion);
  for (const s of j.steps) {
    const icon = s.conclusion === 'failure' ? '❌' : s.conclusion === 'success' ? '✓' : '-';
    console.log(' ', icon, s.number, s.name, s.conclusion ?? '');
  }

  // Get log for failed job
  if (j.conclusion === 'failure') {
    console.log('\n--- FETCHING LOG ---');
    const log = await getLog(`https://api.github.com/repos/trevorrossworn-code/homestream/actions/jobs/${j.id}/logs`);
    // Print last 150 lines
    const lines = log.split('\n');
    const tail = lines.slice(Math.max(0, lines.length - 150));
    console.log(tail.join('\n'));
  }
}
