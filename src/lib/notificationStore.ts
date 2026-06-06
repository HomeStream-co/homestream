/**
 * notificationStore — lightweight in-memory notification store using Zustand.
 * Persists to localStorage so notifications survive page refreshes.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationType =
  | 'download_complete'
  | 'download_started'
  | 'download_error'
  | 'library_added'
  | 'warning'
  | 'error'
  | 'info';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  poster?: string;
  mediaId?: string;
  read: boolean;
  createdAt: number;
}

interface NotificationStore {
  notifications: AppNotification[];
  unreadCount: number;
  add: (n: Omit<AppNotification, 'id' | 'read' | 'createdAt'>) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export const useNotifications = create<NotificationStore>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,

      add: (n) => {
        const notification: AppNotification = {
          ...n,
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          read: false,
          createdAt: Date.now(),
        };
        set(state => ({
          notifications: [notification, ...state.notifications].slice(0, 50),
          unreadCount: state.unreadCount + 1,
        }));
      },

      dismiss: (id) => {
        const n = get().notifications.find(x => x.id === id);
        set(state => ({
          notifications: state.notifications.filter(x => x.id !== id),
          unreadCount: Math.max(0, state.unreadCount - (n && !n.read ? 1 : 0)),
        }));
      },

      dismissAll: () => set({ notifications: [], unreadCount: 0 }),

      markRead: (id) => {
        const n = get().notifications.find(x => x.id === id);
        if (!n || n.read) return;
        set(state => ({
          notifications: state.notifications.map(x => x.id === id ? { ...x, read: true } : x),
          unreadCount: Math.max(0, state.unreadCount - 1),
        }));
      },

      markAllRead: () => {
        set(state => ({
          notifications: state.notifications.map(x => ({ ...x, read: true })),
          unreadCount: 0,
        }));
      },
    }),
    { name: 'homestream-notifications' },
  ),
);
