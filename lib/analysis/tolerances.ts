import type { NutrientCode } from "../parsers/types";

export interface ToleranceRule {
  nutrient: NutrientCode;
  /** "pct": compare analyzed to intended; "abs_min": compare to an absolute floor (trace minerals with no formula value). */
  mode: "pct" | "abs_min";
  watchLow: number | null;
  watchHigh: number | null;
  actionLow: number | null;
  actionHigh: number | null;
  /** Default subtracted from intended when the source file doesn't specify one (Ca assay allowance). */
  intendedOffset: number;
}

/**
 * Defaults drawn from the sample workbooks:
 *  - watch band = "Acceptable range" in the NIR-vs-formula sheets (CP 98–105, Ca 95–108, P 98–105, Na 90–110)
 *  - action floor = "Lower acceptable limit" in the analyses-vs-intended sheets (85% for CP/Ca/Na)
 *  - Zn/Cu floors in ppm (Zn 100–110, Cu 25)
 * Upper action limits are not given anywhere in the data and are our assumption.
 */
export const DEFAULT_TOLERANCES: ToleranceRule[] = [
  { nutrient: "cp", mode: "pct", watchLow: 98, watchHigh: 105, actionLow: 85, actionHigh: 115, intendedOffset: 0 },
  { nutrient: "ca", mode: "pct", watchLow: 95, watchHigh: 108, actionLow: 85, actionHigh: 125, intendedOffset: 0 },
  { nutrient: "p", mode: "pct", watchLow: 98, watchHigh: 105, actionLow: 85, actionHigh: 125, intendedOffset: 0 },
  { nutrient: "na", mode: "pct", watchLow: 90, watchHigh: 110, actionLow: 85, actionHigh: 130, intendedOffset: 0 },
  { nutrient: "nacl", mode: "pct", watchLow: 90, watchHigh: 110, actionLow: 85, actionHigh: 130, intendedOffset: 0 },
  { nutrient: "fat", mode: "pct", watchLow: 90, watchHigh: 115, actionLow: 75, actionHigh: 140, intendedOffset: 0 },
  { nutrient: "fiber", mode: "pct", watchLow: 85, watchHigh: 115, actionLow: null, actionHigh: null, intendedOffset: 0 },
  { nutrient: "moisture", mode: "pct", watchLow: 90, watchHigh: 110, actionLow: null, actionHigh: null, intendedOffset: 0 },
  { nutrient: "zn", mode: "abs_min", watchLow: 110, watchHigh: null, actionLow: 100, actionHigh: null, intendedOffset: 0 },
  { nutrient: "cu", mode: "abs_min", watchLow: 25, watchHigh: null, actionLow: 20, actionHigh: null, intendedOffset: 0 },
];

export type ToleranceMap = Partial<Record<NutrientCode, ToleranceRule>>;

export const toMap = (rules: ToleranceRule[]): ToleranceMap =>
  Object.fromEntries(rules.map((r) => [r.nutrient, r]));

export const NUTRIENT_META: Record<
  NutrientCode,
  { label: string; short: string; unit: "%" | "ppm"; why: string; key: boolean; order: number }
> = {
  cp: { label: "Crude protein", short: "CP", unit: "%", why: "egg mass and egg weight", key: true, order: 1 },
  ca: { label: "Calcium", short: "Ca", unit: "%", why: "eggshell strength and skeletal reserves", key: true, order: 2 },
  p: { label: "Total phosphorus", short: "P", unit: "%", why: "bone integrity and shell quality; excess costs money", key: true, order: 3 },
  na: { label: "Sodium", short: "Na", unit: "%", why: "water intake, litter moisture and egg weight", key: true, order: 4 },
  nacl: { label: "Salt (NaCl)", short: "NaCl", unit: "%", why: "sodium supply", key: false, order: 5 },
  fat: { label: "Crude fat", short: "Fat", unit: "%", why: "dietary energy and egg size", key: false, order: 6 },
  fiber: { label: "Crude fiber", short: "Fiber", unit: "%", why: "ingredient quality and energy dilution", key: false, order: 7 },
  moisture: { label: "Moisture", short: "Moist.", unit: "%", why: "dilutes every nutrient; mould risk", key: false, order: 8 },
  dm: { label: "Dry matter", short: "DM", unit: "%", why: "", key: false, order: 9 },
  cl: { label: "Chloride", short: "Cl", unit: "%", why: "electrolyte balance", key: false, order: 10 },
  zn: { label: "Zinc", short: "Zn", unit: "ppm", why: "feathering, immunity and shell formation", key: false, order: 11 },
  cu: { label: "Copper", short: "Cu", unit: "ppm", why: "connective tissue and immunity", key: false, order: 12 },
};
