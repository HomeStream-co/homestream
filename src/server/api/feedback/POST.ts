/**
 * POST /api/feedback
 *
 * Creates a GitHub Issue on the HomeStream repo using the GH_TOKEN secret.
 * Called by the in-app FeedbackButton component.
 *
 * Body:
 *   type        — 'bug' | 'feature' | 'casting' | 'performance' | 'other'
 *   description — free-text description from the user
 *   version     — app version string (e.g. "1.6.0")
 *   channel     — 'stable' | 'beta'
 *   os          — user agent / OS string (optional)
 *   page        — current page path (optional)
 *
 * Returns:
 *   { ok: true, issueUrl: string, issueNumber: number }
 *   { ok: false, error: string }
 */

import type { Request, Response } from 'express';
import { requireAuth } from '../../authMiddleware.js';

const GH_OWNER = 'trevorrossworn-code';
const GH_REPO  = 'homestream';
const GH_API   = 'https://api.github.com';

const TYPE_LABELS: Record<string, string> = {
  bug:         '🐛 bug',
  feature:     '✨ feature request',
  casting:     '📺 casting',
  performance: '⚡ performance',
  other:       '💬 feedback',
};

const TYPE_EMOJI: Record<string, string> = {
  bug:         '🐛',
  feature:     '✨',
  casting:     '📺',
  performance: '⚡',
  other:       '💬',
};

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const {
    type = 'other',
    description = '',
    version = 'unknown',
    channel = 'stable',
    os = '',
    page = '',
  } = req.body as {
    type?: string;
    description?: string;
    version?: string;
    channel?: string;
    os?: string;
    page?: string;
  };

  if (!description.trim()) {
    return res.status(400).json({ ok: false, error: 'Description is required' });
  }

  // Read GH_TOKEN from environment — works in both Electron (process.env set by
  // main.cjs from electron-store config) and cloud/dev (set via secrets manager).
  const ghToken = process.env.GH_TOKEN;
  if (!ghToken) {
    return res.status(503).json({ ok: false, error: 'GitHub token not configured — feedback cannot be submitted' });
  }

  const emoji = TYPE_EMOJI[type] ?? '💬';
  const label = TYPE_LABELS[type] ?? 'feedback';
  const channelBadge = channel === 'beta' ? ' `beta`' : '';

  const title = `${emoji} [${type}] ${description.slice(0, 72).replace(/\n/g, ' ')}${description.length > 72 ? '…' : ''}`;

  const body = [
    `## ${emoji} ${label.replace(/^[^ ]+ /, '')}`,
    '',
    description.trim(),
    '',
    '---',
    '**Environment**',
    `| Field | Value |`,
    `|-------|-------|`,
    `| Version | \`v${version}\`${channelBadge} |`,
    os   ? `| OS | ${os} |` : null,
    page ? `| Page | \`${page}\` |` : null,
    `| Submitted | ${new Date().toISOString()} |`,
    '',
    '*Submitted via HomeStream in-app feedback*',
  ].filter(l => l !== null).join('\n');

  try {
    const apiRes = await fetch(`${GH_API}/repos/${GH_OWNER}/${GH_REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${ghToken}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': `HomeStream/${version}`,
      },
      body: JSON.stringify({
        title,
        body,
        labels: [label, channel === 'beta' ? 'beta-tester' : 'user-report'],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('[feedback] GitHub API error:', apiRes.status, errText);
      return res.status(502).json({ ok: false, error: `GitHub returned ${apiRes.status}` });
    }

    const issue = await apiRes.json() as { html_url: string; number: number };
    console.log(`[feedback] Issue #${issue.number} created: ${issue.html_url}`);

    return res.json({ ok: true, issueUrl: issue.html_url, issueNumber: issue.number });

  } catch (err) {
    console.error('[feedback] fetch error:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
