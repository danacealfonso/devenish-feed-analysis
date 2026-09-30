"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";
import { afterSignIn } from "@/lib/auth/next";
import { supabase } from "@/lib/supabase/client";

/** Two-panel layout shared by sign-in and sign-up; bounces signed-in users to the portal. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => data.session && router.replace(afterSignIn()));
  }, [router]);

  return (
    <main className="grid min-h-screen lg:grid-cols-[440px_1fr]">
      <section className="flex flex-col justify-between gap-8 bg-navy-900 p-10 text-white">
        <Brand />
        <p className="max-w-sm text-sm leading-relaxed text-white/70">
          Your flocks’ production records, genetic standards, peer benchmarks and feed analyses — shared between your
          team and your Devenish nutritionist.
        </p>
      </section>
      <section className="grid place-items-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}

export const inputClass =
  "mt-2 w-full rounded-lg border border-line bg-white px-3 py-2.5 outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20";

export const primaryButtonClass =
  "mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 font-semibold text-white hover:bg-navy-800 disabled:opacity-60";

export function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <label className="block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  describedBy?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy}
        className={`${inputClass} pr-11`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute top-[calc(50%+4px)] right-2 -translate-y-1/2 rounded p-1.5 text-ink-3 hover:text-ink"
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "error"; children: React.ReactNode }) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`mt-4 rounded-lg px-3 py-2 text-sm ${kind === "ok" ? "bg-ok-bg text-ok-ink" : "bg-action-bg text-action-ink"}`}
    >
      {children}
    </div>
  );
}
