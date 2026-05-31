#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HomeStream — Linux / CachyOS one-command installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/HomeStream-co/homestream/main/install-linux.sh | bash
#
# What it does:
#   1. Detects your distro (Arch/CachyOS, Debian/Ubuntu, or generic)
#   2. Downloads the latest HomeStream release from GitHub
#   3. Installs it using the best available method for your distro
#   4. Prints next steps
#
# Supported install methods (in order of preference):
#   Arch / CachyOS / Manjaro  →  pacman .pkg.tar.zst
#   Debian / Ubuntu / Pop!_OS →  dpkg .deb
#   Everything else           →  AppImage (no install, just run)
#
# Requirements: curl, jq (or python3 as fallback for JSON parsing)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="HomeStream-co/homestream"
RELEASES_API="https://api.github.com/repos/${REPO}/releases/latest"
INSTALL_DIR="${HOME}/.local/bin"
APPIMAGE_NAME="HomeStream.AppImage"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[HomeStream]${RESET} $*"; }
success() { echo -e "${GREEN}[HomeStream]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[HomeStream]${RESET} $*"; }
die()     { echo -e "${RED}[HomeStream] ERROR:${RESET} $*" >&2; exit 1; }

# ── Detect architecture ───────────────────────────────────────────────────────
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  ARCH_LABEL="x64" ;;
  aarch64) ARCH_LABEL="arm64" ;;
  *)       die "Unsupported architecture: $ARCH. Only x86_64 and aarch64 are supported." ;;
esac

# ── Detect distro ─────────────────────────────────────────────────────────────
detect_distro() {
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "${ID:-unknown}"
  else
    echo "unknown"
  fi
}

DISTRO=$(detect_distro)
info "Detected distro: ${BOLD}${DISTRO}${RESET}, arch: ${BOLD}${ARCH}${RESET}"

# ── Fetch latest release metadata ─────────────────────────────────────────────
info "Fetching latest release info from GitHub…"

if command -v jq &>/dev/null; then
  RELEASE_JSON=$(curl -fsSL "$RELEASES_API")
  VERSION=$(echo "$RELEASE_JSON" | jq -r '.tag_name')
  get_asset_url() {
    echo "$RELEASE_JSON" | jq -r --arg pat "$1" '.assets[] | select(.name | test($pat)) | .browser_download_url' | head -1
  }
elif command -v python3 &>/dev/null; then
  RELEASE_JSON=$(curl -fsSL "$RELEASES_API")
  VERSION=$(echo "$RELEASE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])")
  get_asset_url() {
    local pat="$1"
    echo "$RELEASE_JSON" | python3 -c "
import sys, json, re
data = json.load(sys.stdin)
for a in data['assets']:
    if re.search(r'${pat}', a['name']):
        print(a['browser_download_url'])
        break
"
  }
else
  die "Neither 'jq' nor 'python3' found. Install one of them and re-run:\n  sudo pacman -S jq   (CachyOS/Arch)\n  sudo apt install jq (Debian/Ubuntu)"
fi

[ -z "$VERSION" ] && die "Could not determine latest version from GitHub API."
info "Latest version: ${BOLD}${VERSION}${RESET}"

# ── Pick the right package for this distro ────────────────────────────────────
case "$DISTRO" in
  arch|cachyos|manjaro|endeavouros|garuda|artix)
    # ── Arch-based: use pacman .pkg.tar.zst ───────────────────────────────────
    if [ "$ARCH_LABEL" != "x64" ]; then
      warn "pacman package is only built for x64. Falling back to AppImage for ${ARCH}."
      INSTALL_METHOD="appimage"
    else
      INSTALL_METHOD="pacman"
      ASSET_URL=$(get_asset_url "\.pkg\.tar\.zst$")
      [ -z "$ASSET_URL" ] && { warn "pacman package not found in release. Falling back to AppImage."; INSTALL_METHOD="appimage"; }
    fi
    ;;
  ubuntu|debian|pop|linuxmint|elementary|zorin|kali)
    # ── Debian-based: use .deb ────────────────────────────────────────────────
    if [ "$ARCH_LABEL" != "x64" ]; then
      warn ".deb package is only built for x64. Falling back to AppImage for ${ARCH}."
      INSTALL_METHOD="appimage"
    else
      INSTALL_METHOD="deb"
      ASSET_URL=$(get_asset_url "amd64\.deb$")
      [ -z "$ASSET_URL" ] && { warn ".deb not found in release. Falling back to AppImage."; INSTALL_METHOD="appimage"; }
    fi
    ;;
  *)
    # ── Generic: AppImage ─────────────────────────────────────────────────────
    INSTALL_METHOD="appimage"
    ;;
esac

# AppImage URL (used as fallback or primary)
if [ "$INSTALL_METHOD" = "appimage" ]; then
  ASSET_URL=$(get_asset_url "${ARCH_LABEL}\.AppImage$")
  [ -z "$ASSET_URL" ] && die "Could not find an AppImage for ${ARCH_LABEL} in release ${VERSION}.\nCheck https://github.com/${REPO}/releases for available assets."
