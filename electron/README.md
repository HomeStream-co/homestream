# HomeStream — Electron Desktop App

Wraps the HomeStream server + React UI in a native desktop app for Windows, macOS, and Linux.
No auto-updater — users download new versions manually.

## What it does

- **Control Panel window** — shows server status, LAN URL, start/stop button, live log viewer
- **System tray icon** — runs in the background; right-click for quick access
- **Opens in browser** — clicking "Open HomeStream" launches `http://localhost:3000` in the default browser
- **Phone remote** — LAN URL shown in the control panel; scan the QR code from `/remote`

## Prerequisites

- Node.js 22+
- npm dependencies installed (`npm install`)
- FFmpeg on PATH (for transcoding features)

## Build Steps

### 1. Build the web app

```bash
npm run build
```

This produces `dist/` (frontend) and `dist/server.bundle.mjs` (backend).

### 2. Build the Electron installer

```bash
# Current platform only:
npm run electron:build

# Specific platform:
npm run electron:win    # Windows .exe (NSIS installer)
npm run electron:mac    # macOS .dmg
npm run electron:linux  # Linux .AppImage + .deb
```

Output goes to `dist-electron/`.

## Development (no packaging)

Run the Vite dev server first, then launch Electron pointing at it:

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run electron:dev
```

In dev mode the control panel shows "Development mode — use npm run dev to start the server".
The server is already running via Vite, so just click "Open HomeStream".

## Icons

Icons are pre-generated in `electron/assets/`. To regenerate:

```bash
node electron/create-icons.mjs
```

For production `.ico` (Windows) and `.icns` (macOS), electron-builder auto-converts
`icon.png` on the respective platform. Alternatively:

- **Windows .ico**: `magick convert icon.png -resize 256x256 icon.ico`
- **macOS .icns**: Use `iconutil` on macOS or `electron-icon-maker`

## Architecture

```
electron/
├── main.js          — Electron main process (control panel, tray, server spawn)
├── preload.js       — IPC bridge (contextBridge → window.electronAPI)
├── electron-builder.yml
├── tray-icon.png    — 16×16 system tray icon
├── create-icons.mjs — Icon generator script
└── assets/
    ├── icon.png     — 512×512 app icon (source for all platforms)
    └── icon-256.png — 256×256 variant
```

### Server spawn

In packaged mode, `main.js` spawns `resources/server/server.bundle.mjs` as a child process
using the bundled Node.js runtime. The server listens on port 3000.

### Data directories

The server stores data in the user's home directory:
- **Media library**: configured via Setup Wizard (default: `~/Videos/HomeStream`)
- **Config**: `homestream-config.json` next to the server bundle
- **Watchlist / progress**: `watchlist.json`, `media-library.json`

## Installer output

| Platform | File                              |
|----------|-----------------------------------|
| Windows  | `HomeStream-Setup-1.0.0.exe`      |
| macOS    | `HomeStream-1.0.0.dmg`            |
| Linux    | `HomeStream-1.0.0.AppImage`       |
| Linux    | `homestream_1.0.0_amd64.deb`      |
