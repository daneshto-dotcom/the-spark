import { describe, it, expect } from 'vitest';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asBondId, asPlayerId, asPrimitiveId, type PlayerId } from '../types.ts';
import { makeWorld, type World } from './world.ts';
import {
  detectNonet,
  startSudoku,
  resolveSudoku,
  submitSudokuSolve,
  tickSudoku,
  NONET_SHAPE_COUNT,
  NONET_TIMEOUT_TICKS,
  NONET_RESOLVE_DISPLAY_TICKS,
} from './sudokuEvent.ts';
import { netSnapshot, applyNetSnapshot } from './save.ts';

const P1 = asPlayerId(0);
const P2 = asPlayerId(1);

function makePrim(id: number, type: SparkType, placedBy: PlayerId): Primitive {
  return {
    id: asPrimitiveId(id),
    type,
    placerColor: 0,
    placedBy,
    createdTick: 0,
    pos: { x: 0, y: 0 },
    prevPos: { x: 0, y: 0 },
    bonds: new Set(),
    ownerColor: 0,
    lastOwnershipChange: 0,
    radius: 8,
  };
}

function makeBond(id: number, a: Primitive, b: Primitive): Bond {
  return { id: asBondId(id), aId: a.id, bId: b.id, a, b, restLength: 32, stiffnessTier: 'MID', createdTick: 0 };
}

function link(world: World, a: Primitive, b: Primitive, bondId: number): void {
  const bond = makeBond(bondId, a, b);
  world.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
}

/** A fresh world with a connected chain of `n` P1-owned prims (all `type`, except the last = `lastType`). */
function chainWorld(n: number, type: SparkType, lastType?: SparkType): World {
  const world = makeWorld(0);
  const prims: Primitive[] = [];
  for (let i = 0; i < n; i++) {
    const t = lastType !== undefined && i === n - 1 ? lastType : type;
    const p = makePrim(i + 1, t, P1);
    world.primitives.set(p.id, p);
    prims.push(p);
    if (i > 0) link(world, prims[i - 1], p, i);
  }
  return world;
}

describe('detectNonet — a connected component of exactly 9 of ONE SparkType (S94)', () => {
  it('fires on 9 connected squares (returns the owner)', () => {
    expect(detectNonet(chainWorld(NONET_SHAPE_COUNT, SparkType.Square))).toBe(P1);
  });
  it('fires on 9 of ANY single type — circles, spirals', () => {
    expect(detectNonet(chainWorld(NONET_SHAPE_COUNT, SparkType.Circle))).toBe(P1);
    expect(detectNonet(chainWorld(NONET_SHAPE_COUNT, SparkType.Spiral))).toBe(P1);
  });
  it('rejects 8 (too few)', () => {
    expect(detectNonet(chainWorld(8, SparkType.Square))).toBeNull();
  });
  it('rejects 10 (too many)', () => {
    expect(detectNonet(chainWorld(10, SparkType.Square))).toBeNull();
  });
  it('rejects a single component of 18 same-type (size is the COMPONENT, not the total)', () => {
    expect(detectNonet(chainWorld(18, SparkType.Square))).toBeNull();
  });
  it('rejects 9 of MIXED type (8 squares + 1 dot)', () => {
    expect(detectNonet(chainWorld(NONET_SHAPE_COUNT, SparkType.Square, SparkType.Dot))).toBeNull();
  });
});

function twoPlayerStarted(s1: number, s2: number, seed: number): World {
  const world = makeWorld(0);
  world.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[0]));
  world.players.set(P2, makeIdlePlayer(P2, PLAYER_COLORS[1]));
  world.scoreByPlayer.set(P1, s1);
  world.scoreByPlayer.set(P2, s2);
  world.scoreProgress = Math.max(s1, s2);
  startSudoku(world, P1, seed);
  return world;
}

describe('resolveSudoku — winner ×2, others ×0.4', () => {
  it('doubles the winner, docks everyone else to 0.4, recomputes scoreProgress=max', () => {
    const world = twoPlayerStarted(100, 200, 42);
    resolveSudoku(world, P1);
    expect(world.scoreByPlayer.get(P1)).toBe(200); // 100 ×2
    expect(world.scoreByPlayer.get(P2)).toBe(80); // 200 ×0.4 (S106 — was ÷2 = 100)
    expect(world.scoreProgress).toBe(200);
    expect(world.sudoku?.solvedBy).toBe(P1);
    expect(world.sudoku?.resolvedTick).toBe(world.tick); // decided, not yet cleared
  });
  it('timeout (null winner) leaves scores untouched', () => {
    const world = twoPlayerStarted(100, 200, 42);
    resolveSudoku(world, null);
    expect(world.scoreByPlayer.get(P1)).toBe(100);
    expect(world.scoreByPlayer.get(P2)).toBe(200);
    expect(world.sudoku?.solvedBy).toBeNull();
    expect(world.sudoku?.resolvedTick).toBe(world.tick);
  });
  it('is idempotent — a second resolve does not re-apply the swing', () => {
    const world = twoPlayerStarted(100, 200, 42);
    resolveSudoku(world, P1);
    resolveSudoku(world, P2); // already decided → no-op
    expect(world.scoreByPlayer.get(P1)).toBe(200);
    expect(world.scoreByPlayer.get(P2)).toBe(80); // S106 — 200 ×0.4
    expect(world.sudoku?.solvedBy).toBe(P1);
  });
});

