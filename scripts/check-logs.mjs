import https from 'https';
import fs from 'fs';
import zlib from 'zlib';
const config = JSON.parse(fs.readFileSync('/alloc/config.json', 'utf8'));
const token = config.GH_TOKEN?.VALUE || config.GH_TOKEN;

function get(path, raw=false) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com', path,
      headers: { 'Authorization': 'token ' + token, 'User-Agent': 'hs', 'Accept': raw ? 'application/vnd.github.v3.raw' : 'application/vnd.github.v3+json' }
    }, res => {
      const chunks = [];
      res.on('data', x => chunks.push(x));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (raw) resolve({ status: res.statusCode, location: res.headers.location, body: buf.toString() });
        else resolve(JSON.parse(buf.toString()));
      });
    });
    req.end();
  });
}

function getUrl(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search,
      headers: { 'User-Agent': 'hs', 'Accept-Encoding': 'gzip' }
    }, res => {
      const chunks = [];
      res.on('data', x => chunks.push(x));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const enc = res.headers['content-encoding'];
        if (enc === 'gzip') {
          zlib.gunzip(buf, (e, d) => resolve(d ? d.toString() : buf.toString()));
        } else resolve(buf.toString());
      });
    });
    req.end();
  });
}

async function main() {
  const runs = await get('/repos/trevorrossworn-code/homestream/actions/runs?per_page=1');
  const runId = runs.workflow_runs[0].id;
  console.log('Latest run ID:', runId);

  const jobs = await get('/repos/trevorrossworn-code/homestream/actions/runs/' + runId + '/jobs');
  const job = jobs.jobs[0];
  console.log('Job ID:', job.id);

  // Get logs URL (redirects)
  const logsResp = await get('/repos/trevorrossworn-code/homestream/actions/jobs/' + job.id + '/logs', true);
  if (logsResp.location) {
    const logs = await getUrl(logsResp.location);
    // Find Package installer section
    const lines = logs.split('\n');
    let inSection = false;
    let count = 0;
    for (const line of lines) {
      if (line.includes('Package installer')) inSection = true;
      if (inSection) {
        console.log(line);
        count++;
        if (count > 80) break;
      }
    }
  } else {
    console.log('No redirect, status:', logsResp.status, logsResp.body.slice(0, 500));
  }
}
main().catch(console.error);
