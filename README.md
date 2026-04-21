# HomeStream

**Self-hosted Netflix-style family media streaming** — watch your personal movie and TV collection from any device on your home network.

---

## Install (Desktop App — Easiest)

HomeStream runs as a native desktop app on Windows, macOS, and Linux.  
No Docker, no command line, no configuration files needed.

### Windows

1. Download **`HomeStream-Setup-1.1.0.exe`** from the [Releases page](https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest)
2. Double-click the installer and follow the prompts
3. HomeStream launches automatically and opens the setup wizard in your browser

### macOS

1. Download **`HomeStream-1.1.0.dmg`** from the [Releases page](https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest)
2. Open the `.dmg` and drag **HomeStream** to your Applications folder
3. Open HomeStream from Applications — the setup wizard opens in your browser

> **macOS Gatekeeper:** If you see "unidentified developer", right-click the app → Open → Open anyway.

### Linux

1. Download **`HomeStream-1.1.0.AppImage`** from the [Releases page](https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest)
2. Make it executable and run it:
   ```bash
   chmod +x HomeStream-*.AppImage
   ./HomeStream-*.AppImage
   ```
3. The setup wizard opens in your browser automatically

> A `.deb` package is also available for Debian/Ubuntu: `sudo dpkg -i HomeStream-*.deb`

---

## First Run — Setup Wizard

On first launch, HomeStream automatically opens a **5-step setup wizard** in your browser:

1. **Requirements** — checks FFmpeg and system dependencies
2. **Media Folder** — point HomeStream at your video files
3. **Optional Services** *(optional)* — connect qBittorrent and/or Jellyfin
4. **API Keys** *(optional)* — TMDB for metadata, Gemini for AI features
5. **Finish** — saves config and kicks off your first library scan

Everything is optional except the media folder. You can skip any step and configure it later in Settings.

---

## Features

| Feature | Details |
|---|---|
| **Video Player** | Custom controls, ±10s seek, speed 0.5×–3×, keyboard shortcuts |
| **Closed Captions** | Auto-fetch EN/ES WebVTT, SRT upload, one-key CC cycling |
| **Resume Playback** | Saves progress every 10s; resumes to exact second |
| **Multi-Profile** | Up to 6 profiles; Kids Mode filters G/PG content only |
| **PIN Lock** | Optional 4-digit PIN on Adult profiles |
| **Watch History** | Full history with per-item removal |
| **Watchlist** | Bookmark titles to watch later |
| **AI Enrichment** | Gemini-powered tags, mood, themes, summaries, similar titles |
| **AI Chat** | Ask for recommendations from your library |
| **Torrent Downloads** | Stremio/Torrentio + qBittorrent integration |
| **Security Scanning** | Extension check → VirusTotal → magic bytes → archive inspection |
| **DLNA Casting** | Cast to any DLNA/UPnP TV on your network |
| **Chromecast** | Cast to Chromecast devices |
| **Phone Remote** | WebSocket touch remote — scan QR code from your phone |
| **Stats Dashboard** | Codec breakdown, storage, resolution split, watch time |
| **Transcoding** | FFmpeg H.264 re-encode for browser compatibility; HEVC via HLS |
| **Jellyfin API** | Compatible with Infuse, Jellyfin apps, and other Jellyfin clients |
| **Dark Themes** | 6 built-in themes |

---

## Media Folder Structure

HomeStream scans your media folder recursively. Supported formats: `.mp4`, `.mkv`, `.avi`, `.webm`, `.mov`, `.m4v`

```
/your-media-folder
├── movies/
│   ├── Inception (2010).mkv
│   ├── The Dark Knight (2008).mp4
│   └── ...
└── tv/
    ├── Breaking Bad S01E01.mkv
    ├── Breaking Bad S01E02.mkv
    └── ...
```

**Naming tips for best metadata matching:**
- Movies: `Title (Year).ext` → `Inception (2010).mkv`
- TV Shows: `Show Name S01E01.ext` → `Breaking Bad S01E01.mkv`

---

## Docker Deployment (Headless / Server)

If you want to run HomeStream on a server without a desktop, use Docker:

```yaml
# docker-compose.yml
version: "3.9"
services:
  homestream:
    build: .
    container_name: homestream
    restart: unless-stopped
    ports:
      - "8080:5173"
    volumes:
      - /your/media/folder:/media
      - homestream-data:/data
    environment:
      MEDIA_DIR: /media
      ADMIN_PASSWORD: ""        # set a strong password if exposing to internet
      OMDB_API_KEY: ""          # https://www.omdbapi.com/apikey.aspx (free)
      TMDB_API_KEY: ""          # https://www.themoviedb.org/settings/api (free)
      GEMINI_API_KEY: ""        # https://aistudio.google.com/app/apikey (free)

volumes:
  homestream-data:
```

```bash
docker compose up -d
# Open http://localhost:8080
```

---

## Security

- **Admin Password** — set in Settings to require login before accessing the app
- **Profile PINs** — 4-digit PIN to lock Adult profiles on shared devices
- **Kids Mode** — automatically filters content rated above PG

> Always set an Admin Password if exposing HomeStream to the internet.

---

## Troubleshooting

**Video won't play / shows transcoding spinner**
FFmpeg is re-encoding the file for browser compatibility. This happens once per file. If stuck, go to **Settings → Debug Panel → Quick Fixes → Fix Stuck Transcodes**.

**No poster or metadata**
Add a TMDB API key in **Settings → API Keys**. Free tier at [themoviedb.org](https://www.themoviedb.org/settings/api).

**Can't find media files**
Use **Settings → Scan for New Files** to trigger a manual scan.

**Disk space filling up**
Go to **Settings → Debug Panel → Quick Fixes → Purge Orphaned Upload Files** to reclaim space from failed or partial uploads.

**Stale or missing metadata**
Go to **Settings → Debug Panel → Quick Fixes → Clear TMDB Cache** to force a full re-fetch.

**Health check**
Visit `/api/health` in your browser for a live status of all subsystems.

---

## Building from Source

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd homestream

# Install dependencies
npm install

# Run in development mode (browser only)
npm run dev

# Build the Windows installer (must run on Windows)
npm run electron:win
```

> **FFmpeg is bundled automatically** via `ffmpeg-static` — no manual install needed.

### Automated releases via GitHub Actions

Push a version tag and GitHub Actions builds and publishes the installer automatically:

```bash
npm version 1.2.0          # bumps package.json + creates tag
git push origin main --tags # triggers the build
```

See [`.github/RELEASE.md`](.github/RELEASE.md) for the one-time secrets setup required.

---

## License

MIT — use freely, modify freely, no warranty.
