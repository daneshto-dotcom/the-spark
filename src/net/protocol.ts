/**
 * SPARK — wire protocol for Phase-2 1v1 networked play.
 *
 * § 11 LOCKED (post-S15 amendment): host-authoritative, Trystero transport,
 * NetSnapshot at 10 Hz, per-direction sequence numbers (Council R2 +
 * PRIME-AUDIT #2: separate counters for host→client snapshots vs
 * client→host intents).
 *
 * S22 P3 amendment: protoVersion bumped 1 → 2. Added GodlyTriggerMsg
 * envelope for host-broadcast godly events. No back-compat shim — peers
 * on protoVersion 1 are rejected at lobby; both peers always upgrade
 * together via deploy. parseNetMessage validator added for R9 safety.
 */

import type { GameAction } from '../state/world.ts';
import type { NetSnapshot } from '../state/save.ts';
import type { PlayerId } from '../types.ts';
import type { GodlyTriggerEvent } from '../state/godlyRecipes/types.ts';
// S118 P1 (host-migration D2) — TYPE-ONLY (erased at compile; adds no runtime import cycle) so the
// Begin signal can carry the host's SuccessionWarrant additively. Shape is validated at the wire below.
import type { SuccessionWarrant } from './successionWarrant.ts';
import { MAX_PLAYERS } from '../constants.ts';
import { isRaceId, type RaceId } from '../state/races.ts';

// NetSnapshot is defined in save.ts (alongside its producer netSnapshot()
// + consumer applyNetSnapshot()). Re-export so protocol callers can refer
// to it without crossing the save.ts boundary directly.
export type { NetSnapshot };

