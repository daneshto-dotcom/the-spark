/**
 * SPARK — S149 P1: THE ZONE PARTITION IS THE BUILD-LEGALITY RULE, AT EVERY GATE.
 *
 * ## What the owner reported
 *
 * *"there are no walls it seems or player zones, players can build wherever and it is inherently
 * wrong based on our current designs."*
 *
 * ## Why it was true
 *
 * Legality was `territory.ts isInsideEnemyTerritory` — a complexity-derived RADIUS around each
 * player's own primitives. A player who had built nothing near a point projected R = 0, so the
 * point was allowed. On an opening board nobody has built anything, so *everywhere* was allowed.
 * `zones.canBuildAt` — the real partition, shipped and tested in S148 — was wired into NOTHING.
 *
 * ## What this file pins
 *
 * The repair is six one-line swaps, and six is exactly the kind of number where five get done.
 * These tests are the standing proof that all six are wired, on BOTH boards, for EVERY seat:
 *
 *   1. `applyPlacePrimitive`   — host refusal, place from carry
 *   2. `applyPlaceFromFree`    — host refusal, place from a free spark
 *   3. `stampRefusalAt`        — host refusal, blueprint stamp
 *   4. `computePreviewBonds`   — the client drag ghost
 *   5. `isLegalBuildPos`       — the bot planner
 *   6. `computeReleaseGates`   — the client release gate (composition, see its describe block)
 *
 * ⚠ THE AGREEMENT SWEEP AT THE BOTTOM IS THE ONE THAT MATTERS MOST. A ghost that says "legal"
 * where the host refuses does not read to a player as a rule — it reads as a desync bug, and it is
 * the specific failure the single shared `canBuildAt` exists to make impossible. Wiring three host
 * refusals and forgetting the ghost would leave every unit test here green.
 */

import { describe, expect, it } from 'vitest';

import {
  CANVAS_HEIGHT, CANVAS_WIDTH, CASTLE_PORCH_OFFSET_Y, PLAYER_COLORS, SparkType,
} from '../constants.ts';
import { isLegalBuildPos } from '../bots/botBrain.ts';
import { computePreviewBonds } from '../input/dragPreview.ts';
import { computeReleaseGates } from '../input/controls.ts';
import { asPlayerId, asPrimitiveId, asSparkId, type PlayerId, type Vec2 } from '../types.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { stampRefusalAt } from './blueprintLegality.ts';
import { applyPlaceFromFree } from './placeFromFree.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import {
  CASTLE_NO_BUILD_RADIUS,
  canBuildAt,
  isInsideCastleKeepOut,
  zoneCastleAnchor,
  zoneCount,
  type ZoneLayout,
} from './zones.ts';
import { enemyZonePoint, ownZonePoint, QUARRY_POINT } from './zones.fixtures.ts';

const LAYOUTS: readonly ZoneLayout[] = ['PITCH_2P', 'QUADRANTS_4P'];

/**
 * A world on `layout` with every seat of that board present and idle at `at`.
 *
 * The avatar placement is not cosmetic: `applyPlaceFromFree` also enforces a ≤250 px reach from
 * the placing seat's avatar, so a test that moved only the placement would fail on REACH and look
 * exactly like a territory refusal.
 */
function boardWorld(layout: ZoneLayout, seat: PlayerId, at: Vec2): World {
  const seats = zoneCount(layout);
  const world = makeWorld(0);
  world.gameState = 'TITLE';
  // Seat the whole board through the real START_GAME path — `makeWorld` alone populates only
  // seat 0, so every other seat would be "player N missing". The seat COUNT is what selects the
  // layout (`layoutForSeatCount`: 2 ⇒ PITCH_2P, 4 ⇒ QUADRANTS_4P), so this cannot drift from the
  // board being tested; the assertion below pins that rather than trusting it.
  dispatch(world, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: Array.from({ length: seats }, (_, s) => ({ seat: s, color: PLAYER_COLORS[s] })),
    botSeats: Array.from({ length: seats - 1 }, (_, i) => i + 1),
  });
  expect(world.layout).toBe(layout);

  // The placing seat's avatar must be at the placement: `applyPlaceFromFree` also enforces a
  // ≤250 px reach, and a test that moved only the placement would fail on REACH while looking
  // exactly like a territory refusal.
  dispatch(world, { type: 'UPDATE_AVATAR_POS', playerId: seat, pos: { ...at } });
  return world;
}

