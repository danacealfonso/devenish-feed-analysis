"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AuthShell, Field, Notice, inputClass, primaryButtonClass } from "@/components/auth/AuthShell";
import { HumanCheck, type HumanCheckHandle, HUMAN_CHECK_ON, humanCheckMessage, NEEDS_HUMAN_CHECK } from "@/components/auth/HumanCheck";
import { RECOVERY_FLAG } from "@/lib/auth/recovery";
import { supabase } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const check = useRef<HumanCheckHandle>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (HUMAN_CHECK_ON && !captcha) return setError(NEEDS_HUMAN_CHECK);
    setBusy(true);
    try {
      localStorage.setItem(RECOVERY_FLAG, "1");
    } catch {}
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
      captchaToken: captcha ?? undefined,
    });
    setBusy(false);
    if (error) {
      check.current?.reset();
      setError(humanCheckMessage(error.message) ?? error.message);
    } else setSent(true);
  }

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <h1 className="text-3xl font-bold tracking-tight">Reset your password</h1>
        <p className="mt-2 text-sm text-ink-2">
          Enter your account email and we’ll send you a link to choose a new password. Open it in this browser.
        </p>
        <Field id="email" label="Email">
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        {!sent && <HumanCheck ref={check} action="reset_password" onToken={setCaptcha} />}
        <button disabled={busy || sent} className={primaryButtonClass}>
          {busy ? "Sending…" : sent ? "Link sent" : "Send reset link"}
        </button>
        {sent && (
          <Notice kind="ok">
            If an account exists for <b>{email}</b>, a reset link is on its way.
          </Notice>
        )}
        {error && <Notice kind="error">{error}</Notice>}
        <p className="mt-6 text-sm">
          <Link href="/login" className="font-semibold text-navy-800 underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
