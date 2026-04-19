/**
 * Route path types — kept in a separate file so routes.tsx can be
 * a pure-component file and satisfy Vite Fast Refresh.
 */
export type Path =
  | '/'
  | '/movie/:id'
  | '/show/:id'
  | '/library'
  | '/watchlist'
  | '/player/:id'
  | '/profiles'
  | '/discover'
  | '/downloads'
  | '/history';

export type Params = Record<string, string | undefined>;
