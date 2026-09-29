import type { NutrientCode } from "../parsers/types";
import { NUTRIENT_META } from "./tolerances";
import type { SampleView } from "./view";

export type FlagSeverity = "action" | "suspect" | "watch" | "info";

export interface Flag {
  id: string;
  severity: FlagSeverity;
  kind: "deviation" | "repeat" | "suspect" | "lab_vs_nir" | "no_target";
  nutrient: NutrientCode | null;
  sampleIds: string[];
  dietKey: string | null;
  locationId: string | null;
  title: string;
  detail: string;
  date: string | null;
  score: number;
}

const WEIGHT: Partial<Record<NutrientCode, number>> = { ca: 1.5, p: 1.2, cp: 1.2, na: 1.1 };
const FLAG_NUTRIENTS: NutrientCode[] = ["cp", "ca", "p", "na", "nacl", "fat", "zn", "cu"];

export const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "undated";

const where = (s: SampleView) => `${s.dietCode} · ${s.locationName}${s.farmLabel ? ` · Farm ${s.farmLabel}` : ""}`;
const ordinal = (n: number) => `${n}${n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

/**
 * "Needs attention" is about the current state: for every location × farm × diet × nutrient we look at the
 * most recent result, and how many results in a row before it were off in the same direction.
 */
export const CURRENT_WINDOW_DAYS = 45;

/** Start of the current submission cycle: samples are submitted about monthly, so ~6 weeks back from the newest. */
export function currentCycleStart(samples: SampleView[]): string | null {
  const latest = samples.reduce<string | null>((m, s) => (s.sampledOn && (!m || s.sampledOn > m) ? s.sampledOn : m), null);
  if (!latest) return null;
  const d = new Date(`${latest}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - CURRENT_WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

