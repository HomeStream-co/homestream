# HomeStream

**Self-hosted Netflix-style family media streaming** — watch your personal movie and TV collection from any device on your home network.

> **Current version: 1.8.7** — [Download the latest release →](https://github.com/HomeStream-co/homestream/releases/latest)

---

## ⚠️ BEFORE YOU START — Read This First

You need a **free GitHub account** to download HomeStream. If you don't have one:
1. Go to **https://github.com**
2. Click the big green **Sign up** button
3. Follow the steps — it's free and takes 2 minutes

---

## 🪟 Install on Windows (Step-by-Step)

> ⏱ Takes about **10 minutes** from start to watching your first video.

### Step 1 — Go to the Releases page

1. Open your web browser (Chrome, Edge, Firefox — any of them)
2. Go to: **https://github.com/HomeStream-co/homestream/releases/latest**
3. You'll see a page that says **"HomeStream v1.8.7"** at the top

### Step 2 — Download the installer

1. Scroll down on that page until you see a section called **"Assets"**
2. Click on the file named **`HomeStream-Setup-1.8.7.exe`**
3. Your browser will download it — check your **Downloads** folder

### Step 3 — Run the installer

1. Open your **Downloads** folder
2. Double-click **`HomeStream-Setup-1.8.7.exe`**
3. Windows will show a blue warning that says **"Windows protected your PC"**
   - This is normal — the app just isn't signed yet
   - Click **"More info"** (it's a small link in the middle of the box)
   - Then click the **"Run anyway"** button that appears
4. The installer opens — click **Next**, then **Install**, then **Finish**
5. HomeStream starts automatically and opens in your browser

### Step 4 — Run the Setup Wizard

HomeStream will open a setup page in your browser automatically. It has **5 steps**:

| Step | What to do |
|---|---|
| **1. Requirements** | Just click **Next** — it checks your system automatically |
| **2. Media Folder** | Click **Browse** and pick the folder where your movies/shows are saved |
| **3. Optional Services** | Click **Skip** unless you have qBittorrent or Jellyfin installed |
| **4. API Keys** | Click **Skip** for now — you can add these later |
| **5. Finish** | Click **Finish** — HomeStream scans your media folder |

### Step 5 — Start watching

1. HomeStream takes you to the home screen
2. Your movies and TV shows appear automatically (posters load in the background)
3. Click any title to start watching

---

## 🍎 Install on Mac

### Step 1 — Download

1. Go to **https://github.com/HomeStream-co/homestream/releases/latest**
2. Scroll to **Assets** and click **`HomeStream-1.8.7.dmg`**

### Step 2 — Install

1. Open your **Downloads** folder and double-click the `.dmg` file
2. A window opens showing the HomeStream icon and an Applications folder
3. Drag the **HomeStream** icon onto the **Applications** folder icon
4. Wait for it to copy, then close the window

### Step 3 — Open it

1. Open your **Applications** folder
2. Double-click **HomeStream**
3. Mac will say **"HomeStream can't be opened because it's from an unidentified developer"**
   - Don't panic — this is normal
   - **Right-click** the HomeStream icon → click **Open** → click **Open** again
4. HomeStream opens in your browser — follow the Setup Wizard (same 5 steps as Windows above)

---

## 🐧 Install on Linux

HomeStream ships three Linux packages — pick whichever fits your distro.

### Option A — One-command installer (recommended)

Works on Arch/CachyOS (pacman), Debian/Ubuntu (apt), and Fedora (dnf):

```bash
curl -fsSL https://github.com/HomeStream-co/homestream/releases/latest/download/install-linux.sh | bash
```

The script auto-detects your distro, installs dependencies (FFmpeg, WireGuard tools), and launches HomeStream.

### Option B — AppImage (any distro, no install needed)

```bash
# Download
wget https://github.com/HomeStream-co/homestream/releases/latest/download/HomeStream-1.8.7.AppImage

# Make executable and run
chmod +x HomeStream-1.8.7.AppImage
./HomeStream-1.8.7.AppImage
```

### Option C — Native packages

| Distro | Package | Command |
|---|---|---|
| Arch / CachyOS / Manjaro | `.pkg.tar.zst` (pacman) | `sudo pacman -U HomeStream-1.8.7.pkg.tar.zst` |
| Debian / Ubuntu / Mint | `.deb` | `sudo dpkg -i HomeStream-1.8.7.deb` |

### Linux — VPN / WireGuard (optional)

HomeStream's VPN kill-switch uses WireGuard. Install it first if you want that feature:

```bash
# Arch / CachyOS
sudo pacman -S wireguard-tools

# Debian / Ubuntu
sudo apt install wireguard-tools

# Fedora
sudo dnf install wireguard-tools
```

Then in HomeStream go to **Settings → VPN** to bind your WireGuard interface.

---

## 🔄 Updates

HomeStream updates itself automatically. When a new version is available:
1. A notification appears in the **HomeStream Control Panel** (the icon in your system tray)
2. Click **"Install Update"**
3. HomeStream downloads and restarts — takes about 2 minutes
4. Your settings and watch history are never affected by updates

You can also check manually: **Settings → Advanced → Check for Updates**

---

## 📁 How to Organize Your Media Files

HomeStream finds your movies and shows automatically if you name them like this:

```
/your-media-folder
├── movies/
│   ├── Inception (2010).mkv
│   ├── The Dark Knight (2008).mp4
│   └── Interstellar (2014).mkv
└── tv/
    ├── Breaking Bad S01E01.mkv
    ├── Breaking Bad S01E02.mkv
    └── Stranger Things S02E03.mp4
```

**Naming tips:**
- Movies → `Movie Name (Year).mp4` — example: `Toy Story (1995).mp4`
- TV Shows → `Show Name S01E01.mp4` — example: `Friends S03E12.mp4`

Supported file types: `.mp4` `.mkv` `.avi` `.webm` `.mov` `.m4v`

---

## ✨ Features

| Feature | What it does |
|---|---|
| **Video Player** | Play, pause, rewind 10s, fast forward, change speed, subtitles |
| **Resume Playback** | Picks up exactly where you left off — progress saved every 10 seconds |
| **Continue Watching** | Home screen row shows in-progress titles with time remaining |
| **Multiple Profiles** | Up to 6 profiles — one for each family member |
| **Kids Mode** | Hides anything rated above PG automatically |
| **PIN Lock** | Add a 4-digit PIN to any profile |
| **Downloads** | Download via Real-Debrid, qBittorrent, or WebTorrent (waterfall fallback) |
| **Real-Debrid** | Premium cached torrent downloads — instant, no seeding required |
| **Cast to TV** | Chromecast and DLNA/smart TV support with seek bar |
| **Phone Remote** | Control playback from your phone — scan a QR code |
| **AI Recommendations** | Ask for movie suggestions from your own library (Gemini AI) |
| **AI Enrichment** | Auto-generates tags, mood, themes, content warnings, and "why watch" blurbs |
| **VPN Kill-Switch** | Pauses torrents automatically if your VPN drops |
| **Auto-Updater** | Delta updates — downloads only what changed, no reinstall |
| **Bug Reporter** | One-click diagnostic report with system info, errors, and version |
| **Stats** | Storage usage, watch history, and library breakdown |
| **Samsung TV** | Dedicated TV-mode UI with D-pad navigation and QR pairing |
| **Docker** | Run headless on a home server or NAS |

---

## 🐛 Reporting a Bug

HomeStream has a built-in bug reporter. Click the **feedback icon** (bottom-right corner of any page), go to the **"Copy Bug Report"** tab, and copy the diagnostic report. Share it with us by opening a GitHub issue or pasting it in a message.

The report includes your HomeStream version, OS, recent errors, and system info — no passwords or media filenames are included.

---

## 🔧 Troubleshooting

**Video is stuck on a loading spinner**
Go to **Settings → Debug Panel → Quick Fixes → Fix Stuck Transcodes** and click the button.

**No movie posters or info showing**
Go to **Settings → API Keys** and add a free TMDB key from [themoviedb.org](https://www.themoviedb.org/settings/api).

**HomeStream can't find my files**
Go to **Settings → Scan for New Files**.

**Running out of disk space**
Go to **Settings → Debug Panel → Quick Fixes → Purge Orphaned Upload Files**.

**Something looks wrong with movie info**
Go to **Settings → Debug Panel → Quick Fixes → Clear TMDB Cache**.

**Real-Debrid downloads not starting**
Check **Downloads** — if the RD expiry banner is showing, your premium subscription may have lapsed. Stuck jobs reset automatically on restart.

**Check if everything is working**
Open your browser and go to `http://localhost:20010/api/health`

---

## 🐳 Run on a Server (Advanced)

If you want HomeStream running 24/7 on a home server or NAS without a desktop, use Docker:

```yaml
# docker-compose.yml
version: "3.9"
services:
  homestream:
    build: .
    container_name: homestream
    restart: unless-stopped
    ports:
      - "20010:20010"
    volumes:
      - /your/media/folder:/media
      - homestream_data:/app/homestream-data
    environment:
      MEDIA_DIR: /media
      HOMESTREAM_DATA: /app/homestream-data
      TMDB_API_KEY: ""
      GOOGLE_AI_API_KEY: ""

volumes:
  homestream_data:
```

```bash
docker compose up -d
# Open http://localhost:20010
```

---

## 🛠 Build from Source (Developers)

```bash
git clone https://github.com/HomeStream-co/homestream.git
cd homestream
npm install

# Run in development mode (port 20010)
npm run dev

# Build the Windows installer (must run on Windows or CI)
npm run electron:win

# Build the Linux packages (AppImage + .deb + .pkg.tar.zst)
npm run electron:linux
```

**Automated releases via GitHub Actions** — push a version tag and the installers build themselves for Windows and Linux:

```bash
npm version 1.8.7
git push origin main --tags
```

See [`.github/RELEASE.md`](.github/RELEASE.md) for the one-time secrets setup.

**Run tests:**

```bash
npm test              # 83 test files, 1277 unit tests
npm run test:e2e      # Playwright E2E suite
npm run type-check    # TypeScript strict check
npm run lint          # ESLint
```

---

## 📄 License

MIT — use freely, modify freely, no warranty.
