# S192 CANON NOTES — `s192/units-ai` (rewritten S193 from the progress file's R1–R3 + the S193 audit fix)

⭐ **The canon text is ALREADY ON THIS BRANCH**: `SPARK_CANON.md` §5c (after §5's S190 bond-index paragraph), pinned
by `src/canon.test.ts` → *"S192 units-ai — §5c is pinned to its constants"*. The merge owner folds the branch, not
this file. This file is the source summary; where it and §5c differ, §5c governs.

## T5 — HELGA PATROLS IN BUILD TOO
*"Helga is not patrolling during … the build stage. She just stands behind her tower"* — owner, S192.
`stepPrincessPatrol` runs from the FSM's IDLE arm (FIGHT) and from the host's defender poll in BUILD. BUILD is MOTION
ONLY: no acquire, no fire clock, no aura, no state change — she stays IDLE with a null target, so `isHelgaEngagedRaw`
stays false and her theme does not play all build stage. DORMANT (R190-J) does not move. `helgaBuildPatrol.test.ts`.

## T13 — NOBODY TARGETS THE DEAD
*"my spawn were attacking him, even though it was already dead … they went back to the castle that's already
destroyed"* — owner, S192. `isLiveCreatureTarget` = live pool (`ehp > 0`) · not a corpse-in-waiting
(`pendingCreatureDeaths`) · targetable (`!isUntargetable`) — at every pick and hold (`liveTargetSites.guards.test.ts`).
`enemyCastleMarchPos` skips `castleHp <= 0` (null when no enemy keep stands).
- **R192-U2 — the fading clause is REMOVED.** *"Units are either destroyed or respawned."* A DESPAWNING unit IS a
  target; the predicate has no `DESPAWNING` line (pinned by the sites guard and a differential case).
- **R192-U1 — a fallen tower's leftover shapes stay targetable until destroyed** (*"just as it is today"*). No code
  change; pinned in `deadTargets.test.ts`.
- **SUPERSEDED:** the S191 perf report that the nav-unit index deliberately did not filter a unit killed earlier in
  the same tick (*"a behaviour question, reported, not built"*, `S191_PROGRESS_perf.md`). The perf oracle now asserts
  `pendingDeathReturned === 0` with a `corpseAvoided ≥ 100` floor (746 S192 / 1160 on the S193 merged tree).

## T6 — CHASE A DRONE SMARTLY, NEVER ACROSS THE MAP
*"I didn't say ignore drones or pencil chewers all the time. It just has to be smart"* — owner, S192 (R192-U4).
A FAST NON-COMBATANT (`isNonCombatantType`: lightning drone, pencil chewer; faster than `CHASE_GIVEUP_SPEED_RATIO`
= **1.25** × the chaser's `maxAccel`) is engaged when ANY of:
1. within the chaser's reach + `CHASE_GIVEUP_SLACK_PX` = **20** px;
2. the chaser AND the quarry both stand in the chaser's OWN zone (*"you're still in your zone"*) — ⭐ S193 audit: the
   S192 code tested only the quarry, so a unit abroad near the border re-took a drone that crossed into its zone at
   88–202 px and turned back (2–4 pickups a drone);
3. an intercept is feasible (straight path to `targetPos` at cruise speed, cross-multiplied, ⚠ approximation).
Otherwise it is neither acquired nor held (no ping-pong, no memory). Both numbers ⚠ MINE. R184-A untouched (a quarry
that can strike is never skipped); turrets, stink towers, castle guns and Helga (R192-U3) unchanged.
- Measured, scripted fly-by, unit 40 px inside enemy ground, 400 ticks: goblinMelee −57.0 % → **−6.6 %** (S192:
  −37.6 %), t9BossOrcs −57.8 % → **−7.3 %** (S192: −38.2 %). His scenario: ticks locked on a drone 1550 → 284, far
  re-acquires 1 → 0, westmost lock x 1158 → 1305.

## Bump
YES (or rides the train's): a host-migration successor runs `runHostTick`, so a pre-T5/T6/T13 build promoted from a
post one (both advertising 56) computes different targets from the same state — the S192 C-6 class (54). No field,
no wire change.
