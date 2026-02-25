'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Check, Trash2, Plus, GitMerge } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LocalMarket {
  id: string;
  countryCode: string;
  displayName: string;
  campaignCount: number;
  isConfirmed: boolean;
  isNew?: boolean; // true for locally-added markets (no DB id yet)
}

interface PendingAction {
  action: 'confirm' | 'rename' | 'merge' | 'add' | 'delete';
  id?: string;
  displayName?: string;
  countryCode?: string;
  targetId?: string;
}

export interface BatchMarketHandle {
  save: () => Promise<void>;
  canProceed: boolean;
}

/**
 * BatchMarketConfirmation — Step 3 batch-save wrapper for market confirmation.
 *
 * Design contract (CONTEXT.md: "Batch save — all edits saved when user clicks
 * Next (single API call), can undo before committing"):
 *   - All user interactions (confirm, rename, delete, add, merge) update
 *     LOCAL REACT STATE ONLY — NO fetch calls until save() is triggered.
 *   - save() is exposed via useImperativeHandle and called by the wizard
 *     on Next click, flushing all pendingActions via a single PUT /api/markets.
 *   - canProceed is true when localMarkets.length > 0.
 *
 * Merge flow:
 *   - Checkbox per row for multi-select
 *   - When 2+ checked, "Merge" button appears
 *   - Dialog prompts for merged market name
 *   - First selected market becomes target (renamed), others are merged into it
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface BatchMarketProps {}

const BatchMarketConfirmation = React.forwardRef<
  BatchMarketHandle,
  BatchMarketProps
>(function BatchMarketConfirmation(_props, ref) {
  const [localMarkets, setLocalMarkets] = React.useState<LocalMarket[]>([]);
  const [pendingActions, setPendingActions] = React.useState<PendingAction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // Add market form
  const [newCountry, setNewCountry] = React.useState('');
  const [newName, setNewName] = React.useState('');

  // Merge flow
  const [selectedForMerge, setSelectedForMerge] = React.useState<Set<string>>(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = React.useState(false);
  const [mergedName, setMergedName] = React.useState('');

  // Expose save() and canProceed via ref
  React.useImperativeHandle(ref, () => ({
    save: async () => {
      if (pendingActions.length === 0) return;

      setSaving(true);
      setSaveError(null);

      const res = await fetch('/api/markets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markets: pendingActions }),
      });

      if (!res.ok) {
        setSaving(false);
        const text = await res.text().catch(() => 'Unknown error');
        throw new Error(`Failed to save markets: ${text}`);
      }

      // Update localMarkets from response
      try {
        const data = await res.json() as { markets?: LocalMarket[] };
        if (data.markets) {
          setLocalMarkets(data.markets);
        }
      } catch {
        // Non-fatal — local state is still valid
      }

      setPendingActions([]);
      setSaving(false);
    },
    get canProceed() {
      return localMarkets.length > 0;
    },
  }));

  // Fetch initial market list
  React.useEffect(() => {
    fetch('/api/markets')
      .then((r) => r.json())
      .then((data: LocalMarket[] | { markets: LocalMarket[] }) => {
        const markets = Array.isArray(data) ? data : data.markets ?? [];
        setLocalMarkets(markets);
      })
      .catch((err) => console.error('Failed to load markets:', err))
      .finally(() => setLoading(false));
  }, []);

  // ---- Local-only handlers (no fetch) ----

  const handleConfirm = (id: string) => {
    setLocalMarkets((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isConfirmed: true } : m)),
    );
    setPendingActions((prev) => [...prev, { action: 'confirm', id }]);
  };

  const handleRename = (id: string, displayName: string) => {
    setLocalMarkets((prev) =>
      prev.map((m) => (m.id === id ? { ...m, displayName } : m)),
    );
    setPendingActions((prev) => [...prev, { action: 'rename', id, displayName }]);
  };

  const handleDelete = (id: string) => {
    setLocalMarkets((prev) => prev.filter((m) => m.id !== id));
    setSelectedForMerge((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setPendingActions((prev) => [...prev, { action: 'delete', id }]);
  };

  const handleAdd = () => {
    if (!newCountry.trim() || !newName.trim()) return;
    const tempId = crypto.randomUUID();
    const newMarket: LocalMarket = {
      id: tempId,
      countryCode: newCountry.toUpperCase().slice(0, 2),
      displayName: newName.trim(),
      campaignCount: 0,
      isConfirmed: false,
      isNew: true,
    };
    setLocalMarkets((prev) => [...prev, newMarket]);
    setPendingActions((prev) => [
      ...prev,
      { action: 'add', countryCode: newMarket.countryCode, displayName: newMarket.displayName },
    ]);
    setNewCountry('');
    setNewName('');
  };

  const toggleMergeSelect = (id: string) => {
    setSelectedForMerge((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openMergeDialog = () => {
    const first = localMarkets.find((m) => selectedForMerge.has(m.id));
    setMergedName(first?.displayName ?? '');
    setMergeDialogOpen(true);
  };

  const handleMergeConfirm = () => {
    const selectedIds = Array.from(selectedForMerge);
    if (selectedIds.length < 2 || !mergedName.trim()) return;

    const [targetId, ...sourceIds] = selectedIds;
    const newName = mergedName.trim();

    // Compute total campaign count across merged markets
    const merged = localMarkets.filter((m) => selectedForMerge.has(m.id));
    const totalCampaigns = merged.reduce((sum, m) => sum + m.campaignCount, 0);

    // Update local state: rename target, remove sources
    setLocalMarkets((prev) => {
      return prev
        .map((m) => {
          if (m.id === targetId) {
            return { ...m, displayName: newName, campaignCount: totalCampaigns };
          }
          return m;
        })
        .filter((m) => !sourceIds.includes(m.id));
    });

    // Queue pending actions
    setPendingActions((prev) => [
      ...prev,
      { action: 'rename', id: targetId, displayName: newName },
      ...sourceIds.map((sourceId) => ({
        action: 'merge' as const,
        id: sourceId,
        targetId,
      })),
    ]);

    setSelectedForMerge(new Set());
    setMergeDialogOpen(false);
    setMergedName('');
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading markets...</div>;
  }

  const selectedCount = selectedForMerge.size;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Confirm Your Markets</CardTitle>
            {selectedCount >= 2 && (
              <Button
                size="sm"
                variant="outline"
                onClick={openMergeDialog}
                className="h-7 text-xs gap-1"
              >
                <GitMerge className="h-3.5 w-3.5" />
                Merge {selectedCount}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Empty state */}
          {localMarkets.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No markets detected yet. Add your markets manually.
            </div>
          )}

          {/* Market rows */}
          {localMarkets.map((market) => (
            <div
              key={market.id}
              className={cn(
                'flex items-center gap-2',
                market.isConfirmed && 'opacity-75',
              )}
            >
              {/* Merge checkbox */}
              <Checkbox
                checked={selectedForMerge.has(market.id)}
                onCheckedChange={() => toggleMergeSelect(market.id)}
                aria-label={`Select ${market.displayName} for merge`}
                className="flex-shrink-0"
              />

              {/* Market name inline edit */}
              <Input
                defaultValue={market.displayName}
                className="h-8 flex-1 text-sm"
                onBlur={(e) => {
                  if (e.target.value !== market.displayName) {
                    handleRename(market.id, e.target.value);
                  }
                }}
              />

              {/* Country code badge */}
              <Badge variant="outline" className="text-xs whitespace-nowrap flex-shrink-0">
                {market.countryCode}
              </Badge>

              {/* Campaign count badge */}
              <Badge variant="secondary" className="text-xs whitespace-nowrap flex-shrink-0">
                {market.campaignCount} campaigns
              </Badge>

              {/* Confirm button */}
              {!market.isConfirmed && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 flex-shrink-0 text-green-600 hover:text-green-700"
                  onClick={() => handleConfirm(market.id)}
                  title="Confirm market"
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}

              {/* Delete button */}
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 flex-shrink-0 text-destructive hover:text-destructive"
                onClick={() => handleDelete(market.id)}
                title="Delete market"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {/* Add market row */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Input
              placeholder="CC"
              value={newCountry}
              onChange={(e) => setNewCountry(e.target.value)}
              className="h-8 w-16 text-sm"
              maxLength={2}
              aria-label="Country code"
            />
            <Input
              placeholder="Market name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 flex-1 text-sm"
              aria-label="Market name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleAdd}
              disabled={!newCountry.trim() || !newName.trim()}
              className="flex-shrink-0"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>

          {/* Pending changes indicator */}
          {pendingActions.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {pendingActions.length} unsaved change{pendingActions.length !== 1 ? 's' : ''} — will
              save when you click Next.
            </p>
          )}

          {/* Save error */}
          {saveError && (
            <p className="text-xs text-destructive">{saveError}</p>
          )}

          {/* Saving indicator */}
          {saving && (
            <p className="text-xs text-muted-foreground">Saving markets...</p>
          )}
        </CardContent>
      </Card>

      {/* Merge dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Markets</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Merging {selectedCount} markets. Campaign data will be combined. Enter a name for the
              merged market:
            </p>
            <Input
              value={mergedName}
              onChange={(e) => setMergedName(e.target.value)}
              placeholder="Merged market name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleMergeConfirm();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMergeConfirm} disabled={!mergedName.trim()}>
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

BatchMarketConfirmation.displayName = 'BatchMarketConfirmation';

export { BatchMarketConfirmation };
