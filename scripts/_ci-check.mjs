import { getSecret } from '#airo/secrets';
const token = getSecret('GH_TOKEN');
const h = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };
const runId = process.argv[2];
const r = await fetch(`https://api.github.com/repos/HomeStream-co/homestream/actions/runs/${runId}`, { headers: h });
const d = await r.json();
console.log('status:', d.status, '| conclusion:', d.conclusion);
const jr = await fetch(`https://api.github.com/repos/HomeStream-co/homestream/actions/runs/${runId}/jobs`, { headers: h });
const jd = await jr.json();
for (const job of jd.jobs) {
  const icon = job.conclusion === 'success' ? '✓' : job.conclusion === 'failure' ? '✗' : job.conclusion === 'skipped' ? '-' : '?';
  console.log(`${icon} ${job.name} | ${job.conclusion}`);
  if (job.conclusion === 'failure') {
    for (const step of job.steps) {
      if (step.conclusion === 'failure') console.log(`    FAILED STEP: ${step.name}`);
    }
  }
}
