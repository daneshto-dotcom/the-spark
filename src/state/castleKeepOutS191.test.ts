/**
 * SPARK — S191 (owner) — **THE CASTLE NO-BUILD RADIUS, HALVED: 121 → 61, AND THE PORCH KEPT CLEAR.**
 *
 * > *"the no build zone near castle is like way too ridiculous. It needs to be halved. Okay, like the
 * > radius where you can't build around the castle."* — owner, S191
 *
 * What this file pins, through the REAL reducers and the real host tick:
 *   1. the ring the halving frees (61 ≤ d < 121) is buildable — by a single shape AND by a stamp;
 *   2. ⭐ S193 P3-1 RE-PIN — the porch is ordinary ground (S191's per-slot discs left the keep-out, which
 *      is now ONE uniform 61 disc — the owner's "short radius … immediately around it");
 *   3. REACH: a tower stamped OVER the porch, then all four slots pulled — every covered slot is skipped,
 *      no shape is minted into the tower, the rest stay on their slots; and no stamp lands ON a porch shape;
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
  STAMP_CLEARANCE,
} from '../constants.ts';
import { asPlayerId, asSparkId, type PlayerId, type Vec2 } from '../types.ts';
import { makeFreeSpark } from '../game/spark.ts';
import type { Controls } from '../input/controls.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { isLegalBuildPos } from '../bots/botBrain.ts';
import { stampFootprintBox, stampRefusalAt } from './blueprintLegality.ts';
import { blueprintBill, blueprintPositions } from './blueprints.ts';
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
describe('⭐⭐ S193 P3-1 — the PORCH is ordinary ground now (the keep-out is ONE uniform disc)', () => {
  // S193 RE-PIN of S191's "the PORCH stays clear (each slot carries its own disc)". The owner ruled the
  // keep-out "a short radius … immediately around it", the same on every side; the slot discs made it
  // reach 108 px south. What they protected — no shape minted into a tower — is pinned below instead.
  it('a stamp centred on a porch slot is refused CASTLE only because its box reaches the 61 disc', () => {
    for (const layout of LAYOUTS) {
      for (let s = 0; s < zoneCount(layout); s++) {
        const w = boardWorld(layout, asPlayerId(s), zoneCastleAnchor(s, layout));
        const a = zoneCastleAnchor(s, layout);
        for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
          const c = porchSlot(s, i, layout);
          const reaches = boxPointDistSq(stampFootprintBox(c, TOWER), a.x, a.y) < CASTLE_NO_BUILD_RADIUS ** 2;
          expect(reaches, 'anti-vacuity: this tower is tall enough to reach the disc from the porch').toBe(true);
          expect(stampRefusalAt(w, c, asPlayerId(s), TOWER), `${layout} ${s} slot ${i}`).toBe('CASTLE');
        }
      }
    }
  });

  it('a single shape placed ON a porch slot now LANDS (the porch is outside the 61 disc)', () => {
    for (const layout of LAYOUTS) {
      for (let s = 0; s < zoneCount(layout); s++) {
        for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
          const slot = porchSlot(s, i, layout);
          expect(isInsideCastleKeepOut(slot, layout)).toBe(false);
          expect(placeFromFree(boardWorld(layout, asPlayerId(s), slot), asPlayerId(s), slot), `${layout} ${s} slot ${i}`).toBe(true);
        }
      }
    }
  });

  it('⛔ the keep-out is the 61 disc and NOTHING else — a porch slot is outside it', () => {
    for (const layout of LAYOUTS) {
      const a = zoneCastleAnchor(0, layout);
      for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
        const s = porchSlot(0, i, layout);
        const box = { minX: s.x, maxX: s.x, minY: s.y, maxY: s.y };
        expect(boxPointDistSq(box, a.x, a.y)).toBeGreaterThan(CASTLE_NO_BUILD_RADIUS * CASTLE_NO_BUILD_RADIUS);
        expect(castleKeepOutHitsBox(box, layout)).toBe(false);
      }
    }
  });
});

describe('⭐⭐ S193 P3-1 — REACH: what the porch discs protected still holds, through the real reducers + host tick', () => {
  const pitchDeps = (): HostTickDeps => ({
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)),
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps);

  it('a tower stamped OVER the porch: every pull skips the slots it covers — no shape is minted into it', () => {
    const layout: ZoneLayout = 'PITCH_2P';
    const seat = asPlayerId(0);
    const a = zoneCastleAnchor(0, layout);
    const w = boardWorld(layout, seat, a);
    fund(w, seat);
    const slots = Array.from({ length: CASTLE_PORCH_SLOTS }, (_, i) => porchSlot(0, i, layout));
    // The legal stamp centre (2 px grid) whose box covers the most porch slots — S193 lets it.
    let best: Vec2 | null = null;
    let bestCovered = -1;
    for (let dx = -160; dx <= 160; dx += 2) {
      for (let dy = 40; dy <= 200; dy += 2) {
        const c = { x: a.x + dx, y: a.y + dy };
        if (stampRefusalAt(w, c, seat, TOWER) !== null) continue;
        const box = stampFootprintBox(c, TOWER);
        const covered = slots.filter((q) => boxPointDistSq(box, q.x, q.y) === 0).length;
        if (covered > bestCovered) { bestCovered = covered; best = c; }
      }
    }
    expect(bestCovered, 'anti-vacuity: S193 really lets a tower stand over the porch').toBeGreaterThan(0);
    const before = w.primitives.size;
    dispatch(w, { type: 'BUILD_BLUEPRINT', playerId: seat, blueprintId: TOWER, centre: best! });
    expect(w.primitives.size, 'the stamp really landed').toBeGreaterThan(before);
    const builtNear = (q: Vec2): boolean =>
      [...w.primitives.values()].some((p) => Math.hypot(p.pos.x - q.x, p.pos.y - q.y) < CASTLE_PORCH_KEEP_OUT_RADIUS);
    const covered = slots.filter(builtNear);
    expect(covered.length, 'anti-vacuity: at least one slot is now under the tower').toBeGreaterThan(0);
    const banked = w.castleBanks.get(seat)![SparkType.Dot as number]!;

    for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) dispatch(w, { type: 'PULL_FROM_BANK', playerId: seat, sparkType: SparkType.Dot });
    const pulled = [...w.freeSparks.values()].filter((sp) => sp.escrow === 'banked');
    expect(pulled.length, 'exactly the uncovered slots were filled').toBe(CASTLE_PORCH_SLOTS - covered.length);
    for (const sp of pulled) {
      for (const p of w.primitives.values()) {
        expect(Math.hypot(sp.pos.x - p.pos.x, sp.pos.y - p.pos.y), 'no pulled shape inside the tower').toBeGreaterThanOrEqual(CASTLE_PORCH_KEEP_OUT_RADIUS);
      }
    }
    // The refused pulls lost nothing: only the filled slots were spent from the bank.
    expect(w.castleBanks.get(seat)![SparkType.Dot as number]).toBe(banked - pulled.length);

    // And physics leaves every pulled shape on its slot.
    w.matchPhase = 'BUILD';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    const st = makeHostTickState(w);
    const d = pitchDeps();
    for (let t = 0; t < 180; t++) runHostTick(w, d, st);
    for (const sp of pulled) {
      const live = w.freeSparks.get(sp.id);
      if (live === undefined) continue; // a bot cruiser may legally grab its own porch shape
      const near = Math.min(...slots.map((q) => Math.hypot(live.pos.x - q.x, live.pos.y - q.y)));
      expect(near, `spark ${sp.id as unknown as number} stayed on its slot`).toBeLessThan(CASTLE_PORCH_SLOT_CLEAR_RADIUS);
    }
  });

  it('and a tower may not be stamped ONTO a shape resting on the porch (BLOCKED, like any geometry)', () => {
    const layout: ZoneLayout = 'PITCH_2P';
    const seat = asPlayerId(0);
    const a = zoneCastleAnchor(0, layout);
    const w = boardWorld(layout, seat, a);
    fund(w, seat);
    // A centre that is LEGAL with an empty porch and puts a tower node within STAMP_CLEARANCE of slot 0.
    const slot0 = porchSlot(0, 0, layout);
    let pick: Vec2 | null = null;
    for (let dx = -160; dx <= 160 && pick === null; dx += 2) {
      for (let dy = 40; dy <= 200 && pick === null; dy += 2) {
        const c = { x: a.x + dx, y: a.y + dy };
        if (stampRefusalAt(w, c, seat, TOWER) !== null) continue;
        if (blueprintPositions(TOWER, c).some((n) => Math.hypot(n.x - slot0.x, n.y - slot0.y) < STAMP_CLEARANCE)) pick = c;
      }
    }
    expect(pick, 'anti-vacuity: such a centre exists').not.toBeNull();
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: seat, sparkType: SparkType.Dot }); // fills slot 0
    const resting = [...w.freeSparks.values()].filter((sp) => sp.escrow === 'banked');
    expect(resting).toHaveLength(1);
    expect(Math.hypot(resting[0]!.pos.x - slot0.x, resting[0]!.pos.y - slot0.y)).toBe(0);
    expect(stampRefusalAt(w, pick!, seat, TOWER)).toBe('BLOCKED');
    const before = w.primitives.size;
    dispatch(w, { type: 'BUILD_BLUEPRINT', playerId: seat, blueprintId: TOWER, centre: pick! });
    expect(w.primitives.size, 'the host reducer refuses it too').toBe(before);
  });
});

describe('⭐⭐ S193 P3-1 — REACH: the 4P board, every castle, every recipe — the same gap on every side', () => {
  // The owner's report, as a map: walk a stamp out from each castle along each axis that stays on the
  // canvas, through the real `stampRefusalAt` (host reducer, client ghost, click gate and bots all call
  // it), and measure the gap from the anchor to the footprint at the first legal centre.
  // Measured BEFORE (S191 rule): laser turret east 73.9, SOUTH 108.0; stink tower east 61.9, south 108.0.
  it('laser turret, goblin tower, stink tower: every on-board side opens at the 61 disc, ±1.5 px', () => {
    const layout: ZoneLayout = 'QUADRANTS_4P';
    const recipes = ['laserTurret', 'goblinTower', TOWER] as const;
    const dirs: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let sides = 0;
    for (let s = 0; s < 4; s++) {
      const a = zoneCastleAnchor(s, layout);
      const w = boardWorld(layout, asPlayerId(s), a);
      for (const bp of recipes) {
        for (const [dx, dy] of dirs) {
          let gap: number | null = null;
          let last: string | null = 'CASTLE';
          for (let d = 0; d <= 300 && gap === null; d++) {
            const c = { x: a.x + dx * d, y: a.y + dy * d };
            const r = stampRefusalAt(w, c, asPlayerId(s), bp);
            if (r !== null && r !== 'CASTLE') { last = r; break; } // off-screen side: not this rule's
            if (r === null) gap = Math.sqrt(boxPointDistSq(stampFootprintBox(c, bp), a.x, a.y));
          }
          if (gap === null) { expect(last, `${bp} seat ${s} (${dx},${dy})`).toBe('OFF SCREEN'); continue; }
          sides++;
          expect(gap, `${bp} seat ${s} dir (${dx},${dy})`).toBeGreaterThanOrEqual(CASTLE_NO_BUILD_RADIUS);
          expect(gap, `${bp} seat ${s} dir (${dx},${dy})`).toBeLessThan(CASTLE_NO_BUILD_RADIUS + 1.5);
        }
      }
    }
    // Two on-board sides per corner castle × 4 castles × 3 recipes — including both top castles' SOUTH.
    expect(sides).toBe(2 * 4 * 3);
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
