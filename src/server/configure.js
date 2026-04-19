import express from "express";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import zlib from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));

function normalizeCommerceApiBaseUrlEnv() {
  if (process.env.GODADDY_API_BASE_URL) return;
  const hostOnly = process.env.VITE_GODADDY_API_HOST;
  if (!hostOnly) return;
  const normalizedHost = hostOnly.replace(/^https?:\/\//, "").trim();
  if (!normalizedHost) return;
  process.env.GODADDY_API_BASE_URL = `https://${normalizedHost}`;
}

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
    const buf = Buffer.from(json, "utf-8");

    if (buf.length < 1024) return originalJson(body);

    zlib.gzip(buf, (err, compressed) => {
      if (err) return originalJson(body);
      res.set({
        "Content-Encoding": "gzip",
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": compressed.length,
        Vary: "Accept-Encoding",
      });
      res.end(compressed);
    });
    return res;
  };

  next();
}

// ── Vite dev server hooks ──────────────────────────────────────────────────

export const viteServerBefore = (server, _viteServer) => {
  console.log("VITEJS SERVER");
  normalizeCommerceApiBaseUrlEnv();
  server.use(cookieParser());
  server.use(express.json({ limit: '50mb' }));
  server.use(express.urlencoded({ extended: true, limit: '50mb' }));
};

export const viteServerAfter = (_server, _viteServer) => {};

// ── Production server hooks ────────────────────────────────────────────────

export const serverBefore = (server) => {
  normalizeCommerceApiBaseUrlEnv();

  // Startup cleanup: reset any items stuck with transcoding:true
  import('./startupCleanup.js').then(({ runStartupCleanup }) => {
    runStartupCleanup();
  }).catch(err => {
    console.error('[startup] Cleanup failed:', err.message);
  });

  // Auto-seed demo item (Big Buck Bunny) so it always appears as a
  // clickable card in the library — idempotent, skips if already present.
  import('./libraryStore.js').then(({ readLibrary, writeLibrary }) => {
    const library = readLibrary();
    if (library.find(m => m.id === 'demo-bbb')) return;
    const demoItem = {
      id: 'demo-bbb',
      title: 'Big Buck Bunny',
      type: 'movie',
      year: '2008',
      filename: '__demo__big-buck-bunny.mp4',
      filePath: '__demo__',
      demoStreamUrl: 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
      poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/800px-Big_buck_bunny_poster_big.jpg',
      backdrop: 'https://peach.blender.org/wp-content/uploads/bbb-splash.png',
      plot: 'A large and lovable rabbit deals with three bullying rodents who want to steal his berries. Freely licensed under Creative Commons by the Blender Foundation.',
      rating: 'G',
      imdbRating: '7.8',
      genre: ['Animation', 'Short', 'Comedy'],
      runtime: '9 min',
      director: 'Sacha Goedegebure',
      actors: ['Big Buck Bunny'],
      transcoding: false,
      watchProgress: 0,
      profileProgress: { adult: 0, kids: 0 },
      isDemo: true,
      importedFrom: 'demo',
      addedAt: new Date().toISOString(),
    };
    writeLibrary(lib => { lib.unshift(demoItem); return lib; })
      .then(() => console.log('[demo] Big Buck Bunny seeded into library'))
      .catch(err => console.warn('[demo] Seed failed (non-fatal):', err.message));
  }).catch(err => {
    console.warn('[demo] Could not seed demo item (non-fatal):', err.message);
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

  // Start mDNS so users can access HomeStream at homestream.local
  import('./mdnsService.js').then(({ startMDNS }) => {
    const port = parseInt(process.env.PORT || '3000');
    startMDNS(port);
  }).catch(err => {
    console.warn('[mdns] Failed to start (non-fatal):', err.message);
  });

  const shutdown = async (signal) => {
    console.log(`Got ${signal}, shutting down gracefully...`);
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

  server.use(express.static(join(__dirname, "client"), {
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
  server.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api')) return next();
    if (extname(req.path)) return next();
    res.sendFile(join(__dirname, 'client', 'index.html'));
  });

  const errorHandler = (err, req, res, next) => {
    if (err instanceof Error) {
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

  // Auto-seed demo item so Big Buck Bunny always appears as a clickable
  // card in the library for player testing — idempotent, skips if already present.
  import('./libraryStore.js').then(({ readLibrary, writeLibrary }) => {
    const library = readLibrary();
    if (library.find(m => m.id === 'demo-bbb')) return; // already seeded

    const demoItem = {
      id: 'demo-bbb',
      title: 'Big Buck Bunny',
      type: 'movie',
      year: '2008',
      filename: '__demo__big-buck-bunny.mp4',
      filePath: '__demo__',
      demoStreamUrl: 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
      poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/800px-Big_buck_bunny_poster_big.jpg',
      backdrop: 'https://peach.blender.org/wp-content/uploads/bbb-splash.png',
      plot: 'A large and lovable rabbit deals with three bullying rodents who want to steal his berries. Freely licensed under Creative Commons by the Blender Foundation.',
      rating: 'G',
      imdbRating: '7.8',
      genre: ['Animation', 'Short', 'Comedy'],
      runtime: '9 min',
      director: 'Sacha Goedegebure',
      actors: ['Big Buck Bunny'],
      transcoding: false,
      watchProgress: 0,
      profileProgress: { adult: 0, kids: 0 },
      isDemo: true,
      importedFrom: 'demo',
      addedAt: new Date().toISOString(),
    };

    writeLibrary(lib => { lib.unshift(demoItem); return lib; })
      .then(() => console.log('[demo] Big Buck Bunny seeded into library'))
      .catch(err => console.warn('[demo] Seed failed (non-fatal):', err.message));
  }).catch(err => {
    console.warn('[demo] Could not import libraryStore (non-fatal):', err.message);
  });
};
