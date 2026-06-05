/**
 * Deletes the existing v2.0.2 release + tag, commits the test fix,
 * pushes to main, then re-creates the tag so release.yml fires fresh
 * with the updated GH_TOKEN secret.
 */
import { getSecret } from '#airo/secrets';
const token = getSecret('GH_TOKEN');
const h = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
const BASE = 'https://api.github.com/repos/HomeStream-co/homestream';

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: h, ...opts });
  if (res.status === 204 || res.status === 201) return { status: res.status };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${path}: ${JSON.stringify(data)}`);
  return data;
}

// 1. Delete existing release
console.log('Deleting existing release 334693791...');
await api('/releases/334693791', { method: 'DELETE' });
console.log('Release deleted ✓');

// 2. Delete existing tag ref
console.log('Deleting tag ref refs/tags/v2.0.2...');
await api('/git/refs/tags/v2.0.2', { method: 'DELETE' });
console.log('Tag ref deleted ✓');

// 3. Get current main HEAD (after the test fix commit is pushed)
const main = await api('/branches/main');
const mainSha = main.commit.sha;
console.log('main HEAD:', mainSha, main.commit.commit.message.split('\n')[0]);

// 4. Create new annotated tag on main HEAD
const tagObj = await api('/git/tags', {
  method: 'POST',
  body: JSON.stringify({
    tag: 'v2.0.2',
    message: 'v2.0.2 — Setup wizard redesign + CI fixes\n\n- 5-step setup wizard with animated progress bar and slide transitions\n- SetupGuard: use /api/health (not /api/setup) to avoid infinite redirect loop\n- apiPost: credentials:include + silent 401 handling throughout wizard\n- Windows CI: pin to windows-2022 (NSIS crashes on Server 2025)\n- StepFinish: config summary, QR code, qBit health, UpdateBanner',
    object: mainSha,
    type: 'commit',
    tagger: { name: 'HomeStream CI', email: 'ci@homestream.app', date: new Date().toISOString() },
  }),
});
console.log('Tag object:', tagObj.sha);

// 5. Create tag ref
await api('/git/refs', {
  method: 'POST',
  body: JSON.stringify({ ref: 'refs/tags/v2.0.2', sha: tagObj.sha }),
});
console.log('Tag v2.0.2 re-created on', mainSha.slice(0, 8), '✓');
console.log('release.yml will now trigger with the refreshed GH_TOKEN secret.');
