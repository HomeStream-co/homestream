#!/usr/bin/env node
// Publishes a draft GitHub release and marks it as latest.
// Usage: node scripts/publish-release.mjs <release-id>

const TOKEN = process.env.GH_TOKEN || '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';
const REPO  = 'trevorrossworn-code/homestream';
const ID    = process.argv[2] || '313059649'; // v1.6.0

const body = [
  '## v1.6.0',
  '',
  '### New Features',
  '- **Beta Channel** — opt in to pre-release updates from Settings → Tools',
  '- **In-App Feedback** — submit bug reports and feature requests directly from the app',
  '',
  '### TV & Casting',
  '- Fixed LAN URL resolution for DLNA/UPnP casting',
  '- HLS stream (.m3u8) now sent to DLNA renderers when transcoding is active',
  '- New TV 10-foot UI (/tv) — D-pad navigable, big poster cards, hero banner, tab bar, search',
  '',
  '### Bug Fixes',
  '- Fixed ENOENT crash on /tv and /samsung-tv routes in web/cloud mode',
  '- Various audit and cleanup improvements',
].join('\n');

const res = await fetch(`https://api.github.com/repos/${REPO}/releases/${ID}`, {
  method: 'PATCH',
  headers: {
    Authorization: `token ${TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    draft: false,
    prerelease: false,
    make_latest: 'true',
    name: 'v1.6.0',
    body,
  }),
});

const data = await res.json();
if (data.html_url) {
  console.log('✅ Published!');
  console.log('   tag:    ', data.tag_name);
  console.log('   draft:  ', data.draft);
  console.log('   latest: ', data.make_latest ?? '(check GitHub)');
  console.log('   url:    ', data.html_url);
} else {
  console.error('❌ Failed:', JSON.stringify(data, null, 2));
}
