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
				// webtorrent pulls in webrtc-polyfill which uses await inside __esm
				// wrappers — not valid in a non-async context. Keep these as externals
				// so they're loaded at runtime rather than inlined by esbuild.
				external: [
					"webtorrent",
					"webrtc-polyfill",
					"bittorrent-tracker",
					"ut-metadata",
					"ut-pex",
					"create-torrent",
					"parse-torrent",
					"torrent-discovery",
					"bittorrent-dht",
					"bittorrent-lsd",
					"node-datachannel",
				],
				banner: {
					js: `import { createRequire } from 'module';
const require = createRequire(import.meta.url);`,
				},
			});
			console.log("Server bundle created at dist/server.bundle.mjs");
		},
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
		exclude: ["html-to-image"],
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
						"@radix-ui/react-tooltip",
					],
					query: ["@tanstack/react-query"],
				},
			},
		},
	},
}));
