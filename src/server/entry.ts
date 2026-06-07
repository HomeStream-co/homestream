import express, { type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { readFileSync } from "node:fs";

// <api-imports>
import cookieParser from "cookie-parser";
import multer from "multer";

// admin
import adminStatusGet from "./api/admin/status/GET";
// auth
import authCheckGet from "./api/auth/check/GET";
import authLoginPost from "./api/auth/login/POST";
import authLogoutPost from "./api/auth/logout/POST";
import authLogoutAllPost from "./api/auth/logout-all/POST";
// backup
import backupGet from "./api/backup/GET";
import backupPost from "./api/backup/POST";
import backupRestorePost from "./api/backup/restore/POST";
// captions
import captionsLangGet from "./api/captions/[id]/[lang]/GET";
import captionsFetchPost from "./api/captions/[id]/fetch/POST";
import captionsUploadPost from "./api/captions/[id]/upload/POST";
// cast
import castControlPost from "./api/cast/control/POST";
import castDevicesGet from "./api/cast/devices/GET";
import castPositionGet from "./api/cast/position/GET";
import castPositionServerGet from "./api/cast/position/server/GET";
import castSendPost from "./api/cast/send/POST";
import castStopPost from "./api/cast/stop/POST";
// chat
import chatPost from "./api/chat/POST";
// taste engine
import tasteEventsPost  from "./api/taste/events/POST";
import tasteProfileGet  from "./api/taste/profile/GET";
import tasteScoresPost  from "./api/taste/scores/POST";
import tasteEnrichPost  from "./api/taste/enrich/POST";
// crash-log
import crashLogGet from "./api/crash-log/GET";
import crashLogPost from "./api/crash-log/POST";
// debug
import debugRepairPost from "./api/debug/repair/POST";
import debugSystemInfoGet from "./api/debug/system-info/GET";
// dev
import devDiagnosticsGet from "./api/dev/diagnostics/GET";
import devReleasePost from "./api/dev/release/POST";
// electron
import electronGet from "./api/electron/GET";
// encoder
import encoderStatusGet from "./api/encoder/status/GET";
// enrich
import enrichPost from "./api/enrich/[id]/POST";
// feedback
import feedbackPost from "./api/feedback/POST";
// health
import healthGet from "./api/health/GET";
import healthFullGet from "./api/health/full/GET";
// history
import historyGet from "./api/history/GET";
import historyDelete from "./api/history/DELETE";
// hls
import hlsProbeGet from "./api/hls/[id]/probe/GET";
import hlsPlaylistGet from "./api/hls/[id]/index.m3u8/GET";
import hlsSegmentGet from "./api/hls/[id]/[segment]/GET";
// jellyfin
import jellyfinItemsGet from "./api/jellyfin/Items/GET";
import jellyfinItemByIdGet from "./api/jellyfin/Items/[id]/GET";
import jellyfinItemImageGet from "./api/jellyfin/Items/[id]/Images/[imageType]/GET";
import jellyfinSearchHintsGet from "./api/jellyfin/Search/Hints/GET";
import jellyfinSessionsPlayingPost from "./api/jellyfin/Sessions/Playing/POST";
import jellyfinSessionsPlayingProgressPost from "./api/jellyfin/Sessions/Playing/Progress/POST";
import jellyfinSessionsPlayingStoppedPost from "./api/jellyfin/Sessions/Playing/Stopped/POST";
import jellyfinSystemInfoPublicGet from "./api/jellyfin/System/Info/Public/GET";
import jellyfinAuthPost from "./api/jellyfin/Users/AuthenticateByName/POST";
import jellyfinUsersGet from "./api/jellyfin/Users/GET";
import jellyfinUserByIdGet from "./api/jellyfin/Users/[userId]/GET";
import jellyfinUserItemsGet from "./api/jellyfin/Users/[userId]/Items/GET";
import jellyfinVideosGet from "./api/jellyfin/Videos/GET";
import jellyfinVideoStreamGet from "./api/jellyfin/Videos/[id]/stream/GET";
// library
import libraryScanPost from "./api/library/scan/POST";
import libraryStorageGet from "./api/library/storage/GET";
import libraryStoragePatch from "./api/library/storage/PATCH";
import libraryStorageDrivePatch from "./api/library/storage/drive/PATCH";
// media
import mediaGet from "./api/media/GET";
import demoGet from "./api/demo/GET";
import mediaDeleteById from "./api/media/[id]/DELETE";
import mediaPutById from "./api/media/[id]/PUT";
import mediaEpisodesGet from "./api/media/[id]/episodes/GET";
import mediaEpisodesPost from "./api/media/[id]/episodes/POST";
import mediaEpisodePatch from "./api/media/[id]/episodes/[episodeId]/PATCH";
import mediaFetchMetadataPost from "./api/media/[id]/fetch-metadata/POST";
import mediaProgressPatch from "./api/media/[id]/progress/PATCH";
import mediaTracksGet from "./api/media/[id]/tracks/GET";
// network
import networkInfoGet from "./api/network/info/GET";
// profiles
import profilesGet from "./api/profiles/GET";
import profilesPost from "./api/profiles/POST";
import profileByIdGet from "./api/profiles/[id]/GET";
import profileByIdPatch from "./api/profiles/[id]/PATCH";
import profileByIdDelete from "./api/profiles/[id]/DELETE";
import profilePinPost from "./api/profiles/[id]/pin/POST";
import profileSwitchPost from "./api/profiles/switch/POST";
// real-debrid
import realDebridStatusGet from "./api/real-debrid/status/GET";
// remote
import remoteQrGet from "./api/remote/qr/GET";
// security
import securityQuarantineGet from "./api/security/quarantine/GET";
import securityQuarantinePost from "./api/security/quarantine/POST";
import securityScanPost from "./api/security/scan/POST";
// setup
import setupGet from "./api/setup/GET";
import setupPost from "./api/setup/POST";
import setupTestKeysPost from "./api/setup/test-keys/POST";
import setupBrowseFolderGet from "./api/setup/browse-folder/GET";
import setupOpenDialogPost from "./api/setup/open-dialog/POST";
// shutdown
import shutdownPost from "./api/shutdown/POST";
// stats
import statsGet from "./api/stats/GET";
// stream
import streamGet from "./api/stream/[filename]/GET";
// stremio
import stremioDownloadPost from "./api/stremio/download/POST";
import stremioDownloadsGet from "./api/stremio/downloads/GET";
import stremioDownloadDeleteByHash from "./api/stremio/downloads/[hash]/DELETE";
import stremioDownloadsPausePost from "./api/stremio/downloads/pause/POST";
import stremioDownloadsPriorityPost from "./api/stremio/downloads/priority/POST";
import stremioDownloadsResumePost from "./api/stremio/downloads/resume/POST";
import stremioDownloadsRetryPost from "./api/stremio/downloads/retry/POST";
import stremioLoginPost from "./api/stremio/login/POST";
import stremioMagnetPost from "./api/stremio/magnet/POST";
import stremioMagnetDirectPost from "./api/stremio/magnet-direct/POST";
import torrentSourcesGet from "./api/torrent-sources/GET";
import torrentSourcesPost from "./api/torrent-sources/POST";
import stremioScheduleGet from "./api/stremio/schedule/GET";
import stremioSchedulePost from "./api/stremio/schedule/POST";
import stremioScheduleDeleteById from "./api/stremio/schedule/[id]/DELETE";
import stremioSearchPost from "./api/stremio/search/POST";
import stremioStreamPost from "./api/stremio/stream/POST";
// subscriptions
import subscriptionsGet from "./api/subscriptions/GET";
import subscriptionsPost from "./api/subscriptions/POST";
import subscriptionCheckPost from "./api/subscriptions/[id]/check/POST";
// tmdb
import tmdbGet from "./api/tmdb/GET";
import tmdbCatalogGet from "./api/tmdb/catalog/GET";
import tmdbGenresGet from "./api/tmdb/genres/GET";
import tmdbMovieGet from "./api/tmdb/movie/[id]/GET";
import tmdbSearchGet from "./api/tmdb/search/GET";
import tmdbStreamingGet from "./api/tmdb/streaming/GET";
import tmdbTrailerGet from "./api/tmdb/trailer/GET";
import tmdbTvGet from "./api/tmdb/tv/[id]/GET";
import tmdbProxyGet from "./api/tmdb-proxy/GET";
// transcode
import transcodeGet from "./api/transcode/[id]/GET";
// updater
import updaterActionPost from "./api/updater/action/POST";
import updaterDrainGet from "./api/updater/drain/GET";
import updaterPushPost from "./api/updater/push/POST";
import updaterStatusGet from "./api/updater/status/GET";
// upload
import uploadPost from "./api/upload/POST";
// vpn
import vpnGet from "./api/vpn/GET";
import vpnPost from "./api/vpn/POST";
import vpnBindPost from "./api/vpn/bind/POST";
import vpnFastestServerGet from "./api/vpn/fastest-server/GET";
import vpnInterfacesGet from "./api/vpn/interfaces/GET";
import vpnInterfacesStatusGet from "./api/vpn/interfaces/status/GET";
// watchlist
import watchlistGet from "./api/watchlist/GET";
import watchlistPutById from "./api/watchlist/[id]/PUT";
import watchlistDeleteById from "./api/watchlist/[id]/DELETE";
// </api-imports>
import { seoRoutes } from "../lib/seo-routes";
import { startQbitCompletionWatcher } from "./qbitCompletionWatcher";
import { runStartupMediaSync } from "./startupMediaSync";

function normalizeCommerceApiBaseUrlEnv() {
	if (process.env.GODADDY_API_BASE_URL) return;
	const hostOnly = process.env.VITE_GODADDY_API_HOST;
	if (!hostOnly) return;
	const normalizedHost = hostOnly.replace(/^https?:\/\//, "").trim();
	if (!normalizedHost) return;
	process.env.GODADDY_API_BASE_URL = `https://${normalizedHost}`;
}

normalizeCommerceApiBaseUrlEnv();

const app = express();

// Honour x-forwarded-* from the load balancer so req.protocol/req.hostname
// reflect the public-facing values. Express-maintained parsing respects the
// existing trust-proxy config; direct header reads would let a client spoof
// the sitemap origin in robots.txt.
app.set("trust proxy", true);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const upload = multer({ dest: "/tmp/uploads" });

// <api-registrations>
// admin
app.get("/api/admin/status", adminStatusGet);
// auth
app.get("/api/auth/check", authCheckGet);
app.post("/api/auth/login", authLoginPost);
app.post("/api/auth/logout", authLogoutPost);
app.post("/api/auth/logout-all", authLogoutAllPost);
// backup
app.get("/api/backup", backupGet);
app.post("/api/backup", backupPost);
app.post("/api/backup/restore", backupRestorePost);
// captions
app.get("/api/captions/:id/:lang", captionsLangGet);
app.post("/api/captions/:id/fetch", captionsFetchPost);
app.post("/api/captions/:id/upload", upload.single("file"), captionsUploadPost);
// cast
app.post("/api/cast/control", castControlPost);
app.get("/api/cast/devices", castDevicesGet);
app.get("/api/cast/position", castPositionGet);
app.get("/api/cast/position/server", castPositionServerGet);
app.post("/api/cast/send", castSendPost);
app.post("/api/cast/stop", castStopPost);
// chat
app.post("/api/chat", chatPost);
// taste engine
app.post("/api/taste/events",  tasteEventsPost);
app.get( "/api/taste/profile", tasteProfileGet);
app.post("/api/taste/scores",  tasteScoresPost);
app.post("/api/taste/enrich",  tasteEnrichPost);
// crash-log
app.get("/api/crash-log", crashLogGet);
app.post("/api/crash-log", crashLogPost);
// debug
app.post("/api/debug/repair", debugRepairPost);
app.get("/api/debug/system-info", debugSystemInfoGet);
// dev
app.get("/api/dev/diagnostics", devDiagnosticsGet);
app.post("/api/dev/release", devReleasePost);
// electron
app.get("/api/electron", electronGet);
// encoder
app.get("/api/encoder/status", encoderStatusGet);
// enrich
app.post("/api/enrich/:id", enrichPost);
// feedback
app.post("/api/feedback", feedbackPost);
// health
app.get("/api/health", healthGet);
app.get("/api/health/full", healthFullGet);
// history
app.get("/api/history", historyGet);
app.delete("/api/history", historyDelete);
// hls
app.get("/api/hls/:id/probe", hlsProbeGet);
app.get("/api/hls/:id/index.m3u8", hlsPlaylistGet);
app.get("/api/hls/:id/:segment", hlsSegmentGet);
// jellyfin
app.get("/api/jellyfin/Items", jellyfinItemsGet);
app.get("/api/jellyfin/Items/:id", jellyfinItemByIdGet);
app.get("/api/jellyfin/Items/:id/Images/:imageType", jellyfinItemImageGet);
app.get("/api/jellyfin/Search/Hints", jellyfinSearchHintsGet);
app.post("/api/jellyfin/Sessions/Playing", jellyfinSessionsPlayingPost);
app.post("/api/jellyfin/Sessions/Playing/Progress", jellyfinSessionsPlayingProgressPost);
app.post("/api/jellyfin/Sessions/Playing/Stopped", jellyfinSessionsPlayingStoppedPost);
app.get("/api/jellyfin/System/Info/Public", jellyfinSystemInfoPublicGet);
app.post("/api/jellyfin/Users/AuthenticateByName", jellyfinAuthPost);
app.get("/api/jellyfin/Users", jellyfinUsersGet);
app.get("/api/jellyfin/Users/:userId", jellyfinUserByIdGet);
app.get("/api/jellyfin/Users/:userId/Items", jellyfinUserItemsGet);
app.get("/api/jellyfin/Videos", jellyfinVideosGet);
app.get("/api/jellyfin/Videos/:id/stream", jellyfinVideoStreamGet);
// library
app.post("/api/library/scan", libraryScanPost);
app.get("/api/library/storage", libraryStorageGet);
app.patch("/api/library/storage", libraryStoragePatch);
app.patch("/api/library/storage/drive", libraryStorageDrivePatch);
// media
app.get("/api/media", mediaGet);
app.get("/api/demo", demoGet);
app.delete("/api/media/:id", mediaDeleteById);
app.put("/api/media/:id", mediaPutById);
app.get("/api/media/:id/episodes", mediaEpisodesGet);
app.post("/api/media/:id/episodes", mediaEpisodesPost);
app.patch("/api/media/:id/episodes/:episodeId", mediaEpisodePatch);
app.post("/api/media/:id/fetch-metadata", mediaFetchMetadataPost);
app.patch("/api/media/:id/progress", mediaProgressPatch);
app.get("/api/media/:id/tracks", mediaTracksGet);
// network
app.get("/api/network/info", networkInfoGet);
// profiles
app.get("/api/profiles", profilesGet);
app.post("/api/profiles", profilesPost);
app.post("/api/profiles/switch", profileSwitchPost);
app.get("/api/profiles/:id", profileByIdGet);
app.patch("/api/profiles/:id", profileByIdPatch);
app.delete("/api/profiles/:id", profileByIdDelete);
app.post("/api/profiles/:id/pin", profilePinPost);
// real-debrid
app.get("/api/real-debrid/status", realDebridStatusGet);
// remote
app.get("/api/remote/qr", remoteQrGet);
// security
app.get("/api/security/quarantine", securityQuarantineGet);
app.post("/api/security/quarantine", securityQuarantinePost);
app.post("/api/security/scan", securityScanPost);
// setup
app.get("/api/setup", setupGet);
app.post("/api/setup", setupPost);
app.post("/api/setup/test-keys", setupTestKeysPost);
app.get("/api/setup/browse-folder", setupBrowseFolderGet);
app.post("/api/setup/open-dialog", setupOpenDialogPost);
// shutdown
app.post("/api/shutdown", shutdownPost);
// stats
app.get("/api/stats", statsGet);
// stream
app.get("/api/stream/:filename", streamGet);
// stremio
app.post("/api/stremio/download", stremioDownloadPost);
app.get("/api/stremio/downloads", stremioDownloadsGet);
app.delete("/api/stremio/downloads/:hash", stremioDownloadDeleteByHash);
app.post("/api/stremio/downloads/pause", stremioDownloadsPausePost);
app.post("/api/stremio/downloads/priority", stremioDownloadsPriorityPost);
app.post("/api/stremio/downloads/resume", stremioDownloadsResumePost);
app.post("/api/stremio/downloads/retry", stremioDownloadsRetryPost);
app.post("/api/stremio/login", stremioLoginPost);
app.post("/api/stremio/magnet", stremioMagnetPost);
app.post("/api/stremio/magnet-direct", stremioMagnetDirectPost);
app.get("/api/torrent-sources", torrentSourcesGet);
app.post("/api/torrent-sources", torrentSourcesPost);
app.get("/api/stremio/schedule", stremioScheduleGet);
app.post("/api/stremio/schedule", stremioSchedulePost);
app.delete("/api/stremio/schedule/:id", stremioScheduleDeleteById);
app.post("/api/stremio/search", stremioSearchPost);
app.post("/api/stremio/stream", stremioStreamPost);
// subscriptions
app.get("/api/subscriptions", subscriptionsGet);
app.post("/api/subscriptions", subscriptionsPost);
app.post("/api/subscriptions/:id/check", subscriptionCheckPost);
// tmdb
app.get("/api/tmdb", tmdbGet);
app.get("/api/tmdb/catalog", tmdbCatalogGet);
app.get("/api/tmdb/genres", tmdbGenresGet);
app.get("/api/tmdb/movie/:id", tmdbMovieGet);
app.get("/api/tmdb/search", tmdbSearchGet);
app.get("/api/tmdb/streaming", tmdbStreamingGet);
app.get("/api/tmdb/trailer", tmdbTrailerGet);
app.get("/api/tmdb/tv/:id", tmdbTvGet);
app.get("/api/tmdb-proxy", tmdbProxyGet);
// transcode
app.get("/api/transcode/:id", transcodeGet);
// updater
app.post("/api/updater/action", updaterActionPost);
app.get("/api/updater/drain", updaterDrainGet);
app.post("/api/updater/push", updaterPushPost);
app.get("/api/updater/status", updaterStatusGet);
// upload
app.post("/api/upload", upload.single("file"), uploadPost);
// vpn
app.get("/api/vpn", vpnGet);
app.post("/api/vpn", vpnPost);
app.post("/api/vpn/bind", vpnBindPost);
app.get("/api/vpn/fastest-server", vpnFastestServerGet);
app.get("/api/vpn/interfaces", vpnInterfacesGet);
app.get("/api/vpn/interfaces/status", vpnInterfacesStatusGet);
// watchlist
app.get("/api/watchlist", watchlistGet);
app.put("/api/watchlist/:id", watchlistPutById);
app.delete("/api/watchlist/:id", watchlistDeleteById);
// </api-registrations>

// Error middleware must be registered AFTER the routes it protects; Express
// only passes errors to middleware defined later in the stack.
app.use("/api", (err: unknown, req: Request, res: Response, _next: NextFunction) => {
	// Always respond JSON on /api so clients parsing response.json() don't
	// receive Express's default HTML error page for non-Error throws.
	console.error("ssr.api.error", {
		url: req.url,
		error: err instanceof Error ? err.stack : String(err),
	});
	res.status(500).json({ error: "Internal server error" });
});

function baseUrl(req: Request): string {
	const env = process.env.PUBLIC_URL || process.env.SITE_URL;
	if (env) return env.replace(/\/+$/, "");
	return `${req.protocol}://${req.hostname}`;
}

function escapeXml(s: string): string {
	return s.replace(/[&<>"']/g, (c) =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
	);
}

app.get("/robots.txt", (req, res) => {
	const base = baseUrl(req);
	const body = [
		"User-agent: *",
		"Allow: /",
		"",
		`Sitemap: ${base}/sitemap.xml`,
		"",
	].join("\n");
	res.type("text/plain").set("Cache-Control", "public, max-age=3600").send(body);
});

app.get("/sitemap.xml", (req, res) => {
	const base = baseUrl(req);
	const urls = seoRoutes
		.filter((r) => typeof r.path === "string" && r.path.startsWith("/"))
		.map((r) => {
			const loc = `${base}${r.path}`;
			const parts = [`    <loc>${escapeXml(loc)}</loc>`];
			if (r.lastmod) parts.push(`    <lastmod>${escapeXml(r.lastmod)}</lastmod>`);
			if (r.changefreq) parts.push(`    <changefreq>${r.changefreq}</changefreq>`);
			if (r.priority !== undefined)
				parts.push(`    <priority>${r.priority.toFixed(1)}</priority>`);
			return `  <url>\n${parts.join("\n")}\n  </url>`;
		})
		.join("\n");
	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
	res.type("application/xml").set("Cache-Control", "public, max-age=3600").send(body);
});

if (import.meta.env.PROD) {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	// Bundle lives at dist/server/server.bundle.cjs → client files are one level up at dist/client/
	const clientDir = join(__dirname, "..", "client");

	app.use(
		express.static(clientDir, {
			index: false,
			setHeaders(res, filePath) {
				res.set(
					"Cache-Control",
					filePath.includes("/assets/")
						? "public, max-age=31536000, immutable"
						: "no-cache",
				);
			},
		}),
	);

	app.use((_req, res, next) => {
		res.set("Cache-Control", "no-cache");
		next();
	});

	let template: string;
	try {
		template = readFileSync(join(clientDir, "index.html"), "utf-8");
	} catch (err) {
		console.error("ssr.template.load-failed", {
			path: join(clientDir, "index.html"),
			error: err instanceof Error ? err.message : String(err),
		});
		process.exit(1);
	}
	if (!template.includes("<!--app-head-->") || !template.includes("<!--app-html-->")) {
		// Fail fast at boot, same as a template load failure above: without
		// markers, every .replace() call on the render path is a no-op and we
		// would serve a shell with no <head> content and no rendered body on
		// every request. Preferring process.exit over a degraded mode ensures
		// an operator notices and fixes the build rather than serving broken
		// SEO-invisible pages indefinitely.
		console.error("ssr.template.markers-missing", {
			hasHead: template.includes("<!--app-head-->"),
			hasHtml: template.includes("<!--app-html-->"),
		});
		process.exit(1);
	}
	const fallbackShell = template
		.replace("<!--app-head-->", "")
		.replace("<!--app-html-->", "");

	// Resolve the SSR module once into a stable render function. A failed
	// load is unrecoverable at runtime - exiting lets the container
	// scheduler restart with a clean slate rather than leaving the server
	// to serve silent 503s indefinitely against a single startup log.
	type RenderResult = {
		html: string;
		head: string;
		status: number;
		redirect?: string;
	};
	let renderFn: ((url: string) => Promise<RenderResult>) | null = null;
	const SSR_MODULE_LOAD_TIMEOUT_MS = 30_000;
	const loadTimeout = setTimeout(() => {
		if (renderFn !== null) return;
		console.error("ssr.module.load-timeout", {
			timeoutMs: SSR_MODULE_LOAD_TIMEOUT_MS,
		});
		process.exit(1);
	}, SSR_MODULE_LOAD_TIMEOUT_MS);
	loadTimeout.unref();
	import("../entry-server").then(
		(mod) => {
			clearTimeout(loadTimeout);
			renderFn = mod.render;
		},
		(err) => {
			clearTimeout(loadTimeout);
			console.error("ssr.module.load-failed", {
				error: err instanceof Error ? err.stack : String(err),
			});
			process.exit(1);
		},
	);

	app.get(/.*/, async (req, res, next) => {
		if (req.method !== "GET") return next();
		if (req.path.startsWith("/api")) return next();
		if (extname(req.path)) return next();
		const sendFallback = () =>
			res
				.status(503)
				.set("Content-Type", "text/html; charset=utf-8")
				.set("Cache-Control", "no-store")
				.send(fallbackShell);
		if (renderFn === null) {
			// Module not yet resolved; fall back without logging to avoid startup
			// noise before the first render is even possible. A terminal load
			// failure (import reject or 30s timeout) process.exit(1)s from the
			// loader above, so this branch is only the brief warmup window.
			return sendFallback();
		}
		try {
			const result = await renderFn(req.url);
			if (result.redirect) {
				// Redirect thrown from a loader/action surfaces as a Response.
				// Forward it so the browser actually navigates to the new URL
				// instead of seeing an empty shell with a stale status.
				res.redirect(result.status, result.redirect);
				return;
			}
			if (!result.html) {
				// A non-redirect Response was thrown from a loader (e.g.
				// `throw new Response(null, { status: 404 })`). renderToString
				// produced no markup, so we have a real status but no body.
				// Log so the case is observable in ops dashboards, and mark
				// no-store so CDNs don't cache an empty page as a valid hit.
				// User-visible 404 / error pages should come from a route
				// errorElement, not from this fallback path.
				console.error("ssr.render.error-response", {
					url: req.url,
					status: result.status,
				});
				res
					.status(result.status)
					.set("Content-Type", "text/html; charset=utf-8")
					.set("Cache-Control", "no-store")
					.send(fallbackShell);
				return;
			}
			// Function replacements disable String.replace's $-special sequences
			// ($&, $', $`, $$) so user-authored titles / JSON-LD like
			// "Save $& today" insert literally instead of being interpolated.
			const out = template
				.replace("<!--app-head-->", () => result.head)
				.replace("<!--app-html-->", () => result.html);
			res
				.status(result.status)
				.set("Content-Type", "text/html; charset=utf-8")
				.set("Cache-Control", "no-cache")
				.send(out);
		} catch (err) {
			// 503 surfaces the failure in CDN/monitoring without caching a broken
			// page as success. console.error (not warn) puts it at the right log
			// level for the observability pipeline to alert on.
			console.error("ssr.render.failed", {
				url: req.url,
				// Log the full stack — React's renderToString annotates it with
				// the failing component's call tree, which the message alone
				// discards.
				error: err instanceof Error ? err.stack : String(err),
			});
			sendFallback();
		}
	});

	const shutdown = async (signal: string) => {
		console.log(`Got ${signal}, shutting down gracefully...`);
		// Scope the ERR_MODULE_NOT_FOUND suppression to the import() only.
		// A closeConnection() failure that happens to carry the same code
		// (unlikely but possible for wrapped errors) must not be silently
		// swallowed - it indicates a real db-close failure worth logging.
		let mod: { closeConnection?: () => Promise<void> | void } | null = null;
		try {
			const dbClient = "./db/client" + ".js";
			mod = await import(/* @vite-ignore */ dbClient);
		} catch (error: unknown) {
			const code = (error as { code?: string } | null)?.code;
			if (code !== "ERR_MODULE_NOT_FOUND") {
				console.error("ssr.shutdown.db-import-failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		if (mod && typeof mod.closeConnection === "function") {
			try {
				await mod.closeConnection();
				console.log("Database connections closed");
			} catch (error: unknown) {
				console.error("ssr.shutdown.db-close-failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		process.exit(0);
	};

	(["SIGTERM", "SIGINT"] as const).forEach((signal) => {
		process.once(signal, () => {
			void shutdown(signal);
		});
	});

	const rawPort = process.env.PORT || "3000";
	const port = parseInt(rawPort, 10);
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		// parseInt("abc") returns NaN; passing that to app.listen throws
		// synchronously before the server.on("error") handler below can catch
		// it. Fail fast with an actionable log rather than a cryptic crash.
		console.error("ssr.server.invalid-port", { rawPort });
		process.exit(1);
	}
	const host = process.env.HOST || "0.0.0.0";
	const server = app.listen(port, host, () => {
		console.log(`Ready at http://${host}:${port}`);
		// Start background watchers after the server is ready
		startQbitCompletionWatcher();
		// Scan for pre-downloaded media and backfill missing captions
		runStartupMediaSync();
	});
	server.on("error", (err: NodeJS.ErrnoException) => {
		console.error("ssr.server.listen-failed", {
			port,
			host,
			code: err.code,
			error: err.message,
		});
		process.exit(1);
	});
}

export default app;
