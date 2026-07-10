/**
 * SPARK — complexity-INCOME scoring (S76 P3).
 *
 * REPLACES the S9-S75 monotonic per-placement accumulator (anchor/functional/magic points
 * banked at placement, never lost — so destroying a structure had ZERO scoring effect, and
 * the solo vs networked `addScore` split let player-1 score differently). The new model:
 *
 *   Each physics tick (HOST-ONLY, from main.ts, PLAYING + !isClient), every player earns
 *   score proportional to the CURRENT total complexity of their standing structures:
 *       scoreByPlayer[p] += SCORE_INCOME_PER_COMPLEXITY_PER_SEC × complexity(p) / PHYSICS_HZ
 *   then scoreProgress = max(scoreByPlayer) for ALL modes (solo = the single value).
 *
 * Consequences (the user's intent, S76):
 *   - Destroying a structure (bomb / potato / sever / disconnect) drops complexity → the
 *     victim gains points SLOWER (their banked score is safe — it's a rate, not a clawback).
 *   - Bigger / more-magic standing structures → faster gain.
 *   - EVERY player scores by the identical path → player-1 consistency (fixes #3b).
 *
 * Determinism: pure function of (world state, tick), host-authoritative, result serialized
 * to clients (who never compute it) — replay-safe, no cross-machine float divergence.
 *
 * Council R1 + PRIME-AUDIT deltas baked in:
 *   Δ1 (Grok) complexity = #prims + 2×#magic (NOT "Σ bond-weights + isolated count", which
 *      punished functional bonding 2→1 = a don't-connect exploit). Functional-neutral; matches
 *      the old accumulator for a finished tree so PHASE_1_WIN_SCORE=50 stays meaningful.
 *   Δ2 (Gemini) single-pass GLOBAL ownership attribution — a bond is credited to exactly ONE
 *      owner (bond.a.placedBy); no double-count even if a cross-colour bond ever exists.
 *   Δ5 (Grok) SCORE_TIER pulses retained (moved here from placePrimitive) so the leader still
 *      gets tier-up feedback as the bar climbs.
 */

import { isFilamentCombo, lookupCombo } from '../combos.ts';
import {
  FILAMENT_INCOME_COMPLEXITY,
  FUNCTIONAL_BOND_CAP_PER_PRIM,
  FUNCTIONAL_BOND_COMPLEXITY,
  KEYSTONE_INCOME_COMPLEXITY,
  KEYSTONE_INCOME_MAX_NEIGHBORS,
  LEADER_DECAY_RATE_PER_SEC,
  LEADER_DECAY_THRESHOLD_FRACTION,
  PHASE_1_WIN_SCORE,
  PHYSICS_HZ,
  SCORE_ANCHOR,
  SCORE_FUNCTIONAL_BOND,
  SCORE_INCOME_PER_COMPLEXITY_PER_SEC,
  SCORE_MAGIC_BOND,
  SCORE_TIER_STEP,
  SPAWNER_INCOME_COMPLEXITY,
} from '../constants.ts';
import type { PlayerId } from '../types.ts';
import type { World } from './worldTypes.ts';

// Complexity weights derived from the per-element scoring weights so standing complexity
// reproduces the old S9 accumulator for a finished tree (see constants.ts comment).
const PRIM_WEIGHT = SCORE_ANCHOR; // 1 — every placed primitive is worth its anchor value
const MAGIC_BONUS = SCORE_MAGIC_BOND - SCORE_FUNCTIONAL_BOND; // 2 — a magic bond's premium

/**
 * S114 G4 — the current score LEADER's seat: the player with the strictly-highest
 * `scoreByPlayer` where score > 0. Tie-break by `world.players` INSERTION ORDER (Map
 * iteration order) via the strict `>` keep-first rule, which matches the HUD leaderboard's
 * stable descending sort (`ui.ts` `ranked[0]`) so the in-world crown and the HUD `*` marker
 * always agree on who leads. Returns `null` when no seat has scored yet (nothing is crowned
 * over a 0–0 board). Pure + render-safe: reads only synced state, never mutates.
 */
export function leaderPlayerId(world: World): PlayerId | null {
  let leader: PlayerId | null = null;
  let best = 0;
  for (const player of world.players.values()) {
    const score = world.scoreByPlayer.get(player.id) ?? 0;
    if (score > best) {
      best = score;
      leader = player.id;
    }
  }
  return leader;
}

