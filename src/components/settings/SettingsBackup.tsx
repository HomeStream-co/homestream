import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Database, RotateCcw, Loader2 } from 'lucide-react';
import { SectionHeader } from './shared';

function BackupRestoreButton() {
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    setRestoreResult(null);
    try {
      const text = await file.text();
      const backup = JSON.parse(text) as { version?: number };
      if (backup.version !== 1) throw new Error('Unrecognised backup format (expected version 1)');
      const res = await fetch('/api/backup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backup,
          options: { restoreLibrary: true, restoreProfiles: true, restoreConfig: false },
        }),
      });
      const data = await res.json() as { ok?: boolean; restored?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Restore failed');
      setRestoreResult((data.restored ?? []).join(' · ') || 'Restored successfully');
      toast.success('Backup restored — reload the page to see changes');
    } catch (err) {
      setRestoreResult(`Error: ${String(err)}`);
      toast.error('Restore failed — check the file and try again');
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFile} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={restoring}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-yellow-500/40 hover:bg-yellow-500/5 transition-colors text-left group disabled:opacity-60"
      >
        <div className="w-7 h-7 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-yellow-500/20 transition-colors">
          {restoring
            ? <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
            : <RotateCcw className="w-4 h-4 text-yellow-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">
            {restoring ? 'Restoring…' : 'Restore from Backup'}
          </p>
          <p className="text-[11px] text-muted-foreground">Select a homestream-backup-*.json file</p>
        </div>
      </button>
      {restoreResult && (
        <p className={`text-[11px] mt-1.5 px-1 leading-snug ${restoreResult.startsWith('Error') ? 'text-destructive' : 'text-green-400'}`}>
          {restoreResult}
        </p>
      )}
      <p className="text-[10px] text-muted-foreground/60 mt-1.5 px-1">
        API keys and passwords are never exported or restored — re-enter them after a restore.
      </p>
    </div>
  );
}

export default function SettingsBackup() {
  return (
    <div className="border-t border-border/50">
      <SectionHeader icon={Database} label="Backup &amp; Restore" />
      <div className="px-4 pb-4 space-y-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Export your entire library, profiles, and settings to a single JSON file. Restore it on
          any HomeStream instance. Passwords and API keys are never included.
        </p>
        <a
          href="/api/backup"
          download
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
          onClick={() => toast.success('Backup download started')}
        >
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
            <Database className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-tight">Export Backup</p>
            <p className="text-[11px] text-muted-foreground">Downloads homestream-backup-YYYY-MM-DD.json</p>
          </div>
        </a>
        <BackupRestoreButton />
      </div>
    </div>
  );
}
