import { getGenreMustSee } from './src/server/tmdbCache.js';

async function run() {
  console.log('Testing getGenreMustSee...');
  try {
    const res = await getGenreMustSee(28);
    console.log(res);
  } catch (e) {
    console.error('Error:', e);
  }
}
run();
