"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell, Field, Notice, PasswordInput, inputClass, primaryButtonClass } from "@/components/auth/AuthShell";
import { supabase } from "@/lib/supabase/client";

const MIN_LENGTH = 8;

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) return setError(`Password must be at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError("Passwords don’t match.");

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);
    if (error) {
      setError(error.code === "user_already_exists" ? "An account with this email already exists. Sign in instead." : error.message);
      return;
    }
    // With email confirmation off Supabase returns a session straight away; otherwise the user must confirm first.
    if (data.session) router.replace("/feed");
    else setCheckEmail(true);
  }

  if (checkEmail)
    return (
      <AuthShell>
        <h1 className="text-3xl font-bold tracking-tight">Confirm your email</h1>
        <p className="mt-3 text-ink-2">
          We sent a confirmation link to <b>{email}</b>. Open it to activate your account, then sign in.
        </p>
        <Link href="/login" className={primaryButtonClass}>
          Go to sign in
        </Link>
      </AuthShell>
    );

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <h1 className="text-3xl font-bold tracking-tight">Create an account</h1>
        <p className="mt-2 text-sm text-ink-2">
          Already have one?{" "}
          <Link href="/login" className="font-semibold text-navy-800 underline">
            Sign in
          </Link>
        </p>

        <Field id="name" label="Full name">
          <input
            id="name"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field id="email" label="Work email">
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
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" describedBy="pw-hint" />
          <p id="pw-hint" className="mt-1 text-xs text-ink-3">
            At least {MIN_LENGTH} characters.
          </p>
        </Field>
        <Field id="confirm" label="Confirm password">
          <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </Field>

        <button disabled={busy} className={primaryButtonClass}>
          {busy ? "Creating account…" : "Create account"}
        </button>
        {error && <Notice kind="error">{error}</Notice>}
      </form>
    </AuthShell>
  );
}
