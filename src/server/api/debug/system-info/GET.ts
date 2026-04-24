/**
 * GET /api/debug/system-info
 *
 * Returns live runtime statistics for the Debug Panel's System Info tab.
 * All values are read from Node.js built-ins — no disk I/O, fast response.
 *
 * Response shape:
 * {
 *   node:     string          // Node.js version
 *   platform: string          // 'win32' | 'linux' | 'darwin'
 *   arch:     string          // 'x64' | 'arm64' etc.
 *   uptime:   number          // process uptime in seconds
 *   memory: {
 *     heapUsedMb:  number
 *     heapTotalMb: number
 *     rssMb:       number
 *     externalMb:  number
 *     freeMb:      number     // OS free memory
 *     totalMb:     number     // OS total memory
 *   }
 *   cpu: {
 *     model:  string
 *     cores:  number
 *     loadAvg: number[]       // 1/5/15 min (empty on Windows)
 *   }
 *   env:      string          // 'production' | 'development'
 *   pid:      number
 * }
 */

import type { Request, Response } from 'express';
import os from 'os';
import { requireAuth } from '../../../authMiddleware.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  try {
    const mem = process.memoryUsage();
    const cpus = os.cpus();

    res.json({
      node:     process.version,
      platform: os.platform(),
      arch:     os.arch(),
      uptime:   Math.floor(process.uptime()),
      memory: {
        heapUsedMb:  +(mem.heapUsed  / 1_048_576).toFixed(1),
        heapTotalMb: +(mem.heapTotal / 1_048_576).toFixed(1),
        rssMb:       +(mem.rss       / 1_048_576).toFixed(1),
        externalMb:  +(mem.external  / 1_048_576).toFixed(1),
        freeMb:      +(os.freemem()  / 1_048_576).toFixed(0),
        totalMb:     +(os.totalmem() / 1_048_576).toFixed(0),
      },
      cpu: {
        model:   cpus[0]?.model ?? 'Unknown',
        cores:   cpus.length,
        loadAvg: os.loadavg(),   // [0,0,0] on Windows — fine to show
      },
      env: process.env.NODE_ENV ?? 'development',
      pid: process.pid,
    });
  } catch (err) {
    console.error('[debug/system-info] Error reading system info:', err);
    res.status(500).json({ error: 'Failed to read system info' });
  }
}
