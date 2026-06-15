import express from "express";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { existsSync } from "node:fs";
import { dataDir } from "./dataDir.js";
import zlib from "node:zlib";
import type { Server } from "node:http";
import type { ViteDevServer } from "vite";

// Install console capture FIRST — before anything else logs — so we
// capture all startup output for GET /api/dev/logs remote diagnostics.
import('./consoleCapture.js').then(({ installConsoleCapture }) => {
  installConsoleCapture();
}).catch(() => {});

// Install process-level crash handlers as early as possible so even
// errors during startup are captured to the persistent crash log.
import('./crashLogger.js').then(({ installCrashHandlers }) => {
  installCrashHandlers();
}).catch((err: Error) => {
  process.stderr.write(`[configure] Failed to install crash handlers: ${err}\n`);
});

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveClientDir() {
  if (process.env.ELECTRON === '1' && process.env.ELECTRON_RESOURCES_PATH) {
    return join(process.env.ELECTRON_RESOURCES_PATH, 'client');
  }
  return __dirname;
}
const CLIENT_DIR = resolveClientDir();

function gzipMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const acceptEncoding = req.headers["accept-encoding"] ?? "";
  if (!acceptEncoding.includes("gzip")) return next();

  const p = req.path;
  if (p.startsWith("/api/stream/") || p.startsWith("/api/transcode/")) return next();

  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    const json = JSON.stringify(body);
    const buf = Buffer.from(json, 'utf-8');
    if (buf.length < 1024) return originalJson(body);
    zlib.gzip(buf, (err, compressed) => {
      if (err) return originalJson(body);
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

export const viteServerBefore = (server: express.Express, _viteServer: ViteDevServer) => {
  console.log('[HomeStream] Dev server starting...');
  server.use('/tmdb-images', express.static(join(dataDir(), 'tmdb-images')));

  import('./configStore.js').then(({ detectAndSyncProwlarrApiKey }) => {
    detectAndSyncProwlarrApiKey();
  }).catch((err: Error) => console.warn('[startup] Prowlarr key sync failed in dev:', err.message));

  import('./ownershipSeed.js').then(({ runOwnershipSeed }) => {
    runOwnershipSeed().catch((err: Error) => {
      console.warn('[ownership] Dev seed failed (non-fatal):', err.message);
    });
  }).catch(() => {});
  server.use(cookieParser());
  server.use(express.json({ limit: '50mb' }));
  server.use(express.urlencoded({ extended: true, limit: '50mb' }));
};

export const viteServerAfter = (_server: express.Express, _viteServer: ViteDevServer) => {};

// ── Production server hooks ────────────────────────────────────────────────

export const serverBefore = (server: express.Express) => {
  import('./ownershipSeed.js').then(({ runOwnershipSeed }) => {
    runOwnershipSeed().catch((err: Error) => {
      console.warn('[ownership] Seed failed (non-fatal):', err.message);
    });
  }).catch((err: Error) => {
    console.warn('[ownership] Could not load ownershipSeed (non-fatal):', err.message);
  });

  import('./startupCleanup.js').then(({ runStartupCleanup }) => {
    runStartupCleanup();
  }).catch((err: Error) => {
    console.error('[startup] Cleanup failed:', err.message);
  });

  import('./configStore.js').then(({ isSetupComplete, readConfig, detectAndSyncProwlarrApiKey }) => {
    if (!isSetupComplete()) return;
    detectAndSyncProwlarrApiKey();
    const cfg = readConfig();
    if (cfg.watchFolderEnabled && cfg.downloadsDir) {
      import('./folderWatcher.js').then(({ startWatcher }) => {
        startWatcher(cfg.downloadsDir!);
        console.log(`[startup] Folder watcher resumed → ${cfg.downloadsDir}`);
      }).catch((err: Error) => console.warn('[startup] Folder watcher failed to resume:', err.message));
    }
  }).catch((err: Error) => console.warn('[startup] Config read failed:', err.message));

  import('./jellyfinDiscovery.js').then(({ startJellyfinDiscovery }) => {
    const port = parseInt(process.env.PORT || '3000');
    startJellyfinDiscovery(port);
  }).catch((err: Error) => {
    console.warn('[jellyfin-discovery] Failed to start (non-fatal):', err.message);
  });

  import('./episodeScheduler.js').then(({ scheduleAllSubscriptions }) => {
    scheduleAllSubscriptions();
  }).catch((err: Error) => {
    console.warn('[scheduler] Failed to start (non-fatal):', err.message);
  });

  import('./scheduledDownloads.js').then(({ startScheduler }) => {
    startScheduler();
  }).catch((err: Error) => {
    console.warn('[scheduled-downloads] Failed to start (non-fatal):', err.message);
  });

  import('./vpnKillSwitch.js').then(({ startVpnKillSwitch }) => {
    startVpnKillSwitch();
  }).catch((err: Error) => {
    console.warn('[vpn-killswitch] Failed to start (non-fatal):', err.message);
  });

  import('./mdnsService.js').then(({ startMDNS }) => {
    const port = parseInt(process.env.PORT || '3000');
    startMDNS(port);
  }).catch((err: Error) => {
    console.warn('[mdns] Failed to start (non-fatal):', err.message);
  });

  const shutdown = async (signal: string) => {
    console.log(`Got ${signal}, shutting down gracefully...`);
    try {
      const { stopAllHlsJobs, HLS_BASE_DIR } = await import('./hlsTranscoder.js');
      stopAllHlsJobs();
      const fs = await import('node:fs');
      if (fs.existsSync(HLS_BASE_DIR)) {
        fs.rmSync(HLS_BASE_DIR, { recursive: true, force: true });
        console.log('[hls] Cleaned up temp segments on shutdown');
      }
    } catch (err) {
      console.warn('[hls] Cleanup on shutdown failed (non-fatal):', (err as Error).message);
    }
    process.exit(0);
  };

  ["SIGTERM", "SIGINT"].forEach((signal) => {
    process.once(signal, () => shutdown(signal));
  });

  server.use(cookieParser());
  server.use(express.json({ limit: '50mb' }));
  server.use(express.urlencoded({ extended: true, limit: '50mb' }));
  server.use(gzipMiddleware);
  server.use('/tmdb-images', express.static(join(dataDir(), 'tmdb-images')));

  server.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const isApi = req.path.startsWith('/api');
    const isMedia = req.path.startsWith('/api/stream/') || req.path.startsWith('/api/hls/') || req.path.startsWith('/api/transcode/');
    if (!isApi && !isMedia) {
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': [
          'autoplay=(self)', 'fullscreen=(self)', 'picture-in-picture=(self)',
          'camera=()', 'microphone=()', 'geolocation=()', 'payment=()',
          'usb=()', 'bluetooth=()', 'serial=()', 'ambient-light-sensor=()',
          'accelerometer=()', 'gyroscope=()', 'magnetometer=()',
        ].join(', '),
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data: blob:",
          "media-src 'self' blob:",
          "connect-src 'self' ws: wss: https://api.themoviedb.org https://torrentio.strem.fun",
          "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
          "frame-ancestors 'none'",
        ].join('; '),
      });
    }
    next();
  });

  if (existsSync(CLIENT_DIR)) {
    server.use(express.static(CLIENT_DIR, {
      setHeaders(res: express.Response, filePath: string) {
        res.set("Cache-Control", filePath.includes("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache");
      }
    }));
  }

  server.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.set("Cache-Control", "no-cache");
    next();
  });
};

