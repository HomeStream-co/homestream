#!/bin/bash
TOKEN="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"
BODY=$(cat <<'EOF'
## What's New in v2.0.3

### Setup Wizard
- **TMDB & OMDB keys are now built-in** — no account or API key required. Posters, hero banners, IMDb ratings work out of the box.
- Step 4 now only asks for Admin Password, AI key (optional), and Real-Debrid (optional).
- Finish screen shows "TMDB / OMDB — Built-in" in the config summary.
- Env vars `TMDB_API_KEY` / `OMDB_API_KEY` still work as override path.

### AI & Taste Engine
- Gemini, OpenAI, Anthropic, and Ollama via single `aiApiKey` field
- Local AI Taste Engine with match % badges and weighted scoring

### Download Pipeline
- RD → transcode → HLS → library pipeline complete
- qBittorrent completion watcher (15s poller)
- Jackett, Torznab, RSS custom source support
- VPN scoped to download-only

---

## Installation

### Linux
```bash
git clone https://github.com/HomeStream-co/homestream.git
cd homestream
npm install
npm run build
npm start
```
Requires: Node.js 18+, FFmpeg, MySQL

### Windows
```powershell
git clone https://github.com/HomeStream-co/homestream.git
cd homestream
npm install
npm run build
npm start
```
Requires: Node.js 18+ (nodejs.org), FFmpeg (ffmpeg.org/download), MySQL 8+

> **Windows tip:** Add FFmpeg to your system PATH so HomeStream can detect it automatically.

---

## Upgrading from v2.0.x
No database migrations required:
```bash
git pull origin main && npm install && npm run build && npm start
```
EOF
)

curl -s -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/json" \
  https://api.github.com/repos/HomeStream-co/homestream/releases \
  -d "$(python3 -c "import json,sys; print(json.dumps({'tag_name':'v2.0.3','target_commitish':'main','name':'v2.0.3 — Setup Wizard & Built-in API Keys','body':open('/dev/stdin').read(),'draft':False,'prerelease':False}))" <<< "$BODY")" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('html_url') or d.get('message'))"
