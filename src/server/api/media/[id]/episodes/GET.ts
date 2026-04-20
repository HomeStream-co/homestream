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

export default async function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const { id } = req.params;
    const library = await readLibrary();
    const item = library.find((m: { id: string }) => m.id === id);

    if (!item) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    if (item.type !== 'series') {
      return res.status(400).json({ error: 'Item is not a TV series' });
    }

    return res.json(item.episodes || []);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch episodes', message: String(error) });
  }
}
