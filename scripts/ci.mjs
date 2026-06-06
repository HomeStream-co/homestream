#!/usr/bin/env node
/**
 * scripts/ci.mjs — HomeStream CI status checker
 *
 * Usage:
 *   node scripts/ci.mjs [sha]          # show status for a commit SHA (default: HEAD)
 *   node scripts/ci.mjs [sha] --log    # also fetch logs for failed jobs
 *
 * Requires GH_TOKEN secret to be set.
 */

import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { getSecret } = require('#airo/secrets');
const https = require('https');

const token = getSecret('GH_TOKEN');
const REPO = 'HomeStream-co/homestream';

const args = process.argv.slice(2);
const showLogs = args.includes('--log');
const sha = args.find(a => !a.startsWith('--')) ??
  execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

// ── HTTP helper ───────────────────────────────────────────────────────────────

function get(path) {
  return new Promise((res, rej) => {
    const req = https.request({
      hostname: 'api.github.com', path,
      headers: {
        Authorization: 'token ' + token,
        'User-Agent': 'homestream-ci',
        Accept: 'application/vnd.github+json',
      },
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch { res(d); } });
    });
    req.on('error', rej);
    req.end();
  });
}

async function getLogRedirect(jobId) {
  return new Promise((res, rej) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${REPO}/actions/jobs/${jobId}/logs`,
      headers: {
        Authorization: 'token ' + token,
        'User-Agent': 'homestream-ci',
        Accept: 'application/vnd.github+json',
      },
    }, r => {
      if (r.statusCode === 302) res(r.headers.location);
      else res(null);
    });
    req.on('error', rej);
    req.end();
  });
}

async function fetchLog(url) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'homestream-ci' } },
      r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }
    );
    req.on('error', rej);
    req.setTimeout(10000, () => { req.destroy(); res('(log fetch timed out)'); });
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nChecking CI for sha: ${sha}\n`);

const runs = await get(`/repos/${REPO}/actions/runs?per_page=30`);
const matching = (runs.workflow_runs || []).filter(r => r.head_sha.startsWith(sha));

if (!matching.length) {
  console.log('No CI runs found for', sha);
  console.log('Recent runs:');
  (runs.workflow_runs || []).slice(0, 5).forEach(r =>
    console.log(' ', r.head_sha.slice(0, 8), r.name, r.status, r.conclusion)
  );
  process.exit(0);
}

let anyFailure = false;

for (const run of matching) {
  const icon = run.conclusion === 'success' ? '✅' : run.conclusion === 'failure' ? '❌' : '⏳';
  console.log(`${icon} ${run.name} | ${run.status} | ${run.conclusion ?? 'pending'}`);

  const jobs = await get(`/repos/${REPO}/actions/runs/${run.id}/jobs`);
  if (!jobs.jobs?.length) {
    if (run.conclusion === 'skipped') {
      console.log('   (skipped — trigger condition not met, e.g. branch push on tag-only workflow)');
    } else {
      console.log(`   (no jobs — conclusion=${run.conclusion} event=${run.event} — workflow may have failed at parse/queue stage)`);
    }
    if (run.conclusion === 'failure') anyFailure = true;
    continue;
  }

  for (const job of jobs.jobs) {
    const ji = job.conclusion === 'success' ? '  ✓' : job.conclusion === 'failure' ? '  ❌' : '  …';
    console.log(`${ji} ${job.name}`);

    if (job.conclusion === 'failure') {
      anyFailure = true;
      for (const s of job.steps || []) {
        if (s.conclusion === 'failure') {
          console.log(`      ❌ STEP: ${s.name}`);
        }
      }

      if (showLogs) {
        const logUrl = await getLogRedirect(job.id);
        if (logUrl) {
          const log = await fetchLog(logUrl);
          const lines = log.split('\n')
            .map(l => l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z /, ''))
            .filter(l => l.trim())
            .slice(-40);
          console.log('\n--- LOG (last 40 lines) ---');
          console.log(lines.join('\n'));
          console.log('--- END LOG ---\n');
        }
      }
    }
  }
}

console.log('');
process.exit(anyFailure ? 1 : 0);
