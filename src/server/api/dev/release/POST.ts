/**
 * POST /api/dev/release
 *
 * Developer-only endpoint. Bumps the version, commits, tags, and pushes
 * to GitHub — triggering the GitHub Actions build automatically.
 *
 * This is the backend for the Debug Panel "Cut Release" button.
 * Requires admin auth + DEVELOPER_LOCK must be true (dev-only guard).
 *
 * Body: { bump: 'patch' | 'minor' | 'major' | '1.2.0-alpha.1' }
 *
 * Response:
 * { success: true, version: 'v1.2.0', output: '...' }
 */
import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../../authMiddleware.js';
import { isDeveloperLocked } from '../../../ownershipSeed.js';

const execAsync = promisify(exec);

// Root of the project (where package.json lives)
const ROOT = process.cwd();

function bumpVersion(current: string, bump: string): string {
  // Exact version provided
  if (/^\d+\.\d+\.\d+/.test(bump) && bump !== 'patch' && bump !== 'minor' && bump !== 'major') {
    return bump;
  }
  const base = current.split('-')[0];
  const [major, minor, patch] = base.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`; // patch (default)
}

export default async function handler(req: Request, res: Response) {
  // Auth guard
  if (!requireAuth(req, res)) return;

  // Only available when DEVELOPER_LOCK is active (confirms this is a dev deployment)
  if (!isDeveloperLocked()) {
    res.status(403).json({
      error: 'Release endpoint is only available on developer-locked deployments.',
    });
    return;
  }

  const bump = (req.body?.bump as string) || 'patch';
  const log: string[] = [];

  try {
    // Read current version
    const pkgPath = path.join(ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const currentVersion: string = pkg.version;
    const newVersion = bumpVersion(currentVersion, bump);
    const tag = `v${newVersion}`;

    log.push(`Current version: ${currentVersion}`);
    log.push(`New version: ${newVersion}`);

    // Check for uncommitted changes
    const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: ROOT });
    if (statusOut.trim()) {
      log.push(`Uncommitted changes detected — committing them first...`);
      await execAsync('git add -A', { cwd: ROOT });
      await execAsync(`git commit -m "chore: pre-release cleanup"`, { cwd: ROOT });
      log.push('Pre-release commit done.');
    }

    // Pull latest
    log.push('Pulling latest from origin/main...');
    const { stdout: pullOut } = await execAsync('git pull origin main --ff-only', { cwd: ROOT });
    log.push(pullOut.trim() || 'Already up to date.');

    // Bump version in package.json
    pkg.version = newVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    log.push(`package.json updated to ${newVersion}`);

    // Commit version bump
    await execAsync('git add package.json', { cwd: ROOT });
    try {
      const { stdout: commitOut } = await execAsync(
        `git commit -m "chore: bump version to ${tag}"`,
        { cwd: ROOT }
      );
      log.push(commitOut.trim());
    } catch {
      log.push('Nothing to commit (version already at this level).');
    }

    // Delete existing tag if present (safe re-tag)
    try {
      await execAsync(`git tag -d ${tag}`, { cwd: ROOT });
      log.push(`Deleted local tag ${tag}`);
    } catch { /* tag didn't exist */ }

    try {
      await execAsync(`git push origin --delete ${tag}`, { cwd: ROOT });
      log.push(`Deleted remote tag ${tag}`);
    } catch { /* remote tag didn't exist */ }

    // Create and push new tag
    await execAsync(`git tag ${tag}`, { cwd: ROOT });
    log.push(`Created tag ${tag}`);

    const { stdout: pushOut } = await execAsync('git push origin main', { cwd: ROOT });
    log.push(pushOut.trim() || 'Pushed commits.');

    const { stdout: tagPushOut } = await execAsync(`git push origin ${tag}`, { cwd: ROOT });
    log.push(tagPushOut.trim() || `Pushed tag ${tag}.`);

    log.push(`✓ Release ${tag} triggered — GitHub Actions build started.`);

    res.json({
      success: true,
      version: tag,
      previousVersion: currentVersion,
      output: log.join('\n'),
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.push(`ERROR: ${message}`);
    res.status(500).json({
      success: false,
      error: message,
      output: log.join('\n'),
    });
  }
}
