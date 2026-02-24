'use client';

import * as React from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard, type KpiMetricKey } from '@/components/dashboard/KpiCard';
import { useDashboardStore } from '@/lib/store/dashboard';
import type { KpisResponse } from '@/lib/hooks/useKpis';

/**
 * SortableKpiCard — wraps KpiCard with @dnd-kit/sortable drag behavior.
 * CRITICAL: This is a 'use client' component (Pitfall 5 — dnd-kit is browser-only).
 */
function SortableKpiCard({
  metricKey,
  kpisData,
}: {
  metricKey: KpiMetricKey;
  kpisData: KpisResponse | undefined;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: metricKey });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  // Extract value and delta from KPI data
  const period = kpisData?.period;
  const comparison = kpisData?.comparison;

  let value = 0;
  let delta: number | undefined;
  let deltaPct: number | undefined;

  if (period) {
    switch (metricKey) {
      case 'spend':
        value = period.spend;
        delta = comparison?.spendDelta;
        deltaPct = comparison?.spendDeltaPct;
        break;
      case 'revenue':
        value = period.revenue;
        delta = comparison?.revenueDelta;
        deltaPct = comparison?.revenueDeltaPct;
        break;
      case 'roas':
        value = period.roas;
        delta = comparison?.roasDelta;
        deltaPct = comparison?.roasDeltaPct;
        break;
      case 'incremental_revenue':
        value = period.incrementalRevenue;
        delta = comparison?.incrementalRevenueDelta;
        deltaPct = comparison?.incrementalRevenueDeltaPct;
        break;
      default:
        value = 0;
    }
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KpiCard
        metricKey={metricKey}
        value={value}
        delta={comparison ? delta : undefined}
        deltaPct={comparison ? deltaPct : undefined}
        isDragging={isDragging}
      />
    </div>
  );
}

export interface KpiGridProps {
  kpisData: KpisResponse | undefined;
  isLoading: boolean;
}

/**
 * KpiGrid — sortable grid of 4 KPI cards using @dnd-kit/sortable.
 *
 * CRITICAL: 'use client' is required — dnd-kit only works in the browser.
 *
 * Drag-to-reorder persists via Zustand (setKpiOrder → localStorage).
 * Grid layout: 4 cols on lg, 2 on md, 1 on sm (Tailwind responsive).
 */
export function KpiGrid({ kpisData, isLoading }: KpiGridProps) {
  const kpiOrder = useDashboardStore((s) => s.kpiOrder) as KpiMetricKey[];
  const setKpiOrder = useDashboardStore((s) => s.setKpiOrder);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Must drag 8px before activating — prevents accidental drags on click
      },
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = kpiOrder.indexOf(active.id as KpiMetricKey);
    const newIndex = kpiOrder.indexOf(over.id as KpiMetricKey);
    const newOrder = arrayMove(kpiOrder, oldIndex, newIndex);
    setKpiOrder(newOrder);
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={kpiOrder} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpiOrder.map((metricKey) => (
            <SortableKpiCard
              key={metricKey}
              metricKey={metricKey}
              kpisData={kpisData}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
