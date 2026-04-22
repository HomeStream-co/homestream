/**
 * /remote — Phone Remote Control  (v3)
 *
 * Mobile-optimised WebSocket remote for HomeStream.
 *
 * New in v3:
 *  - Browse tab: full library grid — tap any title to launch it on the TV
 *  - Tab bar at bottom: Remote | Browse
 *  - ?tab=browse deep-link (used by PWA shortcut)
 *
 * v2 features retained:
 *  - Poster art backdrop with blur + gradient overlay
 *  - Subtitle / caption track toggle
 *  - Haptic feedback, swipe gestures (seek / volume)
 *  - Landscape layout
 *  - Fullscreen + Cast buttons
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Wifi, WifiOff, Film, FastForward, ChevronRight, Zap,
  RotateCcw, QrCode, X, ExternalLink, Subtitles,
  Maximize2, Cast, ChevronUp, ChevronDown, Tv2, Square,
  Tv, Search, SlidersHorizontal, Star, Mic,
  Bot as _Bot, Send, Loader2, Sparkles,
  Download, Pause as PauseIcon, Play as PlayIcon, Trash2, CheckCircle2, Clock,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type RemoteTab = 'remote' | 'browse' | 'search' | 'ai' | 'downloads';

interface LibraryItem {
  id: string;
  title: string;
  type: 'movie' | 'series';
  poster?: string;
  year?: string;
  imdbRating?: string;
  genre?: string[];
  watchProgress?: number; // 0-1
}

interface SubtitleTrack {
  index: number;
  label: string;
  language: string;
}

interface CastSessionInfo {
  active: boolean;
  deviceName?: string;
  isPaused?: boolean;
  currentTime?: number;
  duration?: number;
  volume?: number;
  muted?: boolean;
}

interface PlayerState {
  type: 'state';
  mediaId: string;
  title: string;
  poster?: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  volume: number;
  speed: number;
  hasNextEpisode: boolean;
  subtitleTracks?: SubtitleTrack[];
  activeSubtitle?: number; // -1 = off
  cast?: CastSessionInfo;
}

type ConnStatus = 'connecting' | 'connected' | 'disconnected' | 'no_screen';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Trigger haptic feedback if available */
function haptic(pattern: number | number[] = 30) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// ── Swipe hook ────────────────────────────────────────────────────────────────

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

function useSwipe(
  onHorizontal: (delta: number) => void,
  onVertical: (delta: number) => void,
  threshold = 40,
): SwipeHandlers {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
    firedRef.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startRef.current || firedRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;
    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
      firedRef.current = true;
      haptic(20);
      onHorizontal(dx);
    } else if (Math.abs(dy) > threshold && Math.abs(dy) > Math.abs(dx)) {
      firedRef.current = true;
      haptic(20);
      onVertical(dy);
    }
  }, [onHorizontal, onVertical, threshold]);

  const onTouchEnd = useCallback((_e: React.TouchEvent) => {
    startRef.current = null;
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd };
}

// ── Seek flash overlay ────────────────────────────────────────────────────────

function SeekFlash({ dir, secs }: { dir: 'left' | 'right'; secs: number }) {
  return (
    <motion.div
      key={`${dir}-${Date.now()}`}
      initial={{ opacity: 0.9, scale: 0.9 }}
      animate={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.5 }}
      className={`absolute inset-y-0 ${dir === 'left' ? 'left-0 right-1/2' : 'left-1/2 right-0'} flex items-center justify-center pointer-events-none`}
    >
      <div className={`flex flex-col items-center gap-1 ${dir === 'left' ? 'text-blue-400' : 'text-blue-400'}`}>
        {dir === 'left'
          ? <SkipBack className="w-8 h-8" />
          : <SkipForward className="w-8 h-8" />
        }
        <span className="text-xs font-bold">{dir === 'left' ? `-${secs}s` : `+${secs}s`}</span>
      </div>
    </motion.div>
  );
}

// ── Volume flash overlay ──────────────────────────────────────────────────────

function VolumeFlash({ dir, pct }: { dir: 'up' | 'down'; pct: number }) {
  return (
    <motion.div
      key={`vol-${dir}-${Date.now()}`}
      initial={{ opacity: 0.9, y: dir === 'up' ? 10 : -10 }}
      animate={{ opacity: 0, y: dir === 'up' ? -10 : 10 }}
      transition={{ duration: 0.6 }}
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
    >
      <div className="flex flex-col items-center gap-1 text-white">
        {dir === 'up' ? <ChevronUp className="w-8 h-8" /> : <ChevronDown className="w-8 h-8" />}
        <span className="text-sm font-bold">{pct}%</span>
      </div>
    </motion.div>
  );
}

// ── Search Tab (keyboard + voice) ─────────────────────────────────────────────

// Extend window type for Web Speech API (not in all TypeScript lib versions)
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((e: SpeechRecognitionEvent) => void) | null;
    onerror: ((e: Event) => void) | null;
    onend: (() => void) | null;
  }
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }
}

