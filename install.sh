#!/usr/bin/env bash
# HomeStream — Build Installer (macOS & Linux)
# Usage: bash install.sh
#   or:  chmod +x install.sh && ./install.sh

set -e

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}[✓]${RESET} $*"; }
info() { echo -e "  ${CYAN}[…]${RESET} $*"; }
warn() { echo -e "  ${YELLOW}[!]${RESET} $*"; }
fail() { echo -e "  ${RED}[✗]${RESET} $*"; exit 1; }

# ── Detect platform ───────────────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM="mac"  ;;
  Linux)  PLATFORM="linux" ;;
  *)      fail "Unsupported platform: $OS. Use install.bat on Windows." ;;
esac

echo ""
echo -e "${BOLD}  ==========================================${RESET}"
echo -e "${BOLD}   HomeStream — Build Installer ($OS)${RESET}"
echo -e "${BOLD}  ==========================================${RESET}"
echo ""

# ── Check Node.js ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  warn "Node.js not found."
  echo ""
  if [ "$PLATFORM" = "mac" ]; then
    if command -v brew &>/dev/null; then
      info "Installing Node.js via Homebrew..."
      brew install node@22
      brew link node@22 --force --overwrite
    else
      warn "Homebrew not found. Opening nodejs.org — install Node.js 22 LTS, then re-run this script."
      open "https://nodejs.org/en/download" 2>/dev/null || true
      exit 1
    fi
  else
    # Linux — try common package managers
    if command -v apt-get &>/dev/null; then
      info "Installing Node.js via apt..."
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
      sudo apt-get install -y nodejs
    elif command -v dnf &>/dev/null; then
      info "Installing Node.js via dnf..."
      sudo dnf install -y nodejs npm
    elif command -v pacman &>/dev/null; then
      info "Installing Node.js via pacman..."
      sudo pacman -S --noconfirm nodejs npm
    else
      warn "Could not auto-install Node.js. Please install Node.js 22 from https://nodejs.org and re-run."
      exit 1
    fi
  fi
fi

NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js 18+ required. You have $(node --version). Update from https://nodejs.org"
fi
ok "Node.js $(node --version)"

# ── Check npm ─────────────────────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  fail "npm not found. Please reinstall Node.js from https://nodejs.org"
fi
ok "npm $(npm --version)"

# ── macOS: check Xcode CLI tools ──────────────────────────────────────────────
if [ "$PLATFORM" = "mac" ]; then
  if ! xcode-select -p &>/dev/null; then
    warn "Xcode Command Line Tools not found. Installing..."
    xcode-select --install
    echo ""
    warn "Please complete the Xcode CLI install dialog, then re-run this script."
    exit 1
  fi
  ok "Xcode CLI tools"
fi

# ── Install dependencies ───────────────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}[1/3] Installing dependencies...${RESET}"
info  "This may take a few minutes the first time."
echo ""
npm install
ok "Dependencies installed"

# ── Build ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}[2/3] Building HomeStream...${RESET}"
info  "Compiling frontend + server bundle..."
echo ""
npm run build
ok "Build complete"

# ── Package Electron installer ────────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}[3/3] Packaging installer...${RESET}"

if [ "$PLATFORM" = "mac" ]; then
  info "Creating HomeStream.dmg (this takes ~1 min)..."
  npx electron-builder --mac --config electron/electron-builder.yml --publish never
  INSTALLER=$(ls dist-electron/*.dmg 2>/dev/null | head -1)
else
  info "Creating HomeStream.AppImage + .deb..."
  npx electron-builder --linux --config electron/electron-builder.yml --publish never
  INSTALLER=$(ls dist-electron/*.AppImage 2>/dev/null | head -1)
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  ==========================================${RESET}"
echo -e "${BOLD}   Done! Installer is ready.${RESET}"
echo -e "${BOLD}  ==========================================${RESET}"
echo ""
ok "Output: dist-electron/"
echo ""

if [ "$PLATFORM" = "mac" ]; then
  echo -e "  ${CYAN}→ Open the .dmg and drag HomeStream to Applications.${RESET}"
  # Open the output folder in Finder
  open dist-electron/ 2>/dev/null || true
else
  echo -e "  ${CYAN}→ Run the .AppImage directly:${RESET}"
  if [ -n "$INSTALLER" ]; then
    echo -e "     chmod +x \"$(basename "$INSTALLER")\""
    echo -e "     ./\"$(basename "$INSTALLER")\""
  fi
  echo ""
  echo -e "  ${CYAN}→ Or install the .deb system-wide:${RESET}"
  DEB=$(ls dist-electron/*.deb 2>/dev/null | head -1)
  if [ -n "$DEB" ]; then
    echo -e "     sudo dpkg -i \"$(basename "$DEB")\""
  fi
  # Open file manager if available
  xdg-open dist-electron/ 2>/dev/null || true
fi

echo ""
