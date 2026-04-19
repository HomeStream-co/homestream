import type { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSecret } from '#airo/secrets';

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
  watchProgress: number;
  rated?: string;
  runtime?: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  parts: [{ text: string }];
}

interface ChatRequest {
  message: string;
  library: MediaItem[];
  history?: ChatMessage[];
}

function buildLibrarySummary(library: MediaItem[]): string {
  if (library.length === 0) return 'The library is currently empty.';

  return library
    .map(m => {
      const rating = m.imdbRating !== 'N/A' ? `IMDb: ${m.imdbRating}/10` : 'Not rated';
      const progress = m.watchProgress > 0 ? ` [${Math.round(m.watchProgress)}% watched]` : '';
      return `- "${m.title}" (${m.year}) | ${m.type === 'series' ? 'TV Show' : 'Movie'} | Genres: ${m.genre.join(', ')} | ${rating}${progress} | Director: ${m.director} | Cast: ${m.actors} | Plot: ${m.plot}`;
    })
    .join('\n');
}

function buildSystemPrompt(library: MediaItem[]): string {
  const librarySummary = buildLibrarySummary(library);
  const totalMovies = library.filter(m => m.type === 'movie').length;
  const totalShows = library.filter(m => m.type === 'series').length;

  return `You are HomeStream's AI assistant — a warm, knowledgeable film-buff friend who helps the family decide what to watch. You have deep knowledge of cinema and TV, and you know this family's personal media library inside and out.

LIBRARY OVERVIEW:
- ${totalMovies} movies, ${totalShows} TV shows (${library.length} total titles)

FULL LIBRARY:
${librarySummary}

YOUR PERSONALITY:
- Enthusiastic and warm, like a friend who loves movies
- Concise but insightful — don't ramble
- Give genuine opinions and reasons, not just lists
- Use natural language, not bullet points unless listing recommendations
- Occasionally reference specific details (cast, director, plot) to show you really know the content

YOUR RULES:
1. ONLY recommend titles that exist in the library above — never suggest something not in the list
2. When recommending, always mention 1-2 specific reasons why (e.g., "great performances", "edge-of-your-seat pacing")
3. If the library is empty or has no matches, say so warmly and suggest they upload more content
4. Keep responses under 150 words unless the user asks for more detail
5. At the end of your response, output a JSON block (and nothing after it) listing the IDs of titles you're recommending, like this:
   SUGGESTIONS_JSON:["id1","id2","id3"]
   Only include this if you're actually recommending specific titles. Max 3 suggestions.
6. If someone asks about a movie NOT in the library, acknowledge it warmly but redirect to what you do have
7. Remember conversation context — if they said they already watched something, don't suggest it again`;
}

function extractSuggestions(text: string, library: MediaItem[]): { reply: string; suggestions: MediaItem[] } {
  const jsonMatch = text.match(/SUGGESTIONS_JSON:\[([^\]]*)\]/);
  let suggestions: MediaItem[] = [];
  let reply = text;

  if (jsonMatch) {
    try {
      const ids: string[] = JSON.parse(`[${jsonMatch[1]}]`);
      suggestions = ids
        .map(id => library.find(m => m.id === id))
        .filter((m): m is MediaItem => !!m);
    } catch {
      // ignore parse errors
    }
    // Remove the JSON block from the reply
    reply = text.replace(/\s*SUGGESTIONS_JSON:\[[^\]]*\]/, '').trim();
  }

  return { reply, suggestions };
}

// Fallback keyword-based response when Gemini is unavailable
function fallbackResponse(message: string, library: MediaItem[]): { reply: string; suggestions: MediaItem[] } {
  if (library.length === 0) {
    return {
      reply: "Your library is empty! Head to the Library page to upload some movies and I'll give you personalized recommendations.",
      suggestions: [],
    };
  }

  const lower = message.toLowerCase();
  const MOOD_MAP: Record<string, string[]> = {
    scary: ['Horror', 'Thriller'], horror: ['Horror'], funny: ['Comedy'], comedy: ['Comedy'],
    family: ['Family', 'Animation'], kids: ['Family', 'Animation'], action: ['Action', 'Adventure'],
    romantic: ['Romance'], romance: ['Romance'], drama: ['Drama'], 'sci-fi': ['Sci-Fi'],
    scifi: ['Sci-Fi'], documentary: ['Documentary'], thriller: ['Thriller', 'Mystery'],
  };

  const matchedGenres = new Set<string>();
  for (const [kw, genres] of Object.entries(MOOD_MAP)) {
    if (lower.includes(kw)) genres.forEach(g => matchedGenres.add(g));
  }

  const matches = matchedGenres.size > 0
    ? library.filter(m => m.genre.some(g => matchedGenres.has(g)))
        .sort((a, b) => (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0))
        .slice(0, 3)
    : [...library].sort((a, b) => (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0)).slice(0, 3);

  if (matches.length === 0) {
    return { reply: "I couldn't find a great match for that. Try a different mood or genre!", suggestions: [] };
  }

  const titles = matches.map(m => `"${m.title}"`).join(', ');
  return {
    reply: `Based on your library, I'd suggest ${titles}. Let me know if you want more details on any of these!`,
    suggestions: matches,
  };
}

export default async function handler(req: Request, res: Response) {
  try {
    const { message, library, history = [] } = req.body as ChatRequest;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const lib = library || [];
    const apiKey = getSecret('GOOGLE_AI_API_KEY');

    if (!apiKey) {
      const fallback = fallbackResponse(message, lib);
      return res.json(fallback);
    }

    const genAI = new GoogleGenerativeAI(String(apiKey));
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: buildSystemPrompt(lib),
    });

    // Build chat history (keep last 10 turns to stay within token limits)
    const recentHistory = history.slice(-10);

    const chat = model.startChat({
      history: recentHistory,
      generationConfig: {
        maxOutputTokens: 512,
        temperature: 0.8,
      },
    });

    const result = await chat.sendMessage(message.trim());
    const rawText = result.response.text();

    const { reply, suggestions } = extractSuggestions(rawText, lib);

    return res.json({ reply, suggestions });
  } catch (error) {
    console.error('Gemini chat error:', error);
    // Graceful fallback if Gemini fails
    const { library, message } = req.body as ChatRequest;
    const fallback = fallbackResponse(message || '', library || []);
    return res.json(fallback);
  }
}
