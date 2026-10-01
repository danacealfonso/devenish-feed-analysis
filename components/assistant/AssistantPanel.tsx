"use client";

import { Send, Sparkles, Square, Trash2, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ASK_EVENT, type AskDetail } from "@/lib/assistant/ask";
import { buildAssistantContext } from "@/lib/assistant/context";
import { usePortal } from "@/lib/data/portal";
import { supabase } from "@/lib/supabase/client";

type Turn = { role: "user" | "assistant"; content: string; label?: string };

const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/assistant`;

const SUGGESTIONS = [
  "Summarise this customer’s feed quality in the latest cycle.",
  "Which diets need action, and why does it matter for the hens?",
  "Which results look like data problems rather than feed problems?",
  "How do the locations or feed mills compare?",
];

const PAGE_NAMES: Record<string, string> = {
  "/overview": "Overview",
  "/dashboard": "Dashboard (monthly trends)",
  "/compare": "Compare my flocks",
  "/data": "Data (upload history)",
  "/feed": "Feed analysis",
  "/feed/diet": "Diet detail",
  "/questions": "Questions",
  "/reports": "Monthly feed report",
  "/operation": "Operation",
  "/settings/tolerances": "Tolerances",
};

export function AssistantPanel() {
  return (
    <Suspense fallback={null}>
      <Assistant />
    </Suspense>
  );
}

function Assistant() {
  const { org, session, locations, mills, rules, samples, ready } = usePortal();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // One conversation per customer.
  useEffect(() => {
    abort.current?.abort();
    setTurns([]);
  }, [org?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const context = useMemo(
    () => (ready ? buildAssistantContext({ locations, mills, rules, samples }) : ""),
    [ready, locations, mills, rules, samples],
  );

  function pageContext(): string {
    const page = PAGE_NAMES[pathname] ?? pathname;
    const loc = locations.find((l) => l.id === params.get("loc"))?.name;
    const diet = params.get("diet");
    return `[The user is on the ${page} page${loc ? `, location ${loc}` : ""}${diet ? `, diet ${diet}` : ""}.]`;
  }

  async function ask(question: string, label?: string) {
    const q = question.trim();
    if (!q || busy || !org) return;
    // The page note travels with the question and stays in history unchanged, so the cached prefix holds.
    const userTurn: Turn = { role: "user", content: `${pageContext()}\n\n${q}`, label };
    const history = [...turns, userTurn];
    setTurns([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    let answer = "";
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(ENDPOINT, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        },
        body: JSON.stringify({ orgId: org.id, context, messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `The assistant is unavailable (${res.status}).` }));
        answer = `[${err.error ?? "The assistant is unavailable."}]`;
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          setTurns([...history, { role: "assistant", content: answer }]);
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") answer += answer ? "\n\n(stopped)" : "(stopped)";
      else answer = "[Couldn’t reach the assistant. Check your connection and try again.]";
    } finally {
      setTurns([...history, { role: "assistant", content: answer || "[No answer received.]" }]);
      setBusy(false);
      abort.current = null;
    }
  }

  // "Ask AI" icons elsewhere in the portal send their question through this event.
  const askRef = useRef(ask);
  askRef.current = ask;
  const pending = useRef<AskDetail | null>(null);
  useEffect(() => {
    const onAsk = (e: Event) => {
      pending.current = (e as CustomEvent<AskDetail>).detail;
      setOpen(true);
      if (busy) abort.current?.abort();
      else if (ready) flush();
    };
    const flush = () => {
      const d = pending.current;
      if (!d) return;
      pending.current = null;
      askRef.current(d.prompt, d.label);
    };
    window.addEventListener(ASK_EVENT, onAsk);
    // A question that arrived mid-answer or before the data loaded is sent once both are settled.
    if (!busy && ready) flush();
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, [busy, ready, org?.id]);

  return (
    <>
      {!open && (
        <button
          data-tour="ask-ai"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-navy-900 px-5 py-3 font-semibold text-white shadow-lg hover:bg-navy-800 print:hidden sm:right-6 sm:bottom-6"
        >
          <Sparkles size={18} className="text-accent" /> Ask about this data
        </button>
      )}
      {open && (
        <aside
          aria-label="AI assistant"
          className="fixed inset-x-0 bottom-0 z-40 flex h-[85vh] flex-col border-t border-line bg-surface shadow-2xl print:hidden sm:inset-y-0 sm:right-0 sm:left-auto sm:h-auto sm:w-[440px] sm:border-t-0 sm:border-l"
        >
          <header className="flex items-center gap-3 border-b border-line px-5 py-4">
            <Sparkles size={20} className="text-accent" />
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">Feed assistant</h2>
              <p className="truncate text-xs text-ink-3">Explains {org?.name ?? "this customer"}’s feed results · AI can make mistakes</p>
            </div>
            {turns.length > 0 && (
              <button onClick={() => !busy && setTurns([])} disabled={busy} className="rounded p-1.5 text-ink-3 hover:bg-page disabled:opacity-40" aria-label="Clear conversation" title="Clear conversation">
                <Trash2 size={17} />
              </button>
            )}
            <button onClick={() => setOpen(false)} className="rounded p-1.5 text-ink-3 hover:bg-page" aria-label="Close assistant">
              <X size={18} />
            </button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite">
            {!turns.length && (
              <div>
                <p className="text-sm text-ink-2">
                  Ask anything about this customer’s feed analyses. I see the same results, flags and tolerances you do.
                </p>
                <ul className="mt-4 space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <li key={s}>
                      <button
                        onClick={() => ask(s)}
                        disabled={!ready}
                        className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:border-navy-700 hover:bg-[#f3f4fb] disabled:opacity-50"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {turns.map((t, i) =>
              t.role === "user" ? (
                <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-navy-900 px-4 py-2.5 text-sm text-white">
                  {t.label ?? t.content.replace(/^\[The user is on[^\]]*\]\n\n/, "")}
                </div>
              ) : (
                <div key={i} className="text-sm leading-relaxed text-ink">
                  {t.content ? (
                    <Rich text={t.content} />
                  ) : (
                    <span className="inline-flex items-center gap-2 text-ink-3">
                      <span className="size-3 animate-spin rounded-full border-2 border-line border-t-navy-800" aria-hidden /> Looking at the data…
                    </span>
                  )}
                </div>
              ),
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="border-t border-line p-3"
          >
            <div className="flex items-end gap-2 rounded-xl border border-line bg-white p-2 focus-within:border-navy-700">
              <label htmlFor="assistant-input" className="sr-only">
                Ask about this data
              </label>
              <textarea
                id="assistant-input"
                ref={inputRef}
                rows={2}
                maxLength={4000}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
                placeholder={ready ? "e.g. Why is calcium low at Location 1?" : "Loading data…"}
                className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 text-sm outline-none"
              />
              {busy ? (
                <button type="button" onClick={() => abort.current?.abort()} className="rounded-lg bg-page p-2 text-ink-2 hover:bg-line" aria-label="Stop">
                  <Square size={16} />
                </button>
              ) : (
                <button disabled={!input.trim() || !ready} className="rounded-lg bg-navy-900 p-2 text-white hover:bg-navy-800 disabled:opacity-40" aria-label="Send">
                  <Send size={16} />
                </button>
              )}
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-ink-3">Check important decisions with your Devenish nutritionist.</p>
          </form>
        </aside>
      )}
    </>
  );
}

/** Minimal formatting for model output: paragraphs, "-"/"1." lists and **bold**. Text only, never HTML. */
function Rich({ text }: { text: string }) {
  // Group consecutive lines into paragraphs and lists, so a lead-in line followed by bullets renders both.
  const groups: { kind: "p" | "ul" | "ol"; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^#{1,6}\s+/, "");
    if (!line.trim()) {
      groups.push({ kind: "p", lines: [] }); // blank line ends the current group
      continue;
    }
    const kind = /^\s*\d+\.\s+/.test(line) ? "ol" : /^\s*[-*•]\s+/.test(line) ? "ul" : "p";
    const last = groups[groups.length - 1];
    if (last && last.kind === kind && last.lines.length) last.lines.push(line);
    else groups.push({ kind, lines: [line] });
  }
  return (
    <div className="space-y-2.5">
      {groups
        .filter((g) => g.lines.length)
        .map((g, i) => {
          if (g.kind === "p") return <p key={i} className="whitespace-pre-wrap">{inline(g.lines.join("\n"))}</p>;
          const items = g.lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>);
          return g.kind === "ol" ? (
            <ol key={i} className="list-decimal space-y-1 pl-5">{items}</ol>
          ) : (
            <ul key={i} className="list-disc space-y-1 pl-5">{items}</ul>
          );
        })}
    </div>
  );
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}
