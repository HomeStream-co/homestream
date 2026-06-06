import type { Request, Response } from 'express';
import { requireAuth } from '../../authMiddleware.js';
import { readConfig, writeConfig, makeTorrentSourceId, DEFAULT_TORRENT_SOURCES } from '../../configStore.js';
import type { TorrentSource, TorrentSourceType } from '../../configStore.js';

/**
 * POST /api/torrent-sources
 * Body actions:
 *   { action: 'add',    source: { name, type, url?, apiKey? } }
 *   { action: 'toggle', id: string, enabled: boolean }
 *   { action: 'delete', id: string }
 *   { action: 'reorder', ids: string[] }
 */
export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const body = req.body as {
    action: 'add' | 'toggle' | 'delete' | 'reorder';
    id?: string;
    enabled?: boolean;
    ids?: string[];
    source?: {
      name: string;
      type: TorrentSourceType;
      url?: string;
      apiKey?: string;
    };
  };

  const config = readConfig();
  let sources: TorrentSource[] = config.torrentSources ?? [...DEFAULT_TORRENT_SOURCES];

  switch (body.action) {
    case 'add': {
      const s = body.source;
      if (!s?.name?.trim() || !s?.type) {
        res.status(400).json({ error: 'name and type are required' });
        return;
      }
      if (['jackett', 'torznab', 'rss'].includes(s.type) && !s.url?.trim()) {
        res.status(400).json({ error: 'url is required for this source type' });
        return;
      }
      const newSource: TorrentSource = {
        id: makeTorrentSourceId(),
        name: s.name.trim(),
        type: s.type,
        url: s.url?.trim() || undefined,
        apiKey: s.apiKey?.trim() || undefined,
        enabled: true,
        builtIn: false,
      };
      sources = [...sources, newSource];
      break;
    }

    case 'toggle': {
      if (!body.id) { res.status(400).json({ error: 'id is required' }); return; }
      sources = sources.map(s =>
        s.id === body.id ? { ...s, enabled: body.enabled ?? !s.enabled } : s
      );
      break;
    }

    case 'delete': {
      if (!body.id) { res.status(400).json({ error: 'id is required' }); return; }
      const target = sources.find(s => s.id === body.id);
      if (target?.builtIn) {
        res.status(400).json({ error: 'Built-in sources cannot be deleted — disable them instead' });
        return;
      }
      sources = sources.filter(s => s.id !== body.id);
      break;
    }

    case 'reorder': {
      if (!Array.isArray(body.ids)) { res.status(400).json({ error: 'ids array is required' }); return; }
      const map = new Map(sources.map(s => [s.id, s]));
      const reordered = body.ids.map(id => map.get(id)).filter((s): s is TorrentSource => !!s);
      // Append any sources not in the ids list (safety net)
      const inList = new Set(body.ids);
      sources = [...reordered, ...sources.filter(s => !inList.has(s.id))];
      break;
    }

    default:
      res.status(400).json({ error: 'Unknown action' });
      return;
  }

  writeConfig({ torrentSources: sources });
  res.json({ sources });
}