// S52 P1 — bumped 2→3 to add PLACE_FROM_FREE atomic LMB-up action (Council
// R1 CONVERGENT BLOCKER C1 Grok#8+Gemini#1). parseNetMessage HELLO check
// below rejects mismatched protoVersion at handshake.
//
// S53 P1 — NetTransport now ALSO surfaces the mismatch as an explicit
// "Protocol mismatch — please refresh" UX diagnostic via onProtocolMismatch
// + per-peer protocolMismatchPeers latch that drops ALL subsequent messages
// from a peer whose HELLO failed protoVersion (closes the v2-peer-INTENT-
// bypass-after-failed-HELLO desync gap that Council Triumvirate flagged as
// CONVERGENT BLOCKER). The PICKUP_SPARK + PLACE_PRIMITIVE allowlist entries
// below remain — placeFromFree.ts's internal fsmPickup dispatches PICKUP_SPARK
// during atomic execution + placePrimitive is the delegation target. Mid-
// deploy peers still see "Protocol mismatch" plus the underlying Connection-
// lost overlay (S22 P3 pattern preserved). S53 P2 — RMB ConnectDrag flow
// removed; the legacy v2 carry-then-place external entry point no longer
// exists locally even if a v2 peer slipped past the latch.
// S62 — bumped 3→4 for N-player: START_GAME_SIGNAL now carries the seat→color
// roster (deterministic cross-client seating). A v3 peer is rejected at the
// HELLO handshake (single-deploy, no stragglers) — same lockstep as prior bumps.
// S71 — bumped 4→5: new TRIGGER_BOMB client→host gameplay intent (Council
// UNANIMOUS Fork A). Unlike the cosmetic LOBBY_PRESENCE (no bump), a stale v4
// peer would desync on bomb-grabs + the bomb/hunter/potato snapshot state, so it
// is hard-rejected at the HELLO handshake. (Single bump covers the P1/P2/P3 batch.)
// S75 — bumped 5→6: new TRIGGER_RAINBOW client→host gameplay intent (the rainbow colour-
// shuffle). A stale v5 peer would desync on the global player/prim colour remap (+ the new
// rainbows[] snapshot field), so it is hard-rejected at the HELLO handshake — same lockstep
// as the S71 TRIGGER_BOMB bump.
// S77 P3 — bumped 6→7: the new SEAGULL hazard. Its actions are HOST-INTERNAL (no new client
// intent — cleaning is host-detected avatar proximity), so by the hunter/potato precedent it
// COULD be no-bump; but it is a GLOBAL income-affecting hazard (a poop fouls a structure →
// that structure's income halts; a free spark is slowed) whose effects would be invisible/
// confusing to a stale v6 peer (which can't render seagulls/poops or understand the foul).
// Council CONVERGED on the rainbow precedent: bump so a stale peer is hard-rejected at HELLO.
// S87 P4 — bumped 7→8: QUICKMATCH ships the new LOBBY_READY client→host
// envelope and an all-ready START GATE. A stale v7 peer in a quickmatch room
// could never send LOBBY_READY, so the host's "everyone clicked start" gate
// would stall FOREVER on its silence (Council S87 F4 CONCEDED→GEMINI — the
// LOBBY_PRESENCE no-bump precedent covers cosmetic kinds, not match-gating
// ones). The HELLO hard-reject + "please refresh" UX handles the skew.
// S93 — bumped 8→9: THE NONET TRIAL. Backfilled in S150 — this entry was MISSING from this block
// entirely while the HelloMsg list below had carried it since S93, which is the same drift the
// warning below that list describes, just in the other direction. Two carriers: the new
// SUDOKU_SOLVED client intent (a v8 peer rejects the message, so a benched-but-solving seat could
// never score its comeback) and the additive-optional `sudoku` snapshot field, which GATES scoring —
// so a v8 peer would keep earning during a trial a v9 host has frozen.
// S100 P1 (TD Phase 1a) — bumped 9→10: the tower-defense feature ships
// REGISTER_SPAWNER/REMOVE_SPAWNER (host-internal) + a new SPAWN_CREATURE
// sourceSpawnerId field + the additive-optional `creatureSpawners[]` snapshot
// field. Both are HOST-AUTHORITATIVE (never client INTENTs — see the
// KNOWN_GAME_ACTION_TYPES_RECORD rows below, deliberately ABSENT from
// CLIENT_INTENT_TYPES). A stale v9 peer can't render an income-affecting +
// structure-destroying system (a spawner that mints chewers chewing through its
// connectors), so it is hard-rejected at the HELLO handshake — same lockstep as
// the S77 seagull / S93 NONET bumps (TOWER_DEFENSE_DESIGN.md §3.3).
// S102 #1 — bumped 10→11: the new RAID_CREATURE client INTENT (a player right-clicks an
// enemy chewer to pop it) + creatures now carry an `hp` field (host-only, wire-stripped, but
// the kill semantics differ). A stale v10 peer that can't originate/handle a raid would
// desync on the creature-kill, so it is hard-rejected at HELLO (same lockstep as above).
// S103 P2 — bumped 11->12: the generic DEFENDER substrate ships REGISTER_DEFENDER /
// REMOVE_DEFENDER / DEFENDER_TICK (host-internal) + the additive-optional `defenders[]` snapshot
// field (a stationary turret/HELGA auto-attacking creatures). A stale v11 peer can't stay in sync
// with a defender firing beams/slaps, so it is hard-rejected at HELLO (same lockstep as the S100
// spawner bump). Defenders are HOST-AUTHORITATIVE (never client INTENTs — they auto-build from
// geometry), so they ride KNOWN_GAME_ACTION_TYPES_RECORD only, ABSENT from CLIENT_INTENT_TYPES.
// S110 P4 (Batch B) — bumped 12->13: HELGA's walk-to-target rework adds a SERIALIZED defender state
// literal 'WALK' + additive-optional prevPos/walkTargetPos to the defenders[] snapshot. A stale v12
// peer would receive a 'WALK' state it can't parse / would mis-render the walking princess, so it is
// hard-rejected at HELLO (same lockstep as the S103 11->12 defender bump). Still host-authoritative.
// S113 Batch C — bumped 13->14: the lightning-drone building adds a NEW CreatureType 'lightningDrone'
// on the serialized creatures[] + a NEW recipeId 'lightningHub' on a SerializedSpawner. A stale v13
// peer would receive a creature/recipe literal it can't render, so it is hard-rejected at HELLO. The
// new actions (DRONE_EXPLODE / STRUCTURE_SELFDESTRUCT) are HOST-INTERNAL (never client INTENTs).
// S124 P1 (host-migration D4) — bumped 14->15: MIGRATION_CLAIM goes PRODUCTION-ON (the
// __TEST_MIGRATION__ seam is now a timing override only, no longer an activation gate) and
// NETSNAPSHOT epochs ≥ 1 become live semantics. A stale v14 peer in a migrated match would ignore
// the claim, keep waiting on the dead host's peerId, and freeze forever — semantically breaking,
// exactly the mixed-deploy class the version gate exists for (HOST_MIGRATION_DESIGN.md §7; the
// S122 Council L4 no-bump ruling rested on the seam gate D4 removes). Hard-rejected at HELLO.
// V6-1.1 — bumped 15->16: the gatherer economy adds a NEW additive-optional `gatherers[]` family to
// the snapshot AND a NEW client INTENT (BUY_GATHERER). A stale v15 peer would silently ignore both:
// it would never render a bought gatherer, and its own buy would be dropped by the host's allowlist —
// so the two seats would disagree about what a player owns and about their spent score. Hard-rejected
// at HELLO, same lockstep as the S103 defender bump.
// S138 P2 — bumped 16->17: the KEEP RING MOVED. `castleAnchor` (gatherers/gatherer.ts) now reads
// `KEEP_RING_RADIUS = 420` instead of `SPAWNER_RADIUS + 150` (275), on the owner's playtest ruling
// that castles belong at the extremities. This is NOT a new field or literal — it is a SHARED
// CONSTANT BOTH PEERS COMPUTE FROM: the client calls `castleAnchor` to draw every keep box, to
// hit-test keep clicks (which is what opens the castle panel), and to derive porch slot positions.
// A stale v16 peer would therefore draw all seven keeps on the old 275 ring, mis-hit-test them, and
// disagree with the host about where a castle physically IS — so it is hard-rejected at HELLO, the
// same posture as any wire-incompatible change.
//
// ⚠ NOTE (S138): S138 P1's damage substrate (`Primitive.hp` + a real per-kind defender hp) did NOT
// need the 16->17 bump and did not get one on its own — `hp` is additive-optional and emitted only
// when damaged, so an undamaged board is byte-identical to v16 (the protocol.ts:152 precedent:
// re-adding creature hp/chewProgress/targetBondId to the wire did not bump either). That bump was
// spent on the keep-ring move.
// S139 P2 — bumped 17->18: THE GOBLIN. Two independent reasons, either of which alone would force it.
//   (1) A NEW SERIALIZED `CreatureType` LITERAL, 'goblinMelee'. `deserializeCreature` writes
//       `type: s.type` with NO runtime whitelist and there is no CreatureType validator anywhere in
//       src/net/, so a stale v17 peer would accept the unknown string and then read
//       `getCreatureConfig('goblinMelee')` as undefined on its own mirror. This is exactly the class
//       that bumped 13->14 for 'lightningDrone'.
//   (2) A NEW SERIALIZED `Creature` FIELD, `targetPrimitiveId`. Additive-optional (emitted only when
//       non-null), so an idle board stays byte-identical — but it is HASHED, so a v17 peer that
//       cannot see it would disagree with the host's `hashWorldStateFull` the moment any goblin
//       commits to a shape.
//   Also newly shared-constant-bearing: every seat is GRANTED a goblin at START_GAME, and the joiner
//   dispatches its own local START_GAME — so both peers must mint the same unit at the same position
//   from the same tick. Hard-rejected at HELLO, same lockstep posture as every bump above.
// S140 P1 — bumped 18->19: THE CASTLE BANK CAP MOVED (5 -> 7) and the LASER TURRET RECIPE SHRANK
// (1 Line deg-7 + 7 Spirals -> deg-6 + 6 Spirals). Neither is a new field, a new literal or a new
// intent — `castleBanks` is an unbounded serialized array and the recipe gate is host-only — so on the
// narrow wire test this needed no bump. It gets one under the SAME precedent as the 16->17 keep-ring
// move: a SHARED CONSTANT BOTH PEERS COMPUTE FROM.
//   (1) THE CAP. `castlePanel` builds exactly CASTLE_BANK_CAP clickable slot boxes ONCE at
//       construction and `applyNetSnapshot` rehydrates the bank with NO clamp, so a stale v18 peer
//       (cap 5) handed a 7-entry bank stores and hashes all seven, renders five, and can NEVER pull
//       indices 5-6 — a permanent reachability soft-lock on its own shapes, while its title text
//       reads "CASTLE BANK 7/5". Silent: there is no host-vs-client hash check at runtime.
//   (2) THE RECIPE. A stale peer's codex would still instruct SEVEN spirals against a host gating on
//       six, and the gate has no upper tolerance — so following the stale copy builds a turret the
//       host tears down 0.5 s later.
// Hard-rejected at HELLO, same lockstep posture as every bump above.
// S141 — bumped 19->20: THE STINK TOWER + THE GATHERER ORDER QUEUE. Four independent reasons, any
// ONE of which alone would force it.
//   (1) A NEW SERIALIZED `DefenderKind` LITERAL, 'stinkTower'. `kind` is serialized NON-OPTIONAL and
//       `deserializeDefender` writes it with no runtime whitelist, so a stale v19 peer would accept
//       the unknown string and then read `getDefenderConfig('stinkTower')` as undefined — a bare
//       Record index with no default — and THROW on the first field read inside makeDefender. This
//       is precisely the class that bumped 12->13 for the 'WALK' state literal.
//   (2) A NEW SERIALIZED `GodlyId` LITERAL in `recipeId`, same shape, same receive path.
//   (3) TWO NEW CLIENT INTENTS (ENQUEUE_/CANCEL_GATHERER_ORDER). A v19 host has neither row in its
//       CLIENT_INTENT allowlist, so a v20 joiner's orders would be silently dropped while the host
//       seat's own worked — seat asymmetry, which is the worst kind because it looks like lag.
//   (4) A NEW HASHED WORLD FIELD, `gathererOrders`. Additive-optional on the wire, so an idle board
//       stays byte-identical — but it IS hashed, so a v19 peer that cannot see it would disagree with
//       the host's `hashWorldStateFull` the moment anything is queued. `Defender.bagsRemaining` is the
//       same shape (additive-optional-when-nonzero, hashed).
// Hard-rejected at HELLO, same lockstep posture as every bump above.
// S144 P1 — bumped 20->21: CLICK-TO-BUILD. Backfilled in S150 — MISSING from this block while the
// HelloMsg list below had carried it since S144, the same omission as 8→9 above. One carrier, and it
// is sufficient: the new `BUILD_BLUEPRINT` client intent, which a v20 peer rejects outright at
// `parseNetMessage`. That seat could then never build from the panel while the other seat could, and
// the two worlds diverge on primitives, bonds AND defenders. Note the blueprint GEOMETRY needs no
// wire representation at all: the reducer stamps ordinary primitives and bonds that already
// serialize, and the carried-blueprint arming state is render-local by design.
// S146 P2 — bumped 21->22: THE CASTLE INVENTORY BECAME A LIMITLESS PER-TYPE TALLY. Three independent
// reasons, any ONE of which alone would force it.
//   (1) THE SNAPSHOT FIELD CHANGED SHAPE. `castleBanks` went from
//       `Array<{seat, shapes: SerializedSpark[]}>` to `Array<{seat, counts: number[]}>`. A v21 peer
//       reads `entry.shapes` and finds it absent, so it renders and HASHES an empty castle while the
//       host holds a full one — a silent, permanent divergence on a field that IS hashed.
//   (2) A CLIENT INTENT CHANGED ITS PAYLOAD. `PULL_FROM_BANK` is type-addressed (`sparkType`) rather
//       than index-addressed (`index`). A v21 joiner would send `{index: 0}`, which a v22 host reads
//       as `sparkType: undefined` — the pull silently no-ops on the joiner seat only, while the host
//       seat's works. Seat asymmetry, the worst kind, because it reads as lag.
//   (3) A SHARED CONSTANT BOTH PEERS COMPUTE FROM WAS DELETED. `CASTLE_BANK_CAP` is gone. A v21 peer
//       still gates deposits at 7 and still lays out exactly 7 clickable slot boxes, so it could
//       neither see nor reach anything past the seventh shape — the same reachability soft-lock class
//       as the 18->19 cap move, which is the precedent this follows.
// Hard-rejected at HELLO, same lockstep posture as every bump above.
// S147 P1 — bumped 22->23: THE MATCH CLOCK. The tower-defence pivot's two-phase heartbeat lands as
// TWO new HASHED, wire-carried World fields — `matchPhase: 'BUILD' | 'FIGHT'` and
// `phaseEndsAtTick: number` — and they are load-bearing for behaviour, not decoration:
//   (1) THE PHASE GATES SCORING. `tickScoring` now runs only in FIGHT (R3: "points accrue during the
//       FIGHT stage ONLY"). A v22 peer has no `matchPhase` at all, so it would accrue complexity
//       income every tick of the build stage while a v23 host accrues none. `scoreByPlayer` and
//       `scoreProgress` are both hashed, so that is an immediate, permanent divergence — and it is
//       the worst-flavoured kind, because it silently decides who WINS at 1500 points.
//   (2) THE DEADLINE IS HOST-AUTHORITATIVE AND MUST BE AGREED. Two peers that agree on the phase but
//       disagree on `phaseEndsAtTick` diverge one tick later at the flip. A v22 joiner cannot read
//       the field, so it can never agree about when the phase ends.
//   (3) A SERIALIZED STRING-LITERAL UNION ENTERED THE WIRE. `MatchPhase` is exactly the class of
//       change that forced 12->13 when `DefenderState` gained 'WALK': a stale peer cannot parse a
//       literal it has never heard of.
// Also in this bump, and NOT a wire change on its own — recorded because the pair must ship together:
// Step 0 switched the four cut hazards off (R14/R23) at their dispatch sites behind
// HAZARD_SPAWN_ENABLED, deliberately leaving every spawner RNG stream byte-identical.
// Hard-rejected at HELLO, same lockstep posture as every bump above.
// S147 P2 - bumped 23->24: THE GAME IS CAPPED AT FOUR PLAYERS (owner R41). This is a WIRE change,
// not a UI preference, because MAX_PLAYERS is what the wire VALIDATORS cap on:
//   (1) `validateRoster` rejects any roster longer than MAX_PLAYERS, and `parseHostAttest` rejects an
//       attestation carrying more than MAX_PLAYERS seats. A v23 host legitimately offers a 5- or
//       6-seat roster; a v24 peer now refuses it outright. Left unbumped, the joiner would drop the
//       lobby broadcast and sit at an empty seat rack with no error - the worst kind of failure,
//       because it looks like a network problem rather than a version problem.
//   (2) `MAX_BOTS` follows to 3 (one human + three bots fills the match), and the lobby seat rack
//       goes 2x3 -> 2x2, so the two peers no longer even agree on how many seats exist to draw.
// The 7th bots-only "Silver" seat colour is retired with it; PLAYER_COLORS deliberately STAYS at six
// entries because it is a RACE/CLASS roster the player will pick from in the pre-game lobby (R45), not
// a seat-count proxy - so palette length must never be used as a player cap again.
// Hard-rejected at HELLO, same lockstep posture as every bump above.
// S148 P1 — bumped 24->25: THE ZONE PARTITION. The polar keep ring is replaced by a real partition
// of the board, and ONE new HASHED, wire-carried World field carries it: `layout: 'PITCH_2P' |
// 'QUADRANTS_4P'`. Three independent reasons a mixed pair cannot be allowed to run:
//   (1) EVERY CASTLE MOVES. `castleAnchor` no longer fans seats around a 420px ring; it is a lookup
//       into the zone table (goalmouths at (120,540)/(1800,540), corners at (130,130) and friends).
//       protocol.ts has recorded since 16->17 that `castleAnchor` is A SHARED CONSTANT BOTH PEERS
//       COMPUTE FROM - the client calls it to draw and hit-test every keep - and a bought gatherer's
//       spawn position is derived from it and HASHED. A v24 peer would put every keep, every porch
//       slot and every hauler spawn somewhere else.
//   (2) THE BORDERS BECOME REAL. `canBuildAt` refuses a placement outside your own zone. A v24 peer
//       has no `layout`, so it cannot even ask the question - it would enforce the old
//       territorial-influence rule while a v25 host enforces zones, and the two disagree about
//       whether a given placement is legal.
//   (3) THE FIELD IS A STRING LITERAL UNION. A stale peer cannot parse a `layout` value it has never
//       heard of - the same class of change that forced 12->13 for the 'WALK' DefenderState.
//
// S149 P2 — bumped 25->26: THE PHASE SPLIT IS ENFORCED. `GathererState` gains the wire literal
// 'SHELTERED': at `phaseEndsAtTick - 60` every gatherer unconditionally leaves the field and
// auto-deposits its cargo (owner Q2 — a deterministic, speed-independent snap rather than a race
// between pathfinding and the clock). It is a UNION WIDENING on a field that is already serialized
// at full fidelity, not a new World family, which is why this costs one literal and not ten sites.
// A v25 peer cannot parse a state it has never heard of, and would additionally keep hauling through
// a window in which a v26 host has already banked everything - so the two disagree about both unit
// positions and banked totals within a single build stage.
//
// S152 SPEC — bumped 26->27: FIX + SCRAP. ⚠ SHIPPED IN **SESSION S149** (commit `s149-p6`), not in a
// session numbered 152. Thirteen source files label this work `S152` because they cite the ROADMAP
// SPEC id in `SPARK_TD_SESSION_SPECS.md` (§S152 "FIX + SCRAP (R13/R19/R21)"), which the owner's plan
// ordered ahead of where it actually landed. The labels are deliberately left alone — they are the
// feature's traceable spec name — but the mapping is stated HERE so nobody reconstructs a session
// that never happened. Two reasons force the bump, either alone sufficient:
//   (1) TWO NEW CLIENT INTENTS, `REPAIR_STRUCTURE` and `SCRAP_STRUCTURE`, which a v26 peer rejects
//       outright at `parseNetMessage`. A seat that cannot repair while the other can diverges on
//       primitives, bonds and defenders inside one build stage.
//   (2) A NEW HASHED, WIRE-CARRIED FIELD ON `Primitive`: `origin` (blueprint provenance). This is the
//       SHARPER reason precisely because it is ADDITIVE-OPTIONAL — a v26 peer would silently ACCEPT
//       the snapshot and DROP the field, and every tower it restored would then read as freeform
//       rubble that FIX refuses. A field a stale peer can drop without erroring is more dangerous
//       than one it cannot parse at all.
// S150 R71 — bumped 27->28: THE VOLTKIN GOT TOUGHER (2 hp -> 8). A one-constant change, and it
// forces a bump for the subtlest reason on this whole list: `serializeCreature` emits a creature's
// `hp` ONLY WHEN IT IS DAMAGED (`hp < config.hp`). An UNDAMAGED creature therefore carries no hp on
// the wire at all, and the receiving peer reconstructs it from its OWN `CREATURE_CONFIGS` — i.e.
// from its own compiled `VOLTKIN_HP`. So a v27 peer watching a v28 host's freshly-summoned Voltkin
// would hand it 2 hp locally while the host holds 8, and the two would disagree about the exact hit
// that kills it — and therefore about `world.creatures`, the lightning-cloud that follows, and every
// hash downstream of both.
//
// ⚠ THE GENERAL RULE THIS IS THE THIRD INSTANCE OF: an ADDITIVE-OPTIONAL wire field whose absence
// means "use your own default" turns that default into A SHARED CONSTANT BOTH PEERS COMPUTE FROM.
// `KEEP_RING_RADIUS` forced 16->17 and `CASTLE_BANK_CAP` forced 18->19 for the identical reason.
// Omitting a field to save bytes does not make its value private.
//
// Owner ruling R71, from the measured table: at 2 hp a Voltkin died to ONE of HELGA's slaps (damage
// 3) while a plain goblin (6 hp) took two, so the godly unit was strictly weaker than the grunt.
// 8 restores the ladder chewer(1) < goblin(6) < voltkin(8).
// S151 P2 — bumped 28->29: THE STAT SYSTEM (owner R72/R74/R75/R76). The widest wire change since
// the defender family landed, and it is FOUR distinct breaks at once, any ONE of which would force
// a bump on its own:
//   (a) `Creature.hp` -> `Creature.ehp`, AND ITS UNIT CHANGED. It now holds EFFECTIVE hit points in
//       FIFTHS (`hp x (5 + def)`), so a v28 peer reading the old key would find nothing and a peer
//       reading the number raw would see 40 where the host means 8. The RENAME is deliberate: same
//       name + same type + different unit is a silent forty-fold buff, whereas a missing key is a
//       loud one. Both Council seats flagged this independently.
//   (b) `Defender.hp` REMOVED from the wire entirely (owner R75: "towers have attack and piercing
//       but not def and hp because they are based on the connectors that build them"). A REQUIRED
//       field leaving is a hard parse break for a stale peer.
//   (c) `Bond.damageFifths` ADDED and hashed — connectors now carry the durability towers lost.
//       Additive-optional (absent => 0), so this one is the mildest of the four; it is listed
//       because it changes what `hashWorldStateFull` covers.
//   (d) THE THIRD INSTANCE OF THE SHARED-CONSTANT RULE BELOW, AGAIN. `serializeCreature` still emits
//       `ehp` only when damaged, so `CreatureConfig.hp`/`.def` remain values both peers compute
//       from — and S151 moved one of them: GOBLIN_MELEE_HP 6 -> 1 (owner R70, "he should be as weak
//       as chewer"). That edit alone would have forced a bump exactly as VOLTKIN_HP 2->8 did.
//
// ⚠ THE GOBLIN EDIT WAS BLOCKED FOR A SESSION BY THE DEFECT R72 NAMED. HELGA's slap damage and the
// laser's beam damage were both DERIVED from GOBLIN_MELEE_HP, so S150 correctly refused to touch it
// in isolation. S151 deletes those derivations (PRINCESS_SLAP_ATK / TURRET_BEAM_ATK are now stated
// on the shared ladder at the same 3 and 6 they always were), which is what finally unblocked it.
// S151 P3 — bumped 29->30: THE GOBLIN TOWER (owner R70). One tower, six outputs — feed it a shape
// and it makes the goblin that shape maps to. THREE distinct wire breaks:
//   (a) FIVE NEW `CreatureType` LITERALS (goblinArcher/Shield/Hound/Bat/Suicide). `serializeCreature`
//       emits `type` unconditionally and `getCreatureConfig` is a bare Record index with NO
//       unknown-value guard, so a v29 peer receiving one of these does not degrade — it reads
//       `undefined` and throws on the first field access. Same class as 'lightningDrone' at 13->14.
//   (b) A NEW `GodlyId` LITERAL, 'goblinTower', which rides the wire on `Spawner.recipeId`. A stale
//       peer holds a spawner whose recipe it cannot resolve.
//   (c) A NEW CLIENT INTENT, `FEED_TOWER`, absent from a v29 host's allowlist — so a v30 joiner's
//       feed would be SILENTLY DROPPED rather than refused, which is the failure mode the intent
//       allowlist comment warns about explicitly.
//
// ⚠ AND THIS BUMP WAS AVOIDABLE — RECORDED SO THE MISTAKE IS NOT REPEATED. The S151 PDR planned
// P2 and P3 to SHARE the 28->29 bump, which was correct: they are one feature. But P2 was committed
// and DEPLOYED before P3 began, so v29 went live WITHOUT the goblin types. Adding them under the
// same version number would have put two different wire surfaces both calling themselves v29 —
// exactly the desync a version exists to prevent. The lesson is about SEQUENCING, not design: do
// not deploy the first half of a two-part wire change.
//
// S152 P1 — bumped 30->31: RAID (owner R78). A right-click is now a 2-ATK hit on the shared fifths
// ladder, against units AND connectors, paid with a new raid-point currency. TWO wire breaks:
//   (a) THE `RAID_CREATURE` CLIENT INTENT IS RENAMED `RAID_TARGET`, and its payload reshaped from a
//       bare `creatureId` to a discriminated `{ kind: 'creature' | 'bond', id }`. A v30 host has no
//       `RAID_TARGET` entry in its allowlist, so a v31 joiner's raid would be SILENTLY DROPPED —
//       the same failure mode the allowlist comment warns about, and the same class as FEED_TOWER
//       at 29->30. The rename is not cosmetic: `RAID_CREATURE` became false the moment a raid could
//       hit a bond, and a wire-visible action type that misdescribes itself is how the next author
//       plans around a mechanism that does not exist (the `DefenderDeathCause` lesson).
//   (b) A NEW SERIALIZED EFFECT KIND, `RAIDED`, and this is the sharper edge. Every previous effect
//       change was a new OPTIONAL FIELD on an existing kind (`creatureId?` at S33, `actor?`/`victim?`
//       at S131) and correctly took NO bump, because a stale peer just ignores an unknown field. A
//       new KIND is a different animal: `deserializeEffect` is an exhaustive switch with NO default
//       arm, so a v30 peer handed `kind: 'RAIDED'` falls off the end, returns `undefined`, and
//       pushes that into `world.effects` for the renderer to dereference. It MUST be serialized —
//       unlike SEVER_ERASE it exists to tell the VICTIM who hit them, and the victim is on another
//       peer by definition, so a host-local cloud would be invisible to its only audience.
//
// `raidPoints`/`raidProgress` on `SerializedPlayer` also ride this bump, but they are emitted only
// when non-zero and rehydrate `?? 0`, so on their own they would NOT have needed one.
// S154 P2 — bumped 31->32: THE BAT RIDER GETS A REAL REACH (owner R92). One constant, and it forces
// a bump for the same reason VOLTKIN_HP forced 27->28: `GOBLIN_BAT_CONFIG.attackRange` goes from
// GOBLIN_ATTACK_RANGE (35, the melee constant) to GOBLIN_BAT_RANGE (150), and `attackRange` is never
// serialized at all — so it is A SHARED CONSTANT BOTH PEERS COMPUTE FROM, in the exact sense this
// file's general rule describes.
//
// Where the two peers use it: `render/creatureProjectile.ts` resolves the in-flight projectile on
// BOTH host and client, independently, from synced state — that is its whole design (the arrow is
// derived every frame rather than pushed as an effect, because a one-shot effect push is lost ~5/6
// of the time at 10 Hz). It re-derives the victim with `config.attackRange * config.attackRange`. A
// v31 client watching a v32 host's bat rider would search a 35 px radius while the host is shooting
// something 150 px away, find nothing, and draw NO harpoon at all — the stale peer would see the
// unit swinging at empty air, which is precisely the symptom the owner reported and this priority
// fixes. Not a hash divergence (creatures are simulated host-only), but a silent, invisible-to-tests
// disagreement about what the player sees.
//
// The rest of P2 needs no bump on its own and is recorded for completeness: `holdsRange` +
// `standoffTargetPos` + the narrowed Δ4 steering gate are all HOST-ONLY sim, and gating ARC_FLASH to
// the Voltkin only removes effects a stale peer would simply not receive.
// S157 B8 — bumped 33->34: THE WAVE COUNTER. `WorldSnapshot.waveNumber` (additive-optional, omitted
// while 1). A v33 peer has no wave field, restores to wave 1, and therefore computes a DIFFERENT
// quarry spawn rate from the host — divergent shape counts and a divergent state hash, which the
// version gate refuses rather than lets limp.
// S154 AMENDMENT C — bumped 32->33: THE CASTLE HAS HIT POINTS (owner A4 / R89). One new
// ADDITIVE-OPTIONAL field on `SerializedPlayer`, `castleHp`, and it forces a bump for the third
// instance of the rule this file already records twice:
//
//   `castleHp` is emitted ONLY WHEN DAMAGED (`< CASTLE_MAX_HP`), so an undamaged board stays
//   byte-identical to a v32 snapshot. But "absent means use your own default" turns CASTLE_MAX_HP
//   into A SHARED CONSTANT BOTH PEERS COMPUTE FROM — exactly the reason VOLTKIN_HP forced 27->28,
//   KEEP_RING_RADIUS forced 16->17 and CASTLE_BANK_CAP forced 18->19. A v32 peer would rehydrate a
//   castle it has no field for at whatever ITS build calls full health, and the two would disagree
//   about the hit that ENDS THE MATCH — the most consequential thing they could disagree about.
//
// It is also a NEW VICTORY CONDITION, which is the sharper half: `tickGameState` can now end a match
// on `castleHp <= 0` before the score gate. A stale peer that never sees the field would keep playing
// a match the host has already ended.
/*
 * ⭐ S157 B8 — BUMPED 33 → 34: `WorldSnapshot.waveNumber`.
 *
 * A v33 peer has no wave field, so it would restore to wave 1 and compute a DIFFERENT quarry spawn
 * rate from the host — the shapes on its screen would arrive at the wrong cadence and its state hash
 * would diverge. That is exactly what the version gate exists to refuse rather than let limp.
 *
 * The field is additive-optional and omitted while the value is 1, so an opening snapshot is
 * byte-identical to v33 and a pre-S157 save restores cleanly to wave 1.
 */
