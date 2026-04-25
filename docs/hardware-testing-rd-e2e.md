# HomeStream — Real-Debrid End-to-End Hardware Testing Checklist

**Version:** 1.7.0  
**Date:** 2026-04-25  
**Purpose:** Step-by-step verification of the first Real-Debrid download on real hardware,
plus phone remote pairing and QR overlay timer confirmation.

---

## Prerequisites

Before starting, confirm all of the following:

- [ ] HomeStream server is running on the target machine (`npm run dev` or production build)
- [ ] Server is reachable from your phone on the same LAN (e.g. `http://192.168.x.x:3000`)
- [ ] Real-Debrid API key is entered in **Settings → Integrations → Real-Debrid**
- [ ] Real-Debrid account is **Premium** (not expired)
- [ ] `downloadsDir` is set in config and the directory exists with write permissions
- [ ] At least 5 GB free disk space in `downloadsDir`

---

## Part 1 — Real-Debrid Status Dot

**Goal:** Confirm the RD status pill on the Downloads page shows the correct state.

1. Open `http://{LAN_IP}:3000/downloads` in a browser.
2. Look at the top status bar — you should see two dots: **qBit** and **RD**.

| Expected RD dot state | Condition |
|---|---|
| 🟢 Green (pulsing) | Premium, >30 days remaining |
| 🟡 Amber | Premium, ≤30 days remaining |
| 🔴 Red | No API key or key invalid |
| ⚪ Grey | Still loading |

- [ ] RD dot shows correct colour for your account state
- [ ] Hovering the RD dot shows expiry date (if premium)

---

## Part 2 — First Real-Debrid Download

**Goal:** Queue a movie via RD and confirm it downloads to disk.

### 2a. Queue the download

1. Go to **Home** → search for a movie (e.g. "Inception").
2. Click the movie → **Download** button.
3. Select quality (1080p recommended for first test).
4. Click **Add to Queue**.

**Expected immediate response:**
- Toast: "Queued via Real-Debrid" (not "Added to qBittorrent")
- Downloads page shows a new RD job card with `backend: real-debrid`
- Job status: `downloading` with a progress bar

### 2b. Verify progress updates

5. Watch the Downloads page for 30–60 seconds.

- [ ] Progress bar advances (not stuck at 0%)
- [ ] Speed is shown (bytes/sec or MB/s)
- [ ] WebSocket dot (top-right) stays green — no reconnect flicker

### 2c. Verify completion

6. Wait for download to complete (or fast-forward by picking a small file).

- [ ] Job status changes to `done`
- [ ] File appears in `downloadsDir` with correct filename and extension
- [ ] File is playable (open in VLC or the HomeStream player)

### 2d. Verify restart resilience (Phase 5 fix)

7. While a download is **in progress** (status: `downloading`), restart the server.
8. After restart, open the Downloads page.

- [ ] The interrupted job shows status `error` (not stuck at `downloading`)
- [ ] A **Retry** button is visible on the job card
- [ ] No jobs are stuck in `downloading` or `queued` state

---

## Part 3 — Duplicate Detection

**Goal:** Confirm 409 fires when re-queuing the same torrent.

1. Queue the same movie again (same title, same quality).

- [ ] Toast shows "Already in queue" (409 response)
- [ ] No duplicate job card appears in the Downloads list

---

## Part 4 — Phone Remote Pairing

**Goal:** Confirm the phone remote pairs with the TV player and receives state immediately.

### 4a. Open the TV player

1. On the TV/desktop, open `http://{LAN_IP}:3000/tv`.
2. Navigate to a movie and start playing it.
3. The QR overlay should auto-appear within 2 seconds.

- [ ] QR overlay appears automatically on `/tv` page load
- [ ] QR overlay fades after ~45 seconds (auto-hide timer)
- [ ] "Phone Remote" button is visible after QR fades

### 4b. Scan the QR code

4. On your phone, open the camera and scan the QR code.
5. The phone browser opens `http://{LAN_IP}:3000/remote`.

- [ ] Phone remote loads without "Not Connected" error
- [ ] If server has a password: login form appears → enter password → token stored
- [ ] After login: remote control UI appears

### 4c. Verify immediate state sync (Phase 4 fix — confirm on hardware)

6. Check the phone remote immediately after connecting.

- [ ] Current time is shown correctly (not 0:00 / 0:00)
- [ ] Poster image is shown
- [ ] Play/pause state matches the TV
- [ ] Subtitle track list is populated (not empty)

### 4d. Verify remote controls work

7. Test each control from the phone:

- [ ] Play / Pause — TV responds immediately
- [ ] Seek (drag scrubber) — TV jumps to correct position
- [ ] Skip forward 10s — TV advances
- [ ] Skip back 10s — TV rewinds
- [ ] Volume up/down — TV volume changes
- [ ] Subtitle picker — selecting a track changes subtitles on TV
- [ ] Next Episode button (if series) — TV navigates to next episode

### 4e. Verify QR timer reset

8. On the TV, click the "Phone Remote" button.

- [ ] QR overlay re-appears with a fresh 45-second timer
- [ ] QR overlay fades again after ~45 seconds
- [ ] Clicking the button again resets the timer (does not stack)

---

## Part 5 — WebSocket Stability

**Goal:** Confirm WS connections survive 5+ minutes without reconnecting.

1. Leave the Downloads page open for 5 minutes with an active download.
2. Leave the phone remote connected for 5 minutes.

- [ ] Downloads page WS dot stays green (no flicker to yellow/red)
- [ ] Phone remote stays "Connected" (no "Reconnecting…" banner)
- [ ] Server logs show 25s ping/pong cycles (no zombie terminations)

---

## Part 6 — Phone Remote Downloads Badge

**Goal:** Confirm the Downloads tab badge on the phone remote counts RD jobs.

1. Start an RD download.
2. On the phone remote, look at the tab bar.

- [ ] Downloads tab shows a badge number > 0 while RD job is downloading
- [ ] Badge disappears when download completes
- [ ] Badge count includes RD jobs (not just qBit/WT jobs)

---

## Part 7 — Manual Refresh Consistency (Phase 5 fix)

**Goal:** Confirm RD jobs don't disappear after a mutation.

1. Start an RD download.
2. Delete a different job (qBit or WT) from the Downloads page.
3. Watch the Downloads page for 5 seconds after the delete.

- [ ] RD job section remains visible throughout (does not disappear for 5s)
- [ ] RD job progress continues updating via WebSocket

---

## Known Limitations / Notes

- **mDNS (`hs.local`) is intentionally NOT used** — fails on Samsung Tizen and Android.
  Always use the raw LAN IP shown in the QR code.
- **RD downloads are direct HTTP** — no torrent swarm, no seeding ratio.
  Speed depends on RD's CDN, not your upload bandwidth.
- **Progress throttle is 1 second** — the progress bar updates at most once per second
  per job. This is intentional to avoid hammering the disk with writes.
- **Batch series downloads** — each episode gets its own job card and progress bar.
  They download sequentially (not in parallel) to avoid overwhelming the RD API.

---

## Failure Triage

| Symptom | Likely cause | Fix |
|---|---|---|
| RD dot is red but key is set | Key invalid or expired | Re-enter key in Settings |
| Download stuck at 0% | `downloadsDir` not writable | `chmod 755 /path/to/downloads` |
| Job stuck at `downloading` after restart | Phase 5 fix not deployed | Verify v1.7.0 is running |
| Phone remote shows 0:00 / 0:00 | `onOpen` callback not firing | Check WS server logs for `role=screen` registration |
| QR code doesn't scan | IP in QR is wrong | Check `/api/network/info` returns correct `primary` |
| 409 on first download | Hash collision in job store | Delete the stuck job via the UI, then retry |
| Downloads badge shows 0 on phone | Bearer token not sent | Verify `hs_token` is in phone's localStorage |
