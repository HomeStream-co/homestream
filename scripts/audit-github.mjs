import https from 'https';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('/alloc/config.json', 'utf8'));
const ghToken = config.GH_TOKEN?.VALUE || config.GH_TOKEN;

function ghGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      headers: {
        'Authorization': 'token ' + ghToken,
        'User-Agent': 'homestream-builder',
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    https.get(opts, res => {
      let d = '';
      res.on('data', x => d += x);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function getFileContent(filePath) {
  const data = await ghGet(`/repos/trevorrossworn-code/homestream/contents/${filePath}`);
  if (data.content) {
    return Buffer.from(data.content, 'base64').toString('utf8');
  }
  return null;
}

async function main() {
  // Get latest workflow run
  const runs = await ghGet('/repos/trevorrossworn-code/homestream/actions/runs?per_page=3');
  for (const run of runs.workflow_runs) {
    console.log('Run:', run.name, '| Conclusion:', run.conclusion, '| ID:', run.id);
  }

  const run = runs.workflow_runs[0];
  console.log('\n--- Latest Run Jobs ---');
  const jobs = await ghGet(`/repos/trevorrossworn-code/homestream/actions/runs/${run.id}/jobs`);
  for (const job of jobs.jobs) {
    console.log('Job:', job.name, '| Conclusion:', job.conclusion);
    for (const step of job.steps) {
      const icon = step.conclusion === 'failure' ? 'FAIL' : step.conclusion === 'success' ? 'OK' : step.conclusion;
      console.log(`  [${icon}] ${step.name}`);
    }
  }

  // Check key files on GitHub
  console.log('\n--- Checking key files on GitHub ---');

  const viteConfig = await getFileContent('vite.config.ts');
  if (viteConfig) {
    const hasConflict = viteConfig.includes('>>>>>>>');
    const hasAiroExternal = viteConfig.includes('#airo/secrets');
    const hasWebtorrentExternal = viteConfig.includes('webtorrent');
    const hasAppJsCheck = viteConfig.includes('existsSync');
    console.log('vite.config.ts:');
    console.log('  Has conflict marker:', hasConflict);
    console.log('  Has #airo/secrets external:', hasAiroExternal);
    console.log('  Has webtorrent external:', hasWebtorrentExternal);
    console.log('  Has app.js existence check:', hasAppJsCheck);
    console.log('  Last 200 chars:', JSON.stringify(viteConfig.slice(-200)));
  }

  const workflow = await getFileContent('.github/workflows/release.yml');
  if (workflow) {
    const hasConflict = workflow.includes('>>>>>>>');
    const nodeVersion = workflow.match(/node-version: ['"](\d+)['"]/)?.[1];
    console.log('\nrelease.yml:');
    console.log('  Has conflict marker:', hasConflict);
    console.log('  Node version:', nodeVersion);
    console.log('  Line count:', workflow.split('\n').length);
  }

  // Get logs from failed job
  console.log('\n--- Failed Job Logs ---');
  for (const job of jobs.jobs) {
    if (job.conclusion === 'failure') {
      const logsRes = await new Promise((resolve) => {
        const opts = {
          hostname: 'api.github.com',
          path: `/repos/trevorrossworn-code/homestream/actions/jobs/${job.id}/logs`,
          headers: {
            'Authorization': 'token ' + ghToken,
            'User-Agent': 'homestream-builder',
            'Accept': 'application/vnd.github.v3+json'
          }
        };
        https.get(opts, res => {
          let d = '';
          res.on('data', x => d += x);
          res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body: d }));
        });
      });
      console.log('Log redirect URL:', logsRes.location);
    }
  }
}

main().catch(console.error);
