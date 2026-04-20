/**
 * cache-tmdb-images.cjs
 *
 * 1. Fetches fresh TMDB trending/upcoming data (same queries as tmdbCache.ts)
 * 2. Downloads every poster + backdrop to public/tmdb-images/
 * 3. Rewrites posterUrl/backdropUrl to local /tmdb-images/<hash>.jpg paths
 * 4. Writes the baked cache to public/tmdb-cache-baked.json
 *    → tmdbCache.ts will load this as the seed if /private/tmdb-cache/main.json
 *      is missing or stale, so the Discover page always has images on first load.
 *
 * Run: node scripts/cache-tmdb-images.cjs
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const crypto = require('crypto');

const TMDB_KEY = process.env.TMDB_API_KEY;
if (!TMDB_KEY) { console.error('Set TMDB_API_KEY env var'); process.exit(1); }

const OUT_DIR   = path.join(__dirname, '../public/tmdb-images');
const BAKED_OUT = path.join(__dirname, '../public/tmdb-cache-baked.json');
fs.mkdirSync(OUT_DIR, { recursive: true });

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/w500';
const TMDB_ORIG = 'https://image.tmdb.org/t/p/w1280';

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function get(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': 'HomeStream/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), ct: res.headers['content-type'] || '' }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function tmdbGet(endpoint, params = {}) {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('api_key', TMDB_KEY);
  url.searchParams.set('language', 'en-US');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const { status, body } = await get(url.toString());
  if (status !== 200) throw new Error(`TMDB ${status} for ${endpoint}`);
  return JSON.parse(body.toString());
}

// ── Image downloader ──────────────────────────────────────────────────────────

const downloaded = new Map(); // tmdbPath → local filename

async function downloadImg(tmdbPath, size = 'w500') {
  if (!tmdbPath) return '';
  if (downloaded.has(tmdbPath + size)) return downloaded.get(tmdbPath + size);

  const baseUrl = size === 'w500' ? TMDB_IMG : TMDB_ORIG;
  const url = `${baseUrl}${tmdbPath}`;
  const hash = crypto.createHash('md5').update(tmdbPath + size).digest('hex').slice(0, 12);
  const filename = `${hash}.jpg`;
  const destPath = path.join(OUT_DIR, filename);
  const localUrl = `/tmdb-images/${filename}`;

  // Skip if already downloaded
  if (fs.existsSync(destPath)) {
    downloaded.set(tmdbPath + size, localUrl);
    process.stdout.write('.');
    return localUrl;
  }

  try {
    const { status, body, ct } = await get(url);
    if (status !== 200 || !ct.includes('image')) {
      downloaded.set(tmdbPath + size, '');
      return '';
    }
    fs.writeFileSync(destPath, body);
    downloaded.set(tmdbPath + size, localUrl);
    process.stdout.write('✓');
    return localUrl;
  } catch {
    downloaded.set(tmdbPath + size, '');
    return '';
  }
}

// ── TMDB data fetch (mirrors tmdbCache.ts logic) ──────────────────────────────

const GENRE_MAP = {
  28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',
  99:'Documentary',18:'Drama',10751:'Family',14:'Fantasy',36:'History',
  27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',
  878:'Sci-Fi',10770:'TV Movie',53:'Thriller',10752:'War',37:'Western',
};

function normalise(m) {
  return {
    id: m.id,
    title: m.title ?? m.name ?? '',
    overview: m.overview ?? '',
    poster_path: m.poster_path ?? null,
    backdrop_path: m.backdrop_path ?? null,
    release_date: m.release_date ?? m.first_air_date ?? '',
    vote_average: m.vote_average ?? 0,
    vote_count: m.vote_count ?? 0,
    genre_ids: m.genre_ids ?? [],
    genres: (m.genre_ids ?? []).map(id => GENRE_MAP[id]).filter(Boolean),
    popularity: m.popularity ?? 0,
    posterUrl: '',    // filled in after download
    backdropUrl: '',  // filled in after download
  };
}

async function fetchAndDownload() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay  = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10);

  console.log('Fetching TMDB data...');
  const [upcomingRaw, trendingRaw, trendingShowsRaw] = await Promise.all([
    tmdbGet('/discover/movie', {
      sort_by: 'popularity.desc',
      'primary_release_date.gte': firstDay,
      'primary_release_date.lte': lastDay,
      'vote_count.gte': '10',
    }),
    tmdbGet('/trending/movie/week'),
    tmdbGet('/trending/tv/week'),
  ]);

  const upcoming      = (upcomingRaw.results      ?? []).slice(0, 30).map(normalise);
  const trending      = (trendingRaw.results      ?? []).slice(0, 30).map(normalise);
  const trendingShows = (trendingShowsRaw.results ?? []).slice(0, 30).map(normalise);

  // Deduplicate all items so we don't download the same image twice
  const all = [...upcoming, ...trending, ...trendingShows];
  console.log(`\nDownloading images for ${all.length} items (posters + backdrops)...`);

  // Download in batches of 5 to avoid hammering the CDN
  async function batchDownload(items) {
    for (let i = 0; i < items.length; i += 5) {
      const batch = items.slice(i, i + 5);
      await Promise.all(batch.map(async m => {
        m.posterUrl   = await downloadImg(m.poster_path,   'w500');
        m.backdropUrl = await downloadImg(m.backdrop_path, 'w1280');
      }));
      await new Promise(r => setTimeout(r, 100)); // small delay
    }
  }

  await batchDownload(upcoming);
  await batchDownload(trending);
  await batchDownload(trendingShows);

  console.log('\n');
  return { fetchedAt: Date.now(), upcoming, trending, trendingShows };
}

async function main() {
  const data = await fetchAndDownload();

  const imgCount = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.jpg')).length;
  console.log(`Downloaded ${imgCount} images to public/tmdb-images/`);

  fs.writeFileSync(BAKED_OUT, JSON.stringify(data, null, 2));
  console.log(`Baked cache written to public/tmdb-cache-baked.json`);
  console.log(`  upcoming: ${data.upcoming.length}, trending: ${data.trending.length}, shows: ${data.trendingShows.length}`);

  // Verify a sample
  const sample = data.trending[0];
  console.log(`\nSample: "${sample.title}" → poster: ${sample.posterUrl}`);
}

main().catch(err => { console.error(err); process.exit(1); });
