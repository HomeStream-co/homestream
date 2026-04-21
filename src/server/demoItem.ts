/**
 * demoItem — single source of truth for the Big Buck Bunny demo entry.
 *
 * Previously defined in both configure.js and api/media/GET.ts with slight
 * differences (addedAt, requiresInternet, rated). Both now import from here.
 */

export const DEMO_ITEM = {
  id: 'demo-bbb',
  title: 'Big Buck Bunny',
  type: 'movie',
  year: '2008',
  filename: '__demo__big-buck-bunny.mp4',
  filePath: '__demo__',
  demoStreamUrl: 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
  poster: '/demo/bbb-poster.jpg',
  backdrop: '/demo/bbb-backdrop.jpg',
  plot: 'A large and lovable rabbit deals with three bullying rodents who want to steal his berries. Freely licensed under Creative Commons by the Blender Foundation.',
  rating: 'G',
  rated: 'G',
  imdbRating: '7.8',
  genre: ['Animation', 'Short', 'Comedy'],
  runtime: '9 min',
  director: 'Sacha Goedegebure',
  actors: ['Big Buck Bunny'],
  transcoding: false,
  watchProgress: 0,
  profileProgress: { adult: 0, kids: 0 },
  isDemo: true,
  requiresInternet: true,
  importedFrom: 'demo',
  // Fixed date — prevents demo item from appearing in "Recently Added" on every restart
  addedAt: '2024-01-01T00:00:00.000Z',
} as const;
