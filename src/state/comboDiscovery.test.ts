/**
 * SPARK — S88 G3a combo-discovery detection tests (host-authoritative).
 * Builds structures directly (not via the placement pipeline) so the detection is
 * asserted in isolation. Combo facts (combos.ts): Dot→Line = Filament (magic),
 * Line→Line = Cable (magic), Triangle→Triangle = Diamond (magic), Dot→Dot = placeholder.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import { lookupCombo } from '../combos.ts';
import type { Primitive } from '../game/primitive.ts';
import { asBondId, asPlayerId, asPrimitiveId, type PlayerId } from '../types.ts';
import { makeWorld, type World } from './world.ts';
import { detectComboDiscoveries } from './comboDiscovery.ts';

const P0: PlayerId = asPlayerId(0);
let nextId = 0;

function addPrim(world: World, type: SparkType): Primitive {
  const id = asPrimitiveId(nextId++);
  const color = PLAYER_COLORS[0];
  const prim: Primitive = {
    id, type, placerColor: color, placedBy: P0, createdTick: 0,
    pos: { x: 0, y: 0 }, prevPos: { x: 0, y: 0 }, bonds: new Set(),
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

const FILAMENT = lookupCombo(SparkType.Dot, SparkType.Line).resultName;
const CABLE = lookupCombo(SparkType.Line, SparkType.Line).resultName;
const DIAMOND = lookupCombo(SparkType.Triangle, SparkType.Triangle).resultName;

describe('S88 G3a — detectComboDiscoveries', () => {
  it('a first-formed magic combo stamps the toast tick + name + counter', () => {
    nextId = 0;
    const w = makeWorld(0);
    w.tick = 500;
    const dot = addPrim(w, SparkType.Dot);
    const line = addPrim(w, SparkType.Line);
    const watermark = nextId;
    addBond(w, dot, line); // Dot→Line = Filament (magic)

    detectComboDiscoveries(w, watermark);

    expect(w.comboToastTick).toBe(500);
    expect(w.lastDiscoveredComboNames).toEqual([FILAMENT]);
    expect(w.discoveredCombos.size).toBe(1);
  });

  it('a functional (placeholder) bond never toasts', () => {
    nextId = 0;
    const w = makeWorld(0);
    w.tick = 10;
    const a = addPrim(w, SparkType.Dot);
    const b = addPrim(w, SparkType.Dot);
    const watermark = nextId;
    addBond(w, a, b); // Dot→Dot = functional placeholder

    detectComboDiscoveries(w, watermark);

    expect(w.comboToastTick).toBeUndefined();
    expect(w.lastDiscoveredComboNames).toBeUndefined();
    expect(w.discoveredCombos.size).toBe(0);
  });

  it('the SAME combo discovered again does NOT re-stamp (first-this-match only)', () => {
    nextId = 0;
    const w = makeWorld(0);
    w.tick = 100;
    const d1 = addPrim(w, SparkType.Dot);
    const l1 = addPrim(w, SparkType.Line);
    let wm = nextId;
    addBond(w, d1, l1); // Dot→Line = Filament
    detectComboDiscoveries(w, wm);
    expect(w.comboToastTick).toBe(100);

    // A later placement forms another Filament — already discovered ⇒ no re-stamp.
    w.tick = 200;
    const d2 = addPrim(w, SparkType.Dot);
    const l2 = addPrim(w, SparkType.Line);
    wm = nextId;
    addBond(w, d2, l2);
    detectComboDiscoveries(w, wm);
    expect(w.comboToastTick).toBe(100); // unchanged
    expect(w.discoveredCombos.size).toBe(1);
  });

  it('PRIME-AUDIT R1 — two DIFFERENT magic combos on ONE tick stamp BOTH names + counter+2', () => {
    nextId = 0;
    const w = makeWorld(0);
    w.tick = 42;
    const dot = addPrim(w, SparkType.Dot);
    const lineA = addPrim(w, SparkType.Line);
    const lineB = addPrim(w, SparkType.Line);
    const watermark = nextId;
    addBond(w, dot, lineA);   // Dot→Line = Filament
    addBond(w, lineA, lineB); // Line→Line = Cable

    detectComboDiscoveries(w, watermark);

    expect(w.comboToastTick).toBe(42);
    expect(w.discoveredCombos.size).toBe(2);
    const names = w.lastDiscoveredComboNames ?? [];
    expect(names).toContain(FILAMENT);
    expect(names).toContain(CABLE);
    expect(names.length).toBe(2);
  });

  it('only scans bonds minted THIS placement (id >= firstNewBondId)', () => {
    nextId = 0;
    const w = makeWorld(0);
    w.tick = 5;
    // a PRE-existing magic bond (older id) the later scan must IGNORE.
    addBond(w, addPrim(w, SparkType.Dot), addPrim(w, SparkType.Line)); // old Filament
    const watermark = nextId;
    // the only NEW bond — Triangle→Triangle = Diamond.
    addBond(w, addPrim(w, SparkType.Triangle), addPrim(w, SparkType.Triangle));

    detectComboDiscoveries(w, watermark);

    expect(w.discoveredCombos.size).toBe(1);
    expect(w.lastDiscoveredComboNames).toEqual([DIAMOND]);
  });

  it('a fresh world starts with no discoveries (per-match baseline; cleared on START_GAME/RETURN_TO_TITLE)', () => {
    const w = makeWorld(0);
    expect(w.discoveredCombos.size).toBe(0);
    expect(w.comboToastTick).toBeUndefined();
    expect(w.lastDiscoveredComboNames).toBeUndefined();
  });

  it('S91 G2-PROMO — a promoted Anchor (Dot→Square) and Spindle (Line→Circle) each toast as magic', () => {
    nextId = 0;
    const w = makeWorld(0);
    w.tick = 77;
    const dot = addPrim(w, SparkType.Dot);
    const sq = addPrim(w, SparkType.Square);
    const line = addPrim(w, SparkType.Line);
    const circle = addPrim(w, SparkType.Circle);
    const watermark = nextId;
    addBond(w, dot, sq);      // Dot→Square = Anchor (magic, S91)
    addBond(w, line, circle); // Line→Circle = Spindle (magic, S91)

    detectComboDiscoveries(w, watermark);

    expect(w.comboToastTick).toBe(77);
    expect(w.discoveredCombos.size).toBe(2);
    const names = w.lastDiscoveredComboNames ?? [];
    expect(names).toContain('Anchor');
    expect(names).toContain('Spindle');
  });
});
