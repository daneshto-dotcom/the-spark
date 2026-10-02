/**
 * SPARK — S194 T15 (owner R194-30) — **A WELDED TOWER MUST NOT REBUILD ITSELF AS ITS STRUCTURE LOSES CONNECTORS.**
 *
 * > *"this pentagram tower is connected to the whole shape above … one of my warbands is destroying it.
 * > And as they destroy the connectors, it gets rebuilt … That's completely wrong."* — owner, S194.
 * > *"It's not only the pentagram … the golden goblin tower … there's a new 100% … but it still shows as
 * > like 100% health, and I think that's why it rebuilds the tower."*
 *
 * ⛔ DRIVEN THROUGH THE REAL HOST TICK WITH REAL ORC WARBAND UNITS (`t3Warband`, the owner's 18s), and the
 * renderer's own model each frame — `beginTowerCoverFrame` / `beginTowerHealthHoldFrame` in `main.ts`'s
 * order, then `rampMembersAt` → `markTowerCover` → `rampHealthFrac` → `advanceRampCursor` exactly as
 * `StructureRampRenderer.drawStructure` runs them (no renderer runs under vitest; the model is what it draws).
 *
 * What was measured BEFORE the fix, on this board (a stamped pentagram welded into a 45-connector lattice):
 *   · the sim is right: ONE spawner, same id, never re-registered; `towersBuilt` 1, `towersFell` 0 while it
 *     stands; no repair job; the struck lattice connector falls at the structure pool, 2250 = 45 × 50;
 *   · the tower's OWN pool (50) empties after three 18s on its own connectors (54 ≥ 50) — art at the last
 *     collapse frame — and when a LATTICE connector falls, the drain spends the pool from the struck bond
 *     and then the survivors in ascending id; the pentagram's 5 own connectors are bonds 0–4, so they are
 *     drained first, its own pool reads 50/50 again and the ramp cursor snaps from frame 24 to frame 1.
 *     That pristine-again building, with no FIX and no shape spent, is "it rebuilds automatically".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PlayerId, type PrimitiveId, type Vec2 } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Controls } from '../input/controls.ts';
import { componentOf } from '../game/structure.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from './hostTick.ts';
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
import { makeGameStateExtras } from './gameState.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { blueprintBill } from './blueprints.ts';
import { makeCastleBank } from './castleBank.ts';
import { structurePoolFifths } from './stats.ts';
import { towerOwnPoolAt } from './towerUnit.ts';
import { towerMembersAt } from './towerMembers.ts';
import { damageConnector, severWithCarry } from './damage.ts';
import { planStructureRepair, restoreFromDelivered } from './structureRepair.ts';
import { creatureAttackFifths } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import {
  advanceRampCursor, rampHealthFrac, rampMembersAt, rampSpecFor, rampTargetFrame, type RampCursor,
} from '../render/structureRamp.ts';
import {
  __resetTowerCoverForTests, beginTowerCoverFrame, coverAlphaForPrim, markTowerCover, TOWER_COVER_DRAW_EPSILON,
} from '../render/towerCover.ts';
import {
  __resetTowerHealthHoldForTests, beginTowerHealthHoldFrame, heldOwnBanked,
} from '../render/towerHealthHold.ts';
import { heldOwnPoolAt, towerOwnHealth } from '../render/structureBarHealth.ts';
import './godlyRecipes/registerAll.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const PENTA = 'pentagram' as GodlyId;
const AT: Vec2 = { x: 500, y: 300 };
const SPEC = rampSpecFor(PENTA)!;

afterEach(() => {
  __resetTowerCoverForTests();
  __resetTowerHealthHoldForTests();
});

function deps(): HostTickDeps {
  return {
    spawner: { tick() {} },
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function mk(w: World, type: SparkType, x: number, y: number, seat: PlayerId): Primitive {
  const player = w.players.get(seat)!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p: Primitive = {
    id, type, placerColor: player.color, placedBy: seat, createdTick: w.tick, pos: { x, y }, prevPos: { x, y },
    bonds: new Set(), ownerColor: player.color, lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, p);
  return p;
}

function link(w: World, a: Primitive, b: Primitive): BondId {
  const id = asBondId(w.nextBondId++);
  w.bonds.set(id, {
    id, aId: a.id, bId: b.id, a, b, restLength: Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y),
    stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
  });
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

/** The renderer's view of one tower, advanced one frame at a time exactly as `drawStructure` does. */
interface View { cursor: RampCursor | null; frame: number; target: number }

