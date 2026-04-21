import type { Request, Response } from 'express';
import { readLibrary, writeLibrary } from '../../../../libraryStore.js';
import { requireAuth } from '../../../../authMiddleware.js';

interface Episode {
  id: string;
  season: number;
  episode: number;
  title: string;
  watched: boolean;
  watchedAt?: string;
  runtime?: string;
  plot?: string;
}

interface SeriesItem {
  id: string;
  type: string;
  episodes?: Episode[];
}

export default async function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const { id } = req.params;
    const library = readLibrary<SeriesItem>();
    const idx = library.findIndex(m => m.id === id);

    if (idx === -1) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    const item = library[idx];
    if (item.type !== 'series') {
      return res.status(400).json({ error: 'Item is not a TV series' });
    }

    // Accept bulk episode list or single episode
    const body = req.body;
    const episodes = Array.isArray(body) ? body : [body];

    const newEpisodes: Episode[] = episodes.map((ep: {
      season: number;
      episode: number;
      title?: string;
      runtime?: string;
      plot?: string;
    }) => ({
      id: `ep-${Math.random().toString(36).slice(2)}`,
      season: ep.season,
      episode: ep.episode,
      title: ep.title || `Episode ${ep.episode}`,
      watched: false,
      watchedAt: undefined,
      runtime: ep.runtime,
      plot: ep.plot,
    }));

    // Merge with existing, avoid duplicates by season+episode
    const existing: Episode[] = item.episodes || [];
    const merged = [...existing];
    for (const ep of newEpisodes) {
      const dup = merged.findIndex(e => e.season === ep.season && e.episode === ep.episode);
      if (dup === -1) merged.push(ep);
    }

    // Sort by season then episode
    merged.sort((a, b) => a.season !== b.season ? a.season - b.season : a.episode - b.episode);

    await writeLibrary<SeriesItem>(lib => {
      const i = lib.findIndex(m => m.id === id);
      if (i !== -1) lib[i] = { ...lib[i], episodes: merged };
      return lib;
    });

    return res.json(merged);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save episodes', message: String(error) });
  }
}
