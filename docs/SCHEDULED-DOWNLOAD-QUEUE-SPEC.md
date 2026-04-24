# Scheduled Download Queue — Design Spec
**HomeStream · Proposed for v1.5.0**

---

## Problem

qBittorrent downloads + FFmpeg transcodes are bandwidth-heavy. On a family install,
kicking off a movie download at 7pm throttles everyone's streaming and browsing.
Users need a way to say "download this tonight" and have it start automatically
during off-peak hours.

---

## Goals

- Queue downloads for a configurable time window (e.g., midnight–6am)
- "Download Now" still works — scheduling is opt-in per job
- Active jobs are never interrupted — only new job dispatch is paused outside the window
- Zero new npm packages — pure Node.js wall-clock timeouts (same pattern as episodeScheduler.ts)
- Settings UI: time-range picker + toggle
- Per-card UI: "Schedule for Tonight" button alongside existing "Download Now"

---

## Config Schema Addition

```typescript
// homestream-config.json — new field
scheduleWindow?: {
  enabled: boolean;       // default: false
  startHour: number;      // 0–23, default: 0  (midnight)
  endHour: number;        // 0–23, default: 6  (6am)
}
```

---

## Data Model Change

```typescript
// downloadJobStore.ts — PersistedJob addition
interface PersistedJob {
  // ... existing fields ...
  scheduledFor?: number;   // unix ms — if set, job waits until this time
  scheduleMode?: 'immediate' | 'scheduled';  // default: 'immediate'
}
```

---

## Queue Processor Logic

```
downloadQueueProcessor.ts (new file, started in serverBefore)

On each dispatch attempt:
  1. Get next pending job from queue
  2. If job.scheduleMode === 'immediate' → dispatch immediately
  3. If scheduleWindow.enabled:
       currentHour = new Date().getHours()
       inWindow = currentHour >= startHour && currentHour < endHour
       if (!inWindow && job.scheduleMode === 'scheduled'):
         → do NOT dispatch
         → set wall-clock timeout to wake at startHour (same pattern as episodeScheduler.ts)
         → log: [scheduler] Download queue paused — window opens at HH:00
  4. If in window OR immediate → dispatch to qBittorrent API
  5. On window open (timeout fires) → resume dispatch loop
```

**Key invariant:** Jobs already downloading are NEVER paused. Only the dispatch of
NEW jobs from the queue is gated by the window.

---

## New API Endpoints

```
POST /api/downloads/schedule
  Body: { jobId: string, scheduledFor?: number }
  → Sets job.scheduleMode = 'scheduled', optionally sets scheduledFor timestamp
  → Returns updated job

GET /api/downloads/schedule/window
  → Returns current scheduleWindow config + next window open time

PUT /api/config/schedule-window
  Body: { enabled: boolean, startHour: number, endHour: number }
  → Updates scheduleWindow in config
  → Restarts queue processor with new window
```

---

## UI Changes

### Downloads Page — Per-card buttons

```
[▶ Download Now]  [🌙 Schedule for Tonight]
```

"Schedule for Tonight" computes `scheduledFor = next occurrence of startHour`
and calls `POST /api/downloads/schedule`.

Scheduled jobs show a badge: `🌙 Queued for 12:00 AM`

### Settings → Downloads section (new subsection)

```
┌─ Off-Peak Download Window ──────────────────────────────┐
│  [✓] Enable scheduled downloads                         │
│                                                         │
│  Start time:  [00:00 ▼]   End time:  [06:00 ▼]         │
│                                                         │
│  Downloads queued as "scheduled" will only start        │
│  between midnight and 6:00 AM.                          │
└─────────────────────────────────────────────────────────┘
```

Time picker: `<select>` with 24 hour options (0–23), rendered as "12:00 AM", "1:00 AM", etc.

---

## Files to Create/Modify

| File | Change |
|---|---|
| `src/server/downloadQueueProcessor.ts` | NEW — window-aware dispatch loop |
| `src/server/downloadJobStore.ts` | Add `scheduledFor`, `scheduleMode` to `PersistedJob` |
| `src/server/configStore.ts` | Add `scheduleWindow` to config type |
| `src/server/configure.js` | Start `downloadQueueProcessor` in `serverBefore` |
| `src/server/api/downloads/schedule/POST.ts` | NEW |
| `src/server/api/downloads/schedule/window/GET.ts` | NEW |
| `src/server/api/config/schedule-window/PUT.ts` | NEW |
| `src/pages/downloads.tsx` | Add "Schedule for Tonight" button + scheduled badge |
| `src/components/SettingsPanel.tsx` | Add Off-Peak Window subsection |

---

## Wall-Clock Timeout Pattern (from episodeScheduler.ts)

```typescript
function scheduleWakeAt(hour: number, onWake: () => void): NodeJS.Timeout {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1); // tomorrow if already past
  const ms = next.getTime() - now.getTime();
  console.log(`[scheduler] Queue will resume in ${Math.round(ms / 60000)}m`);
  return setTimeout(onWake, ms);
}
```

This is identical to the wall-clock guard in `episodeScheduler.ts` — proven pattern,
no new dependencies.

---

## Estimated Effort

| Task | Hours |
|---|---|
| Config schema + store changes | 1h |
| `downloadQueueProcessor.ts` | 3h |
| 3 new API endpoints | 2h |
| Downloads page UI | 2h |
| Settings UI | 1h |
| Tests | 2h |
| **Total** | **~11h** |

---

## Non-Goals

- Per-job custom schedule times (just "tonight" for now — can add later)
- Pause/resume active torrents based on window (too disruptive; qBittorrent handles bandwidth limits natively)
- Multiple windows per day (single window is sufficient for home use)
- Mobile push notifications when queue resumes (future enhancement)
