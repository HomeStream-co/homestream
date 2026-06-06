import { getSecret } from '#airo/secrets';
const token = getSecret('GH_TOKEN');
const h = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };
const BASE = 'https://api.github.com/repos/HomeStream-co/homestream';

const RUN_IDS = [27025515700, 27025503462]; // Release, CI

async function getJobs(runId) {
  const r = await fetch(`${BASE}/actions/runs/${runId}/jobs`, { headers: h });
  const d = await r.json();
  return d.jobs.map(j => `    [${j.status === 'completed' ? j.conclusion : j.status}] ${j.name}`).join('\n');
}

async function getRun(runId) {
  const r = await fetch(`${BASE}/actions/runs/${runId}`, { headers: h });
  return r.json();
}

// Poll until both complete
let attempts = 0;
while (attempts++ < 40) {
  const runs = await Promise.all(RUN_IDS.map(getRun));
  const allDone = runs.every(r => r.status === 'completed');

  console.clear?.();
  for (const run of runs) {
    console.log(`[${run.status}/${run.conclusion ?? '…'}] ${run.name} (${run.id})`);
    console.log(await getJobs(run.id));
  }

  if (allDone) {
    console.log('\n=== All runs complete ===');
    const allPassed = runs.every(r => r.conclusion === 'success');
    console.log(allPassed ? '✓ All passed!' : '✗ Some failed');
    break;
  }
  await new Promise(r => setTimeout(r, 20000));
}
