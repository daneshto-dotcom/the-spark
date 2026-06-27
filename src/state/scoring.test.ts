/**
 * SPARK — S76 P3 complexity-income scoring tests.
 *
 * Locks the new model end-to-end: computeComplexity (formula + per-owner attribution),
 * tickScoring (per-tick income accrual + scoreProgress = max), the player-1 CONSISTENCY fix
 * (#3b — every seat scores by the identical path), determinism, and the unified addScore.
 *
 * Structures are inserted directly (not via the placement pipeline) so the complexity math
 * is asserted in isolation from bond-formation geometry.
 */

import { describe, expect, it } from 'vitest';
import {
  FILAMENT_INCOME_COMPLEXITY,
  FUNCTIONAL_BOND_CAP_PER_PRIM,
  FUNCTIONAL_BOND_COMPLEXITY,
  LEADER_DECAY_RATE_PER_SEC,
  LEADER_DECAY_THRESHOLD_FRACTION,
  PHASE_1_WIN_SCORE,
  PHYSICS_HZ,
  PLAYER_COLORS,
  SCORE_ANCHOR,
  SCORE_FUNCTIONAL_BOND,
  SCORE_INCOME_PER_COMPLEXITY_PER_SEC,
  SCORE_MAGIC_BOND,
  SCORE_TIER_STEP,
  SparkType,
} from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import type { Primitive } from '../game/primitive.ts';
import { ClientSync, HostSync } from '../net/sync.ts';
import { asBondId, asPlayerId, asPrimitiveId, type PlayerId } from '../types.ts';
import { makeGameStateExtras, tickGameState } from './gameState.ts';
import { makeWorld, type World } from './world.ts';
import { addScore } from './gameMode.ts';
import { computeComplexity, tickScoring } from './scoring.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const P2 = asPlayerId(2);
const MAGIC_PREMIUM = SCORE_MAGIC_BOND - SCORE_FUNCTIONAL_BOND; // 2
const PER_TICK = SCORE_INCOME_PER_COMPLEXITY_PER_SEC / PHYSICS_HZ;

let nextId = 0;

function addPrim(world: World, playerId: PlayerId, type: SparkType, x: number, y: number): Primitive {
  const id = asPrimitiveId(nextId++);
  const color = PLAYER_COLORS[playerId as unknown as number];
  const prim: Primitive = {
    id, type, placerColor: color, placedBy: playerId, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: color, lastOwnershipChange: 0, radius: 8,
  };
  world.primitives.set(id, prim);
  return prim;
}

function addBond(world: World, a: Primitive, b: Primitive): void {
  const id = asBondId(nextId++);
  world.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: 30, stiffnessTier: 'MID', createdTick: 0 });
  a.bonds.add(id);
  b.bonds.add(id);
}

// A 2-prim MAGIC structure (Line→Line = Cable) → complexity 2×SCORE_ANCHOR + MAGIC_PREMIUM = 4.
function buildMagicPair(world: World, playerId: PlayerId, x: number, y: number): void {
  const a = addPrim(world, playerId, SparkType.Line, x, y);
  const b = addPrim(world, playerId, SparkType.Line, x + 20, y);
  addBond(world, b, a);
}

function duel(): World {
  const w = makeWorld(0); // seats P0
  w.gameMode = '1v1';
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1], { x: 1400, y: 540 }));
  w.scoreByPlayer.set(P1, 0);
  return w;
}

