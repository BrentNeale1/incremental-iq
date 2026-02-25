'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  onSelect: (mode: 'ecommerce' | 'lead_gen') => void;
  initialMode?: 'ecommerce' | 'lead_gen';
}

export function OutcomeModeSelector({ onSelect, initialMode }: Props) {
  const [selected, setSelected] = React.useState<'ecommerce' | 'lead_gen' | null>(initialMode ?? null);

  const handleSelect = async (mode: 'ecommerce' | 'lead_gen') => {
    setSelected(mode);
    await fetch('/api/tenant/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcomeMode: mode }),
    });
    onSelect(mode);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Are you tracking revenue or leads?</h3>
      <div className="grid grid-cols-2 gap-3">
        <Card
          className={cn(
            'cursor-pointer transition-colors hover:border-primary',
            selected === 'ecommerce' && 'border-primary bg-primary/5',
          )}
          onClick={() => handleSelect('ecommerce')}
        >
          <CardContent className="p-4 text-center space-y-2">
            <div className="text-2xl">&#128722;</div>
            <div className="text-sm font-medium">Revenue</div>
            <div className="text-xs text-muted-foreground">Track sales and revenue from your store</div>
          </CardContent>
        </Card>
        <Card
          className={cn(
            'cursor-pointer transition-colors hover:border-primary',
            selected === 'lead_gen' && 'border-primary bg-primary/5',
          )}
          onClick={() => handleSelect('lead_gen')}
        >
          <CardContent className="p-4 text-center space-y-2">
            <div className="text-2xl">&#128200;</div>
            <div className="text-sm font-medium">Leads</div>
            <div className="text-xs text-muted-foreground">Track leads from your website</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
