"use client";

import { AlertTriangle, HelpCircle, Info, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AskAI } from "@/components/assistant/AskAI";
import { CURRENT_WINDOW_DAYS, fmtDate, type Flag, type FlagSeverity } from "@/lib/analysis/flags";
import { NUTRIENT_META } from "@/lib/analysis/tolerances";
import { flagAsk } from "@/lib/assistant/ask";
import type { NutrientCode } from "@/lib/parsers/types";
import { pillClass } from "@/lib/ui/status";

const ICON = { action: AlertTriangle, suspect: HelpCircle, watch: TrendingDown, info: Info };
const LABEL = { action: "Action", suspect: "Check data", watch: "Watch", info: "Info" };
const KIND_LABEL: Record<Flag["kind"], string> = {
  deviation: "New deviation",
  repeat: "Repeated in a row",
  suspect: "Data check",
  lab_vs_nir: "Lab vs NIR",
  no_target: "No formulation",
};
const SEVERITIES: FlagSeverity[] = ["action", "suspect", "watch", "info"];

export function AttentionList({ flags, since }: { flags: Flag[]; since: string | null }) {
  const [showAll, setShowAll] = useState(false);
  const [severities, setSeverities] = useState<Set<FlagSeverity>>(new Set());
  const [nutrient, setNutrient] = useState<"all" | NutrientCode>("all");
  const [kind, setKind] = useState<"all" | Flag["kind"]>("all");
  const counts = { action: 0, suspect: 0, watch: 0, info: 0 };
  for (const f of flags) counts[f.severity]++;
  const nutrients = useMemo(() => [...new Set(flags.map((f) => f.nutrient).filter((n): n is NutrientCode => !!n))], [flags]);
  const kinds = useMemo(() => [...new Set(flags.map((f) => f.kind))], [flags]);
  const filtered = flags.filter(
    (f) =>
      (!severities.size || severities.has(f.severity)) &&
      (nutrient === "all" || f.nutrient === nutrient) &&
      (kind === "all" || f.kind === kind),
  );
  const filtering = severities.size > 0 || nutrient !== "all" || kind !== "all";
  const visible = showAll ? filtered : filtered.slice(0, 6);
  const toggleSeverity = (k: FlagSeverity) => {
    const next = new Set(severities);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSeverities(next);
  };

  return (
    <section aria-labelledby="attention" className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <div>
          <h2 id="attention" className="text-base font-bold">
            Needs attention
          </h2>
          <p className="text-xs text-ink-3">
            Latest result per diet in the current cycle{since ? ` (since ${fmtDate(since)})` : ""}, ~{CURRENT_WINDOW_DAYS} days of monthly sampling
          </p>
        </div>
        <div className="flex gap-2 text-xs font-semibold" role="group" aria-label="Filter by severity">
          {SEVERITIES.filter((k) => k !== "info" || counts.info).map((k) => {
            const on = severities.has(k);
            return (
              <button
                key={k}
                onClick={() => toggleSeverity(k)}
                aria-pressed={on}
                title={on ? `Show all severities` : `Show only ${LABEL[k].toLowerCase()}`}
                className={`rounded-full px-2.5 py-1 transition ${pillClass(k)} ${
                  on ? "ring-2 ring-navy-800 ring-offset-1" : severities.size ? "opacity-45 hover:opacity-80" : "hover:ring-1 hover:ring-navy-700/40"
                }`}
              >
                {counts[k]} {LABEL[k].toLowerCase()}
              </button>
            );
          })}
        </div>
      </header>
      {flags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-page/40 px-5 py-2.5 text-sm">
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-ink-3">Nutrient</span>
            <select
              value={nutrient}
              onChange={(e) => setNutrient(e.target.value as typeof nutrient)}
              className="rounded-md border border-line bg-white px-2 py-1 text-sm"
            >
              <option value="all">All</option>
              {nutrients.map((n) => (
                <option key={n} value={n}>
                  {NUTRIENT_META[n].short}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-ink-3">Type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="rounded-md border border-line bg-white px-2 py-1 text-sm">
              <option value="all">All</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto text-xs text-ink-3" aria-live="polite">
            {filtering ? `${filtered.length} of ${flags.length} shown` : `${flags.length} flags`}
          </span>
          {filtering && (
            <button
              onClick={() => {
                setSeverities(new Set());
                setNutrient("all");
                setKind("all");
              }}
              className="text-xs font-semibold text-navy-800 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      {flags.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-3">
          Every diet’s latest result is within its watch band. Nothing needs attention.
        </p>
      ) : !filtered.length ? (
        <p className="px-5 py-8 text-center text-sm text-ink-3">No flags match these filters.</p>
      ) : (
        <ol className="divide-y divide-line">
          {visible.map((f) => {
            const Icon = ICON[f.severity];
            return (
              <li key={f.id} className="group/ai flex gap-3 px-5 py-3.5 hover:bg-page/40">
                <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${pillClass(f.severity)}`}>
                  <Icon size={15} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-semibold">
                      <span className="sr-only">{LABEL[f.severity]}: </span>
                      {f.title}
                    </p>
                    <span className="flex items-center gap-2 text-xs whitespace-nowrap text-ink-3">
                      <AskAI ask={flagAsk(f)} name="Ask AI about this flag" />
                      {fmtDate(f.date)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-2">{f.detail}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-sm font-semibold">
                    {f.dietKey && f.locationId && (
                      <Link
                        href={`/feed/diet?loc=${f.locationId}&diet=${encodeURIComponent(f.dietKey)}`}
                        className="text-navy-800 hover:underline"
                      >
                        View diet history →
                      </Link>
                    )}
                    <Link
                      href={`/questions?${new URLSearchParams({
                        new: "1",
                        subject: f.title,
                        body: `${f.detail}\n\nSampled ${fmtDate(f.date)}. What should we do about this?`,
                        ...(f.locationId ? { loc: f.locationId } : {}),
                        ...(f.dietKey ? { diet: f.dietKey } : {}),
                      })}`}
                      className="text-navy-800 hover:underline"
                    >
                      Ask about this
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {filtered.length > 6 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full border-t border-line px-5 py-3 text-sm font-semibold text-navy-800 hover:bg-page"
        >
          {showAll ? "Show fewer" : `Show all ${filtered.length}`}
        </button>
      )}
    </section>
  );
}
