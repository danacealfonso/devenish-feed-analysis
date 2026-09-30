"use client";

import {
  BarChart3,
  Bell,
  ChevronDown,
  Database,
  FileText,
  FlaskConical,
  LayoutGrid,
  LineChart,
  LogOut,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/Brand";
import { ROLE_LABEL, usePortal } from "@/lib/data/portal";
import { useNotifications, type Section } from "@/lib/notifications/context";
import { supabase } from "@/lib/supabase/client";

const NAV: { label: string; icon: typeof Bell; href: string; also?: string[]; badge?: Section }[] = [
  { label: "Overview", icon: LayoutGrid, href: "/overview" },
  { label: "Dashboard", icon: BarChart3, href: "/dashboard" },
  { label: "Compare my flocks", icon: LineChart, href: "/compare" },
  { label: "Data", icon: Database, href: "/data", badge: "data" },
  { label: "Feed", icon: FlaskConical, href: "/feed" },
  { label: "Questions", icon: MessageSquare, href: "/questions", badge: "questions" },
  { label: "Reports", icon: FileText, href: "/reports" },
  { label: "Operation", icon: SlidersHorizontal, href: "/operation", also: ["/settings"] },
  { label: "Notifications", icon: Bell, href: "/notifications" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { orgs, org, setOrgId, session, role, actualRole, isAdmin, previewAsProducer, setPreviewAsProducer } = usePortal();
  const { unread } = useNotifications();
  const nav = isAdmin ? [...NAV, { label: "Admin", icon: ShieldCheck, href: "/admin" }] : NAV;
  const email = session.user.email ?? "";
  const name = (session.user.user_metadata?.full_name as string | undefined)?.trim() || email;
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <aside className="flex w-full shrink-0 flex-col print:hidden bg-navy-900 text-white lg:sticky lg:top-0 lg:h-screen lg:w-[260px]">
      <div className="px-6 pt-6 pb-5">
        <Brand />
      </div>
      <div className="border-t border-white/10 px-4 pt-5">
        {orgs.length > 1 ? (
          <>
            <label htmlFor="org" className="px-1 text-[13px] font-medium text-white/70">
              Customer
            </label>
            <div className="relative mt-2">
              <select
                id="org"
                value={org?.id ?? ""}
                onChange={(e) => setOrgId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-white/15 bg-navy-800 px-3 py-2.5 pr-9 font-medium text-white outline-none focus:ring-2 focus:ring-accent/60"
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.is_demo ? " (demo)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute top-3 right-3 text-white/60" />
            </div>
          </>
        ) : (
          <>
            <p className="px-1 text-[13px] font-medium text-white/70">Customer</p>
            <p className="mt-2 rounded-lg border border-white/15 bg-navy-800 px-3 py-2.5 font-medium">{org?.name}</p>
          </>
        )}
        {org?.is_demo && <p className="mt-2 px-1 text-[11px] text-white/50">Demo data from the sample workbook</p>}
      </div>
      {/* On a laptop the links scroll inside the menu, so the account row with Sign out stays on screen. */}
      <nav className="mt-4 flex gap-1 overflow-x-auto px-2 pb-2 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">
        {nav.map(({ label, icon: Icon, href, also, badge }) => {
          const count = badge ? unread[badge] : 0;
          const active = [href, ...(also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
          const cls = `flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-[15px] ${
            active ? "bg-navy-800 font-semibold text-accent" : "text-white/85"
          }`;
          return href ? (
            <Link key={label} href={href} className={`${cls} hover:bg-navy-800`} aria-current={active ? "page" : undefined}>
              <Icon size={18} /> {label}
              {count > 0 && (
                <span className="ml-auto min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-[11px] leading-4 font-bold text-navy-950">
                  {count > 9 ? "9+" : count}
                  <span className="sr-only"> new</span>
                </span>
              )}
            </Link>
          ) : (
            <span key={label} className={`${cls} cursor-not-allowed opacity-60`} title="Not part of this prototype">
              <Icon size={18} /> {label}
            </span>
          );
        })}
        {/* Phones have no account row, so Sign out goes at the end of the menu. */}
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-[15px] text-white/85 hover:bg-navy-800 lg:hidden"
        >
          <LogOut size={18} /> Sign out
        </button>
      </nav>
      {actualRole !== "producer" && (
        <label className="mx-4 mt-2 mb-3 shrink-0 flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-navy-800 px-3 py-2 text-xs text-white/80">
          <span>
            Preview as customer
            <span className="block text-[11px] text-white/50">See what the farm team sees</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={previewAsProducer}
            onChange={(e) => setPreviewAsProducer(e.target.checked)}
            className="size-4 accent-[#f5a524]"
          />
        </label>
      )}
      <div className="hidden shrink-0 items-center gap-3 border-t border-white/10 px-4 py-4 lg:flex">
        <div className="grid size-10 place-items-center rounded-full bg-navy-700 text-sm font-semibold">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold" title={email}>
            {name}
          </div>
          <div className="text-xs text-white/60">
            {ROLE_LABEL[actualRole]}
            {role !== actualRole && <span className="text-accent"> · previewing customer view</span>}
          </div>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded-md p-2 text-white/70 hover:bg-navy-800 hover:text-white"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