// S158 P6 — bumped 34->35: THE LANDED STINK BAG. `WorldSnapshot.stinkClouds` (additive-optional,
// omitted while the map is empty) turns a thrown bag from an instantaneous splash into a real
// serialized hazard that keeps dealing radial damage on the shared DoT beat until it expires.
/*
 * ⭐ S158 P6 (CF-S157-b) — BUMPED 34 → 35: `WorldSnapshot.stinkClouds`.
 *
 * A LANDED stink bag is now a real serialized entity rather than an instantaneous splash — owner:
 * a thrown bag should *land and stink over time*. Each cloud applies radial damage on the shared DoT
 * beat until it expires, so it is sim state, not decoration.
 *
 * ⛔ WHY THIS EARNS A BUMP EVEN THOUGH THE FIELD IS ADDITIVE-OPTIONAL. A v34 peer would restore a
 * snapshot with NO clouds and then watch its own units take damage from clean ground it cannot draw,
 * while its state hash diverges from the host's on every cloud that exists. That is the same class as
 * the wave counter above: the absence of the field means a DIFFERENT world, not a missing decoration.
 *
 * The field is omitted while the map is empty, so a match with no stink tower produces snapshots
 * byte-identical to v34 and every pre-S158 save restores cleanly with no clouds.
 */
// S158 P7 — bumped 35->36: HELGA CAN BE KILLED. `SerializedDefender.ehp` (additive-optional,
// emitted only for a UNIT-class defender) restores the per-defender pool that S151 P2 removed under
// a reading of R75 that R77 later corrected — R75 is about TOWERS, and Helga is a spawned unit.
/*
 * ⭐ S158 P7 (CF-S157-c) — BUMPED 35 → 36: `SerializedDefender.ehp`.
 *
 * Owner: Helga holds the field *"until she is destroyed herself"*. Nothing could destroy her,
 * because the defender damage substrate was deleted wholesale at S151 P2.
 *
 * ⛔ WHY IT EARNS A BUMP THOUGH THE FIELD IS ADDITIVE-OPTIONAL. A v35 peer has no `ehp`, so it
 * rehydrates a defender through `makeDefender` and gets the FULL pool from config — it would show a
 * Helga at full strength while the host has her one hit from death, and its state hash would diverge
 * for as long as she is damaged. Same class as every bump this list records: the absence of the field
 * means a DIFFERENT value, not a missing one.
 *
 * Towers are unaffected in every direction: they carry `ehp: null`, the emit skips null, and the read
 * rehydrates null — so a match without a princess produces snapshots byte-identical to v35.
 */
// S158 A3 — bumped 36->37: A RAID HITS ANYTHING. `RAID_TARGET.target` gains the discriminant
// `defender`, so a right-click can spend a raid point on HELGA — which the R78 kill table has
// published as *"HELGA(54, needs 6)"* since S152 without any way to aim it.
/*
 * ⭐ S158 A3 (owner) — BUMPED 36 → 37: `RAID_TARGET.target.kind` gains `'defender'`.
 *
 * Owner: *"a raid should hit anything, it holds a certain attack strenght and stats of its own —
 * again ive already explained it when we worked the unit and tower stats."*
 *
 * ⛔ WHY A NEW DISCRIMINANT VALUE EARNS A BUMP, when a new optional field would not. `RAID_TARGET`
 * is a CLIENT INTENT. A v36 host receiving `kind:'defender'` passes the allowlist — the action TYPE
 * is unchanged — and then falls through its own switch to the connector arm, where
 * `world.bonds.get(<a DefenderId>)` is undefined and the reducer silently returns. The raid
 * vanishes: no damage, no point spent, no error, and the two peers disagree about what happened.
 * A silent divergence on an intent is precisely the failure this file's own notes call the more
 * dangerous half, which is why the payload RESHAPE at 30→31 took a bump for the same reason.
 */
// S158 A2 — bumped 37->38: A LANDED STINK BAG IS DESTRUCTIBLE. `SerializedStinkCloud.ehp` is a
// REQUIRED new field: a bag that has been hit must arrive damaged, not whole.
/*
 * ⭐ S158 A2 (owner R77) — BUMPED 37 → 38: `SerializedStinkCloud.ehp`.
 *
 * R77's deferred list: *"destructible stink bags as entities with aggro and on-destroy damage"*.
 * S158 P6 shipped the entity passive; it now carries a pool and BURSTS when killed.
 *
 * ⛔ REQUIRED, NOT ADDITIVE-OPTIONAL, AND THAT IS THE POINT. A v37 peer has no field, so it would
 * rehydrate every bag at FULL pool — a bag one hit from popping would show as untouched, and the two
 * sides would disagree about whether the ground is about to explode. Making it optional with a
 * default would ship exactly that bug on our own side too: `deserializeStinkCloud` reads it straight
 * rather than defaulting, for the same reason S152 P1 records for raid points.
 */
// W1-A (S160) — bumped 38->39: THE SEAT'S RACE REACHES EVERY PEER. `RosterEntry.raceId` and
// `SerializedPlayer.raceId`, both additive-optional in shape — and bumped BECAUSE they are.
/*
 * ⭐ W1-A (S160) — BUMPED 38 → 39: `RosterEntry.raceId` + `SerializedPlayer.raceId`.
 *
 * Six races, one per player colour (`SPARK_RACES_SPEC.md` §2, owner-ruled R93–R126). `raceId` is the
 * one identity token: it selects the castle art, the unit the castle emits and the race tower a seat
 * may build, and `Player.color` is derived from it AT CONSTRUCTION.
 *
 * ⛔ ADDITIVE-OPTIONAL AND IT STILL BUMPS — the S150 rule, and this is its cleanest instance:
 * *"a field a stale peer can silently DROP is more dangerous than one it cannot parse."* A v38 joiner
 * parses the roster fine, drops the unknown key, falls back to its own `defaultRaceForSeat`, and then
 * paints every castle a different colour from the host FOR THE WHOLE MATCH — no error, no desync
 * report, nothing red on either side, because colour is not hashed. The `Primitive.origin` 26→27
 * class. Refusing the peer at HELLO is the safe failure.
 *
 * ⚠ Deliberately NOT in this bump: `CLAIM_RACE`. The lobby has no client-intent path before Begin
 * (`hostSync` is null, `hostSeats` is empty and drops intents fail-closed, and `world.players` holds
 * only seat 0), so the claim message has to follow the `LOBBY_READY` precedent as a top-level
 * `NetMessage` kind.
 *
 * ⛔ S161 P6 CORRECTION — THE SENTENCE THAT USED TO END THIS PARAGRAPH SAID IT *"will carry its own
 * bump"*, AND IT SHIPPED WITHOUT ONE. The prediction reasoned by analogy to `LOBBY_READY`; the
 * analogy is wrong, because `LOBBY_READY` bumped for GATING THE MATCH (auto-Begin), not for being a
 * new lobby kind. `CLAIM_RACE` is client→host only, gates nothing, and its ANSWER rides
 * `RosterEntry.color`/`.raceId`, which this very bump put on the wire — so a peer one build behind
 * reads the resolved roster and agrees with the host. Full argument at `ClaimRaceMsg` below.
 */
