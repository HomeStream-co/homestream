<div align="center">

<img src="electron/icons/icon.png" alt="HomeStream" width="96" height="96" />

# HomeStream

**Self-hosted, Netflix-style family media streaming — on your own hardware.**

[![CI](https://github.com/HomeStream-co/homestream/actions/workflows/ci.yml/badge.svg)](https://github.com/HomeStream-co/homestream/actions/workflows/ci.yml)
[![Release](https://github.com/HomeStream-co/homestream/actions/workflows/release.yml/badge.svg)](https://github.com/HomeStream-co/homestream/actions/workflows/release.yml)
[![Tests](https://img.shields.io/badge/tests-1369%20passing-brightgreen)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/release/HomeStream-co/homestream)](https://github.com/HomeStream-co/homestream/releases/latest)

[Download](#installation) · [Screenshots](#screenshots) · [Features](#features) · [Setup](#quick-start) · [Contributing](CONTRIBUTING.md)

</div>

---

## What is HomeStream?

HomeStream is a full-featured, self-hosted media server you install on your own PC or NAS. It gives your whole family a polished Netflix-style interface to browse, stream, and download movies and TV shows — with parental controls, multiple profiles, hardware-accelerated transcoding, and a built-in download manager backed by Real-Debrid, qBittorrent, and WebTorrent.

No subscriptions. No cloud. Your media, your rules.

---

## Features

### Streaming & Playback
- **HLS transcoder** with hardware acceleration (NVENC, VAAPI, VideoToolbox) and software fallback
- **Direct stream** for browser-safe codecs — zero transcoding overhead
- **Chromecast & DLNA** cast support from the player
- **Closed captions** via OpenSubtitles with per-profile language preference
- **Resume playback** — progress saved every 10 s, on tab hide, and on close
- **Trailer previews** on hover via TMDB

### Download Manager
- **Real-Debrid** premium download backend (fastest)
- **qBittorrent** integration with restart persistence
- **WebTorrent** built-in fallback (no external client needed)
- **Three torrent sources**: Torrentio, Prowlarr (self-hosted), Nyaa.si (anime)
- **Full-series batch download** with smart episode scheduling
- **Queue priority reordering**, retry, resume, pause
- **Scheduled downloads** with live countdown
- **Duplicate detection** (409 on re-request)
- **Speed sparkline** and Real-Debrid expiry warning banner

### Profiles & Parental Controls
- **Netflix-style profile switcher** — up to 10 profiles
- **PIN-protected profiles** with bcrypt hashing
- **Per-profile content rating gate** (G / PG / PG-13 / R / NC-17)
- **Fail-closed** — unrated content is blocked for restricted profiles
- **Admin profile** with full access and settings

### Library & Metadata
- **Automatic library scan** — walks your media folder, imports with OMDB + TMDB metadata
- **AI enrichment** via Google Gemini or local Ollama — mood tags, summaries, smart recommendations
- **Watch folder** — new files auto-imported on drop
- **Episode tracker** for TV shows with per-episode progress
- **Watchlist** and **watch history**

### VPN
- **WireGuard** (Linux/macOS) and **OpenVPN** fallback
- **Kill switch** — pauses qBittorrent if VPN drops
- **Interface binding** — locks qBit traffic to VPN network interface
- **Auto fastest-server** selection before each download

### Remote & TV
- **Mobile remote control** — full player control from your phone's browser
- **Samsung Tizen TV** optimised UI (raw LAN IP, no mDNS)
- **QR code** pairing for instant remote access
- **AI chat assistant** on the remote for search and recommendations

### Infrastructure
- **5-step setup wizard** — guided first-run configuration
- **Backup & restore** — one-click config export/import
- **Auto-updater** — electron-updater with GitHub Releases
- **HTTPS setup wizard** — self-signed cert generation for LAN HTTPS
- **Security scanner** — threat detection and quarantine
- **Stats dashboard** — watch time, storage, download history
- **Crash logger** and **debug panel** for diagnostics
- **Jellyfin compatibility layer** — works with Stremio and other Jellyfin clients

---

## Installation

<<<<<<< HEAD
### Windows

Download the latest `HomeStream-Setup-*.exe` from [Releases](https://github.com/HomeStream-co/homestream/releases/latest) and run it. The installer includes auto-update support.

### Linux (AppImage — universal)

```bash
# Download
wget https://github.com/HomeStream-co/homestream/releases/latest/download/HomeStream-*.AppImage

# Make executable and run
=======
> **First time here?** Pick your operating system below and follow the steps in order. The whole process takes about 2 minutes.

---

### 🪟 Windows (Recommended — NSIS Installer)

The installer handles everything: installs the app, creates a Start Menu shortcut, and sets up auto-updates so you always get the latest version automatically.

**Step 1 — Download the installer**

Go to the [**Latest Release**](https://github.com/HomeStream-co/homestream/releases/latest) page and download the file named:

```
HomeStream-Setup-X.X.X.exe
```

> If your browser warns "this file may be harmful", click **Keep** — it is a standard NSIS installer and is safe.

**Step 2 — Run the installer**

Double-click the downloaded `.exe` file. If Windows SmartScreen shows a blue warning popup:
1. Click **More info**
2. Click **Run anyway**

Follow the on-screen prompts (Next → Install → Finish). HomeStream will launch automatically when the installer finishes.

**Step 3 — Complete the setup wizard**

See [Quick Start](#quick-start) below.

---

### 🐧 Linux — Choose your method

#### Option A: AppImage (works on any Linux distro — recommended for beginners)

No installation required. Download, make it executable, and run.

**Step 1 — Download**

Go to the [**Latest Release**](https://github.com/HomeStream-co/homestream/releases/latest) page and download the file named:

```
HomeStream-X.X.X.AppImage
```

Or use the terminal:

```bash
cd ~/Downloads
wget $(curl -s https://api.github.com/repos/HomeStream-co/homestream/releases/latest \
  | grep "browser_download_url.*AppImage" | grep -v arm64 | cut -d '"' -f 4)
```

**Step 2 — Make it executable and run**

```bash
cd ~/Downloads
>>>>>>> 20260604002244-9h9yrecco0
chmod +x HomeStream-*.AppImage
./HomeStream-*.AppImage
```

<<<<<<< HEAD
### Linux (Debian/Ubuntu — .deb)

```bash
wget https://github.com/HomeStream-co/homestream/releases/latest/download/homestream_*.deb
sudo dpkg -i homestream_*.deb
```

### Arch Linux / CachyOS / Manjaro (AUR)

```bash
yay -S homestream-bin
=======
> **Tip:** Right-click the AppImage → Properties → Permissions → check "Allow executing as program" if you prefer not to use the terminal.

**Step 3 — Complete the setup wizard**

See [Quick Start](#quick-start) below.

---

#### Option B: .deb package (Ubuntu, Debian, Linux Mint, Pop!_OS)

```bash
# Step 1 — Download
cd ~/Downloads
wget $(curl -s https://api.github.com/repos/HomeStream-co/homestream/releases/latest \
  | grep "browser_download_url.*\.deb" | cut -d '"' -f 4)

# Step 2 — Install
sudo dpkg -i homestream_*.deb

# Step 3 — Launch
homestream
```

If `dpkg` reports missing dependencies, run:

```bash
sudo apt-get install -f
>>>>>>> 20260604002244-9h9yrecco0
```

> **Note:** The repo is currently private. Ask the owner to share access or make it public before installing from GitHub Releases.

---

<<<<<<< HEAD
## Quick Start

1. **Install** HomeStream using one of the methods above.
2. **Launch** the app — it opens a browser window at `http://localhost:3000`.
3. **Complete the setup wizard** (5 steps):
   - System requirements check
   - Choose your media folder
   - Enter API keys (TMDB required; OMDB and Google AI optional)
   - Configure optional services (Real-Debrid, qBittorrent, VPN, Prowlarr)
   - Scan and import your existing library
4. **Start watching.**

### API Keys

| Key | Required | Where to get it |
|-----|----------|-----------------|
| TMDB | Yes | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) |
| OMDB | Optional | [omdbapi.com/apikey.aspx](http://www.omdbapi.com/apikey.aspx) |
| Google AI (Gemini) | Optional | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| Real-Debrid | Optional | [real-debrid.com/apitoken](https://real-debrid.com/apitoken) |
=======
#### Option C: pacman package (Arch Linux, CachyOS, Manjaro, EndeavourOS)

```bash
# Step 1 — Download
cd ~/Downloads
wget $(curl -s https://api.github.com/repos/HomeStream-co/homestream/releases/latest \
  | grep "browser_download_url.*\.pkg\.tar\.zst" | cut -d '"' -f 4)

# Step 2 — Install
sudo pacman -U homestream-*.pkg.tar.zst

# Step 3 — Launch
homestream
```

---

#### Option D: AUR (Arch-based — always gets the latest release automatically)

```bash
# Using yay
yay -S homestream-bin

# Or using paru
paru -S homestream-bin
```

---

### 📦 What each download file is

| File | What it is | Who should use it |
|------|-----------|-------------------|
| `HomeStream-Setup-X.X.X.exe` | Windows installer (auto-updater included) | Windows users |
| `HomeStream-X.X.X.exe` | Windows portable (no install needed, no auto-update) | USB / testing |
| `HomeStream-X.X.X.AppImage` | Linux universal (x64) | Any Linux distro |
| `HomeStream-X.X.X-arm64.AppImage` | Linux universal (ARM) | Raspberry Pi / ARM boards |
| `homestream_X.X.X_amd64.deb` | Debian/Ubuntu package | Ubuntu, Mint, Pop!_OS |
| `homestream-X.X.X.pkg.tar.zst` | Arch package | Arch, CachyOS, Manjaro |

All files are on the [Releases page](https://github.com/HomeStream-co/homestream/releases/latest).

---

## Quick Start

Once HomeStream is installed and running, a browser window opens at `http://localhost:3000`. You will be greeted by the **setup wizard** — it only runs once.

### Setup Wizard (5 steps, ~2 minutes)

| Step | What it does |
|------|-------------|
| 1. System Check | Verifies FFmpeg is available for transcoding |
| 2. Media Folder | Point HomeStream at the folder where your movies/shows live |
| 3. API Keys | Enter your TMDB key (required) and optional keys |
| 4. Optional Services | Connect Real-Debrid, qBittorrent, VPN, or Prowlarr if you use them |
| 5. Import Library | Scans your media folder and imports everything with metadata |

After the wizard completes you land on the home screen. That's it — start watching.

### API Keys

You will need a free TMDB key for metadata and posters. The others are optional.

| Key | Required | Free? | Get it here |
|-----|----------|-------|-------------|
| **TMDB** | ✅ Yes | ✅ Free | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) — sign up, go to Settings → API, request a key |
| OMDB | Optional | ✅ Free tier | [omdbapi.com/apikey.aspx](http://www.omdbapi.com/apikey.aspx) |
| Google AI (Gemini) | Optional | ✅ Free tier | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) — enables AI summaries and smart recommendations |
| Real-Debrid | Optional | 💳 Paid (~€4/mo) | [real-debrid.com/apitoken](https://real-debrid.com/apitoken) — fastest download backend |

> **Just want to stream files you already have?** You only need the TMDB key. Everything else is optional.
>>>>>>> 20260604002244-9h9yrecco0

---

## Screenshots

> Screenshots coming soon — contributions welcome!

---

## Architecture

```
HomeStream
├── Electron shell          Desktop wrapper, auto-updater, tray icon
├── Vite + React 19         Frontend SPA (TypeScript, Tailwind, shadcn/ui)
├── Express server          API layer (110+ routes, vite-plugin-api-routes)
├── HLS transcoder          FFmpeg, hardware encoder detection, probe cache
├── Download pipeline       Real-Debrid -> qBittorrent -> WebTorrent waterfall
├── Torrent sources         Torrentio, Prowlarr, Nyaa.si
├── VPN service             WireGuard / OpenVPN, kill switch, server ranking
├── Profiles & auth         bcryptjs PIN hashing, session store, rate limiter
├── Metadata                TMDB, OMDB, OpenSubtitles, Google Gemini / Ollama
└── Storage                 JSON flat-file store (config, library, profiles)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express, vite-plugin-api-routes |
| Desktop | Electron, electron-builder, electron-updater |
| Transcoding | FFmpeg (ffmpeg-static), HLS, NVENC/VAAPI/VideoToolbox |
| Testing | Vitest (1369 tests, 86 test files) |
| CI/CD | GitHub Actions (Tests, Lint, TypeScript, Build, Release) |
| Packaging | NSIS (Windows), AppImage + .deb + pacman (Linux), AUR |

---

## Development

### Prerequisites

- Node.js 22+
- npm 10+
- FFmpeg (bundled via `ffmpeg-static` — no manual install needed)

### Setup

```bash
git clone https://github.com/HomeStream-co/homestream.git
cd homestream
npm install
npm run dev
```

The dev server starts at `http://localhost:3000`.

### Commands

```bash
npm run dev          # Start dev server (Vite HMR + Express)
npm run build        # Production build (client + server bundle)
npm test             # Run all 1369 tests
npm run lint         # ESLint
npm run type-check   # TypeScript check
```

### Project Structure

```
src/
├── components/          React components (player, settings, UI)
├── context/             React context providers
├── hooks/               Custom React hooks
├── pages/               Route-level page components
│   └── setup/           5-step setup wizard
├── server/              Express server modules
│   └── api/             API route handlers (110+ endpoints)
├── test/                Vitest test suite (86 files)
└── types/               Shared TypeScript types

electron/                Electron main process, builder config
aur/                     Arch Linux AUR package (PKGBUILD, .SRCINFO)
.github/workflows/       CI + release workflows
scripts/                 Build and CI helper scripts
```

### Running Tests

```bash
npm test                          # All tests
npm test -- --run src/test/server # Server tests only
npm test -- --run src/test/ui     # UI tests only
npm test -- --reporter=verbose    # Verbose output
```

### Building a Release

Releases are built automatically by GitHub Actions when a tag is pushed:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This triggers the release workflow which builds:
- `HomeStream-Setup-*.exe` (Windows NSIS installer with auto-updater)
- `HomeStream-*.exe` (Windows portable)
- `HomeStream-*.AppImage` (Linux x64 + arm64)
- `homestream_*.deb` (Debian/Ubuntu)
- `homestream-*.pkg.tar.zst` (Arch/pacman)

---

## Configuration

HomeStream stores all configuration in JSON files in your user data directory:

| File | Contents |
|------|----------|
| `homestream-config.json` | Admin password, API keys, media/download dirs, preferences |
| `media-library.json` | Media items, watch progress, metadata |
| `homestream-profiles.json` | User profiles, PINs, rating limits |
| `homestream-ratelimit.json` | Rate limit buckets (persisted across restarts) |

Use **Settings > Backup** to export/import all configuration as a single ZIP.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on reporting bugs, requesting features, and submitting pull requests.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
Built with care. Self-hosted with pride.
</div>
