# Changelog

All notable changes to HomeStream are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.2.5] — 2026-04-22

### Fixed

#### Episode Scheduler
- Season advancement bug: `epStart` now only offsets the first season; S2+ correctly start at E1
- `infoHash` always uses `best.infoHash` (was sometimes using stale local variable)
- Catch-up subscriptions now have `.finally(() => scheduleOne(updated))` to guarantee rescheduling even on error
- Double-fire race condition fixed: `scheduleAllSubscriptions` skips `scheduleOne` for subs already being catch-up checked
- All scheduler timers now call `.unref()` so they don't block graceful shutdown
- `cancelAllSubscriptions()` exported for clean shutdown integration
- `savePath` uses `dataPath('downloads')` instead of hardcoded path

#### Security & API Hardening
- `hlsTranscoder.ts`: all imports moved to top-level (no dynamic require inside functions)
- `transcodeWorker.ts`: uses `createRequire` from `module` for CommonJS interop
- `torrentManager.ts`: stores absolute file paths; post-transcode library update fixed
- `startupCleanup.ts`: transcode revert now uses absolute paths (was breaking on relative paths)
- `backup/GET.ts`: uses `readLibrary()` / `readConfig()` / `readProfiles()` instead of direct fs reads; redacts `pinHash`
- `tracks/GET.ts`: replaced hardcoded `/private` path with `readLibrary()` lookup
- `captions/upload/POST.ts`: uses `writeLibrary(lib => ...)` updater pattern (safe concurrent writes)
- `chat/POST.ts` + `enrich/[id]/POST.ts`: standardised to `gemini-2.0-flash` model
- `stream/[filename]/GET.ts`: added `Vary: Range` header for correct CDN/proxy caching

#### TypeScript
- `downloads.tsx`: `act()` helper widened to accept `() => void | Promise<void>` (was rejecting sync callbacks)
- `torrent-download.test.ts`: fixed spread of `unknown[]` into typed mock function
- `profiles-store.test.ts`: fixed double-cast via `unknown` intermediate
- `session-store.test.ts`: removed unused `afterEach` import
- `download-duplicate-resume.test.ts`: removed unused `deleteJob` import

### Added

#### Test Suite (597 tests, 32 files — was 321/21)
- `downloads-get.test.ts` (37 tests): full coverage of `GET /api/stremio/downloads` — qBit offline path, online happy path with metadata merging, all 12 `normaliseQbitState` branches
- `downloads-controls.test.ts` (36 tests): full coverage of pause, resume, and priority endpoints — validation, offline guard, success, error handling
- `download-duplicate-resume.test.ts`: duplicate detection, `markJobInterrupted`, `getInterruptedJobs`, retry handler (WebTorrent + qBit paths)
- `stream.test.ts` (21 tests): range requests, 304 Not Modified, MIME types, path traversal protection, library-first resolution
- `torrent-download.test.ts`: validation, qBit vs WebTorrent routing, security scan, VPN integration, preloaded streams
- `torrent-delete.test.ts` (9 tests): all delete scenarios
- `torrent-manager.test.ts` (25 tests): `pickBestStream`, `parseResolution`, 1080p-over-4K preference logic

---

## [1.0.0] — 2026-04-20

First public release. 120 commits from initial scaffold to production-ready
self-hosted streaming app.

### Added

#### Core Streaming
- Custom HTML5 video player with full controls: seek bar, play/pause, volume,
  fullscreen, picture-in-picture, ±10s skip buttons
- Speed selector (3×, 2×, 1.5×, 1.25×, 1×, 0.75×, 0.5×) — highest-to-lowest order
- Keyboard shortcuts overlay (Space, ←/→, ↑/↓, F, M, C, I)
- Mobile double-tap seek (left = −10s, right = +10s)
- Hover seek thumbnails on the progress bar
- Skip Intro button with configurable timestamp
- Autoplay countdown + next-episode autoplay for TV series
- Resume playback — saves progress every 10s, resumes to exact second
- Per-profile watch progress (Adult and Kids profiles track separately)
- HLS transcoding for HEVC/H.265 files via FFmpeg + HLS.js
- Transcode status badge in player (live progress via SSE)
- Audio track switcher for multi-language files
- Closed caption support: auto-fetch EN/ES WebVTT from OpenSubtitles, SRT upload,
  one-key CC cycling (C key)

