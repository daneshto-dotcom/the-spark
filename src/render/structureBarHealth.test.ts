/**
 * ⭐⭐ S191 C-7 (owner S187, canon §9d item 3 / R182-F) — THE HEALTH BAR FOLLOWS THE STAR, ON THREE
 * SURFACES, AT A BOUNDED, PROPORTIONAL WIDTH.
 *
 * > *"The bar needs to follow the art or the art needs to follow the bar — it has to be consistent …
 * > There should be a maximum size of a bar and a minimum size of a bar, and it should be proportional
 * > … And same as the character sheet."* — owner, S187
 *
 * DRIVEN FOR REAL: a real lightning hub (a Dot of degree 5 + 5 Circles) ignited by the real matcher and
 * host tick, then a friendly shape WELDED onto a leaf after ignition (so the weld connector is not one of
 * the hub's own, `ownPrimitiveIds`). The bar is read off the real `drawHealthBars` (a recording Graphics),
 * the sheet off the real `characterSheetModel`, the art off the real `starHealthFrac` / `rampHealthFrac`.
 */
import { describe, expect, it } from 'vitest';
import { LIGHTNING_HUB_DEGREE, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Controls } from '../input/controls.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PlayerId } from '../types.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { runGodlyMatcherCore } from '../state/godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { mulberry32 } from '../state/rng.ts';
import { structurePoolFifths } from '../state/stats.ts';
import { starHealthFrac } from '../state/structureStarHealth.ts';
import { ALL_BLUEPRINT_IDS, blueprintFor } from '../state/blueprints.ts';
import { towerShapeFor } from '../state/towerMembers.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { drawHealthBars } from './healthBar.ts';
import { beginConcealmentFrame } from './concealment.ts';
import { characterSheetModel } from './characterSheetModel.ts';
import { rampHealthFrac, rampSpecFor } from './structureRamp.ts';
import { towerArtForRecipe } from './towerFrames.ts';
import {
  STRUCTURE_BAR_MAX_W, STRUCTURE_BAR_MIN_W, STRUCTURE_BAR_POOL_MAX, STRUCTURE_BAR_POOL_MIN,
  structureBarWidth, structureHealthAt,
} from './structureBarHealth.ts';

const P0 = asPlayerId(0);
const HUB_AT = { x: 600, y: 400 };
const FROZEN = 1_000_000_000;
const CURSOR = { x: 200, y: 200 };

/** Records `rect(x, y, w, h)` so the bar's geometry is measured, not eyeballed. */
class G {
  readonly rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  rect(x: number, y: number, w: number, h: number): this { this.rects.push({ x, y, w, h }); return this; }
  fill(): this { return this; }
  stroke(): this { return this; }
  circle(): this { return this; }
  moveTo(): this { return this; }
  lineTo(): this { return this; }
  clear(): this { this.rects.length = 0; return this; }
}

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function prim(w: World, seat: PlayerId, type: SparkType, x: number, y: number): Primitive {
  const player = w.players.get(seat)!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p: Primitive = {
    id, type, placerColor: player.color, placedBy: seat, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: player.color,
    lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, p);
  return p;
}

