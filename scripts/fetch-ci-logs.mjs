import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getSecret } = require('#airo/secrets');
const token = getSecret('GH_TOKEN');
const RUN_ID = '26929517818';

const headers = {
  'Authorization': `Bearer ${token}`,
  'User-Agent': 'homestream-ci',
  'Accept': 'application/vnd.github+json'
};

const res = await fetch(`https://api.github.com/repos/HomeStream-co/homestream/actions/runs/${RUN_ID}/jobs`, { headers });
const data = await res.json();

// Get the plain Smoke Test job (not linux/windows)
const smokeJob = data.jobs.find(j => j.name === 'Smoke Test' && j.conclusion === 'failure');
console.log('Fetching logs for job:', smokeJob.name, smokeJob.id);

const logRes = await fetch(
  `https://api.github.com/repos/HomeStream-co/homestream/actions/jobs/${smokeJob.id}/logs`,
  { headers, redirect: 'manual' }
);
const redirectUrl = logRes.headers.get('location');
if (redirectUrl) {
  const logsRes = await fetch(redirectUrl);
  const logs = await logsRes.text();
  const lines = logs.split('\n').map(l => l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z /, ''));
  // Find smoke test output
  const startIdx = lines.findIndex(l => l.includes('HomeStream Smoke Test'));
  const start = startIdx >= 0 ? startIdx : Math.max(0, lines.length - 60);
  console.log(lines.slice(start, start + 80).join('\n'));
}
