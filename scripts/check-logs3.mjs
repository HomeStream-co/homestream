import https from 'https';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('/alloc/config.json', 'utf8'));
const token = config.GH_TOKEN?.VALUE || config.GH_TOKEN;

function apiReq(path) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com', path,
      headers: { 'Authorization': 'token ' + token, 'User-Agent': 'hs', 'Accept': 'application/vnd.github.v3+json' }
    }, res => {
      let d = '';
      res.on('data', x => d += x);
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body: d }));
    });
    req.end();
  });
}

function fetchUrl(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'hs' } }, res => {
      const chunks = [];
      res.on('data', x => chunks.push(x));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
  });
}

async function main() {
  const r = await apiReq('/repos/trevorrossworn-code/homestream/actions/jobs/72259506594/logs');
  if (r.location) {
    const logs = await fetchUrl(r.location);
    const lines = logs.split('\n');
    // Print last 120 lines (where the failure is)
    const tail = lines.slice(-120);
    tail.forEach(l => console.log(l));
  }
}
main().catch(console.error);
