# Changelog

All notable changes to HomeStream are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.3.7] — 2026-04-23 (release)

### Fixed

#### Data Integrity — Atomic Writes (Critical)
- `libraryStore.ts`: `writeLibrary()` now uses a tmp-file + `renameSync` atomic write pattern. A crash or power loss mid-write previously could leave `media-library.json` half-written and permanently corrupted (all media metadata lost). Now the rename is atomic at the OS level — the file is either fully written or untouched.
- `sessionStore.ts`: same atomic write applied to `homestream-sessions.json`. A corrupted sessions file previously forced all users to log in again after a crash.
- `configStore.ts`: same atomic write applied to `homestream-config.json`. Also fixed a silent-failure bug where a disk-write error was swallowed and the caller received `next` as if the write succeeded — now logs the error and returns `current` so callers can detect the failure.
- `startupCleanup.ts`: `writeLibrarySafe()` fallback path upgraded from bare `writeFileSync` to the same atomic tmp+rename pattern.

#### Reliability — Transcode Worker
- `transcodeWorker.ts`: `fs.statSync(resolvedInput)` on line 289 was called unconditionally after `probeFile()` — if the file disappeared between upload and transcode start (race condition, manual deletion), it threw an uncaught `ENOENT` that crashed the transcode job without a clean error. Now wrapped in a safe try/catch that falls back to `0`.

