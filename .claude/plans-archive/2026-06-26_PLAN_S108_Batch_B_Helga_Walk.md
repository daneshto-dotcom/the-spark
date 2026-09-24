# PLAN — S108 Batch B · Helga FULL Walk-to-Target Rework (point #3, full)
Status: PLANNED (needs its own PDR + 3-way Council before execution) | PROTOCOL_VERSION: **12 → 13** | Tier: **Full** | Risk: **HIGH**
Source: S108 scope-discovery workflow (investigator #3, Opus). Owner: "Helga needs to walk to target and slap" (S108).

> Batch A ships only the INTERIM (cut range + remove the beam streak so she stops lasering across the map).
> THIS batch is the real fix: she WALKS to her target and slaps ONCE on arrival, then chases — no cross-map hit,
> no slap-loop. It is deferred because it adds synced MOVEMENT to a previously-stationary defender → a wire bump +
> determinism-heavy work. Do NOT bundle with bug fixes.

## OBJECTIVE
Convert Princess Helga from a stationary whole-screen instant-hitter into a melee chaser: acquire nearest enemy →
WALK to it (deterministic Verlet arrive) → slap ONCE on arrival → chase if it flees → return home when none remain.

## CURRENT STATE (verified)
- Helga is a STATIONARY `Defender` (defenderKind:'princess'), pinned to her Triangle-hub anchor EVERY tick
  (defenderLifecycle.ts:117-121). FSM IDLE→WINDUP→FIRE→RECOVER (applyDefenderTick:110-182); the RECOVER→IDLE reschedule
  `d.nextFireTick = world.tick + config.fireIntervalTicks` (line 177) is the "slap loop."
- Attack is a MELEE `damageCreature` at WINDUP→FIRE (154-157) — NOT a projectile. The "laser" = whole-screen
  `PRINCESS_SLAP_RANGE` (constants.ts:907, =2203) + `princessRenderer.drawSlapReach` screen-spanning streak (188-209).
- `Defender` (defender.ts:52-81) has `pos` but NO prevPos/targetPos/velocity → structurally cannot walk.
- Reusable WALK primitive: Verlet seek/arrive in creatureVerlet.ts (`computeSteeringAccel`:113, `arriveForce`:194+) —
  but it's Creature-typed + hard-gated `if (c.state !== 'SEEKING') return ZERO_ACCEL` (line 114). Do NOT call it
  directly; mirror its integrator in a Defender-callable helper so it's replay-identical.
- Target picker to reuse unchanged: `findNearestEnemyCreatureFrom` (creatureAI.ts:303, lowest-CreatureId tie-break).

## PROPOSED APPROACH (sim — the load-bearing, deterministic part)
1. defender.ts: add `prevPos: Vec2` + `walkTargetPos: Vec2|null`; add DefenderState `'WALK'`; add DefenderConfig
   `moveSpeed`/`maxAccel` (princess only; turret keeps moveSpeed=0 so the shared substrate stays byte-identical).
2. defenderLifecycle.ts: anchor-pin ONLY when IDLE/home (no target); once a target exists she integrates from her own pos.
3. FSM rewire: IDLE acquires nearest enemy → NEW WALK (each tick set walkTargetPos=victim.pos, step a Defender-adapted
   arrive integrator) → on `distSq(d.pos,victim.pos) <= PRINCESS_MELEE_RANGE²` (NEW small const ~30-40px) transition to
   WINDUP → FIRE deals the single hit (as today) → RECOVER: if target alive/in pursuit go back to WALK (chase), else
   IDLE + walk home. This = "slap ONCE on arrival, then chase, not a screen-wide loop."
4. New `stepDefenderWalk(d, target, maxAccel)` (in defenderLifecycle or new defenderMotion.ts) mirroring
   stepCreatureVerlet's Verlet integration (same dtSub + maxAccel clamp) → replay-identical.
5. Drop PRINCESS_SLAP_RANGE to an ACQUISITION radius (she can SEE far) + the small separate MELEE strike range
   (damage only lands adjacent). (Batch A already cut the range to ~380 as the interim — reconcile here.)

## RENDER
6. princessRenderer.ts: delete/gate drawSlapReach (on-arrival slaps are always adjacent → no streak). Add a WALK case
   to helgaPose.ts (62-127) with a leg-cycle (the rig already draws two legs at princessRenderer.ts:102-104).
7. Sync the new fields (prevPos / state 'WALK' / walkTargetPos) over the additive-optional defenders[] snapshot so the
   1v1 client renders the walk identically.

## WIRE / DETERMINISM (CRITICAL — Council-grade)
- **PROTOCOL_VERSION 12→13**: a new SERIALIZED `'WALK'` state literal + (for facing) walkTargetPos ride the defenders[]
  snapshot; a stale v12 peer would mis-render. (The defender substrate bumped 11→12 at S103 — same pattern.)
- Replay determinism: the new integrated pos/prevPos MUST advance with the SAME dtSub, maxAccel clamp, and Math
  ordering as stepCreatureVerlet (IEEE-754 ordering = save.replay byte-equivalence). No wall-clock, no RNG.
- Bot/human symmetry: keep walk logic in the host FSM + moveSpeed in the shared DefenderConfig → bot-built and
  human-built Helga behave identically. Turret stays moveSpeed=0 → byte-identical.
- Balance: she now has travel time + can be out-run — a REAL gameplay change, not cosmetic. Flag for owner playtest.

## OPEN QUESTIONS (owner)
1. Aggro vs strike range: keep whole-screen ACQUISITION (sees + walks to any enemy) while only STRIKE shrinks to melee?
2. Return behavior after a kill: walk back to anchor hub, or hold position?
3. Walk speed: match/undercut chewer (maxAccel 120) / Voltkin (200) so she's catchable, or fast?
4. Motion pipeline for the walk: author in code (helgaPose WALK leg-cycle, lowest risk) vs the offline slice-rig
   (SLICE_SPEC.md) for a richer art pass. (Pairs with Batch D art.) Live veo/3D path documented non-functional.

## TESTS
princessHelga.test.ts (WALK before FIRE; FIRE once per arrival; replay determinism) + defenderLifecycle FSM tests +
helgaPose WALK pose + save.replay byte-equivalence (turret unchanged) + the PROTOCOL_VERSION 13 wire round-trip.
Est: ~200-320 LOC across sim + render + tests + wire.
