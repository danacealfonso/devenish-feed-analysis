"use client";

import { HelpCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NUTRIENT_META, type ToleranceMap } from "@/lib/analysis/tolerances";
import type { NutrientCode } from "@/lib/parsers/types";

const COLOURS: [string, string, string][] = [
  ["bg-white text-ink border border-line", "In band", "Close to the recipe. Nothing to do."],
  ["bg-watch-bg text-watch-ink", "▼ Watch low", "A little below the recipe. Keep an eye on it; two in a row are flagged."],
  ["bg-action-bg text-action-ink", "▼▼ Action low", "Far enough below to matter for the hens. Talk to the feed mill or your nutritionist."],
  ["bg-high-bg text-high-ink", "▲ Watch high", "A little above the recipe. Usually costs money rather than harming the birds."],
  ["bg-high-action-bg text-high-ink", "▲▲ Action high", "Well above the recipe. Check the mix and the cost."],
  ["suspect-stripes text-suspect-ink", "? Check data", "The number itself looks wrong (a typo or a mislabelled sample), not the feed."],
];
const NUTRIENTS: NutrientCode[] = ["cp", "ca", "p", "na", "nacl", "fat", "fiber", "moisture", "zn", "cu"];
const KEY: NutrientCode[] = ["cp", "ca", "p", "na"];

/** "What do these mean?" — the Feed page explained for someone who isn't a nutritionist. */
export function HelpGlossary({ tolerances }: { tolerances: ToleranceMap }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        data-tour="help"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 font-semibold text-navy-800 hover:bg-page"
      >
        <HelpCircle size={18} /> What do these mean?
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-navy-950/40" onClick={() => setOpen(false)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-[520px] overflow-y-auto bg-surface px-6 py-6 shadow-2xl sm:px-8"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="help-title" className="text-2xl font-bold tracking-tight">
                What the Feed page shows
              </h2>
              <button ref={closeRef} onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1.5 text-ink-3 hover:bg-page">
                <X size={20} />
              </button>
            </div>
            <p className="mt-2 text-sm text-ink-2">
              Feed samples are tested to check that the hens got what the nutritionist formulated. This page compares the two.
            </p>

            <h3 className="mt-6 font-bold">“% of intended”</h3>
            <p className="mt-1 text-sm text-ink-2">
              Every result is shown as a percentage of what the diet’s recipe says it should contain. <b>100%</b> means the feed matched
              the recipe exactly; <b>85%</b> means it had 15% less than planned.
            </p>

            <h3 className="mt-6 font-bold">The colours</h3>
            <ul className="mt-2 grid gap-2">
              {COLOURS.map(([cls, name, meaning]) => (
                <li key={name} className="flex items-start gap-3 text-sm">
                  <span className={`w-28 shrink-0 rounded px-1.5 py-0.5 text-center text-[12px] font-semibold ${cls}`}>{name}</span>
                  <span className="text-ink-2">{meaning}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="pb-1 text-left text-xs text-ink-3">This customer’s bands (set under Operation → Tolerances)</caption>
                <thead>
                  <tr className="text-left text-xs text-ink-3 uppercase">
                    <th className="py-1 pr-3 font-semibold">Nutrient</th>
                    <th className="py-1 pr-3 font-semibold">In band</th>
                    <th className="py-1 font-semibold">Action if below</th>
                  </tr>
                </thead>
                <tbody>
                  {KEY.map((n) => {
                    const t = tolerances[n];
                    return (
                      <tr key={n} className="border-t border-line">
                        <td className="py-1.5 pr-3">{NUTRIENT_META[n].label}</td>
                        <td className="py-1.5 pr-3 font-mono">{t?.watchLow != null && t.watchHigh != null ? `${t.watchLow}–${t.watchHigh}%` : "—"}</td>
                        <td className="py-1.5 font-mono">{t?.actionLow != null ? `${t.actionLow}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h3 className="mt-6 font-bold">The nutrients</h3>
            <dl className="mt-2 grid gap-2 text-sm">
              {NUTRIENTS.map((n) => (
                <div key={n} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                  <dt className="font-mono font-semibold">{NUTRIENT_META[n].short}</dt>
                  <dd className="text-ink-2">
                    <b className="text-ink">{NUTRIENT_META[n].label}</b>
                    {NUTRIENT_META[n].why && <> — matters for {NUTRIENT_META[n].why}</>}
                    {NUTRIENT_META[n].unit === "ppm" && " (measured in parts per million)"}.
                  </dd>
                </div>
              ))}
            </dl>

            <h3 className="mt-6 font-bold">LAB and NIR</h3>
            <p className="mt-1 text-sm text-ink-2">
              <b>LAB</b> results come from a sample sent to a wet-chemistry laboratory: slower, but the most accurate. <b>NIR</b> results
              come from a near-infrared scanner on site: instant, but it needs regular checking against the lab.
            </p>

            <h3 className="mt-6 font-bold">Flock phases</h3>
            <p className="mt-1 text-sm text-ink-2">
              Hens get different diets as they grow: starter, grower, developer, pre-lay and layer. Results are grouped by phase because
              each has its own recipe.
            </p>

            <h3 className="mt-6 font-bold">Asking for help</h3>
            <p className="mt-1 text-sm text-ink-2">
              Click ✨ beside any result or flag for a plain-language explanation from the AI assistant, or ask your nutritionist from
              the Questions page.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
