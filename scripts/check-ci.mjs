import https from 'https';
import { execSync } from 'child_process';

const token = execSync(
  `npx tsx -e "import { getSecret } from '#airo/secrets'; process.stdout.write(getSecret('GH_TOKEN') ?? '');"`,
  { cwd: '/app' }
).toString().trim();

function get(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'homestream-ci', Accept: 'application/vnd.github.v3+json' },
    };
    https.get(options, res => {
      if (res.statusCode === 302) {
        https.get(res.headers.location, res2 => {
          let d = ''; res2.on('data', c => (d += c)); res2.on('end', () => resolve(d));
        }).on('error', reject);
        return;
      }
      let d = ''; res.on('data', c => (d += c)); res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

const runId = '24811681575';
const jobs = JSON.parse(await get(`/repos/trevorrossworn-code/homestream/actions/runs/${runId}/jobs`));
const job = jobs.jobs[0];
console.log('Job:', job.name, '| ID:', job.id);

const logs = await get(`/repos/trevorrossworn-code/homestream/actions/jobs/${job.id}/logs`);
const lines = logs.split('\n');
lines.slice(-120).forEach(l => console.log(l));
