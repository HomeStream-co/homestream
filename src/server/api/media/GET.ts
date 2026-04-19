import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const LIBRARY_PATH = path.resolve('./media-library.json');

export default async function handler(_req: Request, res: Response) {
  try {
    if (!fs.existsSync(LIBRARY_PATH)) {
      return res.json([]);
    }
    const data = fs.readFileSync(LIBRARY_PATH, 'utf-8');
    const library = JSON.parse(data);
    res.json(library);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read media library', message: String(error) });
  }
}