fi

info "Install method: ${BOLD}${INSTALL_METHOD}${RESET}"
info "Download URL:   ${ASSET_URL}"

# ── Download ──────────────────────────────────────────────────────────────────
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

FILENAME=$(basename "$ASSET_URL")
DEST="${TMP_DIR}/${FILENAME}"

info "Downloading ${FILENAME}…"
curl -fL --progress-bar -o "$DEST" "$ASSET_URL"
success "Download complete."

# ── Install ───────────────────────────────────────────────────────────────────
case "$INSTALL_METHOD" in
  pacman)
    info "Installing via pacman…"
    sudo pacman -U --noconfirm "$DEST"
    success "HomeStream installed via pacman."
    echo ""
    echo -e "${BOLD}Launch HomeStream:${RESET}"
    echo "  homestream"
    echo "  (or find it in your application launcher)"
    ;;

  deb)
    info "Installing via dpkg…"
    sudo dpkg -i "$DEST" || sudo apt-get install -f -y
    success "HomeStream installed via dpkg."
    echo ""
    echo -e "${BOLD}Launch HomeStream:${RESET}"
    echo "  homestream"
    echo "  (or find it in your application launcher)"
    ;;

  appimage)
    mkdir -p "$INSTALL_DIR"
    APPIMAGE_DEST="${INSTALL_DIR}/${APPIMAGE_NAME}"
    cp "$DEST" "$APPIMAGE_DEST"
    chmod +x "$APPIMAGE_DEST"

    # Add ~/.local/bin to PATH if it isn't already
    if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
      warn "${INSTALL_DIR} is not in your PATH."
      warn "Add this line to your ~/.bashrc or ~/.zshrc:"
      warn "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi

    # Create a .desktop entry so it appears in app launchers
    DESKTOP_DIR="${HOME}/.local/share/applications"
    mkdir -p "$DESKTOP_DIR"
    cat > "${DESKTOP_DIR}/homestream.desktop" <<EOF
[Desktop Entry]
Name=HomeStream
Comment=Self-hosted media streaming server
Exec=${APPIMAGE_DEST}
Icon=homestream
Terminal=false
Type=Application
Categories=AudioVideo;Video;Player;
EOF

    success "HomeStream AppImage installed to ${APPIMAGE_DEST}"
    echo ""
    echo -e "${BOLD}Launch HomeStream:${RESET}"
    echo "  ${APPIMAGE_DEST}"
    echo "  (or find 'HomeStream' in your application launcher)"
    ;;
esac

# ── First-run instructions ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}  HomeStream ${VERSION} is ready!${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo "  On first launch, HomeStream will open a setup wizard in your browser."
echo "  You'll be asked to:"
echo "    1. Set an admin password"
echo "    2. Enter your TMDB API key  (free at https://www.themoviedb.org/settings/api)"
echo "    3. Enter your Google AI key (free at https://aistudio.google.com/apikey)"
echo "    4. Optionally add Real-Debrid for faster downloads"
echo "    5. Choose your media folder"
echo ""
echo "  After setup, open HomeStream in any browser on your LAN:"
echo "    http://<your-server-ip>:3000"
echo ""
echo "  Phone remote:  http://<your-server-ip>:3000/remote"
echo "  TV mode:       http://<your-server-ip>:3000/tv"
echo ""

# ── Optional: WireGuard sudoers entry ─────────────────────────────────────────
# wg-quick requires root. Add a passwordless sudoers rule so HomeStream can
# bring the VPN tunnel up/down without prompting for a password.
# This is optional — skip it if you don't plan to use the VPN kill-switch.
if command -v wg-quick &>/dev/null; then
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${YELLOW}  Optional: WireGuard VPN support${RESET}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
  echo "  WireGuard is installed. To let HomeStream manage the VPN tunnel"
  echo "  without a password prompt, add a sudoers entry:"
  echo ""
  echo -e "    ${CYAN}echo \"\$(whoami) ALL=(ALL) NOPASSWD: /usr/bin/wg-quick\" | sudo tee /etc/sudoers.d/homestream-wg${RESET}"
  echo ""
  echo "  This is only needed if you want to use the VPN kill-switch feature."
  echo "  You can skip this and add it later from the Settings page."
  echo ""

  # Offer to add it automatically
  read -r -p "  Add the sudoers entry now? [y/N] " _wg_answer
  case "$_wg_answer" in
    [yY][eE][sS]|[yY])
      SUDOERS_FILE="/etc/sudoers.d/homestream-wg"
      echo "$(whoami) ALL=(ALL) NOPASSWD: /usr/bin/wg-quick" | sudo tee "$SUDOERS_FILE" > /dev/null
      sudo chmod 0440 "$SUDOERS_FILE"
      success "Sudoers entry added: ${SUDOERS_FILE}"
      ;;
    *)
      info "Skipped. You can add it later from Settings → VPN."
      ;;
  esac
  echo ""
fi

echo -e "  ${CYAN}Enjoy your personal Netflix!${RESET}"
echo ""
