# Changelog

All notable changes to HomeStream are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-06-04

### Added
- **Smoke test script** (`scripts/smoke-test.mjs`) — 10 checks against a running server:
  - `GET /api/health` → 200 with `status:ok` and correct response shape
  - `POST /api/auth/login` with bad password → 401/429 (auth + rate limiter wired)
  - `GET /api/library` and `GET /api/profiles` without auth → 401/403 (auth middleware wired)
  - `GET /api/setup/status` → 200 (route registered)
  - `GET /api/network` → 200 or auth-gated
  - `GET /` → 200 HTML with `#root` element (frontend served)
  - Unknown API route → 404 (no crash)
  - Security headers present (warns in dev, does not fail)
  - Coloured terminal output, per-request timeout, 30s server wait with progress dots
- **`npm run smoke-test`** script in `package.json`
- **Smoke Test CI job** in `ci.yml` — runs after `build-check`, starts the production bundle,
  runs all 10 checks, stops the server

### Improved
- **README Installation section** completely rewritten for first-time users:
  - Windows: numbered steps, SmartScreen bypass tip, auto-update callout
  - Linux AppImage: `wget` one-liner via GitHub API, `chmod +x`, GUI tip
  - Linux .deb: smart `wget` + `apt-get install -f` dependency fix tip
  - Linux pacman: direct download + install commands
  - AUR: `yay` and `paru` examples
  - Download file reference table explaining all 6 release artifacts
  - Quick Start rewritten as a table with ~2 minute time estimate
  - API Keys table shows free/paid status with clearer signup links
  - Removed stale "repo is private" note

---

## [1.0.0] - 2026-06-03

First stable public release. Everything below was built and hardened across
the v1.9.x pre-release series before being promoted to v1.0.0.

### Core Platform
- 5-step setup wizard (system check, media folder, API keys, optional services, library import)
- SetupGuard redirect -- app is unusable until setup completes
- Electron desktop shell with tray icon, auto-updater (electron-updater + GitHub Releases)
- HTTPS setup wizard -- self-signed cert generation for LAN HTTPS
- Backup and restore -- one-click config ZIP export/import
- Auto-updater with drain endpoint and push notification
- Crash logger with persistent log and `/api/crash-log` endpoint
- Debug panel and system-info diagnostics endpoint
- Shutdown API with graceful HLS job cleanup

### Authentication & Sessions
- bcrypt admin password hashing (bcryptjs -- pure JS, works on all distros)
- httpOnly session cookie with configurable TTL
- Rate limiter with write-through persistence (`homestream-ratelimit.json`)
- Rate limit buckets survive server restarts
- `X-HS-Client: tv` header -- TV clients receive login body token; browsers do not
- Logout and logout-all endpoints
- Auth audit logging

### Profiles & Parental Controls
- Netflix-style profile switcher (up to 10 profiles)
- Server-side profile switching with PIN validation
- bcrypt PIN hashing per profile
- Per-profile content rating gate (G / PG / PG-13 / R / NC-17)
- Fail-closed rating gate -- unrated content blocked for restricted profiles
- Built-in Adult profile with `isAdmin: true`
- Profile create, edit, delete, PIN set/change
- Backup always merges built-in profiles after restore
- `realDebridApiKey` redacted from backup exports

### Streaming & Player
- HLS transcoder with FFmpeg
- Hardware encoder detection: NVENC (NVIDIA), VAAPI (Linux/Intel/AMD), VideoToolbox (macOS)
- Hardware encoder cached; `?refresh=1` forces re-detection
- Direct stream redirect for browser-safe codecs (zero transcoding overhead)
- CRF 22 quality target; configurable transcode preset
- Range requests always return 206
- TranscodeProgressOverlay -- FFmpeg progress, FPS, speed, ETA, encoder name
- HLS probe cache with TTL
- Resume playback -- progress saved every 10 s, on tab hide/blur, on unmount via sendBeacon
- 85% threshold triggers end overlay; 95% marks as watched
- Chromecast cast support (cast button, device discovery, position sync)
- DLNA position tracker
- Closed captions via OpenSubtitles -- per-profile language preference
- Caption upload endpoint
- Trailer hover preview via TMDB
- Player keyboard shortcuts overlay
- End-of-episode overlay with next-episode prompt

### Download Manager
- Real-Debrid premium backend (fastest path)
- qBittorrent integration with session cookie isolation (`isReachable()` liveness check)
- WebTorrent built-in fallback
- Download waterfall: RD first -> qBit -> WebTorrent
- Duplicate detection -- 409 on re-request
- Three torrent sources: Torrentio, Prowlarr (optional), Nyaa.si (anime)
- `pickBestStream()` with optional `preferredQuality` -- shared between download handler and episode scheduler
- Full-series batch download with probe loop result caching
- Queue priority reordering, retry, resume, pause
- Scheduled downloads with live countdown (`useCountdown` hook)
- Speed sparkline on download cards
- Real-Debrid expiry amber warning banner (<=7 days)
- Startup cleanup -- marks interrupted jobs; Resume button shown
- `downloadJobStore` write-through in-memory cache
- Download broadcaster (WebSocket push to all clients)

