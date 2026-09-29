import type { NutrientCode, SourceKind } from "../parsers/types";
import { evaluate, type Evaluation } from "./deviation";
import type { Phase } from "./merge";
import type { ToleranceMap } from "./tolerances";

export interface ResultView {
  nutrient: NutrientCode;
  analyzed: number | null;
  intended: number | null;
  offset: number | null;
  sheetPct: number | null;
  ev: Evaluation;
}

export interface SampleView {
  id: string;
  locationId: string;
  locationName: string;
  millName: string | null;
  farmLabel: string | null;
  externalId: string | null;
  sampleNo: string | null;
  dietCode: string;
  dietKey: string;
  phase: Phase;
  sampledOn: string | null;
  source: SourceKind;
  labOrInstrument: string | null;
  sourceSheet: string | null;
  sourceRef: string | null;
  uploadId: string | null;
  results: Partial<Record<NutrientCode, ResultView>>;
}

export interface SampleRowDb {
  id: string;
  location_id: string;
  upload_id: string | null;
  farm_label: string | null;
  external_id: string | null;
  sample_no: string | null;
  diet_code: string | null;
  diet_key: string | null;
  phase: string | null;
  sampled_on: string | null;
  source: SourceKind;
  lab_or_instrument: string | null;
  source_sheet: string | null;
  source_ref: string | null;
  sample_results: {
    nutrient: NutrientCode;
    basis: string;
    analyzed: number | null;
    intended: number | null;
    intended_offset: number | null;
    sheet_pct: number | null;
  }[];
}

export interface LocationRow {
  id: string;
  name: string;
  mill_id: string | null;
}
export interface MillRow {
  id: string;
  name: string;
}

export function buildViews(rows: SampleRowDb[], tol: ToleranceMap, locations: LocationRow[], mills: MillRow[]): SampleView[] {
  const loc = new Map(locations.map((l) => [l.id, l]));
  const mill = new Map(mills.map((m) => [m.id, m.name]));
  return rows.map((r) => {
    const l = loc.get(r.location_id);
    const results: SampleView["results"] = {};
    for (const x of r.sample_results) {
      if (x.basis !== "as_received") continue;
      const input = { nutrient: x.nutrient, analyzed: num(x.analyzed), intended: num(x.intended), intendedOffset: num(x.intended_offset) };
      results[x.nutrient] = {
        nutrient: x.nutrient,
        analyzed: input.analyzed,
        intended: input.intended,
        offset: input.intendedOffset,
        sheetPct: num(x.sheet_pct),
        ev: evaluate(input, tol),
      };
    }
    flagWholeSampleMismatch(results);
    return {
      id: r.id,
      locationId: r.location_id,
      locationName: l?.name ?? "Unknown location",
      millName: l?.mill_id ? (mill.get(l.mill_id) ?? null) : null,
      farmLabel: r.farm_label,
      externalId: r.external_id,
      sampleNo: r.sample_no,
      dietCode: r.diet_code ?? "Unlabelled diet",
      dietKey: r.diet_key ?? "unlabelled",
      phase: (r.phase as Phase) ?? "Unassigned",
      sampledOn: r.sampled_on,
      source: r.source,
      labOrInstrument: r.lab_or_instrument,
      sourceSheet: r.source_sheet,
      sourceRef: r.source_ref,
      uploadId: r.upload_id,
      results,
    };
  });
}

const MISMATCH_NUTRIENTS: NutrientCode[] = ["cp", "ca", "p", "na"];

/**
 * When three or more headline nutrients are all far off in the same direction, the sample is very likely
 * not the diet it is labelled as (wrong bag, premix, concentrate). Treat it as a data question, not a feed problem.
 */
export function flagWholeSampleMismatch(results: SampleView["results"]): boolean {
  const pcts = MISMATCH_NUTRIENTS.map((n) => results[n]?.ev.pct).filter((p): p is number => p != null);
  const high = pcts.filter((p) => p > 160).length;
  const low = pcts.filter((p) => p < 55).length;
  if (high < 3 && low < 3) return false;
  const reason = `CP/Ca/P/Na all ${high >= 3 ? "far above" : "far below"} formula: sample may be mislabelled or not this diet`;
  for (const n of MISMATCH_NUTRIENTS) {
    const r = results[n];
    if (r?.ev.pct != null) r.ev = { ...r.ev, status: "suspect", reason };
  }
  return true;
}

/** PostgREST returns numeric columns as numbers or strings depending on precision. */
const num = (v: unknown): number | null => (v == null ? null : Number(v));
