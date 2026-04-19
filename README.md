# 🎬 HomeStream

**Self-hosted Netflix-style family media streaming** — watch your personal movie and TV collection from any device on your home network (or over the internet with a reverse proxy).

---

## ✨ Features

| Feature | Details |
|---|---|
| **Video Player** | Custom controls, ±10s seek, speed 0.5×–3×, keyboard shortcuts, TV D-pad navigation |
| **Closed Captions** | Auto-fetch EN/ES WebVTT, SRT upload, one-key CC cycling (C key) |
| **Resume Playback** | Saves progress every 10s; resumes to exact second |
| **Profiles** | Adult + Kids (G/PG filter); optional 4-digit PIN lock on Adult profile |
| **Admin Password** | Optional login gate for the whole app |
| **Watch History** | Full history page with per-item removal and clear-all |
| **Watchlist** | Bookmark titles to watch later |
| **AI Enrichment** | Gemini-powered tags, mood, themes, summaries, similar titles |
| **AI Chat** | Ask for recommendations from your library |
| **Torrent Downloads** | Stremio/Torrentio integration + qBittorrent support |
| **Security Scanning** | 4-layer scan: extension check → VirusTotal → magic bytes → archive inspection |
| **DLNA Casting** | Cast to any DLNA/UPnP TV on your network |
| **Transcoding** | FFmpeg H.264 re-encode for browser compatibility |
| **Dark Themes** | 6 built-in themes (Netflix Red, Ocean Blue, Forest Green, etc.) |

---

## 🐳 Docker Deployment (Recommended)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/install/) ≥ 2.20
- A folder of video files on your host machine

### 1. Clone the repository

```bash
git clone https://github.com/homestream-app/homestream.git
cd homestream
```

### 2. Create your `docker-compose.yml`

```yaml
version: "3.9"

services:
  homestream:
    image: homestream:latest          # or build: . if building locally
    build: .
    container_name: homestream
    restart: unless-stopped
    ports:
      - "8080:5173"                   # host:container — change 8080 to any free port
    volumes:
      - /your/media/folder:/media     # ← point this at your video library
      - homestream-data:/data         # persistent config + library database
    environment:
      # ── Required ──────────────────────────────────────────────────────────
      MEDIA_DIR: /media               # path inside the container

      # ── Optional API keys (all features work without them) ────────────────
      OMDB_API_KEY: ""                # https://www.omdbapi.com/apikey.aspx (free)
      TMDB_API_KEY: ""                # https://www.themoviedb.org/settings/api (free)
      GEMINI_API_KEY: ""              # https://aistudio.google.com/app/apikey (free tier)
      VIRUSTOTAL_API_KEY: ""          # https://www.virustotal.com/gui/my-apikey (free)

      # ── Security ──────────────────────────────────────────────────────────
      ADMIN_PASSWORD: ""              # leave blank to disable login gate
                                      # set to a strong password to require login

      # ── qBittorrent (optional) ────────────────────────────────────────────
      QBITTORRENT_URL: ""             # e.g. http://192.168.1.100:8080
      QBITTORRENT_USER: ""
      QBITTORRENT_PASS: ""

      # ── AI provider (optional) ────────────────────────────────────────────
      AI_PROVIDER: "gemini"           # "gemini" or "ollama"
      OLLAMA_URL: ""                  # e.g. http://host.docker.internal:11434
      OLLAMA_MODEL: "llama3"

volumes:
  homestream-data:
```

### 3. Build and start

```bash
# Build the image (first time or after code changes)
docker compose build

# Start in the background
docker compose up -d

# View logs
docker compose logs -f homestream
```

### 4. Open in your browser

```
http://localhost:8080
```

Or replace `localhost` with your server's IP address to access from other devices on your network.

---

## 🔧 Configuration Reference

All configuration is done via environment variables or the in-app **Settings** panel (⚙️ icon in the header).

