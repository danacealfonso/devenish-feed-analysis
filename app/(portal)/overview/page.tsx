"use client";

import { ArrowRight, FileSpreadsheet, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, Page, PageHeader } from "@/components/portal/PageHeader";
import { compliance, KEY_NUTRIENTS, latestDate } from "@/lib/analysis/compliance";
import { computeFlags, currentCycleStart, fmtDate } from "@/lib/analysis/flags";
import { NUTRIENT_META } from "@/lib/analysis/tolerances";
import { usePortal } from "@/lib/data/portal";
import { supabase } from "@/lib/supabase/client";
import { pillClass } from "@/lib/ui/status";

interface UploadRow {
  id: string;
  file_name: string;
  created_at: string;
  inserted_count: number;
  merged_count: number;
}
interface QuestionRow {
  id: string;
  subject: string;
  status: string;
  updated_at: string;
}

function bandColor(p: number | null) {
  if (p == null) return "bg-line";
  if (p >= 75) return "bg-ok-ink";
  if (p >= 50) return "bg-[#d08a0b]";
  return "bg-action-ink";
}

export default function OverviewPage() {
  const { org, session, samples, locations, mills, loading } = usePortal();
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);

  useEffect(() => {
    if (!org) return;
    supabase
      .from("uploads")
      .select("id, file_name, created_at, inserted_count, merged_count")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(4)
      .then(({ data }) => setUploads((data ?? []) as UploadRow[]));
    supabase
      .from("questions")
      .select("id, subject, status, updated_at")
      .eq("org_id", org.id)
      .neq("status", "closed")
      .order("updated_at", { ascending: false })
      .limit(4)
      .then(({ data }) => setQuestions((data ?? []) as QuestionRow[]));
  }, [org]);

  const cycleStart = currentCycleStart(samples);
  const cards = useMemo(
    () =>
      locations.map((l) => {
        const list = samples.filter((s) => s.locationId === l.id);
        const current = cycleStart ? list.filter((s) => (s.sampledOn ?? "") >= cycleStart) : list;
        const flags = computeFlags(list).filter((f) => f.severity === "action" || f.severity === "suspect");
        return {
          loc: l,
          mill: mills.find((m) => m.id === l.mill_id)?.name ?? null,
          total: list.length,
          current: current.length,
          last: latestDate(list),
          diets: new Set(list.map((s) => s.dietKey)).size,
          flags: flags.length,
          byNutrient: KEY_NUTRIENTS.map((n) => ({ n, c: compliance(current.length ? current : list, n) })),
        };
      }),
    [locations, samples, mills, cycleStart],
  );

  const firstName = ((session.user.user_metadata?.full_name as string | undefined) ?? "").split(" ")[0];

  return (
    <Page wide>
      <PageHeader
        section="Overview"
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description={
          <>
            {locations.length} locations · {samples.length} feed samples on file
            {latestDate(samples) && ` · latest ${fmtDate(latestDate(samples))}`}. In-band rates cover the current
            sampling cycle{cycleStart ? ` (since ${fmtDate(cycleStart)})` : ""}.
          </>
        }
      />

      <h2 className="eyebrow mt-8">Locations</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ loc, mill, total, current, last, diets, flags, byNutrient }) => (
          <article key={loc.id} className="flex flex-col rounded-xl border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold">{loc.name}</h3>
                <p className="text-sm text-ink-3">{mill ? `Fed from ${mill}` : "No feed mill assigned"}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pillClass(flags ? "action" : total ? "ok" : "info")}`}>
                {flags ? `${flags} to review` : total ? "No open flags" : "No data"}
              </span>
            </div>
            <dl className="mt-5 space-y-2.5">
              {byNutrient.map(({ n, c }) => (
                <div key={n} className="grid grid-cols-[90px_1fr_48px] items-center gap-3 text-sm">
                  <dt className="font-medium">{NUTRIENT_META[n].label.replace("Total ", "")}</dt>
                  <div className="h-2 overflow-hidden rounded-full bg-page" aria-hidden>
                    <div className={`h-full rounded-full ${bandColor(c.pctInBand)}`} style={{ width: `${c.pctInBand ?? 0}%` }} />
                  </div>
                  <dd className="text-right font-mono text-sm">{c.pctInBand != null ? `${Math.round(c.pctInBand)}%` : "—"}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-1 text-right text-[11px] text-ink-3">% of results in band</p>
            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-xs">
              <div>
                <dt className="font-semibold text-ink-3 uppercase">This cycle</dt>
                <dd className="mt-1 font-mono text-base font-semibold">{current}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink-3 uppercase">Diets</dt>
                <dd className="mt-1 font-mono text-base font-semibold">{diets}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink-3 uppercase">Last sample</dt>
                <dd className="mt-1 text-sm font-semibold">{last ? fmtDate(last) : "—"}</dd>
              </div>
            </dl>
            <Link
              href={`/feed?loc=${loc.id}`}
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-navy-800 hover:underline"
            >
              Open feed analysis <ArrowRight size={14} />
            </Link>
          </article>
        ))}
        {!loading && !cards.length && (
          <p className="text-sm text-ink-3">
            No locations yet. Add one under{" "}
            <Link className="font-semibold text-navy-800 underline" href="/operation">
              Operation
            </Link>
            .
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card
          title="Recent uploads"
          actions={
            <Link href="/data" className="text-sm font-semibold text-navy-800 hover:underline">
              All data →
            </Link>
          }
        >
          <ul className="divide-y divide-line">
            {uploads.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                <FileSpreadsheet size={18} className="shrink-0 text-navy-700" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{u.file_name}</p>
                  <p className="text-xs text-ink-3">
                    {fmtDate(u.created_at.slice(0, 10))} · {u.inserted_count} new, {u.merged_count} merged
                  </p>
                </div>
              </li>
            ))}
            {!uploads.length && <li className="px-5 py-6 text-sm text-ink-3">No uploads yet.</li>}
          </ul>
        </Card>
        <Card
          title="Open questions"
          actions={
            <Link href="/questions" className="text-sm font-semibold text-navy-800 hover:underline">
              All questions →
            </Link>
          }
        >
          <ul className="divide-y divide-line">
            {questions.map((q) => (
              <li key={q.id}>
                <Link href={`/questions?id=${q.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-page">
                  <MessageSquare size={18} className="shrink-0 text-navy-700" />
                  <span className="min-w-0 flex-1 truncate font-medium">{q.subject}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pillClass(q.status === "open" ? "watch" : "ok")}`}>
                    {q.status}
                  </span>
                </Link>
              </li>
            ))}
            {!questions.length && (
              <li className="px-5 py-6 text-sm text-ink-3">
                No open questions.{" "}
                <Link href="/questions?new=1" className="font-semibold text-navy-800 underline">
                  Ask your nutritionist
                </Link>
              </li>
            )}
          </ul>
        </Card>
      </div>
    </Page>
  );
}
