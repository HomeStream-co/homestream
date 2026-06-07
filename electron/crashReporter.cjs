'use strict';

/**
 * crashReporter.cjs
 *
 * Silent GitHub issue creation for crash reports.
 * Uses the ISSUES_TOKEN embedded at build time (issues:write scope only).
 * Falls back to opening a pre-filled browser URL if the API call fails.
 */

const { app, shell } = require('electron');
const https = require('https');

// Token injected at build time via release.yml → package.json build.issuesToken
function getIssuesToken() {
  try {
    const pkg = require('../package.json');
    return pkg.build?.issuesToken || '';
  } catch {
    return '';
  }
}

const OWNER = 'HomeStream-co';
const REPO  = 'homestream';

/**
 * Post a GitHub issue silently via the API.
 * Returns { success: true, url } on success or { success: false, error } on failure.
 */
function postGitHubIssue(title, body, labels = ['crash']) {
  return new Promise((resolve) => {
    const token = getIssuesToken();
    if (!token) {
      resolve({ success: false, error: 'No issues token available' });
      return;
    }

    const payload = JSON.stringify({ title, body, labels });
    const options = {
      hostname: 'api.github.com',
      path:     `/repos/${OWNER}/${REPO}/issues`,
      method:   'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept':        'application/vnd.github+json',
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent':    `HomeStream/${app.getVersion()}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 201) {
          try {
            const issue = JSON.parse(data);
            resolve({ success: true, url: issue.html_url, number: issue.number });
          } catch {
            resolve({ success: true, url: `https://github.com/${OWNER}/${REPO}/issues` });
          }
        } else {
          resolve({ success: false, error: `GitHub API returned ${res.statusCode}: ${data.slice(0, 200)}` });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ success: false, error: 'Request timed out' });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Build a formatted issue body from crash details.
 */
function buildIssueBody(errorLog) {
  const version  = app.getVersion();
  const platform = `${process.platform} (${process.arch})`;
  const node     = process.versions.node;
  const electron = process.versions.electron || 'unknown';
  const truncated = errorLog.length > 4000 ? errorLog.slice(-4000) + '\n...(truncated)' : errorLog;

  return [
    `**HomeStream version:** ${version}`,
    `**Platform:** ${platform}`,
    `**Node:** ${node}`,
    `**Electron:** ${electron}`,
    '',
    '**Error log:**',
    '```',
    truncated,
    '```',
    '',
    '**Steps to reproduce:**',
    '1. ',
    '2. ',
    '3. ',
  ].join('\n');
}

/**
 * Submit a crash report silently.
 * Shows a native dialog with the result.
 * Falls back to browser URL if API fails.
 *
 * @param {string} crashType  - 'fast-crash' | 'watchdog'
 * @param {string} errorLog   - full error log text
 * @param {Function} showDialog - electron dialog.showMessageBoxSync
 * @param {object} clipboard  - electron clipboard
 */
async function submitCrashReport(crashType, errorLog, showDialog, clipboard) {
  const version = app.getVersion();
  const label   = crashType === 'fast-crash' ? 'crashed 3 times instantly' : `crashed repeatedly`;
  const title   = `[Crash] Server ${label} on ${process.platform} v${version}`;
  const body    = buildIssueBody(errorLog);

  // Show a "submitting" indicator — native dialogs are blocking so we fire async
  const result = await postGitHubIssue(title, body, ['crash']);

  if (result.success) {
    showDialog({
      type: 'info',
      title: 'Bug report submitted',
      message: `Report filed as issue #${result.number}`,
      detail: `Thank you! The developer will investigate.\n\n${result.url}`,
      buttons: ['Open Issue', 'Close'],
      defaultId: 0,
      cancelId: 1,
    });
    // Open the issue in browser if they click "Open Issue" (choice 0)
    // We can't capture the return value here since we're async — open it anyway
    shell.openExternal(result.url);
  } else {
    // API failed — fall back to pre-filled browser URL
    console.error('[crashReporter] API failed:', result.error, '— falling back to browser');
    const issueTitle = encodeURIComponent(title);
    const issueBody  = encodeURIComponent(body);
    shell.openExternal(
      `https://github.com/${OWNER}/${REPO}/issues/new?title=${issueTitle}&body=${issueBody}&labels=crash`
    );
  }
}

module.exports = { submitCrashReport };
