import {
  cleanNumber,
  cleanText,
  isPlaceholder,
  isSummaryLabel,
  matchNutrient,
  parseDate,
  parseIntendedOffset,
} from "./normalize";
import { parseSampleId } from "./sampleId";
import type {
  Grid,
  NutrientCode,
  ParseWarning,
  ParsedResult,
  ParsedSample,
  ToleranceHint,
} from "./types";

export interface FormatOutput {
  samples: ParsedSample[];
  warnings: ParseWarning[];
  toleranceHints: ToleranceHint[];
  summaryRowsSkipped: number;
}

const empty = (): FormatOutput => ({ samples: [], warnings: [], toleranceHints: [], summaryRowsSkipped: 0 });

const headerIndex = (headers: (string | null)[], re: RegExp) =>
  headers.findIndex((h) => h != null && re.test(h));

const rowHasValues = (row: unknown[] | undefined) =>
  !!row && row.some((c) => cleanText(c) != null);

/* ------------------------------------------------------------------ */
/* A. Wet-chemistry lab export: one row per sample, "<Nutrient> AR %" / "DW %" columns */
/* ------------------------------------------------------------------ */
export function parseLabExport(sheet: string, grid: Grid, headerRow: number): FormatOutput {
  const out = empty();
  const headers = (grid[headerRow] ?? []).map(cleanText);
  const idCol = headerIndex(headers, /^sample id$/i);
  const descCol = headerIndex(headers, /^sample description$/i);
  const sampledCol = headerIndex(headers, /date sampled/i);
  const receivedCol = headerIndex(headers, /date received/i);
  const accountCol = headerIndex(headers, /^account$/i);
  const nutrientCols = headers
    .map((h, i) => ({ i, m: matchNutrient(h) }))
    .filter((x): x is { i: number; m: NonNullable<ReturnType<typeof matchNutrient>> } => !!x.m);

  if (sampledCol < 0)
    out.warnings.push({
      level: "info",
      code: "date_received_used",
      message: "Lab export has no sampling date; using “Date Received” as the sample date.",
    });

  let placeholders = 0;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!rowHasValues(row)) continue;
    const externalId = cleanText(row[idCol]);
    const { sampleNo, dietCode } = parseSampleId(externalId);
    const results: ParsedResult[] = [];
    let dm: number | null = null;
    for (const { i, m } of nutrientCols) {
      if (isPlaceholder(row[i])) placeholders++;
      const v = cleanNumber(row[i]);
      if (m.nutrient === "dm") {
        if (m.basis === "as_received") dm = v;
        continue;
      }
      if (v == null) continue;
      results.push({ ...m, analyzed: v, intended: null, intendedOffset: null, sheetPct: null });
    }
    out.samples.push({
      sheet,
      ref: `row ${r + 1}`,
      externalId,
      sampleNo,
      dietCode,
      farmLabel: cleanText(row[descCol]),
      sampledOn: parseDate(row[sampledCol >= 0 ? sampledCol : receivedCol]),
      source: "lab",
      labOrInstrument: accountCol >= 0 ? `Lab · ${cleanText(row[accountCol]) ?? "unknown"}` : "Lab",
      dm,
      results,
    });
  }
  if (placeholders)
    out.warnings.push({
      level: "info",
      code: "placeholders_cleaned",
      message: `${placeholders} “///////” placeholder cells treated as not analysed.`,
    });
  return out;
}

