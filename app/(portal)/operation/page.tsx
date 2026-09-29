"use client";

import { Factory, MapPin, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonPrimary, Card, inputBase, Page, PageHeader } from "@/components/portal/PageHeader";
import { NUTRIENT_META } from "@/lib/analysis/tolerances";
import { usePortal } from "@/lib/data/portal";
import { supabase } from "@/lib/supabase/client";

export default function OperationPage() {
  const { org, locations, mills, samples, rules, reload } = usePortal();
  const [error, setError] = useState<string | null>(null);
  const [newLoc, setNewLoc] = useState({ name: "", mill: "" });
  const [newMill, setNewMill] = useState("");

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    const { error } = await p;
    if (error) setError(error.message);
    else await reload();
  }

  const samplesAt = (id: string) => samples.filter((s) => s.locationId === id).length;
  const locationsOn = (id: string) => locations.filter((l) => l.mill_id === id).length;

  return (
    <Page>
      <PageHeader
        section="Operation"
        title="Operation"
        description="The farm locations and feed mills for this customer, and the tolerances used to judge feed results."
      />
      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-action-bg px-4 py-3 text-sm text-action-ink">
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title="Farm locations" subtitle="Each location is fed from one mill. Samples are assigned to a location on upload.">
          <ul className="divide-y divide-line">
            {locations.map((l) => {
              const n = samplesAt(l.id);
              return (
                <li key={l.id} className="grid items-center gap-2 px-5 py-3 sm:grid-cols-[1fr_190px_auto]">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="shrink-0 text-navy-700" />
                    <input
                      aria-label="Location name"
                      defaultValue={l.name}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && run(supabase.from("locations").update({ name: e.target.value.trim() }).eq("id", l.id))}
                      className={`${inputBase} w-full border-transparent font-semibold hover:border-line`}
                    />
                  </div>
                  <select
                    aria-label={`Feed mill for ${l.name}`}
                    value={l.mill_id ?? ""}
                    onChange={(e) => run(supabase.from("locations").update({ mill_id: e.target.value || null }).eq("id", l.id))}
                    className={inputBase}
                  >
                    <option value="">No mill</option>
                    {mills.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs whitespace-nowrap text-ink-3">{n} samples</span>
                    <button
                      aria-label={`Delete ${l.name}`}
                      title={n ? "Locations with samples can’t be deleted" : "Delete location"}
                      disabled={n > 0}
                      onClick={() => confirm(`Delete ${l.name}?`) && run(supabase.from("locations").delete().eq("id", l.id))}
                      className="rounded p-1.5 text-ink-3 hover:bg-action-bg hover:text-action-ink disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!org || !newLoc.name.trim()) return;
              run(supabase.from("locations").insert({ org_id: org.id, name: newLoc.name.trim(), mill_id: newLoc.mill || null })).then(() =>
                setNewLoc({ name: "", mill: "" }),
              );
            }}
            className="grid gap-2 border-t border-line px-5 py-4 sm:grid-cols-[1fr_190px_auto]"
          >
            <input aria-label="New location name" placeholder="New location name" value={newLoc.name} onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })} className={inputBase} />
            <select aria-label="Feed mill for new location" value={newLoc.mill} onChange={(e) => setNewLoc({ ...newLoc, mill: e.target.value })} className={inputBase}>
              <option value="">No mill</option>
              {mills.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <button className={buttonPrimary} disabled={!newLoc.name.trim()}>
              <Plus size={16} /> Add
            </button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card title="Feed mills">
            <ul className="divide-y divide-line">
              {mills.map((m) => {
                const n = locationsOn(m.id);
                return (
                  <li key={m.id} className="flex items-center gap-2 px-5 py-3">
                    <Factory size={16} className="shrink-0 text-navy-700" />
                    <input
                      aria-label="Mill name"
                      defaultValue={m.name}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && run(supabase.from("feed_mills").update({ name: e.target.value.trim() }).eq("id", m.id))}
                      className={`${inputBase} min-w-0 flex-1 border-transparent font-semibold hover:border-line`}
                    />
                    <span className="text-xs whitespace-nowrap text-ink-3">{n} loc.</span>
                    <button
                      aria-label={`Delete ${m.name}`}
                      title={n ? "Mills supplying a location can’t be deleted" : "Delete mill"}
                      disabled={n > 0}
                      onClick={() => confirm(`Delete ${m.name}?`) && run(supabase.from("feed_mills").delete().eq("id", m.id))}
                      className="rounded p-1.5 text-ink-3 hover:bg-action-bg hover:text-action-ink disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!org || !newMill.trim()) return;
                run(supabase.from("feed_mills").insert({ org_id: org.id, name: newMill.trim() })).then(() => setNewMill(""));
              }}
              className="flex gap-2 border-t border-line px-5 py-4"
            >
              <input aria-label="New mill name" placeholder="New feed mill" value={newMill} onChange={(e) => setNewMill(e.target.value)} className={`${inputBase} min-w-0 flex-1`} />
              <button className={buttonPrimary} disabled={!newMill.trim()}>
                <Plus size={16} /> Add
              </button>
            </form>
          </Card>

          <Card
            title="Feed tolerances"
            subtitle="Watch and action bands, as % of intended."
            actions={
              <Link href="/settings/tolerances" className="inline-flex items-center gap-1 text-sm font-semibold text-navy-800 hover:underline">
                <SlidersHorizontal size={14} /> Edit
              </Link>
            }
          >
            <table className="w-full text-sm">
              <tbody className="font-mono">
                {rules
                  .filter((r) => ["cp", "ca", "p", "na"].includes(r.nutrient))
                  .map((r) => (
                    <tr key={r.nutrient} className="border-t border-line first:border-0">
                      <th scope="row" className="px-5 py-2 text-left font-sans font-semibold">{NUTRIENT_META[r.nutrient].label}</th>
                      <td className="px-3 py-2 text-right">watch {r.watchLow}–{r.watchHigh}%</td>
                      <td className="px-5 py-2 text-right">action &lt;{r.actionLow ?? "—"}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </Page>
  );
}
