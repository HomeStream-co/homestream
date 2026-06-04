import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getSecret } = require('#airo/secrets');
const token = getSecret('GH_TOKEN');
const RUN_ID = process.argv[2] || '26929684910';
const h = { 'Authorization': `Bearer ${token}`, 'User-Agent': 'homestream-ci', 'Accept': 'application/vnd.github+json' };

const [runRes, jobsRes] = await Promise.all([
  fetch(`https://api.github.com/repos/HomeStream-co/homestream/actions/runs/${RUN_ID}`, { headers: h }),
  fetch(`https://api.github.com/repos/HomeStream-co/homestream/actions/runs/${RUN_ID}/jobs`, { headers: h }),
]);
const run = await runRes.json();
const { jobs } = await jobsRes.json();

console.log('OVERALL:', (run.conclusion || run.status).toUpperCase(), `(${run.head_sha?.slice(0,7)})`);
for (const j of jobs || []) {
  const icon = j.conclusion === 'success' ? '✓' : j.conclusion === 'failure' ? '✗' : '…';
  console.log(` ${icon} ${(j.conclusion || j.status).padEnd(11)} ${j.name}`);
  if (j.conclusion === 'failure') {
    for (const s of j.steps || []) {
      if (s.conclusion === 'failure') console.log(`     FAILED STEP: ${s.name}`);
    }
  }
}
