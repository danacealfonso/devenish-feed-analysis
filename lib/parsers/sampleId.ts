/**
 * Feed sample IDs arrive as "#15141 W23954 composite", "W24954 #13577" or "#15901 2501V":
 * a submission number (prefixed with #) and a diet/formula code, in either order.
 */
export function parseSampleId(raw: string | null): { sampleNo: string | null; dietCode: string | null } {
  if (!raw) return { sampleNo: null, dietCode: null };
  const noMatch = raw.match(/#\s*(\d+)/);
  const rest = raw
    .replace(/#\s*\d+/, " ")
    .replace(/\bcomposite\b/i, " ")
    .split(/\s+/)
    .filter(Boolean);
  const diet = rest.find((t) => /^[A-Z]{0,3}\d{3,6}[A-Z]{0,2}$/i.test(t)) ?? rest[0] ?? null;
  return { sampleNo: noMatch ? noMatch[1] : null, dietCode: diet ? diet.toUpperCase() : null };
}
