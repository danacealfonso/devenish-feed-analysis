import { cleanText } from "./normalize";
import {
  parseAnalysesVsIntended,
  parseLabExport,
  parseNirExport,
  parseTransposed,
} from "./formats";
import type { Grid, SheetFormat, SheetParse } from "./types";

export * from "./types";

export const FORMAT_LABELS: Record<SheetFormat, string> = {
  lab_export: "Lab analysis report",
  nir_export: "NIR instrument export",
  transposed_comparison: "NIR vs formula (transposed)",
  analyses_vs_intended: "Analyses vs intended",
  unknown: "Unrecognised layout",
};

interface Detection {
  format: SheetFormat;
  confidence: number;
  headerRow: number;
}

const has = (cells: (string | null)[], re: RegExp) => cells.some((c) => c != null && re.test(c));

/** Score a sheet against each known layout by looking for signature header cells. */
export function detectFormat(grid: Grid): Detection {
  let best: Detection = { format: "unknown", confidence: 0, headerRow: 0 };
  const consider = (d: Detection) => {
    if (d.confidence > best.confidence) best = d;
  };

  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const cells = (grid[r] ?? []).map(cleanText);
    const score = (checks: boolean[]) => checks.filter(Boolean).length / checks.length;

    consider({
      format: "lab_export",
      headerRow: r,
      confidence: score([
        has(cells, /^sample id$/i),
        has(cells, /lab number|report number/i),
        has(cells, /date received|report date/i),
        has(cells, /\b(AR|DW)\s*%?$/),
      ]),
    });
    consider({
      format: "nir_export",
      headerRow: r,
      confidence: score([
        has(cells, /^analysis time$/i),
        has(cells, /^sample number$/i),
        has(cells, /instrument/i),
        has(cells, /^(protein|moisture)$/i),
      ]),
    });
    consider({
      format: "analyses_vs_intended",
      headerRow: r,
      confidence: score([
        has(cells, /diet/i),
        has(cells, /date/i),
        has(cells, /analy[sz]ed$/i),
        has(cells, /intended$/i),
      ]),
    });
  }

  const colB = grid.slice(0, 40).map((r) => cleanText(r?.[1]));
  const colA = grid.slice(0, 40).map((r) => cleanText(r?.[0]));
  consider({
    format: "transposed_comparison",
    headerRow: 0,
    confidence:
      [
        has(colB, /sample id/i),
        has(colB, /^formula/i),
        has(colB, /analy[sz]ed/i),
        has(colA, /protein|ca%|p%/i),
      ].filter(Boolean).length / 4,
  });

  return best.confidence >= 0.75 ? best : { ...best, format: "unknown" };
}

export function parseSheet(sheet: string, grid: Grid): SheetParse {
  const d = detectFormat(grid);
  const base = { sheet, format: d.format, confidence: d.confidence };
  switch (d.format) {
    case "lab_export":
      return { ...base, ...parseLabExport(sheet, grid, d.headerRow) };
    case "nir_export":
      return { ...base, ...parseNirExport(sheet, grid, d.headerRow) };
    case "transposed_comparison":
      return { ...base, ...parseTransposed(sheet, grid) };
    case "analyses_vs_intended":
      return { ...base, ...parseAnalysesVsIntended(sheet, grid, d.headerRow) };
    default:
      return {
        ...base,
        samples: [],
        toleranceHints: [],
        summaryRowsSkipped: 0,
        warnings: [
          {
            level: "error",
            code: "unknown_format",
            message: "Could not recognise this sheet's layout. Map its columns manually or send it to support.",
          },
        ],
      };
  }
}
