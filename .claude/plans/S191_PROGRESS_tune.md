# S191 PROGRESS — `s191/tune` (worktree agent; the main session is the MERGE OWNER)

Branch `s191/tune`, forked at master `9cbc2e5` (deploy #4, PROTOCOL 51). Commits are LOCAL only; never pushed.
Brief: `.claude/plans/S191_BRIEFS/tune.md` (main checkout). **STOPPED on the coordinator's WRAP UP (98 % weekly limit).**

## THE OWNER'S LATEST RA RULE (supersedes the brief's "30 per column, every target")

*"each column that it does 30 damage it split right so if it hits a tower and an enemy at the same time then
it split amongst those two … it's not like 30 to each thing in the vicinity … we can do it 35 per hit."*
→ **35 fifths per column IN TOTAL, SPLIT** across everything it hits. Each enemy creature / Helga / lone built
shape / stink bag = one target; each enemy STRUCTURE (component with an enemy connector midpoint in the
radius) = ONE target, its share on its connector nearest the column centre. Share = floor(35/n), remainder +1
to the first targets in the total order (sq. distance, kind, id); n > 35 → first 35 get 1 (⚠ MINE). Caster
spared. The Pharaoh BOSS stays at 300, unsplit. Self-contained helper (do not import s191/carry's hub split).

## DONE

- Step 0: `npm ci` → `NPMCI_EXIT=0` (commit `ca5f288`).
- Research (all verified against the tree, no code committed):
  - Every perk strike (POWER OF RA, each WRATH charge, the bot cast via `botRa.ts` → same intent) lands in ONE
    function, `landRaColumn` (`src/state/racial/powerOfRa.ts`). The boss ritual (`bossSkillsPharaohRitual.ts:144-153`)
    never calls it — it reads `attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN)` itself, so decoupling = the perk
    stops reading those two constants.
  - Today's column ALSO razes every shape inside a structure (`applyRadialDamage`'s primitive arm, 300 vs 70) —
    that, plus 300 on every connector, is why one column levels a tower. And it NEVER reached stink bags
    (`applyRadialDamage` has no bag arm) — the brief's "as today" for bags is inaccurate; flag it.
  - Castle keep-out: ONE implementation (`zones.castleKeepOutHitsBox`, `CASTLE_NO_BUILD_RADIUS = 121` at `zones.ts:223`).
    Consumers, all through it: point rule `canBuildAt` → `canBuildNow` → `placePrimitive`, `placeFromFree` (host),
    `dragPreview` + `controls.ts:1633` (client), `botBrain.isLegalBuildPos:892` (bot loose shapes); box rule
    `stampRefusalAt` → `blueprintBuild:264` (host), `blueprintGhost:90` + `controls canStampAt:1236` (client),
    `botBrain.chooseTowerPlan:337` + `botController:277` (bots). `structureRepair.canReclaimNow` deliberately does
    NOT read it. No renderer draws the zone. Porch slots are at anchor + (±15/±45, +74), 75.5–86.6 px out —
    ALL outside a 61 disc, so the slot discs are load-bearing. `firstFreePorchSlot` tests only FREE sparks, so a
    built shape on a slot would get a pulled shape minted into it (the S136 fling) — hence the slot discs must
    live inside `castleKeepOutHitsBox` (covers point + box). ⚠ At 61 the castle sprite's top (67 px) and
    corners (82.4 px) are outside the disc — a consequence of his halving, report it.

## IN-FLIGHT (not committed — saved as a patch)

`.claude/plans/S191_TUNE_ITEM1_DRAFT.patch` (`git apply --check` = 0 on this branch). **Untested, not typechecked.**
- `constants.ts`: `RA_PERK_COLUMN_ATK = 5`, `RA_PERK_COLUMN_PEN = 2` (attackFifths = 35; ⚠ MINE pair — the integer
  solution nearest the Pharaoh's balanced 15/15; alternatives 7/0, 1/30), quotes at the constant.
- `powerOfRa.ts`: `RA_PERK_STRIKE_FIFTHS` (35); `RA_STRIKE_FIFTHS` kept as a deprecated ALIAS of it (canon.test
  imports it — it goes red BY DESIGN, see below); `raSplitShares(total, n)`; `raColumnTargets(world, caster, at)`
  (structures grouped by `componentOf`, nearest connector by sq. distance then bond id; creatures skip
  `ehp <= 0` and channelling Pharaohs ⚠ MINE; Helga = `ehp !== null`; lone shapes = `bonds.size === 0`; bags);
  `landRaColumn` rewritten: structures first (bag bursts raze shapes), then the rest; no `applyRadialDamage`.

## NEXT (in order)

1. `git apply .claude/plans/S191_TUNE_ITEM1_DRAFT.patch`; `npm run typecheck` (captured `$?`).
2. Re-pin (tests go red by design): `powerOfRa.test.ts:173-175, 295-296, 324-327, 361`; `wrathOfRa.test.ts:231-232`
   → `RA_PERK_STRIKE_FIFTHS`. Census re-pins: `damage.callSites.test.ts` (sites 15→16, null 7→8, add
   `'src/state/racial/powerOfRa.ts': 1`); `untargetableCallSites.test.ts` NOT_ACQUISITION += powerOfRa.ts (AREA —
   reason: splits over who stands in the circle, picks no victim). `creatureStrike.guard` (1 `attackFifths(`) and
   `damageConnector.callSites` (1 null site) should stay as they are.
3. New `powerOfRaSplit.test.ts`: shares sum to 35 (n = 1..100), n=2 → 18/17, n=36 → 35 ones + 0; REACH through
   `runHostTick`: a stamped lightning hub (5 connectors, pool 50) takes 35 once and stands; hub + creature →
   18 + 17 (nearer gets 18); two structures split; caster's things untouched and not counted; WRATH's 3 charges
   each 35; Pharaoh boss column still 300 to EACH of two victims (negative, pins decoupling); host-vs-worker wide
   hash (pattern: `racialB.differential.test.ts`, cast before `batchRig` so INIT adopts the strike). Mutations:
   per-target 35 → red; perk reading `RA_COLUMN_ATK/PEN` → red; per-connector application → red.
4. Numbers (no carry on this branch): one column alone on a 5-connector tower banks 35 (stands); first sever on
   column 2, then one per column → 6 columns to fell it; with s191/carry's overkill carry: ceil(130/35) = 4. A cast
   is ≤ 5 × 35 = 175 on one target (columns spread ≤ 150 px, so not all land); WRATH ≤ 15 × 35 = 525. Tier-9 boss
   pools 260–462 → 8–14 columns alone. Measure the real pattern in the test.
5. ITEM 2: `CASTLE_NO_BUILD_RADIUS = 61` (literal, his "halved"); add porch-slot discs (`CASTLE_PORCH_SLOT_CLEAR_RADIUS`
   17, slot offsets computed inline from `CASTLE_PORCH_*` — zones.ts must stay a leaf) inside `castleKeepOutHitsBox`;
   re-pin `zones.test.ts:343-420` honestly (61 = ceil(121/2); keep box inside; porch NOT inside the disc; slot
   discs == `castleBank.porchSlot`); tests: stamp box at 62 px accepted / 60 px refused (use +x — +y hits the
   porch), stamp over a slot refused, point placement on a slot refused, REACH (towers stamped as close as legal,
   gatherer deposits, 4 × PULL_FROM_BANK fill every slot, physics ticks, no fling), bot `chooseTowerPlan` takes a
   site refused CASTLE at 121; re-run `netWireSize` / `botTowers` / `buildLegalityGates` / `stress`.
6. Canon notes file, gates (`typecheck`, `vitest --maxWorkers=4`, `build`), report.

## canon.test assertions that WILL go red by design (do not edit — merge owner)

`src/canon.test.ts:713, 715-718, 719` (§3e POWER OF RA "300") and `:814` (§3e WRATH "5 columns × 300") — the
canon row and the "POWER OF RA IS THE PHARAOH'S OWN STRIKE" paragraph must be rewritten to 35-split.

## Protocol verdict

Both items change rules a host/successor computes (strike damage, placement legality) → **bump** (merge owner
writes it). No wire field, no hash field changes.

## Hotspot hunks

None (`save.ts`, `stateHashFull.ts`, `worldTypes.ts`, `main.ts` untouched).

---
# S192 RESUME (worktree agent `s191-tune`, merge owner = main session)

- `git merge master` (e4d52dc) → merge commit `97785a2`, **no conflicts**. Typecheck after merge: TC0=0.
- ITEM 1 draft applied (`2061675`), TC1=0. Re-pinned: `powerOfRa.test.ts` (perk constant 35; five columns →
  35 to a lone enemy; connector test 35 ≥ pool 6, building still gone via the sever's topology split;
  16-connector bank = 35), `wrathOfRa.test.ts` (each charge's column 35), `damage.callSites.test.ts`
  (16 sites, 8 null, + powerOfRa.ts), `untargetableCallSites.test.ts` (NOT_ACQUISITION += powerOfRa.ts, AREA).
- New `src/state/racial/powerOfRaSplit.test.ts` (12 tests): arithmetic; REACH via runHostTick (hub banks 35
  once on one connector and stands; hub+creature 18/17; order flips remainder; two structures 18/17; caster
  spared and uncounted; lone shape + bag one target each); measured 7 columns to fell a 5-hub (no carry);
  Pharaoh boss NEGATIVE 300 to each of two victims; host-vs-worker wide hash through all five columns.
- Mutations (all RED, restored by cmp): M1 every target full 35 → 4 red; M2 perk reads 15/15 → 8 red;
  M3 per-connector targets → 5 red.
- canon.test.ts §3e POWER OF RA + WRATH stay RED by design → `.claude/plans/S191_CANON_NOTES_tune.md`.
- NEXT: ITEM 2 (castle radius 61 + porch-slot discs), then ITEM 3 (APEX_PREDATOR_STAT_MUL 3 → 9, THE_SWARM
  decoupled to a literal 6), gates.
- ITEM 2 committed `25c5bc8`: CASTLE_NO_BUILD_RADIUS 121 → 61; CASTLE_PORCH_KEEP_OUT_RADIUS = 34 (2 × 17, ⚠ MINE)
  per porch slot inside castleKeepOutHitsBox; zones.test re-pinned (halving derivation, porch now outside the disc,
  sprite roof/corners outside — reported, boundary probed along ±x); new castleKeepOutS191.test (12). Mutations:
  no slot discs → 5 red; radius 121 → 11 red; slot disc 17 → 1 red.
- ITEM 3 (coordinator, owner S192): APEX_PREDATOR_STAT_MUL 3 → 9; THE_SWARM_STAT_MUL → literal 6. Elite 27/0/18/9,
  pool 135, bite 252. Re-pinned apexPredator.test (×9, ×9 pool / ×21 bite, + REACH maxEhp on real emission),
  theSwarm.test (6, decoupled), statsLadder.test (elite gets its own derived lane — HP 27 / ATK 18 are off 1..12 by
  his ruling). Copy: racialPerks nagas.l5 "nine times the stats". Mutations: swarm re-coupled → 5 red; apex 3 → 3 red.
- ITEM 3 committed `bbb3f60`. l5-nagas card art inspected: no printed multiplier.
- FINAL GATES (captured `$?`): TYPECHECK=0 · VITEST=1 — 6726 passed / 4 failed / 7 skipped (6737, 416 files); the 4
  are ALL `canon.test.ts` §3e (POWER OF RA, WRATH OF RA, APEX PREDATOR, THE SWARM) — RED BY DESIGN, re-pin text in
  `S191_CANON_NOTES_tune.md` (merge owner). · BUILD=0 — 974.5 KiB / 1100 (master 972.7 → +1.8 KiB).
- PROTOCOL verdict: BUMP (strike damage split, placement legality, piranha-elite stats — all host/successor rules).
  PROTOCOL_VERSION untouched (52). No wire/hash field changed.
- STATUS: DONE, awaiting merge-owner audit. Re-check after s191/carry lands (overkill carry → 7 columns becomes ~4;
  `powerOfRaSplit.test` "SEVENTH column" will go red by design then).
- S192 ROUND 2 (merge owner's one-time canon exception): SPARK_CANON.md §3e POWER OF RA / WRATH / APEX rows,
  quotes, the POWER OF RA paragraph, the APEX ×9/×21 paragraph, THE SWARM decoupling sentence and the radar
  ceiling note (ATK 12 → 18; HP/PEN/SHOT ceilings also move — render-only, reported). §4b has no castle radius →
  untouched. canon.test.ts re-pinned to RA_PERK_STRIKE_FIFTHS / ×9 / literal 6, all derived. RA_STRIKE_FIFTHS alias
  comment re-worded. Bump docblock → CANON_NOTES §6. Gates: TYPECHECK=0 · VITEST=0 (6730 passed / 7 skipped) ·
  BUILD=0 (974.5 KiB).

## ⏸ PAUSED (owner order, usage limit) — S192 round 3 — RESUME HERE
DONE: rounds 1–2 (tip `1c9a0a6`, all gates 0). Tree is clean and compiles at the pause.
IN FLIGHT (NOT applied yet):
- (A) APEX ×6 (owner chose ×6 "like the bat swarm"): script `.claude/plans/S191_tune_scratch/apex6.py`. It edits
  voltkin-config (MUL 9 → 6 + docblock), stats.ts, racialPerks copy "six times", apexPredator/theSwarm/statsLadder
  tests, SPARK_CANON §3e (row 18/0/12/6, ×6/×11 paragraph, radar note: no ceiling moves), and canon.test.
  ⚠ Before running it: add `import { readFileSync } from 'node:fs';` to `src/state/racial/theSwarm.test.ts` (the
  script's new literal-source guard uses it). Run it from the worktree root, then typecheck, then vitest on
  apexPredator/theSwarm/statsLadder/canon, then COMMIT SEPARATELY. Also update CANON_NOTES item 3 and §6 reason 3
  (×6: 18/0/12/6, pool 90, bite 132).
- (B) Ra round 3 (owner S192): the Pharaoh boss column → 35 split via the perk path; a WRATH seat's columns
  (POWER OF RA, the 3 charges, the bot cast, AND its Pharaoh boss) → 75 split. NOT STARTED. Plan:
  1. Move raSplitShares / raColumnTargets / landRaColumn into new `src/state/racial/raColumn.ts` (avoids a
     powerOfRa ↔ bossSkillsPharaohRitual import cycle); re-export them from powerOfRa.ts. `raColumnTargets(world,
     spare: PlayerId | null, at)`. Add `raColumnPoolFor(world, seat)` = seatHoldsPerk(p,'mummies.l10') ? 75 : 35,
     as the ONLY source of the number. Constants RA_WRATH_COLUMN_ATK 5 / PEN 10 → attackFifths = 75 (⚠ MINE pair;
     alternatives 15/0, 3/20, 1/70).
  2. Boss: `runPharaohRitual` → landRaColumn(world, spare=null (spares nobody, unchanged), pos,
     raColumnPoolFor(world, boss.ownerPlayerId), sever actor boss.ownerPlayerId, cause 'unit' ⚠ MINE).
  3. Re-pin: bossSkillsPharaohRitual*.test, powerOfRaSplit "NEGATIVE boss 300" test (→ boss 35 split / 75 for a
     WRATH owner), damage.callSites (file moves to raColumn.ts; ritual's applyRadialDamage site gone → damage.ts
     count unchanged? recount), untargetableCallSites key → raColumn.ts, canon rows + pins, CANON_NOTES §6 reason.
  4. Tests: arithmetic; REACH boss column 35 split; WRATH seat cast 75 split + its Pharaoh 75; non-WRATH 35;
     negative; mutation; host-vs-worker wide hash. Gates. Commit each step.
