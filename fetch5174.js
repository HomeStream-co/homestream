fetch('http://localhost:5174/api/tmdb/genres?genreId=28&mediaType=movie').then(r=>r.json()).then(console.log).catch(console.error);