// S161 P2 — bumped 39->40: SEAT ELIMINATION. The match no longer ends on the first castle to fall.
/*
 * ⭐ S161 P2 — BUMPED 39 → 40: **LAST ONE STANDING** (owner R127).
 *
 * > *"when a castle is destroyed a player cant gather anymore primitives so yes he is out! but he
 * > should stay as spectator until there is one player left!"*
 *
 * ⛔ THE BUMP IS FOR THE RULE, NOT FOR THE FIELD, and that is what makes it unusual on this list.
 * `SerializedPlayer.eliminatedAtTick` is additive-optional and carries only the ELIMINATION ORDER
 * (R10/R20's placings); on its own it would be a `raidProgress`-class field and would not have
 * earned a bump. What earns it is `tickGameState`: a v39 peer ends the match the instant ANY castle
 * reaches zero, while a v40 host plays on with two seats still alive. Both peers run that function
 * (`main.ts:2132`), so the two would sit in different `gameState`s for the rest of the match — one
 * showing a winner, one still playing.
 *
 * ⚠ THAT IS THE `castleHp` PRECEDENT WITH THE SIGN REVERSED. 32→33 was bumped because *"a stale
 * peer would keep playing a match the host has already ended"*; this is a stale peer ENDING a match
 * the host is still running. Same divergence, opposite direction, same answer — refuse at HELLO.
 *
 * ⚠ Still deliberately NOT in this bump: `CLAIM_RACE`, for the reason given above.
 */
// S164 P1 — bumped 40->41: CASTLE REGEN UPGRADE. A new CLIENT INTENT, which a v40 host drops silently.
/*
 * ⭐ S164 P1 — BUMPED 40 → 41: **THE CASTLE REGENERATES, IF YOU BOUGHT IT** (owner R128–R131).
 *
 * > *"spend victory points on castle upgrades (same as gatherer upgrades). 100vp on hp
 * > regeneration. upgrade lv 1 = +1% hp reg, lv 2 = 1.2%, lv 3 1.4%, lv 4 1.6%"*
 *
 * ⛔ THE BUMP IS FOR THE INTENT, NOT THE FIELD, which is the `castleHp` shape rather than the S161
 * one. `SerializedPlayer.castleRegenLevel` is additive-optional and emitted only when non-zero, so
 * an un-upgraded board stays byte-identical to a v40 snapshot — on its own it would not have earned
 * a bump. What earns it is `UPGRADE_CASTLE_REGEN` being a CLIENT INTENT: a v40 host has no row for
 * it in `CLIENT_INTENT_TYPES_RECORD`, so `isClientIntentAllowed` drops a v41 joiner's purchase
 * SILENTLY while the host seat's own upgrade works. That is seat asymmetry, which this file already
 * calls the worst kind *"because it looks like lag"* — the joiner spends nothing, receives nothing,
 * and is told nothing.
 *
 * ⚠ The unbroken precedent: `REPAIR_STRUCTURE`/`SCRAP_STRUCTURE` (26→27), `FEED_TOWER` (29→30),
 * `RAID_TARGET` (30→31) and `ENQUEUE_`/`CANCEL_GATHERER_ORDER` (19→20) each bumped for exactly this.
 */
export const PROTOCOL_VERSION = 41 as const;

/**
 * S82 P4(a) — host attestation: {public key, signature} binding the ROOM CODE (which is
 * a 30-bit fingerprint of that key — see net/hostIdentity.ts) to the host's transport
 * peerId. ADDITIVE-OPTIONAL on HELLO + START_GAME_SIGNAL (no PROTOCOL_VERSION bump —
 * lockstep-deploy procedure; a stale peer ignores unknown keys). The client latches the
 * host ONLY after verifying it — the S79 P4 TOFU first-message race is dead.
 */
export interface HostAttest {
  readonly spkiB64: string;
  readonly sigB64: string;
}

