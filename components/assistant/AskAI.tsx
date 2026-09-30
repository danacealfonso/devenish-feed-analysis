"use client";

import { Sparkles } from "lucide-react";
import { askAssistant, type AskDetail } from "@/lib/assistant/ask";

/**
 * Small AI icon that sends `ask` to the assistant panel. By default it stays hidden until the
 * nearest `group/ai` ancestor is hovered or focused (always visible on touch screens).
 */
export function AskAI({
  ask,
  name,
  className = "",
  always = false,
}: {
  ask: AskDetail;
  /** Short accessible name; the surrounding row already says which item it is. */
  name: string;
  className?: string;
  always?: boolean;
}) {
  return (
    <button
      type="button"
      title="Ask AI to explain this"
      aria-label={name}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        askAssistant(ask);
      }}
      className={`grid size-6 shrink-0 place-items-center rounded-full bg-navy-900 text-accent shadow transition hover:scale-110 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700 ${
        always ? "" : "pointer-events-auto opacity-0 group-hover/ai:opacity-100 group-focus-within/ai:opacity-100 [@media(hover:none)]:opacity-100"
      } ${className}`}
    >
      <Sparkles size={13} aria-hidden />
    </button>
  );
}
