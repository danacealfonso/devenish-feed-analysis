"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RECOVERY_FLAG } from "@/lib/auth/recovery";
import { supabase } from "@/lib/supabase/client";

/**
 * The Supabase client exchanges the PKCE ?code= automatically (detectSessionInUrl); we wait for the session.
 * Password-reset links also land here (the only allow-listed redirect); the forgot-password page sets a flag
 * in this browser (PKCE requires the same browser anyway) so we can route them on to /reset-password.
 */
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search + window.location.hash.replace(/^#/, "&"));
    const err = params.get("error_description");
    if (err) {
      setError(err);
      return;
    }
    let recovering = false;
    try {
      recovering = localStorage.getItem(RECOVERY_FLAG) === "1";
    } catch {}
    const dest = () => (recovering ? "/reset-password" : "/feed");
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") recovering = true;
      if (session) router.replace(dest());
    });
    supabase.auth.getSession().then(({ data: d }) => d.session && router.replace(dest()));
    const t = setTimeout(() => setError("This link is invalid or has expired."), 8000);
    return () => {
      clearTimeout(t);
      data.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      {error ? (
        <div>
          <p className="text-action-ink">{error}</p>
          <a href="/login" className="mt-3 inline-block font-semibold text-navy-800 underline">
            Back to sign in
          </a>
        </div>
      ) : (
        <p className="text-ink-3">Signing you in…</p>
      )}
    </main>
  );
}
