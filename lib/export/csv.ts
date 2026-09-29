import { NUTRIENT_META } from "../analysis/tolerances";
import type { SampleView } from "../analysis/view";
import { NUTRIENTS } from "../parsers/types";

const cell = (v: unknown) => {
  if (v == null) return "";
  const s = typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per sample; analyzed, intended, % of intended and status per nutrient. */
export function samplesToCsv(samples: SampleView[]): string {
  const nutrients = NUTRIENTS.filter((n) => samples.some((s) => s.results[n]));
  const head = [
    "Location", "Feed mill", "Farm", "Diet", "Phase", "Sample ID", "Sampled on", "Source", "Lab / instrument", "Source sheet", "Source ref",
    ...nutrients.flatMap((n) => {
      const l = NUTRIENT_META[n].short;
      return [`${l} analyzed`, `${l} intended`, `${l} % of intended`, `${l} status`];
    }),
  ];
  const rows = samples.map((s) => [
    s.locationName, s.millName, s.farmLabel, s.dietCode, s.phase, s.externalId, s.sampledOn, s.source, s.labOrInstrument, s.sourceSheet, s.sourceRef,
    ...nutrients.flatMap((n) => {
      const r = s.results[n];
      return [r?.analyzed, r?.intended, r?.ev.pct, r ? r.ev.status : null];
    }),
  ]);
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
