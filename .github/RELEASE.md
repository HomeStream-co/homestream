# HomeStream — Release & CI Guide

## How releases work

Pushing a version tag triggers the full Windows build automatically.
Use the `release.sh` script — it handles the version bump, commit, tag, and push in one step:

```bash
# Patch release (1.6.4 → 1.6.5)
./release.sh patch

# Minor release (1.6.x → 1.7.0)
./release.sh minor

# Major release (1.x.x → 2.0.0)
./release.sh major
```

The script:
1. Runs `npm version <patch|minor|major> --no-git-tag-version` to bump `package.json` only
2. Commits the version bump: `chore: bump to vX.Y.Z`
3. Creates an annotated git tag `vX.Y.Z`
4. Pushes the commit and tag to `origin main`

GitHub Actions then:
1. Spins up a `windows-latest` runner
2. Runs `npm ci` (downloads Windows `ffmpeg.exe` via `ffmpeg-static`)
3. Regenerates NSIS branding images
4. Runs `npm run build` (frontend + server bundle)
5. Runs `electron-builder --publish always` → creates the GitHub Release + uploads the `.exe`
6. Users with the app installed get an auto-update notification

The finished installer is available at:
```
https://github.com/HomeStream-co/homestream/releases/tag/vX.Y.Z
```

---

## One-time GitHub setup (do this before your first release)

### 1. Create a GitHub Personal Access Token

1. Go to **https://github.com/settings/tokens**
2. Click **Generate new token (classic)**
3. Name it: `HomeStream Release`
4. Expiration: 1 year (or no expiration for a home project)
5. Scopes: check **`repo`** (the whole block — needed to create releases and upload assets)
6. Click **Generate token** — copy it immediately, you won't see it again

### 2. Add three secrets to your GitHub repo

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value | Why |
|---|---|---|
| `GH_TOKEN` | A GitHub Personal Access Token with `repo` scope | Authenticates electron-builder to create releases and the auto-updater to check for updates on the private repo |

`GH_OWNER` and `GH_REPO` are **not** needed as secrets — they are hardcoded in `electron/electron-builder.yml` and baked into the `.exe` at build time.

---

## Workflow files

| File | Triggers on | What it does |
|---|---|---|
| `.github/workflows/release.yml` | Tag push `v*` | Builds `.exe`, creates GitHub Release, uploads installer |
| `.github/workflows/build-check.yml` | Push to `v*` branches, PRs to `main` | Type-check + lint + build (no installer) |

---

## Version naming convention

```
v1.0.0   — stable release
v1.1.0   — minor feature release
v1.1.1   — patch/bugfix release
v1.2.0-beta.1  — pre-release (won't trigger auto-updater for stable users)
```

electron-builder reads the version from `package.json` automatically.
The tag name is just a trigger — the installer filename comes from `package.json`.

---

## Auto-updater

The app uses `electron-updater` which checks GitHub Releases on startup.
When a new stable release exists, users see a notification in the Control Panel.
They can choose to install immediately or defer.

The `latest.yml` file (uploaded alongside the `.exe` by electron-builder) is what
the auto-updater reads to know the current version and download URL.

---

## Manual build (no CI)

If you need to build locally on Windows without pushing a tag:

```bash
git pull
npm install
npm run electron:win
# Output: dist-electron/HomeStream-Setup-x.x.x.exe
```
