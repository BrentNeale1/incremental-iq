'use client';

import * as React from 'react';
import { Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useNotificationStore } from '@/lib/store/notifications';

export interface NotificationBellProps {
  tenantId?: string;
  onOpen: () => void;
}

/**
 * NotificationBell — bell icon with unread count badge.
 *
 * Polls /api/notifications?unreadOnly=true every 60 seconds (Pitfall 8 — avoid
 * hammering the API). Updates the global Zustand store so other components
 * can read the count without making additional API calls.
 */
export function NotificationBell({ tenantId, onOpen }: NotificationBellProps) {
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  // Poll for unread count — staleTime 60s prevents unnecessary refetches
  const { data } = useQuery<{ id: string }[]>({
    queryKey: ['notifications', 'unread', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(
        `/api/notifications?unreadOnly=true&tenantId=${encodeURIComponent(tenantId)}`,
      );
      if (!res.ok) throw new Error(`Failed to fetch notifications: ${res.status}`);
      return res.json() as Promise<{ id: string }[]>;
    },
    enabled: !!tenantId,
    staleTime: 60_000, // 60 seconds — Pitfall 8
    refetchInterval: 60_000,
  });

  // Sync count into Zustand store whenever data changes
  React.useEffect(() => {
    if (data !== undefined) {
      setUnreadCount(data.length);
    }
  }, [data, setUnreadCount]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-8 w-8"
      title="Notifications"
      aria-label={
        unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'
      }
      onClick={onOpen}
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white"
          aria-hidden="true"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
      <span className="sr-only">Notifications</span>
    </Button>
  );
}
