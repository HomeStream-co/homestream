import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, Send, Film, Sparkles } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ChatMessage, MediaItem } from '@/types/media';
import { useMedia } from '@/context/MediaContext';

const SUGGESTED_PROMPTS = [
  "What should I watch tonight?",
  "Something like what I've been watching",
  "Something scary",
  "A good family movie",
  "I want something funny",
  "Short film — under 90 minutes",
  "Best rated in my library",
  "Something I haven't started yet",
];

// Provider label map — matches what the backend returns in `provider`
const PROVIDER_LABELS: Record<string, { label: string; color: string }> = {
  gemini:    { label: 'Gemini',    color: 'text-blue-400' },
  openai:    { label: 'GPT',       color: 'text-green-400' },
  anthropic: { label: 'Claude',    color: 'text-orange-400' },
  ollama:    { label: 'Ollama',    color: 'text-purple-400' },
  fallback:  { label: 'Smart',     color: 'text-muted-foreground' },
};

function genId() {
  return Math.random().toString(36).slice(2);
}

export default function AIChatAssistant() {
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem('homestream-chat');
      if (saved) return JSON.parse(saved);
    } catch { /* sessionStorage unavailable — start fresh */ }
    return [];
  });
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { library, pendingRecommendation, clearPendingRecommendation } = useMedia();
  const navigate  = useNavigate();
  const location  = useLocation();
  const prevPathRef       = useRef(location.pathname);
  const postWatchFiredRef = useRef<string | null>(null);

  // Derive recent watches from the library (items with progress > 5% or a lastWatchedAt)
  const recentWatches = library.filter(
    m => (m.watchProgress ?? 0) > 5 || (m as MediaItem & { lastWatchedAt?: string }).lastWatchedAt
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    try {
      sessionStorage.setItem('homestream-chat', JSON.stringify(messages.slice(-20)));
    } catch { /* quota exceeded — non-fatal */ }
  }, [messages]);

  // Post-watch recommendation trigger
  useEffect(() => {
    const prevPath    = prevPathRef.current;
    const currentPath = location.pathname;
    prevPathRef.current = currentPath;

    const leftPlayer = prevPath.startsWith('/player/') && !currentPath.startsWith('/player/');
    if (leftPlayer && pendingRecommendation && postWatchFiredRef.current !== pendingRecommendation) {
      const finishedItem = library.find(m => m.id === pendingRecommendation);
      if (finishedItem) {
        postWatchFiredRef.current = pendingRecommendation;
        clearPendingRecommendation();
        setTimeout(() => {
          setOpen(true);
          sendMessage(`I just finished watching "${finishedItem.title}". What should I watch next from my library?`);
        }, 800);
      }
    }
  }, [location.pathname, pendingRecommendation, library, clearPendingRecommendation]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: genId(), role: 'user', content: text, timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Build history in Gemini-compatible format (works for all providers server-side)
      const history = messages
        .filter(m => m.content)
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'model' as 'user' | 'model',
          parts: [{ text: m.content }],
        }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, library, history, recentWatches }),
      });

      const data = await res.json() as {
        reply: string;
        suggestions?: MediaItem[];
        provider?: string;
      };

      if (data.provider) setActiveProvider(data.provider);

      const aiMsg: ChatMessage = {
        id: genId(),
        role: 'assistant',
        content: data.reply,
        suggestions: data.suggestions,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: genId(), role: 'assistant',
        content: "Sorry, I had trouble connecting. Try again!",
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [library, recentWatches, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Programmatic open+message (e.g. from player "Ask AI" button)
  useEffect(() => {
    const handler = (e: Event) => {
      const { message } = (e as CustomEvent<{ message: string }>).detail;
      setOpen(true);
      setTimeout(() => sendMessage(message), 300);
    };
    window.addEventListener('homestream:open-chat', handler);
    return () => window.removeEventListener('homestream:open-chat', handler);
  }, [sendMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const providerMeta = activeProvider ? PROVIDER_LABELS[activeProvider] : null;

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-primary hover:bg-primary/80 text-white px-4 py-3 rounded-full shadow-2xl transition-colors"
          >
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium">Ask AI</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 w-[390px] max-w-[calc(100vw-2rem)] h-[580px] max-h-[calc(100vh-5rem)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">What should I watch?</p>
                    {providerMeta && (
                      <span className={`text-[10px] font-medium ${providerMeta.color}`}>
                        via {providerMeta.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {recentWatches.length > 0
                      ? `Knows your ${recentWatches.length} recent watch${recentWatches.length !== 1 ? 'es' : ''} · library only`
                      : 'Picks from your library only'}
                  </p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.length === 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary flex-shrink-0 flex items-center justify-center self-start mt-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="bg-secondary rounded-2xl rounded-tl-sm px-3 py-2.5 max-w-[85%]">
                      {recentWatches.length > 0 ? (
                        <>
                          <p className="text-sm text-foreground">
                            I can see you've been watching{' '}
                            <strong>{recentWatches.slice(0, 2).map(m => m.title).join(' and ')}</strong>
                            {recentWatches.length > 2 ? ` and ${recentWatches.length - 2} more` : ''}.
                            Tell me what you're in the mood for and I'll find the perfect next pick.
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            I only suggest titles you already have — powered by your TMDB &amp; OMDB data.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-foreground">
                            Hey! Tell me what you're in the mood for and I'll find the perfect pick from your library.
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            I only suggest titles you already have — no spoilers, no fluff.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 mt-1">
                    <p className="text-xs text-muted-foreground px-1">Try asking:</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SUGGESTED_PROMPTS.map(prompt => (
                        <button
                          key={prompt}
                          onClick={() => sendMessage(prompt)}
                          className="text-left text-xs bg-secondary hover:bg-secondary/70 text-foreground px-2.5 py-2 rounded-xl transition-colors leading-tight"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-primary flex-shrink-0 flex items-center justify-center self-end">
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[85%] flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`px-3 py-2 rounded-2xl text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-white rounded-tr-sm'
                        : 'bg-secondary text-foreground rounded-tl-sm'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
                    </div>
                    {/* Suggestion cards */}
                    {msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="flex flex-col gap-1.5 w-full">
                        {msg.suggestions.map((item: MediaItem) => (
                          <button
                            key={item.id}
                            onClick={() => navigate(`/player/${item.id}`)}
                            className="flex items-center gap-2.5 bg-background hover:bg-secondary border border-border rounded-xl p-2.5 transition-colors text-left group"
                          >
                            {item.poster ? (
                              <img
                                src={item.poster}
                                alt={item.title}
                                className="w-9 h-13 object-cover rounded flex-shrink-0"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-9 h-13 bg-muted rounded flex-shrink-0 flex items-center justify-center">
                                <Film className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">{item.title}</p>
                              <p className="text-[10px] text-muted-foreground">{item.year} · {(item.genre ?? [])[0]}</p>
                              {item.imdbRating && item.imdbRating !== 'N/A' && (
                                <p className="text-[10px] text-yellow-400 mt-0.5">★ {item.imdbRating}</p>
                              )}
                            </div>
                            <MessageCircle className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary flex-shrink-0 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-secondary rounded-2xl rounded-tl-sm px-3 py-2">
                    <div className="flex gap-1 items-center h-4">
                      {[0, 1, 2].map(i => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                          animate={{ y: [0, -4, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-3 border-t border-border flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="What are you in the mood for?"
                className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-xl bg-primary hover:bg-primary/80 disabled:opacity-40 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
