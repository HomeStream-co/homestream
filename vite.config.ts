import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import * as esbuild from "esbuild";
import { tscWatchPlugin } from "./dev-tools/src/vite-tsc-plugin";
import sourceMapperPlugin from "./source-mapper/src/index";
import { devToolsPlugin } from "./dev-tools/src/vite-plugin";
import { fullStoryPlugin } from "./fullstory-plugin";
import { errorInterceptorPlugin } from "./dev-tools/src/vite-error-interceptor";
import { mediaVersionsPlugin } from "./dev-tools/src/vite-media-versions-plugin";
import apiRoutes from "vite-plugin-api-routes";

function serverBundlePlugin(): Plugin {
	let built = false;
	return {
		name: "server-bundle",
		apply: "build",
		closeBundle: async () => {
			if (built) return;
			built = true;
			console.log("Bundling server code with esbuild...");
			const outfile = path.resolve(__dirname, "dist", "server.bundle.mjs");
			await esbuild.build({
				entryPoints: [path.resolve(__dirname, "dist", "app.js")],
				bundle: true,
				platform: "node",
				target: "node22",
				format: "esm",
				outfile,
				packages: "bundle",
				sourcemap: true,
				// Alias problem packages to synchronous stubs:
				// - webrtc-polyfill: uses top-level await, replaced with no-op stub
				// - webtorrent: uses top-level await AND production has no node_modules;
				//   replaced with a graceful stub (torrent downloads are desktop-only)
				alias: {
					"webrtc-polyfill": path.resolve(
						__dirname,
						"src/server/stubs/webrtc-polyfill-stub.js"
					),
					"webtorrent": path.resolve(
						__dirname,
						"src/server/stubs/webtorrent-stub.js"
					),
				},
				// node-datachannel is a native addon — keep external so it resolves
				// from node_modules at runtime (installed alongside the app).
				external: ["node-datachannel"],
				// Banner provides require() for CJS deps (dotenv, etc.) bundled into ESM.
				// Uses __airo_createRequire alias — safe because the post-process step
				// below deduplicates all other `import { createRequire }` statements
				// so there is no name collision at runtime.
				banner: {
					js: `import { createRequire as __airo_createRequire } from 'module';\nconst require = __airo_createRequire(import.meta.url);`,
				},
			});

			// Post-process: deduplicate `import { createRequire } from "module"` lines.
			// Multiple bundled deps (ffmpeg-static, qbit client, setup scripts) each emit
			// their own top-level createRequire import. Node ESM treats these as duplicate
			// bindings and throws "Identifier 'createRequire' has already been declared".
			// We keep only the FIRST occurrence and remove all subsequent ones.
			{
				const fs2 = await import("fs");
				let src = fs2.readFileSync(outfile, "utf8");
				let firstSeen = false;
				src = src.replace(
					/^import \{ createRequire(?: as \w+)? \} from ["']module["'];?\r?\n/gm,
					(match) => {
						if (!firstSeen) { firstSeen = true; return match; }
						return "";
					}
				);
				// Ensure a single canonical require() is available for CJS deps
				if (!firstSeen) {
					src = `import { createRequire } from "module";\nconst require = createRequire(import.meta.url);\n` + src;
				}
				fs2.writeFileSync(outfile, src);
			}
			console.log("Server bundle created at dist/server.bundle.mjs");
		},
	};
}

// HomeStream is a local/desktop app — no cloud hosting env vars needed.
// Allow all hosts so LAN devices (phone remote, TV) can reach the dev server.
const allowedHosts = ["all"];
const corsOrigins = ["*"];

export default defineConfig(({ mode }) => ({
	// Expose SITE_ID to import.meta.env (same as app id) for client deep links; keep VITE_ as default
	envPrefix: ["VITE_", "SITE_"],

	plugins: [
		react({
			babel: {
				plugins: [sourceMapperPlugin],
			},
		}),
		apiRoutes({
			mode: "isolated",
			configure: "src/server/configure.js",
			dirs: [{ dir: "./src/server/api", route: "" }],
			forceRestart: mode === "development",
		}),
		...(mode === "development"
			? [
					tscWatchPlugin(),
					devToolsPlugin() as Plugin,
					fullStoryPlugin(),
					errorInterceptorPlugin(),
					mediaVersionsPlugin() as Plugin,
				]
			: []),
		serverBundlePlugin(),
	],

	resolve: {
		dedupe: ["react", "react-dom", "react-router-dom"],
		alias: {
			nothing: "/src/fallbacks/missingModule.ts",
			"@/api": path.resolve(__dirname, "./src/server/api"),
			"@": path.resolve(__dirname, "./src"),
		},
	},

	optimizeDeps: {
		include: ["react", "react-dom", "react-router-dom"],
		// html-to-image is dev-tools only and incompatible with Vite's dep optimizer.
		// Excluding it prevents the "file does not exist in optimize deps directory"
		// crash that disconnects the SSR transport and causes the recurring white-screen.
		// clsx and tailwind-merge are excluded for the same reason — they ship as
		// pure-ESM packages that the optimizer cannot reliably pre-bundle, causing
		// "file does not exist in optimize deps directory" errors that drop the HMR
		// websocket and show a "Network error / connection loss" in the preview.
		exclude: ["html-to-image", "clsx", "tailwind-merge"],
	},

	ssr: {
		// Keep html-to-image as an external in SSR so the module runner never
		// tries to inline/transform it — same root cause as the optimizeDeps crash.
		noExternal: [],
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
			ignored: ["**/dist/**", "**/.api/**"],
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
			output: {
				manualChunks: {
					"react-vendor": ["react", "react-dom", "react-router-dom"],
				},
			},
		},
	},
}));
