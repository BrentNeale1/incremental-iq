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
}

export function GA4EventSelector({ integrationId, propertyId }: Props) {
  const [events, setEvents] = React.useState<KeyEvent[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/ga4/events?integrationId=${integrationId}&propertyId=${propertyId}`)
      .then((r) => r.json())
      .then((data: KeyEvent[]) => {
        setEvents(data);
        setSelected(new Set(data.map((e) => e.eventName)));
      })
      .finally(() => setLoading(false));
  }, [integrationId, propertyId]);

  const toggleAll = () => {
    if (selected.size === events.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(events.map((e) => e.eventName)));
    }
  };

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/ga4/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        integrationId,
        propertyId,
        selectedEventNames: Array.from(selected),
      }),
    });
    setSaving(false);
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
        <Button size="sm" onClick={handleSave} disabled={saving || selected.size === 0} className="mt-3 w-full">
          {saving ? 'Saving...' : `Save ${selected.size} Event${selected.size !== 1 ? 's' : ''}`}
        </Button>
      </CardContent>
    </Card>
  );
}
