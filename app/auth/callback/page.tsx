"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

/** The Supabase client exchanges the PKCE ?code= automatically (detectSessionInUrl); we wait for the session. */
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
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) router.replace("/feed");
    });
    supabase.auth.getSession().then(({ data: d }) => d.session && router.replace("/feed"));
    const t = setTimeout(() => setError("This sign-in link is invalid or has expired."), 8000);
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
            Request a new link
          </a>
        </div>
      ) : (
        <p className="text-ink-3">Signing you in…</p>
      )}
    </main>
  );
}
