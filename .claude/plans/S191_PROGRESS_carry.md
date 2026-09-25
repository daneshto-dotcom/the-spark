# S191 PROGRESS — `s191/carry` (worktree `s191-carry`)

Brief: main checkout `.claude/plans/S191_BRIEFS/carry.md`. Rules: S191 PDR §4 + S189 PDR §4.
Branch base: `42cc2ee` (master plan commit on top of `5f22e1d`; src = deploy #4, PROTOCOL 51).

## Status

| step | status | commit | notes |
|---|---|---|---|
| 0 · `npm ci` | DONE | `60c304d` | `NPM_CI_EXIT=0` (captured `$?`, log `.tmp-gates/npm-ci.log`) |
| C-1 · worker startup `nextPulledSparkId` | DONE | `686f990` | see below |
| C-2 · WRATH-F5 pending cast vs tick moving backwards | DONE | `3b2f460` | see below |
| C-3 · SWM-6 swarm draw through the bat-sheet fallback | DONE | `d4107bc` | test-only |
| C-4 · `drawRaRitual` FIGHT gate | DONE | `0c1d040` | see below |
| C-5 · hub self-destruct = 120 fifths | DONE | (this commit) | Council items applied (explicit arms) |
| C-6 · `spreadEnemyTarget` strict predicate | GATED (merge owner "C-6 go") | | |
| C-7 · health bar on the star, bounded width | GATED (after weld on master) | | |
| **ROUND 2** | | | merge owner's message: A · B · C · D · C-6 · C-8 · C-9 |
| R2-A · blast = 120 IN TOTAL, split (owner S191) | DONE | `082ecd2` | see below |
| R2-B · test honesty (GATES-3, BLAST-8) | DONE | (this commit) | test-only |
| R2-C · bag burst from a hub blast spares the hub owner (BLAST-1, MINE) | next | | |
| R2-D · canon truth + pins (GATES-4, BLAST-6/GATES-2, GATES-1) | todo | | |
| C-6 · spreadEnemyTarget strict predicate | RELEASED, todo | | |
| C-8 · R190-I castle hit / heal numbers | RELEASED, todo | | |
| C-9 · R190-H Ra above buildings, ring on the ground | RELEASED, todo | | |

## C-1 — DONE

- Bug: `src/state/workerSim.ts` `makeWorkerSim` → `restore()` never writes `nextPulledSparkId` (not
  serialized; zero occurrences in `save.ts`), so a worker adopted mid-match minted its first pull at −1
  over a live pulled shape. Measured pre-fix: the live Triangle at −1 was replaced by the new Square.
- Fix: one line after `restore()` — `world.nextPulledSparkId = rebuildAuthorityAllocators(world).nextPulledSparkId`
  (calls the shared function, does NOT edit it — weld owns its body). Only that field is taken.
- Tests: `src/state/workerSim.pulledSparkId.test.ts` (5) — REACH through the real INIT seam
  (`snapshot()` → `makeWorkerSim`) and a real `applyTickBatch` pull intent; lowest-id-live case;
  newest-consumed case (pinned as collision-free but NOT bit-exact); bit-exact wide hash when the newest
  pull is live; negative (no pulled shape → −1, bit-exact, unchanged).
- Mutation: repair line replaced by `void rebuildAuthorityAllocators` → 4 of 5 RED (`expected 3 to be 2`
  = the eviction), restored → 5/5 green.
- Import-graph change: `workerSim.ts` value-imports `../net/migrationClaim.ts` — the worker graph's only
  `net/` value import. Worker chunk 222,208 → 224,465 B (+2,257 B). Entry chunk 978,794 B unchanged.
- Wire / hash / shared rule: none. `nextPulledSparkId` stays unserialized and off the wire → no bump.

## C-2 — DONE

- Record: `src/render/raAimPreview.ts` `PendingRaCasts` / `livePending` (view state, not wire, not hashed).
- Mechanism (measured in code): a joiner runs `world.tick++` every fixed step (`main.ts` client branch
  ~:2815) and each snapshot sets `world.tick = snap.tick` (`save.ts:1600`), so a clock that ran ahead steps
  BACK on apply — right after a send. `livePending` read `age < 0` as dead → the W-4 bug again; and it
  only IGNORED expired records, so a later step back revived a refused cast.
- Fix: new pure module `src/render/pendingRecordClock.ts` — `pendingRecordAnchor(nowTick, atTick, timeout)`
  (reusable per the Council note: s191/owner's Scorched Earth cast may use it). Backward → re-anchor at
  the adopted tick; older than the window → `null`, and `livePending` DROPS the record. Wave and catch-up
  checks unchanged (still non-destructive).
- Tests: `src/input/controls.raPendingTickBack.test.ts` (4) — REACH through real `Controls` + `FooterBand`
  pips + `drawBossAuras` aim + real `netSnapshot`→`applyNetSnapshot` moving the clock back; re-anchored
  record still expires; expired record stays dead after a step back; negative (forward-only unchanged).
  `src/render/pendingRecordClock.test.ts` (3) — arithmetic.
- Mutations: (1) backward → `null` in the rule: 4 RED; (2) drop removed in `livePending`: the resurrection
  test RED. Both restored → green.
- Wire / hash / shared rule: none (client view state). No bump. No new constant (window = the existing
  `RA_PENDING_TIMEOUT_TICKS`, MINE since S190). `footerBand.ts` NOT touched.
- Benign, recorded: the C-1 full-suite run rewrote `src/state/spawners/__snapshots__/pentagramBuildability.test.ts.snap`
  with LF line endings — content-identical (empty diff); restored with `git checkout`, not committed.

## C-3 — DONE (test-only; no source change)

- `src/render/swarmBatFallback.test.ts` (5): REACH through the real `GoblinRenderer.sync` with `fetch` +
  `Assets.load` stubbed at their seams and the SHIPPED manifests/PNG sizes read off disk. Swarm manifest
  404s → one Sprite cut from the BAT sheet at `GOBLIN_SPRITE_BASE_SCALE × BAT_SWARM_SPRITE_SCALE_MUL`,
  zero console errors/warnings; swarm + bat side by side each at its own type's scale. Negatives: swarm
  sheet present → its own sheet; plain bat → bat sheet ×1; the bat sheet carries every swarm row.
- Mutation: the draw loop's `?? (fallbackType !== null ? this.atlases.get(fallbackType) : undefined)`
  arm (`goblinRenderer.ts` ~:1144) → `?? undefined`: 2 RED (0 sprites / 1 of 2), restored → 5/5.

## C-4 — DONE

- The sim's gate, read (not edited): `runPharaohRitual` is called only inside `hostTick`'s one
  `matchPhase === 'FIGHT'` boss-skill gate (`hostTick.ts` ~:2094/2128) and returns unless
  `gameState === 'PLAYING'` (`bossSkillsPharaohRitual.ts:101`).
- Fix (`src/render/bossAuras.ts`, ritual drawing only): `drawRaRitual` draws its COLUMNS only when
  `ritualColumnsCanLand(world)` = PLAYING && FIGHT — the current phase, nothing predicted from
  `phaseEndsAtTick` (the `drawPowerOfRa` / `showsCorpseEaterFeed` precedent). ⚠ MINE: the priest's halo
  still draws while `isChannellingRa` (the sim's truth in BUILD too). `rememberRaRitual` (tails) runs
  before the gate, unchanged; the tails keep their own "he is gone" proof.
- Tests: `src/render/raRitualFightGate.test.ts` (4) — REACH through the real `runHostTick` across the real
  `phaseEndsAtTick` edge with the real `drawBossAuras` every tick; the sim's landings observed by a
  `vi.mock('../state/damage.ts', { spy: true })` on `applyRadialDamage` (a pass-through `importOriginal`
  factory did NOT intercept — an import cycle; measured, recorded in the file). Straddle: sim lands
  exactly columns 0/1 in FIGHT, each drawn on its landing tick, nothing drawn on any BUILD tick; halo in
  BUILD; negative (all-FIGHT: five landings, all drawn); render model alone (FIGHT / BUILD / WIN).
- Re-pinned by design (they drew live columns on `makeWorld`'s default BUILD board):
  `raStrikeArt.test.ts` `pharaohBoard` → FIGHT (RAVFX-A now sets BUILD explicitly),
  `powerOfRaRender.test.ts` Pharaoh board → FIGHT. 3 tests were red before the re-pin.
- Mutation: gate replaced by `void ritualColumnsCanLand` → 2 RED, restored → green.
- Wire / hash / shared rule: none (render only). No bump.
- ⚠ Consequences stated: a telegraph still growing at the FIGHT→BUILD edge vanishes AT the edge (as a
  POWER OF RA strike's does), and a column that landed just before the edge has its code-beam aftermath
  cut at the edge; column 4's finale tail is not gated (it draws only after the sim removed him).

## C-5 — DONE

- `src/state/potatoLifecycle.ts`: `StructureSelfDestructAction` is a union with a REQUIRED `blast:
  'ladder' | 'raze'` (ladder REQUIRES `ownerPlayerId`). The hub dispatches `'ladder'`; the ZOMBIE BOSS's
  R138 death blast (the only other dispatcher, same action since S168, 380 px, no owner) dispatches
  `'raze'` — byte-identical, because the ruling names the hub only. `applyHubLadderBlast`: collect-then-
  mutate, sorted ids, enemy-only (S157 P0), families creatures → Helga (`ehp !== null`) → lone shapes
  (`bonds.size === 0` at collection) → stink bags → connectors (midpoint inside, neither end the owner's,
  `damageConnector(120, null)`, sever via `applySeverBond` inline with cause `'drone'` — the Ra audit-F1
  reason: `dispatch`'s bench/elimination gates would refuse it). No arm for shapes inside a structure;
  no castle arm. NOT built on `applyRadialDamage` (Council).
- Constants: `STRUCTURE_SELFDESTRUCT_DRONE_MULTIPLE` = 4 (owner's), `STRUCTURE_SELFDESTRUCT_FIFTHS` =
  4 × `attackFifths(DRONE_ATK, DRONE_PEN)` = 120 (derived). ⚠ MINE at the constant: per connector (a
  5-connector tower inside takes 600 and falls); unbuffed drone. Stated: no tier-9 boss (260–462) and
  not Helga (156) fall to one blast.
- `src/state/hostTick.ts`: two one-line hunks (`blast: 'ladder'` at the hub site ~:864, `blast: 'raze'`
  at the zombie site ~:2389). The hub's own raze set (`selfIds` / `razePrimitives`) untouched.
- Tests `src/state/hubSelfDestructLadder.test.ts` (9): REACH through the real host tick (real hub,
  banked below a third, fused + blown by the real poll in FIGHT, bystanders stunned, drones parked):
  chewer dies, a Kraken loses exactly 120, the enemy connector inside is felled by a recorded 120 hit
  with cause `'drone'`, the one outside stands, a shape inside a structure keeps 70, the castle keeps
  its HP, the owner's unit / lone shape / connector untouched. Arms: Helga −120 (stands at 36), a
  tower takes nothing, 5-connector tower inside falls (5 × 120), a mixed bond spared, just-outside
  negatives, the owner's bag/chewer spared, keep at ground zero untouched, castle geometry on both
  boards (> 240 px), insertion-order determinism, and `'raze'` still deletes a boss.
- Re-pinned by design: `damage.callSites` 15→16 / null 7→8 (+`potatoLifecycle.ts`),
  `damageConnector.callSites` 5→6 (+`potatoLifecycle.ts` null), `creatureStrike.guard` (SANCTIONED +1
  and ONE named exemption from the retired-`DRONE_ATK` ban for the hub's price line), dispatch sites in
  `spawnerPhaseGate` (2 → `'ladder'`, anti-vacuity → `'raze'`), `lightningDrone` (`'raze'`),
  `hostTick.differential` frozen reference (`'raze'`).
- Canon: §9d item 2 → BUILT S191; §10 R182-C → BUILT; `canon.test.ts` pin inverted to the built rule
  (constant = 4 × attackFifths(DRONE_ATK, DRONE_PEN) = 120; 156 Helga; arm never calls
  `applyRadialClear(` / `applyRadialDamage(`; exemption present; exactly one `'ladder'` and one
  `'raze'` dispatch). §7's stale paragraph + the §2 overkill discrepancy → `S191_CANON_NOTES_carry.md`.
- Mutations: (1) ladder branch → raze: 4 RED; (2) creature arm's owner filter dropped: 3 RED (incl.
  `spawnerPhaseGate`). Restored → green.
- ⭐ MEASURED, pre-existing: a single connector hit's overkill is DISCARDED at the sever (120 on a
  5-connector star → survivors 0), contradicting canon §2. Pinned in the C-5 REACH test with a ⚠ note.
- Protocol verdict: the action is host-internal (not on the wire), no serialized/hashed field changed —
  but it is a RULE a successor computes, so it OWES the deploy's bump (Council).

## R2-A — DONE (owner S191: *"hub blast hit 120 divided by everything that's around it. So 120 damage points in total."*)

- `potatoLifecycle.ts`: new pure exported `planHubBlast(world, cx, cy, radius, owner)` → ordered shares;
  `applyHubLadderBlast` executes it. Targets unchanged (enemy creatures, Helga, lone shapes, bags, each
  connector one entity; no structure-shape arm; S157 P0). Share `floor(120 / n)`, the first `120 mod n`
  +1; n > 120 → the first 120 get 1, the rest 0 (same formula). Order: squared distance, then kind
  (creature · defender · primitive · stinkCloud · connector), then id. ⚠ MINE: the order + kind ranks,
  the n > 120 rule. Applied in plan order (a pop/sever earlier in the order can change a later target).
- Tests (`hubSelfDestructLadder.test.ts`, 13): 1 target → 120; 7 targets → [18,17,17,17,17,17] + boss 17 =
  120; tie order by kind then id (7 at 100 px) → [18,17×6]; 200 targets → boss 1, 119 connectors 1, 80
  connectors 0, the 1s re-derived as the nearest by (d², id). REACH re-pinned: 5 targets → boss loses 24,
  e12 felled by a 24. 5-connector tower inside: breaks [24,24,24], 2 stand (was all 5 at 120 each).
- Mutation: remainder dropped (`extra = 0`) → 3 RED, restored.
- Canon §9d item 2 rewritten (quote, total split, MINE order/n>120; per-connector MINE removed);
  `canon.test.ts` pin slices from `planHubBlast` and asserts the division + the quote.

## R2-B — DONE (test-only)

- GATES-3 REPRODUCED: `helga()` / `bag()` return the stored object `damageEntity` mutates, so
  `expect(get(id).ehp).toBe(obj.ehp)` compared a value with itself. With the Helga owner filter dropped the
  test went red only via the ENEMY Helga's changed share (the own-Helga line could not fail). Fixed: the
  number is captured before the blast (own Helga also pinned to `unitPoolFifths(PRINCESS_HP, PRINCESS_DEF)`
  = 156) and checked first. Mutations: Helga owner filter dropped → RED on "the owner's Helga is spared"
  (96 vs 156); bag owner filter dropped → RED on "the owner's bag is spared". Restored.
- BLAST-8 REPRODUCED (`hashWorldStateFull(a)` vs itself). Replaced by a differential: A;
  B = restore(snapshot(A)); C = the same save with creatures / defenders / primitives / bonds / stinkClouds
  and every shape's bond Set re-inserted in reverse (anti-vacuity: C's first creature differs). Pre-blast
  all three hash equal; post-blast all three equal and differ from pre; the tied 50 px bosses split 18/17
  by id. Mutation: the plan's sort removed → RED ("C = A after the blast"). Restored.

## In flight

Nothing — C-1..C-5 done; C-6 / C-7 wait for the merge owner.

## Decisions / numbers that are MINE

- C-1: the scan repair (brief's first option) over serializing the counter. Serializing would be
  bit-exact but is 5 hunks in the `save.ts` hotspot (WorldSnapshot type, `snapshot()`, `restore()`, the
  NetSnapshot `Omit`, the `netSnapshot` destructure).

## Found, NOT fixed (outside the file boundary)

- **Wide-hash asymmetry on an EMPTIED castle bank** (pre-existing, test-oracle only): a seat whose pulls
  emptied its bank keeps an all-zero tally in `world.castleBanks`, `hashWorldStateFull` projects it
  (`cb0:0.0.0.0.0.0`), but `serializeCastleBanks` (`save.ts` ~:2096) skips zero tallies, so the restored
  world has no entry and the wide hash differs. The narrow production `hashWorldState` does not project
  banks, so host-vs-client is unaffected. Any differential test that INITs after a bank is emptied will
  red on it. Fix shape (hotspot, not mine): hash-skip zero tallies, or delete the map entry at zero.

## Hotspot hunks (save.ts / stateHashFull.ts / worldTypes.ts / main.ts)

None.

## Gate numbers

| after | typecheck | vitest (full) | build | entry KiB |
|---|---|---|---|---|
| baseline (before C-1) | — | — | 0 | 955.9 (978,794 B) |
| C-1 | 0 | 0 — 6469 passed / 2 skipped, 397 files (107 s) | 0 | 955.9 (978,794 B) |
| C-2 | 0 | 0 — 6476 passed / 2 skipped, 399 files (128 s) | — | — |
| C-3 + C-4 | 0 | 0 — 6485 passed / 2 skipped, 401 files (133 s) | — | — |
| C-5 | 0 | 0 — 6494 passed / 2 skipped, 402 files (130 s) | 0 | 957.2 (980,125 B; +1,331 B vs baseline) · worker chunk 225,586 B |
