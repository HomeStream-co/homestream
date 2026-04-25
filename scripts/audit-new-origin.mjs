import { execSync } from 'child_process';
const token = execSync('git remote get-url new-origin').toString().trim().replace('https://','').split('@')[0];
const H = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' };
const REPO = 'HomeStream-co/homestream';

// Releases
const releases = await (await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, { headers: H })).json();
console.log('=== Releases on HomeStream-co ===');
if (!releases.length) console.log('(none)');
for (const r of releases) console.log(`${r.tag_name} | draft:${r.draft} | prerelease:${r.prerelease} | assets:${r.assets?.length} | ${r.created_at}`);

// Workflows
const wf = await (await fetch(`https://api.github.com/repos/${REPO}/actions/workflows`, { headers: H })).json();
console.log('\n=== Workflows ===');
for (const w of wf.workflows ?? []) console.log(`${w.name} | ${w.state} | ${w.path}`);

// Latest runs
const runs = await (await fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=6`, { headers: H })).json();
console.log('\n=== Latest runs ===');
for (const r of runs.workflow_runs ?? []) {
  const dur = Math.round((new Date(r.updated_at) - new Date(r.created_at))/1000);
  console.log(`${r.id} | ${r.name.padEnd(28)} | ${r.status.padEnd(12)} | ${String(r.conclusion).padEnd(12)} | ${r.head_branch.padEnd(12)} | ${dur}s`);
}

// Secrets configured on the repo
const secrets = await (await fetch(`https://api.github.com/repos/${REPO}/actions/secrets`, { headers: H })).json();
console.log('\n=== Repo Secrets ===');
for (const s of secrets.secrets ?? []) console.log(`  ${s.name} (updated ${s.updated_at})`);
if (!secrets.secrets?.length) console.log('(none visible or no access)');
