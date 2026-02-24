/**
 * SheetJS export helpers for CSV and Excel downloads.
 *
 * Works entirely client-side — no server round-trip required.
 * Uses SheetJS (xlsx) for workbook creation and file-saver for download.
 *
 * Pattern: RESEARCH.md Pattern 7
 */
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

/**
 * Exports data rows to an Excel (.xlsx) file and triggers a browser download.
 *
 * @param data     - Array of row objects (keys become column headers)
 * @param filename - File name without extension (e.g. "performance-2025-01")
 */
export function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
): void {
  if (data.length === 0) return;

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  // Write as array buffer for binary-safe download
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  saveAs(blob, `${filename}.xlsx`);
}

/**
 * Exports data rows to a CSV file and triggers a browser download.
 *
 * @param data     - Array of row objects (keys become column headers)
 * @param filename - File name without extension (e.g. "performance-2025-01")
 */
export function exportToCsv(
  data: Record<string, unknown>[],
  filename: string,
): void {
  if (data.length === 0) return;

  const worksheet = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

  saveAs(blob, `${filename}.csv`);
}
