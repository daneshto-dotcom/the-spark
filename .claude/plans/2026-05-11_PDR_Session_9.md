# PDR — Session 9 (Batch) — Playtest Bug Fixes + Cinematics Brainstorm

**Date:** 2026-05-11
**Tier:** Standard (~20K)
**Status:** APPROVED (user explicit "approved" 2026-05-11)
**Council:** Waived — S7/S8 precedent + playtest-velocity priority. PRIME-AUDIT runs per priority.
**Trigger:** Post-S8 user playtest. 4 design observations + 4 process directives.

## OBJECTIVE

Close the 3 playtest-confirmed bugs blocking the "ship Phase 2" gate, draft a cinematics-options design doc for S10 pick, and execute clean session close with commit + push at handoff.

## SCOPE

**P1 — Fix release teleport.** Remove the LMB-up snap-to-cursor in [controls.ts:188-191](src/input/controls.ts:188); replace with a reachability gate. If `dist(spark.pos, cursor)` at release > `MAX_RELEASE_REACH=120`, reject the place silently — spark stays Free where it physically settled. Else place using `spark.pos` (not cursor) as the placement coord. Bond-length-bounded invariant preserved via spark physics, not via cursor snap.

**P2 — Cross-structure auto-merge on place.** After PLACE_PRIMITIVE commits its primary bond, run a post-place sweep: for every primitive within `AUTO_BOND_RADIUS=60` of the new primitive, if its connected component differs from any already-bonded component, add one extra bond per other component. Reuses [`componentOf`](src/game/structure.ts:21).

**P3 — Complexity-weighted scoring.** Add `world.scoreProgress` accumulator. Each bond contributes per combo type — Magic = +3, Functional = +1, anchor (no target) = +1. WIN threshold becomes `PHASE_1_WIN_SCORE=50`. Progress bar at [ui.ts:106](src/render/ui.ts:106) and WIN check at [gameState.ts:37](src/state/gameState.ts:37) both consume the new accumulator.

**P4 — Cinematics brainstorm.** Design-only doc at `docs/structure-cinematics-options.md` with 4-5 concrete options, ASCII sketches, costs, recommendation. No implementation.

**P5 — Closeout.** Per-priority commit + push. Update BACKLOG.md, reflexion_log.md, regenerate boot-snapshot.md. /handoff. Final commit + push.

## NON-GOALS

- No physics tuning (AUTO_BOND_RADIUS, ATTRACT_STRENGTH, strain thresholds) — still gated on playtest of the post-S9 build, deferred to S10.
- No cinematics implementation — P4 is doc-only.
- No audio (Suno track still pending).
- No Phase 2 work.
- No new combos / no spec changes.

## APPROACH

### P1 — Release teleport fix (estimate ~3K)

**Changes:**
- [controls.ts](src/input/controls.ts): Remove lines 188-191 (the four `spark.pos/prevPos = cursor` assignments). Replace the in-zone check + dispatch flow with: compute `dist(spark.pos, cursor)` — if > MAX_RELEASE_REACH (new const 120), early-return (spark stays Free, no PICKUP/PLACE). Else use `spark.pos` for the in-zone check + auto-bond range query (`pickPrimitiveInRange` should measure from `spark.pos`, not cursor).
- [controls.ts:212](src/input/controls.ts:212): `pickPrimitiveInRange(AUTO_BOND_RADIUS)` currently measures from `this.cursor` — change to measure from `spark.pos`. (Or accept a center param.)

**Test changes** [session7.test.ts](src/game/session7.test.ts):
- The existing "snap-to-cursor + pick-from-cursor ⇒ bond rest_length is bounded" test (line 58) needs update: replace cursor-snap assertion with spark-physics-bounded assertion.
- New test: cursor flicked > MAX_RELEASE_REACH from spark.pos at LMB-up → no primitive created, spark.state === Free.

### P2 — Cross-structure merge (estimate ~5K)

**Changes:**
- [world.ts](src/state/world.ts): After the existing primary-bond creation in `placePrimitive` (lines 257-277), add a sweep:
  ```
  // P2: post-place cross-structure merge. Walk all primitives within
  // AUTO_BOND_RADIUS of the new primitive; for each one whose component
  // is not already represented in this primitive's bonds, add a bond.
  ```
  Need to pass `AUTO_BOND_RADIUS` from constants (extract to `constants.ts`) and `mergeRadius` from caller, OR caller passes pre-computed nearby primitives.
- Cleanest: caller (controls.ts) computes `nearbyPrimitives: PrimitiveId[]` and passes via action. Extend `PLACE_PRIMITIVE` action to take `mergeCandidateIds: ReadonlyArray<PrimitiveId>` (defaults to `[]`).
- Implementation: track `addedComponents: Set<seedId>` (representative seed primId of each component already bonded to). For each candidate, BFS its component, if no overlap with `addedComponents`, add a bond, record its seed.

**Test:** Build structure A (primId 0,1), build structure B (primId 2,3) with primid=4 placed within 60px of primId 1 AND primId 3 → after place, `componentOf(prim 0).primitiveIds.has(prim 3) === true`. Bond count = 2 (one per merged component).