/**
 * Standing structure complexity for one player. Pure fn of world state.
 *   = (# primitives placed by p) × PRIM_WEIGHT + (# of p's MAGIC bonds) × MAGIC_BONUS
 *     + min(# functional bonds, ⌊1.5 × prims⌋) × 0.25   (S84 P4 — see constants.ts)
 *     + (# of p's FILAMENT bonds) × FILAMENT_INCOME_COMPLEXITY   (S90 P1 — Filaments are ALSO
 *       counted as magic bonds above, so this is an INTENDED extra trickle, not a double-count bug)
 *     + Σ over p's un-fouled Filaments of min(#un-fouled magic neighbors, KEYSTONE_INCOME_MAX_NEIGHBORS)
 *       × KEYSTONE_INCOME_COMPLEXITY   (S121 P2 — INCOME KEYSTONE: a Filament pays a capped bonus for the
 *       magic bonds branched off it; the income-axis mirror of the rigidity Keystone Anchor)
 *
 * Ownership (Δ2): one pass over each global Map, crediting each element to exactly one
 * owner — a primitive → its `placedBy`; a bond → its `aId` primitive's `placedBy` (both
 * endpoints share one colour/player since cross-colour bonds are impossible, but crediting
 * the aId-owner is correct AND double-count-safe if that invariant is ever violated).
 * Magic-ness is re-derived via lookupCombo(aId.type, bId.type) — the SAME carried→target
 * order placePrimitive.makeBond used, so it matches the bond's original magic classification.
 * aId is deterministic (= the newly-placed prim in makeBond, host-authoritative), so attribution
 * is replay-stable. (S76 CHECK / Gemini-AUDITOR flagged "a bond between two players' prims would
 * credit only one owner non-deterministically" — REFUTED: cross-colour bonds cannot form
 * [placePrimitive demotes a cross-colour target to anchor + same-colour-filters merge candidates]
 * and placedBy is readonly, so a bond's endpoints ALWAYS share one owner. If a future cross-player
 * bond feature [e.g. Steal] is ever added, revisit this single-owner rule.)
 */
export function computeComplexity(world: World, playerId: PlayerId): number {
  // S117 P1 (F1a) — thin wrapper over the single-pass computeAllComplexities so there is ONE
  // implementation of the complexity formula (Council/Gemini mandate: no parallel code path to
  // drift). Byte-identical to the pre-S117 per-player walk BY CONSTRUCTION (same integer counts,
  // same one-shot final expression). Single-shot callers (the WIN-forensics log in gameState.ts,
  // debugOverlay) pay one full pass per call — negligible (they fire once per match / on the
  // ?debug overlay), and the per-tick hot path (tickScoring) computes the map ONCE for all seats.
  return computeAllComplexities(world).get(playerId) ?? 0;
}

/**
 * S117 P1 (F1a, audit fix) — compute EVERY player's standing complexity in a SINGLE pass over
 * `world.primitives` + a SINGLE pass over `world.bonds` (was: `computeComplexity` re-walked both
 * global Maps once PER PLAYER inside `tickScoring`, O(P×(prims+bonds)) every tick on the host).
 *
 * BYTE-IDENTICAL to the former per-player walk by construction, and the byte-identity is the whole
 * point (replay determinism / 1v1-mirror). The proof:
 *   1. Every count is an INTEGER (`primCount`/`magicBonds`/… ++) bucketed by the SAME ownership
 *      predicate the old loop used — a prim credits `prim.placedBy` (skip fouled); a bond credits
 *      its `aId`-primitive's `placedBy` (the old "credit each bond to ONE owner: bond.aId's placer"
 *      rule), with the IDENTICAL undefined-endpoint + fouled-endpoint skips; a spawner credits
 *      `sp.ownerPlayerId`. Integer counting is order-independent, so Map-iteration order is irrelevant.
 *   2. The final value per player is the SAME one-shot expression as before — there is NO incremental
 *      float accumulation anywhere (the old code also counted ints then multiplied once), so there is
 *      no IEEE-754 summation-order hazard to introduce. `state/scoring.differential.test.ts` proves
 *      bit-exact (`Object.is`) equivalence vs a reference per-player loop across many random worlds,
 *      and the 24 save.replay byte-identity tests guard the live path.
 *
 * Returns a value for every seated player AND every owner that appears in the counts (union), so the
 * `computeComplexity` wrapper matches the old function for ANY playerId (absent ⇒ 0, same as before).
 */
