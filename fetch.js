fetch('http://localhost:3000/api/tmdb/genres?genreId=28&mediaType=movie').then(r=>r.json()).then(console.log).catch(console.error);
