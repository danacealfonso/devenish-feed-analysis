export interface SummaryStats {
  n: number;
  mean: number | null;
  median: number | null;
  /** Coefficient of variation using the sample standard deviation (Excel STDEV). */
  cv: number | null;
  min: number | null;
  max: number | null;
  belowLimit: number;
  pctBelowLimit: number | null;
}

export function summarize(values: (number | null | undefined)[], lowerLimit?: number | null): SummaryStats {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  const n = v.length;
  if (!n) return { n, mean: null, median: null, cv: null, min: null, max: null, belowLimit: 0, pctBelowLimit: null };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const belowLimit = lowerLimit != null ? v.filter((x) => x < lowerLimit).length : 0;
  return {
    n,
    mean,
    median,
    cv: mean ? (sd / mean) * 100 : null,
    min: v[0],
    max: v[n - 1],
    belowLimit,
    pctBelowLimit: lowerLimit != null ? (belowLimit / n) * 100 : null,
  };
}