interface Rig {
  w: World;
  st: HostTickState;
  anchor: PrimitiveId;
  ring: PrimitiveId[];
  ownBonds: BondId[];
  view: View;
  /** One frame: host tick, matcher, effect wipe (production order), then the render frame. */
  frame: (opts?: { hold?: boolean }) => void;
}

/**
 * A demons seat's STAMPED pentagram (real `BUILD_BLUEPRINT`, real ignition), welded at its top node into a
 * 6×4 lattice of its own Squares — 45 connectors in all, pool 2250.
 */
function rig(): Rig {
  const w = makeWorld(0x19430);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.creatures.clear();
  w.players.get(P0)!.raceId = 'demons';
  w.players.get(P1)!.raceId = 'orcs';
  const bank = w.castleBanks.get(P0) ?? makeCastleBank();
  for (const [type, count] of blueprintBill(PENTA)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: PENTA, centre: AT });
  const st = makeHostTickState(w);
  const d = deps();
  const cursor = { lastMatcherTick: -1 };
  const view: View = { cursor: null, frame: 0, target: 0 };
  const r: Rig = {
    w, st, anchor: asPrimitiveId(-1), ring: [], ownBonds: [], view,
    frame: (opts = {}) => {
      runHostTick(w, d, st);
      runGodlyMatcherCore(w, cursor);
      w.effects.length = 0;
      beginTowerCoverFrame(w);
      if (opts.hold !== false) beginTowerHealthHoldFrame(w);
      const at = rampMembersAt(w, r.anchor, SPEC);
      if (at === null) return;
      markTowerCover(at.members, at.bonds, at.newestTick);
      const frac = rampHealthFrac(at.bonds.length, heldOwnBanked(PENTA, r.anchor, at.bankedFifths), SPEC);
      const target = rampTargetFrame(frac, SPEC);
      const prev = view.cursor ?? { frame: target, sinceTick: w.tick };
      view.cursor = advanceRampCursor(prev, target, w.tick, SPEC);
      view.frame = view.cursor.frame;
      view.target = target;
    },
  };
  r.frame();
  const sp = [...w.creatureSpawners.values()].find((s) => s.recipeId === PENTA);
  expect(sp, 'fixture: the stamped pentagram ignites').toBeDefined();
  r.anchor = sp!.anchorPrimitiveId;
  r.ring = [...(sp!.ownPrimitiveIds ?? [])];
  expect(r.ring.length).toBe(5);
  r.ownBonds = [...towerOwnPoolAt(w, PENTA, r.anchor)!.prims].length === 5
    ? [...w.bonds.values()].filter((b) => r.ring.includes(b.aId) && r.ring.includes(b.bId)).map((b) => b.id)
    : [];
  expect(r.ownBonds.length).toBe(5);
  // The lattice, ABOVE the ring, welded to its top node — the owner's "whole shape above".
  const top = r.ring.map((id) => w.primitives.get(id)!).sort((a, b) => a.pos.y - b.pos.y || a.id - b.id)[0]!;
  const grid: Primitive[][] = [];
  for (let row = 0; row < 4; row++) {
    grid.push([]);
    for (let c = 0; c < 6; c++) grid[row]!.push(mk(w, SparkType.Square, top.pos.x - 100 + c * 40, top.pos.y - 60 - row * 40, P0));
  }
  for (let row = 0; row < 4; row++) for (let c = 0; c < 6; c++) {
    if (c < 5) link(w, grid[row]![c]!, grid[row]![c + 1]!);
    if (row < 3) link(w, grid[row]![c]!, grid[row + 1]![c]!);
  }
  link(w, top, grid[0]![2]!);
  link(w, top, grid[0]![3]!);
  expect(componentOf(top, w.primitives, w.bonds).bondIds.size, 'fixture: 45 connectors').toBe(45);
  // Let the building finish fading in (cover out) before the fight.
  for (let i = 0; i < 200; i++) r.frame();
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  return r;
}

function warband(w: World, at: Vec2, n: number, tag: number): void {
  for (let i = 0; i < n; i++) {
    dispatch(w, {
      type: 'SPAWN_CREATURE', creatureType: 't3Warband', ownerPlayerId: P1,
      pos: { x: at.x + (i % 4) * 22, y: at.y + Math.floor(i / 4) * 22 }, targetPos: { ...at },
      sourceSpawnerId: (tag + i) as never,
    });
  }
}

