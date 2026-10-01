# S192 CANON NOTES — `s192/units-ai` (for the merge owner to fold into SPARK_CANON.md)

## §5b — add: HELGA PATROLS IN BUILD TOO (T5)
*"Helga is not patrolling during … the build stage. She just stands behind her tower … She should always like walk
around her tower patrolling."* — owner, S192. `stepPrincessPatrol` is called from the FSM's IDLE arm (FIGHT) and from
the host's defender poll in BUILD. BUILD is MOTION ONLY: no acquire, no fire clock, no aura, no state change — she stays
IDLE with a null target, so `isHelgaEngagedRaw` stays false and her theme does not play all build stage. DORMANT
(R190-J) does not move. `helgaBuildPatrol.test.ts` (mutation-tested).

## §5 / §9b — add: NOBODY TARGETS THE DEAD (T13)
*"my spawn were attacking him, even though it was already dead … they went back to the castle that's already
destroyed"* — owner, S192 (also his answer to the S191 perf question: a pick returning a unit killed earlier in the same
tick IS a bug). `isLiveCreatureTarget` = live pool · not a corpse-in-waiting · not DESPAWNING (⚠ MINE) · targetable,
at every pick and hold (pinned by `liveTargetSites.guards.test.ts`). The march never goes to a fallen keep
(`enemyCastleMarchPos` skips `castleHp <= 0`). Fallen-tower leftover shapes stay targetable (owner question).
§5's perf paragraph ("deliberately NOT filtered … a behaviour question") is now superseded.

## §5 — add: DON'T CHASE WHAT YOU CAN'T CATCH (T6)
*"they ignore it if it's like way too quick for them to actually catch up"* — owner, S192. A unit neither acquires nor
holds a quarry that (a) cannot strike a unit (`isNonCombatantType`: lightning drone, pencil chewer), (b) is faster than
`CHASE_GIVEUP_SPEED_RATIO` = **1.25** × the chaser (`maxAccel`), and (c) is beyond the chaser's engage reach +
`CHASE_GIVEUP_SLACK_PX` = **20** px. Both numbers ⚠ MINE. Units that can strike back are never skipped, so R184-A is
untouched. Turrets, stink tower, castle guns and Helga unchanged. Measured: one passing drone cost −42.9 % (melee goblin)
/ −43.0 % (orc boss) of a 500-tick advance before, 0.0 % after. Canon-test assertions for 1.25 / 20 owed if folded in.
