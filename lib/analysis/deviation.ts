import { NA_PER_NACL } from "../parsers/normalize";
import type { NutrientCode } from "../parsers/types";
import type { ToleranceMap } from "./tolerances";

export type Status = "ok" | "watch" | "action" | "suspect" | "no_target" | "missing";
export type Direction = "low" | "high" | null;

export interface Evaluation {
  pct: number | null;
  status: Status;
  direction: Direction;
  reason: string | null;
}

export interface ResultInput {
  nutrient: NutrientCode;
  analyzed: number | null;
  intended: number | null;
  /** Offset from the source file; null means "use the tolerance rule default". */
  intendedOffset: number | null;
}

export function effectiveOffset(r: ResultInput, tol: ToleranceMap): number {
  return r.intendedOffset ?? tol[r.nutrient]?.intendedOffset ?? 0;
}

/** % of intended = analyzed / (intended − offset) × 100 — the convention used in the hand-built sheets. */
export function pctOfIntended(r: ResultInput, tol: ToleranceMap): number | null {
  if (r.analyzed == null || r.intended == null) return null;
  const denom = r.intended - effectiveOffset(r, tol);
  return denom > 0 ? (r.analyzed / denom) * 100 : null;
}

export function evaluate(r: ResultInput, tol: ToleranceMap): Evaluation {
  const rule = tol[r.nutrient];
  if (r.analyzed == null) return { pct: null, status: "missing", direction: null, reason: null };

  if (rule?.mode === "abs_min") {
    const v = r.analyzed;
    if (rule.actionLow != null && v < rule.actionLow)
      return { pct: null, status: "action", direction: "low", reason: `below ${rule.actionLow} ppm floor` };
    if (rule.watchLow != null && v < rule.watchLow)
      return { pct: null, status: "watch", direction: "low", reason: `below ${rule.watchLow} ppm target` };
    return { pct: null, status: "ok", direction: null, reason: null };
  }

  const pct = pctOfIntended(r, tol);
  if (pct == null) return { pct: null, status: "no_target", direction: null, reason: "no formulated value" };
  const direction: Direction = pct < 100 ? "low" : pct > 100 ? "high" : null;

  if (r.analyzed <= 0 || pct < 25 || pct > 300)
    return { pct, status: "suspect", direction, reason: "implausible result: check sample label or lab entry" };

  // NIR "NA" channels are sometimes calibrated for salt; flag when the value only makes sense as NaCl.
  if (r.nutrient === "na" && r.intended && pct > 160) {
    const asNa = (r.analyzed * NA_PER_NACL) / r.intended;
    if (asNa > 0.8 && asNa < 1.25)
      return { pct, status: "suspect", direction, reason: "value looks like salt (NaCl), not sodium" };
  }

  if (!rule) return { pct, status: "ok", direction, reason: null };
  if ((rule.actionLow != null && pct < rule.actionLow) || (rule.actionHigh != null && pct > rule.actionHigh))
    return { pct, status: "action", direction, reason: null };
  if ((rule.watchLow != null && pct < rule.watchLow) || (rule.watchHigh != null && pct > rule.watchHigh))
    return { pct, status: "watch", direction, reason: null };
  return { pct, status: "ok", direction, reason: null };
}

export const STATUS_RANK: Record<Status, number> = {
  action: 4,
  suspect: 3,
  watch: 2,
  ok: 1,
  no_target: 0,
  missing: 0,
};