/** Drive a carry-then-place through the REAL dispatch path. Returns whether a primitive landed. */
function placeFromCarry(world: World, seat: PlayerId, pos: Vec2, rawSparkId: number): boolean {
  const before = world.primitives.size;
  const spark = makeFreeSpark({
    id: asSparkId(rawSparkId),
    type: SparkType.Dot,
    pos: { ...pos },
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    createdTick: 0,
  });
  dispatch(world, { type: 'SPAWN_SPARK', spark });
  dispatch(world, { type: 'PICKUP_SPARK', sparkId: spark.id, playerId: seat, pos: { ...pos } });
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId: seat,
    targetPrimitiveId: null,
    stiffnessTier: 'MID',
  });
  return world.primitives.size > before;
}

/** Drive the atomic free-spark placement reducer. Returns whether a primitive landed. */
function placeFromFree(world: World, seat: PlayerId, pos: Vec2, rawSparkId: number): boolean {
  const before = world.primitives.size;
  const spark = makeFreeSpark({
    id: asSparkId(rawSparkId),
    type: SparkType.Dot,
    pos: { ...pos },
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    createdTick: 0,
  });
  world.freeSparks.set(spark.id, spark);
  applyPlaceFromFree(world, {
    type: 'PLACE_FROM_FREE',
    sparkId: spark.id,
    playerId: seat,
    placementPos: { ...pos },
    stiffnessTier: 'MID',
    targetPrimitiveId: null,
  });
  return world.primitives.size > before;
}

describe('S149 P1 — gate 1: applyPlacePrimitive enforces the zone partition', () => {
  for (const layout of LAYOUTS) {
    for (let s = 0; s < zoneCount(layout); s++) {
      const seat = asPlayerId(s);

      it(`${layout} seat ${s} — CAN place on its own ground`, () => {
        const pos = ownZonePoint(seat, layout);
        const world = boardWorld(layout, seat, pos);
        expect(placeFromCarry(world, seat, pos, 900 + s)).toBe(true);
      });

      it(`${layout} seat ${s} — CANNOT place on another seat's ground`, () => {
        const pos = enemyZonePoint(seat, layout);
        const world = boardWorld(layout, seat, pos);
        expect(placeFromCarry(world, seat, pos, 910 + s)).toBe(false);
        expect(world.diagnostics.territoryBlockRejects).toBe(1);
      });

      it(`${layout} seat ${s} — CANNOT place in the shared quarry`, () => {
        const world = boardWorld(layout, seat, QUARRY_POINT);
        expect(placeFromCarry(world, seat, QUARRY_POINT, 920 + s)).toBe(false);
      });
    }
  }
});

describe('S149 P1 — gate 2: applyPlaceFromFree enforces the zone partition', () => {
  for (const layout of LAYOUTS) {
    for (let s = 0; s < zoneCount(layout); s++) {
      const seat = asPlayerId(s);

      it(`${layout} seat ${s} — CAN place on its own ground`, () => {
        const pos = ownZonePoint(seat, layout);
        const world = boardWorld(layout, seat, pos);
        expect(placeFromFree(world, seat, pos, 930 + s)).toBe(true);
      });

      it(`${layout} seat ${s} — CANNOT place on another seat's ground`, () => {
        const pos = enemyZonePoint(seat, layout);
        const world = boardWorld(layout, seat, pos);
        expect(placeFromFree(world, seat, pos, 940 + s)).toBe(false);
        // Atomicity (the S52 contract) still holds under the new rule: a refused placement
        // leaves nobody stuck mid-carry and does not eat the spark.
        expect(world.players.get(seat)?.kind).toBe('Idle');
        expect(world.freeSparks.get(asSparkId(940 + s))?.state.kind).toBe('Free');
      });
    }
  }
});

