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
  server.use(express.json());
  server.use(express.urlencoded({ extended: true }));
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

  const shutdown = async (signal) => {
    console.log(`Got ${signal}, shutting down gracefully...`);
    try {
      const dbClient = "./db/client" + ".js";
      const { closeConnection } = await import(dbClient);
      await closeConnection();
      console.log("Database connections closed");
    } catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND') {
        console.error("Error during database shutdown:", error.message);
      }
    }
    process.exit(0);
  };

  ["SIGTERM", "SIGINT"].forEach((signal) => {
    process.once(signal, shutdown);
  });

  server.use(cookieParser());
  server.use(express.json());
  server.use(express.urlencoded({ extended: true }));

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
