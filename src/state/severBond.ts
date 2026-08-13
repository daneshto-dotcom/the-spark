/**
 * SPARK — SEVER_BOND reducer orchestrator (S61 P1 §XV de-hypertrophy).
 *
 * Extracted verbatim from the world.ts dispatch() SEVER_BOND case so the
 * switch is uniformly 1-line delegations (mirrors godlyActions.ts /
 * sparkLifecycle.ts / placeFromFree.ts). The four pure helpers stay in
 * disruptionManager.ts; this module is the ORCHESTRATOR the S19 Council
 * deliberately kept OUT of disruptionManager ("player-state mutation should
 * not be hidden inside a helper named for topology").
 *
 * Effect ordering is LOAD-BEARING (S19 Council R1 Grok#4 + Gemini#1 BLOCKER):
 *   SEVER_ERASE effects emit BEFORE topology mutation (they read live prims
 *   for pos/color/radius); BOND_SEVERED emits AFTER (end-of-operation marker
 *   for the audio drain). The body below preserves that order bit-for-bit.
 *
 * Imports World/GameAction TYPE-ONLY (erased at runtime — same shape as
 * disruptionManager.ts) so there is NO world.ts <-> severBond.ts runtime cycle.
 *
 * S61 P1 Council Option B — the original orchestrator's lone world.ts RUNTIME
 * symbol was requirePlayer(world, id) (which throws on a missing player).
 * Importing it would re-introduce a runtime cycle, so the charge-decrement
 * uses an inline guarded lookup instead. This is PROVABLY EQUIVALENT on every
 * reachable path: computeBaseCharge returns > 0 ONLY for cause==='player' AND
 * a player that world.players.get() resolves (it returns 0 otherwise), so
 * whenever chargeToConsume > 0 the player is guaranteed present and
 * requirePlayer would never have thrown. computeBaseCharge is the guarantor;
 * severBond.test.ts locks the charge-consume behavior so any future path that
 * breaks the guarantee fails loudly. (Council split: Grok pushed verbatim +
 * relocate requirePlayer; PRIME-AUDIT refuted the reachability concern —
 * world.effects is a plain GameEffect[] data array, NOT an emitter, so the
 * BOND_SEVERED push triggers no re-entrant dispatch, and the computeBaseCharge
 * call + the charge line are adjacent synchronous reads of the same Map+key.)
 */

import { severSplit } from '../game/structure.ts';
import {
  applySeverTopology,
  canSeverBond,
  computeBaseCharge,
  computeSeverEraseEffects,
} from './disruptionManager.ts';
import type { PlayerId } from '../types.ts';
import type { GameAction, World } from './world.ts';

/** SeverBond-specific action narrowing (same derivation as disruptionManager.ts). */
type SeverBondAction = Extract<GameAction, { type: 'SEVER_BOND' }>;

export function applySeverBond(world: World, action: SeverBondAction): World {
  // S17 §13.11 LOCKED; S19 P2 orchestrator over disruptionManager helpers.
  // Effect ordering (Council R1 Grok#4 + Gemini#1 BLOCKER): SEVER_ERASE
  // effects emit BEFORE topology mutation (need live prims for pos/color
  // /radius); BOND_SEVERED emits AFTER (end-of-operation marker for audio).
  const bond = world.bonds.get(action.bondId);
  if (bond === undefined) return world;

  const primA = world.primitives.get(bond.aId);
  const primB = world.primitives.get(bond.bId);
  if (primA === undefined || primB === undefined) return world;

  // Capture sever pos before any mutation (audio drain payload).
  const severPos = { x: primA.pos.x, y: primA.pos.y };

  if (!canSeverBond(world, action, primA, primB)) return world;

  const split = severSplit(bond, world.primitives, world.bonds);
  // S52 P2 (LOCKED §13.11 amended — user-authorized) — cycle-no-consume rule
  // REMOVED. Every hostile sever consumes 1 charge regardless of whether the
  // topology split deletes primitives or just removes the bond. Self-sever
  // (both endpoints share the actor's placerColor) still costs 0 via
  // computeBaseCharge — a separate zero-cost path for the actor's own structure.
  const chargeToConsume = computeBaseCharge(world, action, primA, primB);
  if (chargeToConsume > 0) {
    // S61 P1 — inline guarded lookup (was requirePlayer; see module header for
    // the equivalence proof). computeBaseCharge guarantees the actor exists
    // whenever chargeToConsume > 0, so this never silently skips on a real path.
    const actor = world.players.get(action.playerId);
    if (actor !== undefined) actor.disruptionCharges -= chargeToConsume;
  }

  for (const e of computeSeverEraseEffects(world, split, world.tick)) world.effects.push(e);
  applySeverTopology(world, bond, split);
  world.effects.push({
    kind: 'BOND_SEVERED',
    tick: world.tick,
    pos: severPos,
    cause: action.cause,
    // V6-0.3 (S131) — ATTRIBUTION. Captured HERE because this is the last point where either
    // party is still knowable: `applySeverTopology` above has already removed the bond and, on
    // the delete path, its endpoints.
    //
    // ⚠ REACH IS ~1/6 FOR A REMOTE VICTIM, AND THAT IS A RULED LIMITATION, NOT AN OVERSIGHT.
    // These fields ride the NetSnapshot, but `world.effects` is wiped every rendered frame
    // (effectsRenderer.ts:73) while snapshots leave on every 6th tick (SNAPSHOT_INTERVAL_TICKS=6,
    // main.ts:204), so a one-frame effect reaches a remote peer only when it lands on a snapshot
    // frame. On the HOST — solo, VS-BOTS, and the host seat of a 1v1 — delivery is 100%, which is
    // the mode V6-0.3 ships for (S130 owner ruling F1, "accept the narrow ship"). The durable fix
    // is a per-seat synced carrier (a 6-slot array; NOT a global scalar — a sever is
    // high-frequency and per-victim, so a scalar is clobbered inside one frame's <=3-tick drain)
    // and is a logged carry-forward. Consumer-side note: src/render/severToastRenderer.ts.
    actor: severActor(action),
    // Victim for ALL SEVEN causes. `placedBy` is readonly (primitive.ts:28) and a bond's
    // endpoints always share one owner (scoring.ts:99), so primA alone answers it — that is also
    // how the repo already derives bond victims (creatureAI.ts:222, creatureLifecycle.ts:207).
    // NOT `placerColor`: that one is MUTABLE (the rainbow shuffle remaps a whole empire
    // mid-match), so colour-derived identity lies after the first switch.
    // ⚠ EXPIRES WITH STEAL (Phase 2): scoring.ts:99's own caveat says the single-owner rule must
    // be revisited if a cross-player bond feature is added, which would make "the victim" plural.
    victim: primA.placedBy,
  });

  return world;
}

