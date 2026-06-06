#!/usr/bin/env node
// Publishes a draft GitHub release and marks it as latest.
//
// Usage:
//   node scripts/publish-release.mjs <release-id> [release-notes]
//
// Arguments:
//   release-id     — numeric GitHub release ID (required)
//   release-notes  — optional markdown body; defaults to a generic changelog
//                    entry using the version from package.json
//
// Environment:
//   GH_TOKEN       — GitHub PAT with repo scope (required)
//
// Example:
//   GH_TOKEN=ghp_xxx node scripts/publish-release.mjs 123456789

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));
const VERSION = `v${pkg.version}`;

const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) { console.error('GH_TOKEN env var is required'); process.exit(1); }

const REPO = 'HomeStream-co/homestream';
const ID   = process.argv[2];
if (!ID) { console.error('Usage: node scripts/publish-release.mjs <release-id>'); process.exit(1); }

// Default release notes — edit inline or pass a second arg for custom notes.
const customNotes = process.argv[3];
const body = customNotes ?? [
  `## ${VERSION}`,
  '',
  '### Changes',
  '- See commit history for full details.',
].join('\n');

console.log(`Publishing release id=${ID} as ${VERSION} on ${REPO}...`);

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
    name: VERSION,
    body,
  }),
});

const data = await res.json();
if (data.html_url) {
  console.log('Published!');
  console.log('   tag:    ', data.tag_name);
  console.log('   draft:  ', data.draft);
  console.log('   latest: ', data.make_latest ?? '(check GitHub)');
  console.log('   url:    ', data.html_url);
} else {
  console.error('Failed:', JSON.stringify(data, null, 2));
  process.exit(1);
}
