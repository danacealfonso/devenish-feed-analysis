"use client";

import { RefreshCw, Upload } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AttentionList } from "@/components/feed/AttentionList";
import { DeviationMatrix } from "@/components/feed/DeviationMatrix";
import { DistributionStrip } from "@/components/feed/DistributionStrip";
import { HeadlineCards } from "@/components/feed/HeadlineCards";
import { SummaryTable } from "@/components/feed/SummaryTable";
import { UploadDialog } from "@/components/feed/UploadDialog";
import { computeFlags, currentCycleStart, fmtDate } from "@/lib/analysis/flags";
import { PHASE_ORDER } from "@/lib/analysis/merge";
import { NUTRIENT_META } from "@/lib/analysis/tolerances";
import { usePortal } from "@/lib/data/portal";
import type { NutrientCode } from "@/lib/parsers/types";

const RANGES = [
  { v: "3", label: "Last 3 months" },
  { v: "6", label: "Last 6 months" },
  { v: "12", label: "Last 12 months" },
  { v: "all", label: "All time" },
];
const ALWAYS: NutrientCode[] = ["cp", "ca", "p", "na"];
const OPTIONAL: NutrientCode[] = ["nacl", "fat", "fiber", "moisture", "zn", "cu"];

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="eyebrow !text-[11px]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-navy-700/20"
      >
        {children}
      </select>
    </label>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={null}>
      <FeedContent />
    </Suspense>
  );
}

function FeedContent() {
  const params = useSearchParams();
  const { org, samples, locations, mills, tolerances, loading, error, reload } = usePortal();
  const [loc, setLoc] = useState(params.get("loc") ?? "all");
  const [mill, setMill] = useState("all");
  const [source, setSource] = useState("all");
  const [phase, setPhase] = useState("all");
  const [range, setRange] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);

  const latestDate = useMemo(
    () => samples.reduce<string | null>((m, s) => (s.sampledOn && (!m || s.sampledOn > m) ? s.sampledOn : m), null),
    [samples],
  );

  const filtered = useMemo(() => {
    let cutoff: string | null = null;
    if (range !== "all" && latestDate) {
      const d = new Date(`${latestDate}T00:00:00`);
      d.setMonth(d.getMonth() - Number(range));
      cutoff = d.toISOString().slice(0, 10);
    }
    const millLocs = mill === "all" ? null : new Set(locations.filter((l) => l.mill_id === mill).map((l) => l.id));
    return samples.filter(
      (s) =>
        (loc === "all" || s.locationId === loc) &&
        (!millLocs || millLocs.has(s.locationId)) &&
        (source === "all" || s.source === source) &&
        (phase === "all" || s.phase === phase) &&
        (!cutoff || (s.sampledOn ?? "") >= cutoff),
    );
  }, [samples, loc, mill, source, phase, range, latestDate, locations]);

  const nutrients = useMemo(
    () => [...ALWAYS, ...OPTIONAL.filter((n) => filtered.some((s) => s.results[n]?.analyzed != null))],
    [filtered],
  );
  const flags = useMemo(() => computeFlags(filtered), [filtered]);
  const phases = PHASE_ORDER.filter((p) => samples.some((s) => s.phase === p));

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-16 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-8">
        <div>
          <p className="text-ink-2">{org?.name ?? "—"} · Feed quality</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Feed analysis</h1>
          <p className="mt-2 text-sm text-ink-3">
            Did the birds get what was formulated? Lab and NIR results compared against each diet’s formulation.
            {latestDate && ` Latest sample ${fmtDate(latestDate)}.`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reload}
            aria-label="Refresh"
            title="Refresh"
            className="grid size-11 place-items-center rounded-lg border border-line bg-white hover:bg-page"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-navy-900 px-5 py-2.5 font-semibold text-white hover:bg-navy-800"
          >
            <Upload size={18} /> Upload feed analysis
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-5">
        <Select label="Location" value={loc} onChange={setLoc}>
          <option value="all">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Select label="Feed mill" value={mill} onChange={setMill}>
          <option value="all">All mills</option>
          {mills.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Select label="Flock phase" value={phase} onChange={setPhase}>
          <option value="all">All phases</option>
          {phases.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
        <Select label="Source" value={source} onChange={setSource}>
          <option value="all">Lab + NIR</option>
          <option value="lab">Wet-chem lab</option>
          <option value="nir">NIR</option>
        </Select>
        <Select label="Period" value={range} onChange={setRange}>
          {RANGES.map((r) => (
            <option key={r.v} value={r.v}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-action-bg px-4 py-3 text-sm text-action-ink">
          Couldn’t load feed data: {error}
        </p>
      )}

      {!loading && !error && samples.length === 0 ? (
        <div className="mt-10 rounded-xl border-2 border-dashed border-line bg-surface px-6 py-16 text-center">
          <h2 className="text-lg font-semibold">No feed analyses yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-3">
            Upload a lab report or NIR export to compare what was fed against what was formulated.
          </p>
          <button
            onClick={() => setUploadOpen(true)}
            className="mt-5 rounded-lg bg-navy-900 px-5 py-2.5 font-semibold text-white hover:bg-navy-800"
          >
            Upload feed analysis
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <HeadlineCards samples={filtered} tolerances={tolerances} />
          <div className="grid items-start gap-8 xl:grid-cols-2">
            <AttentionList flags={flags} since={currentCycleStart(filtered)} />
            <DistributionStrip samples={filtered} nutrients={nutrients} tolerances={tolerances} />
          </div>
          <DeviationMatrix samples={filtered} nutrients={nutrients} />
          <SummaryTable samples={filtered} nutrients={nutrients} tolerances={tolerances} />
          <p className="text-xs text-ink-3">
            Nutrients shown: {nutrients.map((n) => NUTRIENT_META[n].label).join(", ")}. As-received basis.
          </p>
        </div>
      )}

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}
