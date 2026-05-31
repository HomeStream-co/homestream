import https from 'https';

const token = process.env.GH_TOKEN;
const RUN_ID = process.env.RUN_ID;

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

const jobs = await ghGet(`/repos/HomeStream-co/homestream/actions/runs/${RUN_ID}/jobs`);
for (const job of (jobs.jobs || [])) {
  const icon = job.conclusion === 'success' ? '✅' : job.conclusion === 'failure' ? '❌' : job.status === 'in_progress' ? '🔄' : '⏳';
  console.log(`\n${icon} JOB: ${job.name} | ${job.status} | ${job.conclusion || 'pending'}`);
  for (const step of (job.steps || [])) {
    const s = step.conclusion === 'success' ? '  ✅' : step.conclusion === 'failure' ? '  ❌' : step.conclusion === 'skipped' ? '  ⏭️ ' : step.status === 'in_progress' ? '  🔄' : '  ⏳';
    console.log(`${s} ${step.number}. ${step.name} [${step.conclusion || step.status}]`);
  }
}