describe('S149 P1 — gate 3: the blueprint stamp refuses enemy ground', () => {
  for (const layout of LAYOUTS) {
    for (let s = 0; s < zoneCount(layout); s++) {
      const seat = asPlayerId(s);

      it(`${layout} seat ${s} — a stamp centred on enemy ground is refused as ENEMY GROUND`, () => {
        const pos = enemyZonePoint(seat, layout);
        const world = boardWorld(layout, seat, pos);
        expect(stampRefusalAt(world, pos, seat, 'pentagram')).toBe('ENEMY GROUND');
      });

      it(`${layout} seat ${s} — the quarry keeps its own refusal word, not ENEMY GROUND`, () => {
        // The QUARRY arm runs FIRST and is footprint-aware, so it stays the accurate answer.
        // This is what stops the partition's coarser centre-only test from swallowing it.
        const world = boardWorld(layout, seat, QUARRY_POINT);
        expect(stampRefusalAt(world, QUARRY_POINT, seat, 'pentagram')).toBe('QUARRY');
      });
    }
  }
});

describe('S149 P1 — gate 5: the bot planner uses the same rule', () => {
  for (const layout of LAYOUTS) {
    for (let s = 0; s < zoneCount(layout); s++) {
      const seat = asPlayerId(s);

      it(`${layout} seat ${s} — isLegalBuildPos agrees with canBuildAt on own and enemy ground`, () => {
        const own = ownZonePoint(seat, layout);
        const foe = enemyZonePoint(seat, layout);
        const world = boardWorld(layout, seat, own);
        expect(isLegalBuildPos(own, seat, world)).toBe(true);
        expect(isLegalBuildPos(foe, seat, world)).toBe(false);
        expect(isLegalBuildPos(QUARRY_POINT, seat, world)).toBe(false);
      });
    }
  }
});

describe('S149 P1 — gate 6: the client release gate refuses when the host would', () => {
  // `computeReleaseGates` is pure and takes the territory verdict as a parameter, so what is
  // provable here is the COMPOSITION: feed it what controls.ts feeds it — `!canBuildAt(...)` — and
  // it must refuse to commit on enemy ground and commit on own ground.
  for (const layout of LAYOUTS) {
    for (let s = 0; s < zoneCount(layout); s++) {
      const seat = asPlayerId(s);

      it(`${layout} seat ${s} — commit follows canBuildAt for a reachable, out-of-quarry release`, () => {
        for (const [pos, expected] of [
          [ownZonePoint(seat, layout), true],
          [enemyZonePoint(seat, layout), false],
        ] as const) {
          const gates = computeReleaseGates({
            isClient: false,
            reachDistSq: 0, // released right on the spark
            maxReleaseReachSq: 120 * 120,
            hostInZone: false, // not in the quarry
            hostInTerritory: !canBuildAt(pos, seat, layout), // exactly what controls.ts passes
          });
          expect(gates.commit).toBe(expected);
        }
      });
    }
  }
});

/* ========================================================================== *
 *      THE AGREEMENT SWEEP — the ghost and the host must never disagree      *
 * ========================================================================== */

/**
 * Inject a same-colour primitive `offset` px from `pos`, bypassing the reducers.
 *
 * ⚠ THIS IS WHAT MAKES THE GHOST READABLE. `computePreviewBonds` returns EMPTY for a GATED
 * position AND for a position with nothing to bond to — so on a bare board it returns EMPTY
 * everywhere and a test reading it would pass no matter how gate 4 was wired. With a neighbour in
 * range, EMPTY means exactly one thing: refused.
 */
function injectNeighbour(world: World, seat: PlayerId, pos: Vec2, rawId: number): void {
  const colour = PLAYER_COLORS[seat as unknown as number];
  const at = { x: pos.x + 30, y: pos.y };
  world.primitives.set(asPrimitiveId(rawId), {
    id: asPrimitiveId(rawId),
    type: SparkType.Dot,
    placerColor: colour,
    placedBy: seat,
    createdTick: 0,
    pos: { ...at },
    prevPos: { ...at },
    bonds: new Set<never>(),
    ownerColor: colour,
    lastOwnershipChange: 0,
    radius: 8,
  } as never);
}

