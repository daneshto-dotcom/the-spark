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
 *      ⭐ S194 R194-16 RE-PIN — and the ENTRANCE is not built on: a 17 px clearance per slot, row at +42;
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
import { canBuildNow } from './buildLegality.ts';
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
  CASTLE_PORCH_BUILD_CLEAR_RADIUS,
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
describe('⭐⭐ S193 P3-1 → S194 R194-16 — the 61 disc plus a small clearance on the entrance', () => {
  // S193 RE-PIN of S191's "the PORCH stays clear (each slot carries its own disc)". The owner ruled the
  // keep-out "a short radius … immediately around it", the same on every side; the slot discs made it
  // reach 108 px south. What they protected — no shape minted into a tower — is pinned below instead.
  it('a stamp centred on a porch slot is refused CASTLE (its box reaches the 61 disc — and, since S194, the slot)', () => {
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

  // ⭐⭐ S194 R194-16 RE-PIN of the two tests below (they said a shape ON a slot LANDS). Owner: *"Castle
  // entrance is where the shapes come out. Oh yeah, you should definitely not be able to build over that.
  // Leave that a little space."* — every slot carries `CASTLE_PORCH_BUILD_CLEAR_RADIUS` (17) again, on a
  // row moved to +42, so the zone stays the S193 disc south and east (see zones.test.ts for the reach).
  it('⭐ S194 — a single shape placed ON a porch slot is REFUSED by the real reducer, and the bot planner agrees', () => {
    for (const layout of LAYOUTS) {
      for (let s = 0; s < zoneCount(layout); s++) {
        for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
          const slot = porchSlot(s, i, layout);
          expect(isInsideCastleKeepOut(slot, layout)).toBe(true);
          const w = boardWorld(layout, asPlayerId(s), slot);
          expect(placeFromFree(w, asPlayerId(s), slot), `${layout} ${s} slot ${i}`).toBe(false);
          expect(isLegalBuildPos(slot, asPlayerId(s), w)).toBe(false);
        }
      }
    }
  });

  it('⭐ S194 — the OUTER slots sit just OUTSIDE the 61 disc, so only the porch arm refuses them (the arm is live)', () => {
    for (const layout of LAYOUTS) {
      const a = zoneCastleAnchor(0, layout);
      for (const i of [0, CASTLE_PORCH_SLOTS - 1]) {
        const s = porchSlot(0, i, layout);
        const box = { minX: s.x, maxX: s.x, minY: s.y, maxY: s.y };
        expect(boxPointDistSq(box, a.x, a.y)).toBeGreaterThan(CASTLE_NO_BUILD_RADIUS * CASTLE_NO_BUILD_RADIUS);
        expect(castleKeepOutHitsBox(box, layout)).toBe(true);
        // negative: one px past the clearance, straight out from the slot, is legal ground again
        const off = { x: s.x + (i === 0 ? -1 : 1) * (CASTLE_PORCH_BUILD_CLEAR_RADIUS + 1), y: s.y };
        expect(castleKeepOutHitsBox({ minX: off.x, maxX: off.x, minY: off.y, maxY: off.y }, layout)).toBe(false);
      }
    }
  });

  it('⭐ S194 — the drag preview (single shape) and the stamp ghost both read it — a ghost on the porch says refused', () => {
    for (const layout of LAYOUTS) {
      const w = boardWorld(layout, asPlayerId(0), zoneCastleAnchor(0, layout));
      const outer = porchSlot(0, CASTLE_PORCH_SLOTS - 1, layout);
      expect(canBuildNow(w, outer, asPlayerId(0))).toBe(false); // the predicate `dragPreview` asks
      // a stamp whose box just reaches the outer slot's clearance is refused CASTLE…
      const box0 = stampFootprintBox({ x: 0, y: 0 }, 'laserTurret');
      const dir = outer.x > zoneCastleAnchor(0, layout).x ? 1 : -1;
      const near = { x: dir > 0 ? outer.x + CASTLE_PORCH_BUILD_CLEAR_RADIUS - 1 - box0.minX : outer.x - CASTLE_PORCH_BUILD_CLEAR_RADIUS + 1 - box0.maxX, y: outer.y };
      expect(stampRefusalAt(w, near, asPlayerId(0), 'laserTurret')).toBe('CASTLE');
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
    // ⭐ S194 R194-16 RE-PIN: no LEGAL stamp's box may now touch a slot (was "S193 lets a tower stand over
    // the porch"). A legal tower can still stand 17–34 px from a slot — close enough that a pulled shape
    // would sit inside it — so the pull's skip is still owed, and this picks the legal centre whose
    // NODES crowd the most slots within CASTLE_PORCH_KEEP_OUT_RADIUS.
    let best: Vec2 | null = null;
    let bestCovered = -1;
    for (let dx = -160; dx <= 160; dx += 2) {
      for (let dy = 40; dy <= 200; dy += 2) {
        const c = { x: a.x + dx, y: a.y + dy };
        if (stampRefusalAt(w, c, seat, TOWER) !== null) continue;
        const box = stampFootprintBox(c, TOWER);
        expect(slots.some((q) => boxPointDistSq(box, q.x, q.y) <= CASTLE_PORCH_BUILD_CLEAR_RADIUS ** 2), 'R194-16: no legal box on the entrance').toBe(false);
        const nodes = blueprintPositions(TOWER, c);
        const covered = slots.filter((q) => nodes.some((n) => Math.hypot(n.x - q.x, n.y - q.y) < CASTLE_PORCH_KEEP_OUT_RADIUS)).length;
        if (covered > bestCovered) { bestCovered = covered; best = c; }
      }
    }
    expect(bestCovered, 'anti-vacuity: a legal tower can still crowd a slot').toBeGreaterThan(0);
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

  it('⭐ S194 — no stamp lands on a shape resting on the porch: CASTLE now refuses it first, BLOCKED still guards a moved one', () => {
    const layout: ZoneLayout = 'PITCH_2P';
    const seat = asPlayerId(0);
    const a = zoneCastleAnchor(0, layout);
    const w = boardWorld(layout, seat, a);
    fund(w, seat);
    for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) dispatch(w, { type: 'PULL_FROM_BANK', playerId: seat, sparkType: SparkType.Dot });
    const resting = [...w.freeSparks.values()].filter((sp) => sp.escrow === 'banked');
    expect(resting).toHaveLength(CASTLE_PORCH_SLOTS);
    // (1) ⭐ S194 R194-16: EVERY centre that would put a node within STAMP_CLEARANCE of a resting porch
    // shape is refused, and since the stamp box cannot reach a slot it is the CASTLE arm that says so.
    // (Was: a legal-on-an-empty-porch centre exists and BLOCKED refuses it — the clearance closed that band.)
    let probed = 0;
    for (let dx = -200; dx <= 200; dx += 2) {
      for (let dy = 0; dy <= 200; dy += 2) {
        const c = { x: a.x + dx, y: a.y + dy };
        if (!blueprintPositions(TOWER, c).some((n) => resting.some((r) => Math.hypot(n.x - r.pos.x, n.y - r.pos.y) < STAMP_CLEARANCE))) continue;
        probed++;
        expect(stampRefusalAt(w, c, seat, TOWER), `centre (${dx},${dy})`).not.toBeNull();
      }
    }
    expect(probed, 'anti-vacuity').toBeGreaterThan(0);
    // (2) The S193 BLOCKED arm is still live for a porch shape the player has MOVED (escrow stays
    // 'banked'): park one 120 px toward the board centre, stamp over it, and the reducer refuses BLOCKED.
    const moved = resting[0]!;
    const spot = towardCentre(layout, 0, 120);
    moved.pos = { ...spot };
    moved.prevPos = { ...spot };
    const nodes0 = blueprintPositions(TOWER, { x: 0, y: 0 });
    const pick = { x: spot.x - nodes0[0]!.x, y: spot.y - nodes0[0]!.y }; // a node lands exactly on it
    expect(stampRefusalAt(w, pick, seat, TOWER)).toBe('BLOCKED');
    const before = w.primitives.size;
    dispatch(w, { type: 'BUILD_BLUEPRINT', playerId: seat, blueprintId: TOWER, centre: pick });
    expect(w.primitives.size, 'the host reducer refuses it too').toBe(before);
    // negative control: with the shape gone the same centre is legal (so BLOCKED really was the reason)
    w.freeSparks.delete(moved.id);
    expect(stampRefusalAt(w, pick, seat, TOWER)).toBeNull();
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
          // ⭐ S194 R194-16 — was `< 61 + 1.5`. Measured after the porch clearance landed: SOUTH unchanged at
          // 61.0 for all three; the HORIZONTAL side (top castles' only on-board side besides south) grew
          // laser 61.9 → 62.9, goblin 61.0 → 63.0, stink 61.9 → 61.9 — a tall box laid beside the keep
          // clips the OUTER slot's 17 px disc (slot at x ±45, so its disc reaches 62). Re-pinned to the
          // measured ceiling, not relaxed past it: +2.5 still fails the S191-style 74/108 px lobes.
          expect(gap, `${bp} seat ${s} dir (${dx},${dy})`).toBeLessThan(CASTLE_NO_BUILD_RADIUS + 2.5);
          if (dy === 1) expect(gap, `${bp} seat ${s} SOUTH`).toBeLessThan(CASTLE_NO_BUILD_RADIUS + 1.5);
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
