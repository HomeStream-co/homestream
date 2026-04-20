/**
 * fetch-demo-posters.cjs
 *
 * Fetches real TMDB poster + backdrop images for every demo library item,
 * saves them to public/demo/, then patches demoLibrary.ts with the local paths.
 *
 * Run:  TMDB_API_KEY=<key> node scripts/fetch-demo-posters.cjs
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const TMDB_KEY = process.env.TMDB_API_KEY;
if (!TMDB_KEY) { console.error('Set TMDB_API_KEY env var'); process.exit(1); }

const OUT_DIR = path.join(__dirname, '../public/demo');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── TMDB IDs for each demo item ───────────────────────────────────────────────
// These are the real TMDB movie/tv IDs for the Blender CC films.
// Big Buck Bunny, Sintel, etc. are all on TMDB.
const ITEMS = [
  { id: 'demo-bbb',            tmdbId: 10378,  type: 'movie',  slug: 'bbb'              },
  { id: 'demo-sintel',         tmdbId: 45745,  type: 'movie',  slug: 'sintel'           },
  { id: 'demo-elephants-dream',tmdbId: 9761,   type: 'movie',  slug: 'elephants-dream'  },
  { id: 'demo-tears-of-steel', tmdbId: 116149, type: 'movie',  slug: 'tears-of-steel'   },
  { id: 'demo-cosmos',         tmdbId: 328111, type: 'movie',  slug: 'cosmos'           },
  { id: 'demo-sprite-fright',  tmdbId: 831462, type: 'movie',  slug: 'sprite-fright'    },
  { id: 'demo-coffee-run',     tmdbId: 718789, type: 'movie',  slug: 'coffee-run'       },
  { id: 'demo-hero',           tmdbId: 532639, type: 'movie',  slug: 'hero'             },
  { id: 'demo-caminandes',     tmdbId: 228970, type: 'movie',  slug: 'caminandes'       },
];

function get(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function tmdb(path) {
  const url = `https://api.themoviedb.org/3${path}?api_key=${TMDB_KEY}`;
  const { status, body } = await get(url);
  if (status !== 200) throw new Error(`TMDB ${status} for ${path}`);
  return JSON.parse(body.toString());
}

async function downloadImage(tmdbPath, destFile) {
  if (!tmdbPath) return false;
  const url = `https://image.tmdb.org/t/p/w500${tmdbPath}`;
  const { status, body, headers } = await get(url);
  if (status !== 200) return false;
  const ct = headers['content-type'] || '';
  if (!ct.includes('image')) return false;
  fs.writeFileSync(destFile, body);
  console.log(`  ✓ saved ${path.basename(destFile)} (${body.length} bytes)`);
  return true;
}

async function main() {
  const results = {}; // slug → { poster, backdrop }

  for (const item of ITEMS) {
    console.log(`\n[${item.slug}] Fetching TMDB ${item.type}/${item.tmdbId}...`);
    try {
      const data = await tmdb(`/${item.type}/${item.tmdbId}`);
      const posterPath   = data.poster_path;
      const backdropPath = data.backdrop_path;

      const posterFile   = path.join(OUT_DIR, `${item.slug}-poster.jpg`);
      const backdropFile = path.join(OUT_DIR, `${item.slug}-backdrop.jpg`);

      const gotPoster   = await downloadImage(posterPath,   posterFile);
      const gotBackdrop = await downloadImage(backdropPath, backdropFile);

      results[item.slug] = {
        poster:   gotPoster   ? `/demo/${item.slug}-poster.jpg`   : null,
        backdrop: gotBackdrop ? `/demo/${item.slug}-backdrop.jpg` : null,
      };
    } catch (err) {
      console.warn(`  ✗ ${item.slug}: ${err.message}`);
      results[item.slug] = { poster: null, backdrop: null };
    }
    // small delay to be polite to TMDB
    await new Promise(r => setTimeout(r, 250));
  }

  console.log('\n\n=== Results ===');
  for (const [slug, paths] of Object.entries(results)) {
    console.log(`${slug}: poster=${paths.poster}  backdrop=${paths.backdrop}`);
  }

  // Write a JSON manifest so the next step can patch demoLibrary.ts
  const manifestPath = path.join(__dirname, 'demo-poster-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(results, null, 2));
  console.log(`\nManifest saved to ${manifestPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