describe('S149 P1 — gate 4: the drag ghost itself refuses enemy ground', () => {
  for (const layout of LAYOUTS) {
    for (let s = 0; s < zoneCount(layout); s++) {
      const seat = asPlayerId(s);
      const colour = PLAYER_COLORS[s];

      it(`${layout} seat ${s} — the ghost shows bonds on own ground and NOTHING on enemy ground`, () => {
        // Own ground: a neighbour is in range, so the ghost must show the bond it would form.
        const own = ownZonePoint(seat, layout);
        const ownWorld = boardWorld(layout, seat, own);
        injectNeighbour(ownWorld, seat, own, 700);
        const ownGhost = computePreviewBonds(ownWorld, own, seat, colour, true);
        expect(ownGhost.primaryId).not.toBeNull();

        // Enemy ground: an IDENTICAL neighbour is in range, so the only thing that can empty the
        // ghost is the legality gate. This is the assertion that fails if gate 4 is unwired.
        const foe = enemyZonePoint(seat, layout);
        const foeWorld = boardWorld(layout, seat, foe);
        injectNeighbour(foeWorld, seat, foe, 701);
        const foeGhost = computePreviewBonds(foeWorld, foe, seat, colour, true);
        expect(foeGhost.primaryId).toBeNull();
      });

      it(`${layout} seat ${s} — the ghost is empty in the quarry even with a neighbour in range`, () => {
        const qWorld = boardWorld(layout, seat, QUARRY_POINT);
        injectNeighbour(qWorld, seat, QUARRY_POINT, 702);
        expect(computePreviewBonds(qWorld, QUARRY_POINT, seat, colour, true).primaryId).toBeNull();
      });
    }
  }
});

describe('S149 P1 — the host reducer enforces canBuildAt on EVERY pixel', () => {
  for (const layout of LAYOUTS) {
    for (let s = 0; s < zoneCount(layout); s++) {
      const seat = asPlayerId(s);

      it(`${layout} seat ${s} — a 40px sweep of the whole board finds no rule/host disagreement`, () => {
        const disagreements: Array<{ x: number; y: number; ghost: boolean; host: boolean }> = [];
        // ⚠ ANTI-VACUITY. "No disagreements" is also what you get from a sweep that allowed
        // nothing, or refused nothing — and this repo has shipped exactly that kind of
        // true-by-coincidence green before. Count both outcomes and require both to be well
        // populated, so the sweep cannot pass by being empty.
        let allowed = 0;
        let refused = 0;

        for (let x = 40; x < CANVAS_WIDTH; x += 40) {
          for (let y = 40; y < CANVAS_HEIGHT; y += 40) {
            const pos: Vec2 = { x, y };

            // THE RULE, asked directly.
            const ruleAllows = canBuildAt(pos, seat, layout);

            // THE HOST: does a real placement actually land?
            const hostAllows = placeFromFree(boardWorld(layout, seat, pos), seat, pos, 1);

            // The host has gates the rule does not (canvas edge, merge geometry), so
            // rule-allows-but-host-refuses is legitimate at the margins... except that the
            // interesting direction is the UNSAFE one: the host must never accept a placement the
            // rule forbids. That would be the partition leaking, which is the owner's whole
            // complaint. Gate 4 (the ghost) is proven separately above, where a neighbour
            // primitive makes its output actually readable.
            if (hostAllows && !ruleAllows) {
              disagreements.push({ x, y, ghost: ruleAllows, host: hostAllows });
            }
            if (hostAllows) allowed++;
            else refused++;
          }
        }

        expect(disagreements).toEqual([]);
        // Every seat owns a real slice of a 1920×1080 board, and every seat is refused the rest of
        // it plus the quarry, so both counts must be in the hundreds. If either collapses, the
        // partition has broken open (everything allowed) or sealed shut (nothing allowed) — and
        // the disagreement assertion above would have stayed green through both.
        expect(allowed).toBeGreaterThan(200);
        expect(refused).toBeGreaterThan(200);
      });
    }
  }
});

