"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, inputBase, Page, PageHeader } from "@/components/portal/PageHeader";
import { compliance, KEY_NUTRIENTS, latestDate } from "@/lib/analysis/compliance";
import { PHASE_ORDER } from "@/lib/analysis/merge";
import { NUTRIENT_META } from "@/lib/analysis/tolerances";
import type { SampleView } from "@/lib/analysis/view";
import { usePortal } from "@/lib/data/portal";
import { SERIES_COLORS } from "@/lib/ui/status";

type GroupBy = "location" | "mill" | "phase";
const GROUP_LABEL: Record<GroupBy, string> = { location: "Location", mill: "Feed mill", phase: "Flock phase" };

export default function ComparePage() {
  const { samples } = usePortal();
  const [by, setBy] = useState<GroupBy>("location");
  const [months, setMonths] = useState("12");

  const scoped = useMemo(() => {
    const latest = latestDate(samples);
    if (months === "all" || !latest) return samples;
    const d = new Date(`${latest}T00:00:00`);
    d.setMonth(d.getMonth() - Number(months));
    const cutoff = d.toISOString().slice(0, 10);
    return samples.filter((s) => (s.sampledOn ?? "") >= cutoff);
  }, [samples, months]);

  const rows = useMemo(() => {
    const key = (s: SampleView) => (by === "location" ? s.locationName : by === "mill" ? (s.millName ?? "No mill") : s.phase);
    const groups = new Map<string, SampleView[]>();
    for (const s of scoped) groups.set(key(s), [...(groups.get(key(s)) ?? []), s]);
    return [...groups.entries()]
      .sort(([a], [b]) =>
        by === "phase" ? PHASE_ORDER.indexOf(a as never) - PHASE_ORDER.indexOf(b as never) : a.localeCompare(b),
      )
      .map(([name, list]) => ({
        name,
        n: list.length,
        stats: Object.fromEntries(KEY_NUTRIENTS.map((n) => [n, compliance(list, n)])),
      }));
  }, [scoped, by]);

  const chartData = rows.map((r) => ({
    name: r.name,
    ...Object.fromEntries(KEY_NUTRIENTS.map((n) => [n, r.stats[n].pctInBand != null ? Math.round(r.stats[n].pctInBand!) : null])),
  }));

  return (
    <Page wide>
      <PageHeader
        section="Compare"
        title="Compare my flocks"
        description="Which locations, mills or flock phases are getting the feed that was formulated, side by side."
        actions={
          <>
            <div role="radiogroup" aria-label="Group by" className="flex rounded-lg border border-line bg-white p-1">
              {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
                <button
                  key={g}
                  role="radio"
                  aria-checked={by === g}
                  onClick={() => setBy(g)}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ${by === g ? "bg-navy-900 text-white" : "text-ink-2 hover:bg-page"}`}
                >
                  {GROUP_LABEL[g]}
                </button>
              ))}
            </div>
            <select aria-label="Period" value={months} onChange={(e) => setMonths(e.target.value)} className={inputBase}>
              <option value="3">Last 3 months</option>
              <option value="6">Last 6 months</option>
              <option value="12">Last 12 months</option>
              <option value="all">All time</option>
            </select>
          </>
        }
      />

      <Card className="mt-8" title={`% of results in band by ${GROUP_LABEL[by].toLowerCase()}`} subtitle="Inside the watch band set under Operation → Tolerances. Suspect results excluded.">
        {rows.length ? (
          <div className="h-80 px-2 py-4">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -8 }} barCategoryGap="22%">
                <CartesianGrid stroke="#eee" vertical={false} />
                <XAxis dataKey="name" fontSize={12} interval={0} />
                <YAxis domain={[0, 100]} unit="%" fontSize={11} />
                <ReferenceLine y={75} stroke="#7c7e96" strokeDasharray="4 4" />
                <Tooltip formatter={(v) => (v == null ? "—" : `${v}%`)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {KEY_NUTRIENTS.map((n) => (
                  <Bar key={n} dataKey={n} name={NUTRIENT_META[n].short} fill={SERIES_COLORS[n]} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-ink-3">No samples in this period.</p>
        )}
      </Card>

      <Card className="mt-6" title="Detail">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3 uppercase">
                <th scope="col" className="px-5 py-2">{GROUP_LABEL[by]}</th>
                <th scope="col" className="px-3 py-2 text-right">Samples</th>
                {KEY_NUTRIENTS.map((n) => (
                  <th key={n} scope="col" className="border-l border-line px-3 py-2 text-right whitespace-nowrap">
                    {NUTRIENT_META[n].short} in band · median
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.map((r) => (
                <tr key={r.name} className="border-t border-line">
                  <th scope="row" className="px-5 py-2 text-left font-sans font-semibold">{r.name}</th>
                  <td className="px-3 py-2 text-right">{r.n}</td>
                  {KEY_NUTRIENTS.map((n) => {
                    const c = r.stats[n];
                    return (
                      <td key={n} className="border-l border-line px-3 py-2 text-right whitespace-nowrap">
                        {c.pctInBand != null ? `${Math.round(c.pctInBand)}%` : "—"}
                        <span className="text-ink-3"> · {c.median != null ? `${Math.round(c.median)}%` : "—"}</span>
                        {c.action > 0 && <span className="ml-1.5 text-xs text-action-ink">{c.action}▼▲</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-ink-3">
          In band = % of results inside the watch band · median = median % of intended · ▼▲ = results beyond action limits.
        </p>
      </Card>
    </Page>
  );
}
