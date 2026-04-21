import https from 'https';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('/alloc/config.json', 'utf8'));
const ghToken = config.GH_TOKEN?.VALUE || config.GH_TOKEN;
const content = fs.readFileSync('vite.config.ts', 'utf8');
const encoded = Buffer.from(content).toString('base64');

const getOpts = {
  hostname: 'api.github.com',
  path: '/repos/trevorrossworn-code/homestream/contents/vite.config.ts',
  headers: {
    'Authorization': 'token ' + ghToken,
    'User-Agent': 'homestream-builder',
    'Accept': 'application/vnd.github.v3+json'
  }
};

https.get(getOpts, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    const json = JSON.parse(data);
    const sha = json.sha;
    console.log('Got SHA:', sha);
    const body = JSON.stringify({
      message: 'Fix vite.config.ts - clean version no conflict markers',
      content: encoded,
      sha
    });
    const putOpts = {
      hostname: 'api.github.com',
      path: '/repos/trevorrossworn-code/homestream/contents/vite.config.ts',
      method: 'PUT',
      headers: {
        'Authorization': 'token ' + ghToken,
        'User-Agent': 'homestream-builder',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(putOpts, res2 => {
      let d2 = '';
      res2.on('data', d => d2 += d);
      res2.on('end', () => {
        const r = JSON.parse(d2);
        if (r.content) console.log('SUCCESS! vite.config.ts pushed to GitHub.');
        else console.log('ERROR:', JSON.stringify(r));
      });
    });
    req.write(body);
    req.end();
  });
});
