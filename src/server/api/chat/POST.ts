import type { Request, Response } from 'express';

interface MediaItem {
  id: string;
  title: string;
  genre: string[];
  plot: string;
  imdbRating: string;
  type: string;
  year: string;
  director: string;
  actors: string;
  poster: string;
  filepath: string;
  watchProgress: number;
}

interface ChatRequest {
  message: string;
  library: MediaItem[];
}

// Keyword → genre/mood mappings
const MOOD_MAP: Record<string, string[]> = {
  action: ['Action', 'Adventure', 'Thriller'],
  funny: ['Comedy'],
  comedy: ['Comedy'],
  laugh: ['Comedy'],
  humor: ['Comedy'],
  scary: ['Horror', 'Thriller'],
  horror: ['Horror'],
  spooky: ['Horror'],
  romantic: ['Romance'],
  romance: ['Romance'],
  love: ['Romance'],
  family: ['Family', 'Animation', 'Comedy'],
  kids: ['Family', 'Animation'],
  animated: ['Animation'],
  cartoon: ['Animation'],
  thriller: ['Thriller', 'Mystery', 'Crime'],
  mystery: ['Mystery', 'Crime', 'Thriller'],
  crime: ['Crime', 'Thriller'],
  drama: ['Drama'],
  scifi: ['Sci-Fi', 'Science Fiction'],
  'sci-fi': ['Sci-Fi', 'Science Fiction'],
  science: ['Sci-Fi', 'Science Fiction'],
  fantasy: ['Fantasy', 'Adventure'],
  adventure: ['Adventure', 'Action'],
  documentary: ['Documentary'],
  classic: ['Drama', 'Romance'],
  war: ['War', 'History'],
  sport: ['Sport'],
  music: ['Music', 'Musical'],
  western: ['Western'],
  short: [],
  long: [],
  new: [],
  classic2: [],
};

const RESPONSE_TEMPLATES = {
  match: (items: MediaItem[]) => {
    const picks = items.slice(0, 3);
    const list = picks.map(m => `**${m.title}** (${m.year}) — ${m.imdbRating !== 'N/A' ? `⭐ ${m.imdbRating}/10 — ` : ''}${m.plot.slice(0, 80)}...`).join('\n\n');
    return `Great choice! Here's what I'd recommend from your library:\n\n${list}\n\nAny of these sound good to you?`;
  },
  noMatch: (message: string) => {
    return `I searched your library for "${message}" but didn't find a perfect match. Try uploading more movies in that genre, or ask me something else — I'm happy to suggest from what you have!`;
  },
  empty: () => {
    return `Your library is empty right now! Head over to the Library page to upload some movies or shows, and I'll be able to give you personalized recommendations.`;
  },
  greeting: () => {
    return `Hey there! I'm your HomeStream assistant — a film-buff friend who knows your entire library. Ask me things like:\n\n• "What should I watch tonight?"\n• "I'm in the mood for something scary"\n• "Recommend a family movie"\n• "Something with great action"\n\nWhat are you feeling?`;
  },
  topRated: (items: MediaItem[]) => {
    const top = [...items].filter(m => m.imdbRating !== 'N/A').sort((a, b) => parseFloat(b.imdbRating) - parseFloat(a.imdbRating)).slice(0, 3);
    if (!top.length) return `I don't have enough rated content to suggest top picks yet. Upload more movies!`;
    const list = top.map(m => `**${m.title}** (${m.year}) — ⭐ ${m.imdbRating}/10`).join('\n');
    return `Here are the highest-rated titles in your library:\n\n${list}\n\nAll excellent picks!`;
  },
  random: (items: MediaItem[]) => {
    const pick = items[Math.floor(Math.random() * items.length)];
    return `How about **${pick.title}** (${pick.year})? ${pick.imdbRating !== 'N/A' ? `It's rated ⭐ ${pick.imdbRating}/10 and ` : ''}${pick.plot.slice(0, 100)}... Sounds good?`;
  },
  similar: (title: string, items: MediaItem[], target?: MediaItem) => {
    if (!target) return `I couldn't find "${title}" in your library. Make sure it's uploaded first!`;
    const similar = items.filter(m => m.id !== target.id && m.genre.some(g => target.genre.includes(g))).slice(0, 3);
    if (!similar.length) return `I found **${target.title}** but don't have similar titles yet. Upload more movies in the ${target.genre[0]} genre!`;
    const list = similar.map(m => `**${m.title}** (${m.year})`).join(', ');
    return `If you liked **${target.title}**, you might also enjoy: ${list}. They share similar ${target.genre[0]} vibes!`;
  },
};

