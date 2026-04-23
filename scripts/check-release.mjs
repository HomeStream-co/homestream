import { createRequire } from 'module';
import https from 'https';
const require = createRequire(import.meta.url);
const { getSecret } = require('#airo/secrets');
const token = getSecret('GH_TOKEN');
const REPO = 'trevorrossworn-code/homestream';

function get(path) {
  return new Promise(resolve => {
    https.get({
      hostname: 'api.github.com', path,
      headers: { 'Authorization': 'token ' + token, 'User-Agent': 'homestream-builder' }
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    });
  });
}

// Latest runs
const runs = await get(`/repos/${REPO}/actions/runs?per_page=6`);
const releaseRuns = runs.workflow_runs.filter(r => r.name === 'Release');
console.log('=== Recent Release runs ===');
releaseRuns.forEach(r => console.log(` ${r.status} | ${r.conclusion ?? 'running'} | sha:${r.head_sha.slice(0,7)} | ${r.created_at} | id:${r.id}`));

// Latest release run
const latest = releaseRuns[0];
if (latest) {
  const artifacts = await get(`/repos/${REPO}/actions/runs/${latest.id}/artifacts`);
  console.log(`\nArtifacts on run ${latest.id}:`, artifacts.total_count);
  artifacts.artifacts?.forEach(a => console.log(` - ${a.name} ${Math.round(a.size_in_bytes/1024/1024)}MB expired:${a.expired}`));
}

// Release assets
const rel = await get(`/repos/${REPO}/releases/tags/v1.5.1`);
console.log('\n=== v1.5.1 Release ===');
console.log('id:', rel.id, '| draft:', rel.draft, '| assets:', rel.assets?.length ?? 0);
rel.assets?.forEach(a => console.log(` - ${a.name} ${Math.round(a.size/1024/1024)}MB`));
