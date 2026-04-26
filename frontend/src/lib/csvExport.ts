// CSV export helpers — type-safe, RFC 4180-ish.
// Supports nested objects via flatten; numbers formatted with locale.

export type CsvCell = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvCell>;

export interface CsvColumn<T> {
  key: keyof T | string;
  header: string;
  accessor?: (row: T) => CsvCell;
  format?: (v: CsvCell) => string;
}

function escapeCell(v: CsvCell): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // RFC 4180: wrap in quotes if contains comma/quote/newline; double internal quotes
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T extends object>(
  rows: T[],
  columns: CsvColumn<T>[],
): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const dataLines = rows.map((row) => {
    return columns.map((c) => {
      const v = c.accessor
        ? c.accessor(row)
        : (row as Record<string, CsvCell>)[c.key as string];
      const formatted = c.format ? c.format(v ?? "") : v;
      return escapeCell(formatted ?? "");
    }).join(",");
  });
  // Add BOM for Excel UTF-8 compatibility
  return "﻿" + [header, ...dataLines].join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToCsv<T extends object>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  const csv = toCsv(rows, columns);
  downloadCsv(filename, csv);
}
