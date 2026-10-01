"use client";

import { Check, Circle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { passwordRules, passwordStrength, timesLeaked, type Strength } from "@/lib/auth/password";

const STRENGTH_STYLE: Record<Strength | "Leaked", { bar: string; width: string; text: string }> = {
  "Too weak": { bar: "bg-action-ink", width: "w-1/4", text: "text-action-ink" },
  Fair: { bar: "bg-watch-ink", width: "w-1/2", text: "text-watch-ink" },
  Strong: { bar: "bg-ok-ink", width: "w-3/4", text: "text-ok-ink" },
  "Very strong": { bar: "bg-ok-ink", width: "w-full", text: "text-ok-ink" },
  Leaked: { bar: "bg-action-ink", width: "w-1/4", text: "text-action-ink" },
};

/**
 * Live password checklist and strength meter under a new-password field. Once the other rules pass it also
 * checks the password against known data breaches, so a password like "Password123!" isn't shown as strong.
 */
export function PasswordChecklist({ id, password, email, name }: { id: string; password: string; email?: string; name?: string }) {
  const rules = passwordRules(password, { email, name });
  const allOk = rules.every((r) => r.ok);
  const [leak, setLeak] = useState<{ password: string; count: number | null } | null>(null);

  useEffect(() => {
    if (!allOk) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const count = await timesLeaked(password);
      if (!cancelled) setLeak({ password, count });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [allOk, password]);

  const checked = allOk && leak?.password === password ? leak.count : undefined; // undefined = not checked yet, null = service unavailable
  const leaked = typeof checked === "number" && checked > 0;
  const strength = leaked ? "Leaked" : passwordStrength(password, rules);
  const style = STRENGTH_STYLE[strength];

  return (
    <div id={id} className="mt-2 rounded-lg border border-line bg-page/60 px-3 py-2.5">
      {password && (
        <div className="mb-2 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className={`h-full rounded-full transition-all ${style.bar} ${style.width}`} />
          </div>
          <span className={`text-xs font-semibold ${style.text}`} aria-live="polite">
            {leaked ? "Found in data breaches" : strength}
          </span>
        </div>
      )}
      <ul className="grid gap-1 text-xs" aria-label="Password requirements">
        {rules.map((r) => (
          <li key={r.id} className={`flex items-center gap-2 ${r.ok ? "text-ok-ink" : "text-ink-3"}`}>
            {r.ok ? <Check size={13} aria-hidden /> : <Circle size={11} aria-hidden className="mx-px" />}
            <span>
              {r.label}
              <span className="sr-only">{r.ok ? " (done)" : " (not yet)"}</span>
            </span>
          </li>
        ))}
        <li className={`flex items-center gap-2 ${leaked ? "font-semibold text-action-ink" : checked === 0 ? "text-ok-ink" : "text-ink-3"}`}>
          {leaked ? <X size={13} aria-hidden /> : checked === 0 ? <Check size={13} aria-hidden /> : <Circle size={11} aria-hidden className="mx-px" />}
          <span>
            {leaked
              ? `Found in ${checked.toLocaleString("en")} data breaches: choose another`
              : allOk && checked === undefined
                ? "Checking known data breaches…"
                : "Not found in known data breaches"}
            <span className="sr-only">{leaked ? " (problem)" : checked === 0 ? " (done)" : " (not yet)"}</span>
          </span>
        </li>
      </ul>
      <p className="mt-2 text-[11px] text-ink-3">The breach check never sends your password anywhere.</p>
    </div>
  );
}
