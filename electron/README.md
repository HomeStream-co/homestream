# HomeStream — Windows Electron Installer

This directory contains the Electron wrapper for building a native Windows `.exe` installer.

## Prerequisites

```bash
npm install --save-dev electron electron-builder electron-updater
```

## Build Steps

### 1. Build the frontend
```bash
npm run build
```

### 2. Bundle the server
```bash
npx esbuild src/server/index.ts \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=server-bundle/index.js \
  --external:better-sqlite3 \
  --external:fsevents
```

### 3. Build the Electron installer
```bash
npx electron-builder --win --config electron/electron-builder.yml
```

Output: `dist-electron/HomeStream-Setup-x.x.x.exe`

## What the installer does

- Installs HomeStream to `C:\Program Files\HomeStream\`
- Creates a Desktop shortcut
- Creates a Start Menu entry
- Adds an uninstaller
- On first launch: starts the HomeStream server on port 3000 and opens the UI

## Auto-updates

Set `publish.owner` and `publish.repo` in `electron-builder.yml` to your GitHub repo.
Upload the installer to a GitHub Release — the app will auto-update silently.

## Tray icon

The app runs in the system tray when the window is closed.
Double-click the tray icon to reopen the window.
Right-click for: Open, Open in Browser, Quit.

## Media directory

On Windows, the default media directory is `%USERPROFILE%\Videos\HomeStream`.
Users can change this in Settings → Setup Wizard.
