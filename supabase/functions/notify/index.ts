// Notifications: tells a customer's team about a new upload, question or reply, by push (Firebase
// Cloud Messaging) and by email, following each person's notification settings.
//
// The browser calls this right after it creates the item: { type: "upload" | "question" | "reply", id }.
// The function loads the item itself and only sends if the caller created it in the last 15 minutes,
// so it can't be used to spam other people. notification_log makes each send happen at most once.
// { type: "test", channel: "push" | "email" } sends a test to the caller only.
//
// Secrets (supabase secrets set ...):
//   FIREBASE_SERVICE_ACCOUNT  the service-account JSON from Firebase → Project settings → Service accounts
//   SMTP_USER, SMTP_PASS      the Gmail address that sends mail, and a Google *app password* for it
//   APP_URL                   optional, defaults to https://devenish-a4843.web.app
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the Edge runtime.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const APP_URL = (Deno.env.get("APP_URL") ?? "https://devenish-a4843.web.app").replace(/\/$/, "");
const FRESH_MINUTES = 15;
const TESTS_PER_HOUR = 10;
// Push tests only ever reach the person clicking, so they get more room while the prototype is being reviewed.
const PUSH_TEST_BOOST = { until: "2026-10-08T00:00:00+08:00", perHour: 60 };
// The demo logins are public and mail goes out from a real Gmail account, so cap it for the whole portal.
const EMAILS_PER_DAY = Number(Deno.env.get("EMAIL_DAILY_CAP") ?? 100);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type EventType = "upload" | "question" | "reply";
type Channel = "push" | "email";
interface Message {
  title: string;
  body: string;
  path: string; // app path, e.g. /questions?id=…
  tag: string; // collapses repeat notifications about the same thing
}
interface Prefs {
  user_id: string;
  email: string | null;
  email_enabled: boolean;
  push_enabled: boolean;
  on_upload: boolean;
  on_question: boolean;
  on_reply: boolean;
}
const DEFAULT_PREFS: Omit<Prefs, "user_id"> = {
  email: null,
  email_enabled: true,
  push_enabled: true,
  on_upload: true,
  on_question: true,
  on_reply: true,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Sign in first." });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json(401, { error: "Your session has expired. Sign in again." });
  const me = userData.user;

  let body: { type?: string; id?: string; channel?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request." });
  }

  if (body.type === "test") return sendTest(admin, me.id, me.email ?? null, body.channel);

  const type = body.type as EventType;
  if (!["upload", "question", "reply"].includes(type) || !isUuid(body.id)) return json(400, { error: "Invalid request." });
  const ev = await loadEvent(admin, type, body.id!);
  if (!ev) return json(404, { error: "Not found." });
  if (ev.actor !== me.id) return json(403, { error: "Only the person who created this can announce it." });
  if (Date.now() - new Date(ev.createdAt).getTime() > FRESH_MINUTES * 60_000) return json(409, { error: "Too old to announce." });

  // Everyone on the customer's team except the person who did it.
  const { data: members } = await admin.from("memberships").select("user_id").eq("org_id", ev.orgId).neq("user_id", me.id);
  const ids = (members ?? []).map((m) => m.user_id as string);
  if (!ids.length) return json(200, { sent: { push: 0, email: 0 }, recipients: 0 });

  const [{ data: prefRows }, { data: profiles }, { data: tokens }] = await Promise.all([
    admin.from("notification_prefs").select("*").in("user_id", ids),
    admin.from("profiles").select("id, email").in("id", ids),
    admin.from("push_tokens").select("token, user_id").in("user_id", ids),
  ]);
  const prefs = new Map<string, Prefs>(ids.map((id) => [id, { user_id: id, ...DEFAULT_PREFS }]));
  for (const p of (prefRows ?? []) as Prefs[]) prefs.set(p.user_id, p);
  const wants = (p: Prefs) => (type === "upload" ? p.on_upload : type === "question" ? p.on_question : p.on_reply);

  const planned: { user_id: string; channel: Channel }[] = [];
  for (const p of prefs.values()) {
    if (!wants(p)) continue;
    if (p.push_enabled && (tokens ?? []).some((t) => t.user_id === p.user_id)) planned.push({ user_id: p.user_id, channel: "push" });
    if (p.email_enabled) planned.push({ user_id: p.user_id, channel: "email" });
  }
  if (!planned.length) return json(200, { sent: { push: 0, email: 0 }, recipients: ids.length });

  // Claim each (event, person, channel) once; a repeat call gets nothing back and sends nothing.
  const { data: claimed, error: claimErr } = await admin
    .from("notification_log")
    .upsert(
      planned.map((p) => ({ event_type: type, event_id: ev.id, user_id: p.user_id, channel: p.channel })),
      { onConflict: "event_type,event_id,user_id,channel", ignoreDuplicates: true },
    )
    .select("id, user_id, channel");
  if (claimErr) return json(500, { error: claimErr.message });

  const msg = ev.message;
  let emailBudget = await emailsLeftToday(admin);
  const results = await Promise.all(
    (claimed ?? []).map(async (c) => {
      let status = "sent";
      let detail: string | null = null;
      if (c.channel === "email" && emailBudget-- <= 0) {
        await admin.from("notification_log").update({ status: "skipped", detail: "daily email cap reached" }).eq("id", c.id);
        return { channel: c.channel as Channel, ok: false };
      }
      try {
        if (c.channel === "push") {
          const userTokens = (tokens ?? []).filter((t) => t.user_id === c.user_id).map((t) => t.token as string);
          const n = await pushToTokens(admin, userTokens, msg);
          detail = `${n}/${userTokens.length} devices`;
          if (!n) status = "failed";
        } else {
          const to = prefs.get(c.user_id)?.email || profiles?.find((p) => p.id === c.user_id)?.email;
          if (!to) throw new Error("no email address");
          await sendEmail(to, msg, ev.orgName);
          detail = to;
        }
      } catch (e) {
        status = "failed";
        detail = e instanceof Error ? e.message : String(e);
        console.error(`notify ${c.channel} → ${c.user_id} failed:`, detail);
      }
      await admin.from("notification_log").update({ status, detail }).eq("id", c.id);
      return { channel: c.channel as Channel, ok: status === "sent" };
    }),
  );
  return json(200, {
    recipients: ids.length,
    sent: {
      push: results.filter((r) => r.channel === "push" && r.ok).length,
      email: results.filter((r) => r.channel === "email" && r.ok).length,
    },
    failed: results.filter((r) => !r.ok).length,
  });
});

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------
interface LoadedEvent {
  id: string;
  orgId: string;
  orgName: string;
  actor: string | null;
  createdAt: string;
  message: Message;
}

