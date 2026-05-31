import https from 'https';

const token = process.env.GH_TOKEN;

function ghGet(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.github.com',
      path,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'HomeStream-Check'
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

const runs = await ghGet('/repos/HomeStream-co/homestream/actions/runs?per_page=10');
console.log('=== WORKFLOW RUNS ===');
if (!runs.workflow_runs?.length) {
  console.log('No runs found. msg:', runs.message);
} else {
  for (const r of runs.workflow_runs) {
    const icon = r.conclusion === 'success' ? '✅' : r.conclusion === 'failure' ? '❌' : r.status === 'in_progress' ? '🔄' : '⏳';
    console.log(icon, r.id, '|', r.name, '|', r.status, '|', r.conclusion || 'pending', '|', r.head_sha.slice(0,7), '|', r.created_at);
  }
}

const releases = await ghGet('/repos/HomeStream-co/homestream/releases?per_page=3');
console.log('\n=== RELEASES ===');
if (!Array.isArray(releases)) {
  console.log('Error:', releases.message);
} else {
  for (const r of releases) {
    console.log(r.tag_name, '| draft:', r.draft, '| assets:', r.assets?.length || 0, '| created:', r.created_at);
    for (const a of (r.assets || [])) {
      console.log('   -', a.name, Math.round(a.size/1024/1024) + 'MB');
    }
  }
}
