# HomeStream

**Self-hosted Netflix-style family media streaming** — watch your personal movie and TV collection from any device on your home network.

---

## Install (Desktop App — Easiest)

HomeStream runs as a native desktop app on Windows, macOS, and Linux.  
No Docker, no command line, no configuration files needed.

### Windows

1. Download **`HomeStream-Setup-x.x.x.exe`** from the [Releases page](https://github.com/homestream-app/homestream/releases/latest)
2. Double-click the installer and follow the prompts
3. HomeStream launches automatically and opens the setup wizard in your browser

### macOS

1. Download **`HomeStream-x.x.x.dmg`** from the [Releases page](https://github.com/homestream-app/homestream/releases/latest)
2. Open the `.dmg` and drag **HomeStream** to your Applications folder
3. Open HomeStream from Applications — the setup wizard opens in your browser

> **macOS Gatekeeper:** If you see "unidentified developer", right-click the app → Open → Open anyway.

### Linux

1. Download **`HomeStream-x.x.x.AppImage`** from the [Releases page](https://github.com/homestream-app/homestream/releases/latest)
2. Make it executable and run it:
   ```bash
   chmod +x HomeStream-*.AppImage
   ./HomeStream-*.AppImage
   ```
3. The setup wizard opens in your browser automatically

> A `.deb` package is also available for Debian/Ubuntu: `sudo dpkg -i HomeStream-*.deb`

---

## First Run — Setup Wizard

On first launch, HomeStream automatically opens a **setup wizard** in your browser that walks you through:

1. **Media Folder** — point HomeStream at your video files
2. **qBittorrent** *(optional)* — connect your torrent client for downloads
3. **Jellyfin** *(optional)* — enable Jellyfin API compatibility for TV apps
4. **VPN** *(optional)* — configure VPN kill-switch for downloads
5. **API Keys** *(optional)* — OMDB/TMDB for metadata, Gemini for AI features
6. **HTTPS** *(optional)* — enable HTTPS for remote access

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
FFmpeg is re-encoding the file for browser compatibility. This happens once per file. If stuck, go to **Settings → Debug Panel → Fix Stuck Transcodes**.

**No poster or metadata**
Add an OMDB API key in **Settings → API Keys**. Free tier: 1,000 requests/day.

**Can't find media files**
Use **Settings → Scan for New Files** to trigger a manual scan.

**Health check**
Visit `/api/health` in your browser for a live status of all subsystems.

---

## Building from Source

```bash
# Clone
git clone https://github.com/homestream-app/homestream.git
cd homestream

# macOS / Linux — builds the installer automatically
bash install.sh

# Windows — builds the installer automatically
install.bat
```

> **FFmpeg is bundled automatically** via `ffmpeg-static` — no manual install needed.

---

## License

MIT — use freely, modify freely, no warranty.