/* ------------------------------------------------------------------ */
/* B. On-site NIR instrument export */
/* ------------------------------------------------------------------ */
export function parseNirExport(sheet: string, grid: Grid, headerRow: number): FormatOutput {
  const out = empty();
  const headers = (grid[headerRow] ?? []).map(cleanText);
  const timeCol = headerIndex(headers, /analysis time|date/i);
  const idCol = headerIndex(headers, /^sample (number|id)$/i);
  const instCol = headerIndex(headers, /^instrument name$/i);
  const nutrientCols = headers
    .map((h, i) => ({ i, m: matchNutrient(h) }))
    .filter((x): x is { i: number; m: NonNullable<ReturnType<typeof matchNutrient>> } => !!x.m);

  if (nutrientCols.some((c) => headers[c.i] === "NA"))
    out.warnings.push({
      level: "warn",
      code: "na_ambiguous",
      message:
        "NIR column “NA” is ambiguous (sodium vs salt). Values are checked against the formula and flagged if they look like NaCl.",
    });

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!rowHasValues(row)) continue;
    const externalId = cleanText(row[idCol]);
    const { sampleNo, dietCode } = parseSampleId(externalId);
    const results: ParsedResult[] = [];
    let moisture: number | null = null;
    for (const { i, m } of nutrientCols) {
      const v = cleanNumber(row[i]);
      if (v == null) continue;
      if (m.nutrient === "moisture") moisture = v;
      results.push({ ...m, analyzed: v, intended: null, intendedOffset: null, sheetPct: null });
    }
    out.samples.push({
      sheet,
      ref: `row ${r + 1}`,
      externalId,
      sampleNo,
      dietCode,
      farmLabel: null,
      sampledOn: parseDate(row[timeCol]),
      source: "nir",
      labOrInstrument: cleanText(row[instCol]) ?? "NIR",
      dm: moisture != null ? 100 - moisture : null,
      results,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* C. Hand-built transposed comparison: samples in columns, row blocks */
/*    "NIR Analyzed" / "Formula" / "Δ% Analyzed vs. Formula"            */
/* ------------------------------------------------------------------ */
export function parseTransposed(sheet: string, grid: Grid): FormatOutput {
  const out = empty();
  const label = (r: number) => cleanText(grid[r]?.[1]);
  let dateRow = -1;
  let idRow = -1;
  let sourceRow = -1;
  let mode: "analyzed" | "formula" | "pct" | null = null;
  const rows: Record<"analyzed" | "formula" | "pct", Map<NutrientCode, number>> = {
    analyzed: new Map(),
    formula: new Map(),
    pct: new Map(),
  };
  const labels: Record<"analyzed" | "pct", string[]> = { analyzed: [], pct: [] };

  for (let r = 0; r < grid.length; r++) {
    const b = label(r);
    if (b) {
      if (/^date/i.test(b)) dateRow = r;
      else if (/sample id/i.test(b)) idRow = r;
      else if (/vs\.? formula|^Δ|delta/i.test(b)) mode = "pct";
      else if (/analy[sz]ed/i.test(b)) {
        mode = "analyzed";
        sourceRow = r;
      } else if (/^formula/i.test(b)) mode = "formula";
    }
    const m = matchNutrient(grid[r]?.[0]);
    if (m && mode) {
      rows[mode].set(m.nutrient, r);
      if (mode !== "formula") labels[mode].push(cleanText(grid[r][0])!);
      if (mode === "pct") {
        const range = cleanText(grid[r][1])?.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
        if (range) out.toleranceHints.push({ nutrient: m.nutrient, low: +range[1], high: +range[2] });
      }
    }
  }

  const analyzedSet = [...rows.analyzed.keys()].filter((n) => n !== "moisture").sort().join();
  const pctSet = [...rows.pct.keys()].filter((n) => n !== "moisture").sort().join();
  if (pctSet && analyzedSet !== pctSet)
    out.warnings.push({
      level: "warn",
      code: "label_mismatch",
      message: `Analyzed rows (${labels.analyzed.join(", ")}) and Δ% rows (${labels.pct.join(", ")}) label nutrients differently; Δ% recomputed from source values.`,
    });

  const width = Math.max(...grid.map((r) => r?.length ?? 0));
  let divZero = 0;
  for (let c = 2; c < width; c++) {
    const externalId = cleanText(grid[idRow]?.[c]);
    const hasAnalyzed = [...rows.analyzed.values()].some((r) => cleanNumber(grid[r]?.[c]) != null);
    if (!externalId && !hasAnalyzed) {
      for (const r of rows.pct.values()) if (cleanText(grid[r]?.[c]) === "#DIV/0!") divZero++;
      continue;
    }
    const { sampleNo, dietCode } = parseSampleId(externalId);
    const src = cleanText(grid[sourceRow]?.[c]);
    const nutrients = new Set([...rows.analyzed.keys(), ...rows.formula.keys()]);
    const results: ParsedResult[] = [];
    let moisture: number | null = null;
    for (const n of nutrients) {
      const analyzed = cleanNumber(grid[rows.analyzed.get(n) ?? -1]?.[c]);
      const intended = cleanNumber(grid[rows.formula.get(n) ?? -1]?.[c]);
      if (n === "moisture") moisture = analyzed;
      if (analyzed == null && intended == null) continue;
      const pr = rows.pct.get(n);
      results.push({
        nutrient: n,
        basis: "as_received",
        analyzed,
        intended,
        intendedOffset: null,
        sheetPct: pr != null ? cleanNumber(grid[pr]?.[c]) : null,
      });
    }
    out.samples.push({
      sheet,
      ref: `column ${colName(c)}`,
      externalId,
      sampleNo,
      dietCode,
      farmLabel: null,
      sampledOn: parseDate(grid[dateRow]?.[c]),
      source: src && /lab/i.test(src) ? "lab" : "nir",
      labOrInstrument: src ?? null,
      dm: moisture != null ? 100 - moisture : null,
      results,
    });
  }
  if (divZero)
    out.warnings.push({
      level: "info",
      code: "div_zero_ignored",
      message: `${divZero} “#DIV/0!” cells in empty columns ignored.`,
    });
  return out;
}

/* ------------------------------------------------------------------ */
/* D. Row-per-sample "analyzed vs intended" sheets with a stats block  */
/* ------------------------------------------------------------------ */
interface Triplet {
  nutrient: NutrientCode;
  analyzedCol: number;
  intendedCol: number;
  offsetCol: number;
  offset: number;
  pctCol: number;
}

export function parseAnalysesVsIntended(sheet: string, grid: Grid, headerRow: number): FormatOutput {
  const out = empty();
  const headers = (grid[headerRow] ?? []).map(cleanText);
  const farmCol = headerIndex(headers, /^farm$/i);
  const dateCol = headerIndex(headers, /date/i);
  const dietCol = headerIndex(headers, /diet/i);
  const dmCol = headerIndex(headers, /^dm$/i);

  const triplets: Triplet[] = [];
  let cur: Triplet | null = null;
  headers.forEach((h, i) => {
    if (!h || i === dmCol) return;
    let m: RegExpMatchArray | null;
    if ((m = h.match(/^(.+?)\s+analy[sz]ed$/i))) {
      const n = matchNutrient(m[1]);
      if (!n) return;
      cur = { nutrient: n.nutrient, analyzedCol: i, intendedCol: -1, offsetCol: -1, offset: 0, pctCol: -1 };
      triplets.push(cur);
    } else if (cur && /intended\s*[–—-]\s*[\d.]+$/i.test(h)) {
      cur.offsetCol = i;
      cur.offset = parseIntendedOffset(h);
    } else if (cur && /^(pct|%) of intended$/i.test(h)) cur.pctCol = i;
    else if (cur && /intended$/i.test(h)) cur.intendedCol = i;
    else {
      const n = matchNutrient(h);
      if (n && i !== farmCol && i !== dateCol && i !== dietCol) {
        cur = null;
        triplets.push({ nutrient: n.nutrient, analyzedCol: i, intendedCol: -1, offsetCol: -1, offset: 0, pctCol: -1 });
      }
    }
  });

  let inSummary = false;
  const uncertainFarms = new Set<string>();
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!rowHasValues(row)) continue;
    // Stats labels sit in the diet/date column; guard with the date so a farm called "N" isn't mistaken for "n".
    if (!parseDate(row[dateCol]) && [row[dietCol], row[dateCol]].some(isSummaryLabel)) {
      inSummary = true;
      out.summaryRowsSkipped++;
      continue;
    }
    const sampledOn = parseDate(row[dateCol]);
    const diet = cleanText(row[dietCol]);
    if (inSummary || (!sampledOn && !diet)) {
      if (inSummary) out.summaryRowsSkipped++;
      else
        out.warnings.push({
          level: "info",
          code: "stray_row",
          message: `Row ${r + 1} has values but no date or diet; skipped.`,
          ref: `row ${r + 1}`,
        });
      continue;
    }
    const farm = farmCol >= 0 ? cleanText(row[farmCol]) : null;
    if (farm && /\?/.test(farm)) uncertainFarms.add(farm);
    const results: ParsedResult[] = [];
    for (const t of triplets) {
      const analyzed = cleanNumber(row[t.analyzedCol]);
      const intended = t.intendedCol >= 0 ? cleanNumber(row[t.intendedCol]) : null;
      if (analyzed == null && intended == null) continue;
      results.push({
        nutrient: t.nutrient,
        basis: "as_received",
        analyzed,
        intended,
        intendedOffset: t.offsetCol >= 0 ? t.offset : null,
        sheetPct: t.pctCol >= 0 ? cleanNumber(row[t.pctCol]) : null,
      });
    }
    if (!sampledOn)
      out.warnings.push({ level: "warn", code: "missing_date", message: `Row ${r + 1} has no sample date.`, ref: `row ${r + 1}` });
    out.samples.push({
      sheet,
      ref: `row ${r + 1}`,
      externalId: null,
      sampleNo: null,
      dietCode: diet,
      farmLabel: farm,
      sampledOn,
      source: "lab",
      labOrInstrument: null,
      dm: cleanNumber(row[dmCol]),
      results,
    });
  }

  for (const t of triplets) {
    const has = out.samples.some((s) => s.results.some((r) => r.nutrient === t.nutrient && r.analyzed != null));
    if (!has && out.samples.length)
      out.warnings.push({
        level: "warn",
        code: "nutrient_empty",
        message: `“${headers[t.analyzedCol]}” column is present but empty for all ${out.samples.length} samples.`,
      });
  }
  // Hand-built sheets drift: re-check the sheet's own "Pct of intended" against its stated formula.
  for (const t of triplets.filter((t) => t.pctCol >= 0)) {
    const refs = out.samples
      .filter((s) =>
        s.results.some((r) => {
          if (r.nutrient !== t.nutrient || r.sheetPct == null || r.analyzed == null || !r.intended) return false;
          const ours = (r.analyzed / (r.intended - (r.intendedOffset ?? 0))) * 100;
          return Math.abs(ours - r.sheetPct) > 0.5;
        }),
      )
      .map((s) => s.ref);
    if (refs.length)
      out.warnings.push({
        level: "warn",
        code: "sheet_formula_inconsistent",
        message: `${refs.length} ${t.nutrient.toUpperCase()} “Pct of intended” values in the sheet don't follow its own header formula; recalculated consistently.`,
        ref: refs.join(", "),
      });
  }
  for (const t of triplets.filter((t) => t.offset))
    out.warnings.push({
      level: "info",
      code: "intended_offset",
      message: `${headers[t.offsetCol]}: % of intended for ${t.nutrient.toUpperCase()} uses intended − ${t.offset}.`,
    });
  if (uncertainFarms.size)
    out.warnings.push({
      level: "warn",
      code: "uncertain_farm",
      message: `Farm labels marked uncertain in source: ${[...uncertainFarms].join(", ")}.`,
    });
  if (out.summaryRowsSkipped)
    out.warnings.push({
      level: "info",
      code: "summary_skipped",
      message: `${out.summaryRowsSkipped} summary rows (Mean, Median, CV…) excluded; recomputed from samples.`,
    });
  return out;
}

export function colName(c: number): string {
  let s = "";
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
