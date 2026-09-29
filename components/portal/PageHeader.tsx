"use client";

import { usePortal } from "@/lib/data/portal";

export function PageHeader({
  section,
  title,
  description,
  actions,
}: {
  section: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { org } = usePortal();
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pt-8">
      <div className="min-w-0">
        <p className="text-ink-2">
          {org?.name ?? "—"} · {section}
        </p>
        <h1 className="mt-1 text-4xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

export function Page({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={`mx-auto px-4 pb-16 sm:px-8 ${wide ? "max-w-[1440px]" : "max-w-[1200px]"}`}>{children}</div>;
}

export function Card({ title, subtitle, actions, children, className = "" }: {
  title?: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-bold">{title}</h2>
            {subtitle && <p className="text-sm text-ink-3">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export const buttonPrimary =
  "inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50";
export const buttonSecondary =
  "inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold hover:bg-page disabled:opacity-50";
export const inputBase =
  "rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20";
