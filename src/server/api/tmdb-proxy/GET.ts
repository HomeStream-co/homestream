/**
 * GET /api/tmdb-proxy?url=<encoded-image-url>
 *
 * Server-side proxy for poster image CDNs.
 * Fetches the image server-side and streams it back, caching it locally
 * on first fetch to bypass browser-level CORS, mixed-content, or VPN blocks.
 *
 * Allowed hosts:
 *   - image.tmdb.org       — TMDB poster/backdrop CDN
 *   - images.metahub.space — Cinemeta/Stremio poster CDN
 *
 * No auth required (images are public).
 */
import type { Request, Response } from 'express';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { dataDir } from '../../dataDir.js';

const ALLOWED_HOSTS = new Set(['image.tmdb.org', 'images.metahub.space']);
const TIMEOUT_MS = 10_000;
const LOCAL_IMG_DIR = path.join(dataDir(), 'tmdb-images');

// Ensure image directory exists
if (!fs.existsSync(LOCAL_IMG_DIR)) {
  fs.mkdirSync(LOCAL_IMG_DIR, { recursive: true });
}

export default function handler(req: Request, res: Response) {
  const rawUrl = req.query.url as string | undefined;

  if (!rawUrl) {
    res.status(400).json({ error: 'url query param required' });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    res.status(403).json({ error: `Host not allowed: ${parsed.hostname}` });
    return;
  }

  // Generate hash for disk caching
  let hash: string | null = null;
  if (parsed.hostname === 'image.tmdb.org') {
    const match = parsed.pathname.match(/^\/t\/p\/(w500|original)(\/.*)$/);
    if (match) {
      const size = match[1];
      const tmdbPath = match[2];
      hash = crypto.createHash('md5').update(tmdbPath + size).digest('hex').slice(0, 12);
    }
  } else if (parsed.hostname === 'images.metahub.space') {
    hash = crypto.createHash('md5').update(parsed.pathname).digest('hex').slice(0, 12);
  }

  const localFile = hash ? path.join(LOCAL_IMG_DIR, `${hash}.jpg`) : null;

  // Serve from cache if present
  if (localFile && fs.existsSync(localFile)) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    fs.createReadStream(localFile).pipe(res);
    return;
  }

  const options = {
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: {
      'User-Agent': 'HomeStream/1.5',
      Accept: 'image/webp,image/jpeg,image/*',
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const contentType = proxyRes.headers['content-type'] ?? 'image/jpeg';
    const cacheControl = proxyRes.headers['cache-control'] ?? 'public, max-age=86400';

    if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
      res.status(proxyRes.statusCode).json({ error: 'Image not found on TMDB CDN' });
      proxyRes.resume();
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(proxyRes.statusCode ?? 200);

    // If cacheable, stream to file and response
    if (localFile) {
      const tmpFile = localFile + '.tmp';
      const fileStream = fs.createWriteStream(tmpFile);

      proxyRes.on('data', (chunk) => {
        fileStream.write(chunk);
        res.write(chunk);
      });

      proxyRes.on('end', () => {
        fileStream.end(() => {
          try {
            fs.renameSync(tmpFile, localFile);
          } catch (err) {
            console.error('[tmdb-proxy] Failed to rename temp file to local cache:', err);
            try { fs.unlinkSync(tmpFile); } catch {}
          }
        });
        res.end();
      });

      proxyRes.on('error', (err) => {
        fileStream.end();
        try { fs.unlinkSync(tmpFile); } catch {}
        if (!res.headersSent) res.status(502).json({ error: String(err.message) });
      });
    } else {
      proxyRes.pipe(res);
    }
  });

  proxyReq.setTimeout(TIMEOUT_MS, () => {
    proxyReq.destroy();
    if (!res.headersSent) res.status(504).json({ error: 'Upstream timeout' });
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) res.status(502).json({ error: String(err.message) });
  });

  res.on('close', () => {
    proxyReq.destroy();
  });

  proxyReq.end();
}
