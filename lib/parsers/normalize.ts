import type { Basis, NutrientCode } from "./types";

/** Molar-mass ratio Na / NaCl, for converting salt to sodium. */
export const NA_PER_NACL = 22.99 / 58.44;

const NULL_TOKENS = /^(\/+|#DIV\/0!|#N\/A|#VALUE!|#REF!|—|–|-|n\/?a|nd|)$/i;

/** Coerce a raw cell to a finite number, treating lab placeholders ("///////", "#DIV/0!", "—") as missing. */
export function cleanNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/,/g, "");
  if (NULL_TOKENS.test(s)) return null;
  const m = s.match(/^[<>]?\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*%?$/i);
  return m ? Number(m[1]) : null;
}

export function isPlaceholder(v: unknown): boolean {
  return typeof v === "string" && v.trim() !== "" && cleanNumber(v) === null;
}

export function cleanText(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Excel serial day → ISO date (1900 date system; serial 25569 = 1970-01-01). */
export function excelSerialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Parse the date formats seen across lab/NIR exports: Excel serials, JS Dates,
 * ISO ("2026-08-21 10:25:59") and US ("5/1/2026 10:11:03 AM").
 */
export function parseDate(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number") {
    // Plausible serial range: 1990-01-01 .. 2100-01-01
    return v > 32874 && v < 73051 ? excelSerialToIso(v) : null;
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(y, +m[1], +m[2]);
  }
  return null;
}

const ALIASES: [RegExp, NutrientCode][] = [
  [/^m[io]{2}sture$/, "moisture"],
  [/^(dry matter|dm)$/, "dm"],
  [/^(protein( \(crude\))?|crude protein|cp)$/, "cp"],
  [/^(fat( \(crude\))?|crude fat|ee)$/, "fat"],
  [/^(fib(er|re)( \(crude\))?|crude fib(er|re)|cf)$/, "fiber"],
  [/^(ca|calcium( \(total\))?)$/, "ca"],
  [/^(p|p-total|phosphorus( \(total\))?|total p)$/, "p"],
  [/^(na|sodium( \(total\))?)$/, "na"],
  [/^(nacl|salt( \(nacl\))?)$/, "nacl"],
  [/^(cl|chloride)$/, "cl"],
  [/^(zn|zinc)$/, "zn"],
  [/^(cu|copper)$/, "cu"],
];

/** Map a column/row label such as "Protein (crude) AR %", "Miosture", "CA", "P-total" to a nutrient code. */
export function matchNutrient(label: unknown): { nutrient: NutrientCode; basis: Basis } | null {
  const raw = cleanText(label);
  if (!raw) return null;
  let s = raw.toLowerCase();
  let basis: Basis = "as_received";
  if (/\bdw\b/.test(s)) basis = "dry_matter";
  s = s
    .replace(/\b(ar|dw|as received|dry weight)\b/g, "")
    .replace(/%|\bppm\b|mg\/kg/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [re, code] of ALIASES) if (re.test(s)) return { nutrient: code, basis };
  return null;
}

/** "Ca intended – 0.14" → 0.14 */
export function parseIntendedOffset(header: unknown): number {
  const s = cleanText(header) ?? "";
  const m = s.match(/[–—-]\s*(\d*\.?\d+)\s*$/);
  return m ? Number(m[1]) : 0;
}

const STAT_LABELS =
  /^(mean|median|average|avg|cv|cv, ?%|sd|std|stdev|min|max|range|n|count|number of samples.*|percent of samples.*|lower acceptable limit|upper acceptable limit)$/i;

export function isSummaryLabel(v: unknown): boolean {
  const s = cleanText(v);
  return !!s && STAT_LABELS.test(s);
}

/** Normalise a diet name for matching: "4-24 All-veg" and "4-24 all-veg" → "4-24 all-veg". */
export function normalizeDietCode(s: string): string {
  return s.toLowerCase().replace(/[\s_]+/g, " ").replace(/\s*-\s*/g, "-").trim();
}

export function round(n: number, dp = 3): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
