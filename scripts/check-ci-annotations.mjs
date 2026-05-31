import https from 'https';

const token = process.env.GH_TOKEN;

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

const WIN_JOB = '78747994537';
const LIN_JOB = '78747994538';

async function getAnnotations(jobId, label) {
  console.log(`\n=== ${label} ===`);
  const data = await ghGet(`/repos/HomeStream-co/homestream/actions/jobs/${jobId}/annotations`);
  if (!Array.isArray(data) || data.length === 0) {
    console.log('No annotations found. msg:', data?.message || '(none)');
    return;
  }
  data.forEach(a => {
    console.log(`[${a.annotation_level}] ${a.title || ''}`);
    console.log(`  ${a.message}`);
  });
}

// Also get the full run details to see any error messages
async function getRunDetails(runId, label) {
  console.log(`\n=== RUN DETAILS: ${label} ===`);
  const data = await ghGet(`/repos/HomeStream-co/homestream/actions/runs/${runId}`);
  console.log('Status:', data.status, '| Conclusion:', data.conclusion);
  console.log('Jobs URL:', data.jobs_url);
}

await getAnnotations(WIN_JOB, 'Windows job annotations');
await getAnnotations(LIN_JOB, 'Linux job annotations');

// Get step-level details for the failed steps
const winJobs = await ghGet(`/repos/HomeStream-co/homestream/actions/jobs/${WIN_JOB}`);
console.log('\n=== WINDOWS FAILED STEP DETAIL ===');
winJobs.steps?.filter(s => s.conclusion === 'failure').forEach(s => {
  console.log('Step', s.number, ':', s.name);
  console.log('  Started:', s.started_at, '| Completed:', s.completed_at);
});

const linJobs = await ghGet(`/repos/HomeStream-co/homestream/actions/jobs/${LIN_JOB}`);
console.log('\n=== LINUX FAILED STEP DETAIL ===');
linJobs.steps?.filter(s => s.conclusion === 'failure').forEach(s => {
  console.log('Step', s.number, ':', s.name);
  console.log('  Started:', s.started_at, '| Completed:', s.completed_at);
});
