'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

interface ChannelPrefs {
  in_app: boolean;
  email: boolean;
}

interface NotificationPreferences {
  anomaly_detected: ChannelPrefs;
  recommendation_ready: ChannelPrefs;
  seasonal_alert: ChannelPrefs;
  data_health: ChannelPrefs;
}

interface UserPreferences {
  notificationPreferences: NotificationPreferences;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  anomaly_detected:     { in_app: true,  email: false },
  recommendation_ready: { in_app: true,  email: false },
  seasonal_alert:       { in_app: true,  email: true  },
  data_health:          { in_app: true,  email: true  },
};

const NOTIFICATION_TYPE_LABELS: Record<keyof NotificationPreferences, string> = {
  anomaly_detected:     'Anomaly detected',
  recommendation_ready: 'New recommendations',
  seasonal_alert:       'Seasonal deadlines',
  data_health:          'Data health issues',
};

/**
 * NotificationSettings — per-type, per-channel notification preference toggles.
 *
 * Columns: In-app | Email
 * Rows: Anomaly detected | New recommendations | Seasonal deadlines | Data health issues
 *
 * Reads from /api/notifications/preferences, writes via PUT.
 * tenantId is no longer accepted — the API route reads it from the session cookie.
 */
export function NotificationSettings() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<UserPreferences>({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const res = await fetch('/api/notifications/preferences');
      if (!res.ok) throw new Error(`Failed to fetch preferences: ${res.status}`);
      return res.json() as Promise<UserPreferences>;
    },
    staleTime: 60_000,
  });

  const preferences = data?.notificationPreferences ?? DEFAULT_PREFERENCES;

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<NotificationPreferences>) => {
      await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });

  const handleToggle = (
    type: keyof NotificationPreferences,
    channel: 'in_app' | 'email',
    value: boolean,
  ) => {
    const current = preferences[type];
    updateMutation.mutate({
      [type]: { ...current, [channel]: value },
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const types = Object.keys(NOTIFICATION_TYPE_LABELS) as (keyof NotificationPreferences)[];

  return (
    <div className="flex flex-col gap-1">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 pb-2 text-xs font-medium text-muted-foreground">
        <span>Type</span>
        <span className="w-14 text-center">In-app</span>
        <span className="w-14 text-center">Email</span>
      </div>

      {/* Preference rows */}
      {types.map((type) => {
        const prefs = preferences[type];
        return (
          <div
            key={type}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-md py-2"
          >
            <Label className="text-sm font-normal">
              {NOTIFICATION_TYPE_LABELS[type]}
            </Label>
            <div className="flex w-14 justify-center">
              <Switch
                checked={prefs.in_app}
                onCheckedChange={(checked) => handleToggle(type, 'in_app', checked)}
                aria-label={`${NOTIFICATION_TYPE_LABELS[type]} in-app notifications`}
                disabled={updateMutation.isPending}
              />
            </div>
            <div className="flex w-14 justify-center">
              <Switch
                checked={prefs.email}
                onCheckedChange={(checked) => handleToggle(type, 'email', checked)}
                aria-label={`${NOTIFICATION_TYPE_LABELS[type]} email notifications`}
                disabled={updateMutation.isPending}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
