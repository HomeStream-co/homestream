#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HomeStream Release Script
# Usage:
#   npm run release              → patch bump (1.1.0 → 1.1.1)
#   npm run release -- minor     → minor bump (1.1.0 → 1.2.0)
#   npm run release -- major     → major bump (1.1.0 → 2.0.0)
#   npm run release -- 1.2.0-alpha.1  → exact version
#
# What it does:
#   1. Pulls latest from main
#   2. Bumps version in package.json
#   3. Runs type-check + lint to catch obvious errors
#   4. Commits the version bump
#   5. Deletes old tag if it exists (safe re-tag)
#   6. Creates new tag and pushes → triggers GitHub Actions build
# ─────────────────────────────────────────────────────────────────────────────

set -e  # Exit on any error

BUMP=${1:-patch}
BRANCH=${2:-main}

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[release]${NC} $1"; }
ok()   { echo -e "${GREEN}[release]${NC} ✓ $1"; }
warn() { echo -e "${YELLOW}[release]${NC} ⚠ $1"; }
fail() { echo -e "${RED}[release]${NC} ✗ $1"; exit 1; }

# ── Preflight ─────────────────────────────────────────────────────────────────
log "Checking git status..."
if ! git diff-index --quiet HEAD --; then
  fail "Uncommitted changes detected. Commit or stash them first."
fi

log "Pulling latest from origin/$BRANCH..."
git pull origin "$BRANCH" --ff-only || fail "Pull failed — resolve conflicts first."

# ── Version bump ──────────────────────────────────────────────────────────────
CURRENT=$(node -p "require('./package.json').version")
log "Current version: $CURRENT"

# Determine new version
if [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9] ]]; then
  # Exact version provided
  NEW_VERSION="$BUMP"
else
  # Use npm version to calculate bump (dry run via node)
  NEW_VERSION=$(node -e "
    const [major, minor, patch] = '$CURRENT'.split('-')[0].split('.').map(Number);
    const pre = '$CURRENT'.includes('-') ? '$CURRENT'.split('-').slice(1).join('-') : '';
    if ('$BUMP' === 'major') console.log((major+1) + '.0.0');
    else if ('$BUMP' === 'minor') console.log(major + '.' + (minor+1) + '.0');
    else console.log(major + '.' + minor + '.' + (patch+1));
  ")
fi

log "New version: $NEW_VERSION"

# Write version to package.json without creating a git tag (we do that manually)
npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version
ok "package.json updated to $NEW_VERSION"

# ── Quality checks ────────────────────────────────────────────────────────────
log "Running type-check..."
npm run type-check || fail "Type errors found — fix them before releasing."
ok "Type check passed"

log "Running lint..."
npm run lint || fail "Lint errors found — fix them before releasing."
ok "Lint passed"

# ── Commit version bump ───────────────────────────────────────────────────────
git add package.json
git commit -m "chore: bump version to v$NEW_VERSION" || warn "Nothing to commit (version already bumped)"

# ── Tag management ────────────────────────────────────────────────────────────
TAG="v$NEW_VERSION"

# Delete existing tag locally and remotely (safe re-tag)
if git rev-parse "$TAG" >/dev/null 2>&1; then
  warn "Tag $TAG already exists — deleting and re-tagging..."
  git tag -d "$TAG"
  git push origin --delete "$TAG" 2>/dev/null || warn "Remote tag didn't exist, continuing..."
fi

git tag "$TAG"
ok "Created tag $TAG"

# ── Push ──────────────────────────────────────────────────────────────────────
log "Pushing commits and tag to origin/$BRANCH..."
git push origin "$BRANCH"
git push origin "$TAG"

ok "Released $TAG → GitHub Actions build triggered"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  HomeStream $TAG release in progress!${NC}"
echo -e "${GREEN}  GitHub Actions will build the .exe and publish it.${NC}"
echo -e "${GREEN}  Check: https://github.com/trevorrossworn-code/homestream/actions${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
