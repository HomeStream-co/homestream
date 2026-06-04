import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getSecret } = require('#airo/secrets');
const token = getSecret('GH_TOKEN');
const RUN_ID = process.argv[2] || '26929684910';
const JOB_NAME = process.argv[3] || 'Smoke Test Windows NSIS Installer';

const headers = {
  'Authorization': `Bearer ${token}`,
  'User-Agent': 'homestream-ci',
  'Accept': 'application/vnd.github+json'
};

const res = await fetch(`https://api.github.com/repos/HomeStream-co/homestream/actions/runs/${RUN_ID}/jobs`, { headers });
const { jobs } = await res.json();
const job = jobs.find(j => j.name === JOB_NAME);
if (!job) { console.log('Job not found. Available:', jobs.map(j=>j.name).join(', ')); process.exit(1); }

console.log('Job:', job.name, '|', job.conclusion);
const logRes = await fetch(
  `https://api.github.com/repos/HomeStream-co/homestream/actions/jobs/${job.id}/logs`,
  { headers, redirect: 'manual' }
);
const url = logRes.headers.get('location');
if (!url) { console.log('No log URL'); process.exit(1); }
const logsRes = await fetch(url);
const logs = await logsRes.text();
const lines = logs.split('\n').map(l => l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z /, ''));
// Find the failure area
const failIdx = lines.findIndex(l => l.includes('FAILED') || l.includes('error') || l.includes('Error') || l.includes('No HomeStream'));
const start = Math.max(0, (failIdx >= 0 ? failIdx : lines.length) - 30);
console.log(lines.slice(start, start + 60).join('\n'));
