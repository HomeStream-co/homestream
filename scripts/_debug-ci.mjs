import { getSecret } from '#airo/secrets';
const token = getSecret('GH_TOKEN');
const h = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };
const BASE = 'https://api.github.com/repos/HomeStream-co/homestream';

async function failedJobs(runId) {
  const r = await fetch(`${BASE}/actions/runs/${runId}/jobs`, { headers: h });
  return (await r.json()).jobs.filter(j => j.conclusion === 'failure').map(j => ({ id: j.id, name: j.name }));
}

async function errLines(jobId) {
  const r = await fetch(`${BASE}/actions/jobs/${jobId}/logs`, { headers: h });
  const log = await r.text();
  return log.split('\n')
    .filter(l => l.includes('##[error]') || l.includes('npm ERR') || l.includes('error TS') || l.includes('FAILED') || /\berror\b/i.test(l))
    .slice(0, 25).join('\n');
}

// CI main run + Release run
const [ciJobs, relJobs] = await Promise.all([failedJobs(26990711504), failedJobs(26990721447)]);
const all = [...ciJobs, ...relJobs];
console.log('Failed:', all.map(j => `${j.name}(${j.id})`).join(', '));

const results = await Promise.all(all.map(j => errLines(j.id).then(l => ({ name: j.name, log: l }))));
for (const { name, log } of results) {
  console.log(`\n=== ${name} ===\n${log || '(none)'}`);
}