export const serverAfter = (server: express.Express) => {
  server.use('/api', (req: express.Request, res: express.Response) => {
    res.status(404).json({ error: 'API endpoint not found', method: req.method, path: req.path });
  });

  server.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api')) return next();
    if (req.path.startsWith('/ws/')) return next();
    if (extname(req.path)) return next();
    const indexPath = join(CLIENT_DIR, 'index.html');
    if (!existsSync(indexPath)) return next();
    res.sendFile(indexPath);
  });

  const errorHandler = (err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const isDevIndexMissing =
      (err as NodeJS.ErrnoException).code === 'ENOENT' &&
      err.message?.includes('index.html') &&
      process.env.NODE_ENV !== 'production';
    if (!isDevIndexMissing) {
      import('./crashLogger.js').then(({ logCrash }) => {
        logCrash('expressError', err, `${req.method} ${req.path}`);
      }).catch(() => {});
    }
    res.status(500).json({ error: err.message });
  };
  server.use(errorHandler);
};

export const serverListening = (server: Server) => {
  import('./remoteControl.js').then(({ attachRemoteControl }) => {
    attachRemoteControl(server);
    console.log('[remote] WebSocket remote control attached at /ws/remote');
  }).catch((err: Error) => {
    console.warn('[remote] Failed to attach remote control (non-fatal):', err.message);
  });

  import('./downloadBroadcaster.js').then(({ attachDownloadBroadcaster }) => {
    attachDownloadBroadcaster(server);
  }).catch((err: Error) => {
    console.warn('[downloads-ws] Failed to attach download broadcaster (non-fatal):', err.message);
  });

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  setInterval(() => {
    import('./startupCleanup.js').then(({ runHlsPeriodicCleanup }) => {
      runHlsPeriodicCleanup();
    }).catch(() => { /* non-fatal */ });
  }, SIX_HOURS_MS);
};
