"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { AskAI } from "@/components/assistant/AskAI";
import { fmtDate, fmtPct, fmtVal } from "@/lib/analysis/flags";
import { PHASE_ORDER } from "@/lib/analysis/merge";
import { NUTRIENT_META } from "@/lib/analysis/tolerances";
import type { ResultView, SampleView } from "@/lib/analysis/view";
import { cellAsk } from "@/lib/assistant/ask";
import type { NutrientCode } from "@/lib/parsers/types";
import { cellClass, glyph } from "@/lib/ui/status";
import { PLAIN_NAME, plainStatus, ResultExplainer } from "./ResultExplainer";

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

type Pick = { s: SampleView; n: NutrientCode; r: ResultView };

function Cell({ r, n, s, onPick }: { r: ResultView | undefined; n: NutrientCode; s: SampleView; onPick: (p: Pick) => void }) {
  const meta = NUTRIENT_META[n];
  if (!r || r.analyzed == null)
    return (
      <td className="border-l border-line px-2 py-1.5 text-center text-ink-3" aria-label="not analysed">
        ·
      </td>
    );
  const { status, direction, pct } = r.ev;
  const g = glyph(status, direction);
  const name = `${PLAIN_NAME[n]}: ${pct != null ? `${Math.round(pct)}% of recipe` : fmtVal(r.analyzed, meta.unit)}, ${plainStatus(r).toLowerCase()}. Show explanation`;
  return (
    <td className={`group/ai relative border-l border-line p-0 text-right ${cellClass(status, direction)}`}>
      <button
        type="button"
        onClick={() => onPick({ s, n, r })}
        aria-label={name}
        title="Click for an explanation"
        className="block w-full px-2 py-1.5 text-right hover:brightness-95 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-navy-700"
      >
        <span className="block font-mono text-[13px] leading-tight whitespace-nowrap">
          {pct != null ? fmtPct(pct) : fmtVal(r.analyzed, meta.unit)}
          {g && <span className="ml-0.5 text-[10px]">{g}</span>}
        </span>
        <span className="block font-mono text-[11px] leading-tight whitespace-nowrap opacity-70">
          {pct != null ? `${fmtNum(r.analyzed)} / ${fmtNum(r.intended)}` : status === "no_target" ? "no target" : meta.unit}
        </span>
      </button>
      <AskAI ask={cellAsk(s, n, r)} name={`Ask AI about ${meta.short}`} className="absolute top-1/2 left-0 z-[5] size-5 -translate-x-1/2 -translate-y-1/2" />
    </td>
  );
}

