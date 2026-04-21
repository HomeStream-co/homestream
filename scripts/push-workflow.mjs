import https from 'https';
import fs from 'fs';

const token = process.env.GH_TOKEN;
const content = fs.readFileSync('.github/workflows/release.yml', 'utf8');
const encoded = Buffer.from(content).toString('base64');

const getOptions = {
  hostname: 'api.github.com',
  path: '/repos/trevorrossworn-code/homestream/contents/.github/workflows/release.yml',
  headers: { 'Authorization': 'token ' + token, 'User-Agent': 'homestream-builder', 'Accept': 'application/vnd.github.v3+json' }
};

https.get(getOptions, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    const json = JSON.parse(data);
    const sha = json.sha;
    console.log('Got SHA:', sha);
    const body = JSON.stringify({ message: 'Fix release workflow yaml', content: encoded, sha });
    const putOptions = {
      hostname: 'api.github.com',
      path: '/repos/trevorrossworn-code/homestream/contents/.github/workflows/release.yml',
      method: 'PUT',
      headers: { 'Authorization': 'token ' + token, 'User-Agent': 'homestream-builder', 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(putOptions, res2 => {
      let data2 = '';
      res2.on('data', d => data2 += d);
      res2.on('end', () => {
        const result = JSON.parse(data2);
        if (result.content) { console.log('SUCCESS! File pushed to GitHub.'); }
        else { console.log('ERROR:', JSON.stringify(result)); }
      });
    });
    req.write(body);
    req.end();
  });
});