describe('S76 scoring — computeComplexity', () => {
  it('empty world → 0', () => {
    expect(computeComplexity(makeWorld(0), P0)).toBe(0);
  });

  it('isolated primitives count at SCORE_ANCHOR each', () => {
    const w = makeWorld(0);
    addPrim(w, P0, SparkType.Dot, 200, 200);
    addPrim(w, P0, SparkType.Dot, 260, 200);
    expect(computeComplexity(w, P0)).toBe(2 * SCORE_ANCHOR);
  });

  it('a magic bond adds MAGIC_PREMIUM; a functional bond adds FUNCTIONAL_BOND_COMPLEXITY (S84 P4)', () => {
    const wMagic = makeWorld(0);
    addBond(wMagic, addPrim(wMagic, P0, SparkType.Line, 220, 200), addPrim(wMagic, P0, SparkType.Line, 200, 200));
    expect(computeComplexity(wMagic, P0)).toBe(2 * SCORE_ANCHOR + MAGIC_PREMIUM); // 4

    // S84 P4 — the S76 "functional is neutral" contract is RETIRED by design: the field
    // report showed a connected tree earning exactly = scattered prims. Functional bonds
    // now add 0.25 each (counted bonds capped — see the S84 describe below); connecting
    // still never LOWERS complexity, so the S76 don't-connect exploit stays dead.
    const wFunc = makeWorld(0);
    addBond(wFunc, addPrim(wFunc, P0, SparkType.Dot, 220, 200), addPrim(wFunc, P0, SparkType.Dot, 200, 200));
    expect(computeComplexity(wFunc, P0)).toBeCloseTo(2 * SCORE_ANCHOR + FUNCTIONAL_BOND_COMPLEXITY, 10); // 2.25
  });

  it('attributes per-owner: one player\'s structure is not counted for another', () => {
    const w = duel();
    buildMagicPair(w, P0, 200, 200);   // P0 → 4
    buildMagicPair(w, P1, 1400, 540);  // P1 → 4
    addPrim(w, P0, SparkType.Dot, 300, 300); // P0 +1 isolated
    expect(computeComplexity(w, P0)).toBe(5);
    expect(computeComplexity(w, P1)).toBe(4);
  });
});

describe('S90 P1 (G1b ECONOMY) — Filament (Dot→Line) income trickle', () => {
  it('a Filament earns the magic premium AND an extra FILAMENT_INCOME_COMPLEXITY trickle', () => {
    const w = makeWorld(0);
    const dot = addPrim(w, P0, SparkType.Dot, 200, 200);
    const line = addPrim(w, P0, SparkType.Line, 230, 200);
    addBond(w, dot, line); // aId=Dot, bId=Line → Filament (order-dependent like every behavior helper)
    // 2 anchors + magic premium (2) + filament trickle (0.6)
    expect(computeComplexity(w, P0)).toBeCloseTo(
      2 * SCORE_ANCHOR + MAGIC_PREMIUM + FILAMENT_INCOME_COMPLEXITY, 10,
    );
  });

  it('S98 order-symmetry: Line→Dot is now ALSO a Filament — same income as Dot→Line (both orders equal)', () => {
    const w = makeWorld(0);
    const line = addPrim(w, P0, SparkType.Line, 200, 200);
    const dot = addPrim(w, P0, SparkType.Dot, 230, 200);
    addBond(w, line, dot); // aId=Line, bId=Dot → Filament (S98 symmetric), earns magic + trickle
    expect(computeComplexity(w, P0)).toBeCloseTo(
      2 * SCORE_ANCHOR + MAGIC_PREMIUM + FILAMENT_INCOME_COMPLEXITY, 10,
    );
  });

  it('a non-Filament magic bond (Line→Line Cable) gets the magic premium but NO filament trickle', () => {
    const w = makeWorld(0);
    buildMagicPair(w, P0, 200, 200); // Line→Line = Cable (magic, not Filament)
    expect(computeComplexity(w, P0)).toBe(2 * SCORE_ANCHOR + MAGIC_PREMIUM); // exactly 4, no +0.6
  });

  it('a poop-fouled Filament earns ZERO trickle (whole bond skipped like every fouled bond)', () => {
    const w = makeWorld(0);
    const dot = addPrim(w, P0, SparkType.Dot, 200, 200);
    const line = addPrim(w, P0, SparkType.Line, 230, 200);
    addBond(w, dot, line);
    w.fouledPrimitives.add(dot.id); // foul one endpoint → that prim + the whole bond drop out
    expect(computeComplexity(w, P0)).toBe(1 * SCORE_ANCHOR); // only the un-fouled Line prim counts
  });

  it('deterministic: identical Filament builds + tick counts → identical scoreProgress', () => {
    const run = (): number => {
      nextId = 2000;
      const w = makeWorld(0);
      const dot = addPrim(w, P0, SparkType.Dot, 200, 200);
      const line = addPrim(w, P0, SparkType.Line, 230, 200);
      addBond(w, dot, line);
      for (let t = 0; t < 300; t++) tickScoring(w);
      return w.scoreProgress;
    };
    expect(run()).toBe(run());
  });
});

