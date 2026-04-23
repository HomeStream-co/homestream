/**
 * SearchTab — keyboard + voice search for the phone remote.
 * Extracted from remote.tsx for maintainability.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, Mic, Film, Star, Tv2 } from 'lucide-react';
import type { LibraryItem } from './types';

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

function haptic(pattern: number | number[] = 30) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

interface SearchTabProps {
  send: (cmd: Record<string, unknown>) => void;
}

export default function SearchTab({ send }: SearchTabProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LibraryItem[]>([]);
  const [allItems, setAllItems] = useState<LibraryItem[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [interimText, setInterimText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    fetch('/api/media')
      .then(r => r.json())
      .then((data: LibraryItem[]) => setAllItems(Array.isArray(data) ? data : []))
      .catch(() => {});
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

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

      {voiceSupported && !listening && !query && (
        <p className="text-xs text-muted-foreground text-center">
          Hold the mic button and say a title, genre, or actor name
        </p>
      )}

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
