/**
 * trailerCache
 * Fetches a YouTube trailer key for a given title via /api/trailer.
 * Results are cached in memory for the session lifetime.
 */

const cache = new Map<string, string | null>();

export async function fetchTrailerKey(
  title: string,
  year?: string,
  type: 'movie' | 'tv' = 'movie',
): Promise<string | null> {
  const key = `${title}::${year ?? ''}::${type}`;
  if (cache.has(key)) return cache.get(key)!;

  try {
    const params = new URLSearchParams({ title, type });
    if (year) params.set('year', year);
    const res = await fetch(`/api/trailer?${params.toString()}`, { credentials: 'include' });
    if (!res.ok) { cache.set(key, null); return null; }
    const data = await res.json() as { key?: string };
    const result = data.key ?? null;
    cache.set(key, result);
    return result;
  } catch {
    cache.set(key, null);
    return null;
  }
}
