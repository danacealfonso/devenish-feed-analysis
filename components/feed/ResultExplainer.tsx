"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { fmtDate, fmtVal } from "@/lib/analysis/flags";
import { NUTRIENT_META } from "@/lib/analysis/tolerances";
import type { ResultView, SampleView } from "@/lib/analysis/view";
import { askAssistant, cellAsk } from "@/lib/assistant/ask";
import type { NutrientCode } from "@/lib/parsers/types";
import { cellClass } from "@/lib/ui/status";

/** Short, everyday names for the matrix headings and explanations. */
export const PLAIN_NAME: Record<NutrientCode, string> = {
  cp: "Protein",
  ca: "Calcium",
  p: "Phosphorus",
  na: "Sodium",
  nacl: "Salt",
  fat: "Fat",
  fiber: "Fiber",
  moisture: "Moisture",
  dm: "Dry matter",
  cl: "Chloride",
  zn: "Zinc",
  cu: "Copper",
};

/** The same scale the cell colours use, in plain words. */
export function plainStatus(r: ResultView): string {
  const { status, direction } = r.ev;
  if (status === "action") return direction === "high" ? "Far above target" : "Far below target";
  if (status === "watch") return direction === "high" ? "A little above target" : "A little below target";
  if (status === "suspect") return "Check the data";
  if (status === "no_target") return "No recipe value to compare";
  return "On target";
}

/** One sentence a non-expert can read: what was measured, what was planned, and whether it matters. */
export function explainResult(s: SampleView, n: NutrientCode, r: ResultView): string {
  const meta = NUTRIENT_META[n];
  const who = s.source === "lab" ? "The lab" : "The NIR scanner";
  const what = PLAIN_NAME[n].toLowerCase();
  const measured = fmtVal(r.analyzed, meta.unit);
  const { status, pct, reason } = r.ev;
  if (status === "suspect") return `${who} reported ${measured} ${what}, which doesn’t look right${reason ? ` (${reason})` : ""}. This is more likely a data or labelling problem than a problem with the feed: re-check the sample before acting.`;
  if (pct == null)
    return status === "no_target"
      ? `${who} measured ${measured} ${what}, but this diet has no recipe value to compare it with.`
      : `${who} measured ${measured} ${what}${reason ? `: ${reason}` : ""}.`;
  const diff = Math.round(Math.abs(100 - pct));
  const side = pct < 100 ? "below" : "above";
  const verdict =
    status === "action" ? "That’s far enough off to act on." : status === "watch" ? "A little off: worth keeping an eye on." : "Close enough: on target.";
  const offset = r.offset ? ` (after a standard ${r.offset} adjustment)` : "";
  return `${who} measured ${measured} ${what}; the recipe called for ${fmtVal(r.intended, meta.unit)}${offset}. That’s ${diff === 0 ? "exactly on" : `${diff}% ${side}`} target. ${verdict}`;
}

/** Tap-anywhere explanation of one result in the analyzed-vs-intended table. */
export function ResultExplainer({ pick, onClose }: { pick: { s: SampleView; n: NutrientCode; r: ResultView }; onClose: () => void }) {
  const { s, n, r } = pick;
  const meta = NUTRIENT_META[n];
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid items-end bg-navy-950/40 sm:place-items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="explain-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-2xl bg-surface p-6 shadow-2xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">
            {meta.label} · Diet {s.dietCode}
            {s.farmLabel ? ` · Farm ${s.farmLabel}` : ""} · {s.locationName}
          </p>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="-mt-1 rounded p-1 text-ink-3 hover:bg-page">
            <X size={18} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="explain-title" className="text-3xl font-bold tracking-tight">
            {r.ev.pct != null ? `${Math.round(r.ev.pct)}% of recipe` : fmtVal(r.analyzed, meta.unit)}
          </h2>
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${cellClass(r.ev.status, r.ev.direction)}`}>{plainStatus(r)}</span>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-ink">{explainResult(s, n, r)}</p>
        {meta.why && (
          <p className="mt-2 text-sm text-ink-2">
            <b>Why it matters:</b> {PLAIN_NAME[n].toLowerCase()} affects {meta.why}.
          </p>
        )}
        <p className="mt-2 text-xs text-ink-3">
          {s.source === "lab" ? "Lab result" : "NIR scan"} · sampled {fmtDate(s.sampledOn)}
          {s.externalId ? ` · sample ${s.externalId}` : ""}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => {
              onClose();
              askAssistant(cellAsk(s, n, r));
            }}
            className="flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"
          >
            <Sparkles size={15} className="text-accent" /> Ask AI about this
          </button>
          <Link
            href={`/feed/diet?loc=${s.locationId}&diet=${encodeURIComponent(s.dietKey)}`}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-page"
          >
            View diet history
          </Link>
        </div>
      </div>
    </div>
  );
}
