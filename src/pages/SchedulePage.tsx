import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { CalendarDays, Plus, RefreshCw, Loader2, Clock, Tv2, Film, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMedia } from '@/context/MediaContext';
import ScheduleModal from '@/components/ScheduleModal';
import type { MediaItem } from '@/types/media';

interface ScheduleEntry {
  id: string;
  mediaId: string;
  scheduledAt: string;
  note?: string;
  repeat?: 'none' | 'daily' | 'weekly';
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((d.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function groupByDay(entries: ScheduleEntry[]): { label: string; date: string; entries: ScheduleEntry[] }[] {
  const map = new Map<string, ScheduleEntry[]>();
  for (const e of entries) {
    const key = new Date(e.scheduledAt).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return [...map.entries()]
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .map(([date, entries]) => ({ label: fmtDay(entries[0].scheduledAt), date, entries }));
}

export default function SchedulePage() {
  const { library } = useMedia();
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState<ScheduleEntry | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/schedule', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as ScheduleEntry[];
        setEntries(data);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const deleteEntry = async (id: string) => {
    await fetch(`/api/schedule/${id}`, { method: 'DELETE', credentials: 'include' });
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const getItem = (mediaId: string): MediaItem | undefined => library.find(m => m.id === mediaId);

  // Week view: 7 days starting from weekOffset * 7 days from today
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() + weekOffset * 7);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekEntries = entries.filter(e => {
    const d = new Date(e.scheduledAt);
    return d >= weekStart && d < weekEnd;
  });

  const grouped = groupByDay(weekEntries);

  return (
    <>
      <Helmet>
        <title>Schedule — HomeStream</title>
        <meta name="description" content="Plan your watch schedule." />
      </Helmet>

      <div className="pt-20 pb-16 px-4 sm:px-6 lg:px-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-heading text-foreground">Watch Schedule</h1>
              <p className="text-xs text-muted-foreground">Plan what to watch and when</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchSchedule} className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setEditEntry(null); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-semibold rounded-xl transition-all"
            >
              <Plus className="w-4 h-4" />
              Schedule
            </button>
          </div>
        </div>

        {/* Week navigator */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 text-center">
            <p className="text-sm font-semibold text-foreground">
              {weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — {new Date(weekEnd.getTime() - 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            {weekOffset === 0 && <p className="text-[10px] text-primary">This week</p>}
          </div>
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="text-xs text-primary hover:underline">Today</button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <CalendarDays className="w-10 h-10 opacity-30" />
            <p className="text-sm">Nothing scheduled this week.</p>
            <button onClick={() => setShowModal(true)} className="text-primary text-xs hover:underline">Add something</button>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {grouped.map(group => (
              <div key={group.date}>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{group.label}</h2>
                <div className="flex flex-col gap-2">
                  {group.entries
                    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                    .map(entry => {
                      const item = getItem(entry.mediaId);
                      return (
                        <div key={entry.id} className="flex items-center gap-4 p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-all group">
                          {item?.poster && (
                            <img src={item.poster} alt={item?.title} className="w-10 h-14 object-cover rounded-lg flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{item?.title ?? entry.mediaId}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{fmtTime(entry.scheduledAt)}</span>
                              {item?.type === 'movie' ? <Film className="w-3 h-3 text-muted-foreground" /> : <Tv2 className="w-3 h-3 text-muted-foreground" />}
                              {entry.repeat && entry.repeat !== 'none' && (
                                <span className="text-[10px] text-primary border border-primary/30 bg-primary/10 px-1.5 py-0.5 rounded-full capitalize">{entry.repeat}</span>
                              )}
                            </div>
                            {entry.note && <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.note}</p>}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditEntry(entry); setShowModal(true); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs">Edit</button>
                            <button onClick={() => deleteEntry(entry.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors text-xs">Remove</button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <ScheduleModal
          open={showModal}
          title={editEntry ? (library.find(m => m.id === editEntry.mediaId)?.title ?? 'Edit Schedule') : 'New Schedule'}
          onClose={() => { setShowModal(false); setEditEntry(null); }}
          onSchedule={async (isoTimestamp) => {
            try {
              const url = editEntry ? `/api/schedule/${editEntry.id}` : '/api/schedule';
              const method = editEntry ? 'PUT' : 'POST';
              await fetch(url, {
                method,
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scheduledAt: isoTimestamp }),
              });
              setShowModal(false);
              setEditEntry(null);
              fetchSchedule();
            } catch { /* ignore */ }
          }}
        />
      )}
    </>
  );
}
