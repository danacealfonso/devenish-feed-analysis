"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, inputBase, Page, PageHeader } from "@/components/portal/PageHeader";
import { KEY_NUTRIENTS, monthLabel, monthlyCompliance } from "@/lib/analysis/compliance";
import { NUTRIENT_META } from "@/lib/analysis/tolerances";
import { usePortal } from "@/lib/data/portal";
import { pillClass, SERIES_COLORS } from "@/lib/ui/status";

const PRODUCTION = [
  { title: "Hen-day production", unit: "%" },
  { title: "Average egg weight", unit: "g / egg" },
  { title: "Eggs per hen-housed", unit: "cum. eggs / hen" },
  { title: "Cumulative mortality", unit: "% since placement" },
];

export default function DashboardPage() {
  const { samples, locations } = usePortal();
  const [loc, setLoc] = useState("all");
  const filtered = useMemo(() => (loc === "all" ? samples : samples.filter((s) => s.locationId === loc)), [samples, loc]);
  const data = useMemo(() => monthlyCompliance(filtered).slice(-18), [filtered]);

  return (
    <Page wide>
      <PageHeader
        section="Dashboard"
        title="Dashboard"
        description="Production headlines and how feed quality has tracked month by month."
        actions={
          <label className="flex items-center gap-2 text-sm">
            <span className="eyebrow !text-[11px]">Location</span>
            <select value={loc} onChange={(e) => setLoc(e.target.value)} className={inputBase}>
              <option value="all">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <h2 className="eyebrow mt-8">Production headlines</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PRODUCTION.map((p) => (
          <article key={p.title} className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold tracking-wide uppercase">{p.title}</h3>
                <p className="text-sm text-ink-3">{p.unit}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${pillClass("info")}`}>Not provided</span>
            </div>
            <p className="mt-6 font-mono text-5xl font-semibold text-ink-3">—</p>
            <p className="mt-4 border-t border-line pt-3 text-xs text-ink-3">
              Weekly production records weren’t part of this exercise’s data.
            </p>
          </article>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card title="Feed results in band, by month" subtitle="Share of results inside the watch band. Higher is better.">
          <Chart data={data} suffix="" yDomain={[0, 100]} reference={75} referenceLabel="75% target" />
        </Card>
        <Card title="Median % of intended, by month" subtitle="100% = exactly as formulated.">
          <Chart data={data} suffix="_median" yDomain={["auto", "auto"]} reference={100} referenceLabel="formula" />
        </Card>
      </div>
      <p className="mt-3 text-xs text-ink-3">
        Last {data.length} months with samples. Details and individual results on the{" "}
        <Link href="/feed" className="font-semibold text-navy-800 underline">
          Feed
        </Link>{" "}
        page.
      </p>
    </Page>
  );
}

function Chart({
  data,
  suffix,
  yDomain,
  reference,
  referenceLabel,
}: {
  data: Record<string, number | string | null>[];
  suffix: string;
  yDomain: [number | string, number | string];
  reference: number;
  referenceLabel: string;
}) {
  if (!data.length) return <p className="px-5 py-10 text-center text-sm text-ink-3">No dated samples yet.</p>;
  return (
    <div className="h-72 px-2 py-4">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 20, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="#eee" vertical={false} />
          <XAxis dataKey="month" tickFormatter={(m) => monthLabel(String(m))} fontSize={11} />
          <YAxis domain={yDomain} unit="%" fontSize={11} />
          <ReferenceLine y={reference} stroke="#7c7e96" strokeDasharray="4 4" label={{ value: referenceLabel, fontSize: 11, fill: "#7c7e96", position: "insideTopRight" }} />
          <Tooltip labelFormatter={(m) => monthLabel(String(m), "long")} formatter={(v) => (v == null ? "—" : `${v}%`)} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          {KEY_NUTRIENTS.map((n) => (
            <Line
              key={n}
              dataKey={`${n}${suffix}`}
              name={NUTRIENT_META[n].short}
              stroke={SERIES_COLORS[n]}
              strokeWidth={2}
              dot={{ r: 2.5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
