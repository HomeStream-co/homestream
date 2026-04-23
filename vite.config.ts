import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import * as esbuild from "esbuild";
import apiRoutes from "vite-plugin-api-routes";

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
			const outfile = path.resolve(__dirname, "dist", "server.bundle.mjs");

			// esbuild plugin to intercept unresolvable imports at bundle time
			const externalizePlugin: esbuild.Plugin = {
				name: "externalize-problem-imports",
				setup(build) {
					// Externalize anything starting with # (Node package imports like #airo/secrets)
					build.onResolve({ filter: /^#/ }, (_args) => ({ path: _args.path, external: true }));
					// Externalize webtorrent regardless of how it was aliased
					build.onResolve({ filter: /webtorrent/ }, (_args) => ({ path: "webtorrent", external: true }));
					// Externalize webrtc-polyfill
					build.onResolve({ filter: /webrtc-polyfill/ }, (_args) => ({ path: "webrtc-polyfill", external: true }));
					// Externalize node-datachannel
					build.onResolve({ filter: /node-datachannel/ }, (_args) => ({ path: "node-datachannel", external: true }));
				},
			};

			await esbuild.build({
				entryPoints: [path.resolve(__dirname, "dist", "app.js")],
				bundle: true,
				platform: "node",
				target: "node22",
				format: "esm",
				outfile,
				// external: keep node_modules out of the bundle so esbuild never
				// tries to inline CJS packages that use createRequire internally.
				// Those packages ship with the app via electron extraResources /
				// node_modules and are resolved at runtime by Node.
				packages: "external",
				sourcemap: true,
				plugins: [externalizePlugin],
				// Provide a top-level require() shim so any bundled app code that
				// calls require() directly still works in ESM context.
				// Use a unique name that cannot clash with esbuild's own helpers.
				banner: {
					js: `import { createRequire as ___hs_createRequire } from 'module';\nconst require = ___hs_createRequire(import.meta.url);`,
				},
			});
			console.log("Server bundle created at dist/server.bundle.mjs");
		},
	};
}

const allowedHosts = ["all"];
const corsOrigins = ["*"];

export default defineConfig(({ mode: _mode }) => ({
	envPrefix: ["VITE_", "SITE_"],

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