export function computeAllComplexities(world: World): Map<PlayerId, number> {
  const primCount = new Map<PlayerId, number>();
  const magicBonds = new Map<PlayerId, number>();
  const functionalBonds = new Map<PlayerId, number>();
  const filamentBonds = new Map<PlayerId, number>();
  const spawnerCount = new Map<PlayerId, number>();
  const inc = (m: Map<PlayerId, number>, k: PlayerId): void => {
    m.set(k, (m.get(k) ?? 0) + 1);
  };

  // S77 P3 — a poop-FOULED primitive earns nothing (its whole structure's income stops until
  // cleaned). O(1) Set check; the set is empty in the common case.
  for (const prim of world.primitives.values()) {
    if (!world.fouledPrimitives.has(prim.id)) inc(primCount, prim.placedBy);
  }
  for (const bond of world.bonds.values()) {
    // Resolve endpoints via id — bond.a/.b are PhysicsBody refs (pos only), not Primitives.
    // Credit each bond to ONE owner: its aId primitive's placer (Δ2). Skip a bond that
    // references a deleted primitive (defensive — keeps complexity well-defined mid-teardown).
    const a = world.primitives.get(bond.aId);
    if (a === undefined) continue;
    const b = world.primitives.get(bond.bId);
    if (b === undefined) continue;
    // S77 P3 — skip a fouled structure's bonds too (either endpoint fouled), consistent with
    // skipping its prims above, so a poop-fouled structure earns ZERO until cleaned.
    if (world.fouledPrimitives.has(bond.aId) || world.fouledPrimitives.has(bond.bId)) continue;
    if (lookupCombo(a.type, b.type).isMagical) {
      inc(magicBonds, a.placedBy);
      // S90 P1 (G1b ECONOMY) — a Filament ALSO earns the income trickle (extra, on top of the
      // magic premium). The 2nd lookup only fires for the handful of magic bonds.
      if (isFilamentCombo(a.type, b.type)) inc(filamentBonds, a.placedBy);
    } else {
      inc(functionalBonds, a.placedBy);
    }
  }
  // S100 P1 (TD Phase 1a) — NEAR-ZERO passive income per LIVE owned spawner (raid it to stop it).
  for (const sp of world.creatureSpawners.values()) {
    inc(spawnerCount, sp.ownerPlayerId);
  }

  // S121 P2 (B3) — INCOME KEYSTONE: each un-fouled FILAMENT confers income to up to
  // KEYSTONE_INCOME_MAX_NEIGHBORS of the un-fouled MAGIC bonds branched off its endpoint prims. A SECOND
  // bond pass — it needs adjacency (prim.bonds), which the count-only first pass does not walk. Gated on
  // isFilamentCombo so non-Filaments (the overwhelming majority) skip before any neighbor scan. Credited to
  // the Filament's aId-placer (same single-owner attribution as every other term; segregation guarantees the
  // neighbors are same-owner). The per-Filament min() cap bounds it (Council Q1) and keeps it order-
  // independent (integer count → the SUM is Map-iteration-order-invariant → replay-self-consistent).
  const keystoneBlessed = new Map<PlayerId, number>();
  for (const fil of world.bonds.values()) {
    const fa = world.primitives.get(fil.aId);
    if (fa === undefined) continue;
    const fb = world.primitives.get(fil.bId);
    if (fb === undefined) continue;
    if (!isFilamentCombo(fa.type, fb.type)) continue;
    if (world.fouledPrimitives.has(fil.aId) || world.fouledPrimitives.has(fil.bId)) continue;
    let n = 0;
    for (const prim of [fa, fb]) {
      for (const neighborBondId of prim.bonds) {
        if (neighborBondId === fil.id) continue; // the Filament is not its own neighbor
        const nb = world.bonds.get(neighborBondId);
        if (nb === undefined) continue;
        const na = world.primitives.get(nb.aId);
        if (na === undefined) continue;
        const nbEnd = world.primitives.get(nb.bId);
        if (nbEnd === undefined) continue;
        if (!lookupCombo(na.type, nbEnd.type).isMagical) continue; // only magic neighbors are blessed
        if (world.fouledPrimitives.has(nb.aId) || world.fouledPrimitives.has(nb.bId)) continue;
        n++;
      }
    }
    if (n > KEYSTONE_INCOME_MAX_NEIGHBORS) n = KEYSTONE_INCOME_MAX_NEIGHBORS;
    keystoneBlessed.set(fa.placedBy, (keystoneBlessed.get(fa.placedBy) ?? 0) + n);
  }

  // Finalize each player with the IDENTICAL one-shot expression. Union of (owners that appear) ∪
  // (seated players) so a value exists for every id the old per-player function would return.
  const owners = new Set<PlayerId>();
  for (const m of [primCount, magicBonds, functionalBonds, filamentBonds, spawnerCount, keystoneBlessed]) {
    for (const k of m.keys()) owners.add(k);
  }
  for (const player of world.players.values()) owners.add(player.id);

  const result = new Map<PlayerId, number>();
  for (const pid of owners) {
    const pc = primCount.get(pid) ?? 0;
    const mb = magicBonds.get(pid) ?? 0;
    const fb = functionalBonds.get(pid) ?? 0;
    const flb = filamentBonds.get(pid) ?? 0;
    const sc = spawnerCount.get(pid) ?? 0;
    const kib = keystoneBlessed.get(pid) ?? 0; // S121 P2 — Σ per-Filament min(magicNeighbors, cap)
    // S84 P4 — functional bonds capped at FUNCTIONAL_BOND_CAP_PER_PRIM × prims (spanning tree counts
    // fully; dense clique caps out so bond-spam can't dominate). Cap uses the UN-fouled prim count.
    const countedFunctional = Math.min(fb, Math.floor(FUNCTIONAL_BOND_CAP_PER_PRIM * pc));
    result.set(
      pid,
      pc * PRIM_WEIGHT +
        mb * MAGIC_BONUS +
        countedFunctional * FUNCTIONAL_BOND_COMPLEXITY +
        flb * FILAMENT_INCOME_COMPLEXITY +
        sc * SPAWNER_INCOME_COMPLEXITY +
        kib * KEYSTONE_INCOME_COMPLEXITY,
    );
  }
  return result;
}

