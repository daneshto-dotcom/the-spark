# S196 PROGRESS — s196/risen-check

**NEXT STEP:** typecheck 0, build 0 (1263.3 KiB, my delta 0 — tests only). vitest + e2e running detached (.tmp-gates); then final report.

## VERDICT (draft): NO SIM DEFECT. THE RISEN fires through the real host tick in every shape tested.
- Static: the ONLY production `damageCreature` caller is `damageEntity` (damage.ts:308), which resolves ONE `KillCredit` at the blow
  (damage.ts:204). Every creature-on-creature strike (melee, ranged, hound, boss, CORPSE EATER feed bite) is `applyCreatureAttack`
  (creatureAttack.ts:215) with `{kind:'creature'}` -> typed credit. Rot aura (bossSkills.ts:220) names the boss. Zombie boss death
  blast (zombieDeathBlast.ts:228/251) passes an explicit boss credit. Everything else is typeless BY RULING (castle gun, raid, Ra,
  scorch, hub, drone, defender/tower, potato, suicide goblin, stink bag, HELL) — none is a zombie racial unit.
- REACH (src/state/racial/theRisenS196.test.ts, 11 tests): soldier vs enemy SOLDIER (mutual, initiative roll), hound, boss, 2v2
  enemy-team kill, wave-1 draft DEADLINE auto-take (host seat AND joiner seat), NetSnapshot -> joiner shows the risen soldier + perk.
  Negatives: goblin of the zombie seat, seat that clicked HP, teammate victim. Mutations: drop raceUnit from isZombieRacialType -> 3 red;
  sameTeam -> owner-equality -> 1 red.
- MEASURE (theRisenMatchMeasure.test.ts, SPARK_RISEN_MEASURE=1): 4-seat HARD bots, 8 waves, zombie seat 1: 64 enemy kills credited
  to the zombie seat -> 50 racial (38 raceUnit + 12 hound) RISE, 14 typeless (castle gun/tower) do not.
- Most likely explanation: the risen soldier is born SILENTLY AT THE KEEP (no VFX/toast/number; `grep -i risen src/render` = 0),
  indistinguishable from the 30 s castle cadence, far from the kill he was watching. Or the seat clicked the general tile.

## Log
- merged master c78f5c58 (clean, only plans/session-state).
- debug: first REACH draft lost 2 duels (S156 roll) — fixture fixed (`sturdy`), not a defect.
- measure first run exit 1 = vitest 20 s per-test timeout on the instrument (data printed) — benign, timeout raised to 600 s.
