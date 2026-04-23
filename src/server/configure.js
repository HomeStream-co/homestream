import express from "express";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import zlib from "node:zlib";

// Install console capture FIRST — before anything else logs — so we
// capture all startup output for GET /api/dev/logs remote diagnostics.
import('./consoleCapture.js').then(({ installConsoleCapture }) => {
  installConsoleCapture();
}).catch(() => {});

// Install process-level crash handlers as early as possible so even
// errors during startup are captured to the persistent crash log.
import('./crashLogger.js').then(({ installCrashHandlers }) => {
  installCrashHandlers();
}).catch(err => {
  process.stderr.write(`[configure] Failed to install crash handlers: ${err}\n`);
});

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve the directory where the built client files (index.html, assets/) live.
//
// Layout differences between environments:
//   Dev / cloud (vite-plugin-api-routes):
//     Server entry: dist/app.js  →  __dirname = dist/
//     Client files: dist/index.html, dist/assets/  →  join(__dirname, '.')
//
//   Packaged Electron (.exe):
//     Server bundle: resources/server/server.bundle.mjs
//     Client files:  resources/client/index.html, resources/client/assets/
//     (copied there by extraResources in electron-builder.yml)
//
// We detect the Electron case via the ELECTRON env var injected by main.js.
function resolveClientDir() {
  if (process.env.ELECTRON === '1' && process.env.ELECTRON_RESOURCES_PATH) {
    return join(process.env.ELECTRON_RESOURCES_PATH, 'client');
  }
  // Dev/cloud: client files are in the same dist/ directory as app.js
  return __dirname;
}
const CLIENT_DIR = resolveClientDir();

/**
 * Lightweight gzip middleware for JSON API responses.
 * Skips video streams (handled separately with range requests).
 * Skips SSE endpoints (Content-Type: text/event-stream).
 */
function gzipMiddleware(req, res, next) {
  const acceptEncoding = req.headers["accept-encoding"] ?? "";
  if (!acceptEncoding.includes("gzip")) return next();

  const path = req.path;
  if (path.startsWith("/api/stream/") || path.startsWith("/api/transcode/")) return next();

  const originalJson = res.json.bind(res);
  res.json = function (body) {
    const json = JSON.stringify(body);
    const buf = Buffer.from(json, 'utf-8');

    if (buf.length < 1024) return originalJson(body);

    zlib.gzip(buf, (err, compressed) => {
      if (err) return originalJson(body);
      // Only set gzip headers if response hasn't already started
      if (res.headersSent) return;
      res.set({
        'Content-Encoding': 'gzip',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': compressed.length,
        Vary: 'Accept-Encoding',
      });
      res.end(compressed);
    });
    return res;
  };

  next();
}

// ── Vite dev server hooks ──────────────────────────────────────────────────

export const viteServerBefore = (server, _viteServer) => {
  console.log('[HomeStream] Dev server starting...');

  // Seed ownership on dev server too so local testing reflects production behaviour
  import('./ownershipSeed.js').then(({ runOwnershipSeed }) => {
    runOwnershipSeed().catch(err => {
      console.warn('[ownership] Dev seed failed (non-fatal):', err.message);
    });
  }).catch(() => {});

  server.use(cookieParser());
  server.use(express.json({ limit: '50mb' }));
  server.use(express.urlencoded({ extended: true, limit: '50mb' }));
};

export const viteServerAfter = (_server, _viteServer) => {};

// ── Production server hooks ────────────────────────────────────────────────

