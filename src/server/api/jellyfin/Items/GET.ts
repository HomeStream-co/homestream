/**
 * GET /api/jellyfin/Items
 *
 * Jellyfin-compatible library browse endpoint.
 * TV apps call this to list movies, shows, and episodes.
 *
 * Supports query params:
 *   IncludeItemTypes  — Movie, Series, Episode
 *   ParentId          — filter by parent (series ID for episodes)
 *   SortBy            — SortName, DateCreated, PremiereDate, CommunityRating
 *   SortOrder         — Ascending, Descending
 *   StartIndex        — pagination offset
 *   Limit             — page size
 *   Fields            — extra fields to include
 *   SearchTerm        — search filter
 */
import type { Request, Response } from 'express';
import { readLibrary } from '../../../libraryStore.js';

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
  enrichment?: {
    aiSummary?: string;
    tags?: string[];
    mood?: string;
  };
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
    RunTimeTicks: item.runtime ? item.runtime * 600_000_000 : undefined, // minutes → ticks
    UserData: {
      PlaybackPositionTicks: item.watchedSeconds ? item.watchedSeconds * 10_000_000 : 0,
      PlayCount: item.watchProgress && item.watchProgress >= 90 ? 1 : 0,
      IsFavorite: false,
      Played: (item.watchProgress ?? 0) >= 90,
      Key: item.id,
    },
    ImageTags: item.poster ? { Primary: 'poster' } : {},
    BackdropImageTags: item.backdrop ? ['backdrop'] : [],
    // Inline image URLs so TV apps can fetch posters directly
    ImageBlurHashes: {},
    // Provide direct poster URL
    ...(item.poster ? {
      PrimaryImageAspectRatio: 0.667,
    } : {}),
    // Stream URL hint for direct play
    MediaSources: item.filename ? [{
      Protocol: 'File',
      Id: item.id,
      Path: item.filename,
      Type: 'Default',
      Container: item.filename.split('.').pop() ?? 'mp4',
      Size: 0,
      Name: item.title,
      IsRemote: false,
      SupportsTranscoding: false,
      SupportsDirectStream: true,
      SupportsDirectPlay: true,
      IsInfiniteStream: false,
      Bitrate: 0,
      MediaStreams: [
        {
          Codec: 'h264',
          Type: 'Video',
          Index: 0,
          IsDefault: true,
          IsExternal: false,
        },
        {
          Codec: 'aac',
          Type: 'Audio',
          Index: 1,
          IsDefault: true,
          IsExternal: false,
          Language: 'eng',
          DisplayTitle: 'English',
        },
      ],
      DirectStreamUrl: `${baseUrl}/api/stream/${encodeURIComponent(item.filename)}`,
    }] : [],
  };
}

export default async function handler(req: Request, res: Response) {
  try {
    const library = readLibrary<LibraryItem>();
    const {
      IncludeItemTypes,
      ParentId,
      SortBy = 'SortName',
      SortOrder = 'Ascending',
      StartIndex = '0',
      Limit = '50',
      SearchTerm,
    } = req.query as Record<string, string>;

    // Determine base URL for stream links
    const proto = req.headers['x-forwarded-proto'] ?? req.protocol;
    const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:3000';
    const baseUrl = `${proto}://${host}`;

    let items = [...library];

    // Filter by type
    if (IncludeItemTypes) {
      const types = IncludeItemTypes.split(',').map(t => t.trim().toLowerCase());
      items = items.filter(item => {
        if (types.includes('movie')) return item.type === 'movie';
        if (types.includes('series')) return item.type === 'series';
        return true;
      });
    }

    // Filter by parent (series episodes)
    if (ParentId) {
      // For now return empty — episodes are handled via /Items/:id/Episodes
      items = items.filter(item => item.id === ParentId);
    }

    // Search
    if (SearchTerm) {
      const q = SearchTerm.toLowerCase();
      items = items.filter(item => item.title.toLowerCase().includes(q));
    }

    // Sort
    items.sort((a, b) => {
      let cmp = 0;
      if (SortBy === 'DateCreated') {
        cmp = (a.addedAt ?? '').localeCompare(b.addedAt ?? '');
      } else if (SortBy === 'CommunityRating') {
        cmp = (parseFloat(a.imdbRating ?? '0') || 0) - (parseFloat(b.imdbRating ?? '0') || 0);
      } else if (SortBy === 'PremiereDate') {
        cmp = (a.year ?? '').localeCompare(b.year ?? '');
      } else {
        // SortName (default)
        cmp = a.title.localeCompare(b.title);
      }
      return SortOrder === 'Descending' ? -cmp : cmp;
    });

    const start = parseInt(StartIndex) || 0;
    const limit = parseInt(Limit) || 50;
    const page = items.slice(start, start + limit);

    res.json({
      Items: page.map(item => toJellyfinItem(item, baseUrl)),
      TotalRecordCount: items.length,
      StartIndex: start,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list items', message: String(err) });
  }
}
