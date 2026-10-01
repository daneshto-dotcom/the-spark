/**
 * SPARK — S192 T16: EVERY STANDING TV GETS ITS VOLTKIN BACK, EVERY WAVE.
 *
 * Owner, S192 playtest (T16, verbatim in `.claude/plans/S192_OWNER_PLAYTEST_LIST.md`):
 * *"Voltkins, when they are … killed, sometimes they don't regenerate the next wave, even though …
 * their structure is … healthy. … I had five TVs, full health, but no new Voltkins each new wave
 * phase. I had to … rebuild the Voltkin tower … sometimes even only one."*
 *
 * ## What was missing
 *
 * "TV" is the Voltkin tower — the 4-Square + 4-Triangle chain he climbs out of. It is a CINEMATIC
 * recipe, not a spawner: a Voltkin was minted ONCE per ignition (a `BOND_FORMED` touching a freshly
 * closed chain), lived 20 s of the next FIGHT on the `'fight'` clock, and faded. **Nothing ever
 * summoned another** while the TV stood; the only "regeneration" he could have seen was a FIX of a
 * damaged TV re-emitting `BOND_FORMED`, which is why rebuilding was his workaround.
 *
 * ## The rule (the R190-J analogue)
 *
 * R190-J, for Helga: *"Every fight she should come back as long as the tower is still up."* The TV
 * gets the same rule, on the same edge: at FIGHT→BUILD every standing TV that has no Voltkin gets
 * one, at its centre, through the ordinary `SPAWN_CREATURE` reducer. Born in BUILD, he stands at
 * home the whole BUILD and his 20 s starts with the next FIGHT (the S155 one-step `'fight'` clock).
 *
 * ⚠ MINE, NOT HIS — `VOLTKINS_PER_TV` (one) and the edge (FIGHT→BUILD, Helga's, so the player sees
 * him back for the whole BUILD). He said "each new wave"; he did not say how many per TV or at which
 * whistle. Both are one-line changes and are flagged in `S192_CANON_NOTES_voltkin.md`.
 *
 * ## Determinism
 *
 * Every decision is a total order, never `Map` iteration:
 *   · the TVs come from `findAllVoltkinChainsCanonical` (sorted starts, sorted bond walk, sorted by
 *     member set), so a host and a worker restored from a save count the same TVs;
 *   · a TV's seat is decided over the players in ascending id (majority of member `placerColor`,
 *     lowest seat on a tie);
 *   · existing Voltkins are BOUND to TVs greedily over (squared distance, claim rank, TV index),
 *     claims ranked scheduled-summons first and then live creatures by ascending id;
 *   · spawns are dispatched in TV order, so `nextCreatureId` advances identically on every sim.
 *
 * ⚠ HOST-ONLY. Called from `runHostTick`, which a client never runs. Nothing here adds a field, a
 * hash input or a wire value; the minted creature is the existing `'voltkin'` type.
 */

import { dispatch, type World } from './world.ts';
import { findAllVoltkinChainsCanonical } from './godlyRecipes/voltkinChainWalk.ts';
import { computeStubTargetPos } from '../physics/creatureVerlet.ts';
import type { PlayerId, PrimitiveId } from '../types.ts';

/**
 * ⚠ MINE — ONE Voltkin per standing TV. His words were *"I had five TVs … but no new Voltkins"*: five
 * towers, the expectation five summons. A per-seat cap or a second Voltkin per TV would be a design
 * change he has not asked for.
 */
export const VOLTKINS_PER_TV = 1;

export interface StandingVoltkinTv {
  /** The chain's eight members, ascending id. */
  readonly members: readonly PrimitiveId[];
  /** Mean of the members' positions, summed in ascending-id order. */
  readonly centre: { readonly x: number; readonly y: number };
  /** The seat the TV summons for. */
  readonly owner: PlayerId;
}

/**
 * The seat a TV belongs to: the player whose colour is on the most of its members, lowest seat id on
 * a tie. With NO member matching any live player's colour (the S23 P3 colour-drift case the ignition
 * predicate also guards), the lowest-id player — the predicate's own fallback, made total.
 */
export function voltkinTvOwner(world: World, members: readonly PrimitiveId[]): PlayerId | null {
  const players = [...world.players.values()].sort((a, b) => Number(a.id) - Number(b.id));
  if (players.length === 0) return null;
  let best: PlayerId | null = null;
  let bestCount = 0;
  for (const p of players) {
    let n = 0;
    for (const id of members) {
      if (world.primitives.get(id)?.placerColor === p.color) n += 1;
    }
    if (n > bestCount) {
      best = p.id;
      bestCount = n;
    }
  }
  return best ?? players[0]!.id;
}

