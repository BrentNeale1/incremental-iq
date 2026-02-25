'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Trash2, Plus } from 'lucide-react';

interface MarketRow {
  id: string;
  countryCode: string;
  displayName: string;
  campaignCount: number;
  isConfirmed: boolean;
}

interface Props {
  // No tenantId prop — session cookie handles auth on all /api/markets requests
}

export function MarketConfirmationStep(_props: Props) {
  const [markets, setMarkets] = React.useState<MarketRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [newCountry, setNewCountry] = React.useState('');
  const [newName, setNewName] = React.useState('');

  React.useEffect(() => {
    fetch('/api/markets')
      .then((r) => r.json())
      .then(setMarkets)
      .finally(() => setLoading(false));
  }, []);

  const handleConfirm = async (id: string) => {
    await fetch('/api/markets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markets: [{ id, action: 'confirm' }] }),
    });
    setMarkets((prev) => prev.map((m) => (m.id === id ? { ...m, isConfirmed: true } : m)));
  };

  const handleRename = async (id: string, displayName: string) => {
    await fetch('/api/markets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markets: [{ id, displayName, action: 'rename' }] }),
    });
    setMarkets((prev) => prev.map((m) => (m.id === id ? { ...m, displayName } : m)));
  };

  const handleDelete = async (id: string) => {
    await fetch('/api/markets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markets: [{ id, action: 'delete' }] }),
    });
    setMarkets((prev) => prev.filter((m) => m.id !== id));
  };

  const handleAdd = async () => {
    if (!newCountry || !newName) return;
    const res = await fetch('/api/markets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markets: [{ countryCode: newCountry, displayName: newName, action: 'add' }],
      }),
    });
    const { markets: updated } = await res.json();
    setMarkets(updated);
    setNewCountry('');
    setNewName('');
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading markets...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Confirm Your Markets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {markets.map((market) => (
          <div key={market.id} className="flex items-center gap-2">
            <Input
              defaultValue={market.displayName}
              className="h-8 flex-1 text-sm"
              onBlur={(e) => {
                if (e.target.value !== market.displayName) {
                  handleRename(market.id, e.target.value);
                }
              }}
            />
            <Badge variant="secondary" className="text-xs whitespace-nowrap">
              {market.campaignCount} campaigns
            </Badge>
            {!market.isConfirmed && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleConfirm(market.id)}>
                <Check className="h-4 w-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(market.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Input placeholder="CC" value={newCountry} onChange={(e) => setNewCountry(e.target.value)} className="h-8 w-16 text-sm" maxLength={2} />
          <Input placeholder="Market name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 flex-1 text-sm" />
          <Button size="sm" variant="outline" onClick={handleAdd} disabled={!newCountry || !newName}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
