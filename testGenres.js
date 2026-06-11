async function run() {
  console.log('Testing Genres API...');
  try {
    const res = await fetch('http://localhost:3000/api/tmdb/genres?genreId=28&mediaType=movie');
    console.log(res.status);
    console.log(await res.text());
  } catch (e) {
    console.log(e);
  }
}
run();
