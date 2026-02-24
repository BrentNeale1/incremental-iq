import { create } from 'zustand';

interface NotificationState {
  /** Count of unread notifications. Fetched from API on mount — not persisted. */
  unreadCount: number;
  setUnreadCount: (count: number) => void;
}

/**
 * Notifications Zustand store.
 *
 * Tracks the unread notification count for the notification badge in the nav.
 * Not persisted — fetched from the /api/notifications endpoint on mount.
 */
export const useNotificationStore = create<NotificationState>()((set) => ({
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
}));