const compSize = (r: Rig): number => {
  const a = r.w.primitives.get(r.anchor);
  return a === undefined ? 0 : componentOf(a, r.w.primitives, r.w.bonds).bondIds.size;
};
const spawnerIds = (w: World): number[] => [...w.creatureSpawners.keys()].map(Number).sort((a, b) => a - b);
const stats = (w: World) => w.matchStats.seats.get(P0) ?? { towersBuilt: 0, towersFell: 0 };

/**
 * Phase A: two warband units BELOW the pentagram empty its own pool on its own connectors. Phase B: they
 * are gone, and a warband ABOVE chews the lattice until `falls` lattice connectors have fallen. Returns the
 * per-fall record.
 */
function chew(r: Rig, falls: number, hold = true) {
  const { w } = r;
  expect(creatureAttackFifths({ type: 't3Warband' } as never), 'the owner\'s 18s').toBe(18);
  expect(structurePoolFifths(5)).toBe(50);
  expect(structurePoolFifths(45)).toBe(2250);
  warband(w, { x: AT.x - 30, y: AT.y + 80 }, 2, 9000);
  let guard = 0;
  while (towerOwnPoolAt(w, PENTA, r.anchor)!.cur > 0) {
    r.frame({ hold });
    if (++guard > 3000) throw new Error('phase A: the own pool never emptied');
  }
  // 3 swings of 18 = 54 ≥ 50: the art is at (or walking to) its last collapse frame.
  for (const c of [...w.creatures.values()]) if (c.ownerPlayerId === P1) w.creatures.delete(c.id);
  for (let i = 0; i < 40; i++) r.frame({ hold });
  expect(r.view.frame, 'phase A: an emptied own pool draws the last collapse frame').toBe(SPEC.frames);
  const spIds = spawnerIds(w);
  warband(w, { x: AT.x - 60, y: AT.y - 260 }, 6, 9100);
  const record: { tick: number; rawCur: number; shownCur: number; frame: number; target: number }[] = [];
  let lastComp = compSize(r);
  guard = 0;
  while (record.length < falls) {
    r.frame({ hold });
    if (++guard > 12_000) throw new Error(`only ${record.length} lattice connectors fell`);
    expect(spawnerIds(w), `t=${w.tick}: the SAME spawner, never re-registered`).toEqual(spIds);
    for (const b of r.ownBonds) expect(w.bonds.has(b), `t=${w.tick}: own connector ${b} stands`).toBe(true);
    const comp = compSize(r);
    if (comp < lastComp) {
      record.push({
        tick: w.tick,
        rawCur: towerOwnPoolAt(w, PENTA, r.anchor)!.cur,
        shownCur: towerOwnHealth(w, PENTA, r.anchor)!.max - towerOwnHealth(w, PENTA, r.anchor)!.banked,
        frame: r.view.frame,
        target: r.view.target,
      });
    }
    lastComp = comp;
  }
  return record;
}

describe('⛔ R194-30 — a welded pentagram under an orc warband, three lattice connectors lost', () => {
  it('REACH: it stays the same tower, its art stays where the damage put it, no build replays', () => {
    const r = rig();
    const before = { ...stats(r.w) };
    const record = chew(r, 3);
    expect(record.length).toBe(3);
    for (const f of record) {
      // The sim is untouched: each fall DID drain the tower's own connectors (the raw read is full again)…
      expect(f.rawCur, `t=${f.tick}: the drain refilled the RAW own pool (the mechanism)`).toBe(50);
      // …and the surfaces do not show it as rebuilt.
      expect(f.shownCur, `t=${f.tick}: the bar does not refill`).toBe(0);
      expect(f.target, `t=${f.tick}: the art aims at the last collapse frame`).toBe(SPEC.frames);
      expect(f.frame, `t=${f.tick}: the art does not snap back to pristine`).toBe(SPEC.frames);
    }
    // No build replay: the tower's shapes never phased back in, and nothing was built or fell.
    for (const id of r.ring) expect(coverAlphaForPrim(id), `own shape ${id} stays hidden`).toBeLessThanOrEqual(TOWER_COVER_DRAW_EPSILON);
    expect(stats(r.w).towersBuilt).toBe(before.towersBuilt);
    expect(stats(r.w).towersFell).toBe(before.towersFell);
    expect(r.w.repairJobs.length, 'no repair job — nothing FIXed it').toBe(0);
  });

  it('the defect, reproduced with the hold OFF: the first lattice connector to fall "rebuilds" the art', () => {
    const r = rig();
    const record = chew(r, 1, false);
    expect(record[0]!.rawCur).toBe(50);
    expect(record[0]!.target, 'raw: full health again').toBe(1);
    expect(record[0]!.frame, 'raw: the cursor snapped from the rubble to frame 1 — the owner\'s rebuild').toBe(1);
  });
});

