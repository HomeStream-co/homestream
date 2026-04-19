import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';

const LIBRARY_PATH = path.join(process.cwd(), 'media-library.json');

async function readLibrary() {
  try {
    const data = await fs.readFile(LIBRARY_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeLibrary(library: unknown[]) {
  await fs.writeFile(LIBRARY_PATH, JSON.stringify(library, null, 2));
}

export default async function handler(req: Request, res: Response) {
  try {
    const { id, episodeId } = req.params;
    const { watched } = req.body as { watched: boolean };

    const library = await readLibrary();
    const idx = library.findIndex((m: { id: string }) => m.id === id);

    if (idx === -1) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    const item = library[idx];
    const episodes: { id: string; watched: boolean; watchedAt?: string }[] = item.episodes || [];
    const epIdx = episodes.findIndex(e => e.id === episodeId);

    if (epIdx === -1) {
      return res.status(404).json({ error: 'Episode not found' });
    }

    episodes[epIdx] = {
      ...episodes[epIdx],
      watched,
      watchedAt: watched ? new Date().toISOString() : undefined,
    };

    library[idx] = { ...item, episodes };
    await writeLibrary(library);

    return res.json(episodes[epIdx]);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update episode', message: String(error) });
  }
}
