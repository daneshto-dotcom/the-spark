/**
 * SPARK — S191 P12 (`s191/perf`) — THE REFERENCE SCORING PASS. TEST-ONLY. ⛔ Never imported by production
 * code (the `.fixtures.ts` convention).
 *
 * A VERBATIM copy of `computeAllComplexities` and `tickScoring` (with the two weights they read,
 * `PRIM_WEIGHT` / `MAGIC_BONUS`) exactly as they shipped at master 42cc2ee (live deploy #4), before
 * s191/perf memoised the combo lookups per call. The ONLY edits: every name gains a `reference` /
 * `REFERENCE_` prefix, and `applyLeaderDecay` (unchanged, and switched off in production) is imported
 * from `scoring.ts` instead of being a sibling. Checked mechanically when written: the bodies diff to
 * zero lines against `git show 42cc2ee:src/state/scoring.ts` bar the prefixes.
 *
 * `scoringMemo.differential.test.ts` and the SCORING arm of `s191Perf.differential.test.ts` compare the
 * real `computeAllComplexities` against this one (every entry, in insertion order, `Object.is`), and
 * twin A of the long run scores with `referenceTickScoring`. ⚠ IF YOU CHANGE SCORING *BEHAVIOUR*, change
 * THIS FILE FIRST.
 */
import { isFilamentCombo, lookupCombo } from '../combos.ts';
import {
  FILAMENT_INCOME_COMPLEXITY,
  FUNCTIONAL_BOND_CAP_PER_PRIM,
  FUNCTIONAL_BOND_COMPLEXITY,
  KEYSTONE_INCOME_COMPLEXITY,
  KEYSTONE_INCOME_MAX_NEIGHBORS,
  LEADER_DECAY_ENABLED,
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
import { isEliminated } from './elimination.ts';
import { applyLeaderDecay } from './scoring.ts';

const REFERENCE_PRIM_WEIGHT = SCORE_ANCHOR; // 1 — every placed primitive is worth its anchor value
const REFERENCE_MAGIC_BONUS = SCORE_MAGIC_BOND - SCORE_FUNCTIONAL_BOND; // 2 — a magic bond's premium

/**
 * S117 P1 (F1a, audit fix) — compute EVERY player's standing complexity in a SINGLE pass over
 * `world.primitives` + a SINGLE pass over `world.bonds` (was: `computeComplexity` re-walked both
 * global Maps once PER PLAYER inside `referenceTickScoring`, O(P×(prims+bonds)) every tick on the host).
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
export function referenceComputeAllComplexities(world: World): Map<PlayerId, number> {
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
      pc * REFERENCE_PRIM_WEIGHT +
        mb * REFERENCE_MAGIC_BONUS +
        countedFunctional * FUNCTIONAL_BOND_COMPLEXITY +
        flb * FILAMENT_INCOME_COMPLEXITY +
        sc * SPAWNER_INCOME_COMPLEXITY +
        kib * KEYSTONE_INCOME_COMPLEXITY,
    );
  }
  return result;
}

export function referenceTickScoring(world: World): void {
  const perTickFactor = SCORE_INCOME_PER_COMPLEXITY_PER_SEC / PHYSICS_HZ;
  const oldProgress = world.scoreProgress;

  // S117 P1 (F1a) — compute EVERY seat's complexity in one pass (was a per-player re-walk of the
  // prim+bond Maps inside this loop). Byte-identical values, so scoreByPlayer accrues bit-for-bit
  // as before; the per-tick cost drops from O(P×(prims+bonds)) to O(prims+bonds+P) on the host.
  const complexities = referenceComputeAllComplexities(world);

  /*
   * ⛔ S161 CLOSE-OUT (lane 1, CRITICAL) — **A FALLEN SEAT MUST NOT EARN, AND MUST NOT LEAD.**
   *
   * S161 P2 removed the early exit that used to end the match on the first castle to fall. That
   * opened a hole nothing here was written for: an eliminated seat's TOWERS ARE DELIBERATELY LEFT
   * STANDING (see the note in `gathererLifecycle.ts` — what happens to them is an open owner
   * question), so they keep accruing complexity income every FIGHT tick. `world.scoreProgress` is
   * the MAX over all seats, so a corpse could drive it across `PHASE_1_WIN_SCORE` and the score gate
   * — which resolves the winner by scanning `scoreByPlayer` for the maximum — would hand the match
   * to the dead player.
   *
   * ⚠ THE SKIP IS ON BOTH HALVES, and it has to be. Not accruing is not enough: a seat eliminated
   * while already holding the top score would still be returned as leader by the comparison below.
   *
   * ⚠ AND THE TIE-BREAK IS NOW EXPLICIT. `next > max` alone leaves a tie to `players` Map order,
   * which is the S155 N1 defect shape sitting on the win attribution. Lowest seat id wins a tie.
   */
  let leaderId: PlayerId | null = null;
  let max = 0;
  for (const player of world.players.values()) {
    if (isEliminated(player)) continue;
    const complexity = complexities.get(player.id) ?? 0;
    const next = (world.scoreByPlayer.get(player.id) ?? 0) + complexity * perTickFactor;
    world.scoreByPlayer.set(player.id, next);
    const better =
      leaderId === null ||
      next > max ||
      (next === max && (player.id as unknown as number) < (leaderId as unknown as number));
    if (better) {
      max = next;
      leaderId = player.id;
    }
  }
  world.scoreProgress = leaderId === null ? 0 : max;

  // S107 P1 — ANTI-COAST LEADER SCORE-DECAY (gentle proportional rubber-band; see
  // constants.ts for the model + tuning). Applied AFTER income accrual + scoreProgress
  // but BEFORE the tier pulse below, so a net-decay tick can't fire a spurious tier-up.
  // Host-only (referenceTickScoring is !isClient-gated in main.ts) + pure fn of (synced score,
  // tick, constants) → replay byte-equivalent. Skipped in solo (zen sandbox). The decay
  // is self-limiting (floored at the threshold) and never exceeds a live builder's
  // income above the equilibrium complexity, so it never hard-caps a deserved win.
  //
  // S147 P1 (R28) — *"Anti-coast LEADER SCORE-DECAY is switched OFF (retained, not deleted)."*
  // Under the tower-defence cycle, scoring already stops for half of every match (R3: FIGHT only),
  // so the rubber-band would double-punish the leader. LEADER_DECAY_ENABLED is the single switch;
  // every line below it is retained verbatim so restoring the mechanic is a one-token change.
  if (LEADER_DECAY_ENABLED) applyLeaderDecay(world, leaderId);

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
