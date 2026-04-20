/**
 * Shared test helpers for Jellyfin endpoint unit tests.
 *
 * Strategy: all tests are pure unit tests — no HTTP server is started.
 * Each handler is imported directly and called with mock req/res objects.
 * The libraryStore and configStore are vi.mock()'d so tests never touch disk.
 */
import { vi } from 'vitest';
import type { Request } from 'express';

// ── Mock req/res factory ──────────────────────────────────────────────────────

export interface MockRes {
  statusCode: number;
  body: unknown;
  redirectUrl: string | null;
  ended: boolean;
  headers: Record<string, string>;
  // Express-compatible chainable methods
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
}

export function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    body: undefined,
    redirectUrl: null,
    ended: false,
    headers: {},
    status: vi.fn(),
    json: vi.fn(),
    send: vi.fn(),
    end: vi.fn(),
    redirect: vi.fn(),
    setHeader: vi.fn(),
  };

  // status() returns `this` so callers can chain .json() / .send()
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });

  res.json.mockImplementation((data: unknown) => {
    res.body = data;
    res.ended = true;
    return res;
  });

  res.send.mockImplementation((data?: unknown) => {
    res.body = data;
    res.ended = true;
    return res;
  });

  res.end.mockImplementation(() => {
    res.ended = true;
    return res;
  });

  res.redirect.mockImplementation((_code: number, url: string) => {
    res.redirectUrl = url;
    res.ended = true;
    return res;
  });

  res.setHeader.mockImplementation((key: string, value: string) => {
    res.headers[key] = value;
    return res;
  });

  return res;
}

export function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    headers: { host: 'localhost:3000' },
    protocol: 'http',
    ...overrides,
  } as unknown as Request;
}

// ── Sample library fixtures ───────────────────────────────────────────────────

export const MOVIE_ITEM = {
  id: 'movie-001',
  title: 'Inception',
  type: 'movie' as const,
  year: '2010',
  genre: ['Action', 'Sci-Fi', 'Thriller'],
  poster: '/posters/inception.jpg',
  backdrop: '/backdrops/inception.jpg',
  imdbRating: '8.8',
  rated: 'PG-13',
  plot: 'A thief who steals corporate secrets through dream-sharing technology.',
  filename: 'inception.mp4',
  filepath: '/media/inception.mp4',
  addedAt: '2024-01-15T10:00:00.000Z',
  watchProgress: 45,
  watchedSeconds: 2700,
  totalSeconds: 8880,
  runtime: 148,
  director: 'Christopher Nolan',
  actors: 'Leonardo DiCaprio, Joseph Gordon-Levitt, Elliot Page',
  enrichment: {
    aiSummary: 'A mind-bending heist thriller set within the architecture of dreams.',
    tags: ['heist', 'dreams', 'sci-fi'],
    mood: ['tense', 'cerebral'],
  },
};

export const SERIES_ITEM = {
  id: 'series-001',
  title: 'Breaking Bad',
  type: 'series' as const,
  year: '2008',
  genre: ['Crime', 'Drama', 'Thriller'],
  poster: '/posters/breaking-bad.jpg',
  backdrop: '/backdrops/breaking-bad.jpg',
  imdbRating: '9.5',
  rated: 'TV-MA',
  plot: 'A high school chemistry teacher turned methamphetamine manufacturer.',
  filename: undefined,
  filepath: '/media/breaking-bad',
  addedAt: '2024-02-01T08:00:00.000Z',
  watchProgress: 0,
  watchedSeconds: 0,
  totalSeconds: 0,
  runtime: 47,
  director: 'Vince Gilligan',
  actors: 'Bryan Cranston, Aaron Paul, Anna Gunn',
};

export const MOVIE_ITEM_2 = {
  id: 'movie-002',
  title: 'The Dark Knight',
  type: 'movie' as const,
  year: '2008',
  genre: ['Action', 'Crime', 'Drama'],
  poster: '/posters/dark-knight.jpg',
  backdrop: '/backdrops/dark-knight.jpg',
  imdbRating: '9.0',
  rated: 'PG-13',
  plot: 'Batman faces the Joker, a criminal mastermind who wants to plunge Gotham into anarchy.',
  filename: 'dark-knight.mkv',
  filepath: '/media/dark-knight.mkv',
  addedAt: '2024-03-10T12:00:00.000Z',
  watchProgress: 100,
  watchedSeconds: 9120,
  totalSeconds: 9120,
  runtime: 152,
  director: 'Christopher Nolan',
  actors: 'Christian Bale, Heath Ledger, Aaron Eckhart',
};

export const SAMPLE_LIBRARY = [MOVIE_ITEM, SERIES_ITEM, MOVIE_ITEM_2];
