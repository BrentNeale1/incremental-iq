'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

interface KeyEvent {
  eventName: string;
  countingMethod: string;
}

interface Props {
  integrationId: string;
  propertyId: string;
  hideActions?: boolean;
  onSelectionChange?: (hasSelection: boolean) => void;
}

export interface GA4EventSelectorHandle {
  handleSave: () => Promise<void>;
  hasSelection: () => boolean;
}

export const GA4EventSelector = React.forwardRef<GA4EventSelectorHandle, Props>(
  function GA4EventSelector({ integrationId, propertyId, hideActions, onSelectionChange }, ref) {
    const [events, setEvents] = React.useState<KeyEvent[]>([]);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
      fetch(`/api/ga4/events?integrationId=${integrationId}&propertyId=${propertyId}`)
        .then((r) => r.json())
        .then((data: { events: KeyEvent[] }) => {
          setEvents(data.events);
          const initial = new Set(data.events.map((e) => e.eventName));
          setSelected(initial);
          onSelectionChange?.(initial.size > 0);
        })
        .finally(() => setLoading(false));
    }, [integrationId, propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = async () => {
      if (selected.size === 0) return;
      setSaving(true);
      try {
        await fetch('/api/ga4/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            integrationId,
            propertyId,
            selectedEventNames: Array.from(selected),
          }),
        });
      } finally {
        setSaving(false);
      }
    };

    React.useImperativeHandle(ref, () => ({
      handleSave,
      hasSelection: () => selected.size > 0,
    }));

    const toggleAll = () => {
      if (selected.size === events.length) {
        setSelected(new Set());
        onSelectionChange?.(false);
      } else {
        setSelected(new Set(events.map((e) => e.eventName)));
        onSelectionChange?.(true);
      }
    };

    const toggle = (name: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        onSelectionChange?.(next.size > 0);
        return next;
      });
    };

    if (loading) return <div className="text-sm text-muted-foreground">Loading events...</div>;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Lead Events</CardTitle>
          <p className="text-xs text-muted-foreground">Selected events will be summed as total leads for analysis</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs">
            {selected.size === events.length ? 'Deselect All' : 'Select All'}
          </Button>
          {events.map((event) => (
            <label key={event.eventName} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={selected.has(event.eventName)} onCheckedChange={() => toggle(event.eventName)} />
              <span className="text-sm">{event.eventName}</span>
              <Badge variant="outline" className="text-xs ml-auto">{event.countingMethod}</Badge>
            </label>
          ))}
          {!hideActions && (
            <Button size="sm" onClick={handleSave} disabled={saving || selected.size === 0} className="mt-3 w-full">
              {saving ? 'Saving...' : `Save ${selected.size} Event${selected.size !== 1 ? 's' : ''}`}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }
);
