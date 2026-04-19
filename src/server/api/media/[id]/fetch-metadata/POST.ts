/**
 * POST /api/media/:id/fetch-metadata
 *
 * Retries OMDB metadata lookup for an existing library item.
 * Called when a file was uploaded offline and the user is now back online.
 * Merges OMDB data into the existing item — preserves any manually entered
 * fields (title, year, genre) if OMDB returns nothing.
 */
import type { Request, Response } from 'express';
import { readLibrary, writeLibrary } from '../../../../libraryStore.js';
import { fetchOMDB } from '../../../../mediaUtils.js';

interface MediaItem {
  id: string;
  title: string;
  year: string;
  genre: string[];
  plot: string;
  director: string;
  actors: string;
  imdbRating: string;
  poster: string;
  type: string;
  runtime: string;
  rated: string;
  needsMetadata?: boolean;
  [key: string]: unknown;
}

function readLibraryLocal(): MediaItem[] {
  return readLibrary<MediaItem>();
}

function writeLibraryLocal(data: MediaItem[]) {
  writeLibrary(() => data);
}

export default async function handler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const lib = readLibraryLocal();
    const idx = lib.findIndex(m => m.id === id);

    if (idx === -1) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    const item = lib[idx];

    // Try OMDB with the current title (may have been manually corrected)
    const omdb = await fetchOMDB(item.title, item.year);

    if (!omdb) {
      // Still offline or title not found — return current item unchanged
      return res.status(200).json({
        success: false,
        message: 'Could not reach OMDB — still offline or title not found',
        item,
      });
    }

    // Merge OMDB data — only overwrite fields that are still "Unknown"/empty
    const updated: MediaItem = {
      ...item,
      // Always take OMDB title if it found a match (better casing/punctuation)
      title: omdb.Title || item.title,
      year: omdb.Year || item.year,
      genre: omdb.Genre
        ? omdb.Genre.split(',').map((g: string) => g.trim())
        : (item.genre.length && item.genre[0] !== 'Unknown' ? item.genre : ['Unknown']),
      plot: omdb.Plot && omdb.Plot !== 'N/A' ? omdb.Plot : item.plot,
      director: omdb.Director && omdb.Director !== 'N/A' ? omdb.Director : item.director,
      actors: omdb.Actors && omdb.Actors !== 'N/A' ? omdb.Actors : item.actors,
      imdbRating: omdb.imdbRating && omdb.imdbRating !== 'N/A' ? omdb.imdbRating : item.imdbRating,
      poster: (omdb.Poster && omdb.Poster !== 'N/A') ? omdb.Poster : item.poster,
      type: omdb.Type === 'series' ? 'series' : 'movie',
      runtime: omdb.Runtime && omdb.Runtime !== 'N/A' ? omdb.Runtime : item.runtime,
      rated: omdb.Rated && omdb.Rated !== 'N/A' && omdb.Rated.trim() !== '' ? omdb.Rated.trim() : item.rated || 'NR',
      // Clear the offline flags now that we have real data
      needsMetadata: false,
      metadataAvailable: true,
    };

    lib[idx] = updated;
    writeLibraryLocal(lib);

    res.json({ success: true, item: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch metadata', message: String(error) });
  }
}
