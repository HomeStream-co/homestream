/**
 * POST /api/enrich/:id
 *
 * Runs the AI enrichment wizard on a media item.
 * Uses Gemini to deeply categorize the title beyond what OMDB provides:
 *   - Mood, pacing, themes, audience age
 *   - Searchable tags for smarter recommendations
 *   - Content warnings for parental filtering
 *   - A punchy AI summary and "why watch" hook
 *   - Similar titles for the "More Like This" engine
 *
 * Called automatically after upload, but can also be triggered manually.
 * Streams progress via SSE so the UI wizard can show live step-by-step status.
 */
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSecret } from '#airo/secrets';

const LIBRARY_PATH = path.resolve('./media-library.json');

interface MediaItem {
  id: string;
  title: string;
  year: string;
  genre: string[];
  plot: string;
  director: string;
  actors: string;
  imdbRating: string;
  type: string;
  runtime?: string;
  rated?: string;
  enrichment?: object;
  enriching?: boolean;
}

function readLibrary(): MediaItem[] {
  if (!fs.existsSync(LIBRARY_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8')); }
  catch { return []; }
}

function writeLibrary(data: unknown[]) {
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(data, null, 2));
}

function updateItem(id: string, updates: Partial<MediaItem>) {
  const lib = readLibrary();
  const idx = lib.findIndex(m => m.id === id);
  if (idx !== -1) {
    lib[idx] = { ...lib[idx], ...updates };
    writeLibrary(lib);
  }
}

function buildEnrichmentPrompt(item: MediaItem): string {
  return `You are a film and TV expert cataloguer. Analyze this title and return ONLY a valid JSON object — no markdown, no explanation, just raw JSON.

Title: "${item.title}" (${item.year})
Type: ${item.type === 'series' ? 'TV Series' : 'Movie'}
Genre: ${item.genre.join(', ')}
Director: ${item.director}
Cast: ${item.actors}
IMDb Rating: ${item.imdbRating}
Runtime: ${item.runtime || 'Unknown'}
Rating: ${item.rated || 'Unknown'}
Plot: ${item.plot}

Return this exact JSON structure:
{
  "tags": ["array", "of", "5-12", "specific", "descriptive", "tags", "like", "heist", "time-travel", "unreliable-narrator", "based-on-true-story"],
  "mood": ["array", "of", "2-4", "mood", "words", "like", "tense", "funny", "heartwarming", "dark", "uplifting", "suspenseful"],
  "themes": ["array", "of", "2-5", "themes", "like", "redemption", "family", "identity", "survival", "love"],
  "pacing": "one of: slow | moderate | fast | varied",
  "audienceAge": "one of: kids | family | teens | adults | mature",
  "contentWarnings": ["array", "of", "any", "applicable", "like", "violence", "strong language", "sexual content", "drug use", "or empty array if none"],
  "aiSummary": "Exactly 2 sentences. First sentence: what it is. Second sentence: what makes it special or worth watching.",
  "whyWatch": "One punchy sentence — the single best reason to watch this right now.",
  "similarTitles": ["5-8", "well-known", "similar", "titles", "by", "name", "only", "no", "year", "needed"]
}

Be specific and accurate. Tags should be highly searchable keywords a viewer would use to find this type of content.`;
}

export default async function handler(req: Request, res: Response) {
  const { id } = req.params;

  const lib = readLibrary();
  const item = lib.find(m => m.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Media item not found' });
  }

  // Set up SSE so the UI wizard can show live step progress
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (step: string, status: 'running' | 'done' | 'error', detail?: string) => {
    res.write(`data: ${JSON.stringify({ step, status, detail })}\n\n`);
  };

  try {
    // Mark as enriching in library
    updateItem(id, { enriching: true });
    send('init', 'done', `Analyzing "${item.title}"…`);

    // ── Step 1: Validate we have enough metadata ──
    send('metadata', 'running', 'Checking metadata completeness…');
    const hasGoodMetadata = item.plot && item.plot !== 'No description available.' && item.director !== 'Unknown';
    await new Promise(r => setTimeout(r, 200)); // small delay for UI drama
    send('metadata', 'done', hasGoodMetadata ? 'Rich metadata found' : 'Working with available metadata');

    // ── Step 2: Gemini AI analysis ──
    send('ai', 'running', 'Running AI deep analysis…');

    const apiKey = getSecret('GOOGLE_AI_API_KEY') as string;
    if (!apiKey) {
      send('ai', 'error', 'GOOGLE_AI_API_KEY not configured');
      updateItem(id, { enriching: false });
      return res.end();
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = buildEnrichmentPrompt(item);
    const result = await model.generateContent(prompt);
    const rawText = result.response.text().trim();

    send('ai', 'done', 'AI analysis complete');

    // ── Step 3: Parse and validate the JSON response ──
    send('parse', 'running', 'Parsing categorization data…');

    let enrichment: Record<string, unknown>;
    try {
      // Strip any accidental markdown code fences
      const cleaned = rawText.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
      enrichment = JSON.parse(cleaned);
    } catch {
      send('parse', 'error', 'Failed to parse AI response — will retry on next upload');
      updateItem(id, { enriching: false });
      return res.end();
    }

    // Validate required fields and apply defaults
    const validated = {
      tags:              Array.isArray(enrichment.tags) ? enrichment.tags as string[] : [],
      mood:              Array.isArray(enrichment.mood) ? enrichment.mood as string[] : [],
      themes:            Array.isArray(enrichment.themes) ? enrichment.themes as string[] : [],
      pacing:            ['slow','moderate','fast','varied'].includes(enrichment.pacing as string)
                           ? enrichment.pacing as string
                           : 'moderate',
      audienceAge:       ['kids','family','teens','adults','mature'].includes(enrichment.audienceAge as string)
                           ? enrichment.audienceAge as string
                           : 'adults',
      contentWarnings:   Array.isArray(enrichment.contentWarnings) ? enrichment.contentWarnings as string[] : [],
      aiSummary:         typeof enrichment.aiSummary === 'string' ? enrichment.aiSummary : item.plot,
      whyWatch:          typeof enrichment.whyWatch === 'string' ? enrichment.whyWatch : '',
      similarTitles:     Array.isArray(enrichment.similarTitles) ? enrichment.similarTitles as string[] : [],
      enrichedAt:        new Date().toISOString(),
      enrichmentVersion: 1,
    };

    send('parse', 'done', `${validated.tags.length} tags · ${validated.themes.length} themes · ${validated.similarTitles.length} similar titles`);

    // ── Step 4: Save to library ──
    send('save', 'running', 'Saving enrichment data…');
    updateItem(id, { enrichment: validated, enriching: false });
    send('save', 'done', 'Saved to library');

    // ── Done ──
    send('complete', 'done', JSON.stringify(validated));
    res.end();

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send('error', 'error', msg);
    updateItem(id, { enriching: false });
    res.end();
  }
}
