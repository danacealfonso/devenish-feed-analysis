import { computeFlags } from "../analysis/flags";
import { PHASE_ORDER } from "../analysis/merge";
import { summarize } from "../analysis/stats";
import { NUTRIENT_META, type ToleranceRule } from "../analysis/tolerances";
import type { LocationRow, MillRow, SampleView } from "../analysis/view";
import { NUTRIENTS, type NutrientCode } from "../parsers/types";

const r2 = (v: number | null | undefined) => (v == null ? "-" : String(Math.round(v * 100) / 100));
const r0 = (v: number | null | undefined) => (v == null ? "-" : String(Math.round(v)));

/**
 * Plain-text snapshot of everything the portal shows for one customer: the same computed
 * % of intended, statuses, flags and stats, so the assistant's numbers match the screen.
 * Deterministic for a given dataset so the prompt cache holds across a conversation.
 */
export function buildAssistantContext(input: {
  locations: LocationRow[];
  mills: MillRow[];
  rules: ToleranceRule[];
  samples: SampleView[];
}): string {
  const { locations, mills, rules, samples } = input;
  const out: string[] = [];
  const millName = (id: string | null) => mills.find((m) => m.id === id)?.name ?? "no mill assigned";
  const present = NUTRIENTS.filter((n) => n !== "dm" && samples.some((s) => s.results[n]?.analyzed != null));

  out.push("## Locations");
  for (const l of [...locations].sort((a, b) => a.name.localeCompare(b.name)))
    out.push(`- ${l.name} (fed from ${millName(l.mill_id)}): ${samples.filter((s) => s.locationId === l.id).length} samples`);

  out.push("", "## Tolerance bands (% of intended unless noted)");
  for (const r of rules.filter((r) => present.includes(r.nutrient))) {
    const m = NUTRIENT_META[r.nutrient];
    out.push(
      r.mode === "abs_min"
        ? `- ${m.short}: watch below ${r.watchLow} ppm, action below ${r.actionLow} ppm`
        : `- ${m.short}: watch outside ${r.watchLow ?? "-"}-${r.watchHigh ?? "-"}, action below ${r.actionLow ?? "-"} or above ${r.actionHigh ?? "-"}${r.intendedOffset ? `, default intended offset ${r.intendedOffset}` : ""}`,
    );
  }

  const dates = samples.map((s) => s.sampledOn).filter((d): d is string => !!d).sort();
  out.push("", `## Samples: ${samples.length}, from ${dates[0] ?? "-"} to ${dates[dates.length - 1] ?? "-"}`);

  out.push("", "## Needs attention (latest result per diet in the current sampling cycle)");
  const flags = computeFlags(samples);
  if (!flags.length) out.push("- Nothing flagged.");
  for (const f of flags) out.push(`- [${f.severity}] ${f.title} (${f.date ?? "undated"}): ${f.detail}`);

  out.push("", "## Summary statistics (% of intended; ppm for Zn/Cu)");
  for (const n of present) {
    const abs = rules.find((r) => r.nutrient === n)?.mode === "abs_min";
    const st = summarize(samples.map((s) => (abs ? s.results[n]?.analyzed : s.results[n]?.ev.pct)));
    if (!st.n) continue;
    const counts = { ok: 0, watch: 0, action: 0, suspect: 0 };
    for (const s of samples) {
      const e = s.results[n]?.ev.status;
      if (e && e in counts) counts[e as keyof typeof counts]++;
    }
    out.push(
      `- ${NUTRIENT_META[n].short}: n=${st.n}, mean ${r0(st.mean)}, median ${r0(st.median)}, CV ${r0(st.cv)}%, range ${r0(st.min)}-${r0(st.max)}; ok ${counts.ok}, watch ${counts.watch}, action ${counts.action}, suspect ${counts.suspect}`,
    );
  }

  out.push(
    "",
    "## All results by location > flock phase > diet (newest first)",
    `Format per nutrient: analyzed/intended = % of intended [status]. Offset shown as "-x" when intended was reduced. Nutrients: ${present.map((n) => NUTRIENT_META[n].short).join(", ")}.`,
  );
  const byLoc = new Map<string, SampleView[]>();
  for (const s of samples) byLoc.set(s.locationName, [...(byLoc.get(s.locationName) ?? []), s]);
  for (const [loc, list] of [...byLoc.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    out.push("", `### ${loc}`);
    const byPhase = new Map<string, SampleView[]>();
    for (const s of list) byPhase.set(s.phase, [...(byPhase.get(s.phase) ?? []), s]);
    for (const phase of PHASE_ORDER.filter((p) => byPhase.has(p))) {
      out.push(`#### ${phase} diets`);
      const byDiet = new Map<string, SampleView[]>();
      for (const s of byPhase.get(phase)!) {
        const k = `${s.dietCode}${s.farmLabel ? ` (Farm ${s.farmLabel})` : ""}`;
        byDiet.set(k, [...(byDiet.get(k) ?? []), s]);
      }
      for (const [diet, ds] of [...byDiet.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
        out.push(`Diet ${diet}:`);
        for (const s of ds.sort((a, b) => (b.sampledOn ?? "").localeCompare(a.sampledOn ?? ""))) {
          const cells = present
            .map((n) => cell(n, s))
            .filter(Boolean)
            .join("; ");
          out.push(`- ${s.sampledOn ?? "undated"} ${s.source.toUpperCase()}${s.externalId ? ` ${s.externalId}` : ""}: ${cells}`);
        }
      }
    }
  }
  return out.join("\n");
}

function cell(n: NutrientCode, s: SampleView): string {
  const r = s.results[n];
  if (!r || r.analyzed == null) return "";
  const short = NUTRIENT_META[n].short;
  if (r.ev.pct == null) return `${short} ${r2(r.analyzed)}${NUTRIENT_META[n].unit === "ppm" ? "ppm" : ""} [${r.ev.status}]`;
  const off = r.offset ? `-${r.offset}` : "";
  const why = r.ev.reason ? `: ${r.ev.reason}` : "";
  return `${short} ${r2(r.analyzed)}/${r2(r.intended)}${off} = ${r0(r.ev.pct)}% [${r.ev.status}${why}]`;
}
