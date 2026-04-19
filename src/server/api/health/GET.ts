import type { Request, Response } from 'express';
import { isSetupComplete } from '../../configStore.js';

export default function handler(_req: Request, res: Response) {
  res.json({ ok: true, setupComplete: isSetupComplete(), ts: Date.now() });
}
