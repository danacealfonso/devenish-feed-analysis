"use client";

import { Sidebar } from "@/components/portal/Sidebar";
import { PortalProvider } from "@/lib/data/portal";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalProvider>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </PortalProvider>
  );
}
