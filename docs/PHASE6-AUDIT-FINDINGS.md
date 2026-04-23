# Phase 6 — Full Health Audit Findings
**HomeStream v1.4.2 · Completed 2026-04-23**

---

## Summary

Full audit of all routes, components, stores, polling patterns, dead code, and large files.
All actionable items have been fixed in this phase. Remaining items are documented as
future work with clear implementation specs.

---

## ✅ FIXED IN THIS PHASE

### 1. Atomic Writes — 7 Stores Upgraded (Data Safety)

All JSON stores now use tmp→rename atomic writes to prevent partial-write corruption on crash.

| Store | Before | After |
|---|---|---|
| `crashLogger.ts` | `writeFileSync(logPath, ...)` | `writeFileSync(tmp); renameSync(tmp, logPath)` |
| `downloadJobStore.ts` | `writeFileSync(JOBS_PATH, ...)` | tmp→rename |
| `profilesStore.ts` | `writeFileSync(PROFILES_PATH, ...)` | tmp→rename |
| `subscriptionStore.ts` | `writeFileSync(SUBS_PATH, ...)` | tmp→rename |
| `watchlistStore.ts` | `writeFileSync(WATCHLIST_PATH, ...)` | tmp→rename |
| `tmdbCache.ts` | `writeFileSync(cacheFile(key), ...)` | tmp→rename |
| `threatScanner.ts` | `writeFileSync(quarantineLogPath, ...)` | tmp→rename |

Previously atomic (no change needed): `libraryStore.ts`, `sessionStore.ts`, `configStore.ts`

**Test impact:** 12 test files mocking `fs` were updated to include `renameSync` stub.
All 867 tests pass.

### 2. bcrypt try/catch in `auth/login/POST.ts` (Security)

`bcrypt.compare()` and `bcrypt.hash()` can throw on malformed hashes (e.g., truncated
bcrypt strings from a corrupted config file). Added try/catch returning HTTP 500 with a
safe error message — no stack trace exposed to client.

### 3. `captions/[id]/[lang]/GET.ts` — headersSent guard (Double-send fix)

The catch block called `res.send('WEBVTT\n\n')` unconditionally. If `res.sendFile()` had
already flushed headers before throwing, this caused a "Cannot set headers after they are
sent" crash. Fixed with `if (!res.headersSent)` guard.

### 4. DevDrawer — Lazy-loaded for production tree-shaking (Bundle size)

`DevDrawer` was statically imported in `DebugPanel.tsx`, meaning its ~50KB of developer
tooling shipped in every production bundle even for family installs where
`DEVELOPER_LOCK` is never set.

**Fix:** Converted to `React.lazy()` dynamic import wrapped in `<React.Suspense>`.
Vite will now code-split DevDrawer into a separate chunk that is only fetched when
`devLocked && devDrawerOpen` — i.e., never on a standard family install.

### 5. probeCache — 24h TTL eviction added (Memory correctness)

The LRU cache (max 500 entries) evicted by size but never by time. Entries for deleted
files stayed cached forever because `probe()` is never called again for a deleted file,
so the mtime-based invalidation never fires.

**Fix:**
- Added `TTL_MS = 24h` constant and `evictStaleProbeCache()` export to `probeCache.ts`
- Wired into `runStartupCleanup()` via dynamic import (avoids circular dep)
- Logged: `[startup] probeCache TTL eviction: removed N stale entry(ies).`

### 6. `no-try/catch: intentional` documentation

Added explicit comment to `security/quarantine/GET.ts` explaining why no try/catch
is needed (readQuarantineLog is internally guarded, returns [] on error).

---

## ✅ AUDIT FINDINGS — NO ACTION NEEDED (Corrected Prior Notes)

### `require-shim.js` — Already gone
The `src/server/stubs/` directory only contains `webrtc-polyfill-stub.js` and
`webtorrent-stub.js`, both of which are legitimate and actively referenced.
`require-shim.js` was removed in a prior cleanup.