describe('S149 P1 — the owner-reported defect itself', () => {
  it('an EMPTY board no longer lets a player build anywhere (the influence bubble is gone)', () => {
    // The exact regression. Under `isInsideEnemyTerritory`, an opening board had zero primitives,
    // so every enemy radius was 0 and every point on the map was legal for everybody. This is the
    // test that fails if anyone re-wires the bubble back in.
    const seat = asPlayerId(0);
    const foe = enemyZonePoint(seat, 'PITCH_2P');
    const world = boardWorld('PITCH_2P', seat, foe);

    expect(world.primitives.size).toBe(0); // nobody has built anything...
    expect(placeFromFree(world, seat, foe, 5)).toBe(false); // ...and it is STILL refused.
  });

  it('the quarry belongs to nobody — no seat may build in it, on either board', () => {
    for (const layout of LAYOUTS) {
      for (let s = 0; s < zoneCount(layout); s++) {
        const seat = asPlayerId(s);
        const world = boardWorld(layout, seat, QUARRY_POINT);
        expect(placeFromFree(world, seat, QUARRY_POINT, 6)).toBe(false);
      }
    }
  });
});

/* ========================================================================== *
 *   ⭐⭐ S182 ITEM 2 (owner) — THE CASTLE KEEP-OUT, IN THE **REDUCER**
 * ========================================================================== */

/**
 * > *"You can place any tower over the castle. The castle doesn't read anything. Castle should have
 * > an area around it where you can't place anything. At least in the immediate vicinity."*
 *
 * ⛔⛔ **THE ASSERTIONS THAT MATTER HERE DRIVE THE REAL REDUCERS, NOT THE PREDICATE.** Placement is
 * a reducer: it runs on the host, in the worker sim and in replay, and its output is HASHED. A
 * keep-out that lived only in `controls.ts` would let a host and a joiner form different worlds
 * from the same intent. Asking `canBuildAt` directly would prove the rule EXISTS; these dispatch
 * `PLACE_PRIMITIVE` and `PLACE_FROM_FREE` and prove it is WIRED — the distinction this whole file
 * was written to make.
 */
describe('S182 — gate 1+2: the reducers refuse a placement inside the castle keep-out', () => {
  for (const layout of LAYOUTS) {
    for (let s = 0; s < zoneCount(layout); s++) {
      const seat = asPlayerId(s);

      it(`${layout} seat ${s} — applyPlacePrimitive refuses ON its own castle`, () => {
        const pos = zoneCastleAnchor(s, layout);
        const world = boardWorld(layout, seat, pos);
        expect(placeFromCarry(world, seat, pos, 960 + s)).toBe(false);
      });

      it(`${layout} seat ${s} — applyPlaceFromFree refuses ON its own castle, atomically`, () => {
        const pos = zoneCastleAnchor(s, layout);
        const world = boardWorld(layout, seat, pos);
        expect(placeFromFree(world, seat, pos, 970 + s)).toBe(false);
        // The S52 atomicity contract survives the new refusal: nobody is stuck mid-carry.
        expect(world.players.get(seat)?.kind).toBe('Idle');
        expect(world.freeSparks.get(asSparkId(970 + s))?.state.kind).toBe('Free');
      });

      it(`${layout} seat ${s} — the boundary is the constant, and BOTH sides of it are pinned`, () => {
        const a = zoneCastleAnchor(s, layout);
        /*
         * Probed along the anchor→board-centre ray. ⚠ NOT along +y, which was the first cut and
         * was wrong for a reason worth recording: on `QUADRANTS_4P` the bottom anchors sit at
         * y = 950, so +y put the "just outside" probe at y = 1073 — inside `WORLD_EDGE_MARGIN`
         * (40), where `placeFromFree`'s remote-origin plausibility gate refuses it for reasons
         * that have nothing to do with the keep-out. Toward the centre is in-zone, off the rim and
         * well inside the canvas for every seat of every board, by construction.
         */
        const toCentre = { x: CANVAS_WIDTH / 2 - a.x, y: CANVAS_HEIGHT / 2 - a.y };
        const len = Math.hypot(toCentre.x, toCentre.y);
        const at = (d: number): Vec2 => ({
          x: a.x + (toCentre.x / len) * d,
          y: a.y + (toCentre.y / len) * d,
        });
        // Just inside: refused. Just outside: allowed.
        const inside = at(CASTLE_NO_BUILD_RADIUS - 2);
        const outside = at(CASTLE_NO_BUILD_RADIUS + 2);
        expect(isInsideCastleKeepOut(inside, layout)).toBe(true);
        expect(isInsideCastleKeepOut(outside, layout)).toBe(false);
        expect(placeFromFree(boardWorld(layout, seat, inside), seat, inside, 980 + s)).toBe(false);
        expect(placeFromFree(boardWorld(layout, seat, outside), seat, outside, 990 + s)).toBe(true);
      });
    }
  }

  it('⚠ ANTI-VACUITY — the porch really is inside the keep-out, on every seat of every board', () => {
    // The keep-out must cover where gathered shapes LAND, or the one spot a player is guaranteed to
    // click is the one spot the rule misses. If the porch offset or the radius ever moves apart,
    // this fails rather than silently reopening the hole.
    for (const layout of LAYOUTS) {
      for (let s = 0; s < zoneCount(layout); s++) {
        const a = zoneCastleAnchor(s, layout);
        expect(isInsideCastleKeepOut({ x: a.x, y: a.y + CASTLE_PORCH_OFFSET_Y }, layout)).toBe(true);
      }
    }
  });

  it('⚠ AND IT DOES NOT SWALLOW THE BOARD — the canonical in-zone test point stays buildable', () => {
    // The complement. A keep-out large enough to eat `ownZonePoint` would have quietly broken
    // dozens of unrelated tests into green-by-refusal; this is the guard against over-correcting.
    for (const layout of LAYOUTS) {
      for (let s = 0; s < zoneCount(layout); s++) {
        const seat = asPlayerId(s);
        expect(isInsideCastleKeepOut(ownZonePoint(seat, layout), layout)).toBe(false);
        expect(canBuildAt(ownZonePoint(seat, layout), seat, layout)).toBe(true);
      }
    }
  });
});

