"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthShell, Field, Notice, PasswordInput, inputClass, primaryButtonClass } from "@/components/auth/AuthShell";
import { HumanCheck, type HumanCheckHandle, HUMAN_CHECK_ON, humanCheckMessage, NEEDS_HUMAN_CHECK } from "@/components/auth/HumanCheck";
import { PasswordChecklist } from "@/components/auth/PasswordChecklist";
import { LEAKED_MESSAGE, passwordProblem, timesLeaked } from "@/lib/auth/password";
import { supabase } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [invited, setInvited] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const check = useRef<HumanCheckHandle>(null);

  // Invitation links look like /signup?email=… so the invitee signs up with the address that was invited.
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("email");
    if (e) {
      setEmail(e);
      setInvited(true);
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = passwordProblem(password, { email, name });
    if (problem) return setError(problem);
    if (password !== confirm) return setError("Passwords don’t match.");
    if (HUMAN_CHECK_ON && !captcha) return setError(NEEDS_HUMAN_CHECK);

    setBusy(true);
    const leaked = await timesLeaked(password);
    if (leaked) {
      setBusy(false);
      return setError(LEAKED_MESSAGE(leaked));
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        captchaToken: captcha ?? undefined,
      },
    });
    setBusy(false);
    if (error) {
      check.current?.reset();
      setError(
        humanCheckMessage(error.message) ??
          (error.code === "user_already_exists"
            ? "An account with this email already exists. Sign in instead."
            : error.code === "weak_password"
              ? "That password isn’t strong enough. Follow the checklist under the password box."
              : error.message),
      );
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
        {invited && (
          <p className="mt-3 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok-ink">
            You’ve been invited to the Devenish Insights Portal. Sign up with this email and you’ll get access to your
            farm’s data as soon as it’s confirmed.
          </p>
        )}
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
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" describedBy="pw-rules" />
          <PasswordChecklist id="pw-rules" password={password} email={email} name={name} />
        </Field>
        <Field id="confirm" label="Confirm password">
          <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </Field>

        <HumanCheck ref={check} action="signup" onToken={setCaptcha} />

        <button disabled={busy} className={primaryButtonClass}>
          {busy ? "Creating account…" : "Create account"}
        </button>
        {error && <Notice kind="error">{error}</Notice>}
      </form>
    </AuthShell>
  );
}
