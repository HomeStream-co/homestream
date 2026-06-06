/**
 * HomeStream — Drizzle ORM schema
 *
 * Tables:
 *   taste_profile     — per-user aggregated taste signals (genres, directors, actors)
 *   watch_events      — raw event log (play, pause, skip, complete, rate)
 *   media_enrichment  — cached Trakt.tv + OMDB data per media item
 *   taste_scores      — pre-computed "would I like this?" score per library item
 */
import {
  mysqlTable, int, varchar, text, float, boolean,
  timestamp, json, index,
} from 'drizzle-orm/mysql-core';

// ── Watch event log ───────────────────────────────────────────────────────────
// Every meaningful interaction with a media item is recorded here.
// The taste engine aggregates these into taste_profile.

export const watchEvents = mysqlTable('watch_events', {
  id:          int('id').primaryKey().autoincrement(),
  profileId:   varchar('profile_id', { length: 64 }).notNull().default('default'),
  mediaId:     varchar('media_id',   { length: 128 }).notNull(),
  mediaTitle:  varchar('media_title',{ length: 512 }).notNull().default(''),
  mediaType:   varchar('media_type', { length: 16 }).notNull().default('movie'), // movie | series
  genres:      json('genres').$type<string[]>().notNull().default([]),
  director:    varchar('director',   { length: 255 }).notNull().default(''),
  actors:      text('actors').notNull().default(''),
  year:        varchar('year',       { length: 8 }).notNull().default(''),
  imdbRating:  varchar('imdb_rating',{ length: 8 }).notNull().default(''),

  // Event type
  eventType:   varchar('event_type', { length: 32 }).notNull(), // play | pause | skip | complete | rate | thumbs_up | thumbs_down

  // Playback signals
  progressPct: float('progress_pct').notNull().default(0),   // 0–100
  watchedSecs: int('watched_secs').notNull().default(0),
  durationSecs:int('duration_secs').notNull().default(0),

  // Explicit rating (1–10, null if not rated)
  userRating:  float('user_rating'),

  // Metadata
  createdAt:   timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_we_profile').on(t.profileId),
  index('idx_we_media').on(t.mediaId),
  index('idx_we_event').on(t.eventType),
  index('idx_we_created').on(t.createdAt),
]);

// ── Aggregated taste profile ──────────────────────────────────────────────────
// One row per (profileId, dimension, value).
// dimension: 'genre' | 'director' | 'actor' | 'decade' | 'language'
// score: positive = liked, negative = disliked, magnitude = confidence

export const tasteProfile = mysqlTable('taste_profile', {
  id:          int('id').primaryKey().autoincrement(),
  profileId:   varchar('profile_id', { length: 64 }).notNull().default('default'),
  dimension:   varchar('dimension',  { length: 32 }).notNull(),  // genre | director | actor | decade
  value:       varchar('value',      { length: 255 }).notNull(), // e.g. "Action" | "Christopher Nolan"
  score:       float('score').notNull().default(0),              // weighted affinity score
  eventCount:  int('event_count').notNull().default(0),          // how many events contributed
  updatedAt:   timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index('idx_tp_profile_dim').on(t.profileId, t.dimension),
  index('idx_tp_score').on(t.score),
]);

// ── Trakt + external enrichment cache ────────────────────────────────────────
// Cached per mediaId so we don't hammer Trakt on every request.

export const mediaEnrichment = mysqlTable('media_enrichment', {
  id:           int('id').primaryKey().autoincrement(),
  mediaId:      varchar('media_id',    { length: 128 }).notNull().unique(),
  imdbId:       varchar('imdb_id',     { length: 32 }).notNull().default(''),
  traktSlug:    varchar('trakt_slug',  { length: 255 }).notNull().default(''),

  // Trakt audience scores
  traktRating:  float('trakt_rating'),   // 0–10
  traktVotes:   int('trakt_votes'),

  // Rotten Tomatoes-style scores (from Trakt certifications / OMDB tomatoMeter)
  audienceScore: int('audience_score'),  // 0–100
  criticScore:   int('critic_score'),    // 0–100

  // Similar titles (array of imdbIds)
  similarIds:   json('similar_ids').$type<string[]>().notNull().default([]),

  // Full Trakt metadata blob (genres, tagline, etc.)
  traktMeta:    json('trakt_meta').$type<Record<string, unknown>>(),

  fetchedAt:    timestamp('fetched_at').defaultNow().notNull(),
  expiresAt:    timestamp('expires_at').notNull(),
}, (t) => [
  index('idx_me_imdb').on(t.imdbId),
  index('idx_me_expires').on(t.expiresAt),
]);

// ── Pre-computed taste scores ─────────────────────────────────────────────────
// Recomputed whenever watch_events or taste_profile changes.
// The homepage "You'd probably like" shelf reads from here.

export const tasteScores = mysqlTable('taste_scores', {
  id:          int('id').primaryKey().autoincrement(),
  profileId:   varchar('profile_id', { length: 64 }).notNull().default('default'),
  mediaId:     varchar('media_id',   { length: 128 }).notNull(),
  mediaTitle:  varchar('media_title',{ length: 512 }).notNull().default(''),
  score:       float('score').notNull().default(0),      // 0–100 predicted match %
  watched:     boolean('watched').notNull().default(false),
  updatedAt:   timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index('idx_ts_profile_score').on(t.profileId, t.score),
  index('idx_ts_media').on(t.mediaId),
]);
