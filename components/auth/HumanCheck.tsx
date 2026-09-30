"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * Cloudflare Turnstile "Verify you are human" check for the sign-in, sign-up and reset-password forms.
 * The token it produces is passed to Supabase Auth (options.captchaToken), which verifies it with Cloudflare
 * when CAPTCHA protection is switched on for the project. Without NEXT_PUBLIC_TURNSTILE_SITE_KEY nothing renders.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const HUMAN_CHECK_ON = !!SITE_KEY;

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("load failed"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface HumanCheckHandle {
  /** Tokens work once: call after every attempt so the person can try again. */
  reset(): void;
}

export const HumanCheck = forwardRef<HumanCheckHandle, { onToken: (token: string | null) => void; action: string }>(
  function HumanCheck({ onToken, action }, ref) {
    const box = useRef<HTMLDivElement>(null);
    const widget = useRef<string | null>(null);
    const report = useRef(onToken);
    report.current = onToken;
    const [problem, setProblem] = useState(false);

    useImperativeHandle(ref, () => ({
      reset() {
        report.current(null);
        if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
      },
    }));

    useEffect(() => {
      if (!SITE_KEY) return;
      let cancelled = false;
      loadScript()
        .then(() => {
          if (cancelled || !box.current || !window.turnstile) return;
          widget.current = window.turnstile.render(box.current, {
            sitekey: SITE_KEY,
            action,
            theme: "light",
            callback: (token: string) => {
              setProblem(false);
              report.current(token);
            },
            "expired-callback": () => report.current(null),
            "error-callback": () => {
              report.current(null);
              setProblem(true);
            },
          });
        })
        .catch(() => setProblem(true));
      return () => {
        cancelled = true;
        if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
        widget.current = null;
      };
    }, [action]);

    if (!SITE_KEY) return null;
    return (
      <div className="mt-5">
        <div ref={box} className="min-h-[65px]" />
        {problem && (
          <p role="alert" className="mt-1 text-sm text-action-ink">
            The “Verify you are human” check couldn’t load. Refresh the page and try again.
          </p>
        )}
      </div>
    );
  },
);

/** Turns Supabase's CAPTCHA error into something a person can act on. */
export function humanCheckMessage(message: string): string | null {
  return /captcha/i.test(message) ? "The human check didn’t go through. Please tick “Verify you are human” again." : null;
}

export const NEEDS_HUMAN_CHECK = "Please tick “Verify you are human” first.";
