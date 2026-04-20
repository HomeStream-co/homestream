/**
 * NotificationBell — header bell icon with dropdown notification panel.
 *
 * Shows an unread badge count, opens a panel listing recent notifications,
 * and links download-complete notifications directly to the player.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X, CheckCheck, Download, AlertCircle, Info, Film, Plus } from 'lucide-react';
import { useNotifications, type AppNotification, type NotificationType } from '@/lib/notificationStore';
import { useNavigate } from 'react-router-dom';

// ── Icon map ──────────────────────────────────────────────────────────────────

function NotifIcon({ type }: { type: NotificationType }) {
  const cls = 'w-4 h-4 flex-shrink-0';
  switch (type) {
    case 'download_complete': return <Download className={`${cls} text-green-400`} />;
    case 'download_started':  return <Download className={`${cls} text-blue-400`} />;
    case 'download_error':    return <AlertCircle className={`${cls} text-red-400`} />;
    case 'library_added':     return <Plus className={`${cls} text-primary`} />;
    case 'warning':           return <AlertCircle className={`${cls} text-yellow-400`} />;
    case 'error':             return <AlertCircle className={`${cls} text-red-400`} />;
    default:                  return <Info className={`${cls} text-muted-foreground`} />;
  }
}

function notifBg(type: NotificationType): string {
  switch (type) {
    case 'download_complete': return 'bg-green-500/10 border-green-500/20';
    case 'download_started':  return 'bg-blue-500/10 border-blue-500/20';
    case 'download_error':    return 'bg-red-500/10 border-red-500/20';
    case 'library_added':     return 'bg-primary/10 border-primary/20';
    case 'warning':           return 'bg-yellow-500/10 border-yellow-500/20';
    case 'error':             return 'bg-red-500/10 border-red-500/20';
    default:                  return 'bg-muted/30 border-border';
  }
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Notification row ──────────────────────────────────────────────────────────

function NotifRow({
  n,
  onDismiss,
  onMarkRead,
}: {
  n: AppNotification;
  onDismiss: (id: string) => void;
  onMarkRead: (id: string) => void;
}) {
  const navigate = useNavigate();

  function handleClick() {
    onMarkRead(n.id);
    if (n.mediaId && (n.type === 'download_complete' || n.type === 'library_added')) {
      navigate(`/player/${n.mediaId}`);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.18 }}
      className={`relative flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors hover:brightness-110 ${notifBg(n.type)} ${!n.read ? 'ring-1 ring-primary/20' : ''}`}
      onClick={handleClick}
    >
      {/* Poster thumbnail */}
      {n.poster ? (
        <img
          src={n.poster}
          alt=""
          className="w-10 h-14 rounded-lg object-cover flex-shrink-0 bg-muted"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0 mt-0.5">
          <NotifIcon type={n.type} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-semibold leading-tight truncate ${n.read ? 'text-muted-foreground' : 'text-foreground'}`}>
            {n.title}
          </p>
          {!n.read && (
            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />
          )}
        </div>
        {n.message && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
        )}
        <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
      </div>

      {/* Dismiss button */}
      <button
        onClick={e => { e.stopPropagation(); onDismiss(n.id); }}
        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  );
}

// ── Bell component ────────────────────────────────────────────────────────────

export default function NotificationBell() {
  const { notifications, unreadCount, dismiss, dismissAll, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Mark all read when panel opens
  useEffect(() => {
    if (open && unreadCount > 0) {
      setTimeout(markAllRead, 800);
    }
  }, [open, unreadCount, markAllRead]);

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="w-4 h-4" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1 leading-none"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Notifications</span>
                {notifications.length > 0 && (
                  <span className="text-xs text-muted-foreground">({notifications.length})</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {notifications.length > 0 && (
                  <button
                    onClick={dismissAll}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/50"
                    title="Clear all"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Clear all
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[420px] overflow-y-auto p-3 flex flex-col gap-2">
              <AnimatePresence mode="popLayout">
                {notifications.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-10 text-center"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                      <Film className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No notifications yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Download completions and library updates will appear here
                    </p>
                  </motion.div>
                ) : (
                  notifications.map(n => (
                    <NotifRow
                      key={n.id}
                      n={n}
                      onDismiss={dismiss}
                      onMarkRead={markRead}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