export const serverBefore = (server) => {
  // Developer ownership seed — runs before any request is served.
  // Seeds admin password + API keys from platform secrets on first boot.
  import('./ownershipSeed.js').then(({ runOwnershipSeed }) => {
    runOwnershipSeed().catch(err => {
      console.warn('[ownership] Seed failed (non-fatal):', err.message);
    });
  }).catch(err => {
    console.warn('[ownership] Could not load ownershipSeed (non-fatal):', err.message);
  });

  // Startup cleanup: reset any items stuck with transcoding:true
  import('./startupCleanup.js').then(({ runStartupCleanup }) => {
    runStartupCleanup();
  }).catch(err => {
    console.error('[startup] Cleanup failed:', err.message);
  });

  // Resume folder watcher if setup was already completed before this restart
  import('./configStore.js').then(({ isSetupComplete, readConfig }) => {
    if (!isSetupComplete()) return;
    const cfg = readConfig();
    if (cfg.watchFolderEnabled && cfg.downloadsDir) {
      import('./folderWatcher.js').then(({ startWatcher }) => {
        startWatcher(cfg.downloadsDir);
        console.log(`[startup] Folder watcher resumed → ${cfg.downloadsDir}`);
      }).catch(err => console.warn('[startup] Folder watcher failed to resume:', err.message));
    }
  }).catch(err => console.warn('[startup] Config read failed:', err.message));

  // Start Jellyfin UDP discovery so TV apps can find HomeStream automatically
  import('./jellyfinDiscovery.js').then(({ startJellyfinDiscovery }) => {
    const port = parseInt(process.env.PORT || '3000');
    startJellyfinDiscovery(port);
  }).catch(err => {
    console.warn('[jellyfin-discovery] Failed to start (non-fatal):', err.message);
  });

  // Start episode auto-download scheduler
  import('./episodeScheduler.js').then(({ scheduleAllSubscriptions }) => {
    scheduleAllSubscriptions();
  }).catch(err => {
    console.warn('[scheduler] Failed to start (non-fatal):', err.message);
  });

  // Start scheduled download queue engine (user-defined future downloads)
  import('./scheduledDownloads.js').then(({ startScheduler }) => {
    startScheduler();
  }).catch(err => {
    console.warn('[scheduled-downloads] Failed to start (non-fatal):', err.message);
  });

  // Start VPN kill-switch monitor (pauses torrents if VPN drops)
  import('./vpnKillSwitch.js').then(({ startVpnKillSwitch }) => {
    startVpnKillSwitch();
  }).catch(err => {
    console.warn('[vpn-killswitch] Failed to start (non-fatal):', err.message);
  });

  // Start mDNS so users can access HomeStream at homestream.local
  import('./mdnsService.js').then(({ startMDNS }) => {
    const port = parseInt(process.env.PORT || '3000');
    startMDNS(port);
  }).catch(err => {
    console.warn('[mdns] Failed to start (non-fatal):', err.message);
  });

  const shutdown = async (signal) => {
    console.log(`Got ${signal}, shutting down gracefully...`);
    // Clean up HLS temp segments so /tmp doesn't accumulate across restarts
    try {
      const { stopAllHlsJobs, HLS_BASE_DIR } = await import('./hlsTranscoder.js');
      stopAllHlsJobs();
      const fs = await import('node:fs');
      if (fs.existsSync(HLS_BASE_DIR)) {
        fs.rmSync(HLS_BASE_DIR, { recursive: true, force: true });
        console.log('[hls] Cleaned up temp segments on shutdown');
      }
    } catch (err) {
      console.warn('[hls] Cleanup on shutdown failed (non-fatal):', err.message);
    }
    process.exit(0);
  };

  ["SIGTERM", "SIGINT"].forEach((signal) => {
    process.once(signal, shutdown);
  });

  server.use(cookieParser());
  server.use(express.json({ limit: '50mb' }));
  server.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Gzip compression for API JSON responses
  server.use(gzipMiddleware);

  // ── Security headers ──────────────────────────────────────────────────────
  // HomeStream is a local-network app — CSP is permissive for LAN IPs and
  // localhost, but still blocks obvious XSS vectors.
  server.use((req, res, next) => {
    // Only apply security headers to HTML page responses.
    // API routes and media streams handle their own headers.
    const isApi = req.path.startsWith('/api');
    const isMedia = req.path.startsWith('/api/stream/') || req.path.startsWith('/api/hls/') || req.path.startsWith('/api/transcode/');
    if (!isApi && !isMedia) {
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        // Permissive CSP for local network — allows LAN IPs, localhost.
        // All TMDB poster/backdrop images are served locally from /tmdb-images/
        // so no external image.tmdb.org origin is needed.
        // connect-src still allows api.themoviedb.org for metadata fetches.
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Vite HMR needs unsafe-eval in dev
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data: blob:",
          "media-src 'self' blob:",
          "connect-src 'self' ws: wss: https://api.themoviedb.org https://torrentio.strem.fun",
          // Allow YouTube privacy-enhanced embeds for trailers
          "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
          "frame-ancestors 'none'",
        ].join('; '),
      });
    }
    next();
  });

  server.use(express.static(CLIENT_DIR, {
    setHeaders(res, filePath) {
      res.set("Cache-Control", filePath.includes("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache");
    }
  }));

  server.use((req, res, next) => {
    res.set("Cache-Control", "no-cache");
    next();
  });
};

export const serverAfter = (server) => {
  // ── API 404 handler ────────────────────────────────────────────────────────
  // Any /api/* route that wasn't matched by a real handler returns a clean JSON
  // 404 instead of silently falling through to the SPA and returning index.html
  // with a 200 — which would confuse the client and hide typos in fetch URLs.
  server.use('/api', (req, res) => {
    res.status(404).json({
      error: 'API endpoint not found',
      method: req.method,
      path: req.path,
    });
  });

  // ── SPA fallback ───────────────────────────────────────────────────────────
  server.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api')) return next();
    if (extname(req.path)) return next();
    res.sendFile(join(CLIENT_DIR, 'index.html'));
  });

  const errorHandler = (err, req, res, next) => {
    if (err instanceof Error) {
      // Log to persistent crash log so it shows up in the Debug Panel
      import('./crashLogger.js').then(({ logCrash }) => {
        logCrash('expressError', err, `${req.method} ${req.path}`);
      }).catch(() => {});
      res.status(500).json({ error: err.message });
    } else {
      next(err);
    }
  };
  server.use(errorHandler);
};

export const serverListening = (server) => {
  // Attach WebSocket remote control server once HTTP server is listening
  import('./remoteControl.js').then(({ attachRemoteControl }) => {
    attachRemoteControl(server);
    console.log('[remote] WebSocket remote control attached at /ws/remote');
  }).catch(err => {
    console.warn('[remote] Failed to attach remote control (non-fatal):', err.message);
  });
};
