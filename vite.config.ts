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
			// @ts-ignore
			if (!this?.meta?.watchMode === false && built) return;
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
			await esbuild.build({
				entryPoints: [path.resolve(__dirname, "dist", "app.js")],
				bundle: true,
				platform: "node",
				target: "node22",
				format: "esm",
				outfile,
				packages: "bundle",
				sourcemap: true,
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
				external: ["node-datachannel"],
				banner: {
					js: `import { createRequire as __airo_createRequire } from 'module';\nconst require = __airo_createRequire(import.meta.url);`,
				},
			});

			// Post-process: deduplicate `import { createRequire } from "module"` lines.
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
				if (!firstSeen) {
					src = `import { createRequire } from "module";\nconst require = createRequire(import.meta.url);\n` + src;
				}
				fs2.writeFileSync(outfile, src);
			}
			console.log("Server bundle created at dist/server.bundle.mjs");
		},
	};
}

const allowedHosts = ["all"];
const corsOrigins = ["*"];

export default defineConfig(({ mode }) => ({
	envPrefix: ["VITE_", "SITE_"],

	plugins: [
		react(),
		apiRoutes({
			mode: "isolated",
			configure: "src/server/configure.js",
			dirs: [{ dir: "./src/server/api", route: "" }],
			forceRestart: mode === "development",
		}),
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
		exclude: ["html-to-image", "clsx", "tailwind-merge"],
	},

	ssr: {
		noExternal: [],
		external: ["html-to-image", "#airo/secrets"],
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
