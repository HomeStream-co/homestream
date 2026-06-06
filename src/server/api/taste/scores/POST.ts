/**
 * POST /api/taste/scores
 *
 * Recompute taste scores for the full library and return the top N
 * unwatched recommendations.
 *
 * Body: { library: LibraryItem[], profileId?: string, limit?: number }
 */
import type { Request, Response } from 'express';
import { recomputeTasteScores, getTopRecommendations, scoreItem, getTasteProfile } from '../../../tasteEngine.js';
import type { LibraryItem } from '../../../tasteEngine.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { library, profileId = 'default', limit = 12 } = req.body as {
      library: LibraryItem[];
      profileId?: string;
      limit?: number;
    };

    if (!library || !Array.isArray(library)) {
      return res.status(400).json({ error: 'library array is required' });
    }

    await recomputeTasteScores(library, profileId);
    const top = await getTopRecommendations(profileId, limit);

    // Also return inline scores for every library item so the UI can show badges
    const profile = await getTasteProfile(profileId);
    const allScores = library.map(item => ({
      id:    item.id,
      score: scoreItem(item, profile),
    }));

    res.json({ recommendations: top, allScores });
  } catch (error) {
    console.error('[taste/scores] POST error:', error);
    res.status(500).json({ error: 'Failed to compute scores', message: String(error) });
  }
}
