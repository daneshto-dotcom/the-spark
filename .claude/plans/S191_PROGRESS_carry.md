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
| C-4 · `drawRaRitual` FIGHT gate | DONE | (this commit) | see below |
| C-5 · hub self-destruct = 120 fifths | next | | Council items received (explicit arms) |
| C-6 · `spreadEnemyTarget` strict predicate | GATED (merge owner "C-6 go") | | |
| C-7 · health bar on the star, bounded width | GATED (after weld on master) | | |

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

## In flight

Nothing.

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
| C-3 | — (test-only) | batched with C-4 | — | — |