describe('R194-30 — not only the pentagram: the GOLDEN GOBLIN TOWER (a star) welded into a lattice', () => {
  it('a lattice connector falling does not refill the goblin tower own pool', () => {
    const w = makeWorld(0x19431);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'PLAYING';
    w.matchPhase = 'BUILD';
    w.creatures.clear();
    const G = 'goblinTower' as GodlyId;
    const bank = w.castleBanks.get(P0) ?? makeCastleBank();
    for (const [type, count] of blueprintBill(G)) bank[type as number] = (bank[type as number] ?? 0) + count;
    w.castleBanks.set(P0, bank);
    applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: G, centre: AT });
    runGodlyMatcherCore(w, { lastMatcherTick: -1 });
    w.effects.length = 0;
    const sp = [...w.creatureSpawners.values()].find((s) => s.recipeId === G)!;
    expect(sp, 'fixture: the goblin tower ignites').toBeDefined();
    const own = towerOwnPoolAt(w, G, sp.anchorPrimitiveId)!;
    expect(own.max).toBe(structurePoolFifths(own.connectors));
    // Weld a 4-link chain of Squares onto a leaf.
    const leaf = w.primitives.get(own.prims.find((id) => id !== sp.anchorPrimitiveId)!)!;
    let prev = leaf;
    const chain: BondId[] = [];
    for (let i = 0; i < 4; i++) {
      const q = mk(w, SparkType.Square, leaf.pos.x + 40 * (i + 1), leaf.pos.y - 40, P0);
      chain.push(link(w, prev, q));
      prev = q;
    }
    w.matchPhase = 'FIGHT';
    beginTowerHealthHoldFrame(w);
    // Empty its own pool on its own arms, standing (the weld's pool is larger).
    const n = componentOf(leaf, w.primitives, w.bonds).bondIds.size;
    const ownBonds = towerMembersAt(w, G, sp.anchorPrimitiveId)!.bonds;
    for (const b of ownBonds) expect(damageConnector(w, b, Math.ceil(own.max / ownBonds.length) + 1, null, 'physical')).toBe(false);
    beginTowerHealthHoldFrame(w);
    expect(heldOwnPoolAt(w, G, sp.anchorPrimitiveId)!.cur).toBe(0);
    // A hit on the far end of the chain banks the rest of the structure's pool: the chain link falls.
    let banked = 0;
    for (const id of componentOf(leaf, w.primitives, w.bonds).bondIds) banked += w.bonds.get(id)!.damageFifths;
    const far = chain[chain.length - 1]!;
    expect(damageConnector(w, far, structurePoolFifths(n) - banked, null, 'physical')).toBe(true);
    severWithCarry(w, far, (id) => dispatch(w, { type: 'SEVER_BOND', bondId: id, playerId: P1, cause: 'unit' }));
    expect(w.bonds.has(far)).toBe(false);
    expect(towerOwnPoolAt(w, G, sp.anchorPrimitiveId)!.cur, 'raw: the drain refilled it').toBe(own.max);
    beginTowerHealthHoldFrame(w);
    expect(heldOwnPoolAt(w, G, sp.anchorPrimitiveId)!.cur, 'shown: still emptied — not rebuilt').toBe(0);
    expect(w.creatureSpawners.get(sp.id), 'the same tower').toBeDefined();
  });
});

