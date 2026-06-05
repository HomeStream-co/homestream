import { getSecret } from '#airo/secrets';
const token = getSecret('GH_TOKEN');
const h = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
const BASE = 'https://api.github.com/repos/HomeStream-co/homestream';
const MERGE_SHA = '05249a76dc64d1de608df4e4053c9530f6492bcc';

// Check if release already exists
const check = await fetch(`${BASE}/releases/tags/v2.0.2`, { headers: h });
if (check.ok) {
  const r = await check.json();
  console.log('Release already exists:', r.html_url);
  process.exit(0);
}

// Update tag to point to merge commit
const patch = await fetch(`${BASE}/git/refs/tags/v2.0.2`, {
  method: 'PATCH', headers: h,
  body: JSON.stringify({ sha: MERGE_SHA, force: true }),
});
const pt = await patch.json();
console.log('Tag updated to merge commit:', pt.object?.sha);

// Create the release
const body = [
  '## v2.0.2 — Setup Wizard Redesign',
  '',
  '### New',
  '- 5-step setup wizard with animated progress bar and direction-aware slide transitions',
  '- Steps: System Requirements → Media Folder → API Keys → Optional Features → Finish',
  '- StepFinish: config summary table, media scan toggle, phone remote QR, qBit health check, UpdateBanner',
  '',
  '### Bug Fixes',
  '- **Critical:** Fixed infinite redirect loop after setup — `SetupGuard` now uses `GET /api/health` (always open) instead of `GET /api/setup` (returns 401 post-setup)',
  '- `apiPost` hardened with `credentials: include` + silent 401 handling across all wizard steps',
  '- StepOptional, StepApiKeys, StepFinish fetch calls all include credentials',
  '',
  '### Infrastructure',
  '- Windows CI and release builds pinned to `windows-2022` — `windows-latest` maps to Server 2025 where NSIS crashes with `0xC0000005`',
  '',
  '> **Upgrade note:** v2.0.2+ supports auto-updates. Users on v1.7.0–v2.0.1 must reinstall manually.',
].join('\n');

const rel = await fetch(`${BASE}/releases`, {
  method: 'POST', headers: h,
  body: JSON.stringify({ tag_name: 'v2.0.2', name: 'v2.0.2 — Setup Wizard Redesign', draft: false, prerelease: false, body }),
});
const rd = await rel.json();
if (!rel.ok) { console.error('Failed:', rd); process.exit(1); }
console.log('Release created:', rd.html_url);
