/**
 * SubscriptionsPage — /subscriptions
 *
 * Manage all auto-download show subscriptions in one place.
 * Shows each subscribed show with:
 *   - Poster, title, season count
 *   - Schedule selector (daily / every 3 days / weekly / every 2 weeks)
 *   - Last checked + next check timestamps
 *   - Enable/pause toggle
 *   - "Check now" button
 *   - Unsubscribe button
 *
 * Empty state guides the user to the library to subscribe to shows.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell, BellOff, RefreshCw, Trash2, Library,
  Calendar, Clock, CheckCircle2, AlertCircle, Loader2,
  ChevronDown, Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Helmet } from '@dr.pogodin/react-helmet';

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckSchedule = 'daily' | 'every3days' | 'weekly' | 'every2weeks';

const SCHEDULE_LABELS: Record<CheckSchedule, string> = {
  daily:       'Every day',
  every3days:  'Every 3 days',
  weekly:      'Every week',
  every2weeks: 'Every 2 weeks',
};

interface ShowSubscription {
  id: string;
  imdbId: string;
  title: string;
  poster?: string;
  totalSeasons: number;
  schedule: CheckSchedule;
  enabled: boolean;
  createdAt: string;
  lastCheckedAt?: string;
  lastFoundEpisode?: { season: number; episode: number };
  nextCheckAt?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(iso?: string): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatFuture(iso?: string): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Due now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `in ${days}d`;
}

// ── Poster ────────────────────────────────────────────────────────────────────

function Poster({ src, title }: { src?: string; title: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted rounded-lg">
        <Play className="w-6 h-6 text-muted-foreground/40" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={title}
      className="w-full h-full object-cover rounded-lg"
      onError={() => setErr(true)}
    />
  );
}

// ── Subscription Card ─────────────────────────────────────────────────────────

interface CardProps {
  sub: ShowSubscription;
  onToggle: (imdbId: string) => Promise<void>;
  onScheduleChange: (imdbId: string, schedule: CheckSchedule) => Promise<void>;
  onCheckNow: (imdbId: string) => Promise<void>;
  onUnsubscribe: (imdbId: string) => Promise<void>;
}

function SubscriptionCard({ sub, onToggle, onScheduleChange, onCheckNow, onUnsubscribe }: CardProps) {
  const [checking, setChecking] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    try {
      await onCheckNow(sub.imdbId);
    } finally {
      setChecking(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      await onToggle(sub.imdbId);
    } finally {
      setToggling(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className={`bg-card border rounded-xl overflow-hidden transition-colors ${
        sub.enabled ? 'border-border' : 'border-border/40 opacity-60'
      }`}
    >
      <div className="flex gap-4 p-4">
        {/* Poster */}
        <div className="w-16 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
          <Poster src={sub.poster} title={sub.title} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={`/show/${sub.imdbId}`}
                className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate block"
              >
                {sub.title}
              </Link>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sub.totalSeasons} Season{sub.totalSeasons !== 1 ? 's' : ''}
                {sub.lastFoundEpisode && (
                  <span className="ml-2 text-primary/80">
                    · Up to S{sub.lastFoundEpisode.season}E{sub.lastFoundEpisode.episode}
                  </span>
                )}
              </p>
            </div>

            {/* Enable/disable toggle */}
            <button
              onClick={handleToggle}
              disabled={toggling}
              title={sub.enabled ? 'Pause auto-download' : 'Resume auto-download'}
              className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                sub.enabled
                  ? 'text-primary hover:bg-primary/10'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {toggling
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : sub.enabled
                  ? <Bell className="w-4 h-4" />
                  : <BellOff className="w-4 h-4" />
              }
            </button>
          </div>

          {/* Schedule selector */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Select
              value={sub.schedule}
              onValueChange={v => onScheduleChange(sub.imdbId, v as CheckSchedule)}
            >
              <SelectTrigger className="h-7 text-xs w-36 bg-muted border-0">
                <Calendar className="w-3 h-3 mr-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(SCHEDULE_LABELS) as [CheckSchedule, string][]).map(([val, label]) => (
                  <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              onClick={handleCheck}
              disabled={checking}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
            >
              {checking
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />
              }
              {checking ? 'Checking…' : 'Check now'}
            </button>

            <button
              onClick={() => onUnsubscribe(sub.imdbId)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-destructive/70 hover:text-destructive bg-muted hover:bg-destructive/10 rounded-lg transition-colors ml-auto"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          </div>

          {/* Timestamps */}
          <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Checked {formatRelative(sub.lastCheckedAt)}
            </span>
            {sub.enabled && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Next {formatFuture(sub.nextCheckAt)}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-24 text-center px-6"
    >
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Bell className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">No subscriptions yet</h2>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        Subscribe to a TV show and HomeStream will automatically download new episodes as they air.
      </p>
      <Button asChild>
        <Link to="/library">
          <Library className="w-4 h-4 mr-2" />
          Browse My Library
        </Link>
      </Button>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<ShowSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/subscriptions', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { subscriptions: ShowSubscription[] };
      setSubs(data.subscriptions ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = async (imdbId: string) => {
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imdbId, action: 'toggle' }),
      });
      const data = await res.json() as { enabled: boolean };
      setSubs(prev => prev.map(s =>
        s.imdbId === imdbId ? { ...s, enabled: data.enabled } : s
      ));
      toast.success(data.enabled ? 'Auto-download resumed' : 'Auto-download paused');
    } catch {
      toast.error('Failed to update subscription');
    }
  };

  const handleScheduleChange = async (imdbId: string, schedule: CheckSchedule) => {
    const sub = subs.find(s => s.imdbId === imdbId);
    if (!sub) return;
    try {
      await fetch('/api/subscriptions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imdbId,
          title: sub.title,
          poster: sub.poster,
          totalSeasons: sub.totalSeasons,
          schedule,
          enabled: sub.enabled,
        }),
      });
      setSubs(prev => prev.map(s =>
        s.imdbId === imdbId ? { ...s, schedule } : s
      ));
      toast.success(`Schedule updated to ${SCHEDULE_LABELS[schedule].toLowerCase()}`);
    } catch {
      toast.error('Failed to update schedule');
    }
  };

  const handleCheckNow = async (imdbId: string) => {
    try {
      const res = await fetch(`/api/subscriptions/${imdbId}/check`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json() as { message: string };
      toast.success(data.message ?? 'Check complete');
      // Refresh to pick up updated lastCheckedAt
      await load();
    } catch {
      toast.error('Check failed — try again');
    }
  };

  const handleUnsubscribe = async (imdbId: string) => {
    const sub = subs.find(s => s.imdbId === imdbId);
    try {
      await fetch('/api/subscriptions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imdbId, action: 'unsubscribe' }),
      });
      setSubs(prev => prev.filter(s => s.imdbId !== imdbId));
      toast.success(`Unsubscribed from ${sub?.title ?? 'show'}`);
    } catch {
      toast.error('Failed to unsubscribe');
    }
  };

  const enabledCount = subs.filter(s => s.enabled).length;

  return (
    <>
      <Helmet>
        <title>My Shows — HomeStream</title>
        <meta name="description" content="Manage your auto-download subscriptions for TV shows." />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Bell className="w-6 h-6 text-primary" />
                My Shows
              </h1>
              {subs.length > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {enabledCount} of {subs.length} active
                </p>
              )}
            </div>
            {subs.length > 0 && (
              <Button variant="outline" size="sm" onClick={load} className="gap-2">
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </Button>
            )}
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
              <p className="text-sm text-muted-foreground">Failed to load subscriptions</p>
              <Button variant="outline" size="sm" onClick={load}>Try again</Button>
            </div>
          ) : subs.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-3">
              <AnimatePresence mode="popLayout">
                {subs.map(sub => (
                  <SubscriptionCard
                    key={sub.imdbId}
                    sub={sub}
                    onToggle={handleToggle}
                    onScheduleChange={handleScheduleChange}
                    onCheckNow={handleCheckNow}
                    onUnsubscribe={handleUnsubscribe}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
