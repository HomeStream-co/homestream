#!/usr/bin/env bash
# HomeStream Linux Installer
# Usage: bash install-linux.sh
# Downloads and installs the correct package for your distro.

set -e

REPO="HomeStream-co/homestream"
API="https://api.github.com/repos/$REPO/releases/latest"

echo "Fetching latest HomeStream release..."
RELEASE=$(curl -sf "$API")
VERSION=$(echo "$RELEASE" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\(.*\)".*/\1/')
echo "Latest version: $VERSION"

# Detect distro
if command -v pacman &>/dev/null; then
  DISTRO="arch"
  PKG_EXT=".pkg.tar.zst"
  INSTALL_CMD="sudo pacman -U --noconfirm"
elif command -v apt-get &>/dev/null; then
  DISTRO="debian"
  PKG_EXT=".deb"
  INSTALL_CMD="sudo dpkg -i"
else
  DISTRO="appimage"
  PKG_EXT=".AppImage"
  INSTALL_CMD=""
fi

echo "Detected distro type: $DISTRO"

# Find the right asset URL
ASSET_URL=$(echo "$RELEASE" | grep '"browser_download_url"' | grep "$PKG_EXT" | grep -v arm64 | head -1 | sed 's/.*"browser_download_url": *"\(.*\)".*/\1/')

if [ -z "$ASSET_URL" ]; then
  echo "ERROR: Could not find a $PKG_EXT asset in the latest release."
  echo "Visit https://github.com/$REPO/releases/latest to download manually."
  exit 1
fi

FILENAME=$(basename "$ASSET_URL")
DEST="$HOME/Downloads/$FILENAME"

echo "Downloading $FILENAME..."
curl -L --progress-bar "$ASSET_URL" -o "$DEST"

if [ "$DISTRO" = "appimage" ]; then
  chmod +x "$DEST"
  echo ""
  echo "Downloaded to: $DEST"
  echo "Run it with:   $DEST"
  echo ""
  echo "To install as a desktop app:"
  echo "  mkdir -p ~/.local/bin"
  echo "  cp '$DEST' ~/.local/bin/homestream"
  echo "  chmod +x ~/.local/bin/homestream"
else
  echo "Installing $FILENAME..."
  $INSTALL_CMD "$DEST"
  echo ""
  echo "HomeStream installed! Launch it from your app menu or run: homestream"
fi