function SearchTab({ send }: { send: (cmd: Record<string, unknown>) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LibraryItem[]>([]);
  const [allItems, setAllItems] = useState<LibraryItem[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [interimText, setInterimText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Load library once
  useEffect(() => {
    fetch('/api/media')
      .then(r => r.json())
      .then((data: LibraryItem[]) => setAllItems(Array.isArray(data) ? data : []))
      .catch(() => {});
    // Check voice support
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
    // Auto-focus search input
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Live search filter
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) { setResults([]); return; }
    setResults(
      allItems.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.genre?.some(g => g.toLowerCase().includes(q))
      ).slice(0, 30)
    );
  }, [query, allItems]);

  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;
    haptic([30, 20, 60]);
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    setListening(true);
    setInterimText('');

    recognition.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.results.length - 1; i >= 0; i--) {
        if (e.results[i].isFinal) { final = e.results[i][0].transcript; break; }
        else interim = e.results[i][0].transcript;
      }
      if (final) { setQuery(final); setInterimText(''); haptic(30); }
      else setInterimText(interim);
    };
    recognition.onerror = () => { setListening(false); setInterimText(''); };
    recognition.onend = () => { setListening(false); setInterimText(''); };
    recognition.start();
  }, []);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setInterimText('');
  }, []);

  const launch = useCallback((item: LibraryItem) => {
    haptic([30, 20, 30]);
    setLaunching(item.id);
    send({ type: 'launch', mediaId: item.id, title: item.title });
    setTimeout(() => setLaunching(null), 2000);
  }, [send]);

  return (
    <div className="flex flex-col gap-4">
      {/* Search input + mic */}
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="search"
            placeholder={listening ? 'Listening…' : 'Search movies & shows…'}
            value={listening ? interimText || query : query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {query && !listening && (
            <button
              onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Mic button */}
        {voiceSupported && (
          <motion.button
            onPointerDown={startVoice}
            onPointerUp={stopVoice}
            onPointerLeave={stopVoice}
            whileTap={{ scale: 0.9 }}
            className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border transition-all ${
              listening
                ? 'bg-red-500/20 border-red-500/50 text-red-400'
                : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
            }`}
            title="Hold to speak"
          >
            <AnimatePresence mode="wait">
              {listening ? (
                <motion.div key="on" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                  <Mic className="w-5 h-5 animate-pulse" />
                </motion.div>
              ) : (
                <motion.div key="off" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                  <Mic className="w-5 h-5" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        )}
      </div>

      {/* Voice listening indicator */}
      <AnimatePresence>
        {listening && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"
          >
            <div className="flex gap-1 items-end h-5">
              {[0, 1, 2, 3].map(i => (
                <motion.div
                  key={i}
                  className="w-1 bg-red-400 rounded-full"
                  animate={{ height: ['4px', '16px', '4px'] }}
                  transition={{ duration: 0.6, delay: i * 0.1, repeat: Infinity }}
                />
              ))}
            </div>
            <p className="text-sm text-red-400 font-medium">
              {interimText || 'Listening… say a movie or show name'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice tip */}
      {voiceSupported && !listening && !query && (
        <p className="text-xs text-muted-foreground text-center">
          Hold the mic button and say a title, genre, or actor name
        </p>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{results.length} result{results.length !== 1 ? 's' : ''}</p>
          <div className="flex flex-col gap-1.5">
            {results.map(item => (
              <motion.button
                key={item.id}
                onClick={() => launch(item)}
                whileTap={{ scale: 0.98 }}
                className="relative flex items-center gap-3 bg-card border border-border rounded-xl p-3 text-left hover:border-primary/40 transition-colors overflow-hidden"
              >
                {item.poster ? (
                  <img src={item.poster} alt="" className="w-10 h-14 object-cover rounded-lg flex-shrink-0" />
                ) : (
                  <div className="w-10 h-14 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                    <Film className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.year} · {item.type === 'series' ? 'TV Show' : 'Movie'}</p>
                  {item.imdbRating && item.imdbRating !== 'N/A' && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      <span className="text-[10px] text-muted-foreground">{item.imdbRating}</span>
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 text-muted-foreground">
                  <Tv2 className="w-4 h-4" />
                </div>

                {/* Launch overlay */}
                <AnimatePresence>
                  {launching === item.id && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-primary/80 flex items-center justify-center gap-2 rounded-xl"
                    >
                      <Tv2 className="w-5 h-5 text-white animate-pulse" />
                      <span className="text-white text-sm font-semibold">Launching on TV…</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {query && results.length === 0 && (
        <div className="text-center py-10">
          <p className="text-muted-foreground text-sm">No results for "{query}"</p>
          <p className="text-xs text-muted-foreground mt-1">Try a different title or genre</p>
        </div>
      )}
    </div>
  );
}

// ── AI Recommendation Tab ─────────────────────────────────────────────────────

interface AIChatMessage {
  role: 'user' | 'ai';
  text: string;
  recommendations?: LibraryItem[];
}

function AITab({ send }: { send: (cmd: Record<string, unknown>) => void }) {
  const [messages, setMessages] = useState<AIChatMessage[]>([
    {
      role: 'ai',
      text: "Hey! I know your entire HomeStream library. Ask me anything — what's good for tonight, something for the kids, a thriller under 2 hours, whatever you're in the mood for.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const historyRef = useRef<Array<{ role: 'user' | 'model'; parts: [{ text: string }] }>>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    fetch('/api/media')
      .then(r => r.json())
      .then((data: LibraryItem[]) => setLibrary(Array.isArray(data) ? data : []))
      .catch(() => {});
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    haptic(20);
    const userMsg: AIChatMessage = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Build library payload for AI (same shape as desktop chat)
    const libraryPayload = library.map(item => ({
      id: item.id,
      title: item.title,
      genre: item.genre ?? [],
      plot: '',
      imdbRating: item.imdbRating ?? 'N/A',
      type: item.type,
      year: item.year ?? '',
      director: '',
      actors: '',
      poster: item.poster ?? '',
      watchProgress: item.watchProgress ?? 0,
    }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          library: libraryPayload,
          history: historyRef.current,
        }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      const reply = data.reply ?? data.error ?? 'Sorry, something went wrong.';

      // Update history for multi-turn conversation
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', parts: [{ text }] },
        { role: 'model', parts: [{ text: reply }] },
      ];

      // Extract any title mentions that match library items
      const mentioned = library.filter(item =>
        reply.toLowerCase().includes(item.title.toLowerCase())
      ).slice(0, 4);

      setMessages(prev => [...prev, { role: 'ai', text: reply, recommendations: mentioned }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Could not reach the AI. Make sure your Google AI API key is configured.' }]);
    } finally {
      setLoading(false);
    }
  }, [library, loading]);

  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;
    haptic([30, 20, 60]);
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    setListening(true);
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? '';
      if (transcript) { sendMessage(transcript); haptic(30); }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
  }, [sendMessage]);

  const launch = useCallback((item: LibraryItem) => {
    haptic([30, 20, 30]);
    setLaunching(item.id);
    send({ type: 'launch', mediaId: item.id, title: item.title });
    setTimeout(() => setLaunching(null), 2000);
  }, [send]);

  const QUICK_PROMPTS = [
    "What's good for tonight?",
    "Something for the whole family",
    "Best thriller in my library",
    "Short movie under 90 min",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'flex flex-col gap-2'}`}>
              {msg.role === 'ai' && (
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span className="text-[10px] text-muted-foreground font-medium">HomeStream AI</span>
                </div>
              )}
              <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-card border border-border text-foreground rounded-bl-sm'
              }`}>
                {msg.text}
              </div>

              {/* Recommended titles — tap to launch */}
              {msg.recommendations && msg.recommendations.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-1">
                  {msg.recommendations.map(item => (
                    <motion.button
                      key={item.id}
                      onClick={() => launch(item)}
                      whileTap={{ scale: 0.97 }}
                      className="relative flex items-center gap-2.5 bg-card border border-primary/30 rounded-xl p-2.5 text-left hover:border-primary/60 transition-colors overflow-hidden"
                    >
                      {item.poster ? (
                        <img src={item.poster} alt="" className="w-8 h-11 object-cover rounded-lg flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-11 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                          <Film className="w-3 h-3 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground">{item.year}</p>
                      </div>
                      <div className="flex-shrink-0 bg-primary/10 rounded-lg p-1.5">
                        <Tv2 className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <AnimatePresence>
                        {launching === item.id && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-primary/80 flex items-center justify-center gap-1.5 rounded-xl"
                          >
                            <Tv2 className="w-4 h-4 text-white animate-pulse" />
                            <span className="text-white text-xs font-semibold">Launching…</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
              <span className="text-xs text-muted-foreground">Thinking…</span>
            </div>
          </div>
        )}

        {/* Quick prompts — only on first message */}
        {messages.length === 1 && !loading && (
          <div className="flex flex-col gap-1.5 mt-1">
            <p className="text-[10px] text-muted-foreground px-1">Quick questions:</p>
            {QUICK_PROMPTS.map(p => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                className="text-left text-xs bg-card border border-border rounded-xl px-3.5 py-2.5 text-foreground hover:border-primary/40 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 pt-3 border-t border-border">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask anything about your library…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            className="w-full bg-card border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 pr-10"
          />
        </div>

        {/* Voice button */}
        {voiceSupported && (
          <button
            onPointerDown={startVoice}
            className={`w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0 transition-all ${
              listening ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-card border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Mic className={`w-4 h-4 ${listening ? 'animate-pulse' : ''}`} />
          </button>
        )}

        {/* Send button */}
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary text-primary-foreground flex-shrink-0 disabled:opacity-40 transition-opacity"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ── Download Tab ──────────────────────────────────────────────────────────────

interface DownloadJob {
  hash?: string;
  jobId?: string;
  title: string;
  poster?: string;
  progress: number;        // 0-100
  dlspeed?: number;        // bytes/s
  eta?: number;            // seconds
  status: 'queued' | 'downloading' | 'done' | 'paused' | 'error' | 'seeding' | 'stalled';
  quality?: string;
  type?: 'movie' | 'series';
  backend?: 'qbittorrent' | 'webtorrent';
}

interface TMDBSearchResult {
  id: number;
  title?: string;
  name?: string;
  media_type: 'movie' | 'tv';
  poster_path?: string;
  release_date?: string;
  first_air_date?: string;
  imdb_id?: string;
  overview?: string;
}

function fmtSpeed(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} KB/s`;
  return `${bps} B/s`;
}

function fmtEta(secs: number): string {
  if (secs <= 0 || secs > 86400 * 7) return '∞';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function statusColor(s: DownloadJob['status']): string {
  if (s === 'done' || s === 'seeding') return 'text-green-400';
  if (s === 'error') return 'text-red-400';
  if (s === 'paused') return 'text-yellow-400';
  if (s === 'stalled') return 'text-orange-400';
  return 'text-primary';
}

function statusLabel(s: DownloadJob['status']): string {
  if (s === 'done') return 'Done';
  if (s === 'seeding') return 'Seeding';
  if (s === 'error') return 'Error';
  if (s === 'paused') return 'Paused';
  if (s === 'stalled') return 'Stalled';
  if (s === 'queued') return 'Queued';
  return 'Downloading';
}

function DownloadTab() {
  // ── Active downloads ──────────────────────────────────────────────────────
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [qbitOnline, setQbitOnline] = useState(false);

  // ── Search & queue ────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TMDBSearchResult[]>([]);
  const [queueing, setQueueing] = useState<number | null>(null);
  const [queueMsg, setQueueMsg] = useState<{ id: number; ok: boolean; text: string } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Poll active downloads every 3s
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch('/api/stremio/downloads');
        if (!r.ok) return;
        const data = await r.json() as {
          jobs: DownloadJob[];
          qbitTorrents: DownloadJob[];
          qbitOnline: boolean;
        };
        if (cancelled) return;
        const all: DownloadJob[] = [
          ...(data.qbitTorrents ?? []),
          ...(data.jobs ?? []).filter(j => !data.qbitTorrents?.some(q => q.hash === j.jobId)),
        ];
        setJobs(all);
        setQbitOnline(data.qbitOnline ?? false);
        setLoadingJobs(false);
      } catch {
        if (!cancelled) setLoadingJobs(false);
      }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // TMDB search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const r = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&page=1`);
      if (!r.ok) throw new Error('search failed');
      const data = await r.json() as { results?: TMDBSearchResult[] };
      setResults((data.results ?? []).filter(x => x.media_type === 'movie' || x.media_type === 'tv').slice(0, 12));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 500);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const queueDownload = useCallback(async (item: TMDBSearchResult) => {
    haptic([30, 20, 30]);
    setQueueing(item.id);
    setQueueMsg(null);
    try {
      const type = item.media_type === 'tv' ? 'series' : 'movie';
      const title = item.title ?? item.name ?? 'Unknown';
      const poster = item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : undefined;
      // Fetch TMDB details to get imdbId
      const detailUrl = `/api/tmdb/${type === 'movie' ? 'movie' : 'tv'}/${item.id}`;
      const detailRes = await fetch(detailUrl);
      let imdbId = item.imdb_id ?? '';
      if (detailRes.ok) {
        const detail = await detailRes.json() as { imdb_id?: string; external_ids?: { imdb_id?: string } };
        imdbId = detail.imdb_id ?? detail.external_ids?.imdb_id ?? imdbId;
      }
      if (!imdbId) {
        setQueueMsg({ id: item.id, ok: false, text: 'No IMDb ID found — try searching on the Discover page instead' });
        return;
      }
      const r = await fetch('/api/stremio/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imdbId, type, title, poster }),
      });
      const data = await r.json() as { queued?: number; error?: string };
      if (!r.ok) throw new Error(data.error ?? 'Queue failed');
      setQueueMsg({ id: item.id, ok: true, text: `Queued ${data.queued ?? 1} file${(data.queued ?? 1) !== 1 ? 's' : ''}` });
      setQuery('');
      setResults([]);
    } catch (err) {
      setQueueMsg({ id: item.id, ok: false, text: String(err) });
    } finally {
      setQueueing(null);
    }
  }, []);

  const pauseJob = useCallback(async (hash: string) => {
    haptic(20);
    await fetch('/api/stremio/downloads/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash }),
    });
  }, []);

  const resumeJob = useCallback(async (hash: string) => {
    haptic(20);
    await fetch('/api/stremio/downloads/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash }),
    });
  }, []);

  const deleteJob = useCallback(async (hash: string) => {
    haptic([30, 20, 60]);
    await fetch(`/api/stremio/downloads/${encodeURIComponent(hash)}`, { method: 'DELETE' });
    setJobs(prev => prev.filter(j => (j.hash ?? j.jobId) !== hash));
  }, []);

  const activeJobs = jobs.filter(j => j.status !== 'done' && j.status !== 'seeding');
  const doneJobs = jobs.filter(j => j.status === 'done' || j.status === 'seeding');

  return (
    <div className="flex flex-col gap-5 pb-4">

      {/* ── Search to queue ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="search"
              placeholder="Search to download…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {searching && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />}
        </div>

        {/* Search results */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-2"
            >
              {results.map(item => {
                const title = item.title ?? item.name ?? '';
                const year = (item.release_date ?? item.first_air_date ?? '').slice(0, 4);
                const poster = item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : null;
                const isQueuing = queueing === item.id;
                const msg = queueMsg?.id === item.id ? queueMsg : null;

                return (
                  <motion.div
                    key={item.id}
                    layout
                    className="flex items-center gap-3 bg-card border border-border rounded-xl p-2.5"
                  >
                    {/* Poster */}
                    {poster ? (
                      <img src={poster} alt="" className="w-9 h-12 object-cover rounded-lg flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-12 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                        <Film className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {year} · {item.media_type === 'tv' ? 'TV Show' : 'Movie'}
                      </p>
                      {msg && (
                        <p className={`text-[10px] mt-0.5 font-medium ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>
                          {msg.text}
                        </p>
                      )}
                    </div>

                    {/* Queue button */}
                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      onClick={() => queueDownload(item)}
                      disabled={isQueuing || msg?.ok}
                      className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                        msg?.ok
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-primary/15 text-primary active:bg-primary/30'
                      }`}
                    >
                      {isQueuing
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : msg?.ok
                          ? <CheckCircle2 className="w-4 h-4" />
                          : <Download className="w-4 h-4" />
                      }
                    </motion.button>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {query && !searching && results.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">No results for "{query}"</p>
        )}
      </div>

      {/* ── Active downloads ── */}
      {loadingJobs ? (
        <div className="flex items-center justify-center gap-2 py-6">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading downloads…</p>
        </div>
      ) : jobs.length === 0 ? (
        !query && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Download className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No active downloads</p>
            <p className="text-xs text-muted-foreground/60">Search above to queue something</p>
            {!qbitOnline && (
              <p className="text-[10px] text-yellow-400 mt-1">qBittorrent offline — using built-in downloader</p>
            )}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {/* Active / in-progress */}
          {activeJobs.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Downloading · {activeJobs.length}
              </p>
              {activeJobs.map(job => {
                const hash = job.hash ?? job.jobId ?? '';
                return (
                  <div key={hash} className="bg-card border border-border rounded-2xl p-3 flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      {job.poster ? (
                        <img src={job.poster} alt="" className="w-8 h-11 object-cover rounded-lg flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-11 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                          <Film className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{job.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-medium ${statusColor(job.status)}`}>
                            {statusLabel(job.status)}
                          </span>
                          {job.dlspeed != null && job.dlspeed > 0 && (
                            <span className="text-[10px] text-muted-foreground">{fmtSpeed(job.dlspeed)}</span>
                          )}
                          {job.eta != null && job.eta > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />{fmtEta(job.eta)}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Controls */}
                      <div className="flex gap-1.5 flex-shrink-0">
                        {job.status === 'paused' ? (
                          <button
                            onClick={() => resumeJob(hash)}
                            className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center"
                          >
                            <PlayIcon className="w-3.5 h-3.5 fill-primary" />
                          </button>
                        ) : job.status === 'downloading' ? (
                          <button
                            onClick={() => pauseJob(hash)}
                            className="w-7 h-7 rounded-lg bg-muted text-muted-foreground flex items-center justify-center"
                          >
                            <PauseIcon className="w-3.5 h-3.5 fill-muted-foreground" />
                          </button>
                        ) : null}
                        <button
                          onClick={() => deleteJob(hash)}
                          className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${
                            job.status === 'error' ? 'bg-red-500' :
                            job.status === 'paused' ? 'bg-yellow-400' :
                            'bg-primary'
                          }`}
                          style={{ width: `${job.progress}%` }}
                          animate={{ width: `${job.progress}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono w-8 text-right flex-shrink-0">
                        {job.progress}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Completed */}
          {doneJobs.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Completed · {doneJobs.length}
              </p>
              {doneJobs.map(job => {
                const hash = job.hash ?? job.jobId ?? '';
                return (
                  <div key={hash} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-2">
                    {job.poster ? (
                      <img src={job.poster} alt="" className="w-8 h-11 object-cover rounded-lg flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-11 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                        <Film className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{job.title}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3 text-green-400" />
                        <span className="text-[10px] text-green-400 font-medium">
                          {job.status === 'seeding' ? 'Seeding' : 'Complete'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteJob(hash)}
                      className="w-7 h-7 rounded-lg bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Browse Tab ────────────────────────────────────────────────────────────────

function BrowseTab({ send }: { send: (cmd: Record<string, unknown>) => void }) {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'movie' | 'series'>('all');
  const [launching, setLaunching] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/media')
      .then(r => r.json())
      .then((data: LibraryItem[]) => {
        setLibrary(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let items = library;
    if (filter !== 'all') items = items.filter(i => i.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i => i.title.toLowerCase().includes(q));
    }
    return items;
  }, [library, search, filter]);

  const launch = useCallback((item: LibraryItem) => {
    haptic([30, 20, 30]);
    setLaunching(item.id);
    send({ type: 'launch', mediaId: item.id, title: item.title });
    setTimeout(() => setLaunching(null), 2000);
  }, [send]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading library…</p>
      </div>
    );
  }

  if (library.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
        <Film className="w-12 h-12 text-muted-foreground" />
        <p className="text-foreground font-semibold">No media yet</p>
        <p className="text-sm text-muted-foreground">Add movies or shows to your HomeStream library first.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          placeholder="Search library…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {(['all', 'movie', 'series'] as const).map(f => (
          <button
            key={f}
            onClick={() => { haptic(20); setFilter(f); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              filter === f
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'bg-card border-border text-muted-foreground'
            }`}
          >
            {f === 'all' ? <SlidersHorizontal className="w-3 h-3" /> : f === 'movie' ? <Film className="w-3 h-3" /> : <Tv className="w-3 h-3" />}
            {f === 'all' ? 'All' : f === 'movie' ? 'Movies' : 'TV Shows'}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">{filtered.length}</span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-2">
        {filtered.map(item => (
          <motion.button
            key={item.id}
            onClick={() => launch(item)}
            whileTap={{ scale: 0.95 }}
            className="relative rounded-xl overflow-hidden aspect-[2/3] bg-card border border-border group"
          >
            {item.poster ? (
              <img
                src={item.poster}
                alt={item.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Film className="w-6 h-6 text-muted-foreground" />
              </div>
            )}

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

            {/* Watch progress bar */}
            {item.watchProgress && item.watchProgress > 0.02 && item.watchProgress < 0.98 && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${item.watchProgress * 100}%` }}
                />
              </div>
            )}

            {/* Title */}
            <div className="absolute bottom-0 left-0 right-0 p-1.5">
              <p className="text-white text-[10px] font-medium leading-tight line-clamp-2">{item.title}</p>
              {item.imdbRating && item.imdbRating !== 'N/A' && (
                <div className="flex items-center gap-0.5 mt-0.5">
                  <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
                  <span className="text-[9px] text-white/70">{item.imdbRating}</span>
                </div>
              )}
            </div>

            {/* Launch overlay */}
            <AnimatePresence>
              {launching === item.id && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-primary/80 flex flex-col items-center justify-center gap-1"
                >
                  <Tv2 className="w-6 h-6 text-white animate-pulse" />
                  <span className="text-white text-[10px] font-semibold">Launching…</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        ))}
      </div>

      {filtered.length === 0 && search && (
        <p className="text-center text-sm text-muted-foreground py-8">No results for "{search}"</p>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RemotePage() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read ?tab= from URL for PWA shortcut deep-linking
  const initialTab = (new URLSearchParams(window.location.search).get('tab') ?? 'remote') as RemoteTab;
  const [activeTab, setActiveTab] = useState<RemoteTab>(initialTab);

  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [state, setState] = useState<PlayerState | null>(null);
  const [localTime, setLocalTime] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [screenCount, setScreenCount] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [showCastPanel, setShowCastPanel] = useState(false);

  // Download badge count (polled independently so tab bar stays live)
  const [activeDownloadCount, setActiveDownloadCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch('/api/stremio/downloads');
        if (!r.ok || cancelled) return;
        const data = await r.json() as { qbitTorrents?: { status: string }[]; jobs?: { status: string }[] };
        const all = [...(data.qbitTorrents ?? []), ...(data.jobs ?? [])];
        if (!cancelled) setActiveDownloadCount(all.filter(j => j.status === 'downloading').length);
      } catch { /* ignore */ }
    }
    poll();
    const id = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Seek / volume flash overlays
  const [seekFlash, setSeekFlash] = useState<{ dir: 'left' | 'right'; secs: number; key: number } | null>(null);
  const [volFlash, setVolFlash] = useState<{ dir: 'up' | 'down'; pct: number; key: number } | null>(null);

  // QR code
  const [showQr, setShowQr] = useState(false);
  const [qrData, setQrData] = useState<{ url: string; qr: string } | null>(null);

  // Detect landscape orientation
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  useEffect(() => {
    fetch('/api/remote/qr')
      .then(r => r.json())
      .then((d: { url: string; qr: string }) => setQrData(d))
      .catch(() => {});
  }, []);

  // Tick local time forward while playing
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statePaused = state?.paused;
  const stateDuration = state?.duration;
  const stateCurrentTime = state?.currentTime;
  useEffect(() => {
    if (state && !statePaused && !isScrubbing) {
      tickRef.current = setInterval(() => {
        setLocalTime(t => Math.min(t + 1, stateDuration ?? 0));
      }, 1000);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [statePaused, stateDuration, isScrubbing, state]);

  useEffect(() => {
    if (stateCurrentTime !== undefined) setLocalTime(stateCurrentTime);
  }, [stateCurrentTime]);

  // Auto-open cast panel when a cast session becomes active
  const castActive = state?.cast?.active;
  useEffect(() => {
    if (castActive) setShowCastPanel(true);
  }, [castActive]);

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Pass session token as query param — the /remote page may be accessed
    // from a phone on the same LAN where cookies aren't sent cross-origin.
    const cookieToken = document.cookie.match(/(?:^|;\s*)hs_session=([^;]+)/)?.[1] ?? '';
    const tokenParam = cookieToken ? `&token=${encodeURIComponent(cookieToken)}` : '';
    const url = `${protocol}//${window.location.host}/ws/remote?role=remote&mediaId=*${tokenParam}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => setStatus('no_screen');

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string } & Partial<PlayerState> & { count?: number };
        if (msg.type === 'state') {
          setState(msg as PlayerState);
          setStatus('connected');
        } else if (msg.type === 'screens_available') {
          setScreenCount(msg.count ?? 0);
          if ((msg.count ?? 0) === 0) setStatus('no_screen');
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // ── Send command ──────────────────────────────────────────────────────────

  const send = useCallback((cmd: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(cmd));
  }, []);

  const sendHaptic = useCallback((cmd: Record<string, unknown>, pattern: number | number[] = 30) => {
    haptic(pattern);
    send(cmd);
  }, [send]);

  // ── Subtitle cycle ────────────────────────────────────────────────────────

  const cycleSubtitle = useCallback(() => {
    if (!state) return;
    haptic(40);
    const tracks = state.subtitleTracks ?? [];
    const current = state.activeSubtitle ?? -1;
    // -1 → first track → ... → last track → -1 (off)
    let next: number;
    if (current === -1) {
      next = tracks.length > 0 ? tracks[0].index : -1;
    } else {
      const idx = tracks.findIndex(t => t.index === current);
      next = idx >= 0 && idx < tracks.length - 1 ? tracks[idx + 1].index : -1;
    }
    send({ type: 'subtitle', track: next });
  }, [state, send]);

  // ── Swipe gestures ────────────────────────────────────────────────────────

  const handleHorizontalSwipe = useCallback((dx: number) => {
    const secs = Math.abs(dx) > 120 ? 30 : 10;
    const dir = dx > 0 ? 'right' : 'left';
    setSeekFlash({ dir, secs, key: Date.now() });
    send({ type: dx > 0 ? 'skip_forward' : 'skip_back', seconds: secs });
  }, [send]);

  const handleVerticalSwipe = useCallback((dy: number) => {
    if (!state) return;
    const delta = dy > 0 ? -0.1 : 0.1; // swipe down = lower volume
    const newVol = Math.max(0, Math.min(1, state.volume + delta));
    const pct = Math.round(newVol * 100);
    setVolFlash({ dir: delta > 0 ? 'up' : 'down', pct, key: Date.now() });
    send({ type: 'volume', level: newVol });
  }, [state, send]);

  const swipeHandlers = useSwipe(handleHorizontalSwipe, handleVerticalSwipe);

  // ── Derived ───────────────────────────────────────────────────────────────

  const displayTime = isScrubbing ? scrubValue : localTime;
  const progress = state?.duration ? displayTime / state.duration : 0;
  const hasSubtitles = (state?.subtitleTracks?.length ?? 0) > 0;
  const subtitleActive = (state?.activeSubtitle ?? -1) !== -1;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen bg-background select-none overflow-hidden relative ${isLandscape ? 'flex flex-row' : 'flex flex-col items-center'}`}>
      <title>HomeStream Remote</title>

      {/* ── Poster backdrop (blurred) ── */}
      {state?.poster && (
        <div
          className="fixed inset-0 -z-10 pointer-events-none"
          aria-hidden="true"
        >
          <img
            src={state.poster}
            alt=""
            className="w-full h-full object-cover opacity-20 blur-2xl scale-110"
          />
          <div className="absolute inset-0 bg-background/70" />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          LANDSCAPE LAYOUT — poster left, controls right
      ══════════════════════════════════════════════════════════════════════ */}
      {isLandscape && status === 'connected' && state ? (
        <>
          {/* Left: poster */}
          <div
            className="relative flex-shrink-0 w-[40vw] h-screen overflow-hidden"
            {...swipeHandlers}
          >
            {state.poster ? (
              <img
                src={state.poster}
                alt={state.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-card flex items-center justify-center">
                <Film className="w-16 h-16 text-muted-foreground" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-background/80" />

            {/* Seek / volume flash overlays */}
            <AnimatePresence>
              {seekFlash && <SeekFlash key={seekFlash.key} dir={seekFlash.dir} secs={seekFlash.secs} />}
            </AnimatePresence>
            <AnimatePresence>
              {volFlash && <VolumeFlash key={volFlash.key} dir={volFlash.dir} pct={volFlash.pct} />}
            </AnimatePresence>

            {/* Swipe hint */}
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <p className="text-[10px] text-white/40">← swipe to seek · ↕ swipe for volume</p>
            </div>
          </div>

          {/* Right: controls */}
          <div className="flex-1 flex flex-col justify-between px-6 py-4 overflow-y-auto">
            <LandscapeControls
              state={state}
              displayTime={displayTime}
              progress={progress}
              setIsScrubbing={setIsScrubbing}
              setScrubValue={setScrubValue}
              showSpeedPicker={showSpeedPicker}
              setShowSpeedPicker={setShowSpeedPicker}
              hasSubtitles={hasSubtitles}
              subtitleActive={subtitleActive}
              screenCount={screenCount}
              qrData={qrData}
              showQr={showQr}
              setShowQr={setShowQr}
              showCastPanel={showCastPanel}
              setShowCastPanel={setShowCastPanel}
              send={send}
              sendHaptic={sendHaptic}
              cycleSubtitle={cycleSubtitle}
            />
          </div>
        </>
      ) : (
        /* ════════════════════════════════════════════════════════════════════
           PORTRAIT LAYOUT (default)
        ════════════════════════════════════════════════════════════════════ */
        <div className="w-full max-w-sm mx-auto flex flex-col px-4 pt-5 pb-24">

          {/* Header bar */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Film className="w-5 h-5 text-primary" />
              <span className="font-heading text-foreground font-bold tracking-wide">Remote</span>
            </div>
            <div className="flex items-center gap-2">
              {qrData && (
                <button
                  onClick={() => setShowQr(v => !v)}
                  className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  title="Show QR code"
                >
                  <QrCode className="w-4 h-4" />
                </button>
              )}
              <StatusBadge status={status} screenCount={screenCount} />
            </div>
          </div>

          {/* QR modal */}
          <AnimatePresence>
            {showQr && qrData && <QrModal qrData={qrData} onClose={() => setShowQr(false)} />}
          </AnimatePresence>

          {/* Idle / connecting state — only on remote tab */}
          <AnimatePresence>
            {activeTab === 'remote' && status !== 'connected' && (
              <IdleState
                status={status}
                onRetry={() => {
                  if (reconnectRef.current) clearTimeout(reconnectRef.current);
                  connect();
                }}
              />
            )}
          </AnimatePresence>

          {/* Player controls — only on remote tab */}
          <AnimatePresence>
            {activeTab === 'remote' && status === 'connected' && state && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-4"
              >
                {/* ── Now Playing card (horizontal, compact) ── */}
                <div className="flex items-center gap-3 bg-card border border-border rounded-2xl p-3">
                  {state.poster ? (
                    <img
                      src={state.poster}
                      alt={state.title}
                      className="w-12 h-16 object-cover rounded-xl flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-muted rounded-xl flex items-center justify-center flex-shrink-0">
                      <Film className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Now Playing</p>
                    <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{state.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatTime(displayTime)} / {formatTime(state.duration)}</p>
                  </div>
                  {/* Fullscreen + Cast inline */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => sendHaptic({ type: 'fullscreen' })}
                      className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      title="Fullscreen"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        haptic(30);
                        if (state.cast?.active) setShowCastPanel(v => !v);
                        else send({ type: 'cast' });
                      }}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                        state.cast?.active
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                      title={state.cast?.active ? 'Casting' : 'Cast'}
                    >
                      <Cast className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* ── Seek bar ── */}
                <SeekBar
                  state={state}
                  displayTime={displayTime}
                  progress={progress}
                  setIsScrubbing={setIsScrubbing}
                  setScrubValue={setScrubValue}
                  send={send}
                />

                {/* ── Big three: skip back | play/pause | skip forward ── */}
                <div
                  className="flex items-center justify-between px-2"
                  {...swipeHandlers}
                >
                  {/* Skip back 10s */}
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={() => sendHaptic({ type: 'skip_back', seconds: 10 })}
                    className="flex flex-col items-center gap-1.5 w-20 h-20 rounded-2xl bg-card border border-border justify-center active:bg-muted transition-colors"
                  >
                    <SkipBack className="w-6 h-6 text-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium">−10s</span>
                  </motion.button>

                  {/* Play / Pause — large center button */}
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => sendHaptic({ type: state.paused ? 'play' : 'pause' }, [30, 20, 30])}
                    className="w-24 h-24 rounded-full bg-primary flex items-center justify-center shadow-xl shadow-primary/40 transition-all"
                  >
                    {state.paused
                      ? <Play className="w-10 h-10 text-primary-foreground fill-primary-foreground ml-1" />
                      : <Pause className="w-10 h-10 text-primary-foreground fill-primary-foreground" />
                    }
                  </motion.button>

                  {/* Skip forward 10s */}
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={() => sendHaptic({ type: 'skip_forward', seconds: 10 })}
                    className="flex flex-col items-center gap-1.5 w-20 h-20 rounded-2xl bg-card border border-border justify-center active:bg-muted transition-colors"
                  >
                    <SkipForward className="w-6 h-6 text-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium">+10s</span>
                  </motion.button>
                </div>

                {/* ── Volume slider ── */}
                <VolumeControl state={state} send={send} />

                {/* ── Secondary action row ── */}
                <div className="grid grid-cols-4 gap-2">
                  {/* Skip Intro */}
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => sendHaptic({ type: 'skip_intro' })}
                    className="flex flex-col items-center gap-1.5 bg-card border border-border rounded-2xl py-3 px-1 transition-colors active:bg-muted"
                  >
                    <FastForward className="w-5 h-5 text-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium leading-tight text-center">Skip Intro</span>
                  </motion.button>

                  {/* Next Episode (always shown, dimmed if unavailable) */}
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => state.hasNextEpisode && sendHaptic({ type: 'next_episode' })}
                    className={`flex flex-col items-center gap-1.5 border rounded-2xl py-3 px-1 transition-colors ${
                      state.hasNextEpisode
                        ? 'bg-card border-border active:bg-muted'
                        : 'bg-card/40 border-border/40 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <ChevronRight className="w-5 h-5 text-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium leading-tight text-center">Next Ep</span>
                  </motion.button>

                  {/* Subtitles */}
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={hasSubtitles ? cycleSubtitle : undefined}
                    className={`flex flex-col items-center gap-1.5 border rounded-2xl py-3 px-1 transition-colors ${
                      subtitleActive
                        ? 'bg-primary/15 border-primary/40'
                        : hasSubtitles
                          ? 'bg-card border-border active:bg-muted'
                          : 'bg-card/40 border-border/40 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <Subtitles className={`w-5 h-5 ${subtitleActive ? 'text-primary' : 'text-foreground'}`} />
                    <span className={`text-[10px] font-medium leading-tight text-center ${subtitleActive ? 'text-primary' : 'text-muted-foreground'}`}>
                      {subtitleActive
                        ? (state.subtitleTracks?.find(t => t.index === state.activeSubtitle)?.label ?? 'CC On')
                        : 'CC'}
                    </span>
                  </motion.button>

                  {/* Speed */}
                  <div className="relative">
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      onClick={() => { haptic(20); setShowSpeedPicker(v => !v); }}
                      className={`w-full flex flex-col items-center gap-1.5 border rounded-2xl py-3 px-1 transition-colors ${
                        state.speed !== 1
                          ? 'bg-primary/15 border-primary/40'
                          : 'bg-card border-border active:bg-muted'
                      }`}
                    >
                      <Zap className={`w-5 h-5 ${state.speed !== 1 ? 'text-primary' : 'text-foreground'}`} />
                      <span className={`text-[10px] font-medium ${state.speed !== 1 ? 'text-primary' : 'text-muted-foreground'}`}>
                        {state.speed}×
                      </span>
                    </motion.button>
                    <AnimatePresence>
                      {showSpeedPicker && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.95 }}
                          className="absolute bottom-full right-0 mb-2 bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-20 w-28"
                        >
                          {SPEEDS.map(s => (
                            <button
                              key={s}
                              onClick={() => { sendHaptic({ type: 'speed', rate: s }); setShowSpeedPicker(false); }}
                              className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${
                                state.speed === s
                                  ? 'bg-primary/20 text-primary font-semibold'
                                  : 'text-foreground hover:bg-muted'
                              }`}
                            >
                              {s}×
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Cast session panel */}
                <AnimatePresence>
                  {showCastPanel && state.cast?.active && (
                    <CastPanel
                      cast={state.cast}
                      send={send}
                      onClose={() => setShowCastPanel(false)}
                    />
                  )}
                </AnimatePresence>

                {/* Swipe hint */}
                <p className="text-center text-[10px] text-muted-foreground/50">
                  ← swipe controls area to seek · ↕ swipe for volume
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Browse tab content ── */}
          <AnimatePresence mode="wait">
            {activeTab === 'browse' && (
              <motion.div
                key="browse"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <BrowseTab send={send} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Search tab content ── */}
          <AnimatePresence mode="wait">
            {activeTab === 'search' && (
              <motion.div
                key="search"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <SearchTab send={send} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── AI tab content ── */}
          <AnimatePresence mode="wait">
            {activeTab === 'ai' && (
              <motion.div
                key="ai"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col"
              >
                <AITab send={send} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Downloads tab content ── */}
          <AnimatePresence mode="wait">
            {activeTab === 'downloads' && (
              <motion.div
                key="downloads"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <DownloadTab />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Bottom tab bar — always visible in portrait, hidden in landscape ── */}
      {!isLandscape && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t border-border">
          <div className="flex max-w-sm mx-auto">
            <button
              onClick={() => { haptic(20); setActiveTab('remote'); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors relative ${
                activeTab === 'remote' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Tv2 className="w-5 h-5" />
              Remote
              {status === 'connected' && (
                <span className="absolute top-2 right-[calc(50%-20px)] w-1.5 h-1.5 rounded-full bg-green-400" />
              )}
            </button>
            <button
              onClick={() => { haptic(20); setActiveTab('search'); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                activeTab === 'search' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Search className="w-5 h-5" />
              Search
            </button>
            <button
              onClick={() => { haptic(20); setActiveTab('browse'); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                activeTab === 'browse' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Film className="w-5 h-5" />
              Browse
            </button>
            <button
              onClick={() => { haptic(20); setActiveTab('downloads'); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors relative ${
                activeTab === 'downloads' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Download className="w-5 h-5" />
              Downloads
              {/* Badge: active download count */}
              {activeDownloadCount > 0 && (
                <span className="absolute top-2 right-[calc(50%-20px)] min-w-[14px] h-3.5 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center px-0.5">
                  {activeDownloadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => { haptic(20); setActiveTab('ai'); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                activeTab === 'ai' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Sparkles className="w-5 h-5" />
              Ask AI
            </button>
          </div>
          {/* Safe area spacer for iOS home indicator */}
          <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status, screenCount }: { status: ConnStatus; screenCount: number }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
      status === 'connected'  ? 'bg-green-500/10 border-green-500/30 text-green-400' :
      status === 'connecting' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
      status === 'no_screen'  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                                'bg-red-500/10 border-red-500/30 text-red-400'
    }`}>
      {status === 'connected'  ? <Wifi className="w-3 h-3" /> :
       status === 'connecting' ? <Wifi className="w-3 h-3 animate-pulse" /> :
                                 <WifiOff className="w-3 h-3" />}
      {status === 'connected'  ? `${screenCount} screen${screenCount !== 1 ? 's' : ''}` :
       status === 'connecting' ? 'Connecting…' :
       status === 'no_screen'  ? 'No screen' :
                                 'Disconnected'}
    </div>
  );
}

function IdleState({ status, onRetry }: { status: ConnStatus; onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="w-full text-center py-12"
    >
      <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mx-auto mb-4">
        <Film className="w-7 h-7 text-muted-foreground" />
      </div>
      <p className="text-foreground font-semibold mb-2">
        {status === 'connecting' ? 'Connecting to HomeStream…' :
         status === 'no_screen'  ? 'No video playing' :
                                   'Connection lost — reconnecting…'}
      </p>
      <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
        {status === 'no_screen'
          ? 'Open HomeStream on your TV or desktop and start playing something.'
          : 'Make sure HomeStream is running on your home network.'}
      </p>
      {status === 'disconnected' && (
        <button
          onClick={onRetry}
          className="mt-4 flex items-center gap-1.5 mx-auto text-sm text-primary hover:text-primary/80 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Retry now
        </button>
      )}
    </motion.div>
  );
}

function QrModal({ qrData, onClose }: { qrData: { url: string; qr: string }; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -8 }}
      transition={{ duration: 0.15 }}
      className="w-full mb-5 bg-card border border-border rounded-2xl p-5 shadow-xl"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Open on another device</p>
          <p className="text-xs text-muted-foreground mt-0.5">Scan to open this remote on your phone</p>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div
        className="w-48 h-48 mx-auto rounded-xl overflow-hidden bg-background p-2 border border-border"
        dangerouslySetInnerHTML={{ __html: qrData.qr }}
      />
      <div className="mt-3 flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
        <code className="text-[11px] text-muted-foreground flex-1 truncate">{qrData.url}</code>
        <a href={qrData.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 flex-shrink-0">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-2">Both devices must be on the same Wi-Fi network</p>
    </motion.div>
  );
}

function SeekBar({
  state, displayTime, progress, setIsScrubbing, setScrubValue, send,
}: {
  state: PlayerState;
  displayTime: number;
  progress: number;
  setIsScrubbing: (v: boolean) => void;
  setScrubValue: (v: number) => void;
  send: (cmd: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="range"
        min={0}
        max={state.duration || 100}
        step={1}
        value={displayTime}
        onMouseDown={() => setIsScrubbing(true)}
        onTouchStart={() => setIsScrubbing(true)}
        onChange={e => setScrubValue(Number(e.target.value))}
        onMouseUp={e => {
          const val = Number((e.target as HTMLInputElement).value);
          send({ type: 'seek', position: val });
          setIsScrubbing(false);
        }}
        onTouchEnd={e => {
          const val = Number((e.target as HTMLInputElement).value);
          send({ type: 'seek', position: val });
          setIsScrubbing(false);
        }}
        className="w-full h-2 rounded-full accent-primary cursor-pointer"
        style={{
          background: `linear-gradient(to right, hsl(var(--primary)) ${progress * 100}%, hsl(var(--muted)) ${progress * 100}%)`,
        }}
      />
      <div className="flex justify-between text-xs text-muted-foreground font-mono">
        <span>{formatTime(displayTime)}</span>
        <span>{formatTime(state.duration)}</span>
      </div>
    </div>
  );
}

function VolumeControl({ state, send }: { state: PlayerState; send: (cmd: Record<string, unknown>) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => { haptic(20); send({ type: 'volume', level: state.volume === 0 ? 0.5 : 0 }); }}>
        {state.volume === 0
          ? <VolumeX className="w-4 h-4 text-muted-foreground" />
          : <Volume2 className="w-4 h-4 text-muted-foreground" />
        }
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={state.volume}
        onChange={e => send({ type: 'volume', level: Number(e.target.value) })}
        className="flex-1 h-1.5 rounded-full accent-primary cursor-pointer"
        style={{
          background: `linear-gradient(to right, hsl(var(--primary)) ${state.volume * 100}%, hsl(var(--muted)) ${state.volume * 100}%)`,
        }}
      />
      <span className="text-xs text-muted-foreground w-8 text-right font-mono">
        {Math.round(state.volume * 100)}%
      </span>
    </div>
  );
}

function ControlBtn({
  onClick, label, size, children,
}: {
  onClick: () => void;
  label?: string;
  size: 'md' | 'lg';
  children: React.ReactNode;
}) {
  const sz = size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground active:scale-95 transition-all"
    >
      <div className={`${sz} rounded-full bg-card border border-border flex items-center justify-center`}>
        {children}
      </div>
      {label && <span className="text-[10px]">{label}</span>}
    </button>
  );
}

function PillBtn({
  onClick, active, title, children,
}: {
  onClick: () => void;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium active:scale-95 transition-all ${
        active
          ? 'bg-primary/20 border-primary/40 text-primary'
          : 'bg-card border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function SpeedPicker({
  speed, show, setShow, onSelect,
}: {
  speed: number;
  show: boolean;
  setShow: (v: boolean) => void;
  onSelect: (s: number) => void;
}) {
  return (
    <div className="relative">
      <PillBtn onClick={() => setShow(!show)}>
        <Zap className="w-3.5 h-3.5" />
        {speed}×
      </PillBtn>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-10"
          >
            {SPEEDS.map(s => (
              <button
                key={s}
                onClick={() => { onSelect(s); setShow(false); }}
                className={`block w-full px-5 py-2 text-sm text-left transition-colors ${
                  speed === s ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground hover:bg-accent/10'
                }`}
              >
                {s}×
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Cast session panel ────────────────────────────────────────────────────────

function CastPanel({
  cast, send, onClose,
}: {
  cast: CastSessionInfo;
  send: (cmd: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const progress = (cast.duration ?? 0) > 0
    ? ((cast.currentTime ?? 0) / (cast.duration ?? 1)) * 100
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="w-full bg-card border border-border rounded-2xl p-4 shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Tv2 className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-sm font-semibold text-foreground">
            Casting{cast.deviceName ? ` · ${cast.deviceName}` : ' to TV'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Progress bar */}
      {(cast.duration ?? 0) > 0 && (
        <div className="mb-3">
          <input
            type="range"
            min={0}
            max={cast.duration ?? 100}
            step={1}
            value={cast.currentTime ?? 0}
            onChange={e => {
              haptic(20);
              send({ type: 'cast_seek', position: Number(e.target.value) });
            }}
            className="w-full h-2 rounded-full accent-primary cursor-pointer"
            style={{
              background: `linear-gradient(to right, hsl(var(--primary)) ${progress}%, hsl(var(--muted)) ${progress}%)`,
            }}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-1">
            <span>{formatTime(cast.currentTime ?? 0)}</span>
            <span>{formatTime(cast.duration ?? 0)}</span>
          </div>
        </div>
      )}

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-4 mb-4">
        <button
          onClick={() => { haptic(30); send({ type: 'cast_playpause' }); }}
          className="w-12 h-12 rounded-full bg-primary hover:bg-primary/90 active:scale-95 flex items-center justify-center shadow-md shadow-primary/30 transition-all"
        >
          {cast.isPaused
            ? <Play className="w-5 h-5 text-primary-foreground fill-primary-foreground ml-0.5" />
            : <Pause className="w-5 h-5 text-primary-foreground fill-primary-foreground" />
          }
        </button>
        <button
          onClick={() => { haptic([30, 20, 30]); send({ type: 'cast_stop' }); }}
          className="w-10 h-10 rounded-full bg-card border border-border hover:bg-destructive/10 hover:border-destructive/40 active:scale-95 flex items-center justify-center transition-all"
          title="Stop casting"
        >
          <Square className="w-4 h-4 text-muted-foreground fill-muted-foreground" />
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { haptic(20); send({ type: 'cast_volume', level: (cast.muted || (cast.volume ?? 1) === 0) ? 0.5 : 0 }); }}
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          {(cast.muted || (cast.volume ?? 1) === 0)
            ? <VolumeX className="w-4 h-4" />
            : <Volume2 className="w-4 h-4" />
          }
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={cast.muted ? 0 : (cast.volume ?? 1)}
          onChange={e => send({ type: 'cast_volume', level: Number(e.target.value) })}
          className="flex-1 h-1.5 rounded-full accent-primary cursor-pointer"
          style={{
            background: `linear-gradient(to right, hsl(var(--primary)) ${(cast.muted ? 0 : (cast.volume ?? 1)) * 100}%, hsl(var(--muted)) ${(cast.muted ? 0 : (cast.volume ?? 1)) * 100}%)`,
          }}
        />
        <span className="text-[10px] text-muted-foreground w-7 text-right font-mono flex-shrink-0">
          {cast.muted ? '0%' : `${Math.round((cast.volume ?? 1) * 100)}%`}
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground/50 text-center mt-3">
        Volume controls your TV via HDMI-CEC
      </p>
    </motion.div>
  );
}

// ── Landscape controls panel ──────────────────────────────────────────────────

function LandscapeControls({
  state, displayTime, progress, setIsScrubbing, setScrubValue,
  showSpeedPicker, setShowSpeedPicker, hasSubtitles, subtitleActive,
  screenCount, qrData, showQr, setShowQr, showCastPanel, setShowCastPanel,
  send, sendHaptic, cycleSubtitle,
}: {
  state: PlayerState;
  displayTime: number;
  progress: number;
  setIsScrubbing: (v: boolean) => void;
  setScrubValue: (v: number) => void;
  showSpeedPicker: boolean;
  setShowSpeedPicker: (v: boolean) => void;
  hasSubtitles: boolean;
  subtitleActive: boolean;
  screenCount: number;
  qrData: { url: string; qr: string } | null;
  showQr: boolean;
  setShowQr: (v: boolean) => void;
  showCastPanel: boolean;
  setShowCastPanel: (v: boolean | ((prev: boolean) => boolean)) => void;
  send: (cmd: Record<string, unknown>) => void;
  sendHaptic: (cmd: Record<string, unknown>, pattern?: number | number[]) => void;
  cycleSubtitle: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 h-full justify-between py-2">
      {/* Title + status */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Now Playing</p>
          <p className="text-foreground font-semibold text-base leading-tight line-clamp-2">{state.title}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {qrData && (
            <button onClick={() => setShowQr(!showQr)} className="w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground">
              <QrCode className="w-3.5 h-3.5" />
            </button>
          )}
          <StatusBadge status="connected" screenCount={screenCount} />
        </div>
      </div>

      {/* Seek bar */}
      <SeekBar
        state={state}
        displayTime={displayTime}
        progress={progress}
        setIsScrubbing={setIsScrubbing}
        setScrubValue={setScrubValue}
        send={send}
      />

      {/* Main controls */}
      <div className="flex items-center justify-center gap-5">
        <ControlBtn onClick={() => sendHaptic({ type: 'skip_back', seconds: 10 })} label="−10s" size="md">
          <SkipBack className="w-5 h-5" />
        </ControlBtn>
        <button
          onClick={() => sendHaptic({ type: state.paused ? 'play' : 'pause' }, [30, 20, 30])}
          className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90 active:scale-95 flex items-center justify-center shadow-lg shadow-primary/30 transition-all"
        >
          {state.paused
            ? <Play className="w-7 h-7 text-primary-foreground fill-primary-foreground ml-1" />
            : <Pause className="w-7 h-7 text-primary-foreground fill-primary-foreground" />
          }
        </button>
        <ControlBtn onClick={() => sendHaptic({ type: 'skip_forward', seconds: 10 })} label="+10s" size="md">
          <SkipForward className="w-5 h-5" />
        </ControlBtn>
      </div>

      {/* Secondary + volume */}
      <div className="flex flex-wrap items-center gap-2">
        <PillBtn onClick={() => sendHaptic({ type: 'skip_intro' })}>
          <FastForward className="w-3.5 h-3.5" /> Skip Intro
        </PillBtn>
        {state.hasNextEpisode && (
          <PillBtn onClick={() => sendHaptic({ type: 'next_episode' })}>
            Next Ep <ChevronRight className="w-3.5 h-3.5" />
          </PillBtn>
        )}
        {hasSubtitles && (
          <PillBtn onClick={cycleSubtitle} active={subtitleActive}>
            <Subtitles className="w-3.5 h-3.5" />
            {subtitleActive
              ? (state.subtitleTracks?.find(t => t.index === state.activeSubtitle)?.label ?? 'CC')
              : 'CC'}
          </PillBtn>
        )}
        <SpeedPicker
          speed={state.speed}
          show={showSpeedPicker}
          setShow={setShowSpeedPicker}
          onSelect={s => sendHaptic({ type: 'speed', rate: s })}
        />
        <PillBtn onClick={() => sendHaptic({ type: 'fullscreen' })}>
          <Maximize2 className="w-3.5 h-3.5" />
        </PillBtn>
        <PillBtn
          onClick={() => {
            haptic(30);
            if (state.cast?.active) {
              setShowCastPanel(v => !v);
            } else {
              send({ type: 'cast' });
            }
          }}
          active={state.cast?.active || showCastPanel}
          title={state.cast?.active ? 'Manage cast session' : 'Cast to Chromecast'}
        >
          <Cast className="w-3.5 h-3.5" />
          {state.cast?.active ? 'Casting' : 'Cast'}
        </PillBtn>
      </div>

      {/* Cast session panel */}
      <AnimatePresence>
        {showCastPanel && state.cast?.active && (
          <CastPanel
            cast={state.cast}
            send={send}
            onClose={() => setShowCastPanel(false)}
          />
        )}
      </AnimatePresence>

      <VolumeControl state={state} send={send} />
    </div>
  );
}
