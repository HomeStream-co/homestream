/**
 * POST /api/security/quarantine
 * Actions: delete, restore
 */
import type { Request, Response } from 'express';
import { deleteFromQuarantine, restoreFromQuarantine } from '../../../security/threatScanner.js';

export default function handler(req: Request, res: Response) {
  const { action, id } = req.body as { action?: string; id?: string };

  if (!action || !id) {
    res.status(400).json({ error: 'action and id are required' });
    return;
  }

  if (action === 'delete') {
    const result = deleteFromQuarantine(id);
    res.json(result);
    return;
  }

  if (action === 'restore') {
    const result = restoreFromQuarantine(id);
    res.json(result);
    return;
  }

  res.status(400).json({ error: `Unknown action: ${action}` });
}
