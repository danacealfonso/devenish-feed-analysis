# Feed Analysis: notes

## Key decisions
- **One number per nutrient: % of intended.** This is `analyzed ÷ (intended − offset) × 100`, the convention the hand-built sheets already use. It puts CP, Ca, P and Na on one comparable scale. Raw analyzed/intended values stay one hover (or one click) away.
- **Two tiers, not one threshold.** Results outside the **watch** band are highlighted. The watch bands come from Ex3's "Acceptable range": CP/P 98–105, Ca 95–108, Na 90–110. Results beyond the **action** limits reach "Needs attention"; those limits come from Ex4's "Lower acceptable limit" of 85%. Upper action limits are my assumption. All bands are editable per customer under Operation → Tolerances, and flags recompute live, because results are stored raw and never pre-classified.
- **"Check data" is a third state.** It is separate from a feed problem and applies when:
  - a value is implausible (< 25% or > 300% of intended, or zero)
  - every headline nutrient is far off in the same direction (e.g. D1 Farm J: CP 137%, Ca 273%, P 217%, Na 339%), which suggests a mislabelled sample, not a mis-mixed diet
  - a sodium value only makes sense as salt
- **Layout answers the question in order:**
  1. how are we doing (headline cards for the latest submission)
  2. what do I act on (ranked plain-language flags, current cycle only)
  3. where is it (matrix: Location → flock phase → diet, latest result per diet, expandable history)
  4. how consistent is it (dot plot and the nutritionist's familiar stats block)

  Colour is diverging: warm for under-supply, cool for over-supply. Arrows and "?" glyphs carry the same meaning, so nothing depends on colour alone.
- **Upload runs in 4 steps.** Choose a file, pick sheets (each auto-detected, with a confidence score), review what was noticed, then import.
  - Parsing happens in the browser; one database call imports everything atomically.
  - Duplicates merge by *filling gaps only*, so re-uploading a sheet never double-counts or overwrites.
  - The raw file is kept in Storage for audit and reprocessing.

## Customer access
The portal has three roles, enforced in the database (RLS and checked functions), not just hidden in the UI:

| Role | Sees | Can |
|---|---|---|
| **Farm team** (producer) | Only their own customer | View results, upload analyses, ask questions, invite colleagues |
| **Nutritionist** | Every customer they're assigned to | All of the above, plus tolerances, locations, mills, team roles, and marking questions answered |
| **Devenish admin** | All customers | Create customers and manage anyone |

- **Invitations:** an invitation is tied to an email address. Access is granted automatically once someone signs up with that address and it's confirmed.
- **No access yet:** anyone who signs in without an invitation sees an "ask your nutritionist" screen.
- **Prototype only:** uninvited sign-ups join the 3 demo customers, so reviewers can explore immediately. Nutritionists and admins can switch on **Preview as customer** to see the farm-team view.

## What I noticed in the data (and how the real page should handle it)
| Issue | Where | Prototype handling / recommendation |
|---|---|---|
| 4 different layouts, including a **transposed** one (samples as columns) | Ex1, Ex2, Ex3, Ex4/D1/F | Signature-based detection per sheet; production should add a saved column-mapping per lab/instrument |
| **NIR "NA" is probably salt, not sodium.** 0.39 × 0.393 ≈ 0.15, which matches Na formulas of ~0.17; the lab report has Na 0.14 alongside salt 0.36 | Ex2, Ex3 Loc A (May–Jun 2026 columns) | Flagged "looks like NaCl". Confirm the NIR calibration and store the unit per instrument |
| Loc B labels the analyzed row **NaCl%** but compares it as **Na%** | Ex3 Loc B | Warn; compare like with like |
| Ca % uses **intended − 0.14** (−0.10 at D1 Location 2), but the Ex3 NIR sheets use no offset | Ex4, D1, F | Use the offset stated in the file, otherwise the configurable default (0) |
| **D1 Location 2 rows 2–7 ignore their own "−0.10" header** (the adjusted column is −0.016, and % uses raw intended) | D1 Location 2 | Recomputed consistently and reported. The sheet's Ca mean of 128.4% is really 129.7% |
| **F1 duplicates Ex4.** Loc B repeats the Ex1 lab rows, and Loc A repeats the Ex2 scans | several | Content-based dedupe: 60 duplicates collapsed, with formulated values merged onto lab rows |
| Summary blocks (Mean/Median/CV/…/n) sit under the data; F2 has a stray cell at row 150 | Ex4, D1, F | Excluded and recomputed; the stray cell is reported |
| `///////` placeholders, `#DIV/0!`, the `Miosture` typo, IDs in either order (`#13259 W17951` vs `W24954 #13577`), US date strings | Ex1–Ex3 | Normalised; placeholders counted in the warnings |
| No sampling date in the lab export, only Date Received / Report Date | Ex1 | Uses Date Received and warns; the sample date should be captured at submission |
| Diet names inconsistent (`4-24 All-veg`/`4-24 all-veg`, `ST-2`/`Starter-2`), farm labels like `ST-1 ?`, blank farm cells | D1, F2 | Case/spacing normalisation; `?` farms flagged. Production needs a diet master list with aliases |
| F2 has no CP; Zn/Cu have no formulated value | F2, D1, F | Missing values shown as "not analysed"; Zn/Cu use absolute ppm floors |
| Lab and NIR report different nutrient sets on different bases (AR vs DW) | Ex1 | As-received used for comparison; DW stored |

## Questions I'd ask before building this for real
1. What does the **Ca −0.14 / −0.10 adjustment** represent (an assay bias? the limestone particle fraction?), and should it vary by lab or location?
2. Is the NIR "NA" channel sodium or salt, and does calibration differ by instrument and date?
3. How do diet codes work? Is `W23954` / `2501V` a formula version, `1-20` a phase-and-week, and `7538-901-1-21` a ticket plus diet? Is there a formulation system we can pull intended values from, instead of reading them from spreadsheets?
4. Who sets the tolerances: Devenish globally, per nutritionist, or per customer? Should they differ by phase? Rearing diets may need tighter P.
5. What's the source of truth for **which mill supplied which sample**, and which barn/flock ate it? Samples carry no mill field today.
6. Which labs and NIR models are in use? Can labs send structured exports (CSV/API) keyed by sample number?
7. When lab and NIR disagree, which wins, and should disagreement trigger an NIR recalibration task?
8. Should producers see the same flags as nutritionists, or a simplified view?

## What I'd build next
1. **Mapping memory:** confirm an unrecognised sheet's columns once, then save that mapping per lab/instrument.
2. **Diet master and formulation feed:** aliases, versions and effective dates, pulled from the formulation software so intended values never come from spreadsheets.
3. **Lab ↔ NIR reconciliation view** and calibration drift tracking per instrument.
4. **Link to production:** overlay feed deviations on the flock's egg weight, shell quality and mortality on the Dashboard, so it's clear whether a deviation mattered.
5. **Notifications and actions:** email or in-app alerts on action flags, with an "acknowledged / re-sampled / mill notified" workflow and comments shared with the producer.
6. **Exports:** a monthly PDF feed report per customer and mill.
