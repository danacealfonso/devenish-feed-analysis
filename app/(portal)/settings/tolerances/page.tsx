"use client";

import { useEffect, useState } from "react";
import { DEFAULT_TOLERANCES, NUTRIENT_META, type ToleranceRule } from "@/lib/analysis/tolerances";
import { usePortal } from "@/lib/data/portal";
import { supabase } from "@/lib/supabase/client";

type Field = "watchLow" | "watchHigh" | "actionLow" | "actionHigh" | "intendedOffset";
const FIELDS: [Field, string][] = [
  ["actionLow", "Action below"],
  ["watchLow", "Watch below"],
  ["watchHigh", "Watch above"],
  ["actionHigh", "Action above"],
  ["intendedOffset", "Intended offset"],
];

export default function TolerancesPage() {
  const { org, rules, reload } = usePortal();
  const [draft, setDraft] = useState<ToleranceRule[]>(rules);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => setDraft(rules), [rules]);

  const set = (i: number, f: Field, v: string) =>
    setDraft(draft.map((r, j) => (j === i ? { ...r, [f]: v === "" ? (f === "intendedOffset" ? 0 : null) : Number(v) } : r)));

  async function save() {
    if (!org) return;
    setStatus("Saving…");
    const { error } = await supabase.from("tolerance_rules").upsert(
      draft.map((r) => ({
        org_id: org.id,
        nutrient: r.nutrient,
        mode: r.mode,
        watch_low: r.watchLow,
        watch_high: r.watchHigh,
        action_low: r.actionLow,
        action_high: r.actionHigh,
        intended_offset: r.intendedOffset,
        updated_at: new Date().toISOString(),
      })),
    );
    if (error) return setStatus(`Couldn't save: ${error.message}`);
    await reload();
    setStatus("Saved. Flags on the Feed page now use these bands.");
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-16 sm:px-8">
      <p className="pt-8 text-ink-2">{org?.name} · Operation</p>
      <h1 className="mt-1 text-4xl font-bold tracking-tight">Feed tolerances</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-2">
        Results are expressed as <b>% of intended</b> = analyzed ÷ (intended − offset) × 100. Outside the <b>watch</b> band a
        result is highlighted; beyond the <b>action</b> limits it is raised in “Needs attention”. Zinc and copper have no
        formulated value in the source data, so they use absolute ppm floors. An offset stated in an uploaded sheet (e.g.
        “Ca intended – 0.14”) takes precedence over the offset here.
      </p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3 uppercase">
              <th className="px-4 py-3">Nutrient</th>
              <th className="px-3 py-3">Basis</th>
              {FIELDS.map(([, l]) => (
                <th key={l} className="px-3 py-3 text-right">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.map((r, i) => (
              <tr key={r.nutrient} className="border-t border-line">
                <th scope="row" className="px-4 py-2 text-left font-semibold">
                  {NUTRIENT_META[r.nutrient].label}
                </th>
                <td className="px-3 py-2 text-xs text-ink-3">{r.mode === "pct" ? "% of intended" : "ppm, absolute"}</td>
                {FIELDS.map(([f, l]) => (
                  <td key={f} className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="any"
                      aria-label={`${NUTRIENT_META[r.nutrient].label} ${l}`}
                      disabled={r.mode === "abs_min" && (f === "watchHigh" || f === "actionHigh" || f === "intendedOffset")}
                      value={r[f] ?? ""}
                      onChange={(e) => set(i, f, e.target.value)}
                      className="w-20 rounded-md border border-line px-2 py-1 text-right font-mono disabled:bg-page disabled:text-ink-3"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={save} className="rounded-lg bg-navy-900 px-5 py-2.5 font-semibold text-white hover:bg-navy-800">
          Save tolerances
        </button>
        <button onClick={() => setDraft(DEFAULT_TOLERANCES)} className="rounded-lg px-4 py-2.5 font-semibold text-ink-2 hover:bg-white">
          Reset to defaults
        </button>
        {status && (
          <span role="status" className="text-sm text-ink-2">
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
