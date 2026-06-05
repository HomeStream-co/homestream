import { getSecret } from '#airo/secrets';
const token = getSecret('GH_TOKEN');
const h = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };
const BASE = 'https://api.github.com/repos/HomeStream-co/homestream';

async function getJobs(runId) {
  const r = await fetch(`${BASE}/actions/runs/${runId}/jobs`, { headers: h });
  const d = await r.json();
  return d.jobs.map(j => `  [${j.status === 'completed' ? j.conclusion : j.status}] ${j.name}`).join('\n');
}
async function getRun(id) {
  const r = await fetch(`${BASE}/actions/runs/${id}`, { headers: h });
  return r.json();
}

for (const id of [27025515700, 27025503462]) {
  const run = await getRun(id);
  console.log(`\n[${run.status}/${run.conclusion ?? '…'}] ${run.name} (${id})`);
  console.log(await getJobs(id));
}

// Check release assets
const rel = await fetch(`${BASE}/releases/tags/v2.0.2`, { headers: h });
if (rel.ok) {
  const r = await rel.json();
  console.log(`\nRelease v2.0.2: ${r.html_url}`);
  console.log('Assets:', r.assets.map(a => `${a.name} (${(a.size/1024/1024).toFixed(1)}MB)`).join(', ') || '(none yet)');
}
