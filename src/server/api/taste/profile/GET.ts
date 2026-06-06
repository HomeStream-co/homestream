/**
 * GET /api/taste/profile?profileId=default
 *
 * Returns the full taste profile for a given profile, grouped by dimension.
 * Used by the Settings → Taste Profile panel and the AI system prompt builder.
 */
import type { Request, Response } from 'express';
import { getTasteProfile, buildTasteSummary, getRecentWatchHistory } from '../../../tasteEngine.js';

export default async function handler(req: Request, res: Response) {
  try {
    const profileId = (req.query.profileId as string) || 'default';

    const [profile, summary, recentHistory] = await Promise.all([
      getTasteProfile(profileId),
      buildTasteSummary(profileId),
      getRecentWatchHistory(profileId, 20),
    ]);

    // Group by dimension for the UI
    const grouped: Record<string, { value: string; score: number; eventCount: number }[]> = {};
    for (const entry of profile) {
      if (!grouped[entry.dimension]) grouped[entry.dimension] = [];
      grouped[entry.dimension].push({
        value:      entry.value,
        score:      entry.score,
        eventCount: entry.eventCount,
      });
    }

    res.json({ profile: grouped, summary, recentHistory, totalEvents: recentHistory.length });
  } catch (error) {
    console.error('[taste/profile] GET error:', error);
    res.status(500).json({ error: 'Failed to load taste profile', message: String(error) });
  }
}