function detectIntent(message: string): string {
  const lower = message.toLowerCase();
  if (/hello|hi|hey|what can you|help/i.test(lower)) return 'greeting';
  if (/top rated|best|highest rated|greatest/i.test(lower)) return 'topRated';
  if (/random|surprise|anything|don't care|whatever/i.test(lower)) return 'random';
  if (/like|similar to|same as|reminds me of/i.test(lower)) return 'similar';
  return 'mood';
}

function findSimilarTitle(message: string, library: MediaItem[]): MediaItem | undefined {
  const lower = message.toLowerCase();
  return library.find(m => lower.includes(m.title.toLowerCase()));
}

function matchByMood(message: string, library: MediaItem[]): MediaItem[] {
  const lower = message.toLowerCase();
  const matchedGenres = new Set<string>();

  for (const [keyword, genres] of Object.entries(MOOD_MAP)) {
    if (lower.includes(keyword)) {
      genres.forEach(g => matchedGenres.add(g));
    }
  }

  if (matchedGenres.size === 0) {
    // Try direct word match against genres in library
    const words = lower.split(/\s+/);
    library.forEach(item => {
      item.genre.forEach(g => {
        if (words.some(w => g.toLowerCase().includes(w))) {
          matchedGenres.add(g);
        }
      });
    });
  }

  if (matchedGenres.size === 0) return [];

  return library.filter(item =>
    item.genre.some(g => matchedGenres.has(g))
  ).sort((a, b) => {
    const ra = parseFloat(a.imdbRating) || 0;
    const rb = parseFloat(b.imdbRating) || 0;
    return rb - ra;
  });
}

export default async function handler(req: Request, res: Response) {
  try {
    const { message, library } = req.body as ChatRequest;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const lib = library || [];

    if (lib.length === 0) {
      return res.json({ reply: RESPONSE_TEMPLATES.empty(), suggestions: [] });
    }

    const intent = detectIntent(message);

    if (intent === 'greeting') {
      return res.json({ reply: RESPONSE_TEMPLATES.greeting(), suggestions: [] });
    }

    if (intent === 'topRated') {
      const top = [...lib].filter(m => m.imdbRating !== 'N/A').sort((a, b) => parseFloat(b.imdbRating) - parseFloat(a.imdbRating)).slice(0, 3);
      return res.json({ reply: RESPONSE_TEMPLATES.topRated(lib), suggestions: top });
    }

    if (intent === 'random') {
      const pick = lib[Math.floor(Math.random() * lib.length)];
      return res.json({ reply: RESPONSE_TEMPLATES.random(lib), suggestions: [pick] });
    }

    if (intent === 'similar') {
      const target = findSimilarTitle(message, lib);
      const similar = target ? lib.filter(m => m.id !== target.id && m.genre.some(g => target.genre.includes(g))).slice(0, 3) : [];
      return res.json({
        reply: RESPONSE_TEMPLATES.similar(message, lib, target),
        suggestions: similar,
      });
    }

    // Mood-based matching
    const matches = matchByMood(message, lib);
    if (matches.length > 0) {
      return res.json({ reply: RESPONSE_TEMPLATES.match(matches), suggestions: matches.slice(0, 3) });
    }

    return res.json({ reply: RESPONSE_TEMPLATES.noMatch(message), suggestions: [] });
  } catch (error) {
    res.status(500).json({ error: 'Chat failed', message: String(error) });
  }
}
