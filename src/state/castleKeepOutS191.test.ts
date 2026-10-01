/**
 * SPARK — S191 (owner) — **THE CASTLE NO-BUILD RADIUS, HALVED: 121 → 61, AND THE PORCH KEPT CLEAR.**
 *
 * > *"the no build zone near castle is like way too ridiculous. It needs to be halved. Okay, like the
 * > radius where you can't build around the castle."* — owner, S191
 *
 * What this file pins, through the REAL reducers and the real host tick:
 *   1. the ring the halving frees (61 ≤ d < 121) is buildable — by a single shape AND by a stamp;
 *   2. a porch slot is NOT buildable — not by a stamp, not by a single shape, on any seat of any board;
 *   3. REACH: a tower stamped as close to the porch as the new rule allows, then all four slots filled
 *      by `PULL_FROM_BANK`, then physics — every pulled shape stays on its slot (no S136 fling);
 *   4. units still leave the keep on clear ground: a real castle emission lands inside the keep-out;
 *   5. the bot planner's legality agrees.
 */

import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CASTLE_PORCH_SLOT_CLEAR_RADIUS,
  CASTLE_PORCH_SLOTS,
  PLAYER_COLORS,
  SparkType,
} from '../constants.ts';
import { asPlayerId, asSparkId, type PlayerId, type Vec2 } from '../types.ts';
import { makeFreeSpark } from '../game/spark.ts';
import type { Controls } from '../input/controls.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { isLegalBuildPos } from '../bots/botBrain.ts';
import { stampFootprintBox, stampRefusalAt } from './blueprintLegality.ts';
import { blueprintBill } from './blueprints.ts';
import { makeCastleBank, porchSlot } from './castleBank.ts';
import { makeGameStateExtras } from './gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { applyPlaceFromFree } from './placeFromFree.ts';
import { mulberry32 } from './rng.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import {
  boxPointDistSq,
  CASTLE_NO_BUILD_RADIUS,
  CASTLE_PORCH_KEEP_OUT_RADIUS,
  castleKeepOutHitsBox,
  isInsideCastleKeepOut,
  zoneCastleAnchor,
  zoneCount,
  type ZoneLayout,
} from './zones.ts';

const LAYOUTS: readonly ZoneLayout[] = ['PITCH_2P', 'QUADRANTS_4P'];
/** S182's radius — the ground between it and the new one is what the halving gives back. */
const OLD_RADIUS = 121;
const TOWER = 'stinkTower' as const;

function boardWorld(layout: ZoneLayout, seat: PlayerId, at: Vec2): World {
  const seats = zoneCount(layout);
  const world = makeWorld(0);
  world.gameState = 'TITLE';
  dispatch(world, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: Array.from({ length: seats }, (_, s) => ({ seat: s, color: PLAYER_COLORS[s] })),
    botSeats: Array.from({ length: seats - 1 }, (_, i) => i + 1),
  });
  expect(world.layout).toBe(layout);
  dispatch(world, { type: 'UPDATE_AVATAR_POS', playerId: seat, pos: { ...at } });
  return world;
}

let nextSpark = 31_000;
function placeFromFree(world: World, seat: PlayerId, pos: Vec2): boolean {
  const before = world.primitives.size;
  const spark = makeFreeSpark({
    id: asSparkId(nextSpark++), type: SparkType.Dot, pos: { ...pos }, velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
  });
  world.freeSparks.set(spark.id, spark);
  applyPlaceFromFree(world, {
    type: 'PLACE_FROM_FREE', sparkId: spark.id, playerId: seat, placementPos: { ...pos }, stiffnessTier: 'MID', targetPrimitiveId: null,
  });
  return world.primitives.size > before;
}

/** A point `d` px from the anchor toward the board centre — in-zone and off the rim by construction. */
function towardCentre(layout: ZoneLayout, seat: number, d: number): Vec2 {
  const a = zoneCastleAnchor(seat, layout);
  const v = { x: CANVAS_WIDTH / 2 - a.x, y: CANVAS_HEIGHT / 2 - a.y };
  const len = Math.hypot(v.x, v.y);
  return { x: a.x + (v.x / len) * d, y: a.y + (v.y / len) * d };
}

