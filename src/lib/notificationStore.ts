/**
 * notificationStore — in-memory notification bus for HomeStream.
 *
 * Provides a lightweight pub/sub store for app-wide notifications.
 * Notifications are ephemeral (not persisted) — they live only for the
 * current browser session and auto-expire after `ttl` milliseconds.
 *
 * Usage:
 *   import { useNotifications, notify } from '@/lib/notificationStore';
 *
 *   // Anywhere in the app:
 *   notify({ type: 'download_complete', title: 'Big Buck Bunny', message: 'Download finished' });
 *
 *   // In a component:
 *   const { notifications, dismiss, dismissAll } = useNotifications();
 */

import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'download_complete'
  | 'download_error'
  | 'download_started'
  | 'library_added'
  | 'info'
  | 'warning'
  | 'error';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  /** Media item id — used to link to player */
  mediaId?: string;
  /** Poster URL for rich notifications */
  poster?: string;
  createdAt: number;
  /** Auto-dismiss after this many ms (default 6000) */
  ttl?: number;
  read: boolean;
}

// ── Store ─────────────────────────────────────────────────────────────────────

type Listener = (notifications: AppNotification[]) => void;

let _notifications: AppNotification[] = [];
const _listeners = new Set<Listener>();
const _timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  const snapshot = [..._notifications];
  _listeners.forEach(fn => fn(snapshot));
}

function scheduleExpiry(n: AppNotification) {
  const ttl = n.ttl ?? 6000;
  if (ttl <= 0) return; // 0 = persistent
  const timer = setTimeout(() => {
    _notifications = _notifications.filter(x => x.id !== n.id);
    _timers.delete(n.id);
    emit();
  }, ttl);
  _timers.set(n.id, timer);
}

/** Push a new notification. Returns the notification id. */
export function notify(
  opts: Omit<AppNotification, 'id' | 'createdAt' | 'read'>,
): string {
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const n: AppNotification = { ...opts, id, createdAt: Date.now(), read: false };
  _notifications = [n, ..._notifications].slice(0, 50); // cap at 50
  scheduleExpiry(n);
  emit();
  return id;
}

/** Dismiss a single notification by id. */
export function dismiss(id: string) {
  const timer = _timers.get(id);
  if (timer) { clearTimeout(timer); _timers.delete(id); }
  _notifications = _notifications.filter(n => n.id !== id);
  emit();
}

/** Dismiss all notifications. */
export function dismissAll() {
  _timers.forEach(t => clearTimeout(t));
  _timers.clear();
  _notifications = [];
  emit();
}

/** Mark a notification as read. */
export function markRead(id: string) {
  _notifications = _notifications.map(n => n.id === id ? { ...n, read: true } : n);
  emit();
}

/** Mark all as read. */
export function markAllRead() {
  _notifications = _notifications.map(n => ({ ...n, read: true }));
  emit();
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([..._notifications]);

  useEffect(() => {
    const listener: Listener = (ns) => setNotifications(ns);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const dismissOne = useCallback((id: string) => dismiss(id), []);
  const dismissAllFn = useCallback(() => dismissAll(), []);
  const markReadFn = useCallback((id: string) => markRead(id), []);
  const markAllReadFn = useCallback(() => markAllRead(), []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    dismiss: dismissOne,
    dismissAll: dismissAllFn,
    markRead: markReadFn,
    markAllRead: markAllReadFn,
  };
}