function link(w: World, a: Primitive, b: Primitive): BondId {
  const id = asBondId(w.nextBondId++);
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  w.bonds.set(id, {
    id, aId: a.id, bId: b.id, a, b,
    restLength: Math.sqrt(dx * dx + dy * dy), stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
  });
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

/** A real hub ignited by the real matcher + host tick; `weld` adds a friendly Square on one leaf AFTER. */
function hubBoard(weld: boolean): { w: World; hub: Primitive; own: BondId[]; weldBond: BondId | null } {
  const w = makeWorld(0x191c7);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  const hub = prim(w, P0, SparkType.Dot, HUB_AT.x, HUB_AT.y);
  const leaves: Primitive[] = [];
  for (let i = 0; i < LIGHTNING_HUB_DEGREE; i++) {
    const a = (i / LIGHTNING_HUB_DEGREE) * Math.PI * 2;
    const leaf = prim(w, P0, SparkType.Circle, HUB_AT.x + Math.cos(a) * 40, HUB_AT.y + Math.sin(a) * 40);
    leaves.push(leaf);
    link(w, hub, leaf);
  }
  w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { ...HUB_AT }, bondCount: 5 });
  const d = deps();
  const st = makeHostTickState(w);
  const cursor = { lastMatcherTick: -1 };
  for (let t = 0; t < 2; t++) { runGodlyMatcherCore(w, cursor); runHostTick(w, d, st); }
  expect(w.creatureSpawners.size, 'fixture: the hub ignited').toBe(1);
  for (const sp of w.creatureSpawners.values()) sp.nextSpawnTick = FROZEN;
  const own = [...hub.bonds].sort((a, b) => Number(a) - Number(b));
  let weldBond: BondId | null = null;
  if (weld) {
    const leaf = leaves[0]!;
    weldBond = link(w, leaf, prim(w, P0, SparkType.Square, leaf.pos.x + 40, leaf.pos.y));
    // Still standing after the weld (weld C2: contains to survive), through the real poll.
    for (let t = 0; t < 31; t++) runHostTick(w, d, st);
    expect(w.creatureSpawners.size, 'fixture: the welded hub still stands').toBe(1);
  }
  // The host ticks emitted castle units; their bars are not under test here.
  w.creatures.clear();
  w.defenders.clear();
  return { w, hub, own, weldBond };
}

function bank(w: World, own: readonly BondId[], fifths: number): void {
  let left = fifths;
  for (const id of own) {
    const take = Math.min(left, 9);
    w.bonds.get(id)!.damageFifths += take;
    left -= take;
  }
}

function bars(w: World): Array<{ track: { x: number; y: number; w: number; h: number }; fillW: number }> {
  const g = new G();
  beginConcealmentFrame(w, CURSOR);
  drawHealthBars(g as never, w);
  const out = [];
  for (let i = 0; i + 1 < g.rects.length; i += 2) out.push({ track: g.rects[i]!, fillW: g.rects[i + 1]!.w });
  return out;
}

const sheetHealth = (w: World, id: Primitive['id']): { cur: number; max: number } => {
  const v = characterSheetModel(w, P0, { kind: 'structure', primitiveId: id } as never);
  if (v === null) throw new Error('fixture: no sheet');
  const h = (v as unknown as { health: { cur: number; max: number } }).health;
  return { cur: h.cur, max: h.max };
};

describe('⭐ S191 C-7 — RULE 2 arithmetic: the bounds are measured off the roster, the scale is linear', () => {
  it('the pool bounds: one connector (6) … the largest TOWER pool on the roster (the tier-9 ring, 126)', () => {
    expect(STRUCTURE_BAR_POOL_MIN).toBe(structurePoolFifths(1));
    expect(STRUCTURE_BAR_POOL_MIN).toBe(6);
    const towerPools = ALL_BLUEPRINT_IDS
      .filter((id) => towerShapeFor(id) !== null)
      .map((id) => structurePoolFifths((blueprintFor(id) as unknown as { bonds: unknown[] }).bonds.length));
    expect(Math.max(...towerPools)).toBe(STRUCTURE_BAR_POOL_MAX);
    expect(STRUCTURE_BAR_POOL_MAX).toBe(126);
  });

  it('the width bounds: the creature floor (9 px) … the widest building art on the roster (150 px)', () => {
    expect(STRUCTURE_BAR_MIN_W).toBe(9);
    const widths = ALL_BLUEPRINT_IDS.map((id) => towerArtForRecipe(id)?.sizePx ?? 0);
    expect(Math.max(...widths)).toBe(STRUCTURE_BAR_MAX_W);
    expect(STRUCTURE_BAR_MAX_W).toBe(150);
  });

  it('linear between, clamped at both ends; NaN reads as the floor', () => {
    expect(structureBarWidth(6)).toBe(9);
    expect(structureBarWidth(126)).toBe(150);
    expect(structureBarWidth(66)).toBeCloseTo(79.5, 10); // the midpoint pool → the midpoint width
    expect(structureBarWidth(50)).toBeCloseTo(9 + 141 * (44 / 120), 10); // a hub's 50
    expect(structureBarWidth(0)).toBe(9);
    expect(structureBarWidth(5000)).toBe(150); // a huge welded lattice does not cross the screen
    expect(structureBarWidth(Number.NaN)).toBe(9);
  });
});

