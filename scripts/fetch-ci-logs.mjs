import { getSecret } from '#airo/secrets';
import { createWriteStream, mkdirSync } from 'fs';
import { execSync } from 'child_process';

const token = getSecret('GH_TOKEN');
const REPO = 'trevorrossworn-code/homestream';
const RUN_ID = '24920726864';
const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' };

// Step 1: get redirect URL for logs zip
const res = await fetch(`https://api.github.com/repos/${REPO}/actions/runs/${RUN_ID}/logs`, { headers, redirect: 'manual' });
console.log('redirect status:', res.status);
const loc = res.headers.get('location');
if (!loc) { console.log('No redirect. Body:', await res.text()); process.exit(1); }

// Step 2: download zip
const zipRes = await fetch(loc);
console.log('zip status:', zipRes.status);
const buf = Buffer.from(await zipRes.arrayBuffer());

// Step 3: write zip to /tmp and unzip
import { writeFileSync } from 'fs';
writeFileSync('/tmp/ci-logs.zip', buf);
mkdirSync('/tmp/ci-logs', { recursive: true });
try {
  execSync('unzip -o /tmp/ci-logs.zip -d /tmp/ci-logs', { stdio: 'pipe' });
} catch(e) { console.log('unzip stderr:', e.stderr?.toString()); }

// Step 4: read all .txt log files
const { readdirSync, readFileSync } = await import('fs');
const files = readdirSync('/tmp/ci-logs').sort();
console.log('Log files:', files);
for (const f of files) {
  if (!f.endsWith('.txt')) continue;
  const content = readFileSync(`/tmp/ci-logs/${f}`, 'utf8');
  const lines = content.split('\n');
  console.log(`\n=== ${f} (${lines.length} lines) ===`);
  // Print last 100 lines of each file
  console.log(lines.slice(-100).join('\n'));
}
