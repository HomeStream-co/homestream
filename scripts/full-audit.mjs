import { execSync } from 'child_process';
const token = execSync('git remote get-url new-origin').toString().trim().replace('https://','').split('@')[0];
const H = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' };
const REPO = 'HomeStream-co/homestream';

// 1. All releases
const releases = await (await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, { headers: H })).json();
console.log('=== All Releases on HomeStream-co ===');
for (const r of releases) {
  const assetNames = r.assets?.map(a => a.name).join(', ') || '(no assets)';
  console.log(`  ${r.tag_name} | draft:${r.draft} | assets: ${assetNames}`);
}
if (!releases.length) console.log('  (none)');

// 2. All tags
const tags = await (await fetch(`https://api.github.com/repos/${REPO}/tags?per_page=20`, { headers: H })).json();
console.log('\n=== All Tags on HomeStream-co ===');
for (const t of tags) console.log(`  ${t.name}`);

// 3. Repo secrets
const secrets = await (await fetch(`https://api.github.com/repos/${REPO}/actions/secrets`, { headers: H })).json();
console.log('\n=== Repo Action Secrets ===');
for (const s of secrets.secrets ?? []) console.log(`  ${s.name}`);

// 4. Repo settings
const repo = await (await fetch(`https://api.github.com/repos/${REPO}`, { headers: H })).json();
console.log('\n=== Repo Settings ===');
console.log(`  private: ${repo.private}`);
console.log(`  default_branch: ${repo.default_branch}`);
console.log(`  has_issues: ${repo.has_issues}`);
console.log(`  description: ${repo.description}`);

// 5. Current run detail
const run = await (await fetch(`https://api.github.com/repos/${REPO}/actions/runs/24920818912`, { headers: H })).json();
const dur = Math.round((new Date(run.updated_at) - new Date(run.created_at))/1000);
console.log(`\n=== v1.6.6 Release Run ===`);
console.log(`  status: ${run.status} | conclusion: ${run.conclusion} | duration so far: ${dur}s`);

// 6. Jobs for that run
const jobs = await (await fetch(`https://api.github.com/repos/${REPO}/actions/runs/24920818912/jobs`, { headers: H })).json();
for (const job of jobs.jobs ?? []) {
  console.log(`\n  JOB: ${job.name} | ${job.status} | ${job.conclusion ?? 'running'}`);
  for (const step of job.steps ?? []) {
    const icon = step.conclusion === 'failure' ? '❌' : step.conclusion === 'success' ? '✅' : step.status === 'in_progress' ? '🔄' : '⏳';
    console.log(`    ${icon} ${step.number}. ${step.name} — ${step.conclusion ?? step.status}`);
  }
}
