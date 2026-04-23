/**
 * Downloads the HomeStream-Windows-Installer artifact and uploads its
 * contents to the v1.5.1 GitHub Release.
 */
import { createRequire } from 'module';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const require = createRequire(import.meta.url);
const { getSecret } = require('#airo/secrets');
const TOKEN = getSecret('GH_TOKEN');
const REPO  = 'trevorrossworn-code/homestream';
const TAG   = 'v1.5.1';
const ARTIFACT_ID = '6610826986'; // run 24855594808 — v1.5.1 with correct package.json version
const TMP = '/tmp/hs-release';

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function ghGet(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.github.com', path,
      headers: { Authorization: `token ${TOKEN}`, 'User-Agent': 'homestream-builder', Accept: 'application/vnd.github+json' }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    }).on('error', reject);
  });
}

function ghDel(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com', path, method: 'DELETE',
      headers: { Authorization: `token ${TOKEN}`, 'User-Agent': 'homestream-builder' }
    }, res => { res.resume(); res.on('end', resolve); });
    req.on('error', reject);
    req.end();
  });
}

function ghPost(path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname: 'api.github.com', path, method: 'POST',
      headers: { Authorization: `token ${TOKEN}`, 'User-Agent': 'homestream-builder', 'Content-Type': 'application/json', 'Content-Length': buf.length }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch{resolve(d)} }); });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// Download a URL, following redirects. Drops Authorization on redirect to non-github hosts.
function download(url, destFile) {
  return new Promise((resolve, reject) => {
    function doGet(u, withAuth) {
      const opts = {
        headers: {
          'User-Agent': 'homestream-builder',
          Accept: 'application/vnd.github+json',
          ...(withAuth ? { Authorization: `token ${TOKEN}` } : {}),
        }
      };
      https.get(u, opts, res => {
        const loc = res.headers.location;
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && loc) {
          res.resume();
          // Drop auth when redirecting away from api.github.com (e.g. Azure Blob)
          const isGitHub = loc.includes('api.github.com') || loc.includes('github.com');
          doGet(loc, isGitHub);
          return;
        }
        console.log(`  HTTP ${res.statusCode} content-length:${res.headers['content-length'] ?? 'unknown'}`);
        const out = fs.createWriteStream(destFile);
        res.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
      }).on('error', reject);
    }
    doGet(url, true);
  });
}

// Upload a file buffer to a GitHub Release
function uploadAsset(uploadUrl, fname, buf) {
  const u = new URL(uploadUrl.replace('{?name,label}', ''));
  u.searchParams.set('name', fname);
  const mime = fname.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream';
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        Authorization: `token ${TOKEN}`,
        'User-Agent': 'homestream-builder',
        'Content-Type': mime,
        'Content-Length': buf.length,
      }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch{resolve(d)} }); });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

// 1. Ensure release exists (clean)
console.log('Checking release…');
let rel = await ghGet(`/repos/${REPO}/releases/tags/${TAG}`);
if (rel.id) {
  console.log('Release exists id:', rel.id, '| assets:', rel.assets?.length);
  for (const a of rel.assets ?? []) {
    console.log('  Deleting stale asset:', a.name);
    await ghDel(`/repos/${REPO}/releases/assets/${a.id}`);
  }
} else {
  console.log('Creating release…');
  rel = await ghPost(`/repos/${REPO}/releases`, {
    tag_name: TAG, name: TAG.replace('v', ''),
    body: 'HomeStream v1.5.1\n\n- 10 color themes with redesigned circle swatch picker\n- API key lifespan countdown with regeneration links in Settings',
    draft: false, prerelease: false,
  });
  console.log('Created release id:', rel.id);
}

// 2. Download artifact zip from GitHub Actions
fs.mkdirSync(TMP, { recursive: true });
const zipPath = path.join(TMP, 'installer.zip');
console.log(`\nDownloading artifact ${ARTIFACT_ID}…`);
await download(
  `https://api.github.com/repos/${REPO}/actions/artifacts/${ARTIFACT_ID}/zip`,
  zipPath
);
const zipSize = fs.statSync(zipPath).size;
console.log('Downloaded:', zipSize, 'bytes');
if (zipSize < 1000) {
  const raw = fs.readFileSync(zipPath, 'utf8');
  throw new Error('Artifact download too small — response: ' + raw.slice(0, 300));
}

// 3. Unzip
const extractDir = path.join(TMP, 'extracted');
fs.mkdirSync(extractDir, { recursive: true });
execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'inherit' });
const files = fs.readdirSync(extractDir);
console.log('Extracted files:', files);

// 4. Upload each file to the release
const uploadUrl = rel.upload_url ?? `https://uploads.github.com/repos/${REPO}/releases/${rel.id}/assets{?name,label}`;
for (const fname of files) {
  const fpath = path.join(extractDir, fname);
  if (fs.statSync(fpath).isDirectory()) continue;
  const buf = fs.readFileSync(fpath);
  console.log(`\nUploading ${fname} (${Math.round(buf.length / 1024 / 1024)}MB)…`);
  const result = await uploadAsset(uploadUrl, fname, buf);
  if (result.id) {
    console.log(`✓ ${result.name} → ${result.browser_download_url}`);
  } else {
    console.log('Upload response:', JSON.stringify(result).slice(0, 300));
  }
}

console.log('\n✓ Done → https://github.com/' + REPO + '/releases/tag/' + TAG);