async function loadEvent(admin: SupabaseClient, type: EventType, id: string): Promise<LoadedEvent | null> {
  const orgName = async (orgId: string) =>
    ((await admin.from("organizations").select("name").eq("id", orgId).maybeSingle()).data?.name as string) ?? "your customer";
  const who = async (userId: string | null, fallback: string | null) => {
    if (fallback) return fallback;
    if (!userId) return "Someone";
    const { data } = await admin.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
    return (data?.full_name as string) || (data?.email as string) || "Someone";
  };

  if (type === "upload") {
    const { data: u } = await admin
      .from("uploads")
      .select("id, org_id, file_name, inserted_count, merged_count, uploaded_by, created_at")
      .eq("id", id)
      .maybeSingle();
    if (!u) return null;
    const org = await orgName(u.org_id);
    const by = await who(u.uploaded_by, null);
    return {
      id: u.id,
      orgId: u.org_id,
      orgName: org,
      actor: u.uploaded_by,
      createdAt: u.created_at,
      message: {
        title: `New feed analysis for ${org}`,
        body: `${by} uploaded ${u.file_name}: ${u.inserted_count} new samples${u.merged_count ? `, ${u.merged_count} merged` : ""}.`,
        path: `/data?org=${u.org_id}`,
        tag: `upload-${u.id}`,
      },
    };
  }

  if (type === "question") {
    const { data: q } = await admin
      .from("questions")
      .select("id, org_id, subject, body, author_name, created_by, created_at")
      .eq("id", id)
      .maybeSingle();
    if (!q) return null;
    const org = await orgName(q.org_id);
    const by = await who(q.created_by, q.author_name);
    return {
      id: q.id,
      orgId: q.org_id,
      orgName: org,
      actor: q.created_by,
      createdAt: q.created_at,
      message: {
        title: `New question: ${q.subject}`,
        body: `${by} (${org}): ${snippet(q.body)}`,
        path: `/questions?org=${q.org_id}&id=${q.id}`,
        tag: `question-${q.id}`,
      },
    };
  }

  const { data: r } = await admin
    .from("question_replies")
    .select("id, body, author_name, created_by, created_at, questions!inner(id, org_id, subject)")
    .eq("id", id)
    .maybeSingle();
  if (!r) return null;
  const q = r.questions as unknown as { id: string; org_id: string; subject: string };
  const org = await orgName(q.org_id);
  const by = await who(r.created_by, r.author_name);
  return {
    id: r.id,
    orgId: q.org_id,
    orgName: org,
    actor: r.created_by,
    createdAt: r.created_at,
    message: {
      title: `Reply: ${q.subject}`,
      body: `${by}: ${snippet(r.body)}`,
      path: `/questions?org=${q.org_id}&id=${q.id}`,
      tag: `question-${q.id}`,
    },
  };
}