#### Library Management
- Automatic library scan on startup — finds all video files in media directory
- Folder watcher — auto-imports completed downloads without manual intervention
- File stability check — waits until file size stops changing before importing
- Existing media scanner — imports pre-existing RAID/NAS libraries on first run
- Upload via browser — drag-and-drop or file picker, up to 200 GB per file
- Smart transcode pipeline: probe codec → skip (already H.264) / remux / re-encode
- Post-encode size check — reverts to original if output is larger (saves space)
- Startup cleanup — resolves stuck `transcoding: true` flags after server restarts
- HLS orphan cleanup — deletes stale `/tmp/homestream-hls/` segments on restart
- Library deduplication — same file never imported twice (path + filename check)

#### Metadata & Enrichment
- OMDB integration — auto-fetches title, poster, rating, genre, plot, cast, director
- TMDB integration — additional metadata, posters, upcoming movies, trending content
- Graceful offline mode — imports work without internet; metadata retried on reconnect
- AI enrichment via Google Gemini — tags, mood, themes, summaries, similar titles
- AI enrichment via Ollama — local LLM alternative (no cloud required)
- AI Chat assistant — ask for recommendations from your personal library
- Enrichment wizard UI — step-by-step progress with per-field status indicators
- Enrichment reveal modal — animated card flip when AI data arrives

#### Discover Page
- Three tabs: Movies (upcoming + trending), TV Shows (trending), Search
- TMDB data with 30-day file-backed cache; `?refresh=1` forces fresh fetch
- Trailer modal with YouTube embed
- Download CTAs linking directly to Stremio/Torrentio search

#### Downloads
- Stremio/Torrentio integration — search and download torrents from the UI
- qBittorrent integration — full control via qBit REST API (add, pause, resume, delete)
- WebTorrent fallback — pure-JS torrent engine when qBit is not configured
- Quality selection strategy: prefer 720p–1080p, avoid 4K to save storage
- Unified downloads view — qBit torrents + WebTorrent jobs in one list
- Download completion toast with "Go to Library" action
- Active download badge on nav Downloads link (pulses while active)

#### Stats Dashboard *(new in v1.0)*
- Codec breakdown bar chart (H.264, H.265/HEVC, AV1, VP9, etc.) with file counts and sizes
- Resolution distribution (4K / 1080p / 720p / SD)
- Disk usage bar with free/used/total and library footprint
- Content type split (Movies vs TV Shows)
- Total watch time across all items
- Top 5 most-watched items with progress bars
- Recently added items (last 5)
- Genre distribution (top 10 genres)
- Live download/upload speed indicator from qBittorrent
- Session transfer totals (total downloaded / uploaded)
- Auto-refreshes every 10 seconds

#### Casting
- DLNA/UPnP casting — cast to any DLNA-compatible TV or receiver on the LAN
- Chromecast support — cast via Google Cast SDK
- Phone remote — WebSocket touch UI at `/remote`; QR code modal in header for easy pairing
- Jellyfin-compatible API — works with Infuse, Jellyfin mobile apps, and other clients
- mDNS/Bonjour service discovery — HomeStream announces itself on the local network

#### Profiles & Security
- Adult + Kids profiles — Kids profile filters content rated above PG
- 4-digit PIN lock on Adult profile — prevents kids from switching profiles
- Admin password — optional login gate for the whole app (bcrypt, auto-upgrades plaintext)
- Rate limiting — 10 login attempts per IP per 15 minutes; 5+ failures add 2s delay
- Session management — `POST /api/auth/logout-all` clears all active sessions
- 4-layer security scan on downloads: file extension → VirusTotal hash → magic bytes → archive inspection
- Quarantine system — suspicious files moved to quarantine, never executed
- Cookie consent banner (GDPR-friendly)

#### Setup Wizard
- 8-step guided setup: Welcome → Media Folder → qBittorrent → Jellyfin → VPN → API Keys → HTTPS → Finish
- REQUIRED / OPTIONAL / FREE badges on each step
- Green callout: "Minimum setup: Just set a media folder"
- Direct links to sign up for each optional service
- Setup completion triggers existing media scan + folder watcher activation

