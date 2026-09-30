"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePortal } from "../data/portal";
import { supabase } from "../supabase/client";
import { ensureWorker } from "./push";

export type Section = "data" | "questions";
export interface Toast {
  id: number;
  title: string;
  body: string;
  /** Absolute or app-relative link opened by the toast's button. */
  url?: string;
  /** Where it came from: a push message, or the page itself. */
  source: "push" | "app";
}

interface NotificationsState {
  unread: Record<Section, number>;
  /** Bumped whenever something new arrives for a section, so its page can reload. */
  version: Record<Section, number>;
  /**
   * Records that the user has looked at a section and clears its badge. Returns when they had last
   * looked before this visit, so the page can highlight what is new since then.
   */
  markSeen: (section: Section) => Promise<string | null>;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<NotificationsState | null>(null);
const SECTION_PATH: Record<Section, string> = { data: "/data", questions: "/questions" };

export function useNotifications(): NotificationsState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return v;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { org, session } = usePortal();
  const pathname = usePathname();
  const [unread, setUnread] = useState<Record<Section, number>>({ data: 0, questions: 0 });
  const [version, setVersion] = useState<Record<Section, number>>({ data: 0, questions: 0 });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const orgId = org?.id;
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const refresh = useCallback(async () => {
    if (!orgId) return null;
    const { data, error } = await supabase.rpc("unread_counts", { p_org: orgId });
    if (error || !data) return null;
    const d = data as { data: number; questions: number; data_seen_at: string; questions_seen_at: string };
    setUnread({ data: d.data, questions: d.questions });
    return d;
  }, [orgId]);

  const markSeen = useCallback(
    async (section: Section) => {
      if (!orgId) return null;
      const before = await refresh();
      await supabase
        .from("seen_markers")
        .upsert({ user_id: session.user.id, org_id: orgId, section, seen_at: new Date().toISOString() });
      setUnread((u) => ({ ...u, [section]: 0 }));
      return before ? (section === "data" ? before.data_seen_at : before.questions_seen_at) : null;
    },
    [orgId, refresh, session.user.id],
  );

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), 9000);
    },
    [dismiss],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates: new uploads, questions and replies refresh the badges and the open page.
  useEffect(() => {
    if (!orgId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<Section>();
    const bump = (section: Section, createdBy: string | null | undefined) => {
      if (createdBy === session.user.id) return;
      pending.add(section);
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const sections = [...pending];
        pending.clear();
        setVersion((v) => {
          const next = { ...v };
          for (const s of sections) next[s]++;
          return next;
        });
        // Something arriving on the page you're looking at is already "seen".
        for (const s of sections)
          if (pathRef.current.startsWith(SECTION_PATH[s]))
            await supabase.from("seen_markers").upsert({ user_id: session.user.id, org_id: orgId, section: s, seen_at: new Date().toISOString() });
        refresh();
      }, 400);
    };
    const channel = supabase
      .channel(`notifications-${orgId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "uploads", filter: `org_id=eq.${orgId}` }, (p) =>
        bump("data", (p.new as { uploaded_by?: string }).uploaded_by),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "questions", filter: `org_id=eq.${orgId}` }, (p) =>
        bump("questions", (p.new as { created_by?: string }).created_by),
      )
      // Replies carry no org_id; RLS only delivers ones this user can see, and the counts are recomputed per customer.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "question_replies" }, (p) =>
        bump("questions", (p.new as { created_by?: string }).created_by),
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [orgId, refresh, session.user.id]);

  // Push messages that arrive while the portal is open are shown as toasts (see firebase-messaging-sw.js).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    ensureWorker();
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== "feed-push") return;
      const m = e.data.msg as { title: string; body: string; url?: string };
      toast({ title: m.title, body: m.body, url: m.url, source: "push" });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [toast]);

  const value = useMemo(
    () => ({ unread, version, markSeen, toasts, toast, dismiss }),
    [unread, version, markSeen, toasts, toast, dismiss],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
