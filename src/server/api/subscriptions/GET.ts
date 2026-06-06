/**
 * GET /api/subscriptions
 * Returns all show subscriptions with their schedule and last-check info.
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../authMiddleware.js';
import { getAllSubscriptions } from '../../subscriptionStore.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    res.json({ subscriptions: getAllSubscriptions() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read subscriptions', message: String(err) });
  }
}