function fund(world: World, seat: PlayerId): void {
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill(TOWER)) bank[type as number] = (bank[type as number] ?? 0) + count * 4;
  bank[SparkType.Dot as number] = (bank[SparkType.Dot as number] ?? 0) + CASTLE_PORCH_SLOTS;
  world.castleBanks.set(seat, bank);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — the freed ring is buildable, through the real reducers', () => {
  for (const layout of LAYOUTS) {
    for (let s = 0; s < zoneCount(layout); s++) {
      const seat = asPlayerId(s);
      it(`${layout} seat ${s} — a shape at 90 px (inside the old 121) now lands; at 59 px it still does not`, () => {
        const freed = towardCentre(layout, s, 90);
        expect(90).toBeLessThan(OLD_RADIUS); // anti-vacuity: this ground WAS refused before
        expect(isInsideCastleKeepOut(freed, layout)).toBe(false);
        expect(placeFromFree(boardWorld(layout, seat, freed), seat, freed)).toBe(true);
        const kept = towardCentre(layout, s, CASTLE_NO_BUILD_RADIUS - 2);
        expect(placeFromFree(boardWorld(layout, seat, kept), seat, kept)).toBe(false);
        // …and the bot planner agrees on both.
        const w = boardWorld(layout, seat, freed);
        expect(isLegalBuildPos(freed, seat, w)).toBe(true);
        expect(isLegalBuildPos(kept, seat, w)).toBe(false);
      });
    }
  }

  it('⭐ a STAMP whose footprint reaches 62 px of the anchor is legal; at 60 px it is refused CASTLE', () => {
    for (const layout of LAYOUTS) {
      for (let s = 0; s < zoneCount(layout); s++) {
        const a = zoneCastleAnchor(s, layout);
        const w = boardWorld(layout, asPlayerId(s), a);
        const dir = a.x < CANVAS_WIDTH / 2 ? 1 : -1;
        const box0 = stampFootprintBox({ x: 0, y: 0 }, TOWER);
        // centre such that the box's NEAR edge sits exactly `gap` px from the anchor along ±x
        const centreAt = (gap: number): Vec2 => ({ x: dir > 0 ? a.x + gap - box0.minX : a.x - gap - box0.maxX, y: a.y });
        expect(stampRefusalAt(w, centreAt(CASTLE_NO_BUILD_RADIUS + 1), asPlayerId(s), TOWER), `${layout} ${s}`).not.toBe('CASTLE');
        expect(stampRefusalAt(w, centreAt(CASTLE_NO_BUILD_RADIUS - 1), asPlayerId(s), TOWER)).toBe('CASTLE');
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — ⛔ the PORCH stays clear (each slot carries its own disc)', () => {
  it('a stamp centred on ANY porch slot of ANY castle is refused CASTLE', () => {
    for (const layout of LAYOUTS) {
      for (let s = 0; s < zoneCount(layout); s++) {
        const w = boardWorld(layout, asPlayerId(s), zoneCastleAnchor(s, layout));
        for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
          expect(stampRefusalAt(w, porchSlot(s, i, layout), asPlayerId(s), TOWER), `${layout} ${s} slot ${i}`).toBe('CASTLE');
        }
      }
    }
  });

  it('a single shape placed ON a porch slot is refused by the host reducer (own castle)', () => {
    for (const layout of LAYOUTS) {
      for (let s = 0; s < zoneCount(layout); s++) {
        for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
          const slot = porchSlot(s, i, layout);
          expect(placeFromFree(boardWorld(layout, asPlayerId(s), slot), asPlayerId(s), slot), `${layout} ${s} slot ${i}`).toBe(false);
        }
      }
    }
  });

  it('⚠ NEGATIVE — without the slot discs the halved disc alone would let a stamp onto the porch', () => {
    // The slot discs are load-bearing, not belt-and-braces: a slot is outside the 61 disc.
    const layout: ZoneLayout = 'PITCH_2P';
    const a = zoneCastleAnchor(0, layout);
    for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
      const s = porchSlot(0, i, layout);
      const box = { minX: s.x, maxX: s.x, minY: s.y, maxY: s.y };
      expect(boxPointDistSq(box, a.x, a.y)).toBeGreaterThan(CASTLE_NO_BUILD_RADIUS * CASTLE_NO_BUILD_RADIUS);
      expect(castleKeepOutHitsBox(box, layout)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — ⭐⭐ REACH: a tower as close to the porch as legal, all four slots pulled, physics run', () => {
  it('every pulled shape stays on its slot — no fling — and nothing built sits on a slot', () => {
    const layout: ZoneLayout = 'PITCH_2P';
    const seat = asPlayerId(0);
    const a = zoneCastleAnchor(0, layout);
    const w = boardWorld(layout, seat, a);
    fund(w, seat);

    // The legal stamp centre (2 px grid around the keep) whose footprint comes NEAREST any slot,
    // restricted to the ring the halving freed — so this is exactly the case the slot discs exist for.
    const slots = Array.from({ length: CASTLE_PORCH_SLOTS }, (_, i) => porchSlot(0, i, layout));
    let best: Vec2 | null = null;
    let bestD2 = Infinity;
    for (let dx = -160; dx <= 160; dx += 2) {
      for (let dy = -40; dy <= 200; dy += 2) {
        const c = { x: a.x + dx, y: a.y + dy };
        if (stampRefusalAt(w, c, seat, TOWER) !== null) continue;
        const box = stampFootprintBox(c, TOWER);
        if (boxPointDistSq(box, a.x, a.y) >= OLD_RADIUS * OLD_RADIUS) continue; // not in the freed ring
        const d2 = Math.min(...slots.map((s) => boxPointDistSq(box, s.x, s.y)));
        if (d2 < bestD2) { bestD2 = d2; best = c; }
      }
    }
    expect(best, 'the freed ring holds a legal stamp near the porch').not.toBeNull();
    expect(bestD2).toBeGreaterThanOrEqual(CASTLE_PORCH_KEEP_OUT_RADIUS * CASTLE_PORCH_KEEP_OUT_RADIUS);

    const before = w.primitives.size;
    dispatch(w, { type: 'BUILD_BLUEPRINT', playerId: seat, blueprintId: TOWER, centre: best! });
    expect(w.primitives.size, 'the stamp really landed').toBeGreaterThan(before);

    for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) dispatch(w, { type: 'PULL_FROM_BANK', playerId: seat, sparkType: SparkType.Dot });
    const pulled = [...w.freeSparks.values()].filter((sp) => sp.escrow === 'banked');
    expect(pulled, 'all four slots filled').toHaveLength(CASTLE_PORCH_SLOTS);

    const d: HostTickDeps = {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)),
      controls: { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls,
      botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
    } as unknown as HostTickDeps;
    w.matchPhase = 'BUILD';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    const s = makeHostTickState(w);
    for (let t = 0; t < 180; t++) runHostTick(w, d, s);

    for (const sp of pulled) {
      const live = w.freeSparks.get(sp.id);
      if (live === undefined) continue; // a bot cruiser may legally grab its own porch shape
      const near = Math.min(...slots.map((q) => Math.hypot(live.pos.x - q.x, live.pos.y - q.y)));
      expect(near, `spark ${sp.id as unknown as number} stayed on its slot`).toBeLessThan(CASTLE_PORCH_SLOT_CLEAR_RADIUS);
    }
    for (const p of w.primitives.values()) {
      for (const q of slots) {
        expect(Math.hypot(p.pos.x - q.x, p.pos.y - q.y), 'no built shape on a slot').toBeGreaterThan(CASTLE_PORCH_SLOT_CLEAR_RADIUS);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — units still leave the keep on clear ground', () => {
  it('a REAL castle emission is born inside the keep-out, so no tower can stand on the emit ring', () => {
    const layout: ZoneLayout = 'PITCH_2P';
    const w = boardWorld(layout, asPlayerId(0), zoneCastleAnchor(0, layout));
    w.draft = null;
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    const d: HostTickDeps = {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)),
      controls: { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls,
      botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
    } as unknown as HostTickDeps;
    const s = makeHostTickState(w);
    const seen = new Set(w.creatures.keys());
    let born: Vec2 | null = null;
    for (let t = 0; t < 3000 && born === null; t++) {
      runHostTick(w, d, s);
      for (const c of w.creatures.values()) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        if (c.type === 'raceUnit' && c.ownerPlayerId === asPlayerId(0)) born = { x: c.pos.x, y: c.pos.y };
      }
    }
    expect(born, 'anti-vacuity: the castle emitted').not.toBeNull();
    // Measured at birth (the first tick it exists), before it has walked anywhere.
    expect(isInsideCastleKeepOut(born!, layout)).toBe(true);
  });
});
