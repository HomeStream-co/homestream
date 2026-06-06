import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Activity, RefreshCw, Loader2, Filter, Download, Play, Upload, Settings2, Trash2, Zap } from 'lucide-react';

type ActivityType = 'stream' | 'download' | 'upload' | 'transcode' | 'settings' | 'delete' | 'enrich' | 'system';

interface ActivityEntry {
  id: string;
  type: ActivityType;
  message: string;
  detail?: string;
  timestamp: string;
  level?: 'info' | 'warn' | 'error';
}

function typeIcon(type: ActivityType) {
  switch (type) {
    case 'stream':    return <Play className="w-3.5 h-3.5 text-primary" />;
    case 'download':  return <Download className="w-3.5 h-3.5 text-blue-400" />;
    case 'upload':    return <Upload className="w-3.5 h-3.5 text-green-400" />;
    case 'transcode': return <Zap className="w-3.5 h-3.5 text-yellow-400" />;
    case 'settings':  return <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />;
    case 'delete':    return <Trash2 className="w-3.5 h-3.5 text-destructive" />;
    case 'enrich':    return <Zap className="w-3.5 h-3.5 text-purple-400" />;
    default:          return <Activity className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function levelColor(level?: string): string {
  if (level === 'error') return 'border-l-destructive bg-destructive/5';
  if (level === 'warn')  return 'border-l-yellow-500 bg-yellow-500/5';
  return 'border-l-border bg-card';
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

const ALL_TYPES: ActivityType[] = ['stream', 'download', 'upload', 'transcode', 'settings', 'delete', 'enrich', 'system'];

export default function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all');
  const [levelFilter, setLevelFilter] = useState<'all' | 'warn' | 'error'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/activity?limit=200', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as ActivityEntry[];
        setEntries(data);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity();
    if (!autoRefresh) return;
    const interval = setInterval(fetchActivity, 5000);
    return () => clearInterval(interval);
  }, [fetchActivity, autoRefresh]);

  const filtered = entries.filter(e => {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    if (levelFilter !== 'all' && e.level !== levelFilter) return false;
    return true;
  });

  // Group by day
  const grouped: { label: string; entries: ActivityEntry[] }[] = [];
  for (const entry of filtered) {
    const label = new Date(entry.timestamp).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    const last = grouped[grouped.length - 1];
    if (last?.label === label) last.entries.push(entry);
    else grouped.push({ label, entries: [entry] });
  }

  return (
    <>
      <Helmet>
        <title>Activity Log — HomeStream</title>
        <meta name="description" content="Server activity and event log." />
      </Helmet>

      <div className="pt-20 pb-16 px-4 sm:px-6 lg:px-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-heading text-foreground">Activity Log</h1>
              <p className="text-xs text-muted-foreground">{entries.length} events</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${autoRefresh ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
            >
              <Activity className="w-3.5 h-3.5" />
              {autoRefresh ? 'Live' : 'Paused'}
            </button>
            <button onClick={fetchActivity} className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter:</span>
          </div>
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setTypeFilter('all')} className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${typeFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/40'}`}>All</button>
            {ALL_TYPES.map(t => (
              <button key={t} onClick={() => setTypeFilter(t)} className={`px-2.5 py-1 rounded-full text-xs border capitalize transition-colors ${typeFilter === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/40'}`}>{t}</button>
            ))}
          </div>
          <div className="flex rounded-xl overflow-hidden border border-border text-xs ml-auto">
            {(['all', 'warn', 'error'] as const).map(l => (
              <button key={l} onClick={() => setLevelFilter(l)} className={`px-3 py-1.5 capitalize transition-colors ${levelFilter === l ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}>{l}</button>
            ))}
          </div>
        </div>

        {/* Log */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <Activity className="w-10 h-10 opacity-30" />
            <p className="text-sm">No activity yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {grouped.map(group => (
              <div key={group.label}>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.label}</h2>
                <div className="flex flex-col gap-1">
                  {group.entries.map(entry => (
                    <div key={entry.id} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border-l-2 ${levelColor(entry.level)} border border-border/50`}>
                      <div className="flex-shrink-0 mt-0.5">{typeIcon(entry.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{entry.message}</p>
                        {entry.detail && <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{entry.detail}</p>}
                      </div>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0 mt-0.5">{fmtRelative(entry.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