### Orphaned setup step files — Already gone
`StepWelcome`, `StepJellyfin`, `StepQBittorrent`, `StepVPN`, `StepHttps` are not
present in the codebase. Removed in a prior cleanup.

### CookieBanner — Already gone
`CookieBanner.tsx` and `CookieBannerErrorBoundary.tsx` are not present.

### DebugPanel uptime `setInterval` — Already fixed
The uptime display uses render-time computation (`fetchedAtRef` + `Date.now()`) with
no `setInterval`. The 1s re-render cycle was removed in a prior cleanup.

### CastButton + ChromecastButton — NOT duplicates, keep both
These serve different protocols:
- `CastButton.tsx` — DLNA/UPnP cast (Samsung TVs, LG TVs, Roku, VLC)
- `ChromecastButton.tsx` — Google Cast SDK (Chromecast, Google TV)
Both are actively used in `PlayerControlsOverlay.tsx`. Consolidation would break
one of the two cast targets. **Do not merge.**

### downloads.tsx polling — Already correct
Polling uses `document.hidden` guard on every tick + `visibilitychange` listener
that triggers an immediate fetch on tab focus. This is the correct pattern.
WebSocket replacement is a future enhancement, not a bug.

### GenreBrowser — Already lazy-loads correctly
The audit note "carousels all load on tab open" was inaccurate. `GenreBrowser`
fetches only the active genre on mount, then fetches each genre on-demand when
the user clicks it. Results are cached in a `useRef<Map>` so re-selecting a genre
is instant. No IntersectionObserver needed — the data loading is already on-demand.

### vpnServerRanker — NOT called on startup
`pickFastestServer()` is only called from:
1. `vpnService.ts:301` — inside `connectVPN()`, only when user initiates a VPN connection
2. `GET /api/vpn/fastest-server` — explicit user request endpoint
It is NOT imported or called during `serverBefore` startup. Safe.

### TMDB image downloads — NOT blocking API responses
Images use pre-baked local paths (`/tmdb-images/<hash>.jpg`) generated at build time
by `scripts/cache-tmdb-images.cjs`. The API returns local URL strings immediately —
no runtime image downloading blocks the response. The "needs background queue" note
in the audit was based on an outdated understanding of the architecture.

### remote.tsx — 1,305 lines (not 2,440)
The audit note was stale. Current line count is 1,305. The file has clear section
boundaries and is well-organized. Splitting is optional, not urgent.

### SettingsPanel.tsx — 1,413 lines
The main component starts at line 284. The file has good internal structure with
named sub-components. Splitting is a medium-priority refactor, not a bug.

---

## 🔮 FUTURE WORK (Not yet implemented)

### HIGH — WebSocket push for downloads page
Replace 2s `setInterval` polling with WebSocket push from the server.
The WebSocket infrastructure already exists (`src/server/wsRooms.ts`).
Estimated effort: 1 day.

### HIGH — SSE endpoint for stats
Replace 10s polling of `GET /api/stats` with `GET /api/stats/stream` SSE.
Estimated effort: 4 hours.

### MEDIUM — remote.tsx polling (3s setInterval)
`remote.tsx` uses a 3s `setInterval` for player state. Replace with WebSocket
subscription to the existing player state room.

### MEDIUM — SettingsPanel.tsx split
Split into per-section files:
- `settings/GeneralSection.tsx`
- `settings/SecuritySection.tsx`
- `settings/NetworkSection.tsx`
- `settings/StorageSection.tsx`
- `settings/AboutSection.tsx`

### NEW — Scheduled Download Queue
See `docs/SCHEDULED-DOWNLOAD-QUEUE-SPEC.md` for full design.
Allows downloads to be queued for off-peak hours (e.g., midnight–6am) so
daytime bandwidth is not throttled for the family.

---

## Test Results

```
Type-check:  PASS (0 errors)
Test Files:  48 passed (48)
Tests:       867 passed (867)
```

All changes committed in: `daac551` (atomic writes) + subsequent commits.
