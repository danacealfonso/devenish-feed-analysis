"use client";

import {
  BarChart3,
  ChevronDown,
  Database,
  FileText,
  FlaskConical,
  LayoutGrid,
  LineChart,
  LogOut,
  MessageSquare,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/Brand";
import { usePortal } from "@/lib/data/portal";
import { supabase } from "@/lib/supabase/client";

const NAV = [
  { label: "Overview", icon: LayoutGrid },
  { label: "Dashboard", icon: BarChart3 },
  { label: "Compare my flocks", icon: LineChart },
  { label: "Data", icon: Database },
  { label: "Feed", icon: FlaskConical, href: "/feed" },
  { label: "Questions", icon: MessageSquare },
  { label: "Reports", icon: FileText },
  { label: "Operation", icon: SlidersHorizontal, href: "/settings/tolerances" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { orgs, org, setOrgId, session } = usePortal();
  const email = session.user.email ?? "";
  const name = (session.user.user_metadata?.full_name as string | undefined)?.trim() || email;
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <aside className="flex w-full shrink-0 flex-col bg-navy-900 text-white lg:sticky lg:top-0 lg:h-screen lg:w-[260px]">
      <div className="px-6 pt-6 pb-5">
        <Brand />
      </div>
      <div className="border-t border-white/10 px-4 pt-5">
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
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute top-3 right-3 text-white/60" />
        </div>
      </div>
      <nav className="mt-4 flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-1 lg:flex-col lg:overflow-visible">
        {NAV.map(({ label, icon: Icon, href }) => {
          const active = href && pathname.startsWith(href.split("/").slice(0, 2).join("/"));
          const cls = `flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-[15px] ${
            active ? "bg-navy-800 font-semibold text-accent" : "text-white/85"
          }`;
          return href ? (
            <Link key={label} href={href} className={`${cls} hover:bg-navy-800`} aria-current={active ? "page" : undefined}>
              <Icon size={18} /> {label}
            </Link>
          ) : (
            <span key={label} className={`${cls} cursor-not-allowed opacity-60`} title="Not part of this prototype">
              <Icon size={18} /> {label}
            </span>
          );
        })}
      </nav>
      <div className="hidden items-center gap-3 border-t border-white/10 px-4 py-4 lg:flex">
        <div className="grid size-10 place-items-center rounded-full bg-navy-700 text-sm font-semibold">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold" title={email}>
            {name}
          </div>
          <div className="text-xs text-white/60">Nutritionist workspace</div>
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
