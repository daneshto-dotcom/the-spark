# S195 PROGRESS — s195/rules-2 (sim rulings B-9, B-10, B-25/30, B-31, B-32, N11)

NEXT STEP: A (B-9 chewer gnaws the keep): creatureLifecycle.ts chewer ATTACKING arm — stay in ATTACKING when targetBondId is null but enemyCastleInReach; re-pin chewerDroneTargets.test.ts 'keepLost' to the real number.

## Status per item
- A B-9 chewer attacks keep — NOT STARTED
- B B-10 drone splash one pool — NOT STARTED
- C B-32 Corpse Eater loop — NOT STARTED
- D B-31 welded TV summons — DONE (27ef3bf); mutants M1/M2/M3 → 3/2/1 red ✓ (code + tests + canon row + pin). isIsolatedVoltkinChain DELETED; ignition reads standingVoltkinTvs + tvsOwedAVoltkin + isTvPlayingNow (identity). ⚠ MINE: overlapping 8-paths = ONE TV (greedy disjoint). Mutant M1 (owed check dropped) → 3 red ✓. ⚠ Lesson: `git checkout` during mutation reverted my own uncommitted edits once — redone, now committed first.
- E B-25/B-30 blasts spare own side — DONE. Pharaoh column spare = his seat (aca4481). Mutant (spare back to null) → 3 red ✓. Enumeration below.
- F N11 smarter chasing — NOT STARTED

## Blast-site enumeration (E) — every area-damage producer in src/state, who it spares, verdict
Rule: a blast/area spares its OWN SIDE = `sameTeam(world, victimOwner, sourceSeat)` (teams.ts, imported only). FFA: own seat.
| # | site | spares | verdict |
|---|---|---|---|
| 1 | `creatures/suicideBlast.ts` units+shapes (`applyRadialDamage`, spare = bomber owner → `sameTeam`) + connector arm (`sameTeam` either end) | own team | compliant |
| 2 | `droneLifecycle.ts` detonation (spare = drone owner) + connector sever (`sameTeamColor` either end) | own team | compliant (pool rewritten in B, sparing kept) |
| 3 | `defenders/stinkTower.ts#radial0` death blast (spare = `d.ownerPlayerId`) | own team | compliant — B-30 "stink tower" |
| 4 | `defenders/stinkTower.ts#radial1` thrown bag landing (spare = `d.ownerPlayerId`) | own team | compliant — B-30 "poop bag" |
| 5 | `defenders/stinkTower.ts#radial2` aura, flat DoT (spare = owner) | own team | compliant (not a blast) |
| 6 | `damage.ts#0` landed bag BURST (`damageStinkCloud`: spare = bag owner, + hub owner when a hub popped it) | own team (+hub's) | compliant |
| 7 | `defenders/stinkCloud.ts#radial0` lingering cloud DoT (spare = cloud owner) | own team | compliant (not a blast) |
| 8 | `potatoLifecycle.ts` hub self-destruct `planHubBlast` (`isEnemySeat` every arm; connectors `sameTeam` either end) | own team | compliant |
| 9 | `potatoLifecycle.ts` raze arm (`blast !== 'ladder'`, `blastTakes`) | owner team | UNREACHABLE — no production dispatcher (hostTick:949 passes 'ladder'); sparing compliant anyway |
| 10 | `racial/zombieDeathBlast.ts` (spare = boss owner via `sameTeam`, R193-B3) | own team | compliant — B-30 "zombie blast" |
| 11 | zombie blast → stink-tower death CHAIN: the tower's blast is the TOWER's, spares the TOWER owner's side; the zombie owner's units in it take it (it is an enemy tower's blast) | tower owner's team | compliant — B-30 "spare own side" read as each blast's own side (REPORT: if he meant the zombie's side is spared by a tower it blew up, that is a new rule) |
| 12 | `bossSkillsPharaohRitual.ts` ultimate columns — WAS spare null + alliesOf (own seat burned) | now own team | FIXED (B-25) |
| 13 | `racial/powerOfRa.ts` perk column (spare = caster) | own team | compliant |
| 14 | `bossSkills.ts:197` zombie rot aura (`sameTeam` skip) | own team | compliant (aura) |
| 15 | `bossSkillsKraken.ts:152,242` sonar stun/shove (`sameTeam` skip) | own team | compliant |
| 16 | `bossSkillsArchdemon.ts:72,137` (`sameTeam` skip) | own team | compliant |
| 17 | `racial/scorchedEarthRules.ts` scorched ground (`isScorchImmune` = `sameTeam`) | own team | compliant |
| 18 | `creatures/voltkinChain.ts` chain lightning (single-target jumps, `sameTeam`) | own team | not a blast; compliant |
| 19 | `bombLifecycle.ts` potato/bomb detonation, `seagulls/*` poop | — | ARCHIVED (canon §1, `HAZARD_SPAWN_ENABLED` false) — unreachable; not audited for sparing |
| 20 | `castleGuns.ts`, `hunters/*`, `damageOverTime.ts` | — | single-target / helper, not area |
Residual: after B-25 NO production caller passes a non-null `alliesOf` (`applyRadialDamage`, `RaColumnSource`, `STRUCTURE_SELFDESTRUCT.alliesOf`) — the "teammates spared, own seat burns" posture is dead code paths kept for the API (reported, not removed: fix ONLY this).
