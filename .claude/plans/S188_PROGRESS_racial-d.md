# S188 P7 — `s188/racial-d` — PROGRESS (running file, updated with every wip commit)

| perk | mechanic | art |
|---|---|---|
| `zombies.l5` CORPSE EATER | in progress — design fixed (see below) | next |
| `nagas.l5` APEX PREDATOR | next | next |

## Design, fixed before coding (so a salvage knows the intent)

**CORPSE EATER** — new file `src/state/racial/corpseEater.ts`, called from the racial-d slot of
`src/state/racial/racialTick.ts`.
- Trigger: zombie tier-9 boss (`t9BossZombies`) whose owner `seatHoldsPerk(…,'zombies.l5')`, not stunned,
  alive, not a corpse-in-waiting, `ehp*100 <= creatureMaxEhp*20`, latch `corpseEaterUntilTick === undefined`
  (never cleared ⇒ once per life). Stamps `corpseEaterUntilTick = tick + 480` and
  `corpseEaterAnchor = {x,y}` (two new optional Creature fields — four sites: creature.ts, save.ts
  serialize+deserialize, stateHashFull union+projection, contribution test).
- While feeding (`tick < corpseEaterUntilTick`): the boss is SKIPPED by the hostTick creature fan-out
  (one `continue`, like stun gate 3) and driven by the slot instead:
  target = nearest ENEMY creature within (leash + attackRange) of the ANCHOR, else nearest OWN non-boss
  creature; sticky while valid; bite on the feed clock `(tick - start) % cadence === fireTick` through
  the normal `CREATURE_ATTACK` reducer; heal = victim ehp actually lost, capped at `creatureMaxEhp`.
  Movement: SEEKING toward the target projected into the leash circle; ATTACKING (braked) when in reach;
  hard clamp to the leash circle at the end of the slot. Stunned ⇒ no trigger, no bite, no steering, no clamp.
  Last feeding tick ⇒ release to SEEKING with no target (so the normal FSM never finishes a bite on an own unit).
- Leash radius is MINE.

**APEX PREDATOR** — `CreatureType 't3PiranhaElite'`, config = `T3_STATS.piranha` × 3 on hp/def/atk/pen
(derived, never literals), 2× draw scale; the tier-3 tower's two emit sites (hostTick cadence emit,
`goblinTowerFeed.applyFeedTower`) promote `t3Piranha → t3PiranhaElite` when the owner holds `nagas.l5`.
