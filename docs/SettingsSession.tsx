import { LogOut, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import type { ConfirmDialogState } from './shared';

interface SettingsSessionProps {
  onOpenConfirm: (state: Omit<ConfirmDialogState, 'open'>) => void;
}

export default function SettingsSession({ onOpenConfirm }: SettingsSessionProps) {
  const { requiresPassword, logout, logoutAll } = useAuth();

  if (!requiresPassword) return null;

  return (
    <div className="border-t border-border/50 px-4 py-4 flex flex-col gap-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">
        Session
      </p>
      <button
        onClick={async () => {
          await logout();
          toast.info('Signed out');
        }}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-accent/10 transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" />
        Sign Out This Device
      </button>
      <button
        onClick={() =>
          onOpenConfirm({
            title: 'Sign out all devices?',
            message:
              'Every active session will be invalidated immediately. You will need to log in again on all devices.',
            confirmLabel: 'Sign Out All Devices',
            variant: 'destructive',
            onConfirm: async () => {
              await logoutAll();
              toast.warning('All sessions invalidated — please log in again');
            },
          })
        }
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
      >
        <ShieldAlert className="w-3.5 h-3.5" />
        Sign Out All Devices
      </button>
      <p className="text-[10px] text-muted-foreground text-center leading-snug">
        &ldquo;All devices&rdquo; immediately invalidates every active session — useful if a session
        token is compromised.
      </p>
    </div>
  );
}
