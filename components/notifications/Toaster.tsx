"use client";

import { Bell, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/lib/notifications/context";

/** In-app notifications, top right. Push messages land here while the portal is open. */
export function Toaster() {
  const { toasts, dismiss } = useNotifications();
  const router = useRouter();
  if (!toasts.length) return null;

  const open = (url: string, id: number) => {
    dismiss(id);
    const u = new URL(url, window.location.origin);
    if (u.origin === window.location.origin) router.push(`${u.pathname}${u.search}`);
    else window.location.assign(u.href);
  };

  return (
    <div aria-live="polite" className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 print:hidden">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex gap-3 rounded-xl border border-line bg-surface p-4 shadow-xl ring-1 ring-navy-900/5 motion-safe:animate-[toast-in_.25s_ease-out]"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-navy-900 text-accent">
            <Bell size={17} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{t.title}</p>
            {t.body && <p className="mt-0.5 line-clamp-3 text-sm text-ink-2">{t.body}</p>}
            <div className="mt-2 flex items-center gap-3 text-xs">
              {t.url && (
                <button onClick={() => open(t.url!, t.id)} className="font-semibold text-navy-800 hover:underline">
                  Open
                </button>
              )}
              {t.source === "push" && <span className="text-ink-3">Push notification</span>}
            </div>
          </div>
          <button onClick={() => dismiss(t.id)} className="self-start rounded p-1 text-ink-3 hover:bg-page" aria-label="Dismiss notification">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
