/**
 * ScheduleModal — stub for scheduling a download at a future time.
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CalendarClock, Loader2 } from 'lucide-react';

interface ScheduleModalProps {
  open: boolean;
  onClose: () => void;
  onSchedule: (isoTimestamp: string) => void;
  title: string;
  loading?: boolean;
}

export default function ScheduleModal({ open, onClose, onSchedule, title, loading = false }: ScheduleModalProps) {
  const [datetime, setDatetime] = useState('');

  const handleConfirm = () => {
    if (!datetime) return;
    onSchedule(new Date(datetime).toISOString());
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            Schedule Download
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1 truncate">{title}</p>
        </DialogHeader>
        <div className="py-2">
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Download at</label>
          <input
            type="datetime-local"
            value={datetime}
            onChange={e => setDatetime(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={loading || !datetime}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scheduling…</> : <><CalendarClock className="w-4 h-4 mr-2" />Schedule</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