describe('S98 order-symmetry — income parity (Option B balance proof)', () => {
  // The rebalance question: does symmetry inflate the canonical (optimal) build's income
  // (the ~157.5s anchor)? These two tests bound it empirically: (1) a one-way pair now earns
  // the SAME in either order (the floor rises for sloppy play); (2) a pure-forward build earns
  // EXACTLY its pre-S98 magic income (the change is additive to the table — it never touches a
  // forward key — so the optimal ceiling, and thus the 157.5s anchor, is unchanged). Conclusion:
  // ship PHASE_1_WIN_SCORE unchanged; a ready playtest-gated micro-rebalance covers casual pace.
  it('a one-way pair earns IDENTICAL income in both carry orders (was asymmetric pre-S98)', () => {
    const fwd = makeWorld(0);
    addBond(fwd, addPrim(fwd, P0, SparkType.Line, 200, 200), addPrim(fwd, P0, SparkType.Triangle, 230, 200));
    const rev = makeWorld(0);
    addBond(rev, addPrim(rev, P0, SparkType.Triangle, 200, 200), addPrim(rev, P0, SparkType.Line, 230, 200));
    expect(computeComplexity(rev, P0)).toBe(computeComplexity(fwd, P0));
    expect(computeComplexity(fwd, P0)).toBe(2 * SCORE_ANCHOR + MAGIC_PREMIUM); // both magic (Bracket)
  });

  it('the optimal (all-forward) build income is UNCHANGED — symmetry only raises the floor', () => {
    const w = makeWorld(0);
    const d = addPrim(w, P0, SparkType.Dot, 100, 100);
    const l = addPrim(w, P0, SparkType.Line, 130, 100);
    const t = addPrim(w, P0, SparkType.Triangle, 160, 100);
    addBond(w, d, l); // Dot→Line Filament (magic + trickle)
    addBond(w, l, t); // Line→Triangle Bracket (magic)
    expect(computeComplexity(w, P0)).toBeCloseTo(
      3 * SCORE_ANCHOR + 2 * MAGIC_PREMIUM + FILAMENT_INCOME_COMPLEXITY, 10,
    );
  });
});

describe('S76 scoring — tickScoring income', () => {
  it('accrues rate × complexity / PHYSICS_HZ per tick', () => {
    const w = makeWorld(0);
    buildMagicPair(w, P0, 200, 200); // complexity 4
    tickScoring(w);
    expect(w.scoreByPlayer.get(P0)).toBeCloseTo(4 * PER_TICK, 9);
    expect(w.scoreProgress).toBeCloseTo(4 * PER_TICK, 9);
  });

  it('scoreProgress = max(scoreByPlayer); a bigger structure earns faster', () => {
    const w = duel();
    buildMagicPair(w, P0, 200, 200);          // P0 complexity 4
    addPrim(w, P1, SparkType.Dot, 1400, 540); // P1 complexity 1
    for (let t = 0; t < 100; t++) tickScoring(w);
    const s0 = w.scoreByPlayer.get(P0)!;
    const s1 = w.scoreByPlayer.get(P1)!;
    expect(s0).toBeGreaterThan(s1);
    expect(w.scoreProgress).toBe(Math.max(s0, s1));
  });

  it('CONSISTENCY (#3b): identical structures accrue identical score — player-1 is not special', () => {
    const w = duel();
    buildMagicPair(w, P0, 200, 200);
    buildMagicPair(w, P1, 1400, 540);
    for (let t = 0; t < 250; t++) tickScoring(w);
    expect(w.scoreByPlayer.get(P0)).toBeCloseTo(w.scoreByPlayer.get(P1)!, 9);
  });

  it('zero complexity → zero income (you must keep structure standing to progress)', () => {
    const w = makeWorld(0);
    for (let t = 0; t < 100; t++) tickScoring(w);
    expect(w.scoreProgress).toBe(0);
  });

  it('deterministic: identical builds + tick counts → identical scoreProgress', () => {
    const run = (): number => {
      nextId = 1000;
      const w = makeWorld(0);
      buildMagicPair(w, P0, 200, 200);
      for (let t = 0; t < 300; t++) tickScoring(w);
      return w.scoreProgress;
    };
    expect(run()).toBe(run());
  });
});

