/**
 * POST /api/updater/push
 *
 * Internal endpoint called ONLY by the Electron main process to push the
 * current auto-updater state into the server's in-memory bridge.
 *
 * Why this exists:
 *   The Electron main process and the Express server are separate OS processes
 *   (utilityProcess.fork).  They share no memory.  The updaterBridge module
 *   lives in the server process.  The only way for the Electron main process
 *   to write into it is over the loopback network.
 *
 * Security:
 *   Restricted to loopback (127.0.0.1 / ::1) — the middleware below rejects
 *   any request that didn't originate from localhost.  This prevents a rogue
 *   LAN device from spoofing update state.
 *
 * Body: UpdaterStatus JSON  { state, version?, percent?, bytesPerSecond?, error?, isElectron? }
 */
import type { Request, Response } from 'express';
import { setUpdaterStatus } from '../../../updaterBridge.js';

function isLoopback(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('127.')
  );
}

export default function handler(req: Request, res: Response) {
  // Only accept calls from the local machine
  const remoteIp = req.socket.remoteAddress ?? '';
  if (!isLoopback(remoteIp)) {
    return res.status(403).json({ error: 'Loopback only' });
  }

  const body = req.body as {
    state?: string;
    version?: string;
    currentVersion?: string;
    percent?: number;
    bytesPerSecond?: number;
    error?: string;
  };

  const validStates = ['idle','checking','available','not-available','downloading','ready','error'];
  if (!body?.state || !validStates.includes(body.state)) {
    return res.status(400).json({ error: 'Invalid state' });
  }

  setUpdaterStatus({
    state: body.state as Parameters<typeof setUpdaterStatus>[0]['state'],
    version: body.version,
    currentVersion: body.currentVersion,
    percent: body.percent,
    bytesPerSecond: body.bytesPerSecond,
    error: body.error,
    isElectron: true,
  });

  res.json({ ok: true });
}
