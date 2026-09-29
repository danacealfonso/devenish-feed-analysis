"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Upload, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { evaluate } from "@/lib/analysis/deviation";
import { fmtDate, fmtPct } from "@/lib/analysis/flags";
import { applyFormulations, extractFormulations, mergeSamples, type Formulation } from "@/lib/analysis/merge";
import { usePortal } from "@/lib/data/portal";
import { sheetSummaries, toFormulationRows, toSampleRows, type LocatedSample } from "@/lib/import/payload";
import { FORMAT_LABELS, parseSheet, type NutrientCode, type SheetParse } from "@/lib/parsers";
import { readWorkbook } from "@/lib/parsers/readWorkbook";
import { supabase } from "@/lib/supabase/client";
import { cellClass } from "@/lib/ui/status";

type Step = "file" | "sheets" | "review" | "done";
interface SheetChoice {
  parse: SheetParse;
  selected: boolean;
  locationId: string;
}

const STEPS: [Step, string][] = [
  ["file", "Choose file"],
  ["sheets", "Pick sheets"],
  ["review", "Review"],
  ["done", "Imported"],
];

export function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { org, locations, tolerances, reload } = usePortal();
  const [step, setStep] = useState<Step>("file");
  const [file, setFile] = useState<File | null>(null);
  const [choices, setChoices] = useState<SheetChoice[]>([]);
  const [dbForms, setDbForms] = useState<Formulation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; merged: number } | null>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function reset() {
    setStep("file");
    setFile(null);
    setChoices([]);
    setError(null);
    setResult(null);
  }

  async function onFile(f: File) {
    setError(null);
    setBusy(true);
    try {
      const sheets = readWorkbook(new Uint8Array(await f.arrayBuffer()));
      const guess = (name: string) =>
        locations.find((l) => name.toLowerCase().includes(l.name.toLowerCase().replace(/^location /, "loc ")))?.id ??
        locations.find((l) => name.toLowerCase().includes(l.name.toLowerCase()))?.id ??
        locations[0]?.id ??
        "";
      setChoices(
        sheets.map((s) => {
          const parse = parseSheet(s.name, s.grid);
          return { parse, selected: parse.format !== "unknown" && parse.samples.length > 0, locationId: guess(s.name) };
        }),
      );
      setFile(f);
      if (org) {
        const { data } = await supabase.from("diet_formulations").select("diet_key, effective_from, nutrient, intended").eq("org_id", org.id);
        setDbForms(
          (data ?? []).map((r) => ({
            dietKey: r.diet_key,
            effectiveFrom: r.effective_from,
            nutrient: r.nutrient as NutrientCode,
            intended: Number(r.intended),
          })),
        );
      }
      setStep("sheets");
    } catch (e) {
      setError(`Could not read “${f.name}”: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  const review = useMemo(() => {
    const picked = choices.filter((c) => c.selected);
    const all: LocatedSample[] = picked.flatMap((c) =>
      c.parse.samples.map((s) => ({ ...s, results: s.results.map((r) => ({ ...r })), format: c.parse.format, locationId: c.locationId })),
    );
    const { merged, duplicates } = mergeSamples(all);
    const located = merged as LocatedSample[];
    const fileForms = extractFormulations(located);
    const { matched, unmatched } = applyFormulations(located, [...dbForms, ...fileForms]);
    return { picked, located, duplicates, matched, unmatched };
  }, [choices, dbForms]);

  async function doImport() {
    if (!org || !file) return;
    setBusy(true);
    setError(null);
    try {
      const uploadId = crypto.randomUUID();
      const path = `${org.id}/${uploadId}/${file.name}`;
      const up = await supabase.storage.from("feed-uploads").upload(path, file, { upsert: false });
      const { data, error } = await supabase.rpc("import_feed_upload", {
        p_org: org.id,
        p_upload: {
          file_name: file.name,
          storage_path: up.error ? null : path,
          sheets: sheetSummaries(review.picked.map((c) => c.parse)),
        },
        p_samples: toSampleRows(review.located),
        p_formulations: toFormulationRows(review.located),
      });
      if (error) throw error;
      setResult(data as { inserted: number; merged: number });
      setStep("done");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    onClose();
    setTimeout(reset, 200);
  };

  return (
    <dialog
      ref={ref}
      onClose={close}
      aria-labelledby="upload-title"
      className="m-auto w-[min(1000px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-navy-950/50"
    >
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <h2 id="upload-title" className="text-lg font-bold">
            Upload feed analysis
          </h2>
          <ol className="mt-1 flex flex-wrap gap-x-4 text-xs text-ink-3">
            {STEPS.map(([k, label], i) => (
              <li key={k} className={k === step ? "font-semibold text-navy-800" : ""} aria-current={k === step ? "step" : undefined}>
                {i + 1}. {label}
              </li>
            ))}
          </ol>
        </div>
        <button onClick={close} aria-label="Close" className="rounded-md p-2 hover:bg-page">
          <X size={18} />
        </button>
      </header>

      <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
        {error && (
          <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-action-bg px-3 py-2 text-sm text-action-ink">
            <XCircle size={16} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        {step === "file" && (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) onFile(f);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center ${
              drag ? "border-navy-700 bg-[#eef0fb]" : "border-line hover:bg-page"
            }`}
          >
            <FileSpreadsheet size={36} className="text-navy-700" />
            <span className="text-base font-semibold">{busy ? "Reading workbook…" : "Drop a lab or NIR export here, or click to browse"}</span>
            <span className="max-w-md text-sm text-ink-3">
              .xlsx, .xls or .csv. Wet-chem lab reports, NIR instrument exports and existing analyzed-vs-intended sheets are
              recognised automatically. You choose which sheets to import next.
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        )}

        {step === "sheets" && (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink-2">
                <b>{file?.name}</b> · {choices.length} sheets found. Assign each sheet to the location it was sampled at.
              </p>
              <button
                className="text-sm font-semibold text-navy-800 hover:underline"
                onClick={() => {
                  const all = choices.every((c) => c.selected || c.parse.format === "unknown");
                  setChoices(choices.map((c) => ({ ...c, selected: !all && c.parse.format !== "unknown" })));
                }}
              >
                Select all / none
              </button>
            </div>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {choices.map((c, i) => {
                const warn = c.parse.warnings.filter((w) => w.level !== "info").length;
                const unknown = c.parse.format === "unknown";
                return (
                  <li key={c.parse.sheet} className="grid gap-3 px-4 py-3 md:grid-cols-[auto_1fr_220px] md:items-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-[#1b1e52]"
                      checked={c.selected}
                      disabled={unknown}
                      aria-label={`Import ${c.parse.sheet}`}
                      onChange={(e) => setChoices(choices.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))}
                    />
                    <div>
                      <div className="font-semibold">{c.parse.sheet}</div>
                      <div className="flex flex-wrap gap-x-3 text-xs text-ink-3">
                        <span className={unknown ? "text-action-ink" : ""}>
                          {FORMAT_LABELS[c.parse.format]}
                          {!unknown && ` · ${Math.round(c.parse.confidence * 100)}% match`}
                        </span>
                        <span>{c.parse.samples.length} samples</span>
                        {warn > 0 && <span className="text-watch-ink">{warn} warning{warn > 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                    <select
                      value={c.locationId}
                      disabled={!c.selected}
                      aria-label={`Location for ${c.parse.sheet}`}
                      onChange={(e) => setChoices(choices.map((x, j) => (j === i ? { ...x, locationId: e.target.value } : x)))}
                      className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm disabled:opacity-50"
                    >
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Samples to import", review.located.length],
                ["Duplicates merged", review.duplicates],
                ["Matched to formulation", review.matched],
                ["Unmatched diet codes", review.unmatched.length],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-xl border border-line p-3">
                  <dt className="text-xs text-ink-3">{k}</dt>
                  <dd className="font-mono text-2xl font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {review.unmatched.length > 0 && (
              <p className="flex gap-2 rounded-lg bg-watch-bg px-3 py-2 text-sm text-watch-ink">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                No formulation on file for: {review.unmatched.join(", ")}. These import with analyzed values only and show
                “no target” until a formulation is uploaded.
              </p>
            )}
            <div>
              <h3 className="eyebrow mb-2">What we noticed</h3>
              <ul className="space-y-1.5 text-sm">
                {review.picked.flatMap((c) =>
                  c.parse.warnings.map((w, j) => (
                    <li key={`${c.parse.sheet}${j}`} className="flex gap-2">
                      {w.level === "info" ? (
                        <Info size={15} className="mt-0.5 shrink-0 text-ink-3" />
                      ) : (
                        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-watch-ink" />
                      )}
                      <span>
                        <b>{c.parse.sheet}:</b> {w.message}
                        {w.ref && <span className="text-ink-3"> ({w.ref})</span>}
                      </span>
                    </li>
                  )),
                )}
              </ul>
            </div>
            <div>
              <h3 className="eyebrow mb-2">Preview (first 8)</h3>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-page text-left text-xs text-ink-3 uppercase">
                      <th className="px-3 py-2">Sample / diet</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Source</th>
                      {(["cp", "ca", "p", "na"] as NutrientCode[]).map((n) => (
                        <th key={n} className="px-3 py-2 text-right">
                          {n.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {review.located.slice(0, 8).map((s, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="px-3 py-1.5">{s.externalId ?? s.dietCode}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(s.sampledOn)}</td>
                        <td className="px-3 py-1.5 uppercase">{s.source}</td>
                        {(["cp", "ca", "p", "na"] as NutrientCode[]).map((n) => {
                          const r = s.results.find((x) => x.nutrient === n && x.basis === "as_received");
                          const ev = r ? evaluate(r, tolerances) : null;
                          return (
                            <td key={n} className={`px-3 py-1.5 text-right font-mono ${ev ? cellClass(ev.status, ev.direction) : ""}`}>
                              {ev?.pct != null ? fmtPct(ev.pct) : (r?.analyzed ?? "·")}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 size={40} className="text-ok-ink" />
            <p className="text-lg font-semibold">
              {result.inserted} new sample{result.inserted === 1 ? "" : "s"} imported
            </p>
            <p className="text-sm text-ink-2">
              {result.merged} matched samples already on file; their missing values were filled in, nothing was overwritten.
            </p>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
        <button
          onClick={() => (step === "review" ? setStep("sheets") : step === "sheets" ? reset() : close())}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-ink-2 hover:bg-page"
        >
          {step === "file" || step === "done" ? "Close" : "Back"}
        </button>
        {step === "sheets" && (
          <button
            disabled={!review.picked.length}
            onClick={() => setStep("review")}
            className="rounded-lg bg-navy-900 px-5 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
          >
            Review {review.picked.length} sheet{review.picked.length === 1 ? "" : "s"}
          </button>
        )}
        {step === "review" && (
          <button
            disabled={busy || !review.located.length}
            onClick={doImport}
            className="flex items-center gap-2 rounded-lg bg-navy-900 px-5 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
          >
            <Upload size={16} /> {busy ? "Importing…" : `Import ${review.located.length} samples`}
          </button>
        )}
      </footer>
    </dialog>
  );
}
