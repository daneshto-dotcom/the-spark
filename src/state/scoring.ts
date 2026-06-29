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
  let primCount = 0;
  for (const prim of world.primitives.values()) {
    // S77 P3 — a poop-FOULED primitive earns nothing: a seagull poop fouls the whole connected
    // structure, so that structure's income stops until cleaned ("the whole structure stops
    // generating income"). O(1) Set check; the set is empty in the common (un-fouled) case.
    if (prim.placedBy === playerId && !world.fouledPrimitives.has(prim.id)) primCount++;
  }
  let magicBonds = 0;
  let functionalBonds = 0;
  let filamentBonds = 0; // S90 P1 — Filaments earn an EXTRA trickle on top of the magic premium
  for (const bond of world.bonds.values()) {
    // Resolve endpoints via id — bond.a/.b are PhysicsBody refs (pos only), not Primitives.
    // Credit each bond to ONE owner: its aId primitive's placer (Δ2). Skip a bond that
    // references a deleted primitive (defensive — keeps complexity well-defined mid-teardown).
    const a = world.primitives.get(bond.aId);
    if (a === undefined || a.placedBy !== playerId) continue;
    const b = world.primitives.get(bond.bId);
    if (b === undefined) continue;
    // S77 P3 — skip a fouled structure's magic bonds too (either endpoint fouled), consistent
    // with skipping its prims above, so a poop-fouled structure earns ZERO until cleaned.
    if (world.fouledPrimitives.has(bond.aId) || world.fouledPrimitives.has(bond.bId)) continue;
    if (lookupCombo(a.type, b.type).isMagical) {
      magicBonds++;
      // S90 P1 (G1b ECONOMY) — a Filament (Dot→Line) ALSO earns the income trickle. The 2nd
      // lookup only fires for the handful of magic bonds (functional bonds skip it). The
      // fouled-skip above already zeroes a poop-fouled Filament, same as every other bond.
      if (isFilamentCombo(a.type, b.type)) filamentBonds++;
    } else {
      functionalBonds++;
    }
  }
  // S84 P4 — functional bonds re-enter complexity at FUNCTIONAL_BOND_COMPLEXITY each, with
  // the COUNTED bonds capped at FUNCTIONAL_BOND_CAP_PER_PRIM × prims: a spanning tree
  // (n−1 bonds) counts fully — a connected structure now out-earns the same prims
  // scattered (the S84 field report's flattening) — while a dense clique field caps out,
  // so bond-spam cannot dominate (Council S84; the S76 don't-connect exploit cannot
  // return because bonding only ever ADDS). Cap uses the UN-fouled prim count: fouling
  // already zeroes those prims + bonds above, keeping the cap consistent.
  const countedFunctional = Math.min(
    functionalBonds,
    Math.floor(FUNCTIONAL_BOND_CAP_PER_PRIM * primCount),
  );
  // S100 P1 (TD Phase 1a) — NEAR-ZERO passive income for each LIVE spawner this player
  // owns (TOWER_DEFENSE_DESIGN.md §2.7/§4.2). Recomputed from live state every tick (no
  // parallel accrual loop): destroy a player's spawner (the re-validation poll dispatches
  // REMOVE_SPAWNER → the map shrinks) and this term vanishes the SAME tick — "raid it to
  // stop its income" works for free. Kept tiny (SPAWNER_INCOME_COMPLEXITY=0.5) so it never
  // threatens the protected PHASE_1_WIN_SCORE=630 anchor; the real balance lever is
  // destruction throughput, not income. O(spawners) — bounded by the per-player spawner
  // count (typically 0-1), negligible next to the prim/bond passes above.
  let spawnerCount = 0;
  for (const sp of world.creatureSpawners.values()) {
    if (sp.ownerPlayerId === playerId) spawnerCount++;
  }
  return (
    primCount * PRIM_WEIGHT +
    magicBonds * MAGIC_BONUS +
    countedFunctional * FUNCTIONAL_BOND_COMPLEXITY +
    filamentBonds * FILAMENT_INCOME_COMPLEXITY +
    spawnerCount * SPAWNER_INCOME_COMPLEXITY
  );
}

/**
 * Host-only per-tick scoring accrual. Call once per physics tick BEFORE tickGameState
 * (so the WIN check + the hunter 75% trigger see the freshly-accrued scoreProgress).
 * Solo: world.isHost is true (local player IS the authority) → runs locally.
 */
export function tickScoring(world: World): void {
  const perTickFactor = SCORE_INCOME_PER_COMPLEXITY_PER_SEC / PHYSICS_HZ;
  const oldProgress = world.scoreProgress;

  let leaderId: PlayerId | null = null;
  let max = 0;
  for (const player of world.players.values()) {
    const complexity = computeComplexity(world, player.id);
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
