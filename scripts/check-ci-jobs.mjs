import https from 'https';

const token = process.env.GH_TOKEN;
const RUN_ID = '26721024620'; // Latest Release run (failed)

function ghGet(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.github.com',
      path,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'HomeStream-Check'
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

function ghGetText(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.github.com',
      path,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.raw+json',
        'User-Agent': 'HomeStream-Check'
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

const jobs = await ghGet(`/repos/HomeStream-co/homestream/actions/runs/${RUN_ID}/jobs`);
console.log('=== JOBS FOR RELEASE RUN', RUN_ID, '===');
for (const job of (jobs.jobs || [])) {
  const icon = job.conclusion === 'success' ? '✅' : job.conclusion === 'failure' ? '❌' : '⏳';
  console.log(icon, job.id, '|', job.name, '|', job.conclusion);
  for (const step of (job.steps || [])) {
    const s = step.conclusion === 'success' ? '  ✅' : step.conclusion === 'failure' ? '  ❌' : step.conclusion === 'skipped' ? '  ⏭️ ' : '  ⏳';
    console.log(s, step.number, step.name, step.conclusion || '');
  }
  // Get logs for failed jobs
  if (job.conclusion === 'failure') {
    console.log('\n  --- LOGS (last 80 lines) ---');
    try {
      const logs = await ghGetText(`/repos/HomeStream-co/homestream/actions/jobs/${job.id}/logs`);
      const lines = logs.split('\n');
      const last = lines.slice(-80).join('\n');
      console.log(last);
    } catch(e) {
      console.log('  Could not fetch logs:', e.message);
    }
  }
}
