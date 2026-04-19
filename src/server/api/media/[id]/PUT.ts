import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const LIBRARY_PATH = path.resolve('./media-library.json');

export default async function handler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (!fs.existsSync(LIBRARY_PATH)) {
      return res.status(404).json({ error: 'Library not found' });
    }
    const data = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8'));
    const idx = data.findIndex((m: { id: string }) => m.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Media item not found' });
    }
    data[idx] = { ...data[idx], ...updates, id };
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(data, null, 2));
    res.json(data[idx]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update media', message: String(error) });
  }
}
