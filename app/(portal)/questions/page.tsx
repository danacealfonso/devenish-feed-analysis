"use client";

import { MessageSquarePlus, Send } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { buttonPrimary, buttonSecondary, inputBase, Page, PageHeader } from "@/components/portal/PageHeader";
import { usePortal } from "@/lib/data/portal";
import { supabase } from "@/lib/supabase/client";
import { pillClass } from "@/lib/ui/status";

interface Question {
  id: string;
  subject: string;
  body: string;
  status: "open" | "answered" | "closed";
  location_id: string | null;
  diet_key: string | null;
  author_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
interface Reply {
  id: string;
  body: string;
  author_name: string | null;
  created_by: string | null;
  created_at: string;
}

const STATUS_PILL = { open: "watch", answered: "ok", closed: "info" } as const;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function QuestionsPage() {
  return (
    <Suspense fallback={null}>
      <Questions />
    </Suspense>
  );
}

function Questions() {
  const params = useSearchParams();
  const router = useRouter();
  const { org, session, locations } = usePortal();
  const [list, setList] = useState<Question[]>([]);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [error, setError] = useState<string | null>(null);
  const selectedId = params.get("id");
  const composing = params.get("new") === "1";
  const me = (session.user.user_metadata?.full_name as string | undefined)?.trim() || session.user.email || "Me";

  const load = useCallback(async () => {
    if (!org) return;
    const { data, error } = await supabase.from("questions").select("*").eq("org_id", org.id).order("updated_at", { ascending: false });
    if (error) setError(error.message);
    else setList((data ?? []) as Question[]);
  }, [org]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = list.filter((q) => filter === "all" || q.status !== "closed");
  const selected = list.find((q) => q.id === selectedId) ?? null;
  const go = (qs: string) => router.replace(`/questions${qs}`);

  return (
    <Page wide>
      <PageHeader
        section="Questions"
        title="Questions"
        description="Ask your Devenish nutritionist about a result, a diet or a location. Everyone on this customer’s team can see and reply."
        actions={
          <button className={buttonPrimary} onClick={() => go("?new=1")}>
            <MessageSquarePlus size={16} /> New question
          </button>
        }
      />
      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-action-bg px-4 py-3 text-sm text-action-ink">
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section aria-label="Question list" className="rounded-xl border border-line bg-surface">
          <div className="flex gap-1 border-b border-line p-2" role="tablist">
            {(["active", "all"] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${filter === f ? "bg-navy-900 text-white" : "text-ink-2 hover:bg-page"}`}
              >
                {f === "active" ? "Open & answered" : "All"}
              </button>
            ))}
          </div>
          <ul className="divide-y divide-line">
            {visible.map((q) => (
              <li key={q.id}>
                <button
                  onClick={() => go(`?id=${q.id}`)}
                  aria-current={q.id === selectedId ? "true" : undefined}
                  className={`block w-full px-4 py-3 text-left hover:bg-page ${q.id === selectedId ? "bg-[#eef0fb]" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{q.subject}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pillClass(STATUS_PILL[q.status])}`}>{q.status}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {q.author_name ?? "Someone"} · {when(q.updated_at)}
                    {q.location_id && ` · ${locations.find((l) => l.id === q.location_id)?.name ?? ""}`}
                  </p>
                </button>
              </li>
            ))}
            {!visible.length && <li className="px-4 py-8 text-center text-sm text-ink-3">No questions yet.</li>}
          </ul>
        </section>

        <div>
          {composing ? (
            <NewQuestion
              me={me}
              prefill={{ subject: params.get("subject") ?? "", body: params.get("body") ?? "", loc: params.get("loc") ?? "", diet: params.get("diet") ?? "" }}
              onCreated={async (id) => {
                await load();
                go(`?id=${id}`);
              }}
              onCancel={() => go("")}
            />
          ) : selected ? (
            <Thread q={selected} me={me} onChange={load} />
          ) : (
            <div className="grid h-full min-h-60 place-items-center rounded-xl border-2 border-dashed border-line p-8 text-center text-sm text-ink-3">
              Select a question, or start a new one. You can also ask about any flag from the Feed page’s “Needs attention” list.
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

function NewQuestion({
  me,
  prefill,
  onCreated,
  onCancel,
}: {
  me: string;
  prefill: { subject: string; body: string; loc: string; diet: string };
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const { org, locations } = usePortal();
  const [subject, setSubject] = useState(prefill.subject);
  const [body, setBody] = useState(prefill.body);
  const [loc, setLoc] = useState(prefill.loc);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("questions")
      .insert({ org_id: org.id, subject: subject.trim(), body: body.trim(), location_id: loc || null, diet_key: prefill.diet || null, author_name: me })
      .select("id")
      .single();
    setBusy(false);
    if (error) setError(error.message);
    else onCreated(data.id);
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-lg font-bold">New question</h2>
      <label className="mt-4 block text-sm font-medium" htmlFor="q-subject">Subject</label>
      <input id="q-subject" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} className={`${inputBase} mt-1.5 w-full`} />
      <label className="mt-4 block text-sm font-medium" htmlFor="q-loc">Location (optional)</label>
      <select id="q-loc" value={loc} onChange={(e) => setLoc(e.target.value)} className={`${inputBase} mt-1.5 w-full`}>
        <option value="">Not location-specific</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      <label className="mt-4 block text-sm font-medium" htmlFor="q-body">Question</label>
      <textarea id="q-body" required maxLength={5000} rows={6} value={body} onChange={(e) => setBody(e.target.value)} className={`${inputBase} mt-1.5 w-full`} />
      {prefill.diet && <p className="mt-2 text-xs text-ink-3">Linked to diet “{prefill.diet}”.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-action-ink">{error}</p>}
      <div className="mt-5 flex gap-2">
        <button disabled={busy} className={buttonPrimary}>{busy ? "Posting…" : "Post question"}</button>
        <button type="button" onClick={onCancel} className={buttonSecondary}>Cancel</button>
      </div>
    </form>
  );
}

function Thread({ q, me, onChange }: { q: Question; me: string; onChange: () => void }) {
  const { locations } = usePortal();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("question_replies").select("*").eq("question_id", q.id).order("created_at");
    setReplies((data ?? []) as Reply[]);
  }, [q.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("question_replies").insert({ question_id: q.id, body: text.trim(), author_name: me });
    setBusy(false);
    if (error) return setError(error.message);
    setText("");
    await load();
    onChange();
  }

  async function setStatus(status: Question["status"]) {
    const { error } = await supabase.from("questions").update({ status, updated_at: new Date().toISOString() }).eq("id", q.id);
    if (error) setError(error.message);
    else onChange();
  }

  const loc = locations.find((l) => l.id === q.location_id);
  return (
    <article className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-lg font-bold">{q.subject}</h2>
          <p className="text-xs text-ink-3">
            {q.author_name ?? "Someone"} · {when(q.created_at)}
            {loc && ` · ${loc.name}`}
            {q.diet_key && (
              <>
                {" · "}
                <Link href={`/feed/diet?loc=${q.location_id}&diet=${encodeURIComponent(q.diet_key)}`} className="font-semibold text-navy-800 underline">
                  diet {q.diet_key}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pillClass(STATUS_PILL[q.status])}`}>{q.status}</span>
          {q.status === "open" && <button onClick={() => setStatus("answered")} className={buttonSecondary}>Mark answered</button>}
          {q.status !== "closed" ? (
            <button onClick={() => setStatus("closed")} className={buttonSecondary}>Close</button>
          ) : (
            <button onClick={() => setStatus("open")} className={buttonSecondary}>Reopen</button>
          )}
        </div>
      </header>
      <ol className="space-y-4 px-5 py-5">
        {[{ id: "q", body: q.body, author_name: q.author_name, created_at: q.created_at }, ...replies].map((m) => (
          <li key={m.id} className="rounded-lg bg-page px-4 py-3">
            <p className="text-xs font-semibold text-ink-2">
              {m.author_name ?? "Someone"} <span className="font-normal text-ink-3">· {when(m.created_at)}</span>
            </p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>
      {q.status !== "closed" && (
        <form onSubmit={reply} className="border-t border-line p-5">
          <label htmlFor="reply" className="sr-only">Reply</label>
          <textarea id="reply" required rows={3} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" className={`${inputBase} w-full`} />
          {error && <p role="alert" className="mt-2 text-sm text-action-ink">{error}</p>}
          <button disabled={busy || !text.trim()} className={`${buttonPrimary} mt-3`}>
            <Send size={15} /> {busy ? "Sending…" : "Reply"}
          </button>
        </form>
      )}
    </article>
  );
}