/** Fail-closed shape check for an OPTIONAL hostAttest field (malformed ⇒ reject message). */
function isValidHostAttest(v: unknown): v is HostAttest {
  if (v === null || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  return typeof a.spkiB64 === 'string' && typeof a.sigB64 === 'string';
}

/**
 * S118 P1 (host-migration D2) — fail-closed SHAPE check for an OPTIONAL START_GAME_SIGNAL.warrant.
 * Validates {epoch:number, seats:[{seat:number, spkiB64:string}] (≤ MAX_PLAYERS), sigB64:string}. This
 * is a WIRE-shape gate only — cryptographic verifyWarrant (chaining to the room code) runs later, in
 * the client handler. A malformed warrant nulls the whole message (never hand a junk shape downstream);
 * an ABSENT warrant is fine (legacy/mixed-build Begin). Bounds seat-list work against a flooding peer.
 */
function isValidWarrant(v: unknown): v is SuccessionWarrant {
  if (v === null || typeof v !== 'object') return false;
  const w = v as Record<string, unknown>;
  if (typeof w.epoch !== 'number' || typeof w.sigB64 !== 'string') return false;
  if (!Array.isArray(w.seats) || w.seats.length > MAX_PLAYERS) return false;
  for (const s of w.seats) {
    if (s === null || typeof s !== 'object') return false;
    const seat = s as Record<string, unknown>;
    if (typeof seat.seat !== 'number' || typeof seat.spkiB64 !== 'string') return false;
  }
  return true;
}

export interface HelloMsg {
  readonly kind: 'HELLO';
  readonly playerId: PlayerId;
  readonly color: number;
  /** Protocol version — bumped on wire-incompatible changes. S77 P3: 6→7 (seagull); S87 P4: 7→8 (LOBBY_READY quickmatch gate); S93: 8→9 (NONET SUDOKU_SOLVED intent + sudoku snapshot field); S100 P1: 9→10 (TD spawner lifecycle + creatureSpawners snapshot field); S102 #1: 10→11 (RAID_CREATURE intent + creature hp); S103 P2: 11→12 (generic defender lifecycle + defenders snapshot field); S110 P4: 12→13 (HELGA walk: serialized 'WALK' state + prevPos/walkTargetPos on defenders[]); S113 Batch C: 13→14 (lightning-drone building: new CreatureType 'lightningDrone' + recipeId 'lightningHub'); S124 P1: 14→15 (host-migration D4 production-ON — MIGRATION_CLAIM live, epoch ≥ 1 semantics). S133 P2 filled in that last entry, which had been missing while the literal below already read 15.
   * ⚠ S133: adding `hp`/`chewProgress`/`targetBondId` back onto the creature wire did NOT bump this —
   * all three were already additive-optional and `parseNetMessage` gates on schemaVersion only.
   * V6-1.1: 15→16 (gatherer economy — additive-optional `gatherers[]` snapshot field AND the new
   * BUY_GATHERER client intent; a stale v15 peer would neither render a bought gatherer nor have
   * its own purchase accepted, so the seats would disagree about units owned and points spent).
   * S138 P2: 16→17 (the keep ring moved to KEEP_RING_RADIUS = 420 — a SHARED CONSTANT both peers
   * compute from via castleAnchor, so a stale peer would draw and hit-test every keep in the wrong
   * place). Also covers S138 P1's additive-optional Primitive.hp, which needed no bump alone.
   * S139 P2: 17→18 (THE GOBLIN — a new serialized CreatureType literal 'goblinMelee' with no runtime
   * whitelist on the receive path, plus the hashed additive-optional Creature.targetPrimitiveId).
   * S140 P1: 18→19 (CASTLE_BANK_CAP 5→7 and the laser-turret recipe 8→7 shapes / hub degree 7→6 —
   * both SHARED CONSTANTS both peers compute from: a stale peer can never pull bank indices 5-6 and
   * its codex would instruct a seventh spiral the host's gate now rejects).
   * S141: 19→20 (THE STINK TOWER + THE GATHERER ORDER QUEUE — a new serialized DefenderKind literal
   * 'stinkTower' with no runtime whitelist on the receive path, a matching new GodlyId literal, TWO
   * new client intents, and the new HASHED world field `gathererOrders`. See the block above the
   * constant for why each one alone would force this).
   * S144 P1: 20->21 (CLICK-TO-BUILD — the new BUILD_BLUEPRINT client intent. A stale v20 peer would
   * reject the message outright, so its seat could never build from the panel while the other seat
   * could, and the two worlds would diverge on primitives, bonds and defenders. Note the blueprint
   * GEOMETRY itself needs no wire representation: the reducer stamps ordinary primitives and bonds
   * that already serialize, and the carried-blueprint arming state is render-local by design.)
   *
   * S146 P2: 21->22 (THE CASTLE INVENTORY BECAME A LIMITLESS PER-TYPE TALLY — `castleBanks` changed
   * snapshot SHAPE from per-seat spark arrays to per-seat type COUNTS, the `PULL_FROM_BANK` intent
   * became type-addressed rather than index-addressed, and the shared `CASTLE_BANK_CAP` constant was
   * deleted outright. Backfilled in S147 — see the warning below, which this entry is the third
   * instance of.)
   * S147 P1: 22->23 (THE MATCH CLOCK — two new hashed, wire-carried World fields, `matchPhase`
   * ('BUILD' | 'FIGHT', a serialized string-literal union a stale peer cannot parse) and
   * `phaseEndsAtTick`. The phase GATES scoring, so a v22 peer would earn build-stage income a v23
   * host does not and diverge on the hashed score that decides the win.)
   *
   * S147 P2: 23->24 (FOUR-PLAYER CAP - MAX_PLAYERS 6->4 and MAX_BOTS 6->3. The wire validators
   * `validateRoster` and `parseHostAttest` both cap on MAX_PLAYERS, so a v23 host's 5-6 seat roster is
   * refused by a v24 peer; and the lobby rack geometry changes 2x3 -> 2x2, so the peers disagree about
   * how many seats exist. PLAYER_COLORS stays at 6 on purpose - it is a race roster, not a cap.)
   *
   * S148 P1: 24->25 (THE ZONE PARTITION - one new hashed, wire-carried World field, `layout`. The
   * polar keep ring is gone and `castleAnchor` becomes a zone lookup, so a v24 peer would draw and
   * hit-test every keep in the wrong place and enforce the old territory rule instead of the new
   * zone borders. See the changelog above the const for the full three-part argument.)
   *
   * S149 P2: 25->26 (THE PHASE SPLIT IS ENFORCED - a new `GathererState` wire literal, 'SHELTERED'.
   * A v25 peer has never heard of it: `GathererState` is serialized at FULL FIDELITY on both the disk
   * save and the NetSnapshot, so a v25 joiner receiving a sheltered hauler would either fail to parse
   * it or fall through every branch of its own haul FSM and strand the unit. Exactly the class of
   * change as the 'WALK' DefenderState literal that forced 12->13. The behaviour riding with it is
   * equally divergent even setting the literal aside: from this version the quarry stops producing
   * during FIGHT, defenders do not tick outside FIGHT, and no placement is accepted outside BUILD -
   * so a v25 peer and a v26 peer would simulate visibly different games from the first phase edge.)
   *
   * S152 SPEC: 26->27 (FIX + SCRAP — shipped in SESSION S149, commit `s149-p6`; the `S152` label is
   * the ROADMAP SPEC id, not a session number. See the changelog above the const. TWO new client
   * intents, `REPAIR_STRUCTURE` and `SCRAP_STRUCTURE`, which a v26 peer rejects outright at
   * `parseNetMessage`; AND a new hashed, wire-carried field on `Primitive`, `origin`. The intents
   * alone would force this — a seat that cannot repair while the other can diverges on primitives,
   * bonds and defenders within one build stage — but `origin` is the sharper reason: it is
   * ADDITIVE-OPTIONAL on the wire, so a v26 peer would silently accept a snapshot and drop it, and
   * every tower it restored would read as freeform rubble that FIX refuses. A field a stale peer can
   * DROP without erroring is more dangerous than one it cannot parse.)
   *
   * S150 R71: 27->28 (THE VOLTKIN GOT TOUGHER — `VOLTKIN_HP` 2 -> 8. `serializeCreature` emits
   * creature `hp` only when DAMAGED, so an undamaged Voltkin crosses the wire with no hp at all and
   * the peer rebuilds it from its own compiled constant. That makes this a SHARED CONSTANT BOTH
   * PEERS COMPUTE FROM — the same class as KEEP_RING_RADIUS at 16->17 and CASTLE_BANK_CAP at 18->19
   * — so a v27 peer would give a fresh Voltkin 2 hp against the host's 8 and the two would disagree
   * about the hit that kills it.)
   *
   * S151 P2: 28->29 (THE STAT SYSTEM — owner R72/R74/R75/R76. FOUR breaks at once: `Creature.hp`
   * renamed to `ehp` AND re-scaled into fifths; `Defender.hp` REMOVED from the wire (a tower has no
   * hit points — its connectors do); `Bond.damageFifths` added + hashed; and GOBLIN_MELEE_HP 6->1,
   * which is the shared-constant rule below firing for the third time.)
   *
   * S151 P3: 29->30 (THE GOBLIN TOWER — five new CreatureType literals, the 'goblinTower' GodlyId
   * on `Spawner.recipeId`, and the FEED_TOWER client intent. Avoidable: P2 deployed before P3, so
   * the planned shared bump could not be shared.)
   *
   * S152 P1: 30->31 (RAID — owner R78. TWO breaks. (a) The `RAID_CREATURE` client intent is RENAMED
   * `RAID_TARGET` and its payload reshaped from a bare `creatureId` to a DISCRIMINATED
   * `{kind:'creature'|'bond', id}` — a v30 peer's allowlist has no `RAID_TARGET` entry, so it would
   * DROP the intent silently, which the note above marks as the more dangerous failure. (b) A NEW
   * SERIALIZED EFFECT KIND, `RAIDED` — and this is the sharper edge: `deserializeEffect` is an
   * exhaustive switch with NO default arm, so a v30 peer handed `kind:'RAIDED'` falls off the end,
   * returns `undefined`, and pushes it into `world.effects` for the renderer to trip over. Every
   * previous effect change was a new OPTIONAL FIELD on an existing kind (`creatureId?`, `actor?`,
   * `victim?`) and correctly took no bump; a new KIND is not that. Also `raidPoints`/`raidProgress`
   * on `SerializedPlayer`, which ARE additive-optional and would not on their own have needed one.)
   *
   * S154 P2: 31->32 (THE BAT RIDER'S REACH — owner R92. `GOBLIN_BAT_CONFIG.attackRange` 35 -> 150.
   * `attackRange` is NEVER serialized, so it is a shared constant both peers compute from — the
   * VOLTKIN_HP 27->28 class exactly. `render/creatureProjectile.ts` re-derives each shot's victim on
   * BOTH peers using `config.attackRange`, so a v31 client would search 35 px while a v32 host shoots
   * at 150 and would draw no harpoon at all.)
   *
   * S154 AMENDMENT C: 32->33 (THE CASTLE HAS HIT POINTS — owner A4 / R89. `castleHp` on
   * `SerializedPlayer`, additive-optional and emitted only when damaged, so its ABSENCE means "use
   * your own CASTLE_MAX_HP" — the shared-constant class that forced 16->17, 18->19 and 27->28. Plus a
   * NEW VICTORY CONDITION in tickGameState: a stale peer would keep playing a match the host has
   * already ended on a razed castle.)
   *
   * S157 B8: 33->34 (THE WAVE COUNTER — owner. `waveNumber` on `WorldSnapshot`, additive-optional and
   * omitted while it is 1, so an opening snapshot stays byte-identical to v33. It is NOT cosmetic:
   * the wave drives the quarry's spawn rate (`waveSpawnMultiplier`), so a v33 peer — which restores
   * to wave 1 — would compute a different number of shapes than the host and diverge on the state
   * hash. Same class as the shared-constant bumps above: the absence of the field means a DIFFERENT
   * value, not a missing one.)
   *
   * S158 P6: 34->35 (THE LANDED STINK BAG — CF-S157-b, owner. `stinkClouds` on `WorldSnapshot`,
   * additive-optional and omitted while empty, so a match without a stink tower is byte-identical
   * to v34. It is NOT cosmetic: a cloud deals radial damage on the shared DoT beat, so a v34 peer
   * would restore a world with none, be unable to draw the ground its units are dying on, and
   * diverge on the state hash for as long as any cloud lives.)
   *
   * S158 P7: 35->36 (HELGA IS KILLABLE — CF-S157-c, owner. `ehp` on `SerializedDefender`,
   * additive-optional and emitted only for a UNIT-class defender, so a match with no princess is
   * byte-identical to v35. It is NOT cosmetic: a v35 peer has no field, rehydrates her through the
   * factory at FULL pool, and diverges on the state hash for as long as she is damaged.)
   *
   * S158 A3: 36->37 (A RAID HITS ANYTHING — owner. `RAID_TARGET.target` gains the `defender`
   * discriminant. Not additive-optional: a v36 host accepts the intent, misroutes it to the
   * connector arm, and drops it silently — same class as the 30->31 payload reshape.)
   *
   * S158 A2: 37->38 (DESTRUCTIBLE STINK BAGS — owner R77. `ehp` on `SerializedStinkCloud`, and
   * REQUIRED rather than additive-optional: a v37 peer would rehydrate every damaged bag at full
   * pool and disagree about whether the ground is about to burst.)
   *
   * W1-A (S160): 38->39 (CASTLE RACES — owner R93-R126. `RosterEntry.raceId` +
   * `SerializedPlayer.raceId`. Additive-optional in shape and bumped BECAUSE of it: a v38 peer drops
   * the key, falls back to its own default, and paints every castle a different colour from the host
   * for the whole match with nothing red — colour is not hashed.)
   *
   * S161 P2: 39->40 (SEAT ELIMINATION — owner R127. `SerializedPlayer.eliminatedAtTick`, additive-
   * optional and emitted only once a seat is out — but the bump is for the RULE, not the field:
   * `tickGameState` no longer ends the match on the first castle to fall, so a v39 peer would
   * declare a winner and stop while a v40 host plays on with two seats alive. The 32->33 break with
   * the sign reversed.)
   *
   * S164 P1: 40->41 (CASTLE REGEN UPGRADE — owner R128-R131. `SerializedPlayer.castleRegenLevel`,
   * additive-optional and emitted only when non-zero — but the bump is for the INTENT, not the
   * field: `UPGRADE_CASTLE_REGEN` is a CLIENT INTENT absent from a v40 host's allowlist, so a v41
   * joiner's purchase would be silently dropped while the host's own worked. The `FEED_TOWER` /
   * `RAID_TARGET` shape.)
   *
   * ⚠ THIS LIST DRIFTS IF YOU LET IT, AND THE COUNT IN THIS PARAGRAPH USED TO DRIFT TOO. It said
   * "THREE times" for three sessions running while the true figure kept climbing. Measured floor as
   * of S150: **SEVEN** prior instances. Three are backfills recorded right here (S133 P2 filled in
   * 14→15, S140 P1 filled in 17→18, S147 P1 filled in 21→22 — each while the literal below already
   * read the new number); `protocol.test.ts` records FOUR more, as drifted TEST TITLES.
   *
   * ⛔ AND S150 FOUND FIVE MORE, LIVE ON DISK, WHICH IS WHY THE PROSE IS NO LONGER TRUSTED WITH
   * THIS JOB. At 27 the narrative changelog above the const was missing 25→26 and 26→27 — and, once a
   * completeness check was actually RUN over the chain rather than eyeballed, 8→9 and 20→21 as well,
   * absent since S93 and S144 respectively while this list had carried both all along. On top of
   * that, this list had its last four entries out of chronological order with two at the wrong
   * comment indentation, and this very paragraph still read "THREE".
   *
   * ⭐ THE LESSON, AND IT IS THE WHOLE REASON THE TEST BELOW EXISTS: every previous session that
   * touched this drift READ the block and believed it complete. Two gaps had survived eight and three
   * bumps respectively in plain sight. A human reading a 200-line comment checks that the LAST entry
   * matches the constant; only a machine checks that EVERY link in the chain is present. So
   * `protocolVersionSync.test.ts` now asserts the chain is unbroken from 2 to `PROTOCOL_VERSION` in
   * BOTH carriers — the prose is a description of a gate, not the gate itself.
   *
   * ⛔ THE REAL CHECKLIST. Bumping `PROTOCOL_VERSION` means editing **SIX** things, not three:
   *   1. the `PROTOCOL_VERSION` const above;
   *   2. the narrative changelog block above that const;
   *   3. this list — IN CHRONOLOGICAL ORDER, at this indentation;
   *   4. the `protoVersion` type literal immediately below (a deliberate tsc tripwire);
   *   5. `protocol.test.ts`'s pinned `expect(PROTOCOL_VERSION).toBe(N)` **and its test title**, plus
   *      `LOCAL_PROTO_V` at the top of `e2e/smoke.spec.ts`;
   *   6. ⭐ S150 — THE SESSION LABEL. State which SESSION shipped it when that differs from the spec
   *      id you are citing. Thirteen files label the 26→27 work `S152` (its roadmap spec name) while
   *      the session was S149, and reconstructing history from source labels alone invents a session
   *      that never happened.
   * ⚠ CORRECTED S160 — this line said *"enforces sites 1, 2 and 5. Sites 3, 4 and 6 remain prose +
 * tsc"* and was STALE BY ONE SITE. Site 3 IS gated: `protocolVersionSync.test.ts` asserts the
 * HelloMsg list documents an unbroken chain up to `PROTOCOL_VERSION`, plus a chronological-order
 * check. That test's own docblock already said "sites 1, 2, 3 and 5" and `LOCKED_DECISIONS.md` already
 * marked site 3 gated — this comment was the only one still under-claiming.
 * `protocolVersionSync.test.ts` enforces sites 1, 2, 3 and 5. Sites 4 and 6 remain tsc + prose. */
  readonly protoVersion: 41;
  /** S82 P4(a) — present on the HOST's HELLO only (additive-optional). */
  readonly hostAttest?: HostAttest;
  /**
   * S115 P3 (host-migration D1) — the joiner's ephemeral pubkey (SPKI base64, net/hostIdentity.
   * generateClientIdentity), so the host can warrant it as a potential successor. ADDITIVE-OPTIONAL (no
   * PROTOCOL_VERSION bump — same posture as hostAttest): a stale peer ignores the key, and no live HELLO
   * populates it yet (D1 is feature-flagged off; D2 wires the send). Absent on host/legacy HELLOs.
   */
  readonly clientPubkeyB64?: string;
  /**
   * S118 P1 (host-migration D2) — the joiner's PROOF-OF-POSSESSION signature over
   * buildPubkeyPopPayload(roomCode, selfId, clientPubkeyB64) (net/hostIdentity.ts), proving it holds
   * the private key for clientPubkeyB64 (closes the "claim any pubkey in HELLO" hole — Council GROK W1).
   * ADDITIVE-OPTIONAL (no PROTOCOL_VERSION bump). Present only alongside clientPubkeyB64 on a live D2
   * joiner HELLO; the host stores the pubkey ONLY after verifyPubkeyPop passes. Absent on host/legacy.
   */
  readonly clientPubkeyPopB64?: string;
}

/**
 * S54 P1 — construct the HELLO handshake envelope a peer broadcasts at
 * peer-join time to announce its protocol version (+ identity). This is the
 * producer that was MISSING through S53: the receive-side machinery
 * (detectProtocolMismatch + onProtocolMismatch + the per-peer drop latch,
 * transport.ts) shipped + unit-tested in S53 P1 but never fired because no
 * call site ever sent a HELLO. Wiring this at peer-join (see
 * `wireHelloOnJoin` in hostHandlers.ts) activates that dormant system.
 *
 * ALWAYS stamps the LOCAL current PROTOCOL_VERSION — a peer announces its own
 * version, never a remembered peer's. The receiver runs detectProtocolMismatch
 * on this BEFORE parseNetMessage, so a peer on a different PROTOCOL_VERSION
 * trips the mismatch UX + drop latch. `playerId`/`color` are informational
 * today (no receiver reads them — host/client message handlers ignore
 * kind:'HELLO'); carried for a future identity/colour handshake and to keep
 * the envelope valid under parseNetMessage's numeric-field checks.
 */
/**
 * S55 P2 — DEV/E2E send-side protoVersion override seam. Mirrors the
 * constants.ts `__TEST_*__` idiom (readTestSpawnRate / readTestWinScore /
 * readTestTerritoryBaseRadius): a Playwright `addInitScript` sets
 * `window.__TEST_PROTO_VERSION_OVERRIDE__` BEFORE the bundle loads, so a test
 * peer can announce a NON-current protoVersion and exercise the RECEIVER's
 * mismatch latch + UX over a real cross-browser wire — the only runtime
 * coverage of the otherwise statically-tested S53/S54 mismatch system (see
 * e2e/smoke.spec.ts "Protocol mismatch").
 *
 * Read PER-CALL (buildHello fires once per peer-join, not on a hot path) so the
 * override is observed whenever it was set before the first join. Window-
 * guarded: production (no window, or no override) returns null and buildHello
 * stamps the local PROTOCOL_VERSION. Ships in the bundle as a ~6-line no-op.
 * Worst-case abuse — a user setting this in their own devtools console — only
 * causes THEIR OWN peer to be latched + dropped by the other side (self-DoS,
 * no cross-peer attack), identical to the 3 existing shipped seams.
 */
function readTestProtoVersionOverride(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_PROTO_VERSION_OVERRIDE__?: number })
    .__TEST_PROTO_VERSION_OVERRIDE__;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function buildHello(
  playerId: PlayerId,
  color: number,
  hostAttest?: HostAttest,
  clientPubkeyB64?: string,
  // S118 P1 (host-migration D2) — the joiner's PoP signature; threaded alongside clientPubkeyB64.
  clientPubkeyPopB64?: string,
): HelloMsg {
  const override = readTestProtoVersionOverride();
  if (override !== null) {
    // DEV/E2E ONLY (window.__TEST_PROTO_VERSION_OVERRIDE__ is undefined in
    // production). The `as typeof PROTOCOL_VERSION` cast is the SINGLE,
    // quarantined point where the wire-contract literal is deliberately violated
    // to simulate a stale-build peer; the receiver's detectProtocolMismatch is
    // designed to reject it. (S79 P6 — was a hardcoded `as 7`/stale "as 6"
    // comment that needed manual maintenance on every version bump; the typeof
    // form tracks the literal automatically.) The PRODUCTION return below stays
    // `protoVersion: PROTOCOL_VERSION`, which preserves the version-bump
    // lockstep tsc tripwire: raising PROTOCOL_VERSION without updating
    // HelloMsg.protoVersion errors at that line. (Council R1 #1 —
    // quarantine-cast over relaxing the type to number.)
    return {
      kind: 'HELLO',
      playerId,
      color,
      protoVersion: override as typeof PROTOCOL_VERSION,
      ...(hostAttest !== undefined ? { hostAttest } : {}),
      ...(clientPubkeyB64 !== undefined ? { clientPubkeyB64 } : {}),
      ...(clientPubkeyPopB64 !== undefined ? { clientPubkeyPopB64 } : {}),
    };
  }
  return {
    kind: 'HELLO',
    playerId,
    color,
    protoVersion: PROTOCOL_VERSION,
    ...(hostAttest !== undefined ? { hostAttest } : {}),
    ...(clientPubkeyB64 !== undefined ? { clientPubkeyB64 } : {}),
    ...(clientPubkeyPopB64 !== undefined ? { clientPubkeyPopB64 } : {}),
  };
}

export interface IntentMsg {
  readonly kind: 'INTENT';
  readonly intentSeq: number;
  readonly action: GameAction;
}

