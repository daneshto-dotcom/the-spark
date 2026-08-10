# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-11 | Session: S138 | Commit: 0067e6f | Branch: master

**S138 shipped 2 priorities: the damage substrate the whole offence/TD direction was blocked on, and
the owner's three live-playtest fixes. `PROTOCOL_VERSION` is now 17 — BOTH PEERS MUST RELOAD.**

Deploy verified 4/4 live (`index-vSzv8e82.js`). tsc 0 · vitest 2148/2148 (142 files) ·
e2e:gating 32/0 · build 661.4 KiB (88.6 KiB headroom) · MCV exit 0 · gitleaks clean.
⚠ **1 commit unpushed** (`0067e6f`, the ANALYZE + gitleaks commit) — credential healthy, count exact.

## What shipped
- **P1 (c7ec3c0)** — `Primitive.hp` + `PRIMITIVE_MAX_HP = 1000` (scale chosen so the ruled "% of max
  HP on a 0.5 s cadence" DoT model lands on INTEGERS: 1% = 10, 2.5% = 25, 5% = 50 ⇒ no float drift),
  real per-kind defender HP replacing the `1e9` sentinel, `state/damage.ts damageEntity` as the ONE
  damage path (delegating to `damageCreature`), and `state/razePrimitives.ts` as the ONE
  primitive-removal path. 22 new tests.
- **P2 (cc4e382)** — keeps to `KEEP_RING_RADIUS = 420`; the outward `STRUCTURE_GROW_IMPULSE` deleted;
  bots scoped off the shared quarry to their own porch + a new `PULL` goal on the shipped
  `PULL_FROM_BANK`. `PROTOCOL_VERSION` 16→17.

## ⚠ TWO CONSEQUENCES NEEDING AN OWNER PLAYTEST (both are direct results of P2, not defects)
1. **vs-bots is now EASIER.** Bots are gated on gatherer throughput, compounded by the longer haul.
2. **The opening economy is SLOWER.** The keep move makes the haul 150→295 px (**1.97×**) while
   `CASTLE_BANK_CAP` is still 5. The ruled raise to **12–13** is the counterweight and was
   deliberately NOT included. Re-measure with `e2e/bank-throughput.spec.ts` and retune gatherer
   speed/count when it lands.

## Next Steps
1. **STARTER DESIGNS — Session A.** The blocker is GONE (P1 built it). Extend `DefenderKind` with
   goblinSword / goblinArcher / stinkTower, per-kind config, behaviours on the existing defender FSM,
   procedural-puppet placeholder art, 4-shape recipes (the 4-shape space is MEASURED FREE). Read
   §2b of the archived amendment first — it hands you the API and THREE open questions.
2. **BUILD SPACE** — full scope per the owner: REAL STORAGE (§1b R1), `CASTLE_BANK_CAP` → 12–13 with
   the 5-wide × 3-row panel regrid (C1), R3 per-gatherer submenu, R6 BUILD SPACE control, R7 library.
   R4 (the keep-ring move) is **already done** in S138.
3. **ONE MORE BUMP COVERS BOTH.** Starters (new serialized `DefenderKind` literals) and the build
   space (`PULL_STRUCTURE_FROM_BANK` intent) each force a bump; do them in a SINGLE 17→18, with a
   deploy + 2-peer check in the same session.
4. Bank-cap re-measurement + gatherer retune (pairs with #2).
5. Sim-worker default-on flip — 6 `?worker=1` literals / 4 files; `probeHarness.ts:339-345` becomes
   refuse-by-default. ⚠ BACKLOG V6-1.1 warns: do NOT pair with a new serialized entity family.

## Blockers
- **None blocking.** Owner-gated only: `origin/gh-pages` deletion (unchanged, standing).
- Open design questions for the starters session (from the S138 Council, logged not dropped):
  **(a)** "nearest enemy structure" is UNDEFINED now that primitives die independently — largest
  connected component, any primitive with hp, or the anchor? `findNearestEnemyCreatureFrom` cannot be
  reused, and `Defender.targetCreatureId` is `CreatureId`-typed so widening it is a SERIALIZED change.
  **(b)** AoE hits all 5 stink-tower bags at once ⇒ the tower absorbs 5× the AoE damage of a
  single-primitive structure — feature, or per-structure cap?
  **(c)** Defender death razes its ANCHOR (S138, to stop the igniter re-minting an immortal
  defender) — confirm that reads right for goblins, which are UNITS, not emplacements.
- Defender HP numbers (turret 3000 / princess 2000) are **first-pass, unvalidated by play** — nothing
  dealt damage when they were written. Tune them in the starters session.

## Pending Backlog
BACKLOG.md uses a roadmap table, not checkboxes. Next slot is the starters work above; V6-1.3 P2 is
the build space. ✅ **V6-2.1 R6 is now CLOSED** — the "no damageable target" premise that gated
V6-2.1 (targeting priority) and V6-2.4 (castle HP/repair) is false as of S138.
Also still open: S135 residuals (SCORE_TIER corner-bloom replay, carried-potato onUp pointer capture,
deposit-slot column overflow) · no 2-peer/joiner exercise of the castle bank · H3 (does periodic
consumption remove the hauler stall? needs a dispatch seam `__SPARK__` lacks).

## Traps from S138 (read these — three are the SAME shape)
- **Documenting a pattern REPRODUCES it. This bit three times in one session.** Two MCV `file_lacks`
  needles matched the comments explaining the removals, and `.gitleaksignore` tripped its own
  `generic-api-key` rule by quoting a worked example of the pattern it suppresses. Rule: assert on the
  CODE form (`const r = SPAWNER_RADIUS + 150`, `const KEEP0`), describe suppressed patterns in prose.
- **A unanimous Council can be unanimously wrong if you briefed it incompletely.** I said
  `structuralSignature` is size-only without saying the rig compares `hashWorldStateFull`; both seats
  converged on a wrong conclusion and one prescribed unnecessary work. Name the CONSUMERS, not just
  the mechanism. All 4 technically-specific criticals were refuted on disk (10th such firing).
- **A hardcoded copy of a formula is a time bomb.** `castle-panel.spec.ts` inlined the old ring
  formula; moving the ring broke 4 unrelated e2e tests. `helpers.ts` had already installed the
  `__SPARK__.keepCenter` getter in S137 but only one file adopted it. Changing a constant is a
  search-and-adopt task.
- **A test can pass while running on NaN.** `PHYSICS_DT` isn't exported from `constants.ts`;
  `SUBSTEP_DT` was NaN and the test passed anyway because `solveBonds` is purely positional. Only tsc
  caught it. Run tsc before believing a new test.
- **Prove a guard, don't read it.** The field-level hash guard was a docblock claim; adding `hp` and
  running tsc turned it into a fact in two minutes — and refuted a reviewer who claimed the opposite.
- **The owner's symptom can be right while their mechanism is wrong.** "Primitives push each other"
  was real, but it was never collision (`anchorStabilize.ts:9-11` says placed prims aren't
  free-integrated). It was a cosmetic S13 "puff" that was actually unconditional physics.

## Recent Reflexion (last 2 sessions)
### S138 (2026-08-11)
`#a-council-fed-a-partial-fact-set-agrees-confidently-and-wrongly` ·
`#prove-the-guard-dont-read-it` · `#the-obvious-suspect-can-be-refuted-by-a-docblock` ·
`#a-hardcoded-copy-of-a-formula-is-a-time-bomb-with-someone-elses-name-on-it` ·
`#required-beats-optional-because-tsc-becomes-the-auditor` ·
`#file_lacks-needles-match-my-own-explanatory-comments` · `#a-test-can-pass-while-running-on-NaN` ·
`#invert-the-tests-that-pinned-the-behaviour-you-just-deleted`

### S137 (2026-08-10)
`#my-cost-estimate-was-an-order-of-magnitude-wrong` · `#the-owners-number-may-not-survive-the-tick-rate` ·
`#prompting-cannot-fix-model-inconsistency` · `#a-claim-is-not-verified-until-a-machine-rechecks-it` ·
`#instrument-before-you-infer` · `#a-count-is-a-contract-without-a-name` ·
`#dont-parse-typescript-with-a-regex` · `#an-underpowered-window-reads-as-a-null-result` ·
`#a-passing-visual-test-that-produced-no-image`

Full text: `.claude/reflexion_log.md` (43 entries; the S133 block was pruned at 58 > 50 and lives on
in `.handoff-archive/`).

## Process deviations (S138)
- CHECK ran **2-way** (CLAUDE + GROK-ANALYST), not the Full-tier Triumvirate: both reviewers timed out
  at 120 s on the first long raw-diff prompts; Grok recovered on a tightened retry, Gemini did not.
  Stated as a deviation, not presented as compliance. PLAN's Council was a full 3-way.
- P2 was an in-session Rule 16 SCOPE AMENDMENT from an owner playtest, taken ahead of
  CHECK/ANALYZE/handoff on the owner's explicit instruction.
- The gitleaks finding was pre-existing (S134) but fixed here rather than carried — a red security gate
  is not a deferrable state.