/** Every TV standing on the board, in the canonical order. */
export function standingVoltkinTvs(world: World): StandingVoltkinTv[] {
  const out: StandingVoltkinTv[] = [];
  for (const chain of findAllVoltkinChainsCanonical(world)) {
    const members = [...chain].sort((a, b) => Number(a) - Number(b));
    let sumX = 0;
    let sumY = 0;
    let n = 0;
    for (const id of members) {
      const p = world.primitives.get(id);
      if (p === undefined) continue;
      sumX += p.pos.x;
      sumY += p.pos.y;
      n += 1;
    }
    if (n === 0) continue;
    const owner = voltkinTvOwner(world, members);
    if (owner === null) continue;
    out.push({ members, centre: { x: sumX / n, y: sumY / n }, owner });
  }
  return out;
}

/**
 * Mint one Voltkin for `owner` at `pos` — the exact action `hostTick`'s `pendingCreatureSpawn` poll
 * dispatches (`hostTick.ts`, "S28 P0 — Step 0"), kept field-for-field identical and pinned so by
 * `voltkinResummon.test.ts`. ⚠ The poll keeps its own inline copy because the S192 brief limits this
 * branch to ONE hostTick hunk; folding it onto this helper is a safe follow-up for the merge owner.
 */
export function dispatchVoltkinSpawn(
  world: World,
  owner: PlayerId,
  pos: { readonly x: number; readonly y: number },
): void {
  const spawnTargetPos = computeStubTargetPos(world.tick, owner);
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: 'voltkin',
    ownerPlayerId: owner,
    pos: { x: pos.x, y: pos.y },
    targetPos: spawnTargetPos,
  });
}

interface VoltkinClaim {
  readonly owner: PlayerId;
  readonly pos: { readonly x: number; readonly y: number };
  /** Total-order tiebreak: scheduled summons first, then live creatures by ascending id. */
  readonly rank: number;
}

/**
 * Who already holds a TV's Voltkin: every live (not fading) Voltkin, plus every summon already on its
 * way — the single-slot `pendingCreatureSpawn` and any Voltkin event still waiting in
 * `pendingCinematics`. Counting the in-flight ones is what stops a TV closed in the last instant of
 * a phase being summoned for twice.
 */
function voltkinClaims(world: World): VoltkinClaim[] {
  const claims: VoltkinClaim[] = [];
  let rank = 0;
  const pending = world.pendingCreatureSpawn;
  if (pending !== null) {
    claims.push({ owner: pending.event.triggererPlayerId, pos: pending.event.targetPos, rank: rank++ });
  }
  for (const ev of world.pendingCinematics) {
    if (ev.godlyId !== 'voltkin') continue;
    claims.push({ owner: ev.triggererPlayerId, pos: ev.targetPos, rank: rank++ });
  }
  const live = [...world.creatures.values()]
    .filter((c) => c.type === 'voltkin' && c.state !== 'DESPAWNING')
    .sort((a, b) => Number(a.id) - Number(b.id));
  for (const c of live) claims.push({ owner: c.ownerPlayerId, pos: c.pos, rank: rank++ });
  return claims;
}

/**
 * Which TVs (by index into `tvs`) still owe a Voltkin. Each claim binds to at most one TV of ITS
 * OWN seat, each TV takes at most `VOLTKINS_PER_TV` claims, nearest first over a total order.
 */
export function tvsOwedAVoltkin(world: World, tvs: readonly StandingVoltkinTv[]): number[] {
  const claims = voltkinClaims(world);
  const pairs: Array<{ d2: number; claim: number; tv: number }> = [];
  for (let ci = 0; ci < claims.length; ci++) {
    const c = claims[ci]!;
    for (let ti = 0; ti < tvs.length; ti++) {
      const tv = tvs[ti]!;
      if (tv.owner !== c.owner) continue;
      const dx = c.pos.x - tv.centre.x;
      const dy = c.pos.y - tv.centre.y;
      pairs.push({ d2: dx * dx + dy * dy, claim: claims[ci]!.rank, tv: ti });
    }
  }
  pairs.sort((a, b) => a.d2 - b.d2 || a.claim - b.claim || a.tv - b.tv);
  const claimBound = new Set<number>();
  const tvFill = new Array<number>(tvs.length).fill(0);
  for (const p of pairs) {
    if (claimBound.has(p.claim)) continue;
    if (tvFill[p.tv]! >= VOLTKINS_PER_TV) continue;
    claimBound.add(p.claim);
    tvFill[p.tv]! += 1;
  }
  const owed: number[] = [];
  for (let ti = 0; ti < tvs.length; ti++) {
    for (let k = tvFill[ti]!; k < VOLTKINS_PER_TV; k++) owed.push(ti);
  }
  return owed;
}

/**
 * ⭐ THE EDGE ACTION — `hostTick`'s FIGHT→BUILD arm calls this once, after `recallArmies` (which
 * would otherwise teleport a just-minted Voltkin from his TV to the castle). A fallen or broken TV is
 * not a chain any more, so it is not in the census and summons nothing.
 */
export function resummonVoltkins(world: World): void {
  if (!world.isHost || world.gameState !== 'PLAYING') return;
  const tvs = standingVoltkinTvs(world);
  if (tvs.length === 0) return;
  for (const ti of tvsOwedAVoltkin(world, tvs)) {
    const tv = tvs[ti]!;
    dispatchVoltkinSpawn(world, tv.owner, tv.centre);
  }
}