describe('S76 scoring — unified addScore (no solo/networked split)', () => {
  it('solo: scoreProgress = the single player\'s score', () => {
    const w = makeWorld(0);
    addScore(w, P0, 5);
    expect(w.scoreByPlayer.get(P0)).toBe(5);
    expect(w.scoreProgress).toBe(5);
  });

  it('multi: scoreProgress = max across players (identical rule for every seat)', () => {
    const w = duel();
    addScore(w, P0, 5);
    addScore(w, P1, 9);
    expect(w.scoreProgress).toBe(9);
    addScore(w, P0, 7); // P0 → 12, becomes leader
    expect(w.scoreProgress).toBe(12);
  });
});

/** S84 P4 — 3-player FFA world (FFA shares gameMode '1v1'; count-agnostic). */
function trio(): World {
  const w = duel();
  w.gameState = 'PLAYING';
  w.players.set(P2, makeIdlePlayer(P2, PLAYER_COLORS[2], { x: 960, y: 900 }));
  w.scoreByPlayer.set(P2, 0);
  return w;
}

describe('S84 P4 — functional-bond complexity (capped) + field-report invariants', () => {
  it('a connected spanning tree out-earns the same prims scattered', () => {
    const scattered = makeWorld(0);
    const tree = makeWorld(0);
    const sPrims: Primitive[] = [];
    const tPrims: Primitive[] = [];
    for (let i = 0; i < 5; i++) {
      sPrims.push(addPrim(scattered, P0, SparkType.Dot, 200 + i * 100, 200));
      tPrims.push(addPrim(tree, P0, SparkType.Dot, 200 + i * 30, 200));
    }
    for (let i = 0; i < 4; i++) addBond(tree, tPrims[i], tPrims[i + 1]); // n−1 chain
    expect(computeComplexity(scattered, P0)).toBe(5);
    expect(computeComplexity(tree, P0)).toBeCloseTo(5 + 4 * FUNCTIONAL_BOND_COMPLEXITY, 10);
  });

  it('caps counted functional bonds at floor(1.5 × prims) — clique-spam barely beats a tree', () => {
    const w = makeWorld(0);
    const prims: Primitive[] = [];
    for (let i = 0; i < 4; i++) prims.push(addPrim(w, P0, SparkType.Dot, 200 + i * 30, 200));
    // Complete graph (6 bonds) + 3 duplicates = 9 functional bonds; cap = floor(1.5×4) = 6.
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) addBond(w, prims[a], prims[b]);
    addBond(w, prims[0], prims[2]);
    addBond(w, prims[1], prims[3]);
    addBond(w, prims[0], prims[3]);
    const cap = Math.floor(FUNCTIONAL_BOND_CAP_PER_PRIM * 4);
    expect(computeComplexity(w, P0)).toBeCloseTo(4 + cap * FUNCTIONAL_BOND_COMPLEXITY, 10); // 5.5
  });

  it('FIELD INVARIANT: a non-builder accrues EXACTLY zero over an hour of sim', () => {
    const w = trio();
    const prims: Primitive[] = [];
    for (let i = 0; i < 5; i++) prims.push(addPrim(w, P0, SparkType.Dot, 200 + i * 30, 200));
    for (let i = 0; i < 4; i++) addBond(w, prims[i], prims[i + 1]);
    for (let i = 0; i < 3; i++) addPrim(w, P1, SparkType.Dot, 1400 + i * 100, 540);
    for (let t = 0; t < 3600; t++) { w.tick++; tickScoring(w); }
    expect(w.scoreByPlayer.get(P2)).toBe(0); // the invariant the S84 field report appeared to violate
    expect(w.scoreByPlayer.get(P0)!).toBeGreaterThan(w.scoreByPlayer.get(P1)!); // connected > scattered
    expect(w.scoreProgress).toBeCloseTo(w.scoreByPlayer.get(P0)!, 10); // the ONE shared HUD bar = leader's
  });

  it('WIN attributes to the true max scorer, never the dispatch fallback seat', () => {
    const w = trio();
    w.scoreByPlayer.set(P0, 10);
    w.scoreByPlayer.set(P1, PHASE_1_WIN_SCORE + 0.2);
    w.scoreByPlayer.set(P2, 3);
    w.scoreProgress = PHASE_1_WIN_SCORE + 0.2;
    tickGameState(w, makeGameStateExtras(), P0); // P0 = the solo fallback seat
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P1);
  });

  it('DISTRIBUTED PIPELINE: the client mirror attributes the same winner as the host', () => {
    // The field report could not be reproduced in unit probes — this walks the REAL
    // wire path (buildSnapshotMessage → receive → interpolateInto) so a regression in
    // the scoreByPlayer mirror or the client-side WIN scan can never ship silently.
    const hostWorld = trio();
    hostWorld.isHost = true;
    const prims: Primitive[] = [];
    // S107 P1 — complexity must exceed the leader-decay equilibrium so the leader
    // can still cross the win line past the 75% threshold (a builder this committed wins;
    // the anti-coast decay only stalls a modest/coasting leader). S110 P1: WIN 786→1500 lifted
    // C_eq ~39→~75, so 120 isolated prims = c.120 keeps a healthy margin above equilibrium.
    for (let i = 0; i < 120; i++) prims.push(addPrim(hostWorld, P1, SparkType.Dot, 1200 + i * 30, 500));
    hostWorld.scoreByPlayer.set(P0, 4);
    hostWorld.scoreByPlayer.set(P1, PHASE_1_WIN_SCORE - 0.001); // about to cross
    hostWorld.scoreByPlayer.set(P2, 2);
    hostWorld.tick = 5000;
    tickScoring(hostWorld);

    const clientWorld = makeWorld(0);
    clientWorld.isHost = false;
    clientWorld.gameMode = '1v1';
    clientWorld.gameState = 'PLAYING';
    clientWorld.localPlayerId = P2; // the non-builder's machine
    const host = new HostSync();
    const client = new ClientSync();
    let now = 1000;
    expect(client.receive(host.buildSnapshotMessage(hostWorld), now)).toBe(true);
    client.interpolateInto(clientWorld, now, 100);
    expect(clientWorld.scoreByPlayer.get(P1)!).toBeCloseTo(hostWorld.scoreByPlayer.get(P1)!, 6);

    // Advance the host until the floored gate opens, re-mirroring each tick.
    let guard = 0;
    while (Math.floor(clientWorld.scoreProgress) < PHASE_1_WIN_SCORE && guard++ < 200) {
      hostWorld.tick++;
      tickScoring(hostWorld);
      now += 100;
      client.receive(host.buildSnapshotMessage(hostWorld), now);
      client.interpolateInto(clientWorld, now, 100);
    }
    tickGameState(clientWorld, makeGameStateExtras(), P0);
    expect(clientWorld.gameState).toBe('WIN');
    expect(clientWorld.lastWinnerId).toBe(P1); // the builder — not the local seat, not the fallback
  });
});