describe('submitSudokuSolve — first valid wins', () => {
  it('accepts the correct solution and resolves to that player', () => {
    const world = twoPlayerStarted(100, 100, 7);
    const sol = [...world.sudoku!.puzzle.solution];
    expect(submitSudokuSolve(world, P2, sol)).toBe(true);
    expect(world.sudoku?.solvedBy).toBe(P2);
    expect(world.scoreByPlayer.get(P2)).toBe(200);
    expect(world.scoreByPlayer.get(P1)).toBe(40); // S106 — 100 ×0.4 (was ÷2 = 50)
  });
  it('rejects a wrong grid (no resolve)', () => {
    const world = twoPlayerStarted(100, 100, 7);
    const wrong = [...world.sudoku!.puzzle.solution];
    wrong[0] = (wrong[0] % 6) + 1;
    expect(submitSudokuSolve(world, P2, wrong)).toBe(false);
    expect(world.sudoku?.solvedBy).toBeNull();
  });
  it('rejects a second solve after the first wins', () => {
    const world = twoPlayerStarted(100, 100, 7);
    const sol = [...world.sudoku!.puzzle.solution];
    expect(submitSudokuSolve(world, P1, sol)).toBe(true);
    expect(submitSudokuSolve(world, P2, sol)).toBe(false);
    expect(world.sudoku?.solvedBy).toBe(P1);
  });
});

describe('tickSudoku — timeout + resume lifecycle', () => {
  it('fires the no-solver timeout', () => {
    const world = makeWorld(0);
    startSudoku(world, P1, 1);
    world.tick = NONET_TIMEOUT_TICKS; // startTick was 0
    tickSudoku(world);
    expect(world.sudoku?.resolvedTick).toBe(NONET_TIMEOUT_TICKS);
  });
  it('resumes the duel (clears world.sudoku) after the display window', () => {
    const world = makeWorld(0);
    startSudoku(world, P1, 1);
    resolveSudoku(world, P1); // resolvedTick = 0
    world.tick = NONET_RESOLVE_DISPLAY_TICKS;
    tickSudoku(world);
    expect(world.sudoku).toBeNull();
  });
  it('stays frozen until the display window elapses', () => {
    const world = makeWorld(0);
    startSudoku(world, P1, 1);
    resolveSudoku(world, P1);
    world.tick = NONET_RESOLVE_DISPLAY_TICKS - 1;
    tickSudoku(world);
    expect(world.sudoku).not.toBeNull();
  });
});

describe('match reset clears the trial (once-per-match guard)', () => {
  it('startSudoku sets the fired guard', () => {
    const world = makeWorld(0);
    expect(world.sudokuFiredThisMatch).toBe(false);
    startSudoku(world, P1, 1);
    expect(world.sudokuFiredThisMatch).toBe(true);
    expect(world.sudoku).not.toBeNull();
  });
});

describe('NONET netcode — snapshot roundtrip (cross-client determinism)', () => {
  it('serializes the active trial; the client regenerates a byte-identical puzzle from the seed', () => {
    const host = makeWorld(0);
    startSudoku(host, P1, 4242);
    const client = makeWorld(0);
    applyNetSnapshot(netSnapshot(host), client);
    expect(client.sudoku).not.toBeNull();
    expect(client.sudoku!.seed).toBe(4242);
    expect(client.sudoku!.puzzle.givens).toEqual(host.sudoku!.puzzle.givens);
    expect(client.sudoku!.puzzle.solution).toEqual(host.sudoku!.puzzle.solution);
    expect(client.sudoku!.solvedBy).toBeNull();
  });

  it('clears a stale client trial when the host snapshot omits it (resume)', () => {
    const host = makeWorld(0); // no trial
    const client = makeWorld(0);
    startSudoku(client, P1, 1); // client holds a stale trial
    applyNetSnapshot(netSnapshot(host), client);
    expect(client.sudoku).toBeNull();
  });

  it('propagates the resolved result (solvedBy + resolvedTick) to the client', () => {
    const host = makeWorld(0);
    host.players.set(P2, makeIdlePlayer(P2, PLAYER_COLORS[1]));
    host.scoreByPlayer.set(P1, 100);
    host.scoreByPlayer.set(P2, 100);
    startSudoku(host, P1, 9);
    resolveSudoku(host, P2);
    const client = makeWorld(0);
    applyNetSnapshot(netSnapshot(host), client);
    expect(client.sudoku!.solvedBy).toBe(P2);
    expect(client.sudoku!.resolvedTick).not.toBeNull();
  });
});
