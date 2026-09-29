import { ArrowDown, ArrowUp } from "lucide-react";
import { currentCycleStart, fmtDate } from "@/lib/analysis/flags";
import { summarize } from "@/lib/analysis/stats";
import { NUTRIENT_META, type ToleranceMap } from "@/lib/analysis/tolerances";
import type { SampleView } from "@/lib/analysis/view";
import type { NutrientCode } from "@/lib/parsers/types";
import { pillClass } from "@/lib/ui/status";

const KEY: NutrientCode[] = ["cp", "ca", "p", "na"];

/** One card per headline nutrient: how much of the latest month's feed was in the watch band, and the trend. */
export function HeadlineCards({ samples, tolerances }: { samples: SampleView[]; tolerances: ToleranceMap }) {
  // Same window as "Needs attention": the current sampling cycle, compared with the 3 months before it.
  const cycleStart = currentCycleStart(samples);
  const prevStart = cycleStart ? shiftDays(cycleStart, -90) : null;
  const inCycle = (s: SampleView) => !!cycleStart && (s.sampledOn ?? "") >= cycleStart;
  const inPrev = (s: SampleView) => !!cycleStart && !!prevStart && (s.sampledOn ?? "") >= prevStart && (s.sampledOn ?? "") < cycleStart;
  const cycleSamples = samples.filter(inCycle);

  return (
    <section aria-labelledby="headlines">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="headlines" className="eyebrow">
          Current cycle{cycleStart ? ` · since ${fmtDate(cycleStart)}` : ""} · {cycleSamples.length} samples
        </h2>
        <p className="text-xs text-ink-3">% of intended; bands from Operation → Tolerances</p>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KEY.map((n) => {
          const meta = NUTRIENT_META[n];
          const rule = tolerances[n];
          const pick = (f: (s: SampleView) => boolean) =>
            samples.filter(f).map((s) => s.results[n]).filter((r) => r?.ev.pct != null);
          const cur = pick(inCycle);
          const prev = pick(inPrev);
          const st = summarize(cur.map((r) => r!.ev.pct));
          const stPrev = summarize(prev.map((r) => r!.ev.pct));
          const inBand = cur.filter((r) => r!.ev.status === "ok").length;
          const action = cur.filter((r) => r!.ev.status === "action").length;
          const suspect = cur.filter((r) => r!.ev.status === "suspect").length;
          const share = st.n ? Math.round((inBand / st.n) * 100) : null;
          const pill =
            st.n === 0
              ? { k: "info" as const, t: "No data" }
              : action
                ? { k: "action" as const, t: `${action} need action` }
                : share! >= 75
                  ? { k: "ok" as const, t: "On target" }
                  : { k: "watch" as const, t: "Watch" };
          const delta = st.median != null && stPrev.median != null ? st.median - stPrev.median : null;
          return (
            <article key={n} className="flex flex-col rounded-xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold tracking-wide uppercase">{meta.label}</h3>
                  <p className="text-sm text-ink-3">median % of intended</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${pillClass(pill.k)}`}>
                  {pill.t}
                </span>
              </div>
              <div className="mt-6 flex items-baseline gap-3">
                <span className="font-mono text-5xl font-semibold tracking-tight">
                  {st.median != null ? Math.round(st.median) : "—"}
                  {st.median != null && <span className="text-2xl">%</span>}
                </span>
                {delta != null && (
                  <span className="flex items-center text-sm text-ink-2">
                    {delta >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                    {Math.abs(delta).toFixed(1)} pts vs prior 3 mo
                  </span>
                )}
              </div>
              <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-4 text-xs">
                <div>
                  <dt className="font-semibold text-ink-3 uppercase">In band</dt>
                  <dd className="mt-1 font-mono text-base font-semibold">{share != null ? `${share}%` : "—"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink-3 uppercase">Samples</dt>
                  <dd className="mt-1 font-mono text-base font-semibold">
                    {st.n}
                    {suspect ? <span className="text-suspect-ink"> ({suspect}?)</span> : null}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink-3 uppercase">Band</dt>
                  <dd className="mt-1 font-mono text-base font-semibold">
                    {rule?.watchLow ?? "—"}–{rule?.watchHigh ?? "—"}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
