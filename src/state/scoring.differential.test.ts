/**
 * SPARK — S117 P1 (F1a) DIFFERENTIAL determinism test.
 *
 * Proves computeAllComplexities() is BIT-FOR-BIT equal to the pre-S117 per-player
 * computeComplexity walk, across many random worlds. This is the equivalence gate the
 * Council mandated for the hot-path refactor: `referenceComplexity` below is a VERBATIM
 * copy of the old loop, and every assertion uses `.toBe()` (Object.is) so a single last-bit
 * float divergence fails the test. (The formula counts integers then multiplies once, so
 * there is no incremental float accumulation to reorder — but we prove it, not assume it.)
 *
 * The 24 save.replay byte-identity tests guard the LIVE tick path; this guards the function
 * in isolation over adversarial ownership shapes (interleaved owners, fouled prims, cap
 * boundary, spawners, 0/1/N players, empty).
 */

import { describe, expect, it } from 'vitest';
import {
  FILAMENT_INCOME_COMPLEXITY,
  FUNCTIONAL_BOND_CAP_PER_PRIM,
  FUNCTIONAL_BOND_COMPLEXITY,
  SCORE_ANCHOR,
  SCORE_FUNCTIONAL_BOND,
  SCORE_MAGIC_BOND,
  SPAWNER_INCOME_COMPLEXITY,
  SparkType,
  ALL_SPARK_TYPES,
  PLAYER_COLORS,
} from '../constants.ts';
import { isFilamentCombo, lookupCombo } from '../combos.ts';
import { makeIdlePlayer } from '../game/player.ts';
import type { Primitive } from '../game/primitive.ts';
import type { CreatureSpawner } from './spawners/spawner.ts';
import { mulberry32 } from './rng.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSpawnerId, type PlayerId } from '../types.ts';
import { makeWorld, type World } from './world.ts';
import { computeAllComplexities, computeComplexity } from './scoring.ts';

const PRIM_WEIGHT = SCORE_ANCHOR;
const MAGIC_BONUS = SCORE_MAGIC_BOND - SCORE_FUNCTIONAL_BOND;

/** VERBATIM copy of the pre-S117 per-player computeComplexity loop — the reference oracle. */
function referenceComplexity(world: World, playerId: PlayerId): number {
  let primCount = 0;
  for (const prim of world.primitives.values()) {
    if (prim.placedBy === playerId && !world.fouledPrimitives.has(prim.id)) primCount++;
  }
  let magicBonds = 0;
  let functionalBonds = 0;
  let filamentBonds = 0;
  for (const bond of world.bonds.values()) {
    const a = world.primitives.get(bond.aId);
    if (a === undefined || a.placedBy !== playerId) continue;
    const b = world.primitives.get(bond.bId);
    if (b === undefined) continue;
    if (world.fouledPrimitives.has(bond.aId) || world.fouledPrimitives.has(bond.bId)) continue;
    if (lookupCombo(a.type, b.type).isMagical) {
      magicBonds++;
      if (isFilamentCombo(a.type, b.type)) filamentBonds++;
    } else {
      functionalBonds++;
    }
  }
  const countedFunctional = Math.min(functionalBonds, Math.floor(FUNCTIONAL_BOND_CAP_PER_PRIM * primCount));
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

function randWorld(seed: number): World {
  const rng = mulberry32(seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
  const w = makeWorld(seed >>> 0);
  w.gameMode = '1v1';
  // 0..4 players (P0 already seated by makeWorld); interleave seats.
  const nPlayers = Math.floor(rng() * 5);
  for (let s = 1; s <= nPlayers; s++) {
    const pid = asPlayerId(s);
    if (!w.players.has(pid)) {
      w.players.set(pid, makeIdlePlayer(pid, PLAYER_COLORS[s % PLAYER_COLORS.length], { x: s * 100, y: 200 }));
      w.scoreByPlayer.set(pid, 0);
    }
  }
  // Owners drawn from a slightly WIDER range than seated (0..5) so some prims/bonds belong to
  // non-seated owners — exercises the union + the wrapper's any-id contract.
  const ownerOf = (): PlayerId => asPlayerId(Math.floor(rng() * 6));

  const prims: Primitive[] = [];
  const nPrims = Math.floor(rng() * 40); // 0..39, includes empty worlds
  let idc = 0;
  for (let i = 0; i < nPrims; i++) {
    const id = asPrimitiveId(idc++);
    const owner = ownerOf();
    const color = PLAYER_COLORS[(owner as unknown as number) % PLAYER_COLORS.length];
    const type = pick(ALL_SPARK_TYPES);
    const prim: Primitive = {
      id, type, placerColor: color, placedBy: owner, createdTick: 0,
      pos: { x: rng() * 1000, y: rng() * 700 }, prevPos: { x: 0, y: 0 },
      bonds: new Set(), ownerColor: color, lastOwnershipChange: 0, radius: 8,
    };
    w.primitives.set(id, prim);
    prims.push(prim);
  }
  // Bonds between random prim pairs (aId owner drives credit — same as production makeBond order).
  const nBonds = prims.length > 1 ? Math.floor(rng() * prims.length * 2) : 0;
  for (let i = 0; i < nBonds; i++) {
    const a = pick(prims);
    const b = pick(prims);
    if (a.id === b.id) continue;
    const id = asBondId(idc++);
    w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: 30, stiffnessTier: 'MID', createdTick: 0 });
    a.bonds.add(id);
    b.bonds.add(id);
  }
  // Foul a random subset of prims (income halt) — some bonds will have a fouled endpoint.
  for (const p of prims) {
    if (rng() < 0.15) w.fouledPrimitives.add(p.id);
  }
  // Random owned spawners (only ownerPlayerId is read by the complexity formula).
  const nSpawners = Math.floor(rng() * 4);
  for (let i = 0; i < nSpawners; i++) {
    w.creatureSpawners.set(
      asSpawnerId(idc++),
      { ownerPlayerId: ownerOf() } as unknown as CreatureSpawner,
    );
  }
  return w;
}