export interface NetSnapshotMsg {
  readonly kind: 'NETSNAPSHOT';
  readonly snapshotSeq: number;
  readonly snapshot: NetSnapshot;
  /**
   * S118 P1 (host-migration D2) — the term/epoch this snapshot was emitted under. 0 (or absent =
   * treated as 0) for the ORIGINAL host's term; a migrated session runs at epoch ≥ 1, letting a
   * survivor DROP late snapshots from a deposed zombie host (ClientSync epoch gate). ENVELOPE-ONLY —
   * it rides NetSnapshotMsg, NEVER enters NetSnapshot/save (save.replay stays byte-identical by
   * construction). S124 P1 (D4): LIVE — epochs ≥ 1 are production semantics under PROTOCOL_VERSION 15;
   * epoch advance is claim-driven (monotonic per term, reset only at teardown/match end), and a
   * migrated host watches INCOMING stale-epoch snapshots to fire its claim echo (zombie demotion).
   */
  readonly epoch?: number;
}

/**
 * S39 P1 — dedicated lobby-exit signal. Before S39 the peer transitioned
 * out of LOBBY only when the FIRST NETSNAPSHOT (carrying gameState='PLAYING')
 * arrived and successfully applied. After S38 audit Pass 1/2 added a try/catch
 * around applyNetSnapshot + strict schemaVersion gate in parseNetMessage, any
 * silent drop on the snapshot path leaves the peer stuck in lobby with no
 * user-visible feedback. This envelope is broadcast by the host BEFORE its
 * first snapshot — the peer dispatches a local START_GAME on receipt,
 * decoupling lobby-exit from snapshot-delivery reliability. Subsequent
 * NETSNAPSHOTs still carry authoritative state; this signal only kicks the
 * peer's FSM into PLAYING so visuals start rendering immediately.
 */
/**
 * S62 — a single authoritative seat assignment in the match roster. The host
 * mints the roster (seat 0 = host; seats 1..N-1 = remote peers in join order),
 * one entry per connected player, and ships the ORDERED array (by seat) so every
 * client constructs a byte-identical initial world (Council determinism fix:
 * ordered array, NOT a Map — iteration order can't diverge). Each client finds
 * its OWN entry by matching `peerId === selfId` to learn its seat + color.
 */
export interface RosterEntry {
  readonly seat: number;
  readonly peerId: string;
  readonly color: number;
  /**
   * S87 P4 — quickmatch readiness flag, attached by the HOST to the
   * LOBBY_PRESENCE roster in quickmatch rooms only (friends-lobby beacons
   * stay byte-identical). Additive-optional: absent = not-applicable (friends
   * lobby) or not-ready. Drives the joiner's "ready k/n" display; the
   * AUTHORITATIVE gate is host-side (isQuickmatchAllReady).
   */
  readonly ready?: boolean;
  /**
   * ⭐ W1-A (S160) — THE SEAT'S RACE, chosen in the lobby and resolved by the host.
   *
   * Additive-optional in SHAPE: absent means "this peer did not choose", and the receiver falls back
   * to `defaultRaceForSeat(seat)`. ⛔ It is precisely that graceful fallback which makes it need a
   * PROTOCOL BUMP rather than excusing one — see the 38→39 note above the const. A v38 peer drops the
   * key and paints every castle a different colour from the host, all match, with nothing red.
   *
   * ⚠ ONE VALIDATOR COVERS BOTH CARRIERS. `START_GAME_SIGNAL` and `LOBBY_PRESENCE` share
   * `isValidRoster` by design, so the single check added there guards each of them.
   */
  readonly raceId?: RaceId;
}

export interface StartGameMsg {
  readonly kind: 'START_GAME_SIGNAL';
  // Kept as the literal '1v1' value (the "networked mode" tag) for back-compat;
  // the actual player count is roster.length (2..MAX_PLAYERS). S62.
  readonly mode: '1v1';
  // S62 — seat→color roster for deterministic N-player seating. Ordered by seat.
  readonly roster: readonly RosterEntry[];
  /** S82 P4(a) — host attestation (additive-optional): lets a client whose HELLO was
   *  lost still verify + latch from the Begin signal itself (buffered until verified). */
  readonly hostAttest?: HostAttest;
  /**
   * S118 P1 (host-migration D2) — the host's SuccessionWarrant (net/successionWarrant.ts), signed at
   * Begin over the seat→pubkey roster ∩ proven-pubkey peers, so survivors can later verify a D3
   * MIGRATION_CLAIM chains to the room-code commitment. ADDITIVE-OPTIONAL (PROTOCOL_VERSION held 14);
   * a client that receives no/invalid warrant just can't be a successor (fail-open — instrument phase,
   * match proceeds). Seats without a proven pubkey are OMITTED (mixed-build tolerance, GROK R1 fix).
   */
  readonly warrant?: SuccessionWarrant;
}

/**
 * S70 P1 — lobby presence beacon. The host broadcasts the CURRENT occupied-seat
 * roster (seat 0 = host, seats 1..N = connected peers in join order) on every
 * peer join/leave during the LOBBY phase, so joiners render the TRUE per-seat
 * rack — their own seat (peerId === selfId), real per-seat colours, and accurate
 * drop-when-a-peer-leaves — instead of count-based occupancy.
 *
 * PURELY COSMETIC: the AUTHORITATIVE roster still ships only at Begin via
 * START_GAME_SIGNAL, so a peer that never receives (or cannot parse) this just
 * falls back to the count-based rack and plays normally. That is why NO
 * PROTOCOL_VERSION bump is needed (Council S70 Fork B): unlike the gameplay
 * envelopes (whose bumps prevent desync), a stale-build peer null-rejects this
 * unknown kind in parseNetMessage and degrades gracefully, rather than being
 * hard-rejected at the HELLO handshake for a non-gameplay message. Reuses the
 * RosterEntry shape + isValidRoster validator (no new wire-validation surface).
 */
interface LobbyPresenceMsg {
  readonly kind: 'LOBBY_PRESENCE';
  readonly roster: readonly RosterEntry[];
}

/**
 * ⛔ S163 P1 — **THE ONLY HOST-AUTHORED OUTCOME KIND THAT WAS NOT EPOCH-FENCED.**
 *
 * `clientHandlers`' own threat docblock lists *"fake a win via ENDGAME"* among the things the
 * host-auth gate exists to stop, and that gate is `peerId`-only: it asks *"are you the latched
 * host?"*, never *"are you STILL the host?"*. `NETSNAPSHOT` has always asked the second question
 * (`sync.ts` drops `(msg.epoch ?? 0) < currentEpoch`), so a deposed host's world-state was already
 * inert — but its one-shot verdict was not, and a verdict is the more consequential message.
 *
 * ⚠ THE FENCE IS DEFENCE IN DEPTH AND CANNOT FIRE TODAY — an S163 audit of this same commit
 * showed `hostPeerId` and `currentEpoch` are always written together, so `hostAuthFilter` has
 * already dropped anything the fence would have caught. What actually stops a deposed host ending
 * a match the survivors are still playing is the crown guard in `hostTick.ts`, which stops it
 * reaching this send at all. Full reasoning at `endgameIsStale` in `clientHandlers.ts`.
 *
 * ⭐ ADDITIVE-OPTIONAL, SO NO `PROTOCOL_VERSION` BUMP — per this project's protocol rules, and
 * PROVABLY INERT against a stale peer exactly as the `sync.ts` gate was in D2: an absent `epoch`
 * reads 0, `currentEpoch` is 0 before any migration, and `0 < 0` is false. A pre-S163 peer simply
 * keeps today's peerId-only gate.
 */
interface EndGameMsg {
  readonly kind: 'ENDGAME';
  readonly winnerId: PlayerId;
  /** The sender's term. Absent from a pre-S163 host; see the docblock above. */
  readonly epoch?: number;
}

/**
 * S22 P3 — host-broadcast godly-cinematic-fire event. Sent standalone
 * (not bundled with NetSnapshot) so the client renders the cinematic
 * 0-100 ms sooner than next snapshot would arrive (D4 standalone choice).
 * Client routes to local dispatch GODLY_TRIGGER; client NEVER runs the
 * recipe predicate locally (Battle Ledger row 9 anti-desync clarification).
 */
interface GodlyTriggerMsg {
  readonly kind: 'GODLY_TRIGGER';
  readonly event: GodlyTriggerEvent;
}

/**
 * S87 P4 — quickmatch readiness toggle, CLIENT→HOST (the one lobby message a
 * client originates). The host records it per sender peerId (never trusts a
 * claimed identity — same posture as INTENT seat-stamping), mirrors the
 * aggregate back via LOBBY_PRESENCE roster.ready, and auto-Begins when every
 * seated player is ready and >=2 are present. Drives the PROTOCOL_VERSION
 * 7→8 bump (see above).
 */
/**
 * S122 P2 (host-migration D3) — a warranted survivor claims host succession after loss+grace
 * (HOST_MIGRATION_DESIGN.md §5). S124 P1 (D4): PRODUCTION-ON under PROTOCOL_VERSION 15 — the
 * __TEST_MIGRATION__ seam is a TIMING OVERRIDE only (starvation/grace/ladder ms for e2e), no
 * longer an activation gate. Claims fire on the deterministic ladder (succession.ts
 * computeClaimDelayMs) and are ALSO re-emitted by a migrated host as the CLAIM ECHO (zombie
 * demotion + rejoiner support, ≥5s rate-limited). The signature binds
 * (roomCode ‖ epoch ‖ seat ‖ SENDER peerId) under the pubkey the ORIGINAL host warranted for
 * that seat (net/migrationClaim.ts) — a relayed/replayed claim from any other peer cannot verify.
 */
export interface MigrationClaimMsg {
  readonly kind: 'MIGRATION_CLAIM';
  /** The NEW term (survivors require currentEpoch + 1). */
  readonly epoch: number;
  /** The claimant's seat — must be the lowest warranted transport-alive seat. */
  readonly seat: number;
  readonly sigB64: string;
}

interface LobbyReadyMsg {
  readonly kind: 'LOBBY_READY';
  readonly ready: boolean;
}

/**
 * ⭐ S161 P6 — A PLAYER PICKS ITS RACE (and therefore its colour) IN THE LOBBY. CLIENT→HOST.
 *
 * Owner, 2026-09-03: *"in multiplayer you should be able to click on your player with its assigned
 * color (based on lobby log in order) and then there should be a menu where you can chose one of the
 * other six colors!"*
 *
 * The host records it per SENDER peerId (never a wire-claimed identity — the `LOBBY_READY` posture),
 * refuses a race another peer already holds, and mirrors the resolved assignment back through
 * `LOBBY_PRESENCE`. There is no reply message: the presence beacon IS the answer, so a refused claim
 * simply leaves the rack showing what the host still believes, which is the truth.
 *
 * ## ⛔ NO PROTOCOL BUMP — AND S160 PREDICTED OTHERWISE, IN WRITING, ABOVE `PROTOCOL_VERSION`
 *
 * That note said the claim *"will carry its own bump"*, reasoning by analogy to `LOBBY_READY`
 * (7→8). The analogy does not hold, and the distinction is stated in `LOBBY_PRESENCE`'s own
 * docblock: *"the LOBBY_PRESENCE no-bump precedent covers cosmetic kinds, not match-gating"*.
 * `LOBBY_READY` bumped because it GATES THE MATCH — it feeds `maybeQmAutoBegin`, so a peer that
 * could not send one would hang a quickmatch room forever. This kind gates nothing:
 *
 *   · it is CLIENT→HOST only, so no peer ever has to parse one;
 *   · a peer that cannot SEND one keeps its default race and plays a completely normal match;
 *   · the host's answer rides `RosterEntry.color` and `RosterEntry.raceId`, both of which have been
 *     on the wire since v39 — so a peer one build behind reads the resolved roster correctly and
 *     agrees with the host about every seat.
 *
 * ⇒ A stale peer degrades gracefully rather than desyncing, which is exactly the Council Fork B
 * case `LOBBY_PRESENCE` was granted. Bumping anyway would hard-reject peers at HELLO for a lobby
 * convenience, which is the cost the no-bump rule exists to avoid.
 */
interface ClaimRaceMsg {
  readonly kind: 'CLAIM_RACE';
  readonly raceId: RaceId;
}

export type NetMessage =
  | HelloMsg
  | IntentMsg
  | NetSnapshotMsg
  | StartGameMsg
  | EndGameMsg
  | GodlyTriggerMsg
  | LobbyPresenceMsg
  | LobbyReadyMsg
  | ClaimRaceMsg
  | MigrationClaimMsg;

/**
 * 6-character alphanumeric room code (uppercase letters + digits, dropping
 * 0/O/1/I to avoid visual confusion when sharing verbally). Caller asks
 * Math.random() for entropy — fine for friends-only matchmaking (no
 * adversarial collision search worth defending against in v1).
 */
// S82 P4(a) — exported: net/hostIdentity.ts derives the room code from the host pubkey
// fingerprint over this SAME alphabet (single source of truth for the code charset).
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function generateRoomCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Validate a user-typed room code: uppercase + length match + alphabet subset.
 * Returns canonicalized code or null on failure.
 */
export function parseRoomCode(input: string, length = 6): string | null {
  const trimmed = input.trim().toUpperCase();
  if (trimmed.length !== length) return null;
  for (const ch of trimmed) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  }
  return trimmed;
}

/**
 * Audit Pass 1 fix d3f0e22b + 561e37ce + Pass 2 fix ce51b032 — closed-set
 * allowlist of GameAction discriminants. The Record literal MUST list every
 * `GameAction['type']` exactly once (tsc enforces both directions):
 *   - Removing a kind from GameAction in world.ts → tsc errors here because
 *     the property key is no longer a valid `keyof Record<GameAction['type'], true>`.
 *   - Adding a kind to GameAction without adding the row here → tsc errors at
 *     the type assignment because the literal is missing a required property.
 * Pre-Pass-2 this was an untyped `Set<string>([...])` literal that gave neither
 * direction of safety; the maintenance-trap finding ce51b032 surfaced after
 * Pass 1 strengthened parseNetMessage. The Record-based form makes the wire
 * allowlist a true compile-time mirror of the in-process action union, so the
 * "wire silently rejects valid INTENT" failure mode is now caught at typecheck.
 */
