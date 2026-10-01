"use client";

import { Check, Circle } from "lucide-react";
import { passwordRules, passwordStrength, type Strength } from "@/lib/auth/password";

const STRENGTH_STYLE: Record<Strength, { bar: string; width: string; text: string }> = {
  "Too weak": { bar: "bg-action-ink", width: "w-1/4", text: "text-action-ink" },
  Fair: { bar: "bg-watch-ink", width: "w-1/2", text: "text-watch-ink" },
  Strong: { bar: "bg-ok-ink", width: "w-3/4", text: "text-ok-ink" },
  "Very strong": { bar: "bg-ok-ink", width: "w-full", text: "text-ok-ink" },
};

/** Live password checklist and strength meter under a new-password field. */
export function PasswordChecklist({ id, password, email, name }: { id: string; password: string; email?: string; name?: string }) {
  const rules = passwordRules(password, { email, name });
  const strength = passwordStrength(password, rules);
  const style = STRENGTH_STYLE[strength];
  return (
    <div id={id} className="mt-2 rounded-lg border border-line bg-page/60 px-3 py-2.5">
      {password && (
        <div className="mb-2 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className={`h-full rounded-full transition-all ${style.bar} ${style.width}`} />
          </div>
          <span className={`text-xs font-semibold ${style.text}`} aria-live="polite">
            {strength}
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
      </ul>
      <p className="mt-2 text-[11px] text-ink-3">We also check it against passwords leaked in data breaches, without sending your password anywhere.</p>
    </div>
  );
}
