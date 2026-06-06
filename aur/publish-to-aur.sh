#!/usr/bin/env bash
# publish-to-aur.sh
#
# Bumps the PKGBUILD + .SRCINFO to a new version and pushes to the AUR.
#
# Usage:
#   ./aur/publish-to-aur.sh 1.9.5
#
# Prerequisites (run once):
#   1. Create an account at https://aur.archlinux.org
#   2. Add your SSH public key at https://aur.archlinux.org/account/<you>/edit
#   3. Submit the package once manually:
#        ssh aur@aur.archlinux.org  (just to accept the host key)
#        git clone ssh://aur@aur.archlinux.org/homestream-bin.git /tmp/homestream-aur
#        cp aur/PKGBUILD aur/.SRCINFO aur/homestream.desktop /tmp/homestream-aur/
#        cd /tmp/homestream-aur && git add -A && git commit -m "Initial release" && git push
#   4. After that first push, this script handles all future updates.

set -euo pipefail

NEW_VER="${1:-}"
if [[ -z "$NEW_VER" ]]; then
  echo "Usage: $0 <version>   e.g. $0 1.9.5"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKGBUILD="$SCRIPT_DIR/PKGBUILD"
SRCINFO="$SCRIPT_DIR/.SRCINFO"

echo "==> Bumping PKGBUILD to v${NEW_VER}..."

# Update pkgver in PKGBUILD
sed -i "s/^pkgver=.*/pkgver=${NEW_VER}/" "$PKGBUILD"
# Reset pkgrel to 1 on version bump
sed -i "s/^pkgrel=.*/pkgrel=1/" "$PKGBUILD"

# Regenerate .SRCINFO (requires makepkg, i.e. must run on an Arch/CachyOS machine)
if command -v makepkg &>/dev/null; then
  echo "==> Regenerating .SRCINFO..."
  (cd "$SCRIPT_DIR" && makepkg --printsrcinfo > .SRCINFO)
else
  echo "==> makepkg not found — updating .SRCINFO manually..."
  sed -i "s/pkgver = .*/pkgver = ${NEW_VER}/" "$SRCINFO"
  # Update all version-stamped filenames in source lines
  OLD_VER=$(grep "HomeStream-.*\.AppImage" "$SRCINFO" | grep -oP '\d+\.\d+\.\d+' | head -1)
  if [[ -n "$OLD_VER" ]]; then
    sed -i "s/${OLD_VER}/${NEW_VER}/g" "$SRCINFO"
  fi
fi

# Push to AUR
AUR_CLONE_DIR="${TMPDIR:-/tmp}/homestream-aur-publish"
if [[ ! -d "$AUR_CLONE_DIR/.git" ]]; then
  echo "==> Cloning AUR repo..."
  git clone ssh://aur@aur.archlinux.org/homestream-bin.git "$AUR_CLONE_DIR"
fi

echo "==> Copying files to AUR clone..."
cp "$PKGBUILD" "$SRCINFO" "$SCRIPT_DIR/homestream.desktop" "$AUR_CLONE_DIR/"

cd "$AUR_CLONE_DIR"
git add PKGBUILD .SRCINFO homestream.desktop
git diff --cached --stat

echo "==> Committing and pushing to AUR..."
git commit -m "upgpkg: homestream-bin ${NEW_VER}"
git push

echo ""
echo "✓ homestream-bin ${NEW_VER} published to AUR."
echo "  Users can now: yay -S homestream-bin"
echo "  Or update:     yay -Syu"
