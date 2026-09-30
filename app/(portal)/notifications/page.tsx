"use client";

import { BellRing, Mail, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { buttonPrimary, buttonSecondary, Card, inputBase, Page, PageHeader } from "@/components/portal/PageHeader";
import { usePortal } from "@/lib/data/portal";
import { sendTest } from "@/lib/notifications/api";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/notifications/push";
import { supabase } from "@/lib/supabase/client";

interface Prefs {
  email: string | null;
  email_enabled: boolean;
  push_enabled: boolean;
  on_upload: boolean;
  on_question: boolean;
  on_reply: boolean;
}
const DEFAULTS: Prefs = { email: null, email_enabled: true, push_enabled: true, on_upload: true, on_question: true, on_reply: true };

const EVENTS: { key: "on_upload" | "on_question" | "on_reply"; label: string; hint: string }[] = [
  { key: "on_upload", label: "New feed analysis uploaded", hint: "Someone on the team uploads a lab report or NIR export." },
  { key: "on_question", label: "New question", hint: "A producer or nutritionist starts a question thread." },
  { key: "on_reply", label: "Reply to a question", hint: "Someone replies in any of this customer’s question threads." },
];

const PUSH_TEXT: Record<PushState, string> = {
  unconfigured: "Push isn’t set up for this site yet.",
  unsupported: "This browser can’t receive push notifications. You’ll still get emails if they’re on.",
  denied: "Notifications are blocked for this site. Allow them in your browser’s site settings, then reload.",
  off: "Off in this browser.",
  on: "On in this browser. You’ll get a notification even when the portal is closed.",
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Supabase and Firebase errors are plain objects, not Error instances. */
function errorText(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? String(e);
  if (/permission denied|incognito|private/i.test(m))
    return "This browser window can’t receive push notifications. Private or incognito windows never can; try a normal window.";
  return m;
}

export default function NotificationsPage() {
  const { session } = usePortal();
  const userId = session.user.id;
  const signInEmail = session.user.email ?? "";
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [emailDraft, setEmailDraft] = useState("");
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ area: "push" | "email" | "events"; ok: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase
      .from("notification_prefs")
      .select("email, email_enabled, push_enabled, on_upload, on_question, on_reply")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        const p = { ...DEFAULTS, ...(data ?? {}) } as Prefs;
        setPrefs(p);
        setEmailDraft(p.email ?? "");
      });
    pushState().then(setPush);
  }, [userId]);

  const save = useCallback(
    async (patch: Partial<Prefs>, area: "email" | "events" | "push", okText?: string) => {
      const next = { ...prefs, ...patch };
      setPrefs(next);
      const { error } = await supabase
        .from("notification_prefs")
        .upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() });
      if (error) setStatus({ area, ok: false, text: error.message });
      else if (okText) setStatus({ area, ok: true, text: okText });
      return !error;
    },
    [prefs, userId],
  );

  async function togglePush() {
    setBusy("push");
    setStatus(null);
    try {
      const next = push === "on" ? await disablePush() : await enablePush(userId);
      setPush(next);
      if (next === "on" && !prefs.push_enabled) await save({ push_enabled: true }, "push");
      if (next === "on") setStatus({ area: "push", ok: true, text: "Push notifications are on for this browser." });
    } catch (e) {
      setStatus({ area: "push", ok: false, text: errorText(e) });
    } finally {
      setBusy(null);
    }
  }

  async function test(channel: "push" | "email") {
    setBusy(`test-${channel}`);
    setStatus(null);
    const r = await sendTest(channel);
    setStatus({ area: channel, ok: !!r.ok, text: r.ok ? (r.detail ?? "Sent.") : (r.error ?? "Couldn’t send.") });
    setBusy(null);
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    const v = emailDraft.trim().toLowerCase();
    if (v && !EMAIL_RE.test(v)) return setStatus({ area: "email", ok: false, text: "Enter a valid email address, or leave it empty to use your sign-in email." });
    setBusy("email");
    await save({ email: v || null }, "email", `Notifications will be emailed to ${v || signInEmail}.`);
    setEmailDraft(v);
    setBusy(null);
  }

  const note = (area: "push" | "email" | "events") =>
    status?.area === area && (
      <p role={status.ok ? "status" : "alert"} className={`mt-3 text-sm ${status.ok ? "text-ok-ink" : "text-action-ink"}`}>
        {status.text}
      </p>
    );

  return (
    <Page>
      <PageHeader
        section="Notifications"
        title="Notifications"
        description="Get told when there’s something new to look at: a feed analysis upload, a new question, or a reply. These settings are yours and apply to every customer you can see."
      />

      <div className="mt-8 grid gap-6">
        <Card title="Push notifications" subtitle="Alerts on this computer or phone, even when the portal isn’t open.">
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-4">
              <BellRing size={22} className={push === "on" ? "text-ok-ink" : "text-ink-3"} aria-hidden />
              <p className="min-w-0 flex-1 text-sm text-ink-2">{push ? PUSH_TEXT[push] : "Checking…"}</p>
              {(push === "on" || push === "off") && (
                <button onClick={togglePush} disabled={busy === "push"} className={push === "on" ? buttonSecondary : buttonPrimary}>
                  {busy === "push" ? "Working…" : push === "on" ? "Turn off" : "Turn on push notifications"}
                </button>
              )}
              {push === "on" && (
                <button onClick={() => test("push")} disabled={busy === "test-push"} className={buttonSecondary}>
                  <Send size={15} /> {busy === "test-push" ? "Sending…" : "Send a test"}
                </button>
              )}
            </div>
            {note("push")}
          </div>
        </Card>

        <Card title="Email" subtitle="A short email with a link straight to the upload or question.">
          <form onSubmit={saveEmail} noValidate className="grid gap-4 p-5">
            <label className="flex items-center gap-3 text-sm font-medium">
              <input
                id="email-enabled"
                type="checkbox"
                role="switch"
                checked={prefs.email_enabled}
                onChange={(e) => save({ email_enabled: e.target.checked }, "email", e.target.checked ? "Email notifications are on." : "Email notifications are off.")}
                className="size-4 accent-[#1b1e52]"
              />
              Send me email notifications
            </label>
            <div>
              <label htmlFor="notify-email" className="block text-sm font-medium">
                Send emails to
              </label>
              <p className="mt-0.5 text-xs text-ink-3">Leave empty to use your sign-in email ({signInEmail}).</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="notify-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={signInEmail}
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  disabled={!prefs.email_enabled}
                  className={`${inputBase} min-w-0 flex-1 basis-64`}
                />
                <button disabled={busy === "email" || !prefs.email_enabled || emailDraft.trim().toLowerCase() === (prefs.email ?? "")} className={buttonPrimary}>
                  <Mail size={15} /> {busy === "email" ? "Saving…" : "Save email"}
                </button>
                <button type="button" onClick={() => test("email")} disabled={busy === "test-email" || !prefs.email_enabled} className={buttonSecondary}>
                  <Send size={15} /> {busy === "test-email" ? "Sending…" : "Send a test email"}
                </button>
              </div>
            </div>
            {note("email")}
          </form>
        </Card>

        <Card title="What to tell me about" subtitle="Applies to both push and email. Things you do yourself never notify you.">
          <ul className="divide-y divide-line">
            {EVENTS.map((ev) => (
              <li key={ev.key} className="px-5 py-3.5">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    id={`event-${ev.key}`}
                    type="checkbox"
                    checked={prefs[ev.key]}
                    onChange={(e) => save({ [ev.key]: e.target.checked }, "events", "Saved.")}
                    className="mt-1 size-4 accent-[#1b1e52]"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{ev.label}</span>
                    <span className="block text-sm text-ink-3">{ev.hint}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {status?.area === "events" && <div className="border-t border-line px-5 pb-4">{note("events")}</div>}
        </Card>
      </div>
    </Page>
  );
}