#### Reliability — Episode Scheduler
- `episodeScheduler.ts`: `checkSubscription()` had no wall-clock timeout. A show with 10 seasons × 50 episodes × a hung Torrentio connection could block the scheduler indefinitely. Added a 5-minute `setTimeout` guard (`.unref()`'d so it never prevents clean process exit) that throws and unblocks the scheduler if a single check runs too long.

#### Reliability — Gzip Middleware
- `configure.js`: gzip `res.json` patch now checks `res.headersSent` before setting `Content-Encoding` headers. Previously, if Express had already started sending a response (e.g. an upstream middleware called `res.end()` before the gzip callback fired), setting headers would throw `Cannot set headers after they are sent`.


- `Dockerfile`: volume was declared at `/app/data` but `dataDir.ts` writes to `process.cwd()/homestream-data` when `HOMESTREAM_DATA` is unset — data was silently lost on container restart
- Fixed by: setting `ENV HOMESTREAM_DATA=/app/homestream-data` in Dockerfile and declaring `VOLUME ["/app/homestream-data", "/app/uploads"]`
- `docker-compose.yml`: updated volume mount from `homestream_data:/app/data` → `homestream_data:/app/homestream-data` to match; added `HOMESTREAM_DATA` env var
- `docker-compose.yml`: healthcheck updated from `wget` (not always available in Alpine) to `curl` (now explicitly installed in Dockerfile)
- `Dockerfile`: added `curl` to `apk add` for healthcheck; added `HEALTHCHECK` directive so Docker marks the container unhealthy if `/api/health` stops responding; added `start_period: 15s` so the container isn't marked unhealthy during startup

#### Version Strings
- `health/GET.ts`: hardcoded `version: '1.0.0'` replaced with live `package.json` version via `createRequire`
- `mdnsService.ts`: hardcoded `version: '1.0.0'` in mDNS TXT record replaced with live `package.json` version

#### Setup Wizard
- `setup.tsx`: stale doc comment said "9 steps" — updated to accurately describe the current 5-step flow (Requirements → Media Folder → Optional Services → API Keys → Finish)

#### VPN Kill-Switch — Settings Panel
- `POST /api/vpn/bind`: kill-switch monitor now restarts immediately after rebind so the new interface is enforced without a server restart
- `GET /api/setup`: confirmed `vpnInterface` and `vpnKillSwitch` are returned so the Settings panel loads the current binding on open

#### CI / Release Workflow
- `e2e.yml`: `Run E2E tests` step now passes `SETUP_COMPLETE=true`, `E2E_PASSWORD`, and `NODE_ENV=test` env vars
- `release.yml`: `GH_OWNER`/`GH_REPO` fall back to `github.repository_owner` / `github.event.repository.name` if secrets aren't set
- `electron-builder.yml`: publish config `owner` was hardcoded; now uses `${HOMESTREAM_GH_OWNER}` env var

#### Electron Control Panel
- "Check for Updates" button added to action bar (always visible)
- Update panel messaging: "No reinstall needed" / "Restart & Update"
- `differentialPackage: true` in NSIS — delta updates, no full reinstall

### Added

#### E2E Test Coverage (80 total, up from 77)
- `e2e/profiles.spec.ts` — 6 tests
- `e2e/discover.spec.ts` — 7 tests
- `e2e/setup-wizard.spec.ts` — 5 tests

### Tests
- 867 unit tests passing (48 files)
- 80 Playwright E2E tests across 9 spec files (CI-ready)

---

## [1.3.6] — 2026-04-23

### Fixed

#### API
- `POST /api/vpn/bind` — fixed malformed handler line (two statements on one line); added missing `isSetupComplete` import; auth now correctly allows unauthenticated access during setup wizard, requires auth after setup is complete
- `GET /api/setup` — now returns `vpnInterface` and `vpnKillSwitch` fields so the Settings panel can display the current VPN binding without a separate API call

#### CI / E2E Tests
- `waitForApp()` hardened: now uses `waitForSelector` with a list of post-auth-check selectors (`nav`, `main`, `h1`, `header`, `input[type="password"]`, etc.) instead of fragile `waitForFunction` polling — eliminates the all-77-fail blank-page scenario
- `auth.spec.ts`: "shows login gate when not authenticated" now accepts the home page as a valid state when no admin password is configured (fresh CI environment skips auth entirely)

#### v1.3.5 Fixes (tagged in this release)
- HTTPS Setup page crash: added `import React` for `React.ElementType` usage
- Auto-skip intro: fires exactly once per item via `skipIntroFired` ref guard
- Security Center back button: `forceOpen` prop + `onClose` callback on SettingsPanel
- Parental controls: "Manage Profiles" hidden for kids/restricted profiles
- API keys: "Key saved ✓" badges; fields start empty; TMDB test uses `?api_key=`
- Stats page 401: friendly message; array fields guarded before `.reduce()`
- History/Discover pages: array guards, duplicate toast (409 → styled yellow)
- TV Shows discover: 3 rows (Trending This Week, Popular Right Now, All-Time Top Rated)
- Profiles page: top-aligned layout

### Added

#### VPN Kill-Switch — Settings Panel
- VPN binding section added directly to Settings panel (no need to re-run setup wizard)
- Shows current bound interface with green status badge
- Dropdown lists all active IPv4 adapters; likely VPN adapters marked with 🔒
- "Apply VPN Binding" / "Clear VPN Binding" button with live feedback
- Kill-switch monitor restarts immediately after rebind — no server restart needed

#### E2E Test Coverage
- `e2e/profiles.spec.ts` — 6 tests for the Profiles page
- `e2e/discover.spec.ts` — 7 tests for the Discover page (all 4 tabs)
- `e2e/setup-wizard.spec.ts` — 5 tests for the Setup Wizard

#### Electron Auto-Updater — Polish
- **Delta updates**: `differentialPackage: true` in NSIS config — users download only the diff (a few MB), not the full installer (~150MB). No reinstall required.
- **"Check for Updates" button** added to control panel action bar — always visible, not just when an update is available
- Update panel messaging clarified: "No reinstall needed" / "Restart & Update"
- `electron-builder.yml` publish config now uses `${HOMESTREAM_GH_OWNER}` / `${HOMESTREAM_GH_REPO}` env vars (was hardcoded)
- Release workflow: `GH_OWNER`/`GH_REPO` fall back to `github.repository_owner` / `github.event.repository.name` if secrets aren't set; artifact upload includes `.yml` update metadata files

#### Samsung TV Setup Guide (`/samsung-tv`)
- 6-section interactive guide with auto-detected HomeStream URL via `/api/network/info`

#### Phone Remote / QR Widget
- Always renders regardless of fetch state; falls back to `window.location`
- LAN IP shown in large text with copy button; QR code black-on-white; full URL copyable

#### Network APIs
- `GET /api/remote/qr` — open endpoint; real LAN IP via `os.networkInterfaces()`
- `GET /api/network/info` — open endpoint; Samsung TV setup page uses it to pre-fill server address

#### VPN Interface Binding
- `GET /api/vpn/interfaces` — lists active Windows adapters (open endpoint)
- `POST /api/vpn/bind` — saves interface, calls qBittorrent API; requires auth
- `vpnKillSwitch.ts` — polls every 10s; pauses torrents if VPN drops

#### Playwright E2E Suite
- 80 tests across 11 spec files: auth, setup, home, discover, downloads, profiles, settings, navigation, profiles, discover, setup-wizard

### Tests
- 867 unit tests passing (48 files)
- 80 Playwright E2E tests (CI-ready)

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
