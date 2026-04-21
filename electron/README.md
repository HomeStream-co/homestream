# HomeStream — Desktop App Build Guide

This directory contains the Electron wrapper that turns HomeStream into a
native desktop application with a system tray icon, control panel, and
auto-launch of the setup wizard on first run.

---

## What the .exe does

1. Launches a small **Control Panel** window showing server status + logs
2. Starts the HomeStream Express server as a background child process
3. Detects first run → automatically opens `http://localhost:3000/setup` in your browser
4. Adds a **system tray icon** — right-click to open browser, stop/start server, or quit
5. Keeps running in the tray when you close the control panel window

---

## Prerequisites (build machine only — NOT needed by end users)

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 22+ | https://nodejs.org |
| npm | 10+ | Comes with Node |
| Windows | 10/11 | Cross-compile from macOS/Linux is possible but not recommended for .exe |

End users need **nothing** pre-installed — FFmpeg is bundled inside the .exe.

---

## Build the Windows installer

```powershell
# 1. Install dependencies
npm install

# 2. Build the web app + server bundle, then package as .exe
npm run electron:win
```

Output files land in `dist-electron/`:

| File | Description |
|------|-------------|
| `HomeStream-Setup-1.x.x.exe` | NSIS installer — creates Start Menu + Desktop shortcuts |

---

## Build for other platforms

```bash
npm run electron:mac    # macOS .dmg (must run on macOS)
npm run electron:linux  # Linux .AppImage + .deb
npm run electron:build  # All platforms (requires platform-specific runners)
```

---

## ESM / CJS note (important for contributors)

`package.json` has `"type": "module"` which makes Node treat all `.js` files
as ES modules. Electron's main process requires CommonJS (`require()`), so all
Electron entry files use the `.cjs` extension to opt out of ESM:

| File | Purpose |
|------|---------|
| `electron/main.cjs` | Electron main process |
| `electron/updater.cjs` | Auto-updater logic |
| `electron/preload.cjs` | Context bridge (renderer ↔ main) |

The `.js` copies are kept as backups but are **not used** by the build.
`package.json` `"main"` field points to `electron/main.cjs`.
`electron-builder.yml` `files` array references `.cjs` filenames.

---

## Where user data is stored (end user's machine)

All data files are written to the OS user-data folder — **never** next to the .exe:

| OS | Path |
|----|------|
| Windows | `%APPDATA%\HomeStream\` |
| macOS | `~/Library/Application Support/HomeStream/` |
| Linux | `~/.config/HomeStream/` |

Files stored there:
- `homestream-config.json` — setup wizard results, API keys
- `media-library.json` — your media library index
- `homestream-profiles.json` — user profiles + PINs
- `homestream-sessions.json` — login sessions
- `homestream-downloads.json` — download job history
- `homestream-subscriptions.json` — auto-download subscriptions
- `tmdb-cache/` — cached TMDB metadata (refreshed every 30 days)

---

## Windows Defender SmartScreen

Unsigned `.exe` files trigger a SmartScreen warning ("Windows protected your PC")
on first run. Users can click **More info → Run anyway** to bypass it.

To eliminate the warning permanently, add an Authenticode code-signing cert:

1. Get a free OV cert from **Certum Open Source Code Signing**:
   https://www.certum.eu/en/cert_offer_en_open_source_cs.xml
2. Export the cert as a PFX file
3. Base64-encode it: `certutil -encode cert.pfx cert.b64`
4. Add two GitHub Actions secrets:
   - `WIN_CSC_LINK` — the base64 PFX content
   - `WIN_CSC_KEY_PASSWORD` — the PFX password
5. Uncomment the signing lines in `electron-builder.yml` and `release.yml`

---

## Auto-updater

The auto-updater checks GitHub Releases on startup (10-second delay) and
notifies the control panel if a newer version is available. Users choose
when to download and install.

GitHub repo is configured in `electron-builder.yml`:
```yaml
publish:
  owner: trevorrossworn-code
  repo: homestream
```

Required GitHub Actions secrets: `GH_TOKEN`, `GH_OWNER`, `GH_REPO`

---

## Releasing a new version

```bash
# Bump version in package.json, commit, then tag:
git add package.json
git commit -m "chore: bump to v1.2.0"
git push origin main
git tag v1.2.0
git push origin v1.2.0
```

GitHub Actions (`release.yml`) will build and publish the installer automatically.

### Re-tagging (rebuild the same version after a fix)

```bash
git pull origin main
git tag -d v1.1.0
git push origin --delete v1.1.0
git tag v1.1.0
git push origin v1.1.0
```

---

## Development mode

```powershell
# Terminal 1 — start the Vite dev server
npm run dev

# Terminal 2 — launch Electron pointing at the dev server
npm run electron:dev
```

In dev mode the Electron control panel shows a notice to use `npm run dev`
and does not spawn a server child process (Vite handles it).
