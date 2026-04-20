/**
 * demoLibrary — full demo media library for the HomeStream cloud demo.
 *
 * All content is freely licensed under Creative Commons (CC BY) by the
 * Blender Foundation. Stream URLs point to official Blender/archive.org CDNs.
 *
 * Items use the __demo__ filename prefix so the stream endpoint proxies them
 * through to the CDN rather than looking for a local file.
 */

export interface DemoItem {
  id: string;
  title: string;
  type: 'movie' | 'series';
  year: string;
  filename: string;
  filePath: string;
  demoStreamUrl: string;
  poster: string;
  backdrop: string;
  plot: string;
  rating: string;
  rated: string;
  imdbRating: string;
  genre: string[];
  runtime: string;
  director: string;
  actors: string[];
  transcoding: boolean;
  watchProgress: number;
  profileProgress: Record<string, number>;
  isDemo: boolean;
  requiresInternet: boolean;
  importedFrom: string;
  addedAt: string;
  // TV show fields
  totalSeasons?: number;
  episodes?: DemoEpisode[];
}

export interface DemoEpisode {
  id: string;
  season: number;
  episode: number;
  title: string;
  plot: string;
  runtime: string;
  filename: string;
  demoStreamUrl: string;
  watchProgress: number;
}

// ── Movies ────────────────────────────────────────────────────────────────────

