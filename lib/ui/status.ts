import type { Direction, Status } from "../analysis/deviation";

/** Diverging scale: under-supply is warm (amber → red), over-supply is cool (blue), in-band is neutral. */
export function cellClass(status: Status, direction: Direction): string {
  switch (status) {
    case "action":
      return direction === "high" ? "bg-high-action-bg text-high-ink font-semibold" : "bg-action-bg text-action-ink font-semibold";
    case "watch":
      return direction === "high" ? "bg-high-bg text-high-ink" : "bg-watch-bg text-watch-ink";
    case "suspect":
      return "suspect-stripes text-suspect-ink";
    case "ok":
      return "bg-white text-ink";
    default:
      return "bg-white text-ink-3";
  }
}

export function glyph(status: Status, direction: Direction): string {
  if (status === "suspect") return "?";
  if (status !== "action" && status !== "watch") return "";
  const arrow = direction === "high" ? "▲" : "▼";
  return status === "action" ? `${arrow}${arrow}` : arrow;
}

export const STATUS_LABEL: Record<Status, string> = {
  ok: "In range",
  watch: "Watch",
  action: "Action",
  suspect: "Check data",
  no_target: "No target",
  missing: "Not analysed",
};

export function pillClass(kind: "ok" | "watch" | "action" | "suspect" | "info"): string {
  return {
    ok: "bg-ok-bg text-ok-ink",
    watch: "bg-watch-bg text-watch-ink",
    action: "bg-action-bg text-action-ink",
    suspect: "bg-suspect-bg text-suspect-ink",
    info: "bg-[#eef0f6] text-ink-2",
  }[kind];
}
