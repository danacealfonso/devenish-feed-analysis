import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluate, pctOfIntended } from "../lib/analysis/deviation";
import { applyFormulations, extractFormulations, inferPhase, mergeSamples } from "../lib/analysis/merge";
import { summarize } from "../lib/analysis/stats";
import { DEFAULT_TOLERANCES, toMap } from "../lib/analysis/tolerances";
import { flagWholeSampleMismatch } from "../lib/analysis/view";
import type { NutrientCode } from "../lib/parsers/types";
import { parseSheet } from "../lib/parsers";
import { cleanNumber, matchNutrient, parseDate } from "../lib/parsers/normalize";
import { readWorkbook } from "../lib/parsers/readWorkbook";
import { parseSampleId } from "../lib/parsers/sampleId";

const sheets = readWorkbook(readFileSync(new URL("./fixtures/sample-data.xlsx", import.meta.url)));
const parsed = Object.fromEntries(sheets.map((s) => [s.name, parseSheet(s.name, s.grid)]));
const tol = toMap(DEFAULT_TOLERANCES);

describe("format detection and sample counts", () => {
  it.each([
    ["Ex1 Lab analysis report", "lab_export", 4],
    ["Ex2 NIR export", "nir_export", 18],
    ["Ex3 NIR vs formula (Loc A)", "transposed_comparison", 101],
    ["Ex3 NIR vs formula (Loc B)", "transposed_comparison", 14],
    ["Ex4 Analyses vs intended", "analyses_vs_intended", 38],
    ["F1 Analyses", "analyses_vs_intended", 38],
    ["D1 Location 1", "analyses_vs_intended", 56],
    ["D1 Location 2", "analyses_vs_intended", 14],
    ["F2 Analyses", "analyses_vs_intended", 121],
  ])("%s → %s with %i samples", (name, format, n) => {
    expect(parsed[name].format).toBe(format);
    expect(parsed[name].samples).toHaveLength(n);
  });

  it("excludes the summary block", () => {
    expect(parsed["Ex4 Analyses vs intended"].summaryRowsSkipped).toBeGreaterThanOrEqual(7);
    const diets = parsed["D1 Location 1"].samples.map((s) => s.dietCode);
    expect(diets).not.toContain("Mean");
  });
});

describe("recomputed % of intended matches the hand-built sheets", () => {
  for (const name of Object.keys(parsed)) {
    it(name, () => {
      let checked = 0;
      // Rows the parser already reported as inconsistent with the sheet's own formula are expected to differ.
      const flagged = new Set(
        parsed[name].warnings
          .filter((w) => w.code === "sheet_formula_inconsistent")
          .flatMap((w) => w.ref!.split(", ").map((ref) => `${ref}|${w.message.split(" ")[1].toLowerCase()}`)),
      );
      for (const s of parsed[name].samples)
        for (const r of s.results) {
          if (r.sheetPct == null || flagged.has(`${s.ref}|${r.nutrient}`)) continue;
          const pct = pctOfIntended(r, tol);
          expect(pct, `${s.ref} ${r.nutrient}`).not.toBeNull();
          expect(pct!).toBeCloseTo(r.sheetPct, 1);
          checked++;
        }
      if (/Ex3|Ex4|D1|F1|F2/.test(name)) expect(checked).toBeGreaterThan(0);
    });
  }
});

describe("summary stats match the sheet's own summary block", () => {
  const pcts = (sheet: string, n: string) =>
    parsed[sheet].samples.flatMap((s) => s.results.filter((r) => r.nutrient === n).map((r) => pctOfIntended(r, tol)));

  it("Ex4 CP: mean 92.57, median 93.75, CV 7.4, 8 below 85", () => {
    const st = summarize(pcts("Ex4 Analyses vs intended", "cp"), 85);
    expect(st.mean!).toBeCloseTo(92.57, 1);
    expect(st.median!).toBeCloseTo(93.75, 1);
    expect(st.cv!).toBeCloseTo(7.4, 1);
    expect(st.belowLimit).toBe(8);
  });

  it("D1 Location 2: flags the 6 Ca rows whose sheet formula ignores the −0.10 header", () => {
    const w = parsed["D1 Location 2"].warnings.find((w) => w.code === "sheet_formula_inconsistent");
    expect(w?.ref).toBe("row 2, row 3, row 4, row 5, row 6, row 7");
    // Recomputed consistently, the mean is higher than the sheet's 128.42.
    expect(summarize(pcts("D1 Location 2", "ca")).mean!).toBeCloseTo(129.71, 1);
  });
});

