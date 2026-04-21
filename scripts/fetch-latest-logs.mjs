import https from 'https';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('/alloc/config.json', 'utf8'));
const ghToken = config.GH_TOKEN?.VALUE || config.GH_TOKEN;

function apiCall(path) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      headers: { 'Authorization': 'token ' + ghToken, 'User-Agent': 'homestream-builder', 'Accept': 'application/vnd.github.v3+json' }
    };
    https.get(opts, res => {
      let d = '';
      res.on('data', x => d += x);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
    });
  });
}

function fetchUrl(url) {
  return new Promise((resolve) => {
    https.get(url, res => {
      let d = '';
      res.on('data', x => d += x);
      res.on('end', () => resolve(d));
    }).on('error', () => resolve(''));
  });
}

async function main() {
  const runs = await apiCall('/repos/trevorrossworn-code/homestream/actions/runs?per_page=1');
  const run = JSON.parse(runs.body).workflow_runs[0];
  const jobs = await apiCall(`/repos/trevorrossworn-code/homestream/actions/runs/${run.id}/jobs`);
  const job = JSON.parse(jobs.body).jobs[0];

  const logRes = await apiCall(`/repos/trevorrossworn-code/homestream/actions/jobs/${job.id}/logs`);
  const logUrl = logRes.headers.location;

  const logs = await fetchUrl(logUrl);
  const lines = logs.split('\n');

  // Find ValidationError and surrounding context
  const idx = lines.findIndex(l => l.includes('ValidationError') || l.includes('Invalid configuration') || l.includes('does not match'));
  if (idx >= 0) {
    console.log('=== VALIDATION ERROR CONTEXT ===');
    lines.slice(Math.max(0, idx - 2), idx + 30).forEach(l =>
      console.log(l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z /, ''))
    );
  } else {
    // Print all error lines
    lines.filter(l => l.includes('error') || l.includes('Error') || l.includes('fail'))
      .slice(0, 30)
      .forEach(l => console.log(l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z /, '')));
  }
}

main().catch(console.error);