export const DEMO_MOVIES: DemoItem[] = [
  {
    id: 'demo-bbb',
    title: 'Big Buck Bunny',
    type: 'movie',
    year: '2008',
    filename: '__demo__big-buck-bunny.mp4',
    filePath: '__demo__',
    demoStreamUrl: 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
    poster: '/demo/bbb-poster.jpg',
    backdrop: '/demo/bbb-backdrop.jpg',
    plot: 'A large and lovable rabbit deals with three bullying rodents who want to steal his berries. A short animated film by the Blender Foundation — freely licensed under Creative Commons.',
    rating: 'G',
    rated: 'G',
    imdbRating: '7.8',
    genre: ['Animation', 'Comedy', 'Family'],
    runtime: '9 min',
    director: 'Sacha Goedegebure',
    actors: ['Big Buck Bunny'],
    transcoding: false,
    watchProgress: 0,
    profileProgress: {},
    isDemo: true,
    requiresInternet: true,
    importedFrom: 'demo',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-sintel',
    title: 'Sintel',
    type: 'movie',
    year: '2010',
    filename: '__demo__sintel.mp4',
    filePath: '__demo__',
    demoStreamUrl: 'https://download.blender.org/durian/movies/Sintel.2010.1080p.mkv',
    poster: '/demo/sintel-poster.jpg',
    backdrop: '/demo/sintel-backdrop.jpg',
    plot: 'A lonely young woman, Sintel, helps and befriends a dragon, whom she calls Scales. But when he is kidnapped by a larger dragon, Sintel decides to embark on a dangerous quest to find her lost friend.',
    rating: 'PG',
    rated: 'PG',
    imdbRating: '7.9',
    genre: ['Animation', 'Fantasy', 'Adventure'],
    runtime: '15 min',
    director: 'Colin Levy',
    actors: ['Halina Reijn', 'Thom Hoffman'],
    transcoding: false,
    watchProgress: 0,
    profileProgress: {},
    isDemo: true,
    requiresInternet: true,
    importedFrom: 'demo',
    addedAt: '2024-01-02T00:00:00.000Z',
  },
  {
    id: 'demo-elephants-dream',
    title: 'Elephants Dream',
    type: 'movie',
    year: '2006',
    filename: '__demo__elephants-dream.mp4',
    filePath: '__demo__',
    demoStreamUrl: 'https://download.blender.org/ED/ed_1080.avi',
    poster: '/demo/elephants-dream-poster.jpg',
    backdrop: '/demo/elephants-dream-backdrop.jpg',
    plot: 'The story of two strange characters exploring a capricious and seemingly infinite machine. The first Blender Open Movie — a surreal journey through a mechanical dreamscape.',
    rating: 'PG',
    rated: 'PG',
    imdbRating: '6.7',
    genre: ['Animation', 'Sci-Fi', 'Short'],
    runtime: '11 min',
    director: 'Bassam Kurdali',
    actors: ['Cas Jansen', 'Tygo Gernandt'],
    transcoding: false,
    watchProgress: 0,
    profileProgress: {},
    isDemo: true,
    requiresInternet: true,
    importedFrom: 'demo',
    addedAt: '2024-01-03T00:00:00.000Z',
  },
  {
    id: 'demo-tears-of-steel',
    title: 'Tears of Steel',
    type: 'movie',
    year: '2012',
    filename: '__demo__tears-of-steel.mp4',
    filePath: '__demo__',
    demoStreamUrl: 'https://download.blender.org/tearsofsteel/tearsofsteel-1080p.mov',
    poster: '/demo/tears-of-steel-poster.jpg',
    backdrop: '/demo/tears-of-steel-backdrop.jpg',
    plot: 'In a post-apocalyptic Amsterdam, a group of warriors and scientists make a last stand to defeat a robot army. A live-action/CGI hybrid short film by the Blender Foundation.',
    rating: 'PG-13',
    rated: 'PG-13',
    imdbRating: '6.8',
    genre: ['Sci-Fi', 'Action', 'Short'],
    runtime: '12 min',
    director: 'Ian Hubert',
    actors: ['Derek de Lint', 'Sergio Hasselbaink', 'Denise Rebergen'],
    transcoding: false,
    watchProgress: 0,
    profileProgress: {},
    isDemo: true,
    requiresInternet: true,
    importedFrom: 'demo',
    addedAt: '2024-01-04T00:00:00.000Z',
  },
  {
    id: 'demo-cosmos',
    title: 'Cosmos Laundromat',
    type: 'movie',
    year: '2015',
    filename: '__demo__cosmos-laundromat.mp4',
    filePath: '__demo__',
    demoStreamUrl: 'https://download.blender.org/demo/movies/cosmos_laundromat_1080p.mp4',
    poster: '/demo/cosmos-poster.jpg',
    backdrop: '/demo/cosmos-backdrop.jpg',
    plot: 'On a desolate island, a suicidal sheep named Franck meets a mysterious man who offers him the gift of a lifetime. A visually stunning fantasy short by the Blender Foundation.',
    rating: 'PG',
    rated: 'PG',
    imdbRating: '7.2',
    genre: ['Animation', 'Fantasy', 'Drama'],
    runtime: '12 min',
    director: 'Mathieu Auvray',
    actors: ['Pierre Bokma', 'Reinout Scholten van Aschat'],
    transcoding: false,
    watchProgress: 0,
    profileProgress: {},
    isDemo: true,
    requiresInternet: true,
    importedFrom: 'demo',
    addedAt: '2024-01-05T00:00:00.000Z',
  },
  {
    id: 'demo-sprite-fright',
    title: 'Sprite Fright',
    type: 'movie',
    year: '2021',
    filename: '__demo__sprite-fright.mp4',
    filePath: '__demo__',
    demoStreamUrl: 'https://download.blender.org/demo/movies/sprite_fright_1080p.mp4',
    poster: '/demo/sprite-fright-poster.jpg',
    backdrop: '/demo/sprite-fright-backdrop.jpg',
    plot: 'A group of rowdy teenagers venture into an ancient forest and get more than they bargained for when they stumble upon a colony of magical and mischievous creatures.',
    rating: 'PG-13',
    rated: 'PG-13',
    imdbRating: '7.1',
    genre: ['Animation', 'Horror', 'Comedy'],
    runtime: '9 min',
    director: 'Matthew Luhn',
    actors: ['Sprite', 'Fright'],
    transcoding: false,
    watchProgress: 0,
    profileProgress: {},
    isDemo: true,
    requiresInternet: true,
    importedFrom: 'demo',
    addedAt: '2024-01-06T00:00:00.000Z',
  },
  {
    id: 'demo-coffee-run',
    title: 'Coffee Run',
    type: 'movie',
    year: '2020',
    filename: '__demo__coffee-run.mp4',
    filePath: '__demo__',
    demoStreamUrl: 'https://download.blender.org/demo/movies/coffee_run_1080p.mp4',
    poster: '/demo/coffee-run-poster.jpg',
    backdrop: '/demo/coffee-run-backdrop.jpg',
    plot: 'A woman runs through a city to get her morning coffee, but the world around her keeps changing in unexpected ways. A charming short film showcasing Blender\'s real-time rendering.',
    rating: 'G',
    rated: 'G',
    imdbRating: '6.9',
    genre: ['Animation', 'Comedy', 'Short'],
    runtime: '2 min',
    director: 'Hjalti Hjálmarsson',
    actors: ['Coffee', 'Run'],
    transcoding: false,
    watchProgress: 0,
    profileProgress: {},
    isDemo: true,
    requiresInternet: true,
    importedFrom: 'demo',
    addedAt: '2024-01-07T00:00:00.000Z',
  },
  {
    id: 'demo-hero',
    title: 'Hero',
    type: 'movie',
    year: '2018',
    filename: '__demo__hero.mp4',
    filePath: '__demo__',
    demoStreamUrl: 'https://download.blender.org/demo/movies/hero_1080p.mp4',
    poster: '/demo/hero-poster.jpg',
    backdrop: '/demo/hero-backdrop.jpg',
    plot: 'A lone warrior faces an impossible choice between duty and compassion in a world on the brink of destruction. A stunning action short by the Blender Animation Studio.',
    rating: 'PG',
    rated: 'PG',
    imdbRating: '7.0',
    genre: ['Animation', 'Action', 'Drama'],
    runtime: '4 min',
    director: 'Nathan Vegdahl',
    actors: ['Hero'],
    transcoding: false,
    watchProgress: 0,
    profileProgress: {},
    isDemo: true,
    requiresInternet: true,
    importedFrom: 'demo',
    addedAt: '2024-01-08T00:00:00.000Z',
  },
];

