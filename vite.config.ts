import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import * as esbuild from "esbuild";
import apiRoutes from "vite-plugin-api-routes";
import { readFileSync } from "fs";

// Read version once at config load time — used in both Vite define and esbuild define.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8")) as { version: string };

function serverBundlePlugin(): Plugin {
	let built = false;
	return {
		name: "server-bundle",
		apply: "build",
		closeBundle: async function() {
			if (built) return;
			// Only run after SSR build (app.js must exist)
			const fs0 = await import("fs");
			const appJsPath = path.resolve(__dirname, "dist", "app.js");
			if (!fs0.existsSync(appJsPath)) {
				console.log("Skipping server bundle — dist/app.js not yet generated.");
				return;
			}
			built = true;
			console.log("Bundling server code with esbuild...");
			// Output as CJS (.cjs) — this is the definitive fix for the Windows
			// launch crash chain:
			//
			// ESM + packages:"bundle"  → esbuild inlines CJS packages → generates
			//   createRequireN() helpers → conflicts with banner → ReferenceError on launch
			//
			// ESM + packages:"external" → bare import 'express' etc. in output →
			//   Node ESM loader can't find them (NODE_PATH is ignored by ESM) →
			//   ERR_MODULE_NOT_FOUND on launch
			//
			// CJS + packages:"bundle"  → esbuild inlines everything with normal
			//   require() calls → no ESM/CJS boundary → no createRequire needed →
			//   no NODE_PATH needed → works on Windows with spaces in path → FIXED
			const outfile = path.resolve(__dirname, "dist", "server.bundle.cjs");

			// Only externalize packages that are genuinely unbundleable:
			// - webtorrent / webrtc-polyfill / node-datachannel: native addons or
			//   packages with dynamic require() patterns esbuild can't trace
			// - #airo/secrets: virtual module resolved by the platform at runtime
			const externalizePlugin: esbuild.Plugin = {
				name: "externalize-problem-imports",
				setup(build) {
					build.onResolve({ filter: /^#/ }, (args) => ({ path: args.path, external: true }));
					build.onResolve({ filter: /webtorrent/ }, (args) => ({ path: args.path, external: true }));
					build.onResolve({ filter: /webrtc-polyfill/ }, (args) => ({ path: args.path, external: true }));
					build.onResolve({ filter: /node-datachannel/ }, (args) => ({ path: args.path, external: true }));
				},
			};

			await esbuild.build({
				entryPoints: [path.resolve(__dirname, "dist", "app.js")],
				bundle: true,
				platform: "node",
				target: "node22",
				// CJS format: all imports become require() calls — no ESM loader
				// involved, no NODE_PATH needed, no createRequire shim needed.
				format: "cjs",
				outfile,
				// Bundle all node_modules into the single .cjs file so the packaged
				// Electron app has zero external runtime dependencies.
				packages: "bundle",
				sourcemap: true,
				plugins: [externalizePlugin],
				// Fix: server source files use import.meta.url for __dirname emulation
				// and createRequire(import.meta.url). In CJS output, import.meta is
				// undefined — this define replaces every occurrence at bundle time with
				// a CJS-compatible equivalent so require('module').createRequire(...)
				// and fileURLToPath(...) both receive a valid file URL string.
				define: {
					"import.meta.url": "require('url').pathToFileURL(__filename).href",
					// Bake version so health/GET.ts and mdnsService.ts don't need
					// createRequire just to read package.json.
					__APP_VERSION__: JSON.stringify(pkg.version),
				},
			});

			console.log("Server bundle created at dist/server.bundle.cjs");
		},
	};
}

const allowedHosts = ["all"];
const corsOrigins = ["*"];

export default defineConfig(({ mode: _mode }) => ({
	envPrefix: ["VITE_", "SITE_"],

	define: {
		// Bake version into both client and server bundles — avoids runtime
		// package.json reads which require createRequire(import.meta.url).
		__APP_VERSION__: JSON.stringify(pkg.version),
	},

	plugins: [
		react(),
		apiRoutes({
			mode: "isolated",
			configure: "src/server/configure.js",
			dirs: [{ dir: "./src/server/api", route: "" }],
			// forceRestart causes an infinite restart loop in the cloud environment:
			// ownershipSeed writes to homestream-config.json → Vite picks up the
			// SSR module change → restarts → writes again → repeat.
			// The plugin auto-detects new API route files without needing forceRestart.
			forceRestart: false,
		}),
		serverBundlePlugin(),
	],

	resolve: {
		dedupe: ["react", "react-dom", "react-router-dom"],
		alias: {
			nothing: "/src/fallbacks/missingModule.ts",
			"@/api": path.resolve(__dirname, "./src/server/api"),
			"@": path.resolve(__dirname, "./src"),
			// Dev shim for the platform secret store.
			// In production the real #airo/secrets module is provided by the
			// platform runtime. In dev (Vite SSR module runner) it can't be
			// resolved, so we alias it to a shim that reads from process.env.
			// The production build externalizes #airo/secrets so this alias
			// is never bundled into the production server bundle.
			"#airo/secrets": path.resolve(__dirname, "./src/server/airo-secrets-shim.ts"),
		},
	},

	optimizeDeps: {
		include: ["react", "react-dom", "react-router-dom"],
		exclude: ["html-to-image", "clsx", "tailwind-merge"],
	},

	ssr: {
		noExternal: [],
		// Do NOT put "#airo/secrets" here — ssr.external tells Vite to skip
		// the alias and resolve it as a real Node module, which fails because
		// it's not an installed package. The alias in resolve.alias handles
		// dev resolution. The build rollupOptions.external handles production.
		external: ["html-to-image"],
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
			allowedHeaders: ["Content-Type", "Authorization", "Accept", "User-Agent"],
		},
		hmr: {
			overlay: false,
		},
		watch: {
			// Ignore build output, API cache, data files, and /private storage.
			// Without these, writes to homestream-*.json trigger SSR module reloads
			// which restart the server in an infinite loop.
			ignored: [
				"**/dist/**",
				"**/.api/**",
				"**/homestream-data/**",
				"**/homestream-*.json",
				"/private/**",
				"**/node_modules/**",
			],
		},
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
			allowedHeaders: ["Content-Type", "Authorization", "Accept", "User-Agent"],
		},
	},

	build: {
		rollupOptions: {
			external: ["#airo/secrets"],
			output: {
				manualChunks: {
					"react-vendor": ["react", "react-dom", "react-router-dom"],
				},
			},
		},
	},
}));
