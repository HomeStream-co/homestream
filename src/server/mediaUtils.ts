import { readConfig } from './configStore.js';

export interface OMDBResult {
  Title?: string;
  Year?: string;
  Genre?: string;
  Plot?: string;
  Poster?: string;
  imdbID?: string;
  imdbRating?: string;
  Director?: string;
  Actors?: string;
  Runtime?: string;
  Rated?: string;
  Response?: string;
}

export async function fetchOMDB(title: string, year?: string): Promise<OMDBResult | null> {
  const cfg = readConfig();
  const apiKey = cfg.omdbApiKey as string | undefined;
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({ t: title, apikey: apiKey });
    if (year) params.set('y', year);
    const res = await fetch(`https://www.omdbapi.com/?${params}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as OMDBResult;
    if (data.Response === 'False') return null;
    return data;
  } catch {
    return null;
  }
}

export async function retryMissingMetadata(): Promise<void> {
  // Stub: scans library for items with needsMetadata: true and retries OMDB fetch.
  console.log('[mediaUtils] retryMissingMetadata: no-op stub');
}