async function sendTest(admin: SupabaseClient, userId: string, signInEmail: string | null, channel?: string) {
  if (channel !== "push" && channel !== "email") return json(400, { error: "Invalid request." });
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "test")
    .eq("channel", channel)
    .gte("created_at", hourAgo);
  const limit = channel === "push" && Date.now() < Date.parse(PUSH_TEST_BOOST.until) ? PUSH_TEST_BOOST.perHour : TESTS_PER_HOUR;
  if ((count ?? 0) >= limit) return json(429, { error: "That's a lot of tests. Try again in an hour." });
  if (channel === "email" && (await emailsLeftToday(admin)) <= 0)
    return json(200, { ok: false, error: "The portal has sent its email allowance for today. Try again tomorrow." });

  const msg: Message = {
    title: "Test notification",
    body: `This is how Feed Analysis will tell you about new uploads and questions (${channel}).`,
    path: "/notifications",
    tag: "test",
  };
  const logId = (
    await admin
      .from("notification_log")
      .insert({ event_type: "test", event_id: crypto.randomUUID(), user_id: userId, channel })
      .select("id")
      .single()
  ).data?.id;
  try {
    let detail: string;
    if (channel === "push") {
      const { data: tokens } = await admin.from("push_tokens").select("token").eq("user_id", userId);
      if (!tokens?.length) throw new Error("Push isn't turned on in any browser yet.");
      const n = await pushToTokens(admin, tokens.map((t) => t.token as string), msg);
      if (!n) throw new Error("No browser accepted the notification. Turn push off and on again.");
      detail = `Sent to ${n} browser${n > 1 ? "s" : ""}.`;
    } else {
      const { data: p } = await admin.from("notification_prefs").select("email").eq("user_id", userId).maybeSingle();
      const to = (p?.email as string | null) || signInEmail;
      if (!to) throw new Error("No email address set.");
      await sendEmail(to, msg, null);
      detail = `Sent to ${to}. If it isn't in the inbox within a minute, check the spam folder.`;
    }
    if (logId) await admin.from("notification_log").update({ status: "sent", detail }).eq("id", logId);
    return json(200, { ok: true, detail });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    if (logId) await admin.from("notification_log").update({ status: "failed", detail }).eq("id", logId);
    return json(200, { ok: false, error: detail });
  }
}

async function emailsLeftToday(admin: SupabaseClient): Promise<number> {
  const { count } = await admin
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("channel", "email")
    .eq("status", "sent")
    .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  return EMAILS_PER_DAY - (count ?? 0);
}

// ---------------------------------------------------------------------------------------------
// Push: FCM HTTP v1, authenticated with a service-account JWT
// ---------------------------------------------------------------------------------------------
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}
let cachedToken: { value: string; exp: number } | null = null;

function serviceAccount(): ServiceAccount {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!raw) throw new Error("Push isn't configured yet (missing FIREBASE_SERVICE_ACCOUNT).");
  return JSON.parse(raw) as ServiceAccount;
}

async function googleAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(sig)}` }),
  });
  if (!res.ok) throw new Error(`Google auth failed (${res.status})`);
  const tok = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: tok.access_token, exp: Date.now() + tok.expires_in * 1000 };
  return tok.access_token;
}

/** Sends to every token; removes tokens FCM says are gone. Returns how many were accepted. */
async function pushToTokens(admin: SupabaseClient, tokens: string[], msg: Message): Promise<number> {
  const sa = serviceAccount();
  const access = await googleAccessToken(sa);
  const link = `${APP_URL}${msg.path}`;
  let ok = 0;
  await Promise.all(
    tokens.map(async (token) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            // Data-only, so our service worker decides how to show it (toast if the app is open, system notification if not).
            data: { title: msg.title, body: msg.body, url: link, tag: msg.tag },
            webpush: { headers: { Urgency: "high", TTL: "86400" }, fcm_options: { link } },
          },
        }),
      });
      if (res.ok) {
        ok++;
        return;
      }
      const err = await res.text();
      if (res.status === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/.test(err))
        await admin.from("push_tokens").delete().eq("token", token);
      console.error("FCM send failed", res.status, err.slice(0, 300));
    }),
  );
  return ok;
}

// ---------------------------------------------------------------------------------------------
// Email: Gmail SMTP over TLS (port 465; Supabase Edge blocks 25 and 587)
// ---------------------------------------------------------------------------------------------
let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

async function sendEmail(to: string, msg: Message, orgName: string | null) {
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  if (!user || !pass) throw new Error("Email isn't configured yet (missing SMTP_USER / SMTP_PASS).");
  transport ??= nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  const link = `${APP_URL}${msg.path}`;
  const settings = `${APP_URL}/notifications`;
  await transport.sendMail({
    from: `"Feed Analysis" <${user}>`,
    to,
    subject: msg.title,
    text: `${msg.body}\n\nOpen in Feed Analysis: ${link}\n\nChange what you're emailed about, or where: ${settings}`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;color:#16172b">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7c7e96">Feed Analysis${orgName ? ` · ${esc(orgName)}` : ""}</p>
  <h1 style="margin:0 0 12px;font-size:20px">${esc(msg.title)}</h1>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#4b4d66">${esc(msg.body)}</p>
  <a href="${link}" style="display:inline-block;background:#1b1e52;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">Open in Feed Analysis</a>
  <p style="margin:28px 0 0;font-size:12px;color:#7c7e96">You get this because email notifications are on. <a href="${settings}" style="color:#353a7d">Change notification settings</a>.</p>
</div>`,
  });
}

// ---------------------------------------------------------------------------------------------
const snippet = (s: string, n = 140) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const isUuid = (s: unknown) => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
