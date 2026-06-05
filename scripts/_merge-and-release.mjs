/**
 * Merge the v2.0.2 branch into main and cut a v2.0.2 release tag.
 * Run: node scripts/_merge-and-release.mjs
 */
import { getSecret } from '#airo/secrets';

const token = getSecret('GH_TOKEN');
const h = {
  'Authorization': `token ${token}`,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
};
const repo = 'HomeStream-co/homestream';
const BASE = `https://api.github.com/repos/${repo}`;

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: h, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${JSON.stringify(data)}`);
  return data;
}

// 1. Create PR
console.log('Creating PR...');
const pr = await api('/pulls', {
  method: 'POST',
  body: JSON.stringify({
    title: 'v2.0.2 — Setup wizard redesign + CI fixes',
    head: '20260605015055-9h9yrecco0',
    base: 'main',
    body: [
      '## v2.0.2',
      '',
      '**Setup wizard** — 5-step redesign, animated progress bar, direction-aware slides.',
      '**SetupGuard fix** — was calling `/api/setup` (401 post-setup) → infinite redirect loop. Now uses `/api/health` (always open).',
      '**apiPost hardening** — `credentials: include` + silent 401 handling across all wizard fetches.',
      '**Windows CI** — pin to `windows-2022`; `windows-latest` → Server 2025 crashes NSIS with 0xC0000005.',
    ].join('\n'),
  }),
});
console.log(`PR #${pr.number}: ${pr.html_url}`);

// 2. Merge PR (squash would lose history; use merge commit)
console.log('Merging PR...');
const merge = await api(`/pulls/${pr.number}/merge`, {
  method: 'PUT',
  body: JSON.stringify({
    commit_title: 'v2.0.2 — Setup wizard redesign + CI fixes (#' + pr.number + ')',
    merge_method: 'merge',
  }),
});
console.log('Merged SHA:', merge.sha);

// 3. Create annotated tag on the merge commit
console.log('Creating tag object...');
const tagObj = await api('/git/tags', {
  method: 'POST',
  body: JSON.stringify({
    tag: 'v2.0.2',
    message: 'v2.0.2 — Setup wizard redesign + CI fixes\n\n- 5-step setup wizard with animated progress bar and slide transitions\n- SetupGuard: use /api/health (not /api/setup) to avoid infinite redirect loop\n- apiPost: credentials:include + silent 401 handling throughout wizard\n- Windows CI: pin to windows-2022 (NSIS crashes on Server 2025)\n- StepFinish: config summary, QR code, qBit health, UpdateBanner',
    object: merge.sha,
    type: 'commit',
    tagger: { name: 'HomeStream CI', email: 'ci@homestream.app', date: new Date().toISOString() },
  }),
});
console.log('Tag object SHA:', tagObj.sha);

// 4. Create the ref
console.log('Creating tag ref...');
await api('/git/refs', {
  method: 'POST',
  body: JSON.stringify({ ref: 'refs/tags/v2.0.2', sha: tagObj.sha }),
});
console.log('Tag v2.0.2 created ✓');

// 5. Create GitHub Release (draft=false, prerelease=false)
console.log('Creating GitHub Release...');
const release = await api('/releases', {
  method: 'POST',
  body: JSON.stringify({
    tag_name: 'v2.0.2',
    name: 'v2.0.2 — Setup Wizard Redesign',
    draft: false,
    prerelease: false,
    body: [
      '## What\'s New in v2.0.2',
      '',
      '### Setup Wizard',
      '- Full 5-step redesign with animated progress bar and direction-aware slide transitions',
      '- Steps: System Requirements → Media Folder → API Keys → Optional Features → Finish',
      '- StepFinish: config summary table, existing media scan/import toggle, phone remote QR code, live qBit health check',
      '- UpdateBanner embedded in StepFinish for immediate update awareness',
      '',
      '### Bug Fixes',
      '- **Critical:** Fixed infinite redirect loop after setup completion — `SetupGuard` now calls `GET /api/health` (always unauthenticated) instead of `GET /api/setup` (returns 401 post-setup)',
      '- `apiPost` now includes `credentials: include` and handles 401 silently across all wizard steps',
      '- StepOptional `saveAndContinue` uses `apiPost` for consistent error handling',
      '- StepApiKeys test-keys fetch includes credentials',
      '- StepFinish QR fetch includes credentials with graceful 401 fallback',
      '',
      '### Infrastructure',
      '- Windows CI and release builds pinned to `windows-2022` — `windows-latest` now maps to Server 2025 where NSIS installers crash with `0xC0000005`',
      '',
      '### Upgrade Notes',
      '- v2.0.2+ supports auto-updates. Users on v1.7.0–v2.0.1 must reinstall manually.',
      '- Windows uninstaller prompts to wipe or preserve `%APPDATA%\\HomeStream`',
    ].join('\n'),
  }),
});
console.log('Release:', release.html_url);
console.log('Done ✓');
