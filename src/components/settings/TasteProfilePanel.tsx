/**
 * Settings → Taste Profile
 *
 * Shows the user what the AI has learned about their taste:
 *   - Top genres, directors, actors, decades
 *   - Recent watch history
 *   - A "Reset taste data" button
 */
import { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, Trash2, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ProfileEntry {
  value:      string;
  score:      number;
  eventCount: number;
}

interface TasteProfileData {
  profile: Record<string, ProfileEntry[]>;
  summary: string;
  recentHistory: {
    mediaId:     string;
    mediaTitle:  string;
    eventType:   string;
    progressPct: number;
    genres:      string[];
    createdAt:   string;
  }[];
  totalEvents: number;
}

function ScoreBar({ score }: { score: number }) {
  // score is roughly -4 to +4; normalise to 0–100
  const pct = Math.max(0, Math.min(100, ((score + 4) / 8) * 100));
  const color = score > 1 ? 'bg-green-500' : score < -0.5 ? 'bg-red-500' : 'bg-yellow-500';
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-medium w-8 text-right ${score > 1 ? 'text-green-400' : score < -0.5 ? 'text-red-400' : 'text-yellow-400'}`}>
        {score > 0 ? '+' : ''}{score.toFixed(1)}
      </span>
    </div>
  );
}

function ScoreIcon({ score }: { score: number }) {
  if (score > 1)    return <TrendingUp   className="w-3 h-3 text-green-400 flex-shrink-0" />;
  if (score < -0.5) return <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />;
  return <Minus className="w-3 h-3 text-yellow-400 flex-shrink-0" />;
}

const EVENT_LABELS: Record<string, string> = {
  complete:    'Finished',
  play:        'Watched',
  pause:       'Paused',
  skip:        'Skipped',
  rate:        'Rated',
  thumbs_up:   'Liked',
  thumbs_down: 'Disliked',
};

export default function TasteProfilePanel() {
  const [data,    setData]    = useState<TasteProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<'genres' | 'directors' | 'actors' | 'decades' | 'history'>('genres');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/taste/profile?profileId=default', { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const totalEvents = data?.totalEvents ?? 0;
  const hasData     = totalEvents > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <p className="text-sm font-semibold text-foreground">No taste data yet</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Watch a few movies or shows and HomeStream will start learning what you like. The more you watch, the smarter the recommendations get.
        </p>
      </div>
    );
  }

  const TABS = [
    { id: 'genres'    as const, label: 'Genres',    key: 'genre'    },
    { id: 'directors' as const, label: 'Directors', key: 'director' },
    { id: 'actors'    as const, label: 'Actors',    key: 'actor'    },
    { id: 'decades'   as const, label: 'Decades',   key: 'decade'   },
    { id: 'history'   as const, label: 'History',   key: ''         },
  ];

  const currentKey = TABS.find(t => t.id === tab)?.key ?? '';
  const entries    = (data?.profile[currentKey] ?? []).sort((a, b) => b.score - a.score);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Your Taste Profile</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Built from {totalEvents} watch event{totalEvents !== 1 ? 's' : ''} — updates automatically as you watch
          </p>
        </div>
        <button onClick={load} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/30 rounded-lg p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
              tab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab !== 'history' ? (
        <div className="flex flex-col gap-2">
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No {tab} data yet — keep watching!
            </p>
          ) : (
            entries.slice(0, 15).map((entry, i) => (
              <div key={i} className="flex items-center gap-3">
                <ScoreIcon score={entry.score} />
                <span className="text-xs text-foreground w-36 truncate flex-shrink-0">{entry.value}</span>
                <ScoreBar score={entry.score} />
                <span className="text-[10px] text-muted-foreground flex-shrink-0 w-16 text-right">
                  {entry.eventCount} event{entry.eventCount !== 1 ? 's' : ''}
                </span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
          {(data?.recentHistory ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No history yet</p>
          ) : (
            (data?.recentHistory ?? []).map((h, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                  h.eventType === 'complete' || h.eventType === 'thumbs_up' ? 'bg-green-500/15 text-green-400' :
                  h.eventType === 'skip'     || h.eventType === 'thumbs_down' ? 'bg-red-500/15 text-red-400' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {EVENT_LABELS[h.eventType] ?? h.eventType}
                </span>
                <span className="text-xs text-foreground flex-1 truncate">{h.mediaTitle}</span>
                {h.progressPct > 0 && (
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{Math.round(h.progressPct)}%</span>
                )}
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {new Date(h.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* AI summary */}
      {data?.summary && data.summary !== 'No taste data yet — the user has not watched anything.' && (
        <details className="mt-1">
          <summary className="text-[11px] text-primary cursor-pointer hover:underline">View AI taste summary</summary>
          <pre className="mt-2 text-[10px] text-muted-foreground bg-muted/30 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-48">
            {data.summary}
          </pre>
        </details>
      )}

      {/* Reset */}
      <div className="pt-2 border-t border-border">
        <button
          onClick={async () => {
            if (!confirm('Reset all taste data? This cannot be undone.')) return;
            // TODO: add DELETE /api/taste/profile endpoint
            alert('Taste reset is not yet implemented — coming soon.');
          }}
          className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Reset taste data
        </button>
      </div>
    </div>
  );
}