export function computeFlags(samples: SampleView[]): Flag[] {
  const flags: Flag[] = [];
  const cycleStart = currentCycleStart(samples);
  const groups = new Map<string, SampleView[]>();
  for (const s of samples) {
    const k = `${s.locationId}|${s.farmLabel ?? ""}|${s.dietKey}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }

  for (const [key, list] of groups) {
    list.sort((a, b) => (a.sampledOn ?? "").localeCompare(b.sampledOn ?? ""));
    const latest = list[list.length - 1];
    // Diets not sampled in the current cycle are history, not something to act on now.
    if (cycleStart && (latest.sampledOn ?? "") < cycleStart) continue;
    for (const n of FLAG_NUTRIENTS) {
      const r = latest.results[n];
      if (!r) continue;
      const { status, direction, pct, reason } = r.ev;
      const meta = NUTRIENT_META[n];
      if (status === "suspect") {
        const whole = reason?.startsWith("CP/Ca/P/Na");
        if (whole && flags.some((f) => f.id === `${key}|mismatch`)) continue;
        flags.push({
          id: whole ? `${key}|mismatch` : `${key}|${n}|suspect`,
          severity: "suspect",
          kind: "suspect",
          nutrient: whole ? null : n,
          sampleIds: [latest.id],
          dietKey: latest.dietKey,
          locationId: latest.locationId,
          title: whole ? `Check sample identity: ${where(latest)}` : `Check ${meta.short} result for ${where(latest)}`,
          detail: whole
            ? `${reason}. ${(["cp", "ca", "p", "na"] as NutrientCode[])
                .map((x) => `${NUTRIENT_META[x].short} ${fmtPct(latest.results[x]?.ev.pct)}`)
                .join(", ")} of intended.`
            : `${fmtVal(r.analyzed, meta.unit)} analyzed vs ${fmtVal(r.intended, meta.unit)} intended (${fmtPct(pct)}): ${reason}.`,
          date: latest.sampledOn,
          score: 200,
        });
        continue;
      }
      if (status !== "action" && status !== "watch") continue;
      let run = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i].results[n]?.ev;
        if (e && (e.status === "action" || e.status === "watch") && e.direction === direction) run++;
        else break;
      }
      if (status === "watch" && run < 2) continue;
      const dirWord = direction === "low" ? "low" : "high";
      const vs = pct != null ? `${fmtPct(pct)} of intended` : reason;
      flags.push({
        id: `${key}|${n}|${status}`,
        severity: status,
        kind: run >= 2 ? "repeat" : "deviation",
        nutrient: n,
        sampleIds: list.slice(-run).map((s) => s.id),
        dietKey: latest.dietKey,
        locationId: latest.locationId,
        title: `${meta.short} ${dirWord} in ${where(latest)}`,
        detail:
          `${fmtVal(r.analyzed, meta.unit)} analyzed vs ${fmtVal(r.intended, meta.unit)} intended (${vs}).` +
          (run >= 2 ? ` ${ordinal(run)} ${dirWord} result in a row.` : "") +
          (meta.why ? ` Affects ${meta.why}.` : ""),
        date: latest.sampledOn,
        score: (status === "action" ? 300 : 100) + Math.abs(100 - (pct ?? 100)) * (WEIGHT[n] ?? 1) + run * 15,
      });
    }
  }

  // Same physical sample analysed by both the lab and the NIR.
  const bySampleNo = new Map<string, SampleView[]>();
  for (const s of samples) if (s.sampleNo) bySampleNo.set(s.sampleNo, [...(bySampleNo.get(s.sampleNo) ?? []), s]);
  for (const [no, list] of bySampleNo) {
    const lab = list.find((s) => s.source === "lab");
    const nir = list.find((s) => s.source === "nir");
    if (!lab || !nir) continue;
    const diffs = (["cp", "ca", "p", "fat"] as NutrientCode[])
      .map((n) => ({ n, a: lab.results[n]?.analyzed, b: nir.results[n]?.analyzed }))
      .filter((d): d is { n: NutrientCode; a: number; b: number } => d.a != null && d.b != null && d.a !== 0)
      .filter((d) => Math.abs(d.b - d.a) / d.a > 0.1);
    if (diffs.length)
      flags.push({
        id: `labnir|${no}`,
        severity: "watch",
        kind: "lab_vs_nir",
        nutrient: diffs[0].n,
        sampleIds: [lab.id, nir.id],
        dietKey: lab.dietKey,
        locationId: lab.locationId,
        title: `Lab and NIR disagree on sample #${no}`,
        detail: diffs.map((d) => `${NUTRIENT_META[d.n].short}: lab ${d.a} vs NIR ${d.b}`).join("; ") + ". NIR calibration may need checking.",
        date: lab.sampledOn,
        score: 150,
      });
  }

  const noTarget = samples.filter((s) => ["cp", "ca", "p"].every((n) => s.results[n as NutrientCode]?.ev.status === "no_target"));
  if (noTarget.length) {
    const diets = [...new Set(noTarget.map((s) => s.dietCode))];
    flags.push({
      id: "no_target",
      severity: "info",
      kind: "no_target",
      nutrient: null,
      sampleIds: noTarget.map((s) => s.id),
      dietKey: null,
      locationId: null,
      title: `${noTarget.length} sample${noTarget.length > 1 ? "s" : ""} could not be matched to a formulation`,
      detail: `Diet codes: ${diets.slice(0, 6).join(", ")}${diets.length > 6 ? "…" : ""}. Upload the formulation or map the diet code.`,
      date: null,
      score: 50,
    });
  }

  return flags.sort((a, b) => b.score - a.score);
}

export function fmtVal(v: number | null | undefined, unit: "%" | "ppm" = "%"): string {
  if (v == null) return "—";
  const dp = unit === "ppm" ? 0 : Math.abs(v) < 1 ? 2 : Math.abs(v) < 10 ? 2 : 1;
  return `${v.toFixed(dp)}${unit === "ppm" ? " ppm" : "%"}`;
}

export const fmtPct = (p: number | null | undefined) => (p == null ? "—" : `${Math.round(p)}%`);
