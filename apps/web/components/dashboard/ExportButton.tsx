'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportToExcel, exportToCsv } from '@/lib/export/excel';

export interface ExportButtonProps {
  /** Data rows to export — should be the currently-visible filtered data from TanStack Query cache. */
  data: Record<string, unknown>[];
  /** Base filename without extension (e.g. "performance-2025-01"). */
  filename: string;
}

/**
 * ExportButton — dropdown trigger that exports dashboard data as CSV or Excel.
 *
 * Receives `data` and `filename` from the parent page component, which provides
 * the currently-visible (date-range filtered) data from TanStack Query.
 * All export logic runs client-side via SheetJS — no server round-trip.
 */
export function ExportButton({ data, filename }: ExportButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Export data"
          aria-label="Export data"
          disabled={data.length === 0}
        >
          <Download className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportToCsv(data, filename)}>
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportToExcel(data, filename)}>
          Export as Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