describe('R194-30 negatives — what must still heal, and what must still build', () => {
  it('a real FIX (no connector lost) heals the art and the bar', () => {
    const r = rig();
    r.w.matchPhase = 'BUILD';
    // Two own connectors take 30 each — 60 ≥ 50 — standing (no fall: the weld's pool is 2250).
    for (const b of r.ownBonds.slice(0, 2)) expect(damageConnector(r.w, b, 30, null, 'physical')).toBe(false);
    for (let i = 0; i < 60; i++) r.frame();
    expect(r.view.frame).toBe(SPEC.frames);
    expect(heldOwnPoolAt(r.w, PENTA, r.anchor)!.cur).toBe(0);
    const plan = planStructureRepair(r.w, P0, r.ring[0]!);
    expect(plan, 'a welded tower\'s own FIX plans (R191-A)').not.toBeNull();
    const comp = compSize(r);
    restoreFromDelivered(r.w, P0, plan!);
    expect(compSize(r), 'a FIX loses no connector').toBe(comp);
    r.frame();
    expect(heldOwnPoolAt(r.w, PENTA, r.anchor)!.cur, 'the FIX shows').toBe(50);
    expect(r.view.frame, 'the repaired tower looks whole on the next frame').toBe(1);
  });

  it('a genuinely NEW tower still plays its build: first sight reads the sim, and its shapes fade out', () => {
    const r = rig();
    r.w.matchPhase = 'BUILD';
    const bank = r.w.castleBanks.get(P0)!;
    for (const [type, count] of blueprintBill(PENTA)) bank[type as number] = (bank[type as number] ?? 0) + count;
    applyBuildBlueprint(r.w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: PENTA, centre: { x: 700, y: 300 } });
    const fresh = () => [...r.w.creatureSpawners.values()].find((s) => s.recipeId === PENTA && s.anchorPrimitiveId !== r.anchor);
    r.frame();
    const sp = fresh();
    expect(sp, 'the second pentagram ignites').toBeDefined();
    const at = rampMembersAt(r.w, sp!.anchorPrimitiveId, SPEC)!;
    markTowerCover(at.members, at.bonds, at.newestTick);
    expect(heldOwnBanked(PENTA, sp!.anchorPrimitiveId, at.bankedFifths), 'first sight = the sim').toBe(0);
    beginTowerCoverFrame(r.w);
    expect(coverAlphaForPrim(at.members[0]!), 'its shapes are still drawn: the fade is starting').toBeGreaterThan(0.9);
    for (let i = 0; i < 130; i++) { beginTowerCoverFrame(r.w); markTowerCover(at.members, at.bonds, at.newestTick); r.w.tick++; }
    beginTowerCoverFrame(r.w);
    expect(coverAlphaForPrim(at.members[0]!), 'and fade out under the building — the build played').toBeLessThanOrEqual(TOWER_COVER_DRAW_EPSILON);
  });

  it('new damage always shows through a hold (the hold never hides a hit)', () => {
    const r = rig();
    expect(damageConnector(r.w, r.ownBonds[0]!, 18, null, 'physical')).toBe(false);
    r.frame();
    expect(heldOwnPoolAt(r.w, PENTA, r.anchor)!.cur).toBe(32);
  });
});

describe('R194-30 guard — every live-tower health surface reads the hold (mechanical)', () => {
  const src = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  it('main.ts advances the hold every frame, right after the cover frame', () => {
    expect(src('../main.ts')).toMatch(/beginTowerCoverFrame\(world\);\n(?:\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)\n)*\s*beginTowerHealthHoldFrame\(world\);/);
  });
  it('the ramp art prices its frame on the held damage, never the raw sum', () => {
    const s = src('../render/structureRampRenderer.ts');
    expect(s).toContain('rampHealthFrac(bonds.length, heldOwnBanked(spec.recipeId, anchorId, at.bankedFifths), spec)');
    expect(s).not.toMatch(/rampHealthFrac\([^)]*,\s*at\.bankedFifths\s*,/);
  });
  it('the renderer reads `towerOwnPoolAt` in exactly the places that apply (or need not apply) the hold', () => {
    // structureBarHealth: ONE call, inside `heldOwnPoolAt`. towerHealthHold: the hold's own read.
    // characterSheetModel: ONE call, for the connector COUNT only (no health). A new reader fails here
    // until it is routed through `heldOwnPoolAt` or listed with its reason.
    const count = (s: string): number => (s.match(/\btowerOwnPoolAt\(/g) ?? []).length;
    expect(count(src('../render/structureBarHealth.ts'))).toBe(1);
    expect(count(src('../render/towerHealthHold.ts'))).toBe(1);
    const sheet = src('../render/characterSheetModel.ts');
    expect(count(sheet)).toBe(1);
    expect(sheet).toMatch(/towerOwnPoolAt\(world, unit\.recipeId, unit\.anchorId\)\?\.connectors/);
    expect((sheet.match(/= towerOwnHealth\(world, /g) ?? []).length, 'the card reads its pool through shownOwnHealth').toBe(1);
  });
});
