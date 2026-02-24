'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDashboardStore, type ViewMode } from '@/lib/store/dashboard';

/**
 * ViewToggle — switches between "Executive" and "Analyst" recommendation views.
 *
 * State stored in Zustand with persist middleware (survives page reload).
 *
 * Executive: simplified card with action + single-line summary
 * Analyst: extended card with lift CI range, confidence %, Hill curve params
 */
export function ViewToggle() {
  const viewMode = useDashboardStore((s) => s.viewMode);
  const setViewMode = useDashboardStore((s) => s.setViewMode);

  return (
    <Tabs
      value={viewMode}
      onValueChange={(v) => setViewMode(v as ViewMode)}
      className="h-8"
    >
      <TabsList className="h-8 px-1">
        <TabsTrigger value="executive" className="h-6 px-2 text-xs">
          Executive
        </TabsTrigger>
        <TabsTrigger value="analyst" className="h-6 px-2 text-xs">
          Analyst
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
