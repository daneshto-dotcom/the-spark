/**
 * SPARK — S121 P1 (B3) KEYSTONE TELEGRAPH tests.
 *
 * computeKeystonePulses is the pure, Pixi-free core: for each un-fouled Anchor (gold) / Filament (green)
 * hub, emit a pulse to each un-fouled MAGIC bond branched off its endpoint prims. Asserts hub detection,
 * colour dispatch, magic-only + foul filtering, the far-endpoint geometry, and order-independence — the
 * SAME structural relation applyKeystoneAnchor confers on, so the visual can never drift from the mechanic.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import { asBondId, asPlayerId, asPrimitiveId } from '../types.ts';
import { makeWorld, type World } from '../state/world.ts';
import {
  KEYSTONE_INCOME_PULSE_COLOR,
  KEYSTONE_RIGIDITY_PULSE_COLOR,
  computeKeystonePulses,
} from './keystoneTelegraphRenderer.ts';

const RED = PLAYER_COLORS[0];

function baseWorld(): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  return w;
}

function addPrim(w: World, id: number, type: SparkType, x: number, y: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id),
    type,
    placerColor: RED,
    placedBy: asPlayerId(0),
    createdTick: id,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: RED,
    lastOwnershipChange: 0,
    radius: 8,
  };
  w.primitives.set(p.id, p);
  return p;
}

function connect(w: World, id: number, a: Primitive, b: Primitive): Bond {
  const bond: Bond = {
    id: asBondId(id),
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength: 40,
    stiffnessTier: 'MID',
    createdTick: 0,
    stiffnessMultiplier: undefined,
  };
  w.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond;
}

describe('S121 P1 — Keystone telegraph (computeKeystonePulses)', () => {
  it('emits ONE GOLD pulse from an Anchor to its magic (Capsule) neighbor', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 480, 400);
    const square = addPrim(w, 2, SparkType.Square, 520, 400);
    const circle = addPrim(w, 3, SparkType.Circle, 560, 400);
    connect(w, 10, dot, square); // Dot→Square = Anchor (rigidity hub)
    connect(w, 11, square, circle); // Square→Circle = Capsule (magic neighbor, shares Square)
    const pulses = computeKeystonePulses(w);
    expect(pulses).toHaveLength(1);
    expect(pulses[0].color).toBe(KEYSTONE_RIGIDITY_PULSE_COLOR);
    expect(pulses[0].fromX).toBe(520); // shared endpoint = the Square
    expect(pulses[0].toX).toBe(560); // far end = the Circle
  });

  it('emits ONE GREEN pulse from a Filament to its magic (Cable) neighbor', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 100, 100);
    const line = addPrim(w, 2, SparkType.Line, 140, 100);
    const line2 = addPrim(w, 3, SparkType.Line, 180, 100);
    connect(w, 10, dot, line); // Dot→Line = Filament (income hub)
    connect(w, 11, line, line2); // Line→Line = Cable (magic neighbor, shares the Line)
    const pulses = computeKeystonePulses(w);
    expect(pulses).toHaveLength(1);
    expect(pulses[0].color).toBe(KEYSTONE_INCOME_PULSE_COLOR);
    expect(pulses[0].fromX).toBe(140); // shared Line
    expect(pulses[0].toX).toBe(180); // far Line
  });

  it('a lone Anchor with no magic neighbor emits nothing', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 480, 400);
    const square = addPrim(w, 2, SparkType.Square, 520, 400);
    connect(w, 10, dot, square); // Anchor only
    expect(computeKeystonePulses(w)).toHaveLength(0);
  });

  it('does NOT bless a FUNCTIONAL (non-magic) neighbor', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 480, 400);
    const square = addPrim(w, 2, SparkType.Square, 520, 400);
    const tri = addPrim(w, 3, SparkType.Triangle, 560, 400);
    connect(w, 10, dot, square); // Anchor
    connect(w, 11, square, tri); // Square→Triangle = functional placeholder
    expect(computeKeystonePulses(w)).toHaveLength(0);
  });

  it('a FOULED hub confers nothing', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 480, 400);
    const square = addPrim(w, 2, SparkType.Square, 520, 400);
    const circle = addPrim(w, 3, SparkType.Circle, 560, 400);
    connect(w, 10, dot, square);
    connect(w, 11, square, circle);
    w.fouledPrimitives.add(asPrimitiveId(2)); // the anchor's Square endpoint is pooped
    expect(computeKeystonePulses(w)).toHaveLength(0);
  });

  it('a FOULED magic neighbor receives nothing', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 480, 400);
    const square = addPrim(w, 2, SparkType.Square, 520, 400);
    const circle = addPrim(w, 3, SparkType.Circle, 560, 400);
    connect(w, 10, dot, square);
    connect(w, 11, square, circle);
    w.fouledPrimitives.add(asPrimitiveId(3)); // the Capsule's Circle endpoint is pooped
    expect(computeKeystonePulses(w)).toHaveLength(0);
  });

  it('resolves the far endpoint regardless of neighbor-bond a/b direction', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 480, 400);
    const square = addPrim(w, 2, SparkType.Square, 520, 400);
    const circle = addPrim(w, 3, SparkType.Circle, 560, 400);
    connect(w, 10, dot, square); // Anchor
    connect(w, 11, circle, square); // Capsule wired Circle→Square (reversed): shared is still the Square
    const pulses = computeKeystonePulses(w);
    expect(pulses).toHaveLength(1);
    expect(pulses[0].fromX).toBe(520); // from the shared Square
    expect(pulses[0].toX).toBe(560); // to the far Circle
  });

  it('is order-independent (bond Map insertion order cannot change the pulse set)', () => {
    const build = (anchorFirst: boolean): KeystonePulseSummary => {
      const w = baseWorld();
      const dot = addPrim(w, 1, SparkType.Dot, 480, 400);
      const square = addPrim(w, 2, SparkType.Square, 520, 400);
      const circle = addPrim(w, 3, SparkType.Circle, 560, 400);
      if (anchorFirst) {
        connect(w, 10, dot, square);
        connect(w, 11, square, circle);
      } else {
        connect(w, 11, square, circle);
        connect(w, 10, dot, square);
      }
      const pulses = computeKeystonePulses(w);
      return { n: pulses.length, from: pulses[0]?.fromX, to: pulses[0]?.toX, color: pulses[0]?.color };
    };
    expect(build(true)).toEqual(build(false));
  });

  // ── S122 P3 (B3 polish) — VISUAL HONESTY: the green pulse caps at the income cap ──
  it('a Filament with 4 magic neighbors lights exactly KEYSTONE_INCOME_MAX_NEIGHBORS (3) pulses', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 100, 100);
    const line = addPrim(w, 2, SparkType.Line, 140, 100);
    connect(w, 10, dot, line); // Filament hub
    for (let i = 0; i < 4; i++) {
      const far = addPrim(w, 3 + i, SparkType.Line, 180 + i * 40, 100);
      connect(w, 11 + i, line, far); // Line→Line = Cable (magic) — 4 branched neighbors
    }
    const pulses = computeKeystonePulses(w);
    expect(pulses).toHaveLength(3); // = KEYSTONE_INCOME_MAX_NEIGHBORS — paid ⇔ lit
    for (const pu of pulses) expect(pu.color).toBe(KEYSTONE_INCOME_PULSE_COLOR);
    // The scan order is scoring's own ([fa,fb] endpoints, bonds insertion order), so the
    // FIRST three attached neighbors light — deterministic + identical cross-peer.
    expect(pulses.map((pu) => pu.toX)).toEqual([180, 220, 260]);
  });

  it('an Anchor with 4 magic neighbors stays UNCAPPED (rigidity has no neighbor cap)', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 480, 400);
    const square = addPrim(w, 2, SparkType.Square, 520, 400);
    connect(w, 10, dot, square); // Anchor hub
    for (let i = 0; i < 4; i++) {
      const far = addPrim(w, 3 + i, SparkType.Circle, 560 + i * 40, 400);
      connect(w, 11 + i, square, far); // Square→Circle = Capsule (magic) — 4 neighbors
    }
    const pulses = computeKeystonePulses(w);
    expect(pulses).toHaveLength(4);
    for (const pu of pulses) expect(pu.color).toBe(KEYSTONE_RIGIDITY_PULSE_COLOR);
  });
});

interface KeystonePulseSummary {
  readonly n: number;
  readonly from: number | undefined;
  readonly to: number | undefined;
  readonly color: number | undefined;
}