describe('⭐⭐ S191 C-7 — RULE 1/3 REACH: a WELDED hub — bar, sheet and art read ONE number', () => {
  it('banked 34 on its own arms: bar = sheet = art = 16/50 (32 %), not the component\'s 32/66', () => {
    const { w, hub, own } = hubBoard(true);
    bank(w, own, 34);
    const star = structurePoolFifths(LIGHTNING_HUB_DEGREE);
    const art = starHealthFrac(w, hub.id)!;
    expect(art).toBeCloseTo(1 - 34 / star, 10);
    expect(rampHealthFrac(own.length, 34, rampSpecFor('lightningHub')!)).toBeCloseTo(art, 10);

    const drawn = bars(w);
    expect(drawn.length, 'one bar: the hub\'s own star (the weld is part of it, not a second bar)').toBe(1);
    const { track, fillW } = drawn[0]!;
    expect(fillW / track.w, 'the bar fill = the art').toBeCloseTo(art, 10);
    expect(track.w, 'the track width is the STAR\'s pool on the bounded scale').toBeCloseTo(structureBarWidth(star), 10);

    const sheet = sheetHealth(w, hub.id);
    expect(sheet).toEqual({ cur: star - 34, max: star });
    // ⛔ What the bar used to say — the R182-F divergence, now gone: 34 against the 6-connector component.
    expect(1 - 34 / structurePoolFifths(6)).toBeGreaterThan(fillW / track.w + 0.1);
  });

  it('⛔ damage on the WELD connector moves neither the bar nor the sheet (it is not one of the hub\'s own)', () => {
    const { w, hub, weldBond } = hubBoard(true);
    w.bonds.get(weldBond!)!.damageFifths = 20;
    const { track, fillW } = bars(w)[0]!;
    expect(fillW).toBeCloseTo(track.w, 10);
    expect(sheetHealth(w, hub.id)).toEqual({ cur: 50, max: 50 });
    expect(starHealthFrac(w, hub.id)).toBe(1);
  });

  it('the sheet for the WELDED shape itself reads the tower it is welded to? No — it is not a member: its component', () => {
    const { w, weldBond } = hubBoard(true);
    const weldShape = w.bonds.get(weldBond!)!.bId;
    expect(structureHealthAt(w, weldShape), 'the welded Square is not a hub member').toEqual({ cur: 66, max: 66, connectors: 6 });
  });
});

describe('⛔ S191 C-7 — negatives: what did NOT move', () => {
  it('a STANDALONE hub: the bar, the art and the sheet agree, exactly as before (same five connectors)', () => {
    const { w, hub, own } = hubBoard(false);
    bank(w, own, 20);
    const { track, fillW } = bars(w)[0]!;
    expect(fillW / track.w).toBeCloseTo(starHealthFrac(w, hub.id)!, 10);
    expect(sheetHealth(w, hub.id)).toEqual({ cur: 30, max: 50 });
  });

  it('a FREEFORM lattice (no tower) keeps its component pool, now on the bounded width', () => {
    const w = makeWorld(0x191c7);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'PLAYING';
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    const a = prim(w, P0, SparkType.Square, 600, 400);
    const b = prim(w, P0, SparkType.Square, 640, 400);
    const c = prim(w, P0, SparkType.Square, 680, 400);
    const ab = link(w, a, b);
    link(w, b, c);
    w.bonds.get(ab)!.damageFifths = 7;
    const drawn = bars(w);
    expect(drawn.length).toBe(1);
    expect(drawn[0]!.track.w).toBeCloseTo(structureBarWidth(structurePoolFifths(2)), 10);
    expect(drawn[0]!.fillW / drawn[0]!.track.w).toBeCloseTo(1 - 7 / 14, 10);
    expect(structureHealthAt(w, a.id)).toEqual({ cur: 7, max: 14, connectors: 2 });
  });
});
