import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getSecret } = require('#airo/secrets');
const token = getSecret('GH_TOKEN');
const RUN_ID = '26928743267';

const headers = {
  'Authorization': `Bearer ${token}`,
  'User-Agent': 'homestream-ci',
  'Accept': 'application/vnd.github+json'
};

const res = await fetch(`https://api.github.com/repos/HomeStream-co/homestream/actions/runs/${RUN_ID}/jobs`, { headers });
const data = await res.json();
const winJob = data.jobs.find(j => j.name.includes('Windows') && j.conclusion === 'failure');
console.log('Windows job ID:', winJob?.id);

const logRes = await fetch(
  `https://api.github.com/repos/HomeStream-co/homestream/actions/jobs/${winJob.id}/logs`,
  { headers, redirect: 'manual' }
);
const redirectUrl = logRes.headers.get('location');
if (redirectUrl) {
  const logsRes = await fetch(redirectUrl);
  const logs = await logsRes.text();
  const lines = logs.split('\n').map(l => l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z /, ''));
  // Find the failure area
  const failIdx = lines.findIndex(l => l.includes('Verify NSIS') || l.includes('error') || l.includes('Error'));
  const start = Math.max(0, failIdx - 5);
  console.log(lines.slice(start, start + 60).join('\n'));
}
