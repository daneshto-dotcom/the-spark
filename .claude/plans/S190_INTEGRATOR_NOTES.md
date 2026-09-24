# S190 — INTEGRATOR NOTES (deploy #4: every remaining branch, ONE protocol bump 50 → 51)

Written by the merge owner as audits land. The integrator agent reads THIS file first. Audit journals (one
{"type":"result"} JSON line per agent) are the evidence for every line below.

## Merge order (one branch at a time; typecheck + FULL vitest after EVERY merge; a branch that is not clean is LEFT OUT)
1. `s188/wrath` → 2. `s188/swarm` (already contains wrath) → 3. `s189/render` → 4. `s189/units` → 5. `s189/weld`
→ 6. `s190/perf` → 7. `s188/draft-atk` → 8. `s189/net` → 9. the ONE protocol bump + canon + docs commit.

## Per-branch chores (exact resolutions)

### s188/draft-atk (audit wf_05c696b4-44a — NO defect on branch; merge-ready)
- canon.test.ts goes RED in TWO places by design (DA-A1 / DA-L2-1/2/3): (a) the castle-arm source pin (~:862) —
  re-pin to require the LADDER call name in the castle arm (`/[aA]ttackFifths\(/` — L2-2 notes this is weaker; pin
  that the arm calls `creatureAttackFifths(` specifically); (b) the §3d "PENDING TRAIN D" tripwire (~:496-515) —
  replace with the live rule (callers('draftedAttackFifths') === ['state/creatures/creature.ts']), pin the worked
  strikes from the constants (6→7→8, 12→13, 33→36, 20→22, 30→33, 150→165), and rewrite SPARK_CANON.md §3d's
  "only HP and DEF picks land" clause, the PENDING paragraph and the §3 castle row IN THE SAME COMMIT; ⚠ canon.test.ts
  ~:321 pins the OLD castle-row wording (DA-L2-3) — change both together.
- Conflicts: corpseEater.ts import block with s189/units (keep `attackCycleMultiplier` + `creatureAttackFifths` +
  render's `noteCreatureHeal`); stateHashFull.ts CreatureHashed union + projection with s189/render (keep BOTH
  'healedFifths' and 'atkFifths', each with its own contribution test).
- Text (DA-A3/A5): creatureStrike.guard.test.ts SANCTIONED `why` strings call R190-E "OPEN OWNER QUESTION" — rewrite to
  cite R190-E ("No — a drafted ATK pick buffs physical hits only; the Ra column is MAGIC"); stale comments saying the
  arms read `attackFifths(atk, pen)`.
- Protocol reason for the 51 docblock: `Creature.atkFifths?` (serialized + hashed) and the birth-bake of drafted ATK/PEN
  into every creature strike (a v50 peer drops the field → card/fatal-blow disagree; a v50 successor restores unbuffed).
- Owner question recorded for next session (DA-A2, NOT changed): boss-skill SUMMONS (Pharaoh locusts, Warlord
  direwolves), Voltkin lightning and the suicide/drone blasts ARE buffed by a drafted ATK pick (they are creatures'
  own hits). Lever if he says no: pass `draftPicks` undefined for boss-summon types in the null-spawner branch of
  applySpawnCreature (moves pool AND strike together).
