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
			await esbuild.build({
				entryPoints: [path.resolve(__dirname, "dist", "app.js")],
				bundle: true,
				platform: "node",
				target: "node22",
				format: "esm",
				outfile: path.resolve(__dirname, "dist", "server.bundle.mjs"),
				packages: "bundle",
				sourcemap: true,
				// webrtc-polyfill/lib/Blob.js uses top-level await (TLA) which esbuild
				// cannot inline into synchronous __esm() wrappers. The async-ness
				// propagates through the entire module graph and causes:
				//   "SyntaxError: Unexpected reserved word" at runtime.
				// On Node 18+ all these polyfills are no-ops — node-datachannel provides
				// real WebRTC. We replace the whole package with a synchronous stub.
				alias: {
					"webrtc-polyfill": path.resolve(
						__dirname,
						"src/server/stubs/webrtc-polyfill-stub.js"
					),
				},
				// node-datachannel is a native addon — keep external so it resolves
				// from node_modules at runtime (installed alongside the app).
				// webtorrent uses top-level await and complex ESM internals that
				// conflict with esbuild's bundling — keep external so it resolves
				// from node_modules at runtime.
				external: ["node-datachannel", "webtorrent"],
				banner: {
					js: `import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);`,
				},
			});
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