describe('S117 P1 (F1a) — computeAllComplexities is BIT-EXACT vs the per-player reference', () => {
  it('bit-identical for every id (seated + non-seated) across 600 random worlds', () => {
    for (let seed = 1; seed <= 600; seed++) {
      const w = randWorld(seed);
      const all = computeAllComplexities(w);
      // ids 0..6 covers every seated seat + non-seated owners + a truly-absent id.
      for (let p = 0; p <= 6; p++) {
        const pid = asPlayerId(p);
        const got = all.get(pid) ?? 0;
        const want = referenceComplexity(w, pid);
        // .toBe() → Object.is → fails on a single last-bit float difference.
        expect(got).toBe(want);
      }
    }
  });

  it('the computeComplexity wrapper matches the reference bit-exact too (any id ⇒ same, absent ⇒ 0)', () => {
    for (let seed = 1000; seed <= 1200; seed++) {
      const w = randWorld(seed);
      for (let p = 0; p <= 7; p++) {
        const pid = asPlayerId(p);
        expect(computeComplexity(w, pid)).toBe(referenceComplexity(w, pid));
      }
    }
  });

  it('covers the functional-bond cap boundary (a dense same-owner clique)', () => {
    const w = makeWorld(0);
    const owner = asPlayerId(0);
    const prims: Primitive[] = [];
    for (let i = 0; i < 5; i++) {
      const id = asPrimitiveId(i);
      const prim: Primitive = {
        id, type: SparkType.Dot, placerColor: PLAYER_COLORS[0], placedBy: owner, createdTick: 0,
        pos: { x: i * 20, y: 0 }, prevPos: { x: 0, y: 0 }, bonds: new Set(),
        ownerColor: PLAYER_COLORS[0], lastOwnershipChange: 0, radius: 8,
      };
      w.primitives.set(id, prim);
      prims.push(prim);
    }
    // All-pairs Dot→Dot functional bonds (10 bonds vs floor(1.5*5)=7 cap).
    let bid = 100;
    for (let i = 0; i < prims.length; i++) {
      for (let j = i + 1; j < prims.length; j++) {
        const id = asBondId(bid++);
        w.bonds.set(id, { id, aId: prims[i].id, bId: prims[j].id, a: prims[i], b: prims[j], restLength: 30, stiffnessTier: 'MID', createdTick: 0 });
      }
    }
    expect(computeAllComplexities(w).get(owner) ?? 0).toBe(referenceComplexity(w, owner));
  });
});