### Library & Metadata
- Library scan -- walks media directory, imports video files
- OMDB metadata fetch with TMDB poster fallback
- AI enrichment via Google Gemini or local Ollama (mood, tags, summary)
- `needsMetadata=true` flag -- retried on next startup for failed imports
- Media type defaults to `movie` when OMDB unavailable
- Existing media scanner -- deduplicates by absolute path
- Watch folder -- new files auto-imported via `folderWatcher`
- Episode tracker with per-episode progress
- Media CRUD (create, read, update, delete)
- Fetch metadata on demand per item
- Enrich on demand per item

### VPN
- WireGuard support (Linux/macOS)
- OpenVPN fallback
- Kill switch -- monitors VPN interface every 10 s; pauses qBit on disconnect
- `POST /api/vpn/bind` -- locks qBit traffic to VPN network interface
- Auto fastest-server selection (ping-based ranking)
- VPN server ranker with configurable known-servers list

### Remote Control & TV
- Mobile remote control -- full player control from phone browser
- QR code pairing (`/api/remote/qr`)
- Remote tabs: Search, Browse, Cast, Download, AI
- Samsung Tizen TV optimised UI (raw LAN IP, no mDNS)
- Global remote launch hook

### Watchlist & History
- Watchlist add/remove/list
- Watch history with clear endpoint
- Stats dashboard -- watch time, storage usage, download history

### Jellyfin Compatibility
- Jellyfin API compatibility layer (Items, Users, Sessions, Videos, Search, System)
- Jellyfin auth shim
- Jellyfin discovery (mDNS broadcast)
- Works with Stremio and other Jellyfin clients

### Security
- Threat scanner with quarantine
- Security panel UI
- Auth middleware on all protected routes
- Ownership seed (first-run admin setup)

### Infrastructure & CI
- 110+ API routes (vite-plugin-api-routes, file-system based)
- WebSocket download broadcaster
- mDNS service (`.local` hostname broadcast)
- Network info endpoint
- 86 test files, 1369 tests (Vitest)
- GitHub Actions CI: TypeScript, Tests, Lint, Build
- GitHub Actions Release: Windows NSIS + portable, Linux AppImage (x64/arm64) + .deb + pacman
- AUR package (`homestream-bin`) with CI auto-publish
- All workflow files ASCII-clean (GitHub Actions parser compatible)

---

## Pre-release History

### [1.9.4] - 2026-06-03
- fix: replace `<<'SSHEOF'` heredoc with `printf` in release.yml AUR SSH config step
  (YAML merge-key operator `<<` inside `run: |` caused GitHub Actions parser to silently produce 0 jobs)
- fix: sync `package.json` version from git tag before `electron-builder` runs
  (builder was creating releases tagged `v1.9.4` regardless of the pushed tag; un-draft step then failed)
- fix: add `permissions: contents: write` block to release.yml
- fix: improve `ci.mjs` diagnostics -- show `conclusion` and `event` on 0-job runs; distinguish `skipped` from `failure`

### [1.9.3] - 2026-06-02
- feat: profiles & rating gate hardening
- fix: `ratingGate.ts` fail-closed for unrated content
- fix: built-in profiles always merged after backup restore
- fix: `realDebridApiKey` redacted from backup exports
- test: 13 new rating gate tests, 10 new profiles-admin-guard tests

### [1.9.2] - 2026-06-01
- feat: download waterfall (RD -> qBit -> WebTorrent)
- feat: `pickBestStream()` with `preferredQuality`
- feat: full-series batch download with probe cache reuse
- feat: startup cleanup marks interrupted jobs
- fix: `isReachable()` replaces `testConnection()` -- prevents shared sessionCookie corruption
- fix: `downloadJobStore` write-through cache

### [1.9.1] - 2026-05-31
- feat: HLS transcoder with hardware encoder detection
- feat: NVENC / VAAPI / VideoToolbox support
- feat: TranscodeProgressOverlay
- feat: range requests always 206
- feat: rating gate applied to stream handler

### [1.9.0] - 2026-05-30
- feat: initial full build -- all phases complete
- feat: setup wizard (5 steps)
- feat: auth + session + rate limiter
- feat: profiles + PIN + parental controls
- feat: download manager (RD, qBit, WebTorrent, Torrentio, Prowlarr, Nyaa)
- feat: HLS transcoder
- feat: VPN (WireGuard/OpenVPN, kill switch)
- feat: captions (OpenSubtitles)
- feat: cast (Chromecast, DLNA)
- feat: Jellyfin compatibility layer
- feat: library scan + AI enrichment
- feat: watch progress + continue watching
- feat: remote control + Samsung TV UI
- feat: backup/restore, stats, history, watchlist
- feat: 86 test files, 1369 tests passing