/**
 * V6-0.3 (S131) — pure: which seat, if any, CAUSED this sever.
 *
 * Every dispatcher already puts the responsible seat in `action.playerId`, so this is one rule
 * rather than a seven-arm table — verified at all six dispatch sites:
 *   controls.ts (LMB sever)   cause 'player'   playerId = the local human
 *   botController.ts (bot sever)  cause 'player'   playerId = the bot's own seat
 *   creatureAttack.ts         'creature'/'chewer'  playerId = creature.ownerPlayerId
 *   droneLifecycle.ts:96   cause 'drone'    playerId = drone.ownerPlayerId
 *   bombLifecycle.ts:146   cause 'bomb'     playerId = the picker who placed the bomb
 *   physicsLoop.ts:177     cause 'physics'  playerId = a HARDCODED asPlayerId(0)
 *
 * That last one is the whole reason this function exists. The physics dispatch passes a sentinel
 * its own comment calls "informational" — nobody severed anything, the constraint solver fired —
 * so attributing it would blame seat 0 for every overstretch in the match. It is EXCLUDED, not
 * defaulted.
 *
 * EXHAUSTIVE ON PURPOSE, AND THIS DOES NOT CONTRADICT S130 RISK R-E — read before "simplifying" it
 * back to a one-line deny-list. R-E warns that an exhaustive switch over `cause` is a latent crash
 * because `'godly'` is in the BOND_SEVERED EFFECT union but not the action union. That is true of
 * the RENDER side, which sees effects and therefore uses a tolerant default (see
 * `severToastCopy`). Here the input is `SeverBondAction['cause']`, the SIX-member ACTION union,
 * which has no `'godly'` — so exhaustiveness is both reachable and checkable.
 *
 * It started life as `cause === 'physics' ? undefined : action.playerId`. GROK-ANALYST argued in the
 * S131 CHECK that a deny-list silently ATTRIBUTES any cause added later, so a future dispatcher that
 * passes a placeholder seat would ship mis-attribution with no compile-time warning — exactly the
 * `'physics'` bug, re-introduced. The `never` guard below converts that into a build failure that
 * forces a decision. Same behaviour today, strictly safer tomorrow.
 */
export function severActor(action: SeverBondAction): PlayerId | undefined {
  switch (action.cause) {
    // Nobody severed anything — the constraint solver fired. physicsLoop.ts:177 passes a hardcoded
    // asPlayerId(0) that its own comment calls informational, so attributing it would blame seat 0
    // for every overstretch in the match. EXCLUDED, not defaulted.
    case 'physics':
      return undefined;
    // Verified at each dispatch site to carry the responsible seat: controls.ts:339 (local human),
    // botController.ts (bot sever)(the bot's own seat), creatureAttack.ts        (creature.ownerPlayerId, for
    // both 'creature' and 'chewer'), droneLifecycle.ts:96 (drone.ownerPlayerId), bombLifecycle.ts:146
    // (the picker who placed the bomb).
    case 'player':
    case 'creature':
    case 'chewer':
    case 'drone':
    case 'bomb':
      return action.playerId;
    default: {
      // Adding a member to SEVER_BOND's `cause` union breaks the BUILD here until someone decides
      // whether that dispatcher's playerId is a real actor or a placeholder like physics's.
      const unhandled: never = action.cause;
      return unhandled;
    }
  }
}
