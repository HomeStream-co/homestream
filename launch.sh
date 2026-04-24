#!/usr/bin/env bash
# ============================================================
#  HomeStream — Quick Launcher (Mac / Linux)
#
#  Runs HomeStream directly from source code.
#  No installer, no Electron build needed — just Node.js.
#
#  Requirements:
#    - Node.js 18 or higher  (https://nodejs.org)
#    - That's it.
#
#  Usage:
#    chmod +x launch.sh   (first time only)
#    ./launch.sh
#
#  To stop HomeStream: press Ctrl+C
# ============================================================

set -e

# ── Colours ───────────────────────────────────────────────
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}[OK]${RESET} $*"; }
info() { echo -e "  ${CYAN}[..]${RESET} $*"; }
warn() { echo -e "  ${YELLOW}[!]${RESET} $*"; }
fail() { echo -e "  ${RED}[X]${RESET} $*"; exit 1; }
hr()   { echo -e "  ${BOLD}=====================================================${RESET}"; }

echo ""
hr
echo -e "  ${BOLD}  HomeStream  |  Self-Hosted Media Streaming${RESET}"
hr
echo ""

# ── Check Node.js ─────────────────────────────────────────
if ! command -v node &>/dev/null; then
  warn "Node.js is not installed."
  echo ""
  echo "  HomeStream needs Node.js to run."
  echo ""
  OS="$(uname -s)"
  if [ "$OS" = "Darwin" ]; then
    if command -v brew &>/dev/null; then
      info "Installing Node.js via Homebrew..."
      brew install node@22
      brew link node@22 --force --overwrite
    else
      echo "  1. Install Homebrew: https://brew.sh"
      echo "  2. Run: brew install node"
      echo "  3. Run ./launch.sh again"
      echo ""
      open "https://nodejs.org/en/download" 2>/dev/null || true
      exit 1
    fi
  else
    # Linux
    if command -v apt-get &>/dev/null; then
      info "Installing Node.js via apt..."
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
      sudo apt-get install -y nodejs
    elif command -v dnf &>/dev/null; then
      sudo dnf install -y nodejs npm
    elif command -v pacman &>/dev/null; then
      sudo pacman -S --noconfirm nodejs npm
    else
      fail "Could not auto-install Node.js. Install from https://nodejs.org then run ./launch.sh again."
    fi
  fi
fi

NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js 18+ required. You have $(node --version). Update from https://nodejs.org"
fi
ok "Node.js $(node --version)"

# ── Install dependencies (first run only) ─────────────────
if [ ! -d "node_modules/express" ]; then
  echo ""
  info "Installing packages... (first run, ~2 minutes)"
  echo ""
  npm install --prefer-offline
  ok "Packages installed"
fi

# ── Build (first run or after updates) ────────────────────
if [ ! -f "dist/server.bundle.mjs" ]; then
  echo ""
  info "Building HomeStream... (first run, ~1 minute)"
  echo ""
  npm run build
  ok "Build complete"
fi

# ── Get LAN IP ────────────────────────────────────────────
OS="$(uname -s)"
if [ "$OS" = "Darwin" ]; then
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
else
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "")
fi

# ── Start ─────────────────────────────────────────────────
echo ""
hr
echo -e "  ${BOLD}  Starting HomeStream...${RESET}"
hr
echo ""
echo -e "  ${CYAN}Local:${RESET}   http://localhost:3000"
if [ -n "$LAN_IP" ]; then
  echo -e "  ${CYAN}Network:${RESET} http://${LAN_IP}:3000"
  echo ""
  echo "  Share the Network address with phones / other devices"
  echo "  on your WiFi to use HomeStream as a remote control."
fi
echo ""
echo "  Press Ctrl+C to stop HomeStream."
hr
echo ""

# Open browser after server starts
(sleep 4 && {
  OS="$(uname -s)"
  if [ "$OS" = "Darwin" ]; then
    open "http://localhost:3000" 2>/dev/null || true
  else
    xdg-open "http://localhost:3000" 2>/dev/null || true
  fi
}) &

# Run the server
export PORT=3000
node dist/server.bundle.mjs
