# S192 CANON NOTES — `s192/units-ai` (for the merge owner to fold into SPARK_CANON.md)

## §5b — add: HELGA PATROLS IN BUILD TOO (T5)
*"Helga is not patrolling during … the build stage. She just stands behind her tower … She should always like walk
around her tower patrolling."* — owner, S192. `stepPrincessPatrol` is called from the FSM's IDLE arm (FIGHT) and from
the host's defender poll in BUILD. BUILD is MOTION ONLY: no acquire, no fire clock, no aura, no state change — she stays
IDLE with a null target, so `isHelgaEngagedRaw` stays false and her theme does not play all build stage. DORMANT
(R190-J) does not move. `helgaBuildPatrol.test.ts` (mutation-tested).