describe("flags", () => {
  it("marks implausible values as suspect, not as a nutrition problem", () => {
    const m = parsed["D1 Location 1"].samples.find((s) => s.farmLabel === "M")!;
    const ca = m.results.find((r) => r.nutrient === "ca")!;
    expect(evaluate(ca, tol).status).toBe("suspect");
  });

  it("detects NIR sodium that is really salt", () => {
    const r = { nutrient: "na" as const, analyzed: 0.39, intended: 0.175, intendedOffset: null };
    const e = evaluate(r, tol);
    expect(e.status).toBe("suspect");
    expect(e.reason).toMatch(/salt/);
  });

  it("uses watch and action tiers", () => {
    const at = (analyzed: number) => evaluate({ nutrient: "cp", analyzed, intended: 16, intendedOffset: null }, tol).status;
    expect(at(16)).toBe("ok");
    expect(at(15)).toBe("watch"); // 93.75%
    expect(at(13)).toBe("action"); // 81%
  });
});

describe("dedupe and formulation matching", () => {
  const all = Object.values(parsed).flatMap((p) => p.samples.map((s) => ({ ...s, format: p.format })));
  const { merged, duplicates } = mergeSamples(all);

  it("collapses F1 (copy of Ex4), the Ex1 rows repeated in Loc B, and the Ex2 scans repeated in Loc A", () => {
    expect(duplicates).toBe(38 + 4 + 18);
    expect(merged).toHaveLength(all.length - duplicates);
  });

  it("merged Ex1 lab samples keep lab metadata and gain formulated values from Loc B", () => {
    const s = merged.find((m) => m.sampleNo === "15901")!;
    expect(s.source).toBe("lab");
    expect(s.results.find((r) => r.nutrient === "cp" && r.basis === "as_received")?.intended).toBeCloseTo(20.001);
  });

  it("fills intended for raw NIR rows from formulations by diet code", () => {
    const nir = parsed["Ex2 NIR export"].samples.map((s) => ({ ...s, results: s.results.map((r) => ({ ...r })) }));
    const forms = extractFormulations(parsed["Ex3 NIR vs formula (Loc A)"].samples);
    expect(applyFormulations(nir, forms).matched).toBe(18);
  });

  it("infers phase from diet name or formulated Ca", () => {
    expect(inferPhase("Organic Pre-Lay-50 (WM)", null)).toBe("Pre-lay");
    expect(inferPhase("RVP 801 VGrower1", null)).toBe("Grower");
    expect(inferPhase("4-24 all-veg", null)).toBe("Layer");
    expect(inferPhase("W17951", 5.11)).toBe("Layer");
    expect(inferPhase("2501V", 1.007)).toBe("Grower");
  });
});

describe("sample-level checks", () => {
  const view = (pcts: Record<string, number>) => {
    const results: Record<string, { ev: ReturnType<typeof evaluate> }> = {};
    for (const [n, p] of Object.entries(pcts))
      results[n] = { ev: evaluate({ nutrient: n as NutrientCode, analyzed: p, intended: 100, intendedOffset: null }, tol) };
    return results as unknown as Parameters<typeof flagWholeSampleMismatch>[0];
  };

  it("treats a sample that is off in every headline nutrient as a data question (D1 Farm J)", () => {
    const r = view({ cp: 137, ca: 273, p: 217, na: 339 });
    expect(flagWholeSampleMismatch(r)).toBe(true);
    expect(r.ca!.ev.status).toBe("suspect");
  });

  it("leaves a single-nutrient problem as a feed problem", () => {
    const r = view({ cp: 98, ca: 258, p: 143, na: 206 });
    expect(flagWholeSampleMismatch(r)).toBe(false);
    expect(r.ca!.ev.status).toBe("action");
  });
});

describe("normalisers", () => {
  it("cleans lab placeholders", () => {
    expect(cleanNumber("    ///////")).toBeNull();
    expect(cleanNumber("#DIV/0!")).toBeNull();
    expect(cleanNumber("0.57")).toBe(0.57);
  });
  it("parses dates", () => {
    expect(parseDate("5/1/2026 10:11:03 AM")).toBe("2026-05-01");
    expect(parseDate("2026-08-21 10:25:59")).toBe("2026-08-21");
    expect(parseDate(46023)).toBe("2026-01-01");
  });
  it("maps nutrient aliases", () => {
    expect(matchNutrient("Miosture")?.nutrient).toBe("moisture");
    expect(matchNutrient("Protein (crude) DW %")).toEqual({ nutrient: "cp", basis: "dry_matter" });
    expect(matchNutrient("P-total")?.nutrient).toBe("p");
    expect(matchNutrient("NaCl%")?.nutrient).toBe("nacl");
  });
  it("parses sample IDs in either order", () => {
    expect(parseSampleId("#15141 W23954 composite")).toEqual({ sampleNo: "15141", dietCode: "W23954" });
    expect(parseSampleId("W24954 #13577")).toEqual({ sampleNo: "13577", dietCode: "W24954" });
    expect(parseSampleId("#15901 2501V")).toEqual({ sampleNo: "15901", dietCode: "2501V" });
  });
});
