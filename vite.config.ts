import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { readFileSync } from "fs";

function getAppVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as {version?: string;};
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
import react from "@vitejs/plugin-react";
import path from "path";
import sourceMapperPlugin from "./source-mapper/src/index";
import { devToolsPlugin } from "./dev-tools/src/vite-plugin";
import { fullStoryPlugin } from "./fullstory-plugin";
import { errorInterceptorPlugin } from "./dev-tools/src/vite-error-interceptor";
import { mediaVersionsPlugin } from "./dev-tools/src/vite-media-versions-plugin";

function extractHostname(value: string): string {
  try {
    if (value.includes("://")) {
      return new URL(value).hostname;
    }
    return value;
  } catch {
    return value;
  }
}

function apiDevPlugin(): Plugin {
  return {
    name: "api-dev",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api")) return next();
        try {
          const mod = await server.ssrLoadModule("/src/server/entry.ts");
          const handler = mod.default;
          handler(req, res, next);
        } catch (err) {
          if (err instanceof Error) server.ssrFixStacktrace(err);
          next(err);
        }
      });
    }
  };
}

const allowedHosts: string[] = [];
const corsOrigins: string[] = [];

if (process.env.FRONTEND_DOMAIN) {
  const frontendHost = extractHostname(process.env.FRONTEND_DOMAIN);
  allowedHosts.push(frontendHost);
  corsOrigins.push(`http://${frontendHost}`, `https://${frontendHost}`);
}
if (process.env.ALLOWED_ORIGINS) {
  const origins = process.env.ALLOWED_ORIGINS.split(",");
  allowedHosts.push(...origins.map(extractHostname));
  corsOrigins.push(...origins);
}
if (process.env.VITE_PARENT_ORIGIN) {
  allowedHosts.push(extractHostname(process.env.VITE_PARENT_ORIGIN));
  corsOrigins.push(process.env.VITE_PARENT_ORIGIN);
}
if (allowedHosts.length === 0) {
  allowedHosts.push("*");
}
if (corsOrigins.length === 0) {
  corsOrigins.push("*");
}

export default defineConfig(({ mode, isSsrBuild }) => ({
  envPrefix: ["VITE_", "SITE_"],

  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion())
  },

  plugins: [
  react({
    babel: {
      plugins: [sourceMapperPlugin]
    }
  }),
  apiDevPlugin(),
  ...(mode === "development" ?
  [
  devToolsPlugin() as Plugin,
  fullStoryPlugin(),
  errorInterceptorPlugin(),
  mediaVersionsPlugin() as Plugin] :

  [])],


  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
    alias: {
      nothing: "/src/fallbacks/missingModule.ts",
      "@/api": path.resolve(__dirname, "./src/server/api"),
      "@": path.resolve(__dirname, "./src"),
      "bufferutil": path.resolve(__dirname, "./src/server/dummy-ws-native.js"),
      "utf-8-validate": path.resolve(__dirname, "./src/server/dummy-ws-native.js")
    }
  },

  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom"], exclude: ["drizzle-orm", "mysql2"]
  },

  ssr: {
    // ── Production build (Rollup) ─────────────────────────────────────────────
    // Bundle ALL npm packages into server.bundle.cjs so Electron doesn't need
    // to ship node_modules. noExternal regex covers every non-Node-builtin.
    // Node built-ins (node:*, fs, path, …) are always kept external by Vite.
    // noExternal: true is NOT used — it inlines the 'module' built-in which
    // causes duplicate symbol errors during esbuild transpilation.
    //
    // ── Dev mode (ssrLoadModule / Vite ESM runner) ────────────────────────────
    // noExternal tells Vite to inline packages as ESM. CJS packages that use
    // `module.exports = …` (express, ws, multer, cookie-parser, …) crash with
    // "module is not defined" when inlined. In dev we keep them external so
    // Node's native require() handles them — Vite's CJS interop wraps them
    // correctly. noExternal still applies for the prod Rollup build.
    ...(process.env.NODE_ENV === 'production'
      ? { 
          noExternal: /^(?!node:).+/
        }
      : {
          // Keep CJS-only packages external in dev so Vite doesn't try to
          // inline them through its ESM runner.
          external: [
            'express',
            'ws',
            'multer',
            'cookie-parser',
            'cors',
            'compression',
            'morgan',
            'helmet',
            'qrcode',
            'fluent-ffmpeg',
            'ffmpeg-static',
            'ffprobe-static',
            'node-cron',
            'chokidar',
            'archiver',
            'form-data',
            'node-fetch',
            'better-sqlite3',
            'drizzle-orm',
            'mysql2',
          ],
        }
    ),
  },

  server: {
    host: process.env.HOST || "0.0.0.0",
    port: parseInt(process.env.PORT || "5173"),
    strictPort: !!process.env.PORT,
    allowedHosts,
    cors: {
      origin: corsOrigins,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept", "User-Agent"]
    },
    hmr: {
      overlay: false
    },
    watch: {
      ignored: ["**/dist/**"]
    }
  },

  preview: {
    host: process.env.HOST || "0.0.0.0",
    port: parseInt(process.env.PORT || "5173"),
    strictPort: !!process.env.PORT,
    allowedHosts,
    cors: {
      origin: corsOrigins,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept", "User-Agent"]
    }
  },

  build: isSsrBuild ?
  {
    outDir: "dist",
    emptyOutDir: false,
    copyPublicDir: false,
    ssr: "src/server/entry.ts",
    resolve: {
      alias: {
        'bufferutil': path.resolve(__dirname, 'src/server/dummy-ws-native.js'),
        'utf-8-validate': path.resolve(__dirname, 'src/server/dummy-ws-native.js')
      }
    },
    rollupOptions: {
      output: {
        // CJS format + .cjs extension — electron-builder and the smoke-test
        // both expect dist/server/server.bundle.cjs.
        format: "cjs",
        entryFileNames: "server/server.bundle.cjs",
        chunkFileNames: "server/bin/[name]-[hash].cjs"
      }
    }
  } :
  {
    outDir: "dist/client",
    emptyOutDir: true,
    copyPublicDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "radix-ui": [
          "@radix-ui/react-accordion",
          "@radix-ui/react-alert-dialog",
          "@radix-ui/react-aspect-ratio",
          "@radix-ui/react-avatar",
          "@radix-ui/react-checkbox",
          "@radix-ui/react-collapsible",
          "@radix-ui/react-context-menu",
          "@radix-ui/react-dialog",
          "@radix-ui/react-dropdown-menu",
          "@radix-ui/react-hover-card",
          "@radix-ui/react-label",
          "@radix-ui/react-menubar",
          "@radix-ui/react-navigation-menu",
          "@radix-ui/react-popover",
          "@radix-ui/react-progress",
          "@radix-ui/react-scroll-area",
          "@radix-ui/react-select",
          "@radix-ui/react-separator",
          "@radix-ui/react-slider",
          "@radix-ui/react-slot",
          "@radix-ui/react-switch",
          "@radix-ui/react-tabs",
          "@radix-ui/react-toast",
          "@radix-ui/react-toggle",
          "@radix-ui/react-toggle-group",
          "@radix-ui/react-tooltip"],

          query: ["@tanstack/react-query"]
        }
      }
    }
  }
}));