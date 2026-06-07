/**
 * HomeStream Taste Engine
 *
 * Aggregates watch events into a persistent taste profile and computes
 * per-item "would I like this?" scores for the library.
 *
 * Score weights:
 *   complete (watched >85%)  → +3.0
 *   long watch (50–85%)      → +1.5
 *   medium watch (20–50%)    → +0.5
 *   skip (<20% and stopped)  → -1.5
 *   thumbs_up                → +4.0
 *   thumbs_down              → -4.0
 *   explicit rating 8–10     → +3.0
 *   explicit rating 5–7      → +1.0
 *   explicit rating 1–4      → -2.0
 *
 * Dimensions tracked: genre, director, actor, decade
 */
// Lazy DB access — db/client throws at import time when the cloud DB config
// file (/local/config.json) is absent (e.g. on a user's Windows/Linux desktop).
// We use a runtime-constructed path so the bundler cannot statically inline
// the import and pull getDatabaseCredentials() into the startup critical path.
type AnyDB = ReturnType<typeof import('drizzle-orm/mysql2').drizzle>;
let _db: AnyDB | null = null;
let _dbLoadAttempted = false;
async function getDb(): Promise<AnyDB | null> {
  if (_dbLoadAttempted) return _db;
  _dbLoadAttempted = true;
  try {
    // Build the path at runtime so bundlers (esbuild/rollup) cannot statically
    // resolve and inline db/client — which throws on desktop without /local/config.json
    const parts = ['./db/', 'client.js'];
    const mod = await import(/* @vite-ignore */ parts.join(''));
    _db = mod.db as AnyDB;
  } catch {
    _db = null;
  }
  return _db;
}

import type * as schema from './db/schema.js';
let _schema: typeof schema | null = null;
async function getSchema(): Promise<typeof schema | null> {
  if (_schema) return _schema;
  try {
    const parts = ['./db/', 'schema.js'];
    _schema = await import(/* @vite-ignore */ parts.join('')) as typeof schema;
  } catch {
    _schema = null;
  }
  return _schema;
}

import { eq, and, desc } from 'drizzle-orm';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WatchEventInput {
  profileId?: string;
  mediaId: string;
  mediaTitle: string;
  mediaType: 'movie' | 'series';
  genres: string[];
  director: string;
  actors: string;
  year: string;
  imdbRating: string;
  eventType: 'play' | 'pause' | 'skip' | 'complete' | 'rate' | 'thumbs_up' | 'thumbs_down';
  progressPct: number;
  watchedSecs?: number;
  durationSecs?: number;
  userRating?: number;
}

export interface TasteProfileEntry {
  dimension: string;
  value: string;
  score: number;
  eventCount: number;
}

export interface LibraryItem {
  id: string;
  title: string;
  type: string;
  genres: string[];
  director: string;
  actors: string;
  year: string;
  imdbRating: string;
  watchProgress: number;
}

// ── Event → score mapping ─────────────────────────────────────────────────────

function eventScore(event: WatchEventInput): number {
  switch (event.eventType) {
    case 'thumbs_up':   return 4.0;
    case 'thumbs_down': return -4.0;
    case 'complete':    return 3.0;
    case 'rate': {
      const r = event.userRating ?? 0;
      if (r >= 8) return 3.0;
      if (r >= 5) return 1.0;
      return -2.0;
    }
    case 'play':
    case 'pause': {
      const p = event.progressPct;
      if (p >= 85) return 3.0;
      if (p >= 50) return 1.5;
      if (p >= 20) return 0.5;
      return 0;
    }
    case 'skip': {
      if (event.progressPct < 20) return -1.5;
      return 0;
    }
    default: return 0;
  }
}

// ── Record a watch event ──────────────────────────────────────────────────────

export async function recordWatchEvent(input: WatchEventInput): Promise<void> {
  const db = await getDb();
  const s  = await getSchema();
  if (!db || !s) return; // no DB — silently skip

  const profileId = input.profileId ?? 'default';
  const score     = eventScore(input);

  await db.insert(s.watchEvents).values({
    profileId,
    mediaId:      input.mediaId,
    mediaTitle:   input.mediaTitle,
    mediaType:    input.mediaType,
    genres:       input.genres,
    director:     input.director,
    actors:       input.actors,
    year:         input.year,
    imdbRating:   input.imdbRating,
    eventType:    input.eventType,
    progressPct:  input.progressPct,
    watchedSecs:  input.watchedSecs  ?? 0,
    durationSecs: input.durationSecs ?? 0,
    userRating:   input.userRating,
  });

  if (score === 0) return;

  const dimensions: { dim: string; val: string }[] = [
    ...input.genres.map(g => ({ dim: 'genre', val: g })),
    ...(input.director ? [{ dim: 'director', val: input.director }] : []),
    ...input.actors.split(',').slice(0, 3).map(a => ({ dim: 'actor', val: a.trim() })).filter(a => a.val),
    ...(input.year ? [{ dim: 'decade', val: `${input.year.slice(0, 3)}0s` }] : []),
  ];

  for (const { dim, val } of dimensions) {
    if (!val) continue;

    const existing = await db
      .select()
      .from(s.tasteProfile)
      .where(and(
        eq(s.tasteProfile.profileId, profileId),
        eq(s.tasteProfile.dimension, dim),
        eq(s.tasteProfile.value, val),
      ))
      .limit(1);

    if (existing.length > 0) {
      const prev       = existing[0];
      const newScore   = prev.score * 0.85 + score * 0.15;
      const newCount   = prev.eventCount + 1;
      await db.update(s.tasteProfile)
        .set({ score: newScore, eventCount: newCount })
        .where(eq(s.tasteProfile.id, prev.id));
    } else {
      await db.insert(s.tasteProfile).values({
        profileId,
        dimension:  dim,
        value:      val,
        score,
        eventCount: 1,
      });
    }
  }
}

// ── Get taste profile ─────────────────────────────────────────────────────────

export async function getTasteProfile(profileId = 'default'): Promise<TasteProfileEntry[]> {
  const db = await getDb();
  const s  = await getSchema();
  if (!db || !s) return [];
  return db
    .select()
    .from(s.tasteProfile)
    .where(eq(s.tasteProfile.profileId, profileId))
    .orderBy(desc(s.tasteProfile.score));
}

// ── Score a single library item ───────────────────────────────────────────────

export function scoreItem(item: LibraryItem, profile: TasteProfileEntry[]): number {
  if (profile.length === 0) return 50; // no data yet — neutral

  const byDim = new Map<string, Map<string, number>>();
  for (const entry of profile) {
    if (!byDim.has(entry.dimension)) byDim.set(entry.dimension, new Map());
    byDim.get(entry.dimension)!.set(entry.value, entry.score);
  }

  let total = 0;
  let weight = 0;

  // Genre match (weight 3)
  const genreMap = byDim.get('genre') ?? new Map<string, number>();
  for (const g of item.genres) {
    const s = genreMap.get(g);
    if (s !== undefined) { total += s * 3; weight += 3; }
  }

  // Director match (weight 4)
  const dirMap = byDim.get('director') ?? new Map<string, number>();
  if (item.director) {
    const s = dirMap.get(item.director);
    if (s !== undefined) { total += s * 4; weight += 4; }
  }

  // Actor match (weight 2 each, up to 3 actors)
  const actMap = byDim.get('actor') ?? new Map<string, number>();
  const actors = item.actors.split(',').slice(0, 3).map(a => a.trim());
  for (const a of actors) {
    const s = actMap.get(a);
    if (s !== undefined) { total += s * 2; weight += 2; }
  }

  // Decade match (weight 1)
  const decMap = byDim.get('decade') ?? new Map<string, number>();
  if (item.year) {
    const decade = `${item.year.slice(0, 3)}0s`;
    const s = decMap.get(decade);
    if (s !== undefined) { total += s * 1; weight += 1; }
  }

  if (weight === 0) return 50; // no matching dimensions — neutral

  // Normalise to 0–100
  const maxPossible = 4.0; // max score per event
  const raw = total / weight;
  const normalised = ((raw / maxPossible) + 1) / 2 * 100;
  return Math.max(0, Math.min(100, Math.round(normalised)));
}

// ── Recompute all taste scores for a library ──────────────────────────────────

export async function recomputeTasteScores(
  library: LibraryItem[],
  profileId = 'default',
): Promise<void> {
  const db = await getDb();
  const s  = await getSchema();
  if (!db || !s) return;

  const profile = await getTasteProfile(profileId);

  for (const item of library) {
    const score   = scoreItem(item, profile);
    const watched = (item.watchProgress ?? 0) > 85;

    const existing = await db
      .select()
      .from(s.tasteScores)
      .where(and(
        eq(s.tasteScores.profileId, profileId),
        eq(s.tasteScores.mediaId, item.id),
      ))
      .limit(1);

    if (existing.length > 0) {
      await db.update(s.tasteScores)
        .set({ score, watched, mediaTitle: item.title })
        .where(eq(s.tasteScores.id, existing[0].id));
    } else {
      await db.insert(s.tasteScores).values({
        profileId,
        mediaId:    item.id,
        mediaTitle: item.title,
        score,
        watched,
      });
    }
  }
}

// ── Get top recommendations ───────────────────────────────────────────────────

export async function getTopRecommendations(
  profileId = 'default',
  limit = 10,
): Promise<{ mediaId: string; mediaTitle: string; score: number }[]> {
  const db = await getDb();
  const s  = await getSchema();
  if (!db || !s) return [];

  const rows = await db
    .select()
    .from(s.tasteScores)
    .where(and(
      eq(s.tasteScores.profileId, profileId),
      eq(s.tasteScores.watched, false),
    ))
    .orderBy(desc(s.tasteScores.score))
    .limit(limit);

  return rows.map(r => ({ mediaId: r.mediaId, mediaTitle: r.mediaTitle, score: r.score }));
}

// ── Build taste summary string for AI system prompt ───────────────────────────

export async function buildTasteSummary(profileId = 'default'): Promise<string> {
  const profile = await getTasteProfile(profileId);
  if (profile.length === 0) return 'No taste data yet — the user has not watched anything.';

  const byDim = new Map<string, TasteProfileEntry[]>();
  for (const e of profile) {
    if (!byDim.has(e.dimension)) byDim.set(e.dimension, []);
    byDim.get(e.dimension)!.push(e);
  }

  const fmt = (entries: TasteProfileEntry[], top = 5) =>
    entries
      .sort((a, b) => b.score - a.score)
      .slice(0, top)
      .map(e => `${e.value} (${e.score > 0 ? '+' : ''}${e.score.toFixed(1)}, ${e.eventCount} events)`)
      .join(', ');

  const loved    = profile.filter(e => e.score > 1).slice(0, 8).map(e => e.value).join(', ');
  const disliked = profile.filter(e => e.score < -0.5).slice(0, 5).map(e => e.value).join(', ');

  const lines: string[] = ['━━━ LEARNED TASTE PROFILE (persistent, built from watch history) ━━━'];

  if (byDim.has('genre'))    lines.push(`Favourite genres:    ${fmt(byDim.get('genre')!)}`);
  if (byDim.has('director')) lines.push(`Favourite directors: ${fmt(byDim.get('director')!, 4)}`);
  if (byDim.has('actor'))    lines.push(`Favourite actors:    ${fmt(byDim.get('actor')!, 5)}`);
  if (byDim.has('decade'))   lines.push(`Favourite decades:   ${fmt(byDim.get('decade')!, 4)}`);
  if (loved)    lines.push(`Overall loves:    ${loved}`);
  if (disliked) lines.push(`Tends to dislike: ${disliked}`);

  lines.push('');
  lines.push('Use this profile to weight your recommendations heavily. The user has demonstrated these preferences through actual watching behaviour — trust this data over generic popularity.');

  return lines.join('\n');
}

// ── Recent watch history summary ──────────────────────────────────────────────

export async function getRecentWatchHistory(
  profileId = 'default',
  limit = 20,
): Promise<{ mediaId: string; mediaTitle: string; eventType: string; progressPct: number; genres: string[]; createdAt: Date }[]> {
  const db = await getDb();
  const s  = await getSchema();
  if (!db || !s) return [];

  const rows = await db
    .select()
    .from(s.watchEvents)
    .where(eq(s.watchEvents.profileId, profileId))
    .orderBy(desc(s.watchEvents.createdAt))
    .limit(limit);

  return rows.map(r => ({
    mediaId:    r.mediaId,
    mediaTitle: r.mediaTitle,
    eventType:  r.eventType,
    progressPct: r.progressPct,
    genres:     (r.genres as string[]) ?? [],
    createdAt:  r.createdAt,
  }));
}
