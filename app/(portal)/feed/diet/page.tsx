"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate, fmtPct, fmtVal } from "@/lib/analysis/flags";
import { NUTRIENT_META } from "@/lib/analysis/tolerances";
import { usePortal } from "@/lib/data/portal";
import type { NutrientCode } from "@/lib/parsers/types";
import { cellClass, glyph, STATUS_LABEL } from "@/lib/ui/status";

const CHART_NUTRIENTS: NutrientCode[] = ["cp", "ca", "p", "na", "fat", "nacl"];

function DietDetail() {
  const params = useSearchParams();
  const locId = params.get("loc");
  const dietKey = params.get("diet");
  const { samples, tolerances, locations } = usePortal();

  const list = useMemo(
    () =>
      samples
        .filter((s) => s.locationId === locId && s.dietKey === dietKey)
        .sort((a, b) => (a.sampledOn ?? "").localeCompare(b.sampledOn ?? "")),
    [samples, locId, dietKey],
  );
  const location = locations.find((l) => l.id === locId);
  const first = list[0];
  const nutrients = CHART_NUTRIENTS.filter((n) => list.some((s) => s.results[n]?.ev.pct != null));

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-8">
      <Link href="/feed" className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-navy-800 hover:underline">
        <ArrowLeft size={16} /> Feed analysis
      </Link>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">{first?.dietCode ?? "Diet"}</h1>
      <p className="mt-2 text-ink-2">
        {location?.name ?? "—"} · {first?.phase ?? "—"} phase · {list.length} sample{list.length === 1 ? "" : "s"}
        {first && ` from ${fmtDate(first.sampledOn)} to ${fmtDate(list[list.length - 1].sampledOn)}`}
      </p>

      {!list.length ? (
        <p className="mt-10 text-ink-3">No samples found for this diet.</p>
      ) : (
        <>
          <section aria-labelledby="trend" className="mt-8">
            <h2 id="trend" className="eyebrow">
              % of intended over time
            </h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {nutrients.map((n) => {
                const rule = tolerances[n];
                const data = list.map((s) => ({
                  date: s.sampledOn,
                  lab: s.source === "lab" ? s.results[n]?.ev.pct : undefined,
                  nir: s.source === "nir" ? s.results[n]?.ev.pct : undefined,
                }));
                return (
                  <figure key={n} className="rounded-xl border border-line bg-surface p-4">
                    <figcaption className="flex items-baseline justify-between">
                      <span className="font-semibold">{NUTRIENT_META[n].label}</span>
                      <span className="text-xs text-ink-3">
                        watch {rule?.watchLow}–{rule?.watchHigh}% · action &lt;{rule?.actionLow ?? "—"}%
                      </span>
                    </figcaption>
                    <div className="mt-2 h-52">
                      <ResponsiveContainer>
                        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                          <CartesianGrid stroke="#eee" vertical={false} />
                          {rule?.watchLow != null && rule.watchHigh != null && (
                            <ReferenceArea y1={rule.watchLow} y2={rule.watchHigh} fill="#e4f5ea" fillOpacity={0.9} />
                          )}
                          {rule?.actionLow != null && <ReferenceLine y={rule.actionLow} stroke="#c2381f" strokeDasharray="4 4" />}
                          <ReferenceLine y={100} stroke="#16172b" />
                          <XAxis dataKey="date" tickFormatter={(d) => (d ? fmtDate(d).replace(/ \d{4}$/, "") : "")} fontSize={11} />
                          <YAxis fontSize={11} domain={["auto", "auto"]} unit="%" />
                          <Tooltip formatter={(v) => `${Math.round(Number(v))}%`} labelFormatter={(d) => fmtDate(String(d))} />
                          <Line dataKey="lab" name="Lab" stroke="#1b1e52" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                          <Line dataKey="nir" name="NIR" stroke="#d08a0b" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </figure>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-ink-3">Solid navy = wet-chem lab, dashed amber = NIR. Green band = watch range, red dashed = action limit.</p>
          </section>

          <section aria-labelledby="samples" className="mt-10 overflow-x-auto rounded-xl border border-line bg-surface">
            <h2 id="samples" className="border-b border-line px-5 py-4 text-base font-bold">
              All samples
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3 uppercase">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Sample</th>
                  <th className="px-4 py-2">Source</th>
                  {nutrients.map((n) => (
                    <th key={n} className="border-l border-line px-3 py-2 text-right">
                      {NUTRIENT_META[n].short} analyzed / intended
                    </th>
                  ))}
                  <th className="px-4 py-2">Source file</th>
                </tr>
              </thead>
              <tbody>
                {[...list].reverse().map((s) => (
                  <tr key={s.id} className="border-t border-line">
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDate(s.sampledOn)}</td>
                    <td className="px-4 py-2">{s.externalId ?? "—"}{s.farmLabel ? ` · Farm ${s.farmLabel}` : ""}</td>
                    <td className="px-4 py-2 text-xs uppercase">{s.source}</td>
                    {nutrients.map((n) => {
                      const r = s.results[n];
                      if (!r) return <td key={n} className="border-l border-line px-3 py-2 text-right text-ink-3">·</td>;
                      return (
                        <td
                          key={n}
                          className={`border-l border-line px-3 py-2 text-right font-mono whitespace-nowrap ${cellClass(r.ev.status, r.ev.direction)}`}
                          title={`${STATUS_LABEL[r.ev.status]}${r.ev.reason ? `: ${r.ev.reason}` : ""}`}
                        >
                          {fmtVal(r.analyzed, NUTRIENT_META[n].unit)} / {fmtVal(r.intended, NUTRIENT_META[n].unit)}
                          <span className="ml-2 font-semibold">
                            {fmtPct(r.ev.pct)}
                            {glyph(r.ev.status, r.ev.direction)}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-xs text-ink-3">
                      {s.sourceSheet} {s.sourceRef && `· ${s.sourceRef}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

export default function DietPage() {
  return (
    <Suspense fallback={<p className="p-8 text-ink-3">Loading…</p>}>
      <DietDetail />
    </Suspense>
  );
}
