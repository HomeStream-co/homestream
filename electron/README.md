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
| `HomeStream-Setup-1.0.0.exe` | NSIS installer — creates Start Menu + Desktop shortcuts |
| `HomeStream-1.0.0-portable.exe` | Portable — no install needed, run from anywhere |
| `HomeStream-1.0.0-win.zip` | ZIP archive for manual deployment |

---

## Build for other platforms

```bash
npm run electron:mac    # macOS .dmg (must run on macOS)
npm run electron:linux  # Linux .AppImage + .deb
npm run electron:build  # All platforms (requires platform-specific runners)
```

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

## Auto-updater (optional)

By default the auto-updater is **disabled** — the placeholder `owner`/`repo`
values in `electron-builder.yml` are detected and skipped gracefully.

To enable it:
1. Create a GitHub repo for your HomeStream fork
2. Edit `electron/electron-builder.yml`:
   ```yaml
   publish:
     owner: your-github-username
     repo: your-repo-name
   ```
3. Set `GH_TOKEN` env var when publishing:
   ```powershell
   $env:GH_TOKEN="ghp_yourtoken"
   npm run electron:publish
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
