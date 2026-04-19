/**
 * DEPRECATED — this hook is no longer used.
 *
 * The app uses TMDBProvider + useTMDBContext (src/context/TMDBContextCore.ts)
 * for all TMDB data access. That approach shares a single fetch across the
 * entire component tree instead of re-fetching per component.
 *
 * This file is kept as a tombstone to prevent accidental re-introduction.
 * Do not import from here — import from '@/context/TMDBContextCore' instead.
 */
export { useTMDBContext as useTMDB } from '@/context/TMDBContextCore';
