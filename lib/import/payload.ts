import { dedupeKey, extractFormulations, inferPhase, type MergeInput } from "../analysis/merge";
import { normalizeDietCode } from "../parsers/normalize";
import type { SheetParse } from "../parsers/types";

export interface LocatedSample extends MergeInput {
  locationId: string;
}

export interface SampleRow {
  location_id: string;
  farm_label: string | null;
  external_id: string | null;
  sample_no: string | null;
  diet_code: string | null;
  diet_key: string | null;
  phase: string;
  sampled_on: string | null;
  source: string;
  lab_or_instrument: string | null;
  dm: number | null;
  source_sheet: string;
  source_ref: string;
  dedupe_key: string;
  results: {
    nutrient: string;
    basis: string;
    analyzed: number | null;
    intended: number | null;
    intended_offset: number | null;
    sheet_pct: number | null;
  }[];
}

export function toSampleRows(samples: LocatedSample[]): SampleRow[] {
  return samples.map((s) => {
    const ca = s.results.find((r) => r.nutrient === "ca" && r.basis === "as_received")?.intended ?? null;
    return {
      location_id: s.locationId,
      farm_label: s.farmLabel,
      external_id: s.externalId,
      sample_no: s.sampleNo,
      diet_code: s.dietCode,
      diet_key: s.dietCode ? normalizeDietCode(s.dietCode) : null,
      phase: inferPhase(s.dietCode, ca),
      sampled_on: s.sampledOn,
      source: s.source,
      lab_or_instrument: s.labOrInstrument,
      dm: s.dm,
      source_sheet: s.sheet,
      source_ref: s.ref,
      dedupe_key: dedupeKey(s),
      results: s.results.map((r) => ({
        nutrient: r.nutrient,
        basis: r.basis,
        analyzed: r.analyzed,
        intended: r.intended,
        intended_offset: r.intendedOffset,
        sheet_pct: r.sheetPct,
      })),
    };
  });
}

export function toFormulationRows(samples: LocatedSample[]) {
  return extractFormulations(samples).map((f) => ({
    diet_key: f.dietKey,
    effective_from: f.effectiveFrom,
    nutrient: f.nutrient,
    intended: f.intended,
  }));
}

export function sheetSummaries(parses: SheetParse[]) {
  return parses.map((p) => ({
    sheet: p.sheet,
    format: p.format,
    confidence: p.confidence,
    samples: p.samples.length,
    warnings: p.warnings,
  }));
}
