import type { Request, Response } from 'express';
import { readLibrary, writeLibrary } from '../../../../../libraryStore.js';
import { requireAuth } from '../../../../../authMiddleware.js';

interface Episode {
  id: string;
  watched: boolean;
  watchedAt?: string;
}

interface SeriesItem {
  id: string;
  episodes?: Episode[];
}

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    const { id, episodeId } = req.params;
    const { watched } = req.body as { watched: boolean };

    const library = readLibrary<SeriesItem>();
    const idx = library.findIndex(m => m.id === id);

    if (idx === -1) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    const item = library[idx];
    const episodes: Episode[] = item.episodes || [];
    const epIdx = episodes.findIndex(e => e.id === episodeId);

    if (epIdx === -1) {
      return res.status(404).json({ error: 'Episode not found' });
    }

    const updatedEpisode: Episode = {
      ...episodes[epIdx],
      watched,
      watchedAt: watched ? new Date().toISOString() : undefined,
    };

    const updatedEpisodes = [...episodes];
    updatedEpisodes[epIdx] = updatedEpisode;

    await writeLibrary<SeriesItem>(lib => {
      const i = lib.findIndex(m => m.id === id);
      if (i !== -1) lib[i] = { ...lib[i], episodes: updatedEpisodes };
      return lib;
    });

    return res.json(updatedEpisode);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update episode', message: String(error) });
  }
}
