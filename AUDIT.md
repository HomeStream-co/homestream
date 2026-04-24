# HomeStream Pre-Push Audit Checklist

When the user says **"full static audit"** or **"run a bug test"**, run every check
below in order, fix every issue found, then confirm zero TypeScript errors before
declaring the build ready to push.

---

## 1 — Type String Consistency
Search for wrong media-type strings that break routing and filtering.

```
grep -rn "type === 'show'" src/
grep -rn "type === \"show\"" src/
```

**Expected:** zero results everywhere except icon/label fallbacks (cosmetic only).
All routing, filtering, and API calls must use `'series'` not `'show'`.

---

## 2 — Auth-Gated Fetches on Public Pages
Pages in `ALWAYS_ACCESSIBLE` (`/tv`, `/remote`, `/samsung-tv`) must NEVER call
endpoints that require an auth cookie.

Banned endpoints on those pages:
- `/api/setup`  (requires cookie once setup is complete)
- `/api/media`
- `/api/auth/check`
- Any endpoint that calls `requireAuth(req, res)`

**Allowed gate endpoint:** `/api/health` — always unauthenticated, returns
`{ ok, setupComplete }`.

```
grep -n "fetch('/api/setup')" src/pages/tv.tsx src/pages/remote.tsx
grep -n "fetch('/api/setup')" src/pages/samsung-tv.tsx 2>/dev/null
```

**Expected:** zero results. All gate checks must use `/api/health`.

---

## 3 — Unhandled / Mis-handled Fetch Errors

### 3a — Missing `res.ok` check
```
grep -rn "await fetch(" src/pages/ src/components/
```
Every `fetch()` that mutates data or drives UI state must have:
```ts
if (!res.ok) { ... }
```

### 3b — `res.text()` on JSON error bodies
```
grep -rn "res.text()" src/pages/ src/components/
```
**Expected:** zero results in page/component files.
Error bodies from the HomeStream API are always JSON `{ error, message }`.
Use instead:
```ts
const errData = await res.json().catch(() => ({}));
throw new Error(errData.message ?? errData.error ?? `Server error ${res.status}`);
```

### 3c — Parallel fetch loops not checking `res.ok`
Any `Promise.allSettled(tasks.map(async () => fetch(...)))` must throw inside
the async callback when `!res.ok`, otherwise failed requests count as fulfilled.

---

## 4 — Null / Undefined Crashes on Optional Fields

Fields that are optional in `media-library.json` and must use `?.` or `?? ''`:
- `plot`, `director`, `actors`, `rated`, `imdbId`, `enrichment`, `poster`
- `profileProgress`, `lastWatchedAt`, `addedAt`

```
grep -rn "\.plot\." src/pages/ src/components/
grep -rn "\.director\." src/pages/ src/components/
grep -rn "\.actors\." src/pages/ src/components/
```

Any bare `.toLowerCase()`, `.includes()`, `.map()`, `.filter()` on these fields
without optional chaining is a crash waiting to happen.

---

## 5 — QR Code Rendering

The `/api/remote/qr` endpoint supports two formats:
- `?format=svg` (default) → returns SVG markup string → render with `dangerouslySetInnerHTML`
- `?format=png` → returns base64 data URL → render with `<img src={qrData.qr}>`

**Never mix these up:**
```
grep -rn "format=svg" src/
grep -rn "dangerouslySetInnerHTML" src/
grep -rn "format=png" src/
```

Check that every `dangerouslySetInnerHTML={{ __html: x }}` is paired with
`?format=svg`, and every `<img src={x.qr}>` is paired with `?format=png`.

---

## 6 — Stale Closures in useState / useEffect

Any `setState` inside an async function that reads other state values must use
a functional update to avoid stale closure bugs:

```ts
// ❌ stale closure — reads tmdbKey from closure, may be outdated
setForm({ ...form, tmdbKey: fetched });

// ✅ functional update — always reads current state
setForm(f => ({ ...f, tmdbKey: fetched }));
```

```
grep -rn "setForm({" src/pages/setup/
grep -rn "setStatus({" src/pages/setup/
```

Check each one: if it's inside an async callback, it must use `f =>` form.

---

## 7 — Missing Error UI on Save Handlers

Every async save/submit handler that has a loading state must also have an
error state shown to the user. Pattern to look for:

```ts
// Has loading state...
setStatus(s => ({ ...s, field: 'saving' }));
// ...but catch block only resets to 'idle' with no visible error
catch { setStatus(s => ({ ...s, field: 'idle' })); }
```

Should be:
```ts
catch { setStatus(s => ({ ...s, field: 'error' })); }
// + JSX: {status.field === 'error' && <p className="text-destructive">...</p>}
```

Check all setup step files:
```
grep -rn "'saving'" src/pages/setup/
grep -rn "'error'" src/pages/setup/
```

