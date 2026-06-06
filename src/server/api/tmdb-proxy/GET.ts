/**
 * GET /api/tmdb-proxy?url=<encoded-image-url>
 *
 * Server-side proxy for poster image CDNs.
 * Fetches the image server-side and streams it back, bypassing any
 * browser-level CORS or mixed-content restrictions.
 *
 * Allowed hosts:
 *   - image.tmdb.org       — TMDB poster/backdrop CDN
 *   - images.metahub.space — Cinemeta/Stremio poster CDN
 *
 * No auth required (images are public).
 */
import type { Request, Response } from 'express';
import https from 'https';

const ALLOWED_HOSTS = new Set(['image.tmdb.org', 'images.metahub.space']);
const TIMEOUT_MS = 10_000;

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
    proxyRes.pipe(res);
  });

  proxyReq.setTimeout(TIMEOUT_MS, () => {
    proxyReq.destroy();
    if (!res.headersSent) res.status(504).json({ error: 'Upstream timeout' });
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) res.status(502).json({ error: String(err.message) });
  });

  proxyReq.end();
}