### P3 — Complexity-weighted scoring (estimate ~6K)

**Changes:**
- [constants.ts](src/constants.ts): Add `PHASE_1_WIN_SCORE = 50`, `SCORE_MAGIC_BOND = 3`, `SCORE_FUNCTIONAL_BOND = 1`, `SCORE_ANCHOR = 1`. Keep `PHASE_1_WIN_PRIMITIVE_COUNT` for backward-compat / fallback.
- [world.ts](src/state/world.ts): Add `scoreProgress: number` to World interface (init 0). In `placePrimitive`: if no target → `+SCORE_ANCHOR`; else lookup combo, if `combo.isMagical` → `+SCORE_MAGIC_BOND`, else `+SCORE_FUNCTIONAL_BOND`. P2 merge bonds also contribute (each merge bond = combo lookup → magic/functional weight). Reset in `softReset`.
- [gameState.ts:37](src/state/gameState.ts:37): change WIN trigger from `primitives.size >= PHASE_1_WIN_PRIMITIVE_COUNT` to `scoreProgress >= PHASE_1_WIN_SCORE`.
- [ui.ts:106](src/render/ui.ts:106): change progress target to `scoreProgress / PHASE_1_WIN_SCORE`.
- [save.ts](src/state/save.ts): include `scoreProgress` in snapshot.

**Test:**
- Existing WIN tests in gameState.test.ts will need recalibration (build N primitives → expected score). New tests: build all-Magic structure of M primitives → score = M-1 bonds × 3 + anchor; build all-Functional → score = M-1 × 1 + anchor. Assert Magic > Functional at equal primitive count.
- Save round-trip with scoreProgress.

### P4 — Cinematics options doc (estimate ~3K)

**Output:** `docs/structure-cinematics-options.md`. 4-5 options A-E (bloom flash / bond-pulse / merge-wave / tier-gated shake / procedural grow). Per option: 3-line description, ASCII sketch where useful, fires-when, implementation cost (S/M/L), pros/cons, dependencies. Recommendation at bottom — likely B (bond-pulse) for daily play + C (merge-wave) for P2-merge events.

### P5 — Closeout (estimate ~3K)

- Per-priority commit (one per P1-P4)
- Per-priority push (new feedback rule)
- BACKLOG.md S9 entry + session map (S9 → DONE, S10 = playtest of S9 build + remaining tuning + cinematics pick)
- reflexion_log.md S9 block (per-priority lesson + session-level)
- boot-snapshot.md regenerate
- PDR archive to `.claude/plans-archive/2026-05-11_PDR_Session_9_COMPLETED.md`
- HANDOFF_2026-05-11_S9.md (replaces S8 handoff at root; archive S8)
- Final close-commit + push

## TESTING

- **typecheck:** `tsc -b --noEmit` clean after each priority
- **vitest:** all 151 baseline + new regression tests added per priority (target ~155-160 total)
- **browser:** localhost:15842 — verify P1 (no teleport on cursor-flick), P2 (place between structures merges them), P3 (Magic structures fill progress faster than Functional). preview_screenshot may still timeout in headless tab — fall back to renderer.extract + pixel-hash from S8 if needed
- **PRIME-AUDIT after each priority** before commit (read diff, edge cases, materially-better check)

## RISKS

- **P1 unwinds part of S7 P1's invariant.** Mitigation: replace "bond length ≤ AUTO_BOND_RADIUS by construction (cursor-snap)" with "bond length ≤ AUTO_BOND_RADIUS by construction (spark-physics range)". Same outcome, different mechanism.
- **P2 perf.** N primitives within 60px is small (bounded by spawner geometry + structure density). BFS per candidate is O(component size); cap merges at one per other-component to avoid degenerate dense merges.
- **P3 WIN balance.** Threshold 50 with Magic×3 may make all-Magic structures win in ~17 placements — possibly too fast. Watch playtest; tunable constant, easy to bump in S10.
- **Existing tests** in gameState.test.ts and save.test.ts will likely need updates for new score field — not a regression, just recalibration.

## ACCEPTANCE

Per priority:
- **P1:** Cursor-flick-and-release does NOT teleport spark. Spark stays where its physics says it is. Place either commits where spark physically is or fails silently if cursor is unreachable.
- **P2:** Building a primitive within 60px of two distinct structures merges them. Single primitive can merge 3+ structures if positioned at a junction. componentOf returns the union.
- **P3:** Progress bar fills faster building Magic combos than Functional. WIN triggered by score, not count.
- **P4:** Doc exists with 4-5 options and a recommendation. No code changes.
- **P5:** All commits pushed. Clean working tree. HANDOFF doc + archive copy. BACKLOG/reflexion/boot-snapshot updated.

## ROLLBACK

Each priority is one commit. `git revert <sha>` reverts independently except P3 (touches score field used in P5 BACKLOG/reflexion descriptions, low coupling). P4 is a new file — `rm` to remove.

## EXECUTION ORDER

P1 → P2 → P3 → P4 → P5 (isolated to coupled to design to closeout).
