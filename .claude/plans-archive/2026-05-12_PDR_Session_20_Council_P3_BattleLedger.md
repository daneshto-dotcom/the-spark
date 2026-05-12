# Council R1 Battle Ledger — S20 P3 (bondVisualRenderer.ts silhouette extraction)
**Date:** 2026-05-12
**Tier:** Standard
**Models:** Grok-4-1-fast-non-reasoning (DISRUPTOR) + Gemini-2.5-pro (AUDITOR) + Claude Opus 4.7 1M (SUPERVISOR)
**Round:** R1 (single round per Standard-tier protocol)

---

## GROK DISRUPTOR — 12 challenges

| # | Challenge | Verdict | Rationale |
|---|---|---|---|
| 1 | COHESION_FRACTURE (12 silhouettes naturally cluster into 3 archetypes) | **ADOPT** | Strong consensus with Gemini #5+#6; PIVOT 12-file scope to 3-file grouping |
| 2 | SHARED_TS_BLOAT (110 LOC violates 22% over charter) | **REJECT** | Mis-cited — §XV charter is 500 LOC/module; 110 LOC is well under |
| 3 | TEST_BREAKAGE (lerpColor moved to shared.ts breaks test imports) | **ADOPT** | Re-export lerpColor from bondVisualRenderer.ts to keep test import path stable |
| 4 | CIRCULAR_IMPORT_HAZARD (silhouettes → shared, dispatcher → silhouettes) | **ADOPT-AS-VERIFY** | DAG is correct: dispatcher → silhouettes → shared; verify at implementation time |
| 5 | PARAM_ABSTRACTION_LEAK (BondVisualParams over-bloated with shape-specific fields) | **REJECT** | Wrong premise — no per-shape fields exist; BondVisualParams is genuinely uniform across 12 silhouettes |
| 6 | TREE_SHAKE_FRAGILITY (static imports may bloat) | **REJECT** | Static imports of all 12 are intended; we ship every silhouette in production |
| 7 | FALLBACK_RECURSION (silhouettes call drawDefaultLine) | **ADOPT-AS-VERIFY** | drawDefaultLine moves to shared.ts; silhouettes one-way import from shared; no cycle |
| 8 | FILENAME_NAMESPACE_COLLISION | **REJECT** | NIT; camelCase + descriptive prefix established convention |
| 9 | DISPATCH_SWITCH_ROT (Map registry instead of switch) | **REJECT** | YAGNI — 12 silhouettes stable for 5+ sessions; registry overhead > switch maintenance |
| 10 | TEST_COVERAGE_DILUTION (don't dupe unit-test every silhouette) | **ADOPT** | Keep existing 59 integration tests; no new per-shape unit tests needed |
| 11 | VITE_CHUNK_EXPLOSION (barrel-export index.ts) | **ADOPT** | Convergent with Gemini #8 — `silhouettes/index.ts` aggregates exports |
| 12 | EXTRACTION_BOUNDARY_OVER_SPLIT (strokeAxisLerp/strokePathLerp used 80% by parametric-paths only) | **REJECT-PARTIAL** | All 12 silhouettes use `strokeAxisLerp` and/or `midColor`; shared.ts is the right home |

## GEMINI AUDITOR — 10 findings

| # | Finding | Verdict | Rationale |
|---|---|---|---|
| 1 | Circular dependency avoidance via DAG | **ADOPT** | drawDefaultLine in shared.ts breaks the cycle |
| 2 | API surface narrow (drawBondVisual + BondVisualParams + lerpColor only) | **ADOPT** | Don't re-export 12 silhouettes from bondVisualRenderer.ts (abstraction leak) |
| 3 | shared.ts module cohesion | **ADOPT** | Logically coherent: data contract + primitives + fallback |
| 4 | API stability for test suite | **ADOPT-AS-VERIFY** | A.0-level-2 grep'd — only `drawBondVisual + lerpColor + BondVisualParams` consumed externally |
| 5 | Over-fragmentation (12 × 25-LOC files = navigation overhead) | **ADOPT** | Convergent with Grok #1; CONSOLIDATE to 3 files |
| 6 | Alternative 3-4 file grouping (geometric / path / structural) | **ADOPT** | Use: axisAligned + midpointOrnaments + parametricPaths |
| 7 | Import boilerplate amortized via fewer files | **ADOPT** | Implicit win from #5+#6 |
| 8 | Importer complexity via barrel index.ts | **ADOPT** | Convergent with Grok #11 |
| 9 | State preservation (helpers stateless) | **ADOPT-AS-VERIFIED** | Re-confirmed by file read — no shared module-level closures |
| 10 | Directory naming (`bondEffects/` vs `silhouettes/`) | **REJECT-AS-NIT** | Keep `silhouettes/` — docstring vocabulary uses "silhouette" for the 12 magic shapes |

---

## CONVERGENT THEMES

1. **CONSOLIDATE 12-file fragmentation → 3-file archetype grouping** (Grok #1, Gemini #5+#6) — STRONGEST CONSENSUS, pivots the original scope
2. **Barrel index.ts re-export** (Grok #11, Gemini #8) — STRONG CONSENSUS
3. **API surface narrow** (Grok #3 implicit via test-re-export, Gemini #2+#4) — STRONG CONSENSUS
4. **drawDefaultLine in shared.ts → DAG-safe** (Grok #4+#7, Gemini #1+#3) — STRONG CONSENSUS

---

## ADOPT LIST (final synthesis → execution spec)

**A. Archetype grouping (3 files; from 12 originally proposed):**
- `src/render/effects/silhouettes/axisAligned.ts` — silhouettes whose primary stroke runs along/through the bond axis:
  - filament (24 LOC), cable (15), bracket (24), diamond (34), wheel (25), lattice (45), capsule (18) = **7 silhouettes, ~185 LOC**
- `src/render/effects/silhouettes/midpointOrnaments.ts` — ornaments centered at midpoint with faint axis underlay:
  - star (27), orbital (20), warped (28) = **3 silhouettes, ~75 LOC**
- `src/render/effects/silhouettes/parametricPaths.ts` — parametric curves traced A→B:
  - vortex (20), whip (26) = **2 silhouettes, ~46 LOC**

**B. Shared library (1 file):**
- `src/render/effects/silhouettes/shared.ts` — exports `BondVisualParams`, `lerpColor`, `midColor`, `strokeAxisLerp`, `strokePathLerp`, `drawDefaultLine` (Council DAG-safety)

**C. Barrel (1 file):**
- `src/render/effects/silhouettes/index.ts` — re-exports the 12 `draw<Shape>` functions for single-import in dispatcher

**D. Dispatcher:**
- `src/render/bondVisualRenderer.ts` shrinks to ~50-60 LOC: imports barrel + shared, retains `drawBondVisual` switch, re-exports `BondVisualParams` (from shared) + `lerpColor` (from shared) for external consumers + tests

**E. External callers UNCHANGED:**
- `src/render/bondVisualRenderer.test.ts` imports `drawBondVisual, lerpColor, BondVisualParams` from `./bondVisualRenderer.ts` (re-exports preserve compat)
- `src/render/structureRenderer.ts` imports `drawBondVisual` from `./bondVisualRenderer.ts` (unchanged)

**F. LOCKED §XV ledger row update:** bondVisualRenderer.ts 536 → ~60 LOC; NEW silhouettes/ dir documented.

## REJECT LIST (codified for traceability)
- Grok #2 (false premise), #5 (false premise — no per-shape fields exist), #6 (dynamic-import perf cost), #8 (filename NIT), #9 (registry YAGNI), #12 (false claim — strokeAxisLerp used by 80%+ of silhouettes including axisAligned and midpointOrnaments)
- Gemini #10 (directory naming NIT — keep `silhouettes/`)

## VERIFY LIST (in-code at implementation time)
- Grok #4+#7: DAG silhouettes/{axisAligned,midpointOrnaments,parametricPaths}.ts → shared.ts; bondVisualRenderer.ts → silhouettes/index.ts → archetype files
- Gemini #4: external imports stable post-refactor (A.0-level-2 done; only 2 sites; both consume only the 3 stable exports)
- Gemini #9: helpers stateless (verified by file read)

---

## PRIME-AUDIT DELTA (Rule 20, post-synthesis self-review)

**Self-question 1:** Was anything rubber-stamped?
→ My original 12-file scope was overly fragmented. Council #1+#5+#6 forced re-examination. RESOLVED via 3-archetype grouping (axisAligned/midpointOrnaments/parametricPaths).

**Self-question 2:** Claim-addressed-not-actually-fixed?
→ "60 LOC for the dispatcher" — verify at implementation; the file currently has BondVisualParams interface (~30 LOC) which will move to shared.ts. After move, header docstring + 2 re-exports + drawBondVisual switch + imports = ~40-60 LOC. Acceptable estimate.

**Self-question 3:** Where did consensus mask disagreement?
→ Grok #2 (shared.ts charter) was an independent counter — REJECTED with mis-cited rationale shown.
→ Gemini #10 (directory rename) — REJECTED as NIT; preserved Council #1+#5+#6 stronger signal.

**Self-question 4:** Edge cases undercaught?
→ **Lattice extraction:** lattice (45 LOC) is the largest silhouette. Hybrid axis/midpoint. Per Council, group with axisAligned because the primary structure is the rotated-square OUTLINE (4 axis-aligned strokes) + the cross-hatch is the midpoint accent (secondary). ✓
→ **Test file regression sensitivity:** existing 59 tests inspect specific stroke-op counts, colors, and segment counts per silhouette. Move-not-modify refactor — should pass byte-for-byte. Verify via `vitest run` after each archetype-file moved.

**Self-question 5:** Is synthesis materially better than R1 or just longer?
→ **MATERIALLY BETTER.** Council R1 cut my proposed file count by 75% (12 → 3 archetype files), saved ~9 file-overhead boilerplate headers, and surfaced the barrel-export pattern. Estimated dispatcher LOC: ~50-60 (vs my original ~130).

---

## EXECUTION SPEC (ready for implementation)

See ADOPT list above. Estimated cost: Grok 1 call (~$0.01), Gemini 1 call (~$0.02), cumulative S20 API ~$0.09.

---
Battle Ledger sealed 2026-05-12 19:25 UTC.