#### Infrastructure
- Express API server with file-based routing (`src/server/api/`)
- `media-library.json` — flat-file database; concurrent-safe via write queue
- `homestream-config.json` — persistent config store
- `crash-log.json` — last 100 crash entries with stack traces
- AppErrorBoundary — catches React render errors, posts to crash log API, shows recovery screen
- Debug Panel (dev-only) — crash log viewer, health check, probe cache stats
- Health check endpoint at `/api/health/full` — 7 subsystem status checks
- Probe cache — ffprobe results cached by file path + mtime (LRU, max 500 entries)
- Transcode store — in-memory job tracking with SSE progress streaming
- VPN integration — connect/disconnect WireGuard/OpenVPN from the UI
- HTTPS setup wizard at `/https-setup` — generates self-signed cert or configures Let's Encrypt
- Electron desktop app — wraps the server + UI in a native window (Windows/macOS/Linux)
- `ffmpeg-static` bundled — no manual FFmpeg install required
- Docker support — `Dockerfile` + `docker-compose.yml` for one-command deployment

#### UI & Design
- Netflix-style dark UI with 6 built-in color themes
- Hero banner with trailer hover preview on home page
- Lazy-loaded genre carousels (IntersectionObserver — only loads visible rows)
- MediaCard with context menu (right-click / long-press) for quick actions
- Watchlist / favorites page
- Watch history page with per-item removal and clear-all
- Episode tracker for TV series with season/episode navigation
- Responsive design — works on desktop, tablet, and mobile
- Animated transitions (Motion library) throughout

### Fixed *(pre-release bug fixes)*

- **Upload transcode error path** — `filePath` was stored as a relative URL
  (`/uploads/file.mp4`) instead of an absolute path, causing 404 on playback
  after a failed transcode. Now stores the absolute `inputPath`.
- **Demo item `addedAt`** — was set to `new Date()` at module load time, causing
  Big Buck Bunny to always appear as the most recently added item after every
  server restart. Now uses a fixed date (`2024-01-01`).
- **Stats dashboard demo filter** — stats endpoint filtered by `demoStream` flag
  but the demo item uses `isDemo: true`. Both flags are now checked.
- **Existing media scanner deduplication** — scanner only checked `originalFilename`
  for duplicates; now also checks `filename` to prevent re-importing transcoded files.
- **ESLint false positives** — 620 lint problems reduced to 0 errors / 23 warnings
  by adding all browser/DOM/Node globals and turning off `no-undef` in favour of
  TypeScript's type checker.
- **`startupCleanup.ts`** — `let result` → `const`; `setTimeout` → `global.setTimeout`
  (server file, not browser context).
- **`hlsTranscoder.ts` + `transcodeWorker.ts`** — `require('ffmpeg-static')` replaced
  with `createRequire(import.meta.url)` for correct ESM/CJS interop.
- **`MediaCard` + `MediaContextMenu`** — ternary-as-statement watchlist toggle
  replaced with `if/else` to satisfy `no-unused-expressions` lint rule.
- **`remote.tsx`** — `&&`-as-statement `clearTimeout` call replaced with `if` guard.
- **`EnrichmentWizard`** — unused `i` loop variable renamed to `_i`.

### Technical Notes

- esbuild target: `node22`; `webrtc-polyfill` stubbed to eliminate TLA propagation
- `electron/main.js` uses CommonJS `require()` — ESLint `no-var-requires` errors
  in that file are expected and acceptable (CJS file outside `src/`)
- `#airo/secrets` module alias is load-bearing platform infrastructure — never rename
- FFmpeg resolution order: `FFMPEG_PATH` env → `ffmpeg-static` → system `ffmpeg`
- HLS orphan deletion is unconditional on restart — in-memory jobs map is wiped,
  source files are intact, FFmpeg regenerates segments on next play request

---

## [0.9.0] — Pre-release development

Development builds leading to v1.0. Key milestones:

- Initial scaffold: Vite + React 19 + TypeScript + Express API routes
- TV show episode tracker with season/episode navigation
- Watchlist / favorites system
- Auto-transcode pipeline with progress bar (SSE streaming)
- AI enrichment integration (Gemini + Ollama)
- Torrent download system (WebTorrent + qBittorrent)
- Discover page with TMDB trending data and trailer modal
- Phone remote WebSocket UI with QR code pairing
- Electron desktop app with bundled FFmpeg
- Setup wizard (8 steps) with REQUIRED/OPTIONAL/FREE badges
- Crash logging system with Debug Panel
- HLS orphan cleanup on server restart
- Pre-launch lint audit: 620 → 0 errors

---

*HomeStream is MIT licensed. Contributions welcome.*