const KNOWN_GAME_ACTION_TYPES_RECORD: Record<GameAction['type'], true> = {
  // V6-1.1/1.2 — the gatherer economy. BUY_GATHERER / UPGRADE_GATHERER_SPEED /
  // SET_GATHERER_PREFERENCE are also CLIENT INTENTs (see below); GATHERER_TICK is host-internal.
  BUY_GATHERER: true,
  GATHERER_TICK: true,
  UPGRADE_GATHERER_SPEED: true,
  // S164 P1 — castle regen upgrade (owner R128). A CLIENT INTENT, so it is in both records.
  UPGRADE_CASTLE_REGEN: true,
  SET_GATHERER_PREFERENCE: true,
  // S136 P1 (V6-1.3) — PULL_FROM_BANK is also a CLIENT INTENT (see below).
  PULL_FROM_BANK: true,
  // S144 P1 — BUILD_BLUEPRINT is also a CLIENT INTENT (see below). PROTOCOL_VERSION bumped 20->21;
  // an old peer cannot receive this, but its HELLO is already rejected at handshake.
  BUILD_BLUEPRINT: true,
  // ⭐ S151 P3 — FEED_TOWER (owner R70): hand one shape to a goblin tower and it makes the goblin
  // that shape maps to. A CLIENT INTENT (see the second allowlist below) so a 1v1 joiner can feed
  // their own tower; the host re-checks ownership, recipe and affordability regardless.
  FEED_TOWER: true,
  // S152 — FIX + SCRAP (R13/R19/R21). Both are also CLIENT INTENTs (see below).
  // PROTOCOL_VERSION bumped 26->27.
  REPAIR_STRUCTURE: true,
  SCRAP_STRUCTURE: true,
  // S141 P2 (V6-1.4) — the gatherer ORDER QUEUE. Both are also CLIENT INTENTs (see below).
  ENQUEUE_GATHERER_ORDER: true,
  CANCEL_GATHERER_ORDER: true,
  SPAWN_SPARK: true,
  DESPAWN_SPARK: true,
  PICKUP_SPARK: true,
  DROP_SPARK: true,
  PLACE_PRIMITIVE: true,
  // S52 P1 — atomic LMB-up action replacing the legacy PICKUP+PLACE burst.
  // PROTOCOL_VERSION bumped 2→3; old peers can't receive this but their
  // HELLO will already have been rejected at handshake.
  PLACE_FROM_FREE: true,
  SEVER_BOND: true,
  TICK_ENERGY: true,
  WIN_TRIGGER: true,
  START_GAME: true,
  // S42 — END_TURN removed: turn-based gameplay deleted (blueprint mandates
  // real-time). Old browser-tab peers sending END_TURN get null from
  // parseNetMessage = defensive no-op; no protoVersion bump needed because
  // this is an allowlist tighten, not a structural message change.
  RETURN_TO_TITLE: true,
  UPDATE_AVATAR_POS: true,
  GODLY_TRIGGER: true,
  GODLY_COMPLETE: true,
  GODLY_ABORT: true,
  SPAWN_CREATURE: true,
  DESPAWN_CREATURE: true,
  CREATURE_TICK: true,
  CREATURE_ATTACK: true,
  // S49 P1 (Sym F) — territorial shrink disruption. Joiner can dispatch
  // this as an INTENT; host applies authoritatively.
  SHRINK_TERRITORY: true,
  // S71 P1 — bomb hazard. TRIGGER_BOMB is the client→host intent (a joiner that
  // grabs the bomb); SPAWN_BOMB + DISSIPATE_BOMB are host-internal (listed here
  // only because this Record must mirror GameAction['type'] exhaustively — clients
  // never originate them, so wire-allowing them is inert under the friends-only model).
  SPAWN_BOMB: true,
  TRIGGER_BOMB: true,
  DISSIPATE_BOMB: true,
  // S72 P2 — Pac-Man hunter. ALL THREE are host-internal (host-authored + snapshot-
  // replicated; NOT client INTENTs — see hunters/hunterLifecycle.ts). Listed here
  // only because this Record must mirror GameAction['type'] exhaustively; clients
  // never originate them, so wire-allowing them is inert under the friends-only model
  // (a spoofed HUNTER_* would just advance host-authoritative deterministic state — no
  // desync). No PROTOCOL_VERSION bump: no NEW client intent — the S71 v4→5 bump stands.
  SPAWN_HUNTER: true,
  HUNTER_TICK: true,
  HUNTER_CATCH: true,
  // S72 P3 — potato bomb. PICKUP/PLACE/DROP_POTATO are client INTENTs (a joiner can
  // carry + plant a potato — wire-allowed); SPAWN_POTATO + POTATO_DETONATE are
  // host-internal (listed for the exhaustive Record mirror; inert as client intents).
  // NO PROTOCOL_VERSION bump — Council: the S71 v4->5 bump covers the P1/P2/P3 batch.
  SPAWN_POTATO: true,
  PICKUP_POTATO: true,
  PLACE_POTATO: true,
  DROP_POTATO: true,
  POTATO_DETONATE: true,
  DISSIPATE_POTATO: true, // S78 — host-internal: a FREE potato's fuse elapsed → harmless removal (mirrors DISSIPATE_BOMB; inert as a client intent).
  // S75 P3 — rainbow color-shuffle. TRIGGER_RAINBOW is the client→host intent (any player
  // clicking the rainbow); SPAWN_RAINBOW + DISSIPATE_RAINBOW are host-internal (spawner cadence /
  // TTL poll — listed for the exhaustive Record mirror; inert as client intents). PROTOCOL bumped
  // 5→6: the new TRIGGER_RAINBOW intent + the global colour remap would desync a stale v5 peer.
  SPAWN_RAINBOW: true,
  TRIGGER_RAINBOW: true,
  DISSIPATE_RAINBOW: true,
  // S77 P3 — seagull hazard. ALL FOUR are HOST-INTERNAL (host-authored + snapshot-replicated;
  // NOT client INTENTs — cleaning is host-detected avatar proximity, see seagulls/seagullLifecycle.ts).
  // Listed here only because this Record must mirror GameAction['type'] exhaustively; clients never
  // originate them, so wire-allowing them is inert under the friends-only model. PROTOCOL bumped 6→7:
  // the global income-affecting foul would confuse a stale v6 peer (see PROTOCOL_VERSION comment).
  SPAWN_SEAGULL: true,
  SEAGULL_TICK: true,
  POOP_TICK: true,
  CLEAN_POOP: true,
  // S82 P4(c) — host-internal mid-game drop-bench. Listed for the exhaustive Record
  // mirror ONLY; it is NOT in CLIENT_INTENT_TYPES below, so a client sending it as an
  // INTENT is dropped by the host's allowlist gate (hostHandlers.ts) — the first action
  // to rely on that gate rather than the "inert under friends-only" rationalization.
  BENCH_OFFLINE_PLAYER: true,
  // S93 — NONET solve submission (player-originated; also in CLIENT_INTENT_TYPES below).
  SUDOKU_SOLVED: true,
  // S100 P1 (TD Phase 1a) — creature-spawner lifecycle. BOTH are HOST-INTERNAL
  // (host-authored on ignition / re-validation; NOT client INTENTs — see
  // spawners/spawnerLifecycle.ts). Listed here ONLY because this Record must mirror
  // GameAction['type'] exhaustively; they are deliberately ABSENT from
  // CLIENT_INTENT_TYPES below, so a modified client sending one as an INTENT is dropped
  // by the host allowlist gate (BENCH_OFFLINE_PLAYER precedent). The PROTOCOL_VERSION
  // bump (9→10) for this feature is owned by the protocol layer, not this layer.
  REGISTER_SPAWNER: true,
  REMOVE_SPAWNER: true,
  // S102 #1 — a player raids an enemy SPAWN (right-click a chewer). A genuine client
  // INTENT (also in CLIENT_INTENT_TYPES below); the host charge-gates + enemy-checks it.
  RAID_TARGET: true,
  // S103 P2 — generic defender lifecycle. ALL THREE are HOST-INTERNAL (host-authored on recipe
  // ignition / re-validation / per-tick FSM; NOT client INTENTs — defenders auto-build from
  // geometry). Listed here only because this Record must mirror GameAction['type'] exhaustively;
  // deliberately ABSENT from CLIENT_INTENT_TYPES so a modified client sending one is dropped by
  // the host allowlist gate. PROTOCOL bump (11->12) owned by the PROTOCOL_VERSION above.
  REGISTER_DEFENDER: true,
  REMOVE_DEFENDER: true,
  DEFENDER_TICK: true,
  // S113 Batch C — lightning-drone building. BOTH are HOST-INTERNAL (host-authored: a drone's
  // detonation / the hub's post-3-drone self-destruct; NOT client INTENTs). Listed here only because
  // this Record must mirror GameAction['type'] exhaustively; deliberately ABSENT from
  // CLIENT_INTENT_TYPES so a modified client sending one is dropped by the host allowlist gate.
  // PROTOCOL bump (13->14) owned by the PROTOCOL_VERSION above.
  DRONE_EXPLODE: true,
  // ⭐ S158 P3 (CF-S157-e) — the terrorist goblin's own detonation. HOST-INTERNAL on exactly the
  // same footing as DRONE_EXPLODE above: host-authored, listed here only because this Record must
  // mirror GameAction['type'] exhaustively, and deliberately ABSENT from CLIENT_INTENT_TYPES so a
  // modified client cannot detonate someone else's unit. NO PROTOCOL bump — it emits only the
  // already-mirrored BOMB_EXPLODE effect and changes no serialized field.
  SUICIDE_BLAST: true,
  STRUCTURE_SELFDESTRUCT: true,
};
const KNOWN_GAME_ACTION_TYPES: ReadonlySet<string> = new Set(
  Object.keys(KNOWN_GAME_ACTION_TYPES_RECORD),
);

/**
 * S82 P4(c) — CLIENT-INTENT ALLOWLIST (single source of truth — Council S82 Grok R2#2).
 * The Record above mirrors the FULL GameAction union for wire-shape validation, which
 * means a modified client could send HOST-INTERNAL actions (SPAWN_*, *_TICK, WIN_TRIGGER,
 * START_GAME, …) as INTENTs and the host would apply them (state-machine abuse: free
 * hazard spawns, forced win, mid-game restarts). This is the set of actions a player may
 * GENUINELY originate; the host's INTENT handler drops everything else (fail-closed).
 * `satisfies` keeps every key a real GameAction type — a typo or a renamed action errors
 * at typecheck. Adding a NEW player-facing intent requires adding it HERE (the unit test
 * in protocol.test.ts will remind you).
 */
const CLIENT_INTENT_TYPES_RECORD = {
  PICKUP_SPARK: true,
  DROP_SPARK: true,
  PLACE_PRIMITIVE: true, // legacy pre-S52 client placement — host re-pick path still validates it
  PLACE_FROM_FREE: true,
  SEVER_BOND: true,
  UPDATE_AVATAR_POS: true,
  SHRINK_TERRITORY: true,
  TRIGGER_BOMB: true,
  TRIGGER_RAINBOW: true,
  PICKUP_POTATO: true,
  PLACE_POTATO: true,
  DROP_POTATO: true,
  // S93 — NONET: a 1v1 client (joiner) submits its completed grid; host validates first-valid-wins.
  SUDOKU_SOLVED: true,
  // S102 #1 — a 1v1 client can raid an enemy chewer (right-click); host charge-gates + enemy-checks.
  RAID_TARGET: true,
  // V6-1.1 — a 1v1 joiner can buy a gatherer from their keep; the host affordability-gates it and
  // spends from that seat's own score pool (the reducer never trusts the client's view of the price).
  BUY_GATHERER: true,
  // V6-1.2 — a joiner can buy speed for their own gatherers and re-task them. Both are
  // ownership- and affordability-gated in the reducer, so the host never trusts the client's view.
  UPGRADE_GATHERER_SPEED: true,
  UPGRADE_CASTLE_REGEN: true,
  SET_GATHERER_PREFERENCE: true,
  // S136 P1 (V6-1.3) — a joiner pulls from THEIR OWN castle bank to build. The host applies it
  // against its own authoritative bank, so a client acting on a stale index simply no-ops rather
  // than taking the wrong shape; nothing about the client's view of the bank is trusted.
  PULL_FROM_BANK: true,
  // S141 P2 (V6-1.4) — a joiner queues and cancels orders for THEIR OWN gatherers. Ownership is
  // enforced in the reducer against the action's own playerId, and both reducers are NO-OP-never-throw
  // (the applyPullFromBank shape, NOT placePrimitive's throw-on-guard), so a stale client view costs
  // nothing. ⚠ A row omitted HERE compiles clean and passes every test, then the host SILENTLY DROPS
  // the intent for a networked joiner while the host seat's own works — the classic seat-asymmetry
  // desync. The one real cross-check is benchGate.test.ts's set-equality against BENCH_INTENT_POLICY.
  ENQUEUE_GATHERER_ORDER: true,
  CANCEL_GATHERER_ORDER: true,
  // S144 P1 — a joiner clicks a tower in its own castle panel and drags it into place. The host
  // re-resolves BOTH gates authoritatively: `stampRefusalAt` against its own world (the joiner tinted
  // its ghost against a lagged snapshot, so the host's answer is the real one) and
  // `planBlueprintPayment` against its own bank/porch. A stale client view therefore no-ops instead of
  // building the wrong thing or paying with shapes it no longer owns.
  BUILD_BLUEPRINT: true,
  // ⭐ S151 P3 — a joiner hands a shape from ITS OWN castle bank to ITS OWN goblin tower. The host
  // re-resolves all four gates against its own world (the spawner exists AND is a goblinTower, the
  // seat owns it, its anchor is still standing, and the bank really holds that shape), so a stale
  // click no-ops instead of minting a goblin from a tower that has already collapsed.
  FEED_TOWER: true,
  // S152 — a joiner clicks one of ITS OWN towers and presses FIX or SCRAP. The host re-resolves
  // every gate against its own world: `canBuildNow` (BUILD stage + the seat's own ground, R19),
  // per-member ownership, blueprint provenance, and — for FIX — `planPaymentForTypes` against its
  // own bank and porch. Nothing about the client's view is trusted, so a stale click no-ops instead
  // of repairing a tower that is already rubble or refunding shapes that are already gone.
  //
  // ⚠ A row omitted HERE compiles clean and passes every test, then the host SILENTLY DROPS the
  // intent for a networked joiner while the host seat's own works — the classic seat-asymmetry
  // desync. The one real cross-check is benchGate.test.ts's set-equality against BENCH_INTENT_POLICY.
  REPAIR_STRUCTURE: true,
  SCRAP_STRUCTURE: true,
} as const satisfies Partial<Record<GameAction['type'], true>>;

