"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell, Field, Notice, PasswordInput, inputClass, primaryButtonClass } from "@/components/auth/AuthShell";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (!error) return router.replace("/feed");
    if (error.code === "email_not_confirmed") {
      setUnconfirmed(true);
      setError("Please confirm your email address first. Check your inbox for the confirmation link.");
    } else if (error.code === "invalid_credentials") {
      setError("That email and password don’t match an account.");
    } else setError(error.message);
  }

  async function resend() {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setResent(true);
  }

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-ink-2">
          New to the portal?{" "}
          <Link href="/signup" className="font-semibold text-navy-800 underline">
            Create an account
          </Link>
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
            placeholder="you@farm.com"
          />
        </Field>
        <Field id="password" label="Password">
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>

        <button disabled={busy} className={primaryButtonClass}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        {error && (
          <Notice kind="error">
            {error}
            {unconfirmed && !resent && (
              <button type="button" onClick={resend} className="mt-1 block font-semibold underline">
                Resend confirmation email
              </button>
            )}
            {resent && <span className="mt-1 block font-semibold">Confirmation email sent.</span>}
          </Notice>
        )}
      </form>
    </AuthShell>
  );
}