describe('S84 P3 — pacing constants coherence', () => {
  it('tier pulses divide the win target into exact thirds', () => {
    expect(PHASE_1_WIN_SCORE % SCORE_TIER_STEP).toBe(0);
    expect(PHASE_1_WIN_SCORE / SCORE_TIER_STEP).toBe(3);
  });
});

describe('S107 P1 — anti-coast LEADER SCORE-DECAY', () => {
  const THRESHOLD = PHASE_1_WIN_SCORE * LEADER_DECAY_THRESHOLD_FRACTION; // 1125 at WIN=1500
  // Equilibrium complexity at the win line: C_eq = RATE × (1−FRACTION) × WIN / INCOME ≈ 75 at WIN=1500.
  const C_EQ =
    (LEADER_DECAY_RATE_PER_SEC * (1 - LEADER_DECAY_THRESHOLD_FRACTION) * PHASE_1_WIN_SCORE) /
    SCORE_INCOME_PER_COMPLEXITY_PER_SEC;

  it('a COASTING leader (low complexity) past the threshold bleeds', () => {
    const w = duel();
    w.scoreByPlayer.set(P0, THRESHOLD + 110); // ~700, the leader (P1 = 0)
    buildMagicPair(w, P0, 200, 200); // complexity 4 ≪ C_eq → income cannot outrun the decay
    tickScoring(w);
    expect(w.scoreByPlayer.get(P0)!).toBeLessThan(THRESHOLD + 110);
  });

  it('a COMMITTED builder (complexity > equilibrium) still climbs past the threshold', () => {
    const w = duel();
    w.scoreByPlayer.set(P0, THRESHOLD + 110);
    // Build well above C_eq (~75 at WIN=1500) so live income exceeds the decay → net positive.
    for (let i = 0; i < Math.ceil(C_EQ) + 25; i++) addPrim(w, P0, SparkType.Dot, 200 + i * 12, 200);
    tickScoring(w);
    expect(w.scoreByPlayer.get(P0)!).toBeGreaterThan(THRESHOLD + 110);
  });

  it('decay never drops the leader BELOW the threshold (floored, self-limiting)', () => {
    const w = duel();
    w.scoreByPlayer.set(P0, THRESHOLD + 5); // just above, zero standing structure (income 0)
    for (let t = 0; t < 5000; t++) tickScoring(w);
    expect(w.scoreByPlayer.get(P0)!).toBeGreaterThanOrEqual(THRESHOLD);
    expect(w.scoreByPlayer.get(P0)!).toBeLessThan(THRESHOLD + 5); // it DID bleed toward the floor
  });

  it('does NOT decay a leader still below the threshold (normal income climbs)', () => {
    const w = duel();
    w.scoreByPlayer.set(P0, THRESHOLD - 100);
    buildMagicPair(w, P0, 200, 200);
    const before = w.scoreByPlayer.get(P0)!;
    tickScoring(w);
    expect(w.scoreByPlayer.get(P0)!).toBeGreaterThan(before); // pure income, no decay below 75%
  });

  it('is EXEMPT in solo (zen sandbox) — the same coasting leader climbs instead of bleeding', () => {
    const solo = makeWorld(0); // gameMode defaults to 'solo'
    solo.scoreByPlayer.set(P0, THRESHOLD + 110);
    buildMagicPair(solo, P0, 200, 200);
    tickScoring(solo);
    expect(solo.scoreByPlayer.get(P0)!).toBeGreaterThan(THRESHOLD + 110); // no rubber-band in solo
  });

  it('decays whoever is the LEADER at this tick, not a fixed seat (leader-swap safe)', () => {
    const w = duel();
    w.scoreByPlayer.set(P0, THRESHOLD + 60); // 649.5
    w.scoreByPlayer.set(P1, THRESHOLD + 110); // 699.5 — P1 is the leader
    tickScoring(w); // both have zero structure → P1 (leader) decays, P0 is untouched by decay
    expect(w.scoreByPlayer.get(P1)!).toBeLessThan(THRESHOLD + 110); // leader bled
    expect(w.scoreByPlayer.get(P0)!).toBe(THRESHOLD + 60); // non-leader unchanged (no income, no decay)
    // scoreProgress (WIN gate + HUNTER read this) is the true post-decay max.
    expect(w.scoreProgress).toBe(Math.max(w.scoreByPlayer.get(P0)!, w.scoreByPlayer.get(P1)!));
  });

  it('is replay-deterministic — two identical runs bleed byte-identically', () => {
    const run = (): string => {
      const w = duel();
      w.scoreByPlayer.set(P0, THRESHOLD + 90);
      buildMagicPair(w, P0, 200, 200);
      for (let t = 0; t < 300; t++) tickScoring(w);
      return JSON.stringify([...w.scoreByPlayer.entries()]);
    };
    expect(run()).toBe(run());
  });
});
