import { describe, it, expect } from 'vitest';
import { PLAYER_COLORS, SparkType, PRIMITIVE_MAX_HP } from '../constants.ts';
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
  NONET_CONNECTOR_COUNT,
  NONET_SHAPE_COUNT,
  NONET_TIMEOUT_TICKS,
  NONET_RESOLVE_DISPLAY_TICKS,
} from './sudokuEvent.ts';
import { netSnapshot, applyNetSnapshot } from './save.ts';
import { castleStructuresModel } from '../render/castlePanel.ts';

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
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
}

function makeBond(id: number, a: Primitive, b: Primitive): Bond {
  return { id: asBondId(id), aId: a.id, bId: b.id, a, b, restLength: 32, stiffnessTier: 'MID', createdTick: 0, damageFifths: 0 };
}

function link(world: World, a: Primitive, b: Primitive, bondId: number): void {
  const bond = makeBond(bondId, a, b);
  world.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
}

/**
 * ⭐ S170 P4 — the same chain, CLOSED into a ring, so the suite can express the one fact the owner's
 * ruling turns on: a ring of `n` shapes has `n` connectors while a chain of `n` has `n - 1`. Twelve
 * connectors is therefore NOT a fixed number of shapes, which is exactly why he ruled on connectors.
 */
function ringWorld(n: number, type: SparkType): World {
  const world = chainWorld(n, type);
  const prims = [...world.primitives.values()];
  link(world, prims[prims.length - 1], prims[0], 999);
  return world;
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

describe('detectNonet — TWELVE OR MORE CONNECTORS of ONE SparkType (owner R159, S170)', () => {
  /*
   * ⭐⭐ S170 P4 (owner R159) — **THE UNIT CHANGED FROM SHAPES TO CONNECTORS, AND THE COMPARISON
   * FROM EXACT TO AT-LEAST.** Owner, asked outright: *"Twelve connectors."* / *"or more than twelve
   * connectors? Yeah."* / *"it is not shown in the tower tier. It is like an Easter egg."*
   *
   * These assertions are INVERTED from the S94/S164 versions rather than deleted, per this project's
   * own rule about spec changes that flip expectations — so a future regression that re-permits
   * exactly-N-shapes is caught, and the audit trail of what used to pass survives.
   */
  it('⭐ a CHAIN of 13 shapes = 12 connectors — FIRES, which is the owner own arithmetic', () => {
    // He guessed: "Twelve connectors. So what is it? Thirteen shapes?" — correct, for a chain.
    expect(detectNonet(chainWorld(13, SparkType.Square))).toBe(P1);
  });

  it('⭐⭐ a RING of 12 shapes = 12 connectors — ALSO FIRES, on one fewer shape than the chain', () => {
    /*
     * THE WHOLE POINT OF THE RULING, pinned. Same connector count, different shape count — so no
     * shape-count test could ever have expressed what he asked for, and this is the assertion that
     * proves the rule is topology-independent rather than accidentally chain-shaped.
     */
    expect(detectNonet(ringWorld(12, SparkType.Square))).toBe(P1);
  });

  it('fires on 12+ connectors of ANY single type — circles, spirals', () => {
    expect(detectNonet(chainWorld(13, SparkType.Circle))).toBe(P1);
    expect(detectNonet(chainWorld(13, SparkType.Spiral))).toBe(P1);
  });

  it('⛔ rejects 11 connectors (a chain of 12 shapes) — one short is still short', () => {
    expect(detectNonet(chainWorld(12, SparkType.Square))).toBeNull();
  });

  it('⭐ MORE than twelve fires too — this is the half that was broken', () => {
    /*
     * ⛔ THE OLD TEST ASSERTED THE OPPOSITE ("rejects a single component of 18 same-type"), and that
     * assertion IS the owner bug report. A single placement can add TWO bonds at once (a new shape
     * touching two existing ones), so an exact test is skippable by construction; combined with the
     * once-per-match guard, one skipped tick killed the trial for the whole match — *"Why is there
     * no sudoku? It does not work."* A monotonic at-least test cannot be jumped.
     */
    expect(detectNonet(chainWorld(18, SparkType.Square))).toBe(P1);
    expect(detectNonet(chainWorld(30, SparkType.Circle))).toBe(P1);
  });

  it('rejects MIXED type however many connectors there are', () => {
    expect(detectNonet(chainWorld(13, SparkType.Square, SparkType.Dot))).toBeNull();
  });

  it('⭐ and the tier-9 boss ring still does NOT fire it — the two mechanics stay apart', () => {
    /*
     * The boss tower is NINE of the race feed shape closed in a RING = 9 connectors, under 12. R132
     * moved this trial off nine precisely to free that number, and switching the unit to connectors
     * could have silently re-collided them — so it is asserted, not assumed.
     */
    expect(detectNonet(ringWorld(9, SparkType.Square))).toBeNull();
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

/**
 * SPARK — S164 P4 (owner R132): **NONET IS TWELVE, BECAUSE NINE BELONGS TO THE BOSS TOWER.**
 *
 * The races art-direction brief builds a tier-9 boss tower from "nine of the race's own shape" —
 * exactly what `detectNonet` swept for. As specced, the FIRST boss tower of every match would also
 * have summoned the sudoku trial, and since the trial is once-per-match it would have collided for
 * the first boss and not for later ones: an inconsistency players would read as a bug.
 *
 * The ruling separates the triggers by COUNT rather than by precedence, so neither needs to know
 * about the other and there is no ordering rule to get wrong.
 */
describe('S164 P4 — the NONET / boss-tower separation', () => {
  it('⛔ NINE no longer fires a NONET — that count belongs to the tier-9 boss tower', () => {
    expect(detectNonet(chainWorld(9, SparkType.Square))).toBeNull(); // 8 connectors
    // ⭐ S170 — and the boss tower actual shape, a closed ring of nine (9 connectors), also stays
    // silent. Under the old shape-count rule these were one assertion; under connectors they are
    // two, and the RING is the one that matters.
    expect(detectNonet(ringWorld(9, SparkType.Square))).toBeNull();
  });

  it('⭐ TWELVE CONNECTORS fires it (S170 R159 — the unit is bonds, not shapes)', () => {
    expect(detectNonet(ringWorld(12, SparkType.Square))).toBe(P1); // 12 shapes, 12 bonds
    expect(detectNonet(chainWorld(13, SparkType.Square))).toBe(P1); // 13 shapes, 12 bonds
  });

  it('the constant and the behaviour agree, so this cannot drift to a stale literal', () => {
    expect(NONET_CONNECTOR_COUNT).toBe(12);
    // ⚠ The legacy alias survives only for two tier-9 docblocks; assert it TRACKS rather than
    // letting it rot into a second, disagreeing source of truth.
    expect(NONET_SHAPE_COUNT).toBe(NONET_CONNECTOR_COUNT);
    // Boundary, in CONNECTORS: a ring of N has N bonds, so N and N-1 straddle the threshold.
    expect(detectNonet(ringWorld(NONET_CONNECTOR_COUNT, SparkType.Circle))).toBe(P1);
    expect(detectNonet(ringWorld(NONET_CONNECTOR_COUNT - 1, SparkType.Circle))).toBeNull();
    // And ABOVE it still fires — the at-least half of the ruling.
    expect(detectNonet(ringWorld(NONET_CONNECTOR_COUNT + 1, SparkType.Circle))).toBe(P1);
  });

  it('⛔ AND IT NEVER APPEARS IN THE FOOTER TOWER MENU — it stays an easter egg (R132)', () => {
    /*
     * The owner asked for it to remain hidden. `footerBand` renders one chip per complexity present
     * in `castleStructuresModel` — the BUILDABLE structures — and a NONET is a swept TRIGGER, not a
     * buildable recipe, so it has never had a row there. This asserts the live surface rather than a
     * file's text, and it is pinned so a future session that formalises the trigger as a recipe has
     * to notice this ruling before it ships.
     */
    const w = ringWorld(NONET_CONNECTOR_COUNT, SparkType.Square);
    const names = castleStructuresModel(w).map((r) => r.name.toLowerCase());
    expect(names.some((n) => n.includes('nonet') || n.includes('sudoku'))).toBe(false);
    // Anti-vacuity: the model is not simply empty, so the assertion above means something.
    expect(names.length).toBeGreaterThan(0);
  });
});