/** What a diet's latest result needs, as a short chip. */
function DietStatus({ s }: { s: SampleView }) {
  const results = Object.values(s.results).filter(Boolean) as ResultView[];
  const action = results.filter((r) => r.ev.status === "action").length;
  const watch = results.filter((r) => r.ev.status === "watch").length;
  const suspect = results.filter((r) => r.ev.status === "suspect").length;
  const [cls, text] = action
    ? ["bg-action-bg text-action-ink", `${action} need${action === 1 ? "s" : ""} action`]
    : suspect
      ? ["suspect-stripes text-suspect-ink", "Check data"]
      : watch
        ? ["bg-watch-bg text-watch-ink", `${watch} to watch`]
        : ["bg-ok-bg text-ok-ink", "On target"];
  return (
    <span data-diet-status className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

/** Far off target, or a number that looks wrong: the diets someone should act on now. */
const needsAction = (s: SampleView) => Object.values(s.results).some((r) => r && (r.ev.status === "action" || r.ev.status === "suspect"));

const fmtNum = (v: number | null) => (v == null ? "—" : v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(2) : v.toFixed(1));


export function DeviationMatrix({ samples, nutrients }: { samples: SampleView[]; nutrients: NutrientCode[] }) {
  const all = useMemo(() => group(samples), [samples]);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const groups = useMemo(
    () =>
      !onlyProblems
        ? all
        : all
            .map((loc) => ({
              ...loc,
              phases: loc.phases
                .map((ph) => ({ ...ph, diets: ph.diets.filter((d) => needsAction(d.samples[0])) }))
                .filter((ph) => ph.diets.length),
            }))
            .filter((loc) => loc.phases.length),
    [all, onlyProblems],
  );
  const dietCount = all.reduce((a, l) => a + l.phases.reduce((b, p) => b + p.diets.length, 0), 0);
  const problemCount = all.reduce((a, l) => a + l.phases.reduce((b, p) => b + p.diets.filter((d) => needsAction(d.samples[0])).length, 0), 0);
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
          <p className="max-w-2xl text-sm text-ink-2">
            Each box is a diet’s latest test result as a <b>percentage of its recipe</b>: 100% means the feed matched what was
            formulated. <b>Click any box</b> for a plain explanation.
          </p>
          <div className="mt-2">
            <Legend />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              role="switch"
              checked={onlyProblems}
              onChange={(e) => setOnlyProblems(e.target.checked)}
              className="size-4 accent-[#1b1e52]"
            />
            Only diets that need action ({problemCount} of {dietCount})
          </label>
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
              <th scope="col" className="sticky left-0 z-10 min-w-[132px] bg-[#fafafc] px-3 py-2 font-semibold sm:min-w-[220px] sm:px-4">
                Diet
              </th>
              <th scope="col" className="hidden px-3 py-2 font-semibold whitespace-nowrap sm:table-cell">
                Sampled
              </th>
              {nutrients.map((n) => (
                <th
                  key={n}
                  scope="col"
                  title={`${NUTRIENT_META[n].label}${NUTRIENT_META[n].why ? ` — matters for ${NUTRIENT_META[n].why}` : ""}`}
                  className="border-l border-line px-2 py-2 text-right font-semibold whitespace-nowrap"
                >
                  <span className="normal-case">{PLAIN_NAME[n]}</span>
                  <span className="block text-[10px] font-normal normal-case">
                    {NUTRIENT_META[n].unit === "ppm" ? "ppm" : "% of recipe"}
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
                                <th scope="row" className="sticky left-0 z-10 max-w-[150px] bg-white px-3 py-1.5 text-left font-normal sm:max-w-none sm:px-4">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
                                    <DietStatus s={latest} />
                                  </div>
                                  <div className="hidden pl-7 text-[11px] text-ink-3 sm:block">
                                    {d.samples.length} sample{d.samples.length > 1 ? "s" : ""}
                                    {latest.externalId ? ` · latest ${latest.externalId}` : ""}
                                  </div>
                                </th>
                                <td className="hidden px-3 py-1.5 text-xs whitespace-nowrap text-ink-2 sm:table-cell">{fmtDate(latest.sampledOn)}</td>
                                {nutrients.map((n) => (
                                  <Cell key={n} r={latest.results[n]} n={n} s={latest} onPick={setPick} />
                                ))}
                              </tr>
                              {isOpen &&
                                history.map((s) => (
                                  <tr key={s.id} className="border-b border-line bg-[#fcfcfe]">
                                    <th scope="row" className="sticky left-0 z-10 bg-[#fcfcfe] py-1 pr-4 pl-14 text-left text-xs font-normal text-ink-2">
                                      {s.externalId ?? s.dietCode} <SourceBadge s={s} />
                                    </th>
                                    <td className="hidden px-3 py-1 text-xs whitespace-nowrap text-ink-3 sm:table-cell">{fmtDate(s.sampledOn)}</td>
                                    {nutrients.map((n) => (
                                      <Cell key={n} r={s.results[n]} n={n} s={s} onPick={setPick} />
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
        {!groups.length && (
          <p className="px-5 py-10 text-center text-sm text-ink-3">
            {onlyProblems && all.length ? "No diet’s latest result needs action right now." : "No samples match these filters."}
          </p>
        )}
      </div>
      {pick && <ResultExplainer pick={pick} onClose={() => setPick(null)} />}
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
    ["bg-action-bg text-action-ink", "▼▼ Far below"],
    ["bg-watch-bg text-watch-ink", "▼ A little below"],
    ["bg-white text-ink border border-line", "On target"],
    ["bg-high-bg text-high-ink", "▲ A little above"],
    ["bg-high-action-bg text-high-ink", "▲▲ Far above"],
    ["suspect-stripes text-suspect-ink", "? Check data"],
  ];
  return (
    <ul className="flex flex-wrap gap-1.5 text-[11px]" aria-label="Colour key">
      {items.map(([c, t]) => (
        <li key={t} className={`rounded px-1.5 py-0.5 font-semibold ${c}`}>
          {t}
        </li>
      ))}
    </ul>
  );
}
