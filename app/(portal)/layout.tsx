"use client";

import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { Toaster } from "@/components/notifications/Toaster";
import { Sidebar } from "@/components/portal/Sidebar";
import { PortalProvider, usePortal } from "@/lib/data/portal";
import { NotificationsProvider } from "@/lib/notifications/context";

function Content({ children }: { children: React.ReactNode }) {
  const { ready, error, org } = usePortal();
  if (!ready && !error)
    return (
      <div role="status" className="grid min-h-[60vh] place-items-center text-sm text-ink-3">
        <div className="flex items-center gap-3">
          <span className="size-4 animate-spin rounded-full border-2 border-line border-t-navy-800" aria-hidden />
          Loading {org?.name ?? "customer"}…
        </div>
      </div>
    );
  return (
    <>
      {children}
      <AssistantPanel />
    </>
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalProvider>
      <NotificationsProvider>
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1">
            <Content>{children}</Content>
          </main>
        </div>
        <Toaster />
      </NotificationsProvider>
    </PortalProvider>
  );
}