Every field that has `'saving'` must also have `'error'` in both the type and the catch block.

---

## 8 — Server-Side Type String Consistency

```
grep -rn "type === 'show'" src/server/
grep -rn "type === \"show\"" src/server/
```

**Expected:** zero results. Server code (diagnostics, scheduled downloads,
library scans) must also use `'series'`.

---

## 9 — WebSocket Token Auth

The phone remote WebSocket must send the auth token. Check:

```
grep -n "hs_token" src/pages/remote.tsx
grep -n "localStorage.getItem" src/pages/remote.tsx
```

**Expected:** token is read from `localStorage.getItem('hs_token')` and sent
in the WebSocket connection URL or first message.

---

## 10 — HTTPS Warning Completeness

Any HTTPS-only feature warning must exclude both `localhost` AND `127.0.0.1`:

```
grep -rn "hostname !== 'localhost'" src/pages/ src/components/
```

Every match must be followed by `&& window.location.hostname !== '127.0.0.1'`.

---

## 11 — `/api/health` Returns `setupComplete`

```
grep -n "setupComplete" src/server/api/health/GET.ts
```

**Expected:** `setupComplete: isSetupComplete()` is present in the response.
This is the field that `/tv` and `/remote` depend on for their gate check.

---

## 12 — TypeScript Zero-Error Confirmation

After all fixes are applied:

```
npm run type-check
```

**Expected:** exit code 0, no errors, no warnings treated as errors.
Do NOT push if this fails.

---

## 13 — Remote Sub-Tab Auth Headers

The phone remote tabs (`BrowseTab`, `AITab`, `SearchTab`, `DownloadTab`) run on
the phone over LAN. They cannot set httpOnly cookies cross-origin, so they must
send the session token as a Bearer header on every authenticated API call.

The token is stored in `localStorage` as `hs_token` after login.
The helper `remoteAuthHeaders()` in `src/pages/remote/types.ts` returns it.

```
grep -rn "fetch('/api/" src/pages/remote/
```

Every result must spread `...remoteAuthHeaders()` into its headers object.
The `requireAuth` middleware accepts both cookie AND `Authorization: Bearer <token>`.

**Files to check:** `BrowseTab.tsx`, `AITab.tsx`, `SearchTab.tsx`, `DownloadTab.tsx`

---

## 14 — Re-verification After Every Fix

After fixing ANY issue found in checks 1–13, re-run the specific grep for that
check to confirm the fix actually landed and didn't introduce a new variant.

**Pattern:**
1. Fix found → apply fix
2. Re-run the exact grep from that check → confirm zero matches
3. Then move to the next check

Never declare a check "FIXED" without re-running its grep to verify.

---

## 15 — Dead Code / Deprecated Functions Still Called

```
grep -rn "isReachable\b" src/server/api/stremio/download/
```

`isReachable()` in the download flow was replaced by `testConnection()`.
Any remaining call to `isReachable()` in the download path is dead/wrong code.

Note: `isReachable()` is still valid in stats, broadcaster, and health endpoints
(it's a simple ping, not a credential check). Only flag it in the download path.

---

## Fix Log Template

When running the audit, report results in this format:

```
CHECK 1  — Type string consistency ............. ✅ PASS / ⚠️  FIXED (file:line)
CHECK 2  — Auth-gated fetches on /tv /remote ... ✅ PASS / ⚠️  FIXED
CHECK 3a — Missing res.ok checks ............... ✅ PASS / ⚠️  FIXED
CHECK 3b — res.text() on JSON bodies ........... ✅ PASS / ⚠️  FIXED
CHECK 3c — Parallel fetch res.ok ............... ✅ PASS / ⚠️  FIXED
CHECK 4  — Null crashes on optional fields ..... ✅ PASS / ⚠️  FIXED
CHECK 5  — QR rendering format mismatch ........ ✅ PASS / ⚠️  FIXED
CHECK 6  — Stale closures in setup steps ....... ✅ PASS / ⚠️  FIXED
CHECK 7  — Missing error UI on save handlers ... ✅ PASS / ⚠️  FIXED
CHECK 8  — Server-side type strings ............ ✅ PASS / ⚠️  FIXED
CHECK 9  — WebSocket token auth ................ ✅ PASS / ⚠️  FIXED
CHECK 10 — HTTPS warnings completeness ......... ✅ PASS / ⚠️  FIXED
CHECK 11 — /api/health setupComplete ........... ✅ PASS / ⚠️  FIXED
CHECK 12 — TypeScript .......................... ✅ 0 errors / ❌ N errors
CHECK 13 — Remote tab Bearer auth .............. ✅ PASS / ⚠️  FIXED
CHECK 14 — Re-verify all fixes ................. ✅ All greps re-run and confirmed
CHECK 15 — Dead code in download path .......... ✅ PASS / ⚠️  FIXED

Ready to push: YES / NO
```
