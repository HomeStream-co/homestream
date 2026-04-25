import { execSync } from 'child_process';
const newToken = execSync('git remote get-url new-origin').toString().trim().replace('https://','').split('@')[0];
const oldToken = execSync('git remote get-url origin').toString().trim().replace('https://','').split('@')[0];

const newH = { Authorization: `token ${newToken}`, Accept: 'application/vnd.github+json' };
const oldH = { Authorization: `token ${oldToken}`, Accept: 'application/vnd.github+json' };

const NEW_REPO = 'HomeStream-co/homestream';
const OLD_REPO = 'trevorrossworn-code/homestream';

// Compare latest commit SHA on main
const newMain = await (await fetch(`https://api.github.com/repos/${NEW_REPO}/commits/main`, { headers: newH })).json();
const oldMain = await (await fetch(`https://api.github.com/repos/${OLD_REPO}/commits/main`, { headers: oldH })).json();

console.log('=== Latest main commit ===');
console.log(`  HomeStream-co:      ${newMain.sha?.slice(0,10)} | ${newMain.commit?.message?.split('\n')[0]}`);
console.log(`  trevorrossworn-code: ${oldMain.sha?.slice(0,10)} | ${oldMain.commit?.message?.split('\n')[0]}`);

// Compare tags
const newTags = await (await fetch(`https://api.github.com/repos/${NEW_REPO}/tags?per_page=20`, { headers: newH })).json();
const oldTags = await (await fetch(`https://api.github.com/repos/${OLD_REPO}/tags?per_page=20`, { headers: oldH })).json();
console.log('\n=== Tags ===');
console.log(`  HomeStream-co:       ${newTags.map(t=>t.name).join(', ')}`);
console.log(`  trevorrossworn-code: ${oldTags.map(t=>t.name).join(', ')}`);

// Compare releases
const newRel = await (await fetch(`https://api.github.com/repos/${NEW_REPO}/releases?per_page=10`, { headers: newH })).json();
const oldRel = await (await fetch(`https://api.github.com/repos/${OLD_REPO}/releases?per_page=10`, { headers: oldH })).json();
console.log('\n=== Releases ===');
console.log('  HomeStream-co:');
for (const r of newRel) console.log(`    ${r.tag_name} | assets: ${r.assets?.map(a=>a.name).join(', ') || '(none)'}`);
console.log('  trevorrossworn-code:');
for (const r of oldRel) console.log(`    ${r.tag_name} | assets: ${r.assets?.map(a=>a.name).join(', ') || '(none)'}`);

// Key file contents on new-origin HEAD vs local HEAD
console.log('\n=== Key v1.6.6 files on HomeStream-co (via local HEAD which matches new-origin/main) ===');
const keyFiles = [
  'src/pages/tv.tsx',
  'src/pages/player.tsx', 
  'src/components/DebugPanel.tsx',
  'src/pages/discover.tsx',
  'src/server/api/captions/[id]/[lang]/GET.ts',
  'src/server/api/stream/[filename]/GET.ts',
  'src/hooks/useHlsSetup.ts',
];
for (const f of keyFiles) {
  try {
    const out = execSync(`git show HEAD:${f} 2>/dev/null | wc -l`).toString().trim();
    const sha = execSync(`git show HEAD:${f} 2>/dev/null | md5sum | cut -c1-8`).toString().trim();
    console.log(`  ${f}: ${out} lines [${sha}]`);
  } catch { console.log(`  ${f}: NOT FOUND`); }
}
