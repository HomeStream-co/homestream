/**
 * tmdbCache — shared TMDB types used by both server routes and frontend components.
 */

export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  posterUrl: string;
  backdropUrl?: string;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  popularity: number;
  /** IMDB ID — populated when available from TMDB external IDs */
  imdb_id?: string;
}
