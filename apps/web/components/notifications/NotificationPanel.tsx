'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell,
  AlertTriangle,
  Calendar,
  Activity,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotificationStore } from '@/lib/store/notifications';
import { NotificationSettings } from './NotificationSettings';

export interface NotificationItem {
  id: string;
  type: string;
  message: string;
  linkPath: string | null;
  read: boolean;
  createdAt: string | Date;
}

export interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

/** Returns the appropriate lucide icon for a notification type. */
function NotificationIcon({ type }: { type: string }) {
  switch (type) {
    case 'recommendation_ready':
      return <Bell className="h-4 w-4 text-blue-500" aria-hidden="true" />;
    case 'anomaly_detected':
      return <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />;
    case 'seasonal_alert':
      return <Calendar className="h-4 w-4 text-green-500" aria-hidden="true" />;
    case 'data_health':
      return <Activity className="h-4 w-4 text-red-500" aria-hidden="true" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  }
}

function NotificationList({
  onClose,
}: {
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const [showSettings, setShowSettings] = React.useState(false);

  const { data: notifications = [], isLoading } = useQuery<NotificationItem[]>({
    queryKey: ['notifications', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/notifications');
      if (!res.ok) throw new Error(`Failed to fetch notifications: ${res.status}`);
      return res.json() as Promise<NotificationItem[]>;
    },
    staleTime: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, read: true }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setUnreadCount(0);
    },
  });

  const handleMarkAllRead = () => {
    const unreadIds = notifications
      .filter((n) => !n.read)
      .map((n) => n.id);
    if (unreadIds.length > 0) {
      markReadMutation.mutate(unreadIds);
    }
  };

  const handleNotificationClick = (notification: NotificationItem) => {
    // Mark as read
    if (!notification.read) {
      markReadMutation.mutate([notification.id]);
    }
    // Navigate to link
    if (notification.linkPath) {
      router.push(notification.linkPath);
      onClose();
    }
  };

  if (showSettings) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(false)}
          >
            Back
          </Button>
          <span className="text-sm font-medium">Notification Settings</span>
        </div>
        <NotificationSettings />
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium">
          Notifications {unreadCount > 0 && `(${unreadCount} unread)`}
        </span>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto py-1 text-xs"
            onClick={handleMarkAllRead}
            disabled={markReadMutation.isPending}
          >
            Mark all as read
          </Button>
        )}
      </div>

      {/* Notification list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              No notifications yet — we&apos;ll alert you when something needs attention.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                  !notification.read ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="mt-0.5 shrink-0">
                  <NotificationIcon type={notification.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">{notification.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(notification.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                {!notification.read && (
                  <div
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500"
                    aria-label="Unread"
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-auto w-full py-1 text-xs"
          onClick={() => setShowSettings(true)}
        >
          Notification settings
        </Button>
      </div>
    </div>
  );
}

/**
 * NotificationPanel — slide-over notification drawer using shadcn Sheet.
 *
 * Uses Sheet (slide-over from right) on both mobile and desktop.
 * Lists recent notifications (limit 50) ordered by createdAt DESC.
 * Each notification has a type icon, message, relative time, and unread indicator.
 * "Mark all as read" button at the top.
 * Notification settings accessible from the footer.
 *
 * tenantId is no longer accepted — the API route reads it from the session cookie.
 */
export function NotificationPanel({
  open,
  onClose,
}: NotificationPanelProps) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="flex w-80 flex-col p-0 sm:w-96">
        <SheetHeader className="sr-only">
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>
        <NotificationList onClose={onClose} />
      </SheetContent>
    </Sheet>
  );
}
