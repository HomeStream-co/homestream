import { getSecret } from '#airo/secrets';
const token = getSecret('GH_TOKEN');
const REPO = 'trevorrossworn-code/homestream';
const owner = REPO.split('/')[0];
const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' };

// Check user account type
const userRes = await fetch(`https://api.github.com/users/${owner}`, { headers });
const user = await userRes.json();
console.log('account type:', user.type, '| plan:', user.plan?.name ?? 'unknown');

// Compare run durations: success vs failures
const runs = [
  { id: '24914668581', label: 'v1.6.3 Release (SUCCESS)' },
  { id: '24915961709', label: 'v1.6.4 Release (FAILURE)' },
  { id: '24919263907', label: 'CI push (FAILURE)' },
  { id: '24920726864', label: 'v1.6.6 Release (FAILURE)' },
];
for (const { id, label } of runs) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/runs/${id}`, { headers });
  const d = await r.json();
  const dur = (new Date(d.updated_at) - new Date(d.created_at)) / 1000;
  console.log(`${label}: ${d.conclusion} | ${dur}s | event:${d.event} | branch:${d.head_branch}`);
}

// Check token scopes
const meRes = await fetch('https://api.github.com/user', { headers });
console.log('\nToken scopes:', meRes.headers.get('x-oauth-scopes'));
console.log('Rate limit remaining:', meRes.headers.get('x-ratelimit-remaining'));
