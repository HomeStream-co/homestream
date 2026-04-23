# HomeStream

**Self-hosted Netflix-style family media streaming** — watch your personal movie and TV collection from any device on your home network.

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
2. Go to: **https://github.com/trevorrossworn-code/homestream/releases/latest**
3. You'll see a page that says **"HomeStream v1.3.7"** at the top

### Step 2 — Download the installer

1. Scroll down on that page until you see a section called **"Assets"**
2. Click on the file named **`HomeStream-Setup-1.3.7.exe`**
3. Your browser will download it — check your **Downloads** folder

### Step 3 — Run the installer

1. Open your **Downloads** folder
2. Double-click **`HomeStream-Setup-1.3.7.exe`**
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

1. Go to **https://github.com/trevorrossworn-code/homestream/releases/latest**
2. Scroll to **Assets** and click **`HomeStream-1.3.7.dmg`**

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

```bash
# Download the AppImage
chmod +x HomeStream-1.3.7.AppImage
./HomeStream-1.3.7.AppImage
```

A `.deb` package is also available: `sudo dpkg -i HomeStream-1.3.7.deb`

---

## 🔄 Updates

HomeStream updates itself automatically. When a new version is available:
1. A notification appears in the **HomeStream Control Panel** (the icon in your system tray)
2. Click **"Install Update"**
3. HomeStream downloads and restarts — takes about 2 minutes
4. Your settings and watch history are never affected by updates

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
| **Video Player** | Play, pause, rewind 10s, fast forward, change speed |
| **Subtitles** | Auto-downloads captions in English and Spanish |
| **Resume Playback** | Picks up exactly where you left off |
| **Multiple Profiles** | Up to 6 profiles — one for each family member |
| **Kids Mode** | Hides anything rated above PG automatically |
| **PIN Lock** | Add a 4-digit PIN to any profile |
| **Download Movies** | Download via qBittorrent integration |
| **Cast to TV** | Chromecast and DLNA/smart TV support |
| **Phone Remote** | Control playback from your phone — scan a QR code |
| **AI Chat** | Ask for movie recommendations from your library |
| **Stats** | See how much storage you're using and what you've watched |

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

**Check if everything is working**
Open your browser and go to `http://localhost:5173/api/health`

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
      - "3000:3000"
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
# Open http://localhost:3000
```

---

## 🛠 Build from Source (Developers)

```bash
git clone https://github.com/trevorrossworn-code/homestream.git
cd homestream
npm install

# Run in development mode
npm run dev

# Build the Windows installer (must run on Windows)
npm run electron:win
```

**Automated releases via GitHub Actions** — push a version tag and the installer builds itself:

```bash
npm version 1.2.0
git push origin main --tags
```

See [`.github/RELEASE.md`](.github/RELEASE.md) for the one-time secrets setup.

---

## 📄 License

MIT — use freely, modify freely, no warranty.
