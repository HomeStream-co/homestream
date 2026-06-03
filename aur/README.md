# HomeStream — AUR Package

This directory contains the AUR (Arch User Repository) package for `homestream-bin`.

Once published, CachyOS / Arch users can install and keep HomeStream updated with:

```bash
yay -S homestream-bin
```

Updates arrive automatically with `yay -Syu` — no manual downloads needed.

---

## First-time AUR setup (do once)

### 1. Create an AUR account

Go to https://aur.archlinux.org and register.

### 2. Add your SSH key

In your AUR account settings, paste your **public** SSH key (`~/.ssh/id_ed25519.pub` or `~/.ssh/id_rsa.pub`).

Test it:
```bash
ssh aur@aur.archlinux.org
# Should print: "Welcome to the AUR" then disconnect — that's correct.
```

### 3. Submit the package for the first time

```bash
# Clone the (empty) AUR repo for homestream-bin
git clone ssh://aur@aur.archlinux.org/homestream-bin.git /tmp/homestream-aur

# Copy the package files
cp aur/PKGBUILD aur/.SRCINFO aur/homestream.desktop /tmp/homestream-aur/

# Push
cd /tmp/homestream-aur
git add -A
git commit -m "Initial release: homestream-bin 1.9.4"
git push
```

The package will appear at: https://aur.archlinux.org/packages/homestream-bin

---

## Publishing a new release

After tagging a new GitHub release (e.g. v1.9.5), run from the project root:

```bash
./aur/publish-to-aur.sh 1.9.5
```

This script:
1. Bumps `pkgver` in `PKGBUILD` and `.SRCINFO`
2. Clones the AUR repo (or reuses the cached clone in `/tmp`)
3. Commits and pushes the update

Users running `yay -Syu` will pick up the new version automatically.

---

## How the package works

- Downloads the **AppImage** from GitHub Releases (self-contained, no system deps beyond the declared `depends`)
- Extracts it to `/opt/homestream/`
- Installs a `/usr/bin/homestream` wrapper so it's launchable from any terminal
- Installs a `.desktop` file so it appears in KDE/GNOME app launchers
- Declares `provides=homestream` and `conflicts=homestream` so it can't be double-installed alongside the `.pacman` build

## Updating checksums

After a new AppImage is published, update `sha256sums` in `PKGBUILD`:

```bash
cd aur
updpkgsums   # downloads the new AppImage and recalculates — requires Arch/CachyOS
```

Or set `sha256sums=('SKIP' ...)` to skip verification (less secure but fine for a private/trusted release).
