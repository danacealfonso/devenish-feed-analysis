"use client";

import { Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { buttonPrimary, inputBase, Page, PageHeader } from "@/components/portal/PageHeader";
import { compliance, KEY_NUTRIENTS, monthLabel, monthOf } from "@/lib/analysis/compliance";
import { computeFlags, fmtDate, fmtPct, fmtVal } from "@/lib/analysis/flags";
import { NUTRIENT_META } from "@/lib/analysis/tolerances";
import { usePortal } from "@/lib/data/portal";
import { cellClass, glyph } from "@/lib/ui/status";

/** Monthly feed quality report: a printable summary a nutritionist can send to the producer or the mill. */
export default function ReportsPage() {
  const { org, samples, locations, mills, session } = usePortal();
  const months = useMemo(
    () => [...new Set(samples.map((s) => monthOf(s.sampledOn)).filter((m): m is string => !!m))].sort().reverse(),
    [samples],
  );
  const [month, setMonth] = useState<string>("");
  const [loc, setLoc] = useState("all");
  const m = month || months[0] || "";

  const list = useMemo(
    () =>
      samples
        .filter((s) => monthOf(s.sampledOn) === m && (loc === "all" || s.locationId === loc))
        .sort((a, b) => a.locationName.localeCompare(b.locationName) || a.dietCode.localeCompare(b.dietCode, undefined, { numeric: true })),
    [samples, m, loc],
  );
  const flags = useMemo(() => computeFlags(list).filter((f) => f.severity !== "info"), [list]);
  const locName = loc === "all" ? "All locations" : locations.find((l) => l.id === loc)?.name;
  const locMills = loc === "all" ? mills.map((x) => x.name) : mills.filter((x) => x.id === locations.find((l) => l.id === loc)?.mill_id).map((x) => x.name);

  return (
    <Page>
      <div className="print:hidden">
      <PageHeader
        section="Reports"
        title="Monthly feed report"
        description="A printable summary of one month’s feed analyses. Use Print → Save as PDF to share it."
        actions={
          <>
            <select aria-label="Month" value={m} onChange={(e) => setMonth(e.target.value)} className={inputBase}>
              {months.map((x) => (
                <option key={x} value={x}>{monthLabel(x, "long")}</option>
              ))}
            </select>
            <select aria-label="Location" value={loc} onChange={(e) => setLoc(e.target.value)} className={inputBase}>
              <option value="all">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <button className={buttonPrimary} onClick={() => window.print()} disabled={!list.length}>
              <Printer size={16} /> Print / PDF
            </button>
          </>
        }
      />
      </div>

      <article className="mt-8 rounded-xl border border-line bg-surface p-8 print:mt-0 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-navy-900 pb-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-ink-3">DEVENISH · FEED QUALITY REPORT</p>
            <h2 className="mt-1 text-2xl font-bold">
              {org?.name} · {m ? monthLabel(m, "long") : "—"}
            </h2>
            <p className="text-sm text-ink-2">
              {locName}
              {locMills.length ? ` · Feed from ${locMills.join(", ")}` : ""}
            </p>
          </div>
          <p className="text-right text-xs text-ink-3">
            Prepared {fmtDate(new Date().toISOString().slice(0, 10))}
            <br />
            by {(session.user.user_metadata?.full_name as string) || session.user.email}
          </p>
        </header>

        {!list.length ? (
          <p className="py-10 text-center text-ink-3">No samples for this month and location.</p>
        ) : (
          <>
            <section className="mt-6">
              <h3 className="eyebrow">Summary · {list.length} samples</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                {KEY_NUTRIENTS.map((n) => {
                  const c = compliance(list, n);
                  return (
                    <div key={n} className="rounded-lg border border-line p-3 break-inside-avoid">
                      <p className="text-sm font-semibold">{NUTRIENT_META[n].label}</p>
                      <p className="mt-1 font-mono text-2xl font-semibold">{c.pctInBand != null ? `${Math.round(c.pctInBand)}%` : "—"}</p>
                      <p className="text-xs text-ink-3">in band · median {c.median != null ? `${Math.round(c.median)}%` : "—"} of intended</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-8 break-inside-avoid">
              <h3 className="eyebrow">Points for attention</h3>
              {flags.length ? (
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
                  {flags.slice(0, 12).map((f) => (
                    <li key={f.id}>
                      <b>{f.title}.</b> {f.detail}
                    </li>
                  ))}
                  {flags.length > 12 && <li className="text-ink-3">…and {flags.length - 12} more on the Feed page.</li>}
                </ol>
              ) : (
                <p className="mt-3 text-sm">All results were within their watch bands.</p>
              )}
            </section>

            <section className="mt-8">
              <h3 className="eyebrow">Results (% of intended)</h3>
              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-ink-3 uppercase">
                    <th className="py-1.5 pr-2">Location · diet</th>
                    <th className="px-2 py-1.5">Date</th>
                    <th className="px-2 py-1.5">Src</th>
                    {KEY_NUTRIENTS.map((n) => (
                      <th key={n} className="px-2 py-1.5 text-right">{NUTRIENT_META[n].short}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => (
                    <tr key={s.id} className="border-b border-line break-inside-avoid">
                      <td className="py-1.5 pr-2">
                        {s.locationName} · <b>{s.dietCode}</b>
                        {s.farmLabel && ` · Farm ${s.farmLabel}`}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(s.sampledOn)}</td>
                      <td className="px-2 py-1.5 uppercase">{s.source}</td>
                      {KEY_NUTRIENTS.map((n) => {
                        const r = s.results[n];
                        return (
                          <td
                            key={n}
                            className={`px-2 py-1.5 text-right font-mono whitespace-nowrap ${r ? cellClass(r.ev.status, r.ev.direction) : ""}`}
                            title={r ? `${fmtVal(r.analyzed)} vs ${fmtVal(r.intended)}` : undefined}
                          >
                            {r ? `${fmtPct(r.ev.pct)}${glyph(r.ev.status, r.ev.direction)}` : "·"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] text-ink-3">
                ▼/▲ outside watch band · ▼▼/▲▲ beyond action limit · ? result needs checking before acting on it. Bands per
                Devenish tolerance settings for this customer.
              </p>
            </section>
          </>
        )}
      </article>
    </Page>
  );
}