export const CLIENT_INTENT_TYPES: ReadonlySet<string> = new Set(
  Object.keys(CLIENT_INTENT_TYPES_RECORD),
);

/** True iff a client may originate this action type as an INTENT (host-side gate). */
export function isClientIntentAllowed(actionType: string): boolean {
  return CLIENT_INTENT_TYPES.has(actionType);
}

const WIRE_SCHEMA_VERSION = 1;

/**
 * S70 P1 — shared seat-roster validator (extracted from the inline
 * START_GAME_SIGNAL check, now reused by LOBBY_PRESENCE — Council DRY). Fail-
 * closed: a non-array, empty array, an OVER-CAP array (> MAX_PLAYERS), or any
 * malformed entry rejects the whole message, so a corrupt/hostile peer can
 * neither desync the authoritative seating (START_GAME_SIGNAL) nor inject a bad
 * lobby rack (LOBBY_PRESENCE). A valid roster is a NON-EMPTY, at-most-MAX_PLAYERS
 * array of {seat:number, peerId:string, color:number}.
 *
 * S70 P1 CHECK (GROK-ANALYST): the ≤ MAX_PLAYERS cap is the fix for the "no length
 * cap" finding — a roster is bounded by the player cap by definition (the host
 * never builds a larger one), so an oversized array is malformed, and rejecting it
 * at the wire bounds the receive-side Map-build work against a flooding peer.
 */
function isValidRoster(roster: unknown): roster is readonly RosterEntry[] {
  if (!Array.isArray(roster) || roster.length === 0 || roster.length > MAX_PLAYERS) {
    return false;
  }
  for (const e of roster) {
    if (e === null || typeof e !== 'object') return false;
    const r = e as Record<string, unknown>;
    if (
      typeof r.seat !== 'number' ||
      typeof r.peerId !== 'string' ||
      typeof r.color !== 'number'
    ) {
      return false;
    }
    // S87 P4 — optional readiness flag: absent is fine; present-but-not-boolean
    // rejects the message (fail-closed, mirrors the hostAttest posture).
    if (r.ready !== undefined && typeof r.ready !== 'boolean') return false;
    // ⭐ W1-A (S160) — same fail-closed posture: absent is fine, present-but-not-a-race rejects the
    // whole message. An unvalidated string here would reach `RACE_COLORS[...]` and paint `undefined`.
    if (r.raceId !== undefined && !isRaceId(r.raceId)) return false;
    /*
     * ⛔ S163 P4 — **`seat` WAS CHECKED FOR ITS TYPE AND NOTHING ELSE**, so `-1`, `99`, `1.5` and
     * `NaN` all passed a validator whose whole job is to make the wire safe to trust. Both writers
     * of `hostSeats` do `hostSeats.set(e.peerId, asPlayerId(e.seat))`, and `asPlayerId` is a BRAND
     * CAST, not a check — so a garbage seat was laundered straight into a `PlayerId`.
     *
     * ⚠ S163 CHECK — ONLY ONE OF THE TWO ACTUALLY READS THE WIRE, and the first version of this
     * paragraph implied both did. `main.ts` (the migration-successor rebuild) iterates
     * `session.lastRoster`, which IS wire data — written from `msg.roster` in `clientHandlers.ts`
     * — so THAT is the site this validator protects, and it is the one that matters: it runs on a
     * peer promoting itself mid-match. `hostHandlers.ts`'s Begin path builds its roster LOCALLY
     * from `lobbySeats`/`raceByPeer` via `buildMatchRoster` and never sees a peer's bytes, so it
     * needs no wire validation — its seats are already the reconciler's own output.
     */
    if (!Number.isInteger(r.seat) || r.seat < 0 || r.seat >= MAX_PLAYERS) return false;
  }
  /*
   * ⛔ S163 P4 — **AND TWO ENTRIES COULD CLAIM THE SAME SEAT.** That is the shared root of two
   * findings filed separately in S162's audit: the `hostSeats` seat→peer scan returning on its
   * first `Map` hit (so INSERTION ORDER picked whose absence clock could end a match), and the
   * successor rebuilding `hostSeats` from unchecked wire data. Fixed once, at the boundary, rather
   * than at the four consumers — after which `asPlayerId` at the rebuild sites is coercing a value
   * the wire has already proven, and the bare cast stops being load-bearing.
   *
   * ⚠ `peerId` is deliberately NOT de-duplicated here: `reconcileLobbySeats` is keyed by peerId, so
   * a repeated peer is last-write-wins on a Map rather than an ambiguity, and rejecting it would
   * fail-closed on a benign retransmit. Seat is the field an outcome is derived from; peer is not.
   */
  const seats = roster.map((e) => (e as RosterEntry).seat);
  if (new Set(seats).size !== seats.length) return false;
  return true;
}

/**
 * S22 P3 (R9 safety) — parse + validate a peer-wire payload into a NetMessage.
 * Returns null on any of: non-object input, unknown `kind`, type-shape mismatch,
 * unknown INTENT.action.type, NETSNAPSHOT.snapshot.schemaVersion mismatch, or
 * HELLO with mismatched protoVersion.
 *
 * Audit Pass 1 fix (d3f0e22b + 561e37ce): strengthened beyond the original
 * key-presence checks. Now wired at transport.ts:recvFn (was previously
 * defined-but-never-called outside tests — Karpathy K1+K3). Defense-in-depth:
 * the validator pre-rejects payloads that would otherwise throw inside
 * applyNetSnapshot (`schemaVersion !== 1`) or land in the dispatcher's `default`
 * case (unknown action.type). Strong types (closed allowlist) keep the wire
 * attack surface frozen even as the in-process GameAction union grows.
 */
export function parseNetMessage(raw: unknown): NetMessage | null {
  if (raw === null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  switch (obj.kind) {
    case 'HELLO': {
      if (obj.protoVersion !== PROTOCOL_VERSION) return null;
      if (typeof obj.playerId !== 'number') return null;
      if (typeof obj.color !== 'number') return null;
      // S82 P4(a) — optional attestation: absent is fine (client HELLOs); present but
      // malformed rejects the message (fail-closed — never hand a junk shape downstream).
      if (obj.hostAttest !== undefined && !isValidHostAttest(obj.hostAttest)) return null;
      // S115 P3 (host-migration D1) — optional joiner pubkey: absent is fine (host/legacy HELLOs);
      // present but non-string rejects (fail-closed, same posture as hostAttest).
      if (obj.clientPubkeyB64 !== undefined && typeof obj.clientPubkeyB64 !== 'string') return null;
      // S118 P1 (host-migration D2) — optional joiner PoP signature: absent is fine; present but
      // non-string rejects (fail-closed). Cryptographic verifyPubkeyPop runs host-side later.
      if (obj.clientPubkeyPopB64 !== undefined && typeof obj.clientPubkeyPopB64 !== 'string') return null;
      return obj as unknown as HelloMsg;
    }
    case 'INTENT': {
      if (typeof obj.intentSeq !== 'number') return null;
      if (obj.action === null || typeof obj.action !== 'object') return null;
      const actionType = (obj.action as Record<string, unknown>).type;
      if (typeof actionType !== 'string') return null;
      if (!KNOWN_GAME_ACTION_TYPES.has(actionType)) return null;
      return obj as unknown as IntentMsg;
    }
    case 'NETSNAPSHOT': {
      if (typeof obj.snapshotSeq !== 'number') return null;
      if (obj.snapshot === null || typeof obj.snapshot !== 'object') return null;
      // Audit Pass 2 fix d4541985: tighten schemaVersion check. Pre-fix this
      // was `if (schemaVersion !== undefined && schemaVersion !== WIRE_SCHEMA_VERSION)`
      // — a deliberate carve-out for the protocol.test.ts test-double pattern
      // `snapshot: {}`. The carve-out meant a peer could send `{snapshot:{}}`
      // and bypass the version gate (downstream applyNetSnapshot would throw,
      // caught by sync.ts:91 try/catch — bounded to one dropped frame, but
      // the wire validator's leniency was a permissive gap). Strict equality
      // now; test fixtures updated to include `schemaVersion: 1`.
      const schemaVersion = (obj.snapshot as Record<string, unknown>).schemaVersion;
      if (schemaVersion !== WIRE_SCHEMA_VERSION) return null;
      // S118 P1 (host-migration D2) — optional envelope epoch: absent is fine (legacy/original-term =
      // treated as 0); present but non-number rejects (fail-closed, same posture as the other optionals).
      if (obj.epoch !== undefined && typeof obj.epoch !== 'number') return null;
      return obj as unknown as NetSnapshotMsg;
    }
    case 'START_GAME_SIGNAL': {
      // S39 P1 — host→peer lobby-exit signal. Mode tag fixed at '1v1' (the
      // networked-mode marker); checked at the wire so a future mode addition
      // fails closed. S62 — also validate the seat roster (S70 P1: extracted to
      // isValidRoster). A malformed roster nulls the whole message (fail-closed)
      // so a corrupt peer can't desync seating.
      if (obj.mode !== '1v1') return null;
      if (!isValidRoster(obj.roster)) return null;
      // S82 P4(a) — optional attestation, same fail-closed posture as HELLO.
      if (obj.hostAttest !== undefined && !isValidHostAttest(obj.hostAttest)) return null;
      // S118 P1 (host-migration D2) — optional succession warrant: absent is fine (legacy/mixed-build
      // Begin); present but malformed rejects the whole message (fail-closed). Crypto verify runs later.
      if (obj.warrant !== undefined && !isValidWarrant(obj.warrant)) return null;
      return obj as unknown as StartGameMsg;
    }
    case 'LOBBY_PRESENCE': {
      // S70 P1 — cosmetic lobby seat roster (host→peer on join/leave). Same
      // fail-closed roster validation as START_GAME_SIGNAL; no mode tag. A
      // stale-build peer that predates this kind falls through to `default` →
      // null (graceful degradation — the no-version-bump path, Council Fork B).
      if (!isValidRoster(obj.roster)) return null;
      return obj as unknown as LobbyPresenceMsg;
    }
    case 'LOBBY_READY': {
      // S87 P4 — quickmatch readiness toggle (client→host). Boolean-strict.
      if (typeof obj.ready !== 'boolean') return null;
      return obj as unknown as LobbyReadyMsg;
    }
    case 'CLAIM_RACE': {
      // S161 P6 — lobby race pick (client→host). ⛔ `isRaceId` FIRST: this crosses a trust boundary
      // as a bare string, and an unvalidated one would reach `RACE_COLORS[...]` and paint
      // `undefined`. Fail-closed like every other validator here.
      if (!isRaceId(obj.raceId)) return null;
      return obj as unknown as ClaimRaceMsg;
    }
    case 'ENDGAME':
      // ⭐ S163 P1 — `epoch` is additive-optional: absent is fine, present-but-not-a-non-negative
      // integer rejects the whole message. Same fail-closed posture as `ready`/`raceId` in
      // `isValidRoster` and as MIGRATION_CLAIM's bounds check — a garbage epoch must not reach the
      // fence in `clientHandlers` and be silently coerced there.
      if (
        obj.epoch !== undefined &&
        (typeof obj.epoch !== 'number' || !Number.isInteger(obj.epoch) || obj.epoch < 0)
      ) {
        return null;
      }
      return typeof obj.winnerId === 'number' ? (obj as unknown as EndGameMsg) : null;
    case 'GODLY_TRIGGER': {
      if (obj.event === null || typeof obj.event !== 'object') return null;
      const godlyId = (obj.event as Record<string, unknown>).godlyId;
      if (typeof godlyId !== 'string') return null;
      return obj as unknown as GodlyTriggerMsg;
    }
    case 'MIGRATION_CLAIM': {
      // S122 P2 (host-migration D3) — fail-closed shape gate; cryptographic verification
      // (warrant chain + sender binding) runs in the client handler. Bounds-checked ints so
      // a garbage epoch/seat can't reach the handlers.
      if (typeof obj.epoch !== 'number' || !Number.isInteger(obj.epoch) || obj.epoch < 1) return null;
      if (typeof obj.seat !== 'number' || !Number.isInteger(obj.seat) || obj.seat < 0) return null;
      if (typeof obj.sigB64 !== 'string') return null;
      return obj as unknown as MigrationClaimMsg;
    }
    default:
      return null;
  }
}