// ── TV Show: Caminandes (3 episodes) ─────────────────────────────────────────

export const DEMO_TV_SHOWS: DemoItem[] = [
  {
    id: 'demo-caminandes',
    title: 'Caminandes',
    type: 'series',
    year: '2012',
    filename: '__demo__caminandes-ep1.mp4',
    filePath: '__demo__',
    demoStreamUrl: 'https://download.blender.org/demo/movies/caminandes_1_llama_drama_1080p.mp4',
    poster: '/demo/caminandes-poster.jpg',
    backdrop: '/demo/caminandes-backdrop.jpg',
    plot: 'Follow Koro, a llama who just wants to cross the Patagonian steppe, but is constantly thwarted by the local wildlife. A delightful animated comedy series from the Blender Foundation.',
    rating: 'G',
    rated: 'G',
    imdbRating: '7.5',
    genre: ['Animation', 'Comedy', 'Family'],
    runtime: '3 min',
    director: 'Pablo Vazquez',
    actors: ['Koro the Llama'],
    transcoding: false,
    watchProgress: 0,
    profileProgress: {},
    isDemo: true,
    requiresInternet: true,
    importedFrom: 'demo',
    addedAt: '2024-01-09T00:00:00.000Z',
    totalSeasons: 1,
    episodes: [
      {
        id: 'demo-caminandes-s1e1',
        season: 1,
        episode: 1,
        title: 'Llama Drama',
        plot: 'Koro the llama tries to cross the road but a tiny bird keeps getting in the way.',
        runtime: '2 min',
        filename: '__demo__caminandes-ep1.mp4',
        demoStreamUrl: 'https://download.blender.org/demo/movies/caminandes_1_llama_drama_1080p.mp4',
        watchProgress: 0,
      },
      {
        id: 'demo-caminandes-s1e2',
        season: 1,
        episode: 2,
        title: 'Gran Dillama',
        plot: 'Koro discovers a delicious cactus fruit, but getting to it proves more difficult than expected.',
        runtime: '3 min',
        filename: '__demo__caminandes-ep2.mp4',
        demoStreamUrl: 'https://download.blender.org/demo/movies/caminandes_2_gran_dillama_1080p.mp4',
        watchProgress: 0,
      },
      {
        id: 'demo-caminandes-s1e3',
        season: 1,
        episode: 3,
        title: 'Llamigos',
        plot: 'Koro faces his greatest challenge yet — a frozen lake, a penguin, and a very slippery situation.',
        runtime: '3 min',
        filename: '__demo__caminandes-ep3.mp4',
        demoStreamUrl: 'https://download.blender.org/demo/movies/caminandes_3_llamigos_1080p.mp4',
        watchProgress: 0,
      },
    ],
  },
];

// ── Combined export ───────────────────────────────────────────────────────────

export const ALL_DEMO_ITEMS = [...DEMO_MOVIES, ...DEMO_TV_SHOWS];

/** All demo item IDs — used to check if an item is a demo */
export const DEMO_IDS = new Set(ALL_DEMO_ITEMS.map(d => d.id));

/** CDN URL map for the stream proxy — keyed by filename */
export const DEMO_CDN_URLS: Record<string, string> = {};
for (const item of ALL_DEMO_ITEMS) {
  DEMO_CDN_URLS[item.filename] = item.demoStreamUrl;
  // Also register episode filenames
  if (item.episodes) {
    for (const ep of item.episodes) {
      DEMO_CDN_URLS[ep.filename] = ep.demoStreamUrl;
    }
  }
}
