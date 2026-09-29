import { normalizeDietCode, round } from "../parsers/normalize";
import type { NutrientCode, ParsedSample, SheetFormat } from "../parsers/types";

export type Phase = "Starter" | "Grower" | "Developer" | "Pre-lay" | "Layer" | "Unassigned";
export const PHASE_ORDER: Phase[] = ["Starter", "Grower", "Developer", "Pre-lay", "Layer", "Unassigned"];

/**
 * Flock phase from the diet name, falling back to formulated Ca (layer diets ≥ 3% Ca,
 * pre-lay ~2–3%, rearing diets ~1%) when the name is only a formula code like "W23954".
 */
export function inferPhase(dietCode: string | null, intendedCa: number | null): Phase {
  const d = (dietCode ?? "").toLowerCase();
  if (/pre-?\s?lay/.test(d)) return "Pre-lay";
  if (/devel/.test(d)) return "Developer";
  if (/grow/.test(d)) return "Grower";
  if (/start|\bst-?\d|^ps\b/.test(d)) return "Starter";
  if (/(^|\s)\d-\d{2}|layer|wv\d/.test(d)) return "Layer";
  if (intendedCa != null) {
    if (intendedCa >= 3) return "Layer";
    if (intendedCa >= 1.8) return "Pre-lay";
    return "Grower";
  }
  return "Unassigned";
}

const ar = (s: ParsedSample, n: NutrientCode) =>
  s.results.find((r) => r.nutrient === n && r.basis === "as_received")?.analyzed ?? null;

/**
 * Identity of a physical analysis. Two rows with the same sample number, date and headline results are
 * the same analysis re-keyed into another sheet (e.g. F1 duplicates Ex4; Loc B repeats the Ex1 lab rows).
 * A lab and an NIR scan of the same sample differ in values, so both are kept for the disagreement check.
 */
export function dedupeKey(s: ParsedSample): string {
  const v = (n: NutrientCode) => {
    const x = ar(s, n);
    return x == null ? "" : round(x, 2).toString();
  };
  const who = s.sampleNo
    ? `#${s.sampleNo}`
    : `${normalizeDietCode(s.dietCode ?? "")}@${(s.farmLabel ?? "").toLowerCase()}`;
  return [who, s.sampledOn ?? "", v("cp"), v("ca"), v("p"), v("fat")].join("|");
}

/** Raw instrument/lab exports carry better metadata than hand-built comparison sheets. */
const FORMAT_PRIORITY: Record<SheetFormat, number> = {
  lab_export: 3,
  nir_export: 3,
  analyses_vs_intended: 2,
  transposed_comparison: 1,
  unknown: 0,
};

export interface MergeInput extends ParsedSample {
  format: SheetFormat;
}

/** Collapse duplicates, keeping the best metadata and filling in any intended/analyzed gaps from the others. */
export function mergeSamples(samples: MergeInput[]): { merged: MergeInput[]; duplicates: number } {
  const byKey = new Map<string, MergeInput>();
  let duplicates = 0;
  for (const s of samples) {
    const k = dedupeKey(s);
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, { ...s, results: s.results.map((r) => ({ ...r })) });
      continue;
    }
    duplicates++;
    const [keep, other] = FORMAT_PRIORITY[s.format] > FORMAT_PRIORITY[prev.format] ? [{ ...s, results: s.results.map((r) => ({ ...r })) }, prev] : [prev, s];
    for (const r of other.results) {
      const mine = keep.results.find((x) => x.nutrient === r.nutrient && x.basis === r.basis);
      if (!mine) keep.results.push({ ...r });
      else {
        mine.analyzed ??= r.analyzed;
        mine.intended ??= r.intended;
        mine.intendedOffset ??= r.intendedOffset;
        mine.sheetPct ??= r.sheetPct;
      }
    }
    keep.farmLabel ??= other.farmLabel;
    keep.dm ??= other.dm;
    byKey.set(k, keep);
  }
  return { merged: [...byKey.values()], duplicates };
}

export interface Formulation {
  dietKey: string;
  effectiveFrom: string;
  nutrient: NutrientCode;
  intended: number;
}

/** Collect formulated values seen in uploads so raw lab/NIR results can be matched to them later. */
export function extractFormulations(samples: ParsedSample[]): Formulation[] {
  const seen = new Map<string, Formulation>();
  for (const s of samples) {
    if (!s.dietCode || !s.sampledOn) continue;
    for (const r of s.results) {
      if (r.intended == null || r.basis !== "as_received") continue;
      const f = { dietKey: normalizeDietCode(s.dietCode), effectiveFrom: s.sampledOn, nutrient: r.nutrient, intended: r.intended };
      seen.set(`${f.dietKey}|${f.effectiveFrom}|${f.nutrient}`, f);
    }
  }
  return [...seen.values()];
}

/** Fill missing intended values from the formulation in effect on the sample date (latest on/before, else earliest after). */
export function applyFormulations(samples: ParsedSample[], formulations: Formulation[]): { matched: number; unmatched: string[] } {
  const byDiet = new Map<string, Formulation[]>();
  for (const f of formulations) byDiet.set(f.dietKey, [...(byDiet.get(f.dietKey) ?? []), f]);
  let matched = 0;
  const unmatched = new Set<string>();
  for (const s of samples) {
    const missing = s.results.filter((r) => r.intended == null && r.basis === "as_received");
    if (!missing.length || !s.dietCode) continue;
    const list = byDiet.get(normalizeDietCode(s.dietCode));
    if (!list) {
      unmatched.add(s.dietCode);
      continue;
    }
    let hit = false;
    for (const r of missing) {
      const cands = list.filter((f) => f.nutrient === r.nutrient).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
      const before = cands.filter((f) => !s.sampledOn || f.effectiveFrom <= s.sampledOn).at(-1);
      const f = before ?? cands[0];
      if (f) {
        r.intended = f.intended;
        hit = true;
      }
    }
    if (hit) matched++;
  }
  return { matched, unmatched: [...unmatched] };
}
