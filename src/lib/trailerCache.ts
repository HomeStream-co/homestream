/**
 * Shared trailer key cache + fetcher.
 *
 * Used by:
 *   - TrailerButton.tsx  (library MediaCard context menu, movie/show detail pages)
 *   - discover.tsx       (TMDB MovieCard trailer modal)
 *
 * Keeps a single in-memory Map so the same title is never fetched twice
 * across different parts of the app in the same session.
 */

const cache = new Map<string, string | null>();

/**
 * Fetch a YouTube trailer key for a given title/year/type.
 * Results are cached by `${title}::${year}::${type}` key.
 */
export async function fetchTrailerKey(
  title: string,
  year?: string,
  type: 'movie' | 'series' = 'movie',
): Promise<string | null> {
  const cacheKey = `${title}::${year ?? ''}::${type}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  try {
    const params = new URLSearchParams({ title, type });
    if (year) params.set('year', year);
    const res = await fetch(`/api/tmdb/trailer?${params}`);
    const data = await res.json() as { trailerKey?: string | null };
    const key = data.trailerKey ?? null;
    cache.set(cacheKey, key);
    return key;
  } catch {
    cache.set(cacheKey, null);
    return null;
  }
}