/**
 * Host-only per-tick scoring accrual. Call once per physics tick BEFORE tickGameState
 * (so the WIN check + the hunter 75% trigger see the freshly-accrued scoreProgress).
 * Solo: world.isHost is true (local player IS the authority) → runs locally.
 */
export function tickScoring(world: World): void {
  const perTickFactor = SCORE_INCOME_PER_COMPLEXITY_PER_SEC / PHYSICS_HZ;
  const oldProgress = world.scoreProgress;

  // S117 P1 (F1a) — compute EVERY seat's complexity in one pass (was a per-player re-walk of the
  // prim+bond Maps inside this loop). Byte-identical values, so scoreByPlayer accrues bit-for-bit
  // as before; the per-tick cost drops from O(P×(prims+bonds)) to O(prims+bonds+P) on the host.
  const complexities = computeAllComplexities(world);

  let leaderId: PlayerId | null = null;
  let max = 0;
  for (const player of world.players.values()) {
    const complexity = complexities.get(player.id) ?? 0;
    const next = (world.scoreByPlayer.get(player.id) ?? 0) + complexity * perTickFactor;
    world.scoreByPlayer.set(player.id, next);
    if (leaderId === null || next > max) {
      max = next;
      leaderId = player.id;
    }
  }
  world.scoreProgress = leaderId === null ? 0 : max;

  // S107 P1 — ANTI-COAST LEADER SCORE-DECAY (gentle proportional rubber-band; see
  // constants.ts for the model + tuning). Applied AFTER income accrual + scoreProgress
  // but BEFORE the tier pulse below, so a net-decay tick can't fire a spurious tier-up.
  // Host-only (tickScoring is !isClient-gated in main.ts) + pure fn of (synced score,
  // tick, constants) → replay byte-equivalent. Skipped in solo (zen sandbox). The decay
  // is self-limiting (floored at the threshold) and never exceeds a live builder's
  // income above the equilibrium complexity, so it never hard-caps a deserved win.
  if (world.gameMode !== 'solo' && leaderId !== null) {
    const threshold = PHASE_1_WIN_SCORE * LEADER_DECAY_THRESHOLD_FRACTION;
    const leaderScore = world.scoreByPlayer.get(leaderId) ?? 0;
    if (leaderScore > threshold) {
      const bleed = (LEADER_DECAY_RATE_PER_SEC / PHYSICS_HZ) * (leaderScore - threshold);
      world.scoreByPlayer.set(leaderId, Math.max(threshold, leaderScore - bleed));
      // Re-derive scoreProgress as the true post-decay max. Gentle per-tick bleed means
      // the leader almost always stays the leader, but a near-tie could flip — keep the
      // WIN gate + HUNTER trigger (which read scoreProgress elsewhere) exactly correct.
      let decayedMax = 0;
      for (const v of world.scoreByPlayer.values()) if (v > decayedMax) decayedMax = v;
      world.scoreProgress = decayedMax;
    }
  }

  // Δ5 — SCORE_TIER pulse: one per SCORE_TIER_STEP boundary the LEADER's scoreProgress
  // crosses this tick, at the leader's avatar. Host-local visual flair (not serialized);
  // gated on cinematicsEnabled like the other structure cinematics.
  if (world.cinematicsEnabled && leaderId !== null && world.scoreProgress > oldProgress) {
    const oldTier = Math.floor(oldProgress / SCORE_TIER_STEP);
    const newTier = Math.floor(world.scoreProgress / SCORE_TIER_STEP);
    if (newTier > oldTier) {
      const leader = world.players.get(leaderId);
      const pos = leader
        ? { x: leader.avatarPos.x, y: leader.avatarPos.y }
        : { x: 0, y: 0 };
      for (let t = oldTier + 1; t <= newTier; t++) {
        world.effects.push({
          kind: 'SCORE_TIER',
          tick: world.tick,
          tier: t,
          color: leader?.color ?? 0xffffff,
          pos,
        });
      }
    }
  }
}
