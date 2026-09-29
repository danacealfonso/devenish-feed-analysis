"use client";

import { AlertTriangle, HelpCircle, Info, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CURRENT_WINDOW_DAYS, fmtDate, type Flag } from "@/lib/analysis/flags";
import { pillClass } from "@/lib/ui/status";

const ICON = { action: AlertTriangle, suspect: HelpCircle, watch: TrendingDown, info: Info };
const LABEL = { action: "Action", suspect: "Check data", watch: "Watch", info: "Info" };

export function AttentionList({ flags, since }: { flags: Flag[]; since: string | null }) {
  const [showAll, setShowAll] = useState(false);
  const counts = { action: 0, suspect: 0, watch: 0, info: 0 };
  for (const f of flags) counts[f.severity]++;
  const visible = showAll ? flags : flags.slice(0, 6);

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
        <div className="flex gap-2 text-xs font-semibold">
          {(["action", "suspect", "watch"] as const).map((k) => (
            <span key={k} className={`rounded-full px-2.5 py-1 ${pillClass(k)}`}>
              {counts[k]} {LABEL[k].toLowerCase()}
            </span>
          ))}
        </div>
      </header>
      {flags.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-3">
          Every diet’s latest result is within its watch band. Nothing needs attention.
        </p>
      ) : (
        <ol className="divide-y divide-line">
          {visible.map((f) => {
            const Icon = ICON[f.severity];
            return (
              <li key={f.id} className="flex gap-3 px-5 py-3.5">
                <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${pillClass(f.severity)}`}>
                  <Icon size={15} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-semibold">
                      <span className="sr-only">{LABEL[f.severity]}: </span>
                      {f.title}
                    </p>
                    <span className="text-xs whitespace-nowrap text-ink-3">{fmtDate(f.date)}</span>
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
      {flags.length > 6 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full border-t border-line px-5 py-3 text-sm font-semibold text-navy-800 hover:bg-page"
        >
          {showAll ? "Show fewer" : `Show all ${flags.length}`}
        </button>
      )}
    </section>
  );
}
