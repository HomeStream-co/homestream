import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Download, RefreshCw, Pause, Play, X,
  CheckCircle2, AlertCircle, Loader2, Clock, HardDrive,
  Search, ChevronDown, Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

type DownloadStatus = 'downloading' | 'queued' | 'paused' | 'completed' | 'error' | 'seeding';

interface DownloadJob {
  id: string;
  title: string;
  status: DownloadStatus;
  progress: number;
  size: number;
  downloaded: number;
  speed: number;
  eta: number;
  seeds: number;
  peers: number;
  addedAt: string;
  error?: string;
  savePath?: string;
}

function fmtBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB`;
  return `${b} B`;
}

function fmtEta(s: number): string {
  if (!isFinite(s) || s <= 0) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function statusColor(status: DownloadStatus): string {
  if (status === 'downloading') return 'text-primary';
  if (status === 'completed' || status === 'seeding') return 'text-green-400';
  if (status === 'error') return 'text-destructive';
  if (status === 'paused') return 'text-yellow-400';
  return 'text-muted-foreground';
}

function StatusIcon({ status }: { status: DownloadStatus }) {
  if (status === 'downloading') return <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />;
  if (status === 'completed' || status === 'seeding') return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
  if (status === 'error') return <AlertCircle className="w-3.5 h-3.5 text-destructive" />;
  if (status === 'paused') return <Pause className="w-3.5 h-3.5 text-yellow-400" />;
  if (status === 'queued') return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  return <Download className="w-3.5 h-3.5 text-muted-foreground" />;
}

export default function DownloadsPage() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DownloadStatus | 'all'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/downloads', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as DownloadJob[];
        setJobs(data);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const addDownload = async () => {
    if (!addUrl.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch('/api/downloads', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: addUrl.trim() }),
      });
      if (res.ok) {
        toast.success('Download added');
        setAddUrl('');
        setShowAddForm(false);
        await fetchJobs();
      } else {
        toast.error('Failed to add download');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setAddLoading(false);
    }
  };

  const doAction = async (id: string, action: 'pause' | 'resume' | 'remove') => {
    setActionLoading(id + action);
    try {
      await fetch(`/api/downloads/${id}/${action}`, { method: 'POST', credentials: 'include' });
      await fetchJobs();
      if (action === 'remove') toast.success('Download removed');
    } catch {
      toast.error('Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = jobs.filter(j => {
    if (statusFilter !== 'all' && j.status !== statusFilter) return false;
    if (query && !j.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const active = jobs.filter(j => j.status === 'downloading').length;
  const totalSpeed = jobs.filter(j => j.status === 'downloading').reduce((s, j) => s + j.speed, 0);

  return (
    <>
      <Helmet>
        <title>Downloads — HomeStream</title>
        <meta name="description" content="Manage your media downloads." />
      </Helmet>

      <div className="pt-20 pb-16 px-4 sm:px-6 lg:px-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Download className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-heading text-foreground">Downloads</h1>
              <p className="text-xs text-muted-foreground">
                {active > 0 ? `${active} active · ${fmtBytes(totalSpeed)}/s` : 'No active downloads'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchJobs} className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowAddForm(v => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-semibold rounded-xl transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Download
            </button>
          </div>
        </div>

        {/* Add download form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className="flex gap-2 p-3 rounded-xl border border-border bg-card">
                <input
                  type="text"
                  value={addUrl}
                  onChange={e => setAddUrl(e.target.value)}
                  placeholder="Paste magnet link or torrent URL…"
                  className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
                  onKeyDown={e => { if (e.key === 'Enter') void addDownload(); }}
                />
                <button
                  onClick={addDownload}
                  disabled={!addUrl.trim() || addLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-semibold rounded-xl transition-all disabled:opacity-60"
                >
                  {addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Add
                </button>
                <button onClick={() => setShowAddForm(false)} className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search downloads…"
              className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
            />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as DownloadStatus | 'all')}
              className="appearance-none bg-card border border-border rounded-xl pl-3 pr-8 py-2 text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="downloading">Downloading</option>
              <option value="queued">Queued</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="seeding">Seeding</option>
              <option value="error">Error</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Jobs list */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <Download className="w-10 h-10 opacity-30" />
            <p className="text-sm">{jobs.length === 0 ? 'No downloads yet.' : 'No downloads match your filter.'}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(job => (
              <motion.div
                key={job.id}
                layout
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusIcon status={job.status} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{job.title}</p>
                      <p className={`text-xs font-medium capitalize ${statusColor(job.status)}`}>{job.status}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {job.status === 'downloading' && (
                      <button onClick={() => doAction(job.id, 'pause')} disabled={actionLoading === job.id + 'pause'} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        {actionLoading === job.id + 'pause' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {job.status === 'paused' && (
                      <button onClick={() => doAction(job.id, 'resume')} disabled={actionLoading === job.id + 'resume'} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        {actionLoading === job.id + 'resume' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button onClick={() => doAction(job.id, 'remove')} disabled={actionLoading === job.id + 'remove'} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      {actionLoading === job.id + 'remove' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                {(job.status === 'downloading' || job.status === 'paused') && (
                  <div className="mb-2">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-primary rounded-full"
                        animate={{ width: `${job.progress}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>{job.progress.toFixed(1)}%</span>
                      <span>{fmtBytes(job.downloaded)} / {fmtBytes(job.size)}</span>
                    </div>
                  </div>
                )}

                {/* Stats row */}
                <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                  {job.status === 'downloading' && (
                    <>
                      <span className="flex items-center gap-1"><Download className="w-2.5 h-2.5" />{fmtBytes(job.speed)}/s</span>
                      <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />ETA {fmtEta(job.eta)}</span>
                      <span>{job.seeds} seeds · {job.peers} peers</span>
                    </>
                  )}
                  {job.status === 'completed' && job.savePath && (
                    <span className="flex items-center gap-1"><HardDrive className="w-2.5 h-2.5" />{job.savePath}</span>
                  )}
                  {job.error && <span className="text-destructive">{job.error}</span>}
                  <span className="ml-auto">{new Date(job.addedAt).toLocaleDateString()}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
