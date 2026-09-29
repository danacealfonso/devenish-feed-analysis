"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";
import { Field, Notice, PasswordInput, primaryButtonClass } from "@/components/auth/AuthShell";
import { RECOVERY_FLAG } from "@/lib/auth/recovery";
import { supabase } from "@/lib/supabase/client";

const MIN_LENGTH = 8;

/** Reached from a password-reset email via /auth/callback, which leaves the user in a recovery session. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) return setError(`Password must be at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError("Passwords don’t match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    try {
      localStorage.removeItem(RECOVERY_FLAG);
    } catch {}
    router.replace("/feed");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-page p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 inline-block rounded-xl bg-navy-900 px-5 py-4">
          <Brand compact />
        </div>
        {ready === false ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight">Link expired</h1>
            <p className="mt-2 text-sm text-ink-2">This reset link is invalid or has already been used.</p>
            <Link href="/forgot-password" className={primaryButtonClass}>
              Request a new link
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <h1 className="text-3xl font-bold tracking-tight">Choose a new password</h1>
            <Field id="password" label="New password">
              <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" describedBy="pw-hint" />
              <p id="pw-hint" className="mt-1 text-xs text-ink-3">
                At least {MIN_LENGTH} characters.
              </p>
            </Field>
            <Field id="confirm" label="Confirm new password">
              <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            </Field>
            <button disabled={busy || ready === null} className={primaryButtonClass}>
              {busy ? "Saving…" : "Save password and sign in"}
            </button>
            {error && <Notice kind="error">{error}</Notice>}
          </form>
        )}
      </div>
    </main>
  );
}
