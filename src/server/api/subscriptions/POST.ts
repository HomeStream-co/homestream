/**
 * POST /api/subscriptions
 * Subscribe to a show or update an existing subscription.
 *
 * Body:
 *   { imdbId, title, poster?, totalSeasons, schedule, enabled? }
 *
 * Also accepts:
 *   { imdbId, action: 'unsubscribe' }  — delete the subscription
 *   { imdbId, action: 'toggle' }       — flip enabled flag
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../authMiddleware.js';
import {
  upsertSubscription,
  deleteSubscription,
  setEnabled,
  getSubscription,
  type CheckSchedule,
} from '../../subscriptionStore.js';
import {
  rescheduleSubscription,
  cancelSubscription,
} from '../../episodeScheduler.js';

const VALID_SCHEDULES: CheckSchedule[] = ['daily', 'every3days', 'weekly', 'every2weeks'];

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    const { imdbId, action, title, poster, totalSeasons, schedule, enabled } = req.body as {
      imdbId?: string;
      action?: 'unsubscribe' | 'toggle';
      title?: string;
      poster?: string;
      totalSeasons?: number;
      schedule?: CheckSchedule;
      enabled?: boolean;
    };

    if (!imdbId) {
      res.status(400).json({ error: 'imdbId is required' });
      return;
    }

    // ── Unsubscribe ──────────────────────────────────────────────────────────
    if (action === 'unsubscribe') {
      cancelSubscription(imdbId);
      deleteSubscription(imdbId);
      res.json({ success: true, message: 'Unsubscribed' });
      return;
    }

    // ── Toggle enabled ───────────────────────────────────────────────────────
    if (action === 'toggle') {
      const existing = getSubscription(imdbId);
      if (!existing) {
        res.status(404).json({ error: 'Subscription not found' });
        return;
      }
      const next = !existing.enabled;
      setEnabled(imdbId, next);
      if (next) {
        rescheduleSubscription(imdbId);
      } else {
        cancelSubscription(imdbId);
      }
      res.json({ success: true, enabled: next });
      return;
    }

    // ── Subscribe / update ───────────────────────────────────────────────────
    if (!title || !totalSeasons || !schedule) {
      res.status(400).json({ error: 'title, totalSeasons, and schedule are required' });
      return;
    }

    if (!VALID_SCHEDULES.includes(schedule)) {
      res.status(400).json({ error: `schedule must be one of: ${VALID_SCHEDULES.join(', ')}` });
      return;
    }

    // Preserve lastFoundEpisode if re-subscribing to an existing show
    const existing = getSubscription(imdbId);

    const sub = upsertSubscription({
      imdbId,
      title,
      poster,
      totalSeasons,
      schedule,
      enabled: enabled ?? true,
      lastFoundEpisode: existing?.lastFoundEpisode,
      lastCheckedAt: existing?.lastCheckedAt,
    });

    rescheduleSubscription(imdbId);

    res.json({ success: true, subscription: sub });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save subscription', message: String(err) });
  }
}
