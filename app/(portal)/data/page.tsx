"use client";

import { AlertTriangle, ChevronRight, Download, FileSpreadsheet, Info, Upload } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { UploadDialog } from "@/components/feed/UploadDialog";
import { buttonPrimary, buttonSecondary, Card, Page, PageHeader } from "@/components/portal/PageHeader";
import { usePortal } from "@/lib/data/portal";
import { downloadText, samplesToCsv } from "@/lib/export/csv";
import { FORMAT_LABELS, type ParseWarning, type SheetFormat } from "@/lib/parsers";
import { supabase } from "@/lib/supabase/client";

interface SheetInfo {
  sheet: string;
  format: SheetFormat;
  confidence: number;
  samples: number;
  warnings: ParseWarning[];
}
interface UploadRow {
  id: string;
  file_name: string;
  storage_path: string | null;
  sheets: SheetInfo[];
  inserted_count: number;
  merged_count: number;
  uploaded_by: string | null;
  created_at: string;
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function DataPage() {
  const { org, samples, session } = usePortal();
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!org) return;
    const { data, error } = await supabase
      .from("uploads")
      .select("id, file_name, storage_path, sheets, inserted_count, merged_count, uploaded_by, created_at")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setUploads((data ?? []) as UploadRow[]);
  }, [org]);

  useEffect(() => {
    load();
  }, [load, samples.length]);

  async function downloadRaw(u: UploadRow) {
    if (!u.storage_path) return;
    const { data, error } = await supabase.storage.from("feed-uploads").createSignedUrl(u.storage_path, 60);
    if (error) return setError(error.message);
    window.location.assign(data.signedUrl);
  }

  return (
    <Page wide>
      <PageHeader
        section="Data"
        title="Data"
        description="Every file uploaded for this customer, what was detected in each sheet, and what the import did with it."
        actions={
          <>
            <button
              className={buttonSecondary}
              disabled={!samples.length}
              onClick={() => downloadText(`${org?.name ?? "feed"}-feed-analyses.csv`.replace(/\s+/g, "-").toLowerCase(), samplesToCsv(samples))}
            >
              <Download size={16} /> Export all results (CSV)
            </button>
            <button className={buttonPrimary} onClick={() => setUploadOpen(true)}>
              <Upload size={16} /> Upload feed analysis
            </button>
          </>
        }
      />

      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-action-bg px-4 py-3 text-sm text-action-ink">
          {error}
        </p>
      )}

      <Card className="mt-8" title="Upload history" subtitle={`${uploads.length} uploads · ${samples.length} samples on file`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3 uppercase">
                <th scope="col" className="px-5 py-2">File</th>
                <th scope="col" className="px-3 py-2">Uploaded</th>
                <th scope="col" className="px-3 py-2">Sheets</th>
                <th scope="col" className="px-3 py-2 text-right">New</th>
                <th scope="col" className="px-3 py-2 text-right">Merged</th>
                <th scope="col" className="px-3 py-2 text-right">Warnings</th>
                <th scope="col" className="px-5 py-2 text-right">Raw file</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => {
                const warn = u.sheets.reduce((a, s) => a + s.warnings.filter((w) => w.level !== "info").length, 0);
                const isOpen = open === u.id;
                return (
                  <Fragment key={u.id}>
                    <tr className="border-t border-line">
                      <td className="px-5 py-3">
                        <button
                          onClick={() => setOpen(isOpen ? null : u.id)}
                          aria-expanded={isOpen}
                          className="flex items-center gap-2 text-left font-semibold hover:underline"
                        >
                          <ChevronRight size={15} className={`shrink-0 transition ${isOpen ? "rotate-90" : ""}`} />
                          <FileSpreadsheet size={16} className="shrink-0 text-navy-700" />
                          {u.file_name}
                        </button>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-ink-2">
                        {fmtDateTime(u.created_at)}
                        <span className="block text-xs text-ink-3">
                          {u.uploaded_by === session.user.id ? "by you" : u.uploaded_by ? "by a team member" : "demo seed"}
                        </span>
                      </td>
                      <td className="px-3 py-3">{u.sheets.length}</td>
                      <td className="px-3 py-3 text-right font-mono">{u.inserted_count}</td>
                      <td className="px-3 py-3 text-right font-mono">{u.merged_count}</td>
                      <td className={`px-3 py-3 text-right font-mono ${warn ? "text-watch-ink" : ""}`}>{warn}</td>
                      <td className="px-5 py-3 text-right">
                        {u.storage_path ? (
                          <button onClick={() => downloadRaw(u)} className="inline-flex items-center gap-1 font-semibold text-navy-800 hover:underline">
                            <Download size={14} /> Download
                          </button>
                        ) : (
                          <span className="text-xs text-ink-3">not stored</span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-[#fafafc]">
                        <td colSpan={7} className="px-5 pt-1 pb-4">
                          <ul className="space-y-3">
                            {u.sheets.map((s) => (
                              <li key={s.sheet} className="rounded-lg border border-line bg-white p-3">
                                <p className="font-semibold">
                                  {s.sheet}{" "}
                                  <span className="font-normal text-ink-3">
                                    · {FORMAT_LABELS[s.format]} ({Math.round(s.confidence * 100)}% match) · {s.samples} samples
                                  </span>
                                </p>
                                <ul className="mt-1.5 space-y-1 text-sm">
                                  {s.warnings.map((w, i) => (
                                    <li key={i} className="flex gap-2">
                                      {w.level === "info" ? (
                                        <Info size={14} className="mt-0.5 shrink-0 text-ink-3" />
                                      ) : (
                                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-watch-ink" />
                                      )}
                                      <span>
                                        {w.message}
                                        {w.ref && <span className="text-ink-3"> ({w.ref})</span>}
                                      </span>
                                    </li>
                                  ))}
                                  {!s.warnings.length && <li className="text-ink-3">Read cleanly, no issues.</li>}
                                </ul>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!uploads.length && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-ink-3">
                    Nothing uploaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <UploadDialog
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false);
          load();
        }}
      />
    </Page>
  );
}
