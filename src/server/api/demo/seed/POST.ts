/**
 * POST /api/demo/seed
 *
 * Seeds the library with a demo media item that uses a publicly-licensed
 * short film (Big Buck Bunny) served directly from the Blender Foundation CDN.
 *
 * This is ONLY for testing the player UI — it does NOT download the file
 * locally. The stream URL points directly at the CDN MP4.
 *
 * To use: POST /api/demo/seed  → returns { ok: true, id: "demo-bbb" }
 * Then navigate to /player/demo-bbb
 */
import type { Request, Response } from 'express';
import { readLibrary, writeLibrary } from '../../../libraryStore.js';

const DEMO_ITEM = {
  id: 'demo-bbb',
  title: 'Big Buck Bunny',
  type: 'movie',
  year: '2008',
  // Direct CDN stream — no local file needed for demo
  filename: '__demo__big-buck-bunny.mp4',
  // We store the CDN URL here; the stream endpoint will proxy it
  filePath: '__demo__',
  demoStreamUrl: 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
  poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/800px-Big_buck_bunny_poster_big.jpg',
  backdrop: 'https://peach.blender.org/wp-content/uploads/bbb-splash.png',
  plot: 'A large and lovable rabbit deals with three bullying rodents who want to steal his berries. A short animated film by the Blender Foundation — freely licensed under Creative Commons.',
  rating: 'G',
  imdbRating: '7.8',
  genre: ['Animation', 'Short', 'Comedy'],
  runtime: '9 min',
  director: 'Sacha Goedegebure',
  actors: ['Big Buck Bunny'],
  transcoding: false,
  watchProgress: 0,
  profileProgress: { adult: 0, kids: 0 },
  isDemo: true,
  importedFrom: 'demo',
  addedAt: new Date().toISOString(),
};

export default async function handler(_req: Request, res: Response) {
  try {
    // Check if already seeded
    const library = readLibrary<typeof DEMO_ITEM>();
    const existing = library.find(m => m.id === 'demo-bbb');
    if (existing) {
      return res.json({ ok: true, id: 'demo-bbb', alreadyExists: true });
    }

    await writeLibrary(lib => {
      lib.unshift(DEMO_ITEM as unknown as Record<string, unknown>);
      return lib;
    });

    res.json({ ok: true, id: 'demo-bbb' });
  } catch (err) {
    res.status(500).json({ error: 'Seed failed', message: String(err) });
  }
}
