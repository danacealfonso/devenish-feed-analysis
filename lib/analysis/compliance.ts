import type { NutrientCode } from "../parsers/types";
import { summarize } from "./stats";
import type { SampleView } from "./view";

export const KEY_NUTRIENTS: NutrientCode[] = ["cp", "ca", "p", "na"];

export interface Compliance {
  n: number;
  inBand: number;
  pctInBand: number | null;
  median: number | null;
  action: number;
  suspect: number;
}

/** How many results for a nutrient landed inside the watch band ("in band"), with median % of intended. */
export function compliance(samples: SampleView[], n: NutrientCode): Compliance {
  const rs = samples.map((s) => s.results[n]).filter((r) => r?.ev.pct != null);
  const scored = rs.filter((r) => r!.ev.status !== "suspect");
  const inBand = scored.filter((r) => r!.ev.status === "ok").length;
  return {
    n: rs.length,
    inBand,
    pctInBand: scored.length ? (inBand / scored.length) * 100 : null,
    median: summarize(scored.map((r) => r!.ev.pct)).median,
    action: rs.filter((r) => r!.ev.status === "action").length,
    suspect: rs.filter((r) => r!.ev.status === "suspect").length,
  };
}

export const monthOf = (d: string | null) => (d ? d.slice(0, 7) : null);

export const monthLabel = (m: string, style: "short" | "long" = "short") =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: style, year: style === "short" ? "2-digit" : "numeric" });

/** One row per month with % in band per nutrient; months without samples are skipped. */
export function monthlyCompliance(samples: SampleView[], nutrients: NutrientCode[] = KEY_NUTRIENTS) {
  const byMonth = new Map<string, SampleView[]>();
  for (const s of samples) {
    const m = monthOf(s.sampledOn);
    if (m) byMonth.set(m, [...(byMonth.get(m) ?? []), s]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, list]) => {
      const row: Record<string, number | string | null> = { month, samples: list.length };
      for (const n of nutrients) {
        const c = compliance(list, n);
        row[n] = c.pctInBand != null ? Math.round(c.pctInBand) : null;
        row[`${n}_median`] = c.median != null ? Math.round(c.median) : null;
      }
      return row;
    });
}

export function latestDate(samples: SampleView[]): string | null {
  return samples.reduce<string | null>((m, s) => (s.sampledOn && (!m || s.sampledOn > m) ? s.sampledOn : m), null);
}
