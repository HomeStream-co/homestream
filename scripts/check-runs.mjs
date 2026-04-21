import https from 'https';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('/alloc/config.json', 'utf8'));
const token = config.GH_TOKEN?.VALUE || config.GH_TOKEN;

function get(path) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com', path,
      headers: { 'Authorization': 'token ' + token, 'User-Agent': 'hs', 'Accept': 'application/vnd.github.v3+json' }
    }, res => { let d=''; res.on('data',x=>d+=x); res.on('end',()=>resolve(JSON.parse(d))); });
    req.end();
  });
}

async function main() {
  const runs = await get('/repos/trevorrossworn-code/homestream/actions/runs?per_page=5');
  for (const run of (runs.workflow_runs||[]).slice(0,5)) {
    console.log('\nRUN:', run.name, '|', run.status, '|', run.conclusion, '|', run.created_at);
    const jobs = await get('/repos/trevorrossworn-code/homestream/actions/runs/' + run.id + '/jobs');
    for (const job of (jobs.jobs||[])) {
      console.log('  JOB:', job.name, '|', job.conclusion);
      for (const step of (job.steps||[])) {
        const icon = step.conclusion === 'failure' ? '❌' : step.conclusion === 'success' ? '✅' : '⏭';
        console.log('   ', icon, step.name);
      }
    }
  }
}
main().catch(console.error);
