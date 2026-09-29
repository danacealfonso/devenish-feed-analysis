# Feed Analysis: notes

## Key decisions
- **One scale for every nutrient: % of intended** = analyzed ÷ (intended − offset) × 100, the convention the hand-built sheets already use. Raw values stay one hover away.
- **Two tiers, plus a data flag.**
  - **Watch** bands come from the sheets' "Acceptable range" (CP/P 98–105, Ca 95–108, Na 90–110).
  - **Action** limits come from "Lower acceptable limit" (85%).
  - **Check data** marks implausible values or a whole sample that's off in every nutrient (likely mislabelled, not mis-mixed).
  - Bands are editable per customer, and results are stored raw so changes apply retroactively.
- **Layout follows the questions a nutritionist asks.** How are we doing (headline cards) → what do I act on (plain-language flags, current cycle only) → where (matrix by location → flock phase → diet, with history) → how consistent (dot plot and the familiar stats block).
- **Upload tolerates messy files.** Each sheet's layout is detected automatically; the user reviews warnings and imports atomically. Duplicates only fill gaps, so a re-upload never double-counts. The raw file is kept for audit.
- **Access by role.** Farm teams see only their farm; nutritionists see their customers and own the settings. This is enforced in the database.

## What I noticed in the data
- **4 layouts**, one transposed (samples as columns). Handled by per-sheet detection; production should save a column mapping per lab and instrument.
- **NIR "NA" is probably salt, not sodium.** 0.39 × 0.393 ≈ Na formula 0.15–0.17. Loc A therefore shows false "high sodium"; flagged in the app.
- **Ca offset is inconsistent.** Some sheets use intended − 0.14 (−0.10 at D1 Location 2), the NIR sheets none, and D1 Location 2 rows 2–7 ignore their own header. Recalculated consistently and reported.
- **Duplicates.** F1 = Ex4; the Ex1/Ex2 rows reappear in Ex3. 60 merged.
- **Clean-up needed.** Summary rows inside the data, `///////` and `#DIV/0!`, the "Miosture" typo, IDs in either order, inconsistent diet names, "?" farm labels, and no sample date in the lab export. All normalised and surfaced as warnings.

## Questions before building for real
1. What does the Ca offset represent, and should it vary by lab or location?
2. Is the NIR sodium channel actually salt? Is calibration per instrument?
3. How do diet codes (W23954, 1-20, 7538-901-1-21) map to formulations? Can we pull intended values from the formulation system?
4. Who sets tolerances, and should they differ by flock phase?
5. How do we know which mill supplied a sample, and which flock ate it?
6. When lab and NIR disagree, which wins?

## What I'd build next
1. Saved column mappings for new lab and instrument formats.
2. A diet master list and a formulation feed.
3. Lab ↔ NIR reconciliation and calibration drift tracking.
4. Overlaying feed deviations on egg production and shell quality, to show when a deviation actually mattered.
5. Alerts with an acknowledge / re-sample / notify-the-mill workflow.
