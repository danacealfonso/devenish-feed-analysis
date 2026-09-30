import { fmtDate, fmtPct, fmtVal, type Flag } from "../analysis/flags";
import { NUTRIENT_META } from "../analysis/tolerances";
import type { ResultView, SampleView } from "../analysis/view";
import type { NutrientCode } from "../parsers/types";
import { STATUS_LABEL } from "../ui/status";

export const ASK_EVENT = "assistant:ask";
export interface AskDetail {
  /** Full prompt sent to the model. */
  prompt: string;
  /** Short text shown in the chat bubble. */
  label: string;
}

/** Opens the assistant panel and sends a question. Any component can call this. */
export function askAssistant(detail: AskDetail) {
  window.dispatchEvent(new CustomEvent<AskDetail>(ASK_EVENT, { detail }));
}

export function flagAsk(f: Flag): AskDetail {
  return {
    label: `Explain: ${f.title}`,
    prompt:
      `Explain this flag from "Needs attention": ${f.title}. ${f.detail}\n\n` +
      `Using the data: is this a one-off or a pattern (check the diet's history, other diets at the location and the other locations)? ` +
      `Could it be a data problem (lab vs NIR, offsets, mislabelled sample) rather than a feed problem? ` +
      `Does it matter for the hens, and what should the producer do next?`,
  };
}

export function cellAsk(s: SampleView, n: NutrientCode, r: ResultView): AskDetail {
  const m = NUTRIENT_META[n];
  const what = `${m.label} in diet ${s.dietCode}${s.farmLabel ? ` (Farm ${s.farmLabel})` : ""} at ${s.locationName}, sampled ${fmtDate(s.sampledOn)} (${s.source.toUpperCase()})`;
  return {
    label: `Explain ${m.short}: ${s.dietCode}, ${s.locationName}`,
    prompt:
      `Explain this result: ${what}. ${fmtVal(r.analyzed, m.unit)} analyzed` +
      (r.intended != null ? ` vs ${fmtVal(r.intended, m.unit)} intended = ${fmtPct(r.ev.pct)}` : "") +
      `, status ${STATUS_LABEL[r.ev.status]}${r.ev.reason ? ` (${r.ev.reason})` : ""}.\n\n` +
      `Is it a concern? Compare with this diet's earlier samples and the same nutrient elsewhere, say whether it looks like a real feed deviation or a data issue, and what it means for the hens.`,
  };
}

export function questionAsk(q: { subject: string; body: string }, locationName?: string, diet?: string | null): AskDetail {
  return {
    label: `Explain question: ${q.subject}`,
    prompt:
      `A producer asked the nutritionist this question${locationName ? ` about ${locationName}` : ""}${diet ? `, diet ${diet}` : ""}:\n\n` +
      `Subject: ${q.subject}\n${q.body}\n\n` +
      `Scan the data and explain what is going on behind this question: which results are relevant, what they show, whether it is a real feed problem or a data issue, and what the answer or next step could be. ` +
      `Flag anything you can't tell from the data so the nutritionist can follow up.`,
  };
}