describe('S182 — the SOURCE-TEXT tripwire: both sites carry the term', () => {
  /*
   * ⛔ S181's LESSON, APPLIED: eight defects shipped green because the failure mode was UNREACHED
   * CODE. A behavioural test proves the rule fires where it is asked; only a source-text assertion
   * proves it is ASKED at the site that matters. Both are here because neither alone is enough.
   *
   * ⭐ AND THE CLIENT PRE-CHECK IS NOT A SECOND COPY — that is the thing being pinned. `controls.ts`
   * and `dragPreview.ts` reach the keep-out THROUGH `buildLegality.canBuildNow` → `zones.canBuildAt`,
   * so there is one implementation with two entry points rather than two rules that can drift. A
   * future lookalike distance check in the client is exactly what the last assertion forbids.
   */
  const read = (rel: string): string => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    return readFileSync(join(process.cwd(), rel), 'utf8');
  };

  it('the REDUCER predicate carries it — `canBuildAt` asks the keep-out first', () => {
    const zones = read('src/state/zones.ts');
    const at = zones.indexOf('export function canBuildAt(');
    expect(at, 'canBuildAt must still exist in zones.ts').toBeGreaterThan(-1);
    const body = zones.slice(at, at + 400);
    expect(body).toContain('isInsideCastleKeepOut');
  });

  it('the footprint-aware STAMP arm carries it', () => {
    expect(read('src/state/blueprintLegality.ts')).toContain('castleKeepOutHitsBox(box, world.layout)');
  });

  it('⛔ nobody has minted a SECOND castle-distance rule in the client', () => {
    // The radius may only be read where the one implementation lives. A `CASTLE_NO_BUILD_RADIUS` in
    // controls.ts / dragPreview.ts would mean the client had started deciding for itself.
    for (const f of ['src/input/controls.ts', 'src/input/dragPreview.ts', 'src/bots/botBrain.ts']) {
      expect(read(f), `${f} must reach the keep-out through canBuildNow, never re-derive it`)
        .not.toContain('CASTLE_NO_BUILD_RADIUS');
    }
  });
});
