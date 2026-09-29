export const NUTRIENTS = [
  "moisture",
  "dm",
  "cp",
  "fat",
  "fiber",
  "ca",
  "p",
  "na",
  "nacl",
  "cl",
  "zn",
  "cu",
] as const;

export type NutrientCode = (typeof NUTRIENTS)[number];
export type Basis = "as_received" | "dry_matter";
export type SourceKind = "lab" | "nir";
export type SheetFormat =
  | "lab_export"
  | "nir_export"
  | "transposed_comparison"
  | "analyses_vs_intended"
  | "unknown";

/** A spreadsheet reduced to a 2-D array of raw cell values (SheetJS `header: 1`, `raw: true`). */
export type Grid = unknown[][];

export interface ParsedResult {
  nutrient: NutrientCode;
  basis: Basis;
  analyzed: number | null;
  intended: number | null;
  /** Subtracted from `intended` before computing % of intended (e.g. "Ca intended – 0.14"). */
  intendedOffset: number | null;
  /** The % of intended the source sheet itself reported, kept for cross-checking. */
  sheetPct: number | null;
}

export interface ParsedSample {
  sheet: string;
  /** Human-readable pointer back to the source cell range, e.g. "row 12" or "column F". */
  ref: string;
  externalId: string | null;
  sampleNo: string | null;
  dietCode: string | null;
  farmLabel: string | null;
  /** ISO yyyy-mm-dd */
  sampledOn: string | null;
  source: SourceKind;
  labOrInstrument: string | null;
  dm: number | null;
  results: ParsedResult[];
}

export type WarningLevel = "info" | "warn" | "error";

export interface ParseWarning {
  level: WarningLevel;
  code: string;
  message: string;
  ref?: string;
}

export interface ToleranceHint {
  nutrient: NutrientCode;
  low: number;
  high: number | null;
}

export interface SheetParse {
  sheet: string;
  format: SheetFormat;
  confidence: number;
  samples: ParsedSample[];
  warnings: ParseWarning[];
  toleranceHints: ToleranceHint[];
  summaryRowsSkipped: number;
}