| Variable | Default | Description |
|---|---|---|
| `MEDIA_DIR` | `/media` | Path to your video library inside the container |
| `ADMIN_PASSWORD` | *(blank)* | If set, requires login before accessing the app |
| `OMDB_API_KEY` | *(blank)* | Fetches movie metadata (title, poster, rating, plot) |
| `TMDB_API_KEY` | *(blank)* | Additional metadata + TMDB posters |
| `GEMINI_API_KEY` | *(blank)* | AI enrichment + chat recommendations |
| `VIRUSTOTAL_API_KEY` | *(blank)* | Hash-based malware scan on downloads |
| `QBITTORRENT_URL` | *(blank)* | qBittorrent Web UI URL |
| `QBITTORRENT_USER` | *(blank)* | qBittorrent username |
| `QBITTORRENT_PASS` | *(blank)* | qBittorrent password |
| `AI_PROVIDER` | `gemini` | `gemini` or `ollama` |
| `OLLAMA_URL` | *(blank)* | Ollama server URL (if using local AI) |
| `OLLAMA_MODEL` | `llama3` | Ollama model name |

---

## 📁 Media Library Structure

HomeStream scans your media folder recursively. Supported formats:

```
/media
├── movies/
│   ├── Inception (2010).mkv
│   ├── The Dark Knight (2008).mp4
│   └── ...
├── tv/
│   ├── Breaking Bad S01E01.mkv
│   ├── Breaking Bad S01E02.mkv
│   └── ...
└── any-other-folder/
    └── video.avi
```

**Supported formats:** `.mp4`, `.mkv`, `.avi`, `.webm`, `.mov`, `.m4v`

**Naming tips for best metadata matching:**
- Movies: `Title (Year).ext` → `Inception (2010).mkv`
- TV Shows: `Show Name S01E01.ext` → `Breaking Bad S01E01.mkv`

---

## 🔒 Security

### Admin Password

Set `ADMIN_PASSWORD` to require a login before anyone can access HomeStream. Useful when exposing the app to the internet via a reverse proxy.

### Adult Profile PIN

In **Settings → Adult Profile PIN**, set a 4-digit PIN to prevent switching to the Adult profile without entering the PIN. Useful for shared family devices.

### Kids Profile

The Kids profile automatically filters out any content rated above PG (TV-PG, PG-13, R, etc.) across all pages.

---

## 🌐 Exposing to the Internet (Optional)

To access HomeStream outside your home network, use a reverse proxy with HTTPS:

### Nginx example

```nginx
server {
    listen 443 ssl;
    server_name homestream.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/homestream.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/homestream.yourdomain.com/privkey.pem;

    # Increase timeout for large video streams
    proxy_read_timeout 3600;
    proxy_send_timeout 3600;

    # Allow large uploads
    client_max_body_size 50G;

    location / {
        proxy_pass         http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_buffering    off;   # required for video streaming
    }
}
```

> **Security tip:** Always set `ADMIN_PASSWORD` when exposing HomeStream to the internet.

---

## 🛠️ Building from Source

If you want to run without Docker:

### Requirements

- Node.js ≥ 22
- npm ≥ 10

> **FFmpeg is bundled automatically.** The `ffmpeg-static` package ships a pre-built FFmpeg binary for your platform — no manual install needed. If you prefer to use a system FFmpeg instead, set the `FFMPEG_PATH` environment variable to its path.

### Steps

```bash
# Install dependencies
npm install

# Development server (hot reload)
npm run dev

# Production build
npm run build

# Start production server
node dist/server.bundle.mjs
```

Set environment variables in a `.env` file at the project root (same variables as the Docker table above).

---

## 🐛 Troubleshooting

### Video won't play / shows transcoding spinner

FFmpeg is re-encoding the file for browser compatibility. This happens once per file. Check progress in **Library → transcoding indicator**. If it's stuck, open **Settings → Debug Panel → Fix Stuck Transcodes**.

### Metadata not loading (no poster / plot)

Add an OMDB API key in **Settings → API Keys**. Free tier allows 1,000 requests/day.

### Can't find my media files

Check that your `MEDIA_DIR` environment variable matches the container mount path. Use **Settings → Scan for New Files** to trigger a manual scan.

### Health check

Visit `/api/health/full` in your browser for a live status of all 7 subsystems (media scanner, FFmpeg, qBittorrent, AI, captions, security, database).

---

## 📝 License

MIT — use freely, modify freely, no warranty.
