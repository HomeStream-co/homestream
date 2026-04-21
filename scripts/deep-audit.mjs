import https from 'https';
import fs from 'fs';
import path from 'path';

const config = JSON.parse(fs.readFileSync('/alloc/config.json', 'utf8'));
const ghToken = config.GH_TOKEN?.VALUE || config.GH_TOKEN;

function ghGet(filePath) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'api.github.com',
      path: `/repos/trevorrossworn-code/homestream/contents/${filePath}`,
      headers: { 'Authorization': 'token ' + ghToken, 'User-Agent': 'homestream-builder', 'Accept': 'application/vnd.github.v3+json' }
    };
    https.get(opts, res => {
      let d = '';
      res.on('data', x => d += x);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
  });
}

async function getGHContent(filePath) {
  const r = await ghGet(filePath);
  if (r.status === 200 && r.body.content) {
    return Buffer.from(r.body.content, 'base64').toString('utf8');
  }
  return null;
}

async function getLatestRunLogs() {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'api.github.com',
      path: '/repos/trevorrossworn-code/homestream/actions/runs?per_page=1',
      headers: { 'Authorization': 'token ' + ghToken, 'User-Agent': 'homestream-builder', 'Accept': 'application/vnd.github.v3+json' }
    };
    https.get(opts, res => {
      let d = '';
      res.on('data', x => d += x);
      res.on('end', async () => {
        const runs = JSON.parse(d);
        const run = runs.workflow_runs[0];
        console.log('\n=== LATEST RUN ===');
        console.log('Name:', run.name, '| Status:', run.status, '| Conclusion:', run.conclusion);

        // Get jobs
        const jobsRes = await new Promise((res2) => {
          const o2 = {
            hostname: 'api.github.com',
            path: `/repos/trevorrossworn-code/homestream/actions/runs/${run.id}/jobs`,
            headers: { 'Authorization': 'token ' + ghToken, 'User-Agent': 'homestream-builder', 'Accept': 'application/vnd.github.v3+json' }
          };
          https.get(o2, r2 => {
            let d2 = '';
            r2.on('data', x => d2 += x);
            r2.on('end', () => res2(JSON.parse(d2)));
          });
        });

        for (const job of jobsRes.jobs) {
          console.log('\nJob:', job.name, '| Conclusion:', job.conclusion);
          for (const step of job.steps) {
            const icon = step.conclusion === 'failure' ? '❌ FAIL' : step.conclusion === 'success' ? '✅ OK' : '⏭ ' + (step.conclusion || 'skipped');
            console.log(`  [${icon}] ${step.name}`);
          }

          if (job.conclusion === 'failure') {
            // Get logs
            const logRes = await new Promise((res3) => {
              const o3 = {
                hostname: 'api.github.com',
                path: `/repos/trevorrossworn-code/homestream/actions/jobs/${job.id}/logs`,
                headers: { 'Authorization': 'token ' + ghToken, 'User-Agent': 'homestream-builder', 'Accept': 'application/vnd.github.v3+json' }
              };
              https.get(o3, r3 => {
                let d3 = '';
                r3.on('data', x => d3 += x);
                r3.on('end', () => res3({ location: r3.headers?.location || r3.req?.res?.headers?.location, status: r3.statusCode }));
              });
            });
            resolve(logRes.location);
          }
        }
        resolve(null);
      });
    });
  });
}

async function fetchUrl(url) {
  return new Promise((resolve) => {
    https.get(url, res => {
      let d = '';
      res.on('data', x => d += x);
      res.on('end', () => resolve(d));
    }).on('error', () => resolve(''));
  });
}

async function main() {
  // 1. Get latest run logs
  const logUrl = await getLatestRunLogs();

  if (logUrl) {
    const logs = await fetchUrl(logUrl);
    const lines = logs.split('\n');
    // Find all ERROR lines
    const errorLines = lines.filter(l => l.includes('ERROR') || l.includes('error TS') || l.includes('Cannot find') || l.includes('Could not resolve') || l.includes('failed'));
    console.log('\n=== ALL ERRORS IN BUILD LOG ===');
    errorLines.slice(0, 50).forEach(l => console.log(l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z /, '')));
  }

  // 2. Audit key files on GitHub vs local
  console.log('\n=== FILE AUDIT: GitHub vs Local ===');

  const filesToCheck = [
    'vite.config.ts',
    'package.json',
    '.github/workflows/release.yml',
    'airo-secrets/src/index.ts',
    'airo-secrets/src/secrets-utils.ts',
    'airo-secrets/package.json',
    'src/server/configure.js',
    'electron/electron-builder.yml',
  ];

  for (const f of filesToCheck) {
    const ghContent = await getGHContent(f);
    const localExists = fs.existsSync(f);
    const localContent = localExists ? fs.readFileSync(f, 'utf8') : null;

    if (!ghContent) {
      console.log(`❌ MISSING ON GITHUB: ${f}`);
    } else if (!localContent) {
      console.log(`⚠️  MISSING LOCALLY: ${f}`);
    } else if (ghContent !== localContent) {
      console.log(`⚠️  DIFFERS: ${f} (GH: ${ghContent.length} chars, Local: ${localContent.length} chars)`);
      // Show last 100 chars of GH version to spot issues
      console.log(`   GH tail: ${JSON.stringify(ghContent.slice(-100))}`);
    } else {
      console.log(`✅ IN SYNC: ${f}`);
    }
  }

  // 3. Check vite.config.ts specifics
  console.log('\n=== VITE CONFIG DEEP CHECK ===');
  const viteGH = await getGHContent('vite.config.ts');
  if (viteGH) {
    console.log('Has conflict marker (>>>>>>>):', viteGH.includes('>>>>>>>'));
    console.log('Has #airo/secrets in esbuild external:', viteGH.includes('"#airo/secrets"'));
    console.log('Has /^#/ regex external:', viteGH.includes('/^#/'));
    console.log('Has webtorrent in esbuild external:', viteGH.includes('"webtorrent"'));
    console.log('Has app.js existsSync check:', viteGH.includes('existsSync'));
    console.log('Has bad plugin imports (dev-tools):', viteGH.includes('dev-tools'));
    console.log('Has bad plugin imports (fullstory):', viteGH.includes('fullstory'));
    console.log('Line count:', viteGH.split('\n').length);
  }

  // 4. Check package.json imports field
  console.log('\n=== PACKAGE.JSON IMPORTS FIELD ===');
  const pkgGH = await getGHContent('package.json');
  if (pkgGH) {
    const pkg = JSON.parse(pkgGH);
    console.log('imports field:', JSON.stringify(pkg.imports, null, 2));
    console.log('engines field:', JSON.stringify(pkg.engines, null, 2));
  }
}

main().catch(console.error);
