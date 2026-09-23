# S188 P7 — `s188/racial-d` — PROGRESS (running file, updated with every wip commit)

| perk | mechanic | art |
|---|---|---|
| `zombies.l5` CORPSE EATER | ✅ DONE — `racial/corpseEater.ts`, 24 tests, flipped (2a36d35) | in progress — eat loop (ping-pong of v2-crouch-in) + burp |
| `nagas.l5` APEX PREDATOR | ✅ DONE — `racial/apexPredator.ts`, 13 tests, flipped (456166e, 40b97a4) | FALLBACK live (base piranha sheet at 2x); elite atlas in progress |

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
  `CREATURE_ATTACK` reducer on his normal swing clock) and heal (= ehp the victim actually lost, capped).
  Last feeding tick releases him to SEEKING with no target.
- `CORPSE_EATER_LEASH_RADIUS = 60` is MINE.

**APEX PREDATOR** — `src/state/racial/apexPredator.ts` `towerUnitForSeat`; both tier-3 emit sites
(hostTick cadence arm, `goblinTowerFeed.applyFeedTower`) call it. `t3PiranhaElite` config =
`T3_STATS.piranha` × `APEX_PREDATOR_STAT_MUL` (3) on hp/def/atk/pen, derived; speed unchanged.
`PIRANHA_ELITE_SPRITE_SCALE_MUL = 2` (his). Every `'t3Piranha'` consumer visited: stats.ts ×2,
potatoLifecycle, characterSheetModel name, goblinRenderer ATLASES + GOBLIN_KINDS + preloadRaceKit,
towerFrames scale, voltkin-config CREATURE_CONFIGS + the hand-maintained key list test.

## Art — next
- Elite piranha: 3 sheets (swim/attack/death, 8x3 each, RGBA, overlapping cells — the alpha-gutter
  intake cannot slice them) → one 12-frame-per-row atlas `t3-nagas-piranha-elite`.
- Corpse eater: v2-crouch-in (sit-down + loop) and v2-stand-and-burp → extra rows.
