# HomeStream — Release & CI Guide

## How releases work

Pushing a version tag triggers the full Windows build automatically:

```bash
# Bump version in package.json first
npm version 1.1.0          # updates package.json + creates git tag v1.1.0
git push origin main --tags # pushes commit + tag → triggers GitHub Actions
```

GitHub Actions then:
1. Spins up a `windows-latest` runner
2. Runs `npm ci` (downloads Windows `ffmpeg.exe` via `ffmpeg-static`)
3. Regenerates NSIS branding images
4. Runs `npm run build` (frontend + server bundle)
5. Runs `electron-builder --publish always` → creates the GitHub Release + uploads the `.exe`
6. Users with the app installed get an auto-update notification

The finished installer is available at:
```
https://github.com/YOUR_ORG/homestream/releases/tag/v1.1.0
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

### 2. Add the token as a repo secret

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `GH_TOKEN`
4. Value: paste the token from step 1
5. Click **Add secret**

That's the only required secret. The workflow won't run without it.

---

## Workflow files

| File | Triggers on | What it does |
|---|---|---|
| `.github/workflows/release.yml` | Tag push `v*` | Builds `.exe`, creates GitHub Release, uploads installer |
| `.github/workflows/build-check.yml` | Push to `main`/`develop`, PRs | Type-check + lint + build (no installer) |

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
