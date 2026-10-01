# S188 P7 — `s188/racial-d` — PROGRESS (running file, updated with every wip commit)

| perk | mechanic | art |
|---|---|---|
| `zombies.l5` CORPSE EATER | ✅ DONE — `racial/corpseEater.ts`, 24 tests, flipped (2a36d35) | ✅ DONE — `t9boss-zombies-feed` sheet (9e2bf15) + renderer ping-pong (`render/corpseEaterFrames.ts`) |
| `nagas.l5` APEX PREDATOR | ✅ DONE — `racial/apexPredator.ts`, 15 tests, flipped (456166e, 40b97a4) | ✅ DONE — own atlas `t3-nagas-piranha-elite` (838d1b1), fallback retired |

Canon text for the merge owner: `.claude/plans/S188_CANON_NOTES_racial-d.md`.

**FINAL GATES at 0c23c95** (captured `$?`): typecheck 0 · vitest 0 (5674 / 346 files) · build 0
(925.2 KiB, headroom 74.8 — substrate 87f3dc4 measured 919.8, so this branch adds **5.5 KiB**) ·
check:atlas 0.

**FIX ROUND (after the merge, on top of master f61d6f5):** F1 96b662c knockback re-anchors instead of
snapping · F2 d4097d6 heal wording (overkill included) · F3 66991bc seat-aware tower card · F4 62cdfba
stunGates GATE 4 · F5 448b4c9 no feed drawn in BUILD, straddling window cut short.

Full unit suite at 40b97a4: **5665 passed / 345 files, exit 0**. Typecheck exit 0.

## Mechanic design as built

**CORPSE EATER** — `src/state/racial/corpseEater.ts`, called from the racial-d slot of `racialTick.ts`.
- Trigger: zombie tier-9 boss whose owner `playerHoldsPerk(…,'zombies.l5')`, not stunned, alive, not a
  corpse-in-waiting, `ehp*100 <= creatureMaxEhp*20`, latch `corpseEaterUntilTick === undefined` (never
  cleared ⇒ once per life). Stamps `corpseEaterUntilTick = tick + 480` + `corpseEaterAnchor`.
- Fields: `Creature.corpseEaterUntilTick?`, `Creature.corpseEaterAnchor?` — creature.ts, save.ts
  (type + serialize + deserialize), stateHashFull (union + projection `:ce…@…`), contribution tests.
- While feeding the hostTick fan-out `continue`s past him (beside stun gate 3); the slot drives
  target (enemy first, else own non-boss, sticky), movement (leash-projected), bite (the ordinary
  `CREATURE_ATTACK` reducer on his normal swing clock) and heal (= 100 % of the bite's amount, the whole `attackFifths(atk, pen)` with overkill included, capped at his max).
  Last feeding tick releases him to SEEKING with no target.
- `CORPSE_EATER_LEASH_RADIUS = 60` is MINE.

**APEX PREDATOR** — `src/state/racial/apexPredator.ts` `towerUnitForSeat`; both tier-3 emit sites
(hostTick cadence arm, `goblinTowerFeed.applyFeedTower`) call it. `t3PiranhaElite` config =
`T3_STATS.piranha` × `APEX_PREDATOR_STAT_MUL` (3) on hp/def/atk/pen, derived; speed unchanged.
`PIRANHA_ELITE_SPRITE_SCALE_MUL = 2` (his). Every `'t3Piranha'` consumer visited: stats.ts ×2,
potatoLifecycle, characterSheetModel name, goblinRenderer ATLASES + GOBLIN_KINDS + preloadRaceKit,
towerFrames scale, voltkin-config CREATURE_CONFIGS + the hand-maintained key list test.

## Art — as built
- New intake `scripts/build-scattered-sheet-atlas.mjs` (nearest-body / uniform assignment,
  centroid / ground alignment, one fitted scale). Specs: `assets-source/race-tier3-units/piranha-elite/
  atlas-spec.json`, `assets-source/race-tier9-bosses/zombie-corpse-eater/atlas-spec.json`.
- Elite piranha: body fitted to the shipped piranha's 128/200 → the 2x draw is exactly 2x. Guard clean.
- Corpse eater: SEPARATE sheet (not extra rows — the shipped sheet stays byte-identical), standing
  frames fitted to 261/320, ground on the shipped feet row 312. Guard clean (near-white pocket 59/60).
