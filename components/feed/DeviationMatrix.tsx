"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { AskAI } from "@/components/assistant/AskAI";
import { STATUS_RANK } from "@/lib/analysis/deviation";
import { fmtDate, fmtPct, fmtVal } from "@/lib/analysis/flags";
import { PHASE_ORDER } from "@/lib/analysis/merge";
import { NUTRIENT_META } from "@/lib/analysis/tolerances";
import type { ResultView, SampleView } from "@/lib/analysis/view";
import { cellAsk } from "@/lib/assistant/ask";
import type { NutrientCode } from "@/lib/parsers/types";
import { cellClass, glyph, STATUS_LABEL } from "@/lib/ui/status";

interface DietGroup {
  key: string;
  dietKey: string;
  dietCode: string;
  farmLabel: string | null;
  samples: SampleView[]; // newest first
}

interface LocationGroup {
  id: string;
  name: string;
  mill: string | null;
  phases: { phase: string; diets: DietGroup[] }[];
  actions: number;
  n: number;
}

function group(samples: SampleView[]): LocationGroup[] {
  const locs = new Map<string, LocationGroup>();
  const diets = new Map<string, DietGroup & { phase: string; locationId: string }>();
  for (const s of samples) {
    if (!locs.has(s.locationId))
      locs.set(s.locationId, { id: s.locationId, name: s.locationName, mill: s.millName, phases: [], actions: 0, n: 0 });
    const loc = locs.get(s.locationId)!;
    loc.n++;
    loc.actions += Object.values(s.results).filter((r) => r?.ev.status === "action").length;
    const k = `${s.locationId}|${s.farmLabel ?? ""}|${s.dietKey}`;
    if (!diets.has(k))
      diets.set(k, { key: k, dietKey: s.dietKey, dietCode: s.dietCode, farmLabel: s.farmLabel, samples: [], phase: s.phase, locationId: s.locationId });
    diets.get(k)!.samples.push(s);
  }
  for (const d of diets.values()) {
    d.samples.sort((a, b) => (b.sampledOn ?? "").localeCompare(a.sampledOn ?? ""));
    const loc = locs.get(d.locationId)!;
    let ph = loc.phases.find((p) => p.phase === d.phase);
    if (!ph) loc.phases.push((ph = { phase: d.phase, diets: [] }));
    ph.diets.push(d);
  }
  for (const loc of locs.values()) {
    loc.phases.sort((a, b) => PHASE_ORDER.indexOf(a.phase as never) - PHASE_ORDER.indexOf(b.phase as never));
    for (const p of loc.phases)
      p.diets.sort((a, b) => a.dietCode.localeCompare(b.dietCode, undefined, { numeric: true }) || (a.farmLabel ?? "").localeCompare(b.farmLabel ?? ""));
  }
  return [...locs.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function Cell({ r, n, s }: { r: ResultView | undefined; n: NutrientCode; s: SampleView }) {
  const meta = NUTRIENT_META[n];
  if (!r || r.analyzed == null)
    return (
      <td className="border-l border-line px-2 py-1.5 text-center text-ink-3" aria-label="not analysed">
        ·
      </td>
    );
  const { status, direction, pct, reason } = r.ev;
  const g = glyph(status, direction);
  const offset = r.offset ? ` (intended − ${r.offset})` : "";
  const tip =
    `${meta.label}: ${fmtVal(r.analyzed, meta.unit)} analyzed` +
    (r.intended != null ? ` vs ${fmtVal(r.intended, meta.unit)} intended${offset} = ${fmtPct(pct)}` : "") +
    ` · ${STATUS_LABEL[status]}${reason ? ` (${reason})` : ""}`;
  return (
    <td className={`group/ai relative border-l border-line px-2 py-1.5 text-right ${cellClass(status, direction)}`} title={tip}>
      <span className="sr-only">{tip}</span>
      <AskAI ask={cellAsk(s, n, r)} name={`Ask AI about ${meta.short}`} className="absolute top-1/2 left-1 -translate-y-1/2" />
      <div aria-hidden className="font-mono text-[13px] leading-tight whitespace-nowrap">
        {pct != null ? fmtPct(pct) : fmtVal(r.analyzed, meta.unit)}
        {g && <span className="ml-0.5 text-[10px]">{g}</span>}
      </div>
      <div aria-hidden className="font-mono text-[11px] leading-tight whitespace-nowrap opacity-70">
        {pct != null ? `${fmtNum(r.analyzed)} / ${fmtNum(r.intended)}` : status === "no_target" ? "no target" : meta.unit}
      </div>
    </td>
  );
}

const fmtNum = (v: number | null) => (v == null ? "—" : v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(2) : v.toFixed(1));

function worst(s: SampleView) {
  return Math.max(0, ...Object.values(s.results).map((r) => STATUS_RANK[r!.ev.status]));
}

export function DeviationMatrix({ samples, nutrients }: { samples: SampleView[]; nutrients: NutrientCode[] }) {
  const groups = useMemo(() => group(samples), [samples]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [collapsedLocs, setCollapsedLocs] = useState<Set<string>>(new Set());
  const toggle = (set: Set<string>, k: string) => {
    const next = new Set(set);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    return next;
  };
  const allDietKeys = groups.flatMap((g) => g.phases.flatMap((p) => p.diets.map((d) => d.key)));
  const cols = nutrients.length + 2;

  return (
    <section aria-labelledby="matrix" className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 id="matrix" className="text-base font-bold">
            Analyzed vs intended by diet
          </h2>
          <p className="text-sm text-ink-3">
            Latest result per diet, grouped by location and flock phase. Expand a diet to see its history.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Legend />
          <button
            onClick={() => setOpen(open.size ? new Set() : new Set(allDietKeys))}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-page"
          >
            {open.size ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-3 uppercase">
              <th scope="col" className="sticky left-0 z-10 min-w-[220px] bg-[#fafafc] px-4 py-2 font-semibold">
                Diet
              </th>
              <th scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">
                Sampled
              </th>
              {nutrients.map((n) => (
                <th key={n} scope="col" className="border-l border-line px-2 py-2 text-right font-semibold whitespace-nowrap">
                  {NUTRIENT_META[n].short}
                  <span className="block text-[10px] font-normal normal-case">
                    {NUTRIENT_META[n].unit === "ppm" ? "ppm" : "% of int."}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((loc) => {
              const locOpen = !collapsedLocs.has(loc.id);
              return (
                <Fragment key={loc.id}>
                  <tr className="border-b border-line bg-navy-900 text-white">
                    <th colSpan={cols} scope="rowgroup" className="px-4 py-2 text-left">
                      <button
                        onClick={() => setCollapsedLocs(toggle(collapsedLocs, loc.id))}
                        aria-expanded={locOpen}
                        className="flex w-full items-center gap-2 text-left"
                      >
                        <ChevronRight size={16} className={`transition ${locOpen ? "rotate-90" : ""}`} />
                        <span className="font-semibold">{loc.name}</span>
                        {loc.mill && <span className="text-xs text-white/70">· fed from {loc.mill}</span>}
                        <span className="ml-auto text-xs font-normal text-white/70">
                          {loc.n} samples · {loc.actions} action results
                        </span>
                      </button>
                    </th>
                  </tr>
                  {locOpen &&
                    loc.phases.map((ph) => (
                      <Fragment key={ph.phase}>
                        <tr className="border-b border-line bg-[#f1f1f6]">
                          <th colSpan={cols} scope="rowgroup" className="px-4 py-1.5 text-left text-xs font-semibold tracking-wide text-ink-2 uppercase">
                            {ph.phase} diets
                          </th>
                        </tr>
                        {ph.diets.map((d) => {
                          const [latest, ...history] = d.samples;
                          const isOpen = open.has(d.key);
                          return (
                            <Fragment key={d.key}>
                              <tr className="border-b border-line hover:bg-page/50">
                                <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-1.5 text-left font-normal">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => setOpen(toggle(open, d.key))}
                                      aria-expanded={isOpen}
                                      aria-label={`${isOpen ? "Hide" : "Show"} history for ${d.dietCode}`}
                                      disabled={!history.length}
                                      className="rounded p-0.5 text-ink-3 hover:bg-page disabled:invisible"
                                    >
                                      <ChevronRight size={15} className={`transition ${isOpen ? "rotate-90" : ""}`} />
                                    </button>
                                    <Link
                                      href={`/feed/diet?loc=${latest.locationId}&diet=${encodeURIComponent(d.dietKey)}`}
                                      className="font-semibold hover:underline"
                                    >
                                      {d.dietCode}
                                    </Link>
                                    {d.farmLabel && (
                                      <span className="rounded bg-[#eef0f6] px-1.5 py-0.5 text-[11px] text-ink-2">Farm {d.farmLabel}</span>
                                    )}
                                    <SourceBadge s={latest} />
                                    {worst(latest) >= 4 && <span className="sr-only">has action results</span>}
                                  </div>
                                  <div className="pl-7 text-[11px] text-ink-3">
                                    {d.samples.length} sample{d.samples.length > 1 ? "s" : ""}
                                    {latest.externalId ? ` · latest ${latest.externalId}` : ""}
                                  </div>
                                </th>
                                <td className="px-3 py-1.5 text-xs whitespace-nowrap text-ink-2">{fmtDate(latest.sampledOn)}</td>
                                {nutrients.map((n) => (
                                  <Cell key={n} r={latest.results[n]} n={n} s={latest} />
                                ))}
                              </tr>
                              {isOpen &&
                                history.map((s) => (
                                  <tr key={s.id} className="border-b border-line bg-[#fcfcfe]">
                                    <th scope="row" className="sticky left-0 z-10 bg-[#fcfcfe] py-1 pr-4 pl-14 text-left text-xs font-normal text-ink-2">
                                      {s.externalId ?? s.dietCode} <SourceBadge s={s} />
                                    </th>
                                    <td className="px-3 py-1 text-xs whitespace-nowrap text-ink-3">{fmtDate(s.sampledOn)}</td>
                                    {nutrients.map((n) => (
                                      <Cell key={n} r={s.results[n]} n={n} s={s} />
                                    ))}
                                  </tr>
                                ))}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!groups.length && <p className="px-5 py-10 text-center text-sm text-ink-3">No samples match these filters.</p>}
      </div>
    </section>
  );
}

function SourceBadge({ s }: { s: SampleView }) {
  return (
    <span
      title={s.labOrInstrument ?? undefined}
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
        s.source === "lab" ? "bg-navy-900 text-white" : "border border-navy-700 text-navy-800"
      }`}
    >
      {s.source === "lab" ? "LAB" : "NIR"}
    </span>
  );
}

export function Legend() {
  const items: [string, string][] = [
    ["bg-action-bg text-action-ink", "▼▼ Action low"],
    ["bg-watch-bg text-watch-ink", "▼ Watch low"],
    ["bg-white text-ink border border-line", "In band"],
    ["bg-high-bg text-high-ink", "▲ Watch high"],
    ["bg-high-action-bg text-high-ink", "▲▲ Action high"],
    ["suspect-stripes text-suspect-ink", "? Check data"],
  ];
  return (
    <ul className="hidden flex-wrap gap-1.5 text-[11px] md:flex" aria-label="Legend">
      {items.map(([c, t]) => (
        <li key={t} className={`rounded px-1.5 py-0.5 font-semibold ${c}`}>
          {t}
        </li>
      ))}
    </ul>
  );
}
