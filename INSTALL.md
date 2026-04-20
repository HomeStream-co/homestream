# HomeStream — Installation Guide

Three ways to run HomeStream. Pick the one that fits your situation.

---

## Option A — Quick Start (Gaming PC / Temporary Setup)

**Best for:** Running HomeStream on a PC you already use, while you build your dedicated server.  
**Requires:** Node.js installed. That's it.  
**No Electron build, no installer — just double-click and go.**

### Windows

1. Install **Node.js 22 LTS** from [nodejs.org](https://nodejs.org) if you haven't already
2. Download or clone this project to a folder (e.g. `C:\HomeStream`)
3. Double-click **`launch.bat`**

That's it. On first run it installs packages and builds the app (~3 minutes). Every run after that starts in seconds.

The console window that opens **is HomeStream** — keep it running while you stream. Close it to stop.

### Mac / Linux

```bash
# Make the script executable (first time only)
chmod +x launch.sh

# Run it
./launch.sh
```

### What happens on first run

```
[OK] Node.js v22 found
[1/2] Installing packages...   (~2 min, downloads ~500 MB)
[2/2] Building HomeStream...   (~1 min)

  Local:   http://localhost:3000
  Network: http://192.168.1.42:3000   ← share this with your phone

HomeStream opens in your browser automatically.
```

### Updating

When you pull new code, delete `dist/` and run `launch.bat` again — it will rebuild automatically.

---

## Option B — Full Desktop App (Recommended for Permanent Setup)

**Best for:** A dedicated media server or NAS.  
**Result:** A proper Windows `.exe` installer (or `.dmg` / `.AppImage`) that runs HomeStream as a native desktop app with a system tray icon. No Node.js required on the target machine.

### Build the installer (do this once, on any PC with Node.js)

**Windows:**
```
Double-click install.bat
```

**Mac / Linux:**
```bash
chmod +x install.sh && ./install.sh
```

This produces three files in `dist-electron\`:

| File | What it is |
|------|-----------|
| `HomeStream-Setup-x.x.x.exe` | Full NSIS installer — creates Start Menu + Desktop shortcuts |
| `HomeStream-x.x.x-portable.exe` | Portable — no install needed, run from anywhere |
| `HomeStream-x.x.x-win.zip` | ZIP archive — extract and run |

Copy any of these to your target PC and run it. **No Node.js required there.**

### What the desktop app gives you

- **System tray icon** — HomeStream runs in the background, accessible from the tray
- **Control panel** — shows server status, your local + network URLs, and a QR code
- **QR code** — scan with your phone to instantly open the mobile remote
- **Auto-start on login** — configure in Windows startup settings
- **First-run wizard** — opens automatically to walk you through setup

---

## Option C — Headless Server (Linux / NAS / Raspberry Pi)

**Best for:** A dedicated server with no monitor.

### Install

```bash
# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and build
git clone <your-repo> homestream
cd homestream
npm install
npm run build
```

### Run

```bash
node dist/server.bundle.mjs
```

HomeStream is now available at `http://<server-ip>:3000` from any device on your network.

### Run as a system service (auto-start on boot)

```bash
# Create a systemd service
sudo tee /etc/systemd/system/homestream.service > /dev/null <<EOF
[Unit]
Description=HomeStream Media Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(which node) $(pwd)/dist/server.bundle.mjs
Restart=on-failure
RestartSec=5
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable homestream
sudo systemctl start homestream

# Check status
sudo systemctl status homestream
```

---

## First-Run Setup Wizard

On first launch (any method), HomeStream opens the setup wizard automatically. You'll configure:

1. **Media folder** — where your movies and TV shows live
2. **qBittorrent** (optional) — for downloading via the Discover page
3. **VPN** (optional) — protects download traffic
4. **API keys** — TMDB (free) for movie artwork, Google AI for the in-player chat assistant
5. **Admin password** — secures your HomeStream instance

---

## Accessing HomeStream from Other Devices

| Device | How |
|--------|-----|
| Phone (remote control) | Scan the QR code in the Electron control panel, or go to `http://<your-pc-ip>:3000/remote` |
| Smart TV (Jellyfin app) | Add HomeStream as a Jellyfin server: `http://<your-pc-ip>:3000` |
| Another PC | Open `http://<your-pc-ip>:3000` in any browser |
| Infuse / Plex-compatible apps | Use the Jellyfin API endpoint |

All devices must be on the same WiFi/LAN network.

---

## Troubleshooting

**"Node.js not found"**  
Install from [nodejs.org](https://nodejs.org) — choose the LTS version. Restart your PC after installing.

**"Build failed"**  
Run `npm run build` manually and check the error. Usually a missing dependency — try `npm install` first.

**"Can't connect from phone"**  
Make sure your PC's firewall allows port 3000. On Windows: Windows Defender Firewall → Allow an app → add Node.js.

**"Port 3000 already in use"**  
Set a different port: `set PORT=3001 && node dist\server.bundle.mjs` (Windows) or `PORT=3001 node dist/server.bundle.mjs` (Mac/Linux).

**Electron app won't start**  
Check the log in the control panel window. Common cause: antivirus blocking the server process — add an exception for HomeStream.
