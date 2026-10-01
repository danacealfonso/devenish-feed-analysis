"use client";

import { Compass } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Elements are found by data-tour="…" so the tour doesn't depend on page structure. */
const STEPS: { target: string; title: string; body: string }[] = [
  {
    target: "headline",
    title: "How is the feed doing?",
    body: "One card per key nutrient: how close the feed came to its recipe (100% = exactly as planned), and how many results need action.",
  },
  {
    target: "attention",
    title: "What needs attention",
    body: "The latest results that are off target, worst first, in plain words. Click the coloured counts to show only those.",
  },
  {
    target: "matrix",
    title: "Every diet, every nutrient",
    body: "Analyzed vs intended for each diet, grouped by farm location and flock age. The colours show how far off each result is.",
  },
  {
    target: "ask-ai",
    title: "Ask the AI",
    body: "Click here, or the ✨ beside any result, for a plain-language explanation: is it a real problem, and what should we do?",
  },
  {
    target: "upload",
    title: "Add new results",
    body: "Upload a lab report or NIR export. Don’t have one? The upload window has a sample file you can try.",
  },
  {
    target: "help",
    title: "Need a reminder?",
    body: "This explains the colours, the nutrients and “% of intended” at any time. You can replay this tour from the button next to it.",
  },
];

const SEEN_KEY = "devenish.tourSeen";
const seen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked: don't nag on every visit
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {}
};

type Box = { top: number; left: number; width: number; height: number };

/** A short first-visit tour of the Feed page, plus a button to replay it. Starts once `ready` is true. */
export function GuidedTour({ ready }: { ready: boolean }) {
  const [step, setStep] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);

  const close = useCallback(() => {
    markSeen();
    setStep(null);
  }, []);

  useEffect(() => {
    if (ready && !seen()) {
      const t = setTimeout(() => setStep(0), 600);
      return () => clearTimeout(t);
    }
  }, [ready]);

  // Follow the highlighted element while the page scrolls or resizes.
  useLayoutEffect(() => {
    if (step === null) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${STEPS[step].target}"]`);
    if (!el) return setBox(null);
    el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setBox({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
      });
    };
    measure();
    const t = setTimeout(measure, 450);
    addEventListener("scroll", measure, true);
    addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
      removeEventListener("scroll", measure, true);
      removeEventListener("resize", measure);
    };
  }, [step]);

  // Place the card below the highlight if it fits, otherwise above; on phones it sits at the bottom.
  useLayoutEffect(() => {
    if (!box || !card.current) return setCardPos(null);
    const w = card.current.offsetWidth;
    const h = card.current.offsetHeight;
    if (innerWidth < 640) return setCardPos(null);
    const below = box.top + box.height + 12;
    const top = below + h < innerHeight - 12 ? below : Math.max(12, box.top - h - 12);
    const left = Math.min(Math.max(12, box.left), innerWidth - w - 12);
    setCardPos({ top, left });
  }, [box]);

  useEffect(() => {
    if (step === null) return;
    card.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setStep((s) => (s !== null && s < STEPS.length - 1 ? s + 1 : s));
      if (e.key === "ArrowLeft") setStep((s) => (s ? s - 1 : s));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [step, close]);

  const s = step !== null ? STEPS[step] : null;
  return (
    <>
      <button
        onClick={() => setStep(0)}
        className="flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 font-semibold text-navy-800 hover:bg-page"
      >
        <Compass size={18} /> Take the tour
      </button>
      {s && (
        <div className="fixed inset-0 z-[60]" aria-live="polite">
          {/* Dim everything except the highlighted element; clicks outside are blocked until the tour ends. */}
          {box ? (
            <div
              className="pointer-events-none fixed rounded-xl ring-4 ring-accent transition-all duration-200"
              style={{ ...box, boxShadow: "0 0 0 9999px rgba(20, 22, 63, 0.55)" }}
            />
          ) : (
            <div className="fixed inset-0 bg-navy-950/55" />
          )}
          <div
            ref={card}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-title"
            tabIndex={-1}
            className={`fixed w-[min(360px,calc(100vw-24px))] rounded-xl bg-surface p-5 shadow-2xl outline-none ${
              cardPos ? "" : "inset-x-3 bottom-3 mx-auto"
            }`}
            style={cardPos ?? undefined}
          >
            <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">
              Step {step! + 1} of {STEPS.length}
            </p>
            <h2 id="tour-title" className="mt-1 text-lg font-bold">
              {s.title}
            </h2>
            <p className="mt-1.5 text-sm text-ink-2">{s.body}</p>
            <div className="mt-4 flex items-center gap-2">
              <button onClick={close} className="mr-auto text-sm font-semibold text-ink-3 hover:text-ink">
                Skip tour
              </button>
              {step! > 0 && (
                <button onClick={() => setStep(step! - 1)} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-page">
                  Back
                </button>
              )}
              <button
                onClick={() => (step! < STEPS.length - 1 ? setStep(step! + 1) : close())}
                className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"
              >
                {step! < STEPS.length - 1 ? "Next" : "Done"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
