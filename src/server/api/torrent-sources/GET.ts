import type { Request, Response } from 'express';
import { requireAuth } from '../../authMiddleware.js';
import { readConfig, DEFAULT_TORRENT_SOURCES } from '../../configStore.js';

/**
 * GET /api/torrent-sources
 * Returns the full list of configured torrent sources.
 * Always ensures the three built-in sources are present (migrates old configs).
 */
export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const config = readConfig();
  let sources = config.torrentSources ?? [];

  // Migration: ensure built-in sources exist in older configs that predate this feature
  const builtInIds = new Set(sources.filter(s => s.builtIn).map(s => s.id));
  for (const def of DEFAULT_TORRENT_SOURCES) {
    if (!builtInIds.has(def.id)) {
      // Preserve prowlarr enabled state from legacy prowlarrApiKey field
      const enabled = def.type === 'prowlarr'
        ? !!(config.prowlarrApiKey)
        : def.enabled;
      sources = [{ ...def, enabled }, ...sources];
    }
  }

  res.json({ sources });
}
