import { execSync } from 'child_process';

// Extract token from new-origin remote URL
const remoteUrl = execSync('git remote get-url new-origin').toString().trim();
// Format: https://<token>@github.com/HomeStream-co/homestream.git
const token = remoteUrl.replace('https://', '').split('@')[0];
console.log(`token prefix: ${token.slice(0,6)}... len=${token.length}`);

const H = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' };
const REPO = 'HomeStream-co/homestream';

const repoRes = await fetch(`https://api.github.com/repos/${REPO}`, { headers: H });
console.log('repo status:', repoRes.status);
const repo = await repoRes.json();
console.log('repo:', repo.full_name ?? repo.message);

const runsRes = await fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=6`, { headers: H });
console.log('runs status:', runsRes.status);
const runs = await runsRes.json();
if (!runs.workflow_runs?.length) { console.log('msg:', runs.message); process.exit(0); }
for (const r of runs.workflow_runs) {
  const dur = Math.round((new Date(r.updated_at) - new Date(r.created_at)) / 1000);
  console.log(`${r.id} | ${r.name.padEnd(28)} | ${r.status.padEnd(12)} | ${String(r.conclusion).padEnd(12)} | ${r.head_branch.padEnd(12)} | ${dur}s`);
}
