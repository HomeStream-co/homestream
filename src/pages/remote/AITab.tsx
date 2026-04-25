/**
 * AITab — AI recommendation chat for the phone remote.
 * Extracted from remote.tsx for maintainability.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Film, Tv2, Loader2, Sparkles, Mic, Send } from 'lucide-react';
import type { LibraryItem } from './types';
import { remoteAuthHeaders } from './types';

function haptic(pattern: number | number[] = 30) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

interface AIChatMessage {
  role: 'user' | 'ai';
  text: string;
  recommendations?: LibraryItem[];
}

interface AITabProps {
  send: (cmd: Record<string, unknown>) => void;
}

const QUICK_PROMPTS = [
  "What's good for tonight?",
  "Something for the whole family",
  "Best thriller in my library",
  "Short movie under 90 min",
];

export default function AITab({ send }: AITabProps) {
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
    fetch('/api/media', { headers: remoteAuthHeaders() })
      .then(r => r.json())
      .then((data: LibraryItem[]) => setLibrary(Array.isArray(data) ? data : []))
      .catch(() => {}); // non-fatal — ignore
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    haptic(20);
    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    setLoading(true);

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
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...remoteAuthHeaders() },
        body: JSON.stringify({ message: text, library: libraryPayload, history: historyRef.current }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      const reply = data.reply ?? data.error ?? 'Sorry, something went wrong.';
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', parts: [{ text }] },
        { role: 'model', parts: [{ text: reply }] },
      ];
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

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-0">
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
