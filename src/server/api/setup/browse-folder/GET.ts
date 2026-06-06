/**
 * GET /api/setup/browse-folder?path=/some/dir
 *
 * Returns the list of subdirectories inside `path` so the setup wizard
 * can render a file-system tree browser without needing Electron.
 *
 * Works on Linux, macOS, and Windows.
 * Intentionally open (no auth) — needed before a password is configured.
 */
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';

/** Resolve ~ to the real home dir on Linux/macOS */
function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export default async function handler(req: Request, res: Response) {
  const raw = (req.query.path as string | undefined) ?? os.homedir();
  const target = path.resolve(expandHome(raw));

  // Safety: never let the browser walk outside the filesystem root
  // (path.resolve already normalises ../ traversal, but be explicit)
  if (!target || target.includes('\0')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  try {
    const stat = await fs.promises.stat(target);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }

    const entries = await fs.promises.readdir(target, { withFileTypes: true });

    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: path.join(target, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    // Build parent path (stop at filesystem root)
    const parent = path.dirname(target);
    const hasParent = parent !== target; // false only at root

    return res.json({
      current: target,
      parent: hasParent ? parent : null,
      dirs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // EACCES = permission denied — return empty list rather than crashing
    if (msg.includes('EACCES') || msg.includes('EPERM')) {
      return res.json({ current: target, parent: path.dirname(target), dirs: [] });
    }
    return res.status(500).json({ error: msg });
  }
}
