/**
 * GET /api/jellyfin/Items/:id
 *
 * Returns a single Jellyfin-format item by id.
 * TV apps (Infuse, Jellyfin for Roku/Fire TV) call this to get full metadata
 * before starting playback.
 */
import type { Request, Response } from 'express';
import { readLibrary } from '../../../../libraryStore.js';
import { requireJellyfinAuth } from '../../../../jellyfinAuth.js';

interface LibraryItem {
  id: string;
  title: string;
  type: 'movie' | 'series';
  year?: string;
  genre?: string[];
  poster?: string;
  backdrop?: string;
  imdbRating?: string;
  rated?: string;
  plot?: string;
  filename?: string;
  addedAt?: string;
  watchProgress?: number;
  watchedSeconds?: number;
  runtime?: number;
  director?: string;
  actors?: string;
  enrichment?: { aiSummary?: string; tags?: string[]; mood?: string };
}

const SERVER_ID = 'homestream-server-001';

function toJellyfinItem(item: LibraryItem, baseUrl: string) {
  const isMovie = item.type === 'movie';
  const ratingValue = parseFloat(item.imdbRating ?? '0') || 0;

  return {
    Name: item.title,
    ServerId: SERVER_ID,
    Id: item.id,
    Type: isMovie ? 'Movie' : 'Series',
    MediaType: 'Video',
    IsFolder: !isMovie,
    ProductionYear: item.year ? parseInt(item.year) : undefined,
    Genres: item.genre ?? [],
    CommunityRating: ratingValue > 0 ? ratingValue : undefined,
    OfficialRating: item.rated,
    Overview: item.enrichment?.aiSummary ?? item.plot,
    DateCreated: item.addedAt ?? new Date().toISOString(),
    PremiereDate: item.year ? `${item.year}-01-01T00:00:00.0000000Z` : undefined,
    RunTimeTicks: item.runtime ? item.runtime * 600_000_000 : undefined,
    People: [
      ...(item.director ? [{ Name: item.director, Type: 'Director' }] : []),
      ...(item.actors
        ? (Array.isArray(item.actors) ? item.actors : item.actors.split(',')).slice(0, 5).map((a: string) => ({ Name: a.trim(), Type: 'Actor' }))
        : []),
    ],
    UserData: {
      PlaybackPositionTicks: item.watchedSeconds ? item.watchedSeconds * 10_000_000 : 0,
      PlayCount: (item.watchProgress ?? 0) >= 90 ? 1 : 0,
      IsFavorite: false,
      Played: (item.watchProgress ?? 0) >= 90,
      Key: item.id,
    },
    ImageTags: item.poster ? { Primary: 'poster' } : {},
    BackdropImageTags: item.backdrop ? ['backdrop'] : [],
    PrimaryImageAspectRatio: item.poster ? 0.667 : undefined,
    MediaSources: item.filename ? [{
      Protocol: 'File',
      Id: item.id,
      Path: item.filename,
      Type: 'Default',
      Container: item.filename.split('.').pop() ?? 'mp4',
      Size: 0,
      Name: item.title,
      IsRemote: false,
      SupportsTranscoding: true,
      SupportsDirectStream: true,
      SupportsDirectPlay: true,
      IsInfiniteStream: false,
      Bitrate: 0,
      MediaStreams: [
        { Codec: 'h264', Type: 'Video', Index: 0, IsDefault: true, IsExternal: false },
        { Codec: 'aac', Type: 'Audio', Index: 1, IsDefault: true, IsExternal: false, Language: 'eng', DisplayTitle: 'English' },
      ],
      DirectStreamUrl: `${baseUrl}/api/stream/${encodeURIComponent(item.filename)}`,
      TranscodingUrl: `/api/hls/${item.id}/index.m3u8`,
      TranscodingSubProtocol: 'hls',
      TranscodingContainer: 'ts',
    }] : [],
  };
}

export default function handler(req: Request, res: Response) {
  if (!requireJellyfinAuth(req, res)) return;
  try {
    const { id } = req.params;
    const library = readLibrary<LibraryItem>();
    const item = library.find(i => i.id === id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const proto = req.headers['x-forwarded-proto'] ?? req.protocol;
    const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:3000';
    const baseUrl = `${proto}://${host}`;

    res.json(toJellyfinItem(item, baseUrl));
  } catch (err) {
    res.status(500).json({ error: 'Failed to get item', message: String(err) });
  }
}
