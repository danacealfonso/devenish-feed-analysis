import { supabase } from "../supabase/client";

const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify`;

export interface NotifyResult {
  ok?: boolean;
  error?: string;
  detail?: string;
}

async function call(body: Record<string, unknown>): Promise<NotifyResult> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    },
    body: JSON.stringify(body),
  });
  return res.json().catch((): NotifyResult => ({ error: `Notifications are unavailable (${res.status}).` }));
}

/**
 * Tells the rest of the customer's team about something the user just created. Fire-and-forget:
 * a notification failure must never break the upload or the question itself.
 */
export function announce(type: "upload" | "question" | "reply", id: string | null | undefined) {
  if (!id) return;
  call({ type, id }).catch((e) => console.warn("notify failed", e));
}

export function sendTest(channel: "push" | "email"): Promise<NotifyResult> {
  return call({ type: "test", channel }).catch((): NotifyResult => ({ error: "Couldn’t reach the notification service." }));
}
