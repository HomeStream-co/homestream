import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { requireAuth } from '../../../../authMiddleware.js';

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
    if (!requireAuth(req, res)) return;
    const { id } = req.params;
    const library = await readLibrary();
    const idx = library.findIndex((m: { id: string }) => m.id === id);

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

    const newEpisodes = episodes.map((ep: {
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
    const existing: { season: number; episode: number }[] = item.episodes || [];
    const merged = [...existing];
    for (const ep of newEpisodes) {
      const dup = merged.findIndex(
        (e: { season: number; episode: number }) => e.season === ep.season && e.episode === ep.episode
      );
      if (dup === -1) merged.push(ep);
    }

    // Sort by season then episode
    merged.sort((a: { season: number; episode: number }, b: { season: number; episode: number }) =>
      a.season !== b.season ? a.season - b.season : a.episode - b.episode
    );

    library[idx] = { ...item, episodes: merged };
    await writeLibrary(library);

    return res.json(merged);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save episodes', message: String(error) });
  }
}
