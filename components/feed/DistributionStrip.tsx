import { NUTRIENT_META, type ToleranceMap } from "@/lib/analysis/tolerances";
import type { SampleView } from "@/lib/analysis/view";
import type { NutrientCode } from "@/lib/parsers/types";

const MIN = 40;
const MAX = 180;
const W = 1000;
const ROW = 34;
const LEFT = 64;

const COLOR = {
  ok: "#8b8da6",
  watch: "#d08a0b",
  action: "#c2381f",
  suspect: "#55546b",
} as const;

/** Every result as a dot on a shared "% of intended" axis, with watch (light) and action (dashed) limits. */
export function DistributionStrip({
  samples,
  nutrients,
  tolerances,
}: {
  samples: SampleView[];
  nutrients: NutrientCode[];
  tolerances: ToleranceMap;
}) {
  const rows = nutrients.filter((n) => tolerances[n]?.mode !== "abs_min");
  const x = (p: number) => LEFT + ((Math.min(Math.max(p, MIN), MAX) - MIN) / (MAX - MIN)) * (W - LEFT - 16);
  const H = rows.length * ROW + 28;
  const ticks = [50, 75, 100, 125, 150, 175];

  return (
    <section aria-labelledby="dist" className="rounded-xl border border-line bg-surface p-5">
      <h2 id="dist" className="text-base font-bold">
        Spread of results
      </h2>
      <p className="text-sm text-ink-3">
        Each dot is one sample. Shaded = watch band, dashed = action limits. Values beyond {MIN}–{MAX}% sit on the edge.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Dot plot of percent of intended per nutrient">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={0} y2={H - 22} stroke={t === 100 ? "#16172b" : "#e4e4ec"} strokeWidth={t === 100 ? 1.2 : 1} />
            <text x={x(t)} y={H - 6} textAnchor="middle" fontSize="12" fill="#7c7e96">
              {t}%
            </text>
          </g>
        ))}
        {rows.map((n, i) => {
          const y = i * ROW + ROW / 2;
          const rule = tolerances[n];
          const pts = samples.map((s) => s.results[n]).filter((r) => r?.ev.pct != null);
          return (
            <g key={n}>
              <text x={0} y={y + 4} fontSize="13" fontWeight="600" fill="#16172b">
                {NUTRIENT_META[n].short}
              </text>
              {rule?.watchLow != null && rule.watchHigh != null && (
                <rect x={x(rule.watchLow)} width={x(rule.watchHigh) - x(rule.watchLow)} y={y - 11} height={22} fill="#e4f5ea" rx={3} />
              )}
              {[rule?.actionLow, rule?.actionHigh].map(
                (a, j) => a != null && <line key={j} x1={x(a)} x2={x(a)} y1={y - 13} y2={y + 13} stroke="#c2381f" strokeDasharray="3 3" />,
              )}
              {pts.map((r, j) => {
                const st = r!.ev.status as keyof typeof COLOR;
                const jitter = ((j * 7919) % 17) - 8;
                return (
                  <circle
                    key={j}
                    cx={x(r!.ev.pct!)}
                    cy={y + jitter * 0.9}
                    r={3.2}
                    fill={COLOR[st] ?? COLOR.ok}
                    fillOpacity={st === "ok" ? 0.45 : 0.85}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </section>
  );
}
