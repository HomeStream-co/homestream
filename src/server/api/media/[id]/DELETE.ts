import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const LIBRARY_PATH = path.resolve('./media-library.json');

export default async function handler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!fs.existsSync(LIBRARY_PATH)) {
      return res.status(404).json({ error: 'Library not found' });
    }
    const data = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8'));
    const item = data.find((m: { id: string }) => m.id === id);
    if (!item) {
      return res.status(404).json({ error: 'Media item not found' });
    }
    // Delete the actual file
    const filePath = path.resolve('.' + item.filepath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    // Remove from library
    const updated = data.filter((m: { id: string }) => m.id !== id);
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(updated, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete media', message: String(error) });
  }
}
