import { summarize } from "@/lib/analysis/stats";
import { NUTRIENT_META, type ToleranceMap } from "@/lib/analysis/tolerances";
import type { SampleView } from "@/lib/analysis/view";
import type { NutrientCode } from "@/lib/parsers/types";

const f1 = (v: number | null) => (v == null ? "—" : v.toFixed(1));

/** The statistics block nutritionists keep at the bottom of their comparison sheets, computed live. */
export function SummaryTable({
  samples,
  nutrients,
  tolerances,
}: {
  samples: SampleView[];
  nutrients: NutrientCode[];
  tolerances: ToleranceMap;
}) {
  const rows = nutrients.map((n) => {
    const rule = tolerances[n];
    const abs = rule?.mode === "abs_min";
    const vals = samples.map((s) => (abs ? s.results[n]?.analyzed : s.results[n]?.ev.pct));
    return { n, abs, limit: rule?.actionLow ?? null, st: summarize(vals, rule?.actionLow) };
  });
  return (
    <section aria-labelledby="stats" className="rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <h2 id="stats" className="text-base font-bold">
          Summary statistics
        </h2>
        <p className="text-sm text-ink-3">% of intended (ppm for trace minerals) across the filtered samples.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3 uppercase">
              <th scope="col" className="px-5 py-2 font-semibold">Nutrient</th>
              {["n", "Mean", "Median", "CV %", "Range", "Action limit", "Below limit"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map(({ n, abs, limit, st }) => (
              <tr key={n} className="border-t border-line">
                <th scope="row" className="px-5 py-2 text-left font-sans font-semibold">
                  {NUTRIENT_META[n].label} {abs && <span className="font-normal text-ink-3">(ppm)</span>}
                </th>
                <td className="px-3 py-2 text-right">{st.n}</td>
                <td className="px-3 py-2 text-right">{f1(st.mean)}</td>
                <td className="px-3 py-2 text-right">{f1(st.median)}</td>
                <td className="px-3 py-2 text-right">{f1(st.cv)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {st.n ? `${Math.round(st.min!)}–${Math.round(st.max!)}` : "—"}
                </td>
                <td className="px-3 py-2 text-right">{limit ?? "—"}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {limit != null && st.n ? `${st.belowLimit} (${Math.round(st.pctBelowLimit!)}%)` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
