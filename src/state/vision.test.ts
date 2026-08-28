/**
 * Tests for fog-of-war vision math (S57 P1).
 *
 * Direct world.primitives construction (no PLACE_PRIMITIVE dispatch) — the
 * vision functions are pure readers of world state, same pattern as
 * territory.test.ts. Covers: own-beacon-only enumeration, enemy concealment,
 * spawner always-visible, host/client symmetry, gating, and the win-lift tween.
 */

import { describe, it, expect } from 'vitest';
import { makeWorld, dispatch, type World } from './world.ts';
import {
  computeVisionSources,
  isPointVisible,
  fogActive,
  fogTargetAlpha,
  stepFogAlpha,
  computeVisionSourcesForSeat,
  isVisibleToSeat,
} from './vision.ts';
import {
  R_PERSONAL,
  R_BEACON,
  R_CREATURE_VISION,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  SparkType,
  PRIMITIVE_MAX_HP,
} from '../constants.ts';
import { asPlayerId, asPrimitiveId, asCreatureId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeVoltkinCreature } from './creatures/creature.ts';

// ─── test helpers ──────────────────────────────────────────────────────────

/** A 1v1 world in PLAYING, viewed from `localPlayerIndex`'s perspective. */
function make1v1(localPlayerIndex: 0 | 1): World {
  const world = makeWorld(0x57f0);
  dispatch(world, { type: 'START_GAME', mode: '1v1', isHost: localPlayerIndex === 0 });
  world.localPlayerId = asPlayerId(localPlayerIndex);
  world.gameState = 'PLAYING';
  // S139 P2 — drop the free starter goblins each seat is granted at START_GAME. A creature is
  // an R_CREATURE_VISION source, so leaving them in shifts every count in this file by one and
  // would invert the meaning of the 'EXCLUDES enemy creatures' case (which asserts ZERO).
  // Vision behaviour OF the goblin is deliberately covered by its own tests, not by re-baselining
  // these; a bumped constant here would have hidden the real consequence instead of recording it.
  world.creatures.clear();
  world.nextCreatureId = 0;
  return world;
}

/** Insert a primitive at (x, y) owned by `playerIndex`, bypassing dispatch. */
function addPrimAt(world: World, playerIndex: 0 | 1, x: number, y: number): Primitive {
  const player = world.players.get(asPlayerId(playerIndex))!;
  const primId = asPrimitiveId(world.nextPrimitiveId++);
  const prim: Primitive = {
    id: primId,
    type: SparkType.Square,
    placerColor: player.color,
    placedBy: player.id,
    createdTick: world.tick,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: player.color,
    lastOwnershipChange: 0,
    radius: 9,
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  world.primitives.set(primId, prim);
  return prim;
}

/** Insert a creature at (x, y) owned by `playerIndex`, bypassing dispatch.
 *  computeVisionSources only reads `pos` + `ownerPlayerId`, so the factory's
 *  defaults (SPAWNING state etc.) are irrelevant here. */
function addCreatureAt(world: World, playerIndex: 0 | 1, x: number, y: number): void {
  const id = asCreatureId(world.nextCreatureId++);
  world.creatures.set(
    id,
    makeVoltkinCreature({
      id,
      ownerPlayerId: asPlayerId(playerIndex),
      pos: { x, y },
      targetPos: { x, y },
      spawnedAtTick: 0,
    }),
  );
}

const cursor = (x: number, y: number) => ({ x, y });

// A far corner well outside the spawner zone + any default vision.
const FAR_CORNER = { x: 1850, y: 1000 };

// ─── computeVisionSources ───────────────────────────────────────────────────

describe('computeVisionSources', () => {
  it('always includes the spawner zone as a vision source', () => {
    const world = make1v1(0);
    const sources = computeVisionSources(world, cursor(100, 100));
    const spawner = sources.find(
      (s) => s.x === SPAWNER_CENTER_X && s.y === SPAWNER_CENTER_Y && s.radius === SPAWNER_RADIUS,
    );
    expect(spawner).toBeDefined();
  });

  it('includes a personal radius at the live cursor', () => {
    const world = make1v1(0);
    const sources = computeVisionSources(world, cursor(742, 318));
    const personal = sources.find((s) => s.x === 742 && s.y === 318 && s.radius === R_PERSONAL);
    expect(personal).toBeDefined();
  });

  it('emits exactly spawner + personal when no primitives exist', () => {
    const world = make1v1(0);
    expect(computeVisionSources(world, cursor(100, 100))).toHaveLength(2);
  });

  it('emits one R_BEACON source per OWN primitive', () => {
    const world = make1v1(0);
    addPrimAt(world, 0, 300, 300);
    addPrimAt(world, 0, 360, 300);
    addPrimAt(world, 0, 420, 300);
    const sources = computeVisionSources(world, cursor(100, 100));
    const beacons = sources.filter((s) => s.radius === R_BEACON);
    expect(beacons).toHaveLength(3);
    // spawner + personal + 3 beacons
    expect(sources).toHaveLength(5);
  });

  it('EXCLUDES enemy primitives (concealment)', () => {
    const world = make1v1(0); // I am player 0
    addPrimAt(world, 0, 300, 300); // mine
    addPrimAt(world, 1, 1600, 800); // enemy
    addPrimAt(world, 1, 1660, 800); // enemy
    const sources = computeVisionSources(world, cursor(100, 100));
    const beacons = sources.filter((s) => s.radius === R_BEACON);
    // only my 1 primitive becomes a beacon; the 2 enemy prims contribute none
    expect(beacons).toHaveLength(1);
    expect(beacons[0]).toMatchObject({ x: 300, y: 300 });
  });

  it('is symmetric: from player 1, player 1 owns the beacons and player 0 is excluded', () => {
    const world = make1v1(1); // I am player 1 (the client)
    addPrimAt(world, 0, 300, 300); // enemy (host)
    addPrimAt(world, 1, 1600, 800); // mine
    addPrimAt(world, 1, 1660, 800); // mine
    const beacons = computeVisionSources(world, cursor(100, 100)).filter(
      (s) => s.radius === R_BEACON,
    );
    expect(beacons).toHaveLength(2);
    expect(beacons.every((b) => b.x >= 1600)).toBe(true);
  });

  it('beacon is centered exactly on the owning primitive position', () => {
    const world = make1v1(0);
    addPrimAt(world, 0, 512, 678);
    const beacon = computeVisionSources(world, cursor(0, 0)).find((s) => s.radius === R_BEACON);
    expect(beacon).toEqual({ x: 512, y: 678, radius: R_BEACON });
  });

  // ─── S58 (#3) own-creature vision ──────────────────────────────────────────

  it('emits one R_CREATURE_VISION source per OWN creature (watch your Voltkin)', () => {
    const world = make1v1(0); // I am player 0
    addCreatureAt(world, 0, 1700, 900); // my Voltkin deep in enemy territory
    const creatureSources = computeVisionSources(world, cursor(100, 100)).filter(
      (s) => s.radius === R_CREATURE_VISION,
    );
    expect(creatureSources).toHaveLength(1);
    expect(creatureSources[0]).toMatchObject({ x: 1700, y: 900 });
  });

  it('EXCLUDES enemy creatures (their raider stays concealed)', () => {
    const world = make1v1(0); // I am player 0
    addCreatureAt(world, 1, 1700, 900); // enemy Voltkin
    const creatureSources = computeVisionSources(world, cursor(100, 100)).filter(
      (s) => s.radius === R_CREATURE_VISION,
    );
    expect(creatureSources).toHaveLength(0);
  });

  it('reveals the area around my roaming creature in enemy territory', () => {
    const world = make1v1(0);
    addCreatureAt(world, 0, 1700, 900); // my creature, cursor parked at home
    const sources = computeVisionSources(world, cursor(100, 100));
    // a point near my creature (far from cursor/spawner/structures) is visible
    expect(isPointVisible(sources, 1740, 900)).toBe(true);
    // a point just outside the creature's vision radius stays fogged
    expect(isPointVisible(sources, 1700 + R_CREATURE_VISION + 5, 900)).toBe(false);
  });

  it('creature vision is symmetric from player 1', () => {
    const world = make1v1(1); // I am player 1
    addCreatureAt(world, 0, 300, 300); // enemy (host) creature
    addCreatureAt(world, 1, 1600, 800); // mine
    const creatureSources = computeVisionSources(world, cursor(100, 100)).filter(
      (s) => s.radius === R_CREATURE_VISION,
    );
    expect(creatureSources).toHaveLength(1);
    expect(creatureSources[0]).toMatchObject({ x: 1600, y: 800 });
  });
});

// ─── isPointVisible (concealment property) ───────────────────────────────────

describe('isPointVisible', () => {
  it('reveals my own structure but conceals the enemy far-corner base', () => {
    const world = make1v1(0);
    const mine = addPrimAt(world, 0, 300, 300);
    const enemy = addPrimAt(world, 1, FAR_CORNER.x, FAR_CORNER.y);
    // cursor parked on my base, far from the enemy
    const sources = computeVisionSources(world, cursor(300, 300));
    expect(isPointVisible(sources, mine.pos.x, mine.pos.y)).toBe(true);
    expect(isPointVisible(sources, enemy.pos.x, enemy.pos.y)).toBe(false);
  });

  it('reveals an enemy structure once the cursor cruises over it', () => {
    const world = make1v1(0);
    const enemy = addPrimAt(world, 1, FAR_CORNER.x, FAR_CORNER.y);
    // cruise the cursor onto the enemy base — personal radius now covers it
    const sources = computeVisionSources(world, cursor(FAR_CORNER.x, FAR_CORNER.y));
    expect(isPointVisible(sources, enemy.pos.x, enemy.pos.y)).toBe(true);
  });

  it('reveals an enemy structure sitting inside the always-visible spawner zone', () => {
    const world = make1v1(0);
    // enemy primitive near canvas center (inside spawner) — visible by design (§ IX.5)
    const enemy = addPrimAt(world, 1, SPAWNER_CENTER_X + 50, SPAWNER_CENTER_Y);
    const sources = computeVisionSources(world, cursor(0, 0));
    expect(isPointVisible(sources, enemy.pos.x, enemy.pos.y)).toBe(true);
  });

  it('treats the radius boundary as inclusive', () => {
    const sources = [{ x: 0, y: 0, radius: 100 }];
    expect(isPointVisible(sources, 100, 0)).toBe(true); // exactly on edge
    expect(isPointVisible(sources, 100.01, 0)).toBe(false); // just outside
  });
});

// ─── gating + win-lift ────────────────────────────────────────────────────────

describe('fogActive / fogTargetAlpha', () => {
  it('is active with full target alpha during 1v1 PLAYING', () => {
    const world = make1v1(0);
    expect(fogActive(world)).toBe(true);
    expect(fogTargetAlpha(world)).toBe(1);
  });

  it('⭐ R62 — LIFTS the fog for the whole FIGHT stage, and slams it back on in BUILD', () => {
    // Owner ruling R62: "Fog of war should be lifted during fight stage and kept only during build
    // phase." Fog exists so nobody can scout what their neighbours are ASSEMBLING — a build-stage
    // concern. Once the walls drop you cannot make a tactical decision about an army you cannot see.
    const world = make1v1(0);
    expect(world.matchPhase).toBe('BUILD');
    expect(fogActive(world)).toBe(true);

    world.matchPhase = 'FIGHT';
    expect(fogActive(world)).toBe(false);
    expect(fogTargetAlpha(world)).toBe(0);

    // And back: the next build stage is hidden again. stepFogAlpha snaps ON when the target rises,
    // so there is no free peek at what was built during the fight.
    world.matchPhase = 'BUILD';
    expect(fogActive(world)).toBe(true);
    expect(fogTargetAlpha(world)).toBe(1);
  });

  it('R62 — the FIGHT lift is a FADE, not a cut (the same treatment the victory reveal gets)', () => {
    // The reveal quality comes free from the existing tween rather than from new code: falling
    // targets ease down, rising targets snap. Pinned so an "optimisation" to a hard cut is caught.
    expect(stepFogAlpha(1, 0, 0.1)).toBeCloseTo(0.9); // FIGHT edge — eases
    expect(stepFogAlpha(0, 1, 0.1)).toBe(1);          // BUILD edge — instant
  });

  it('is inactive in solo (no opponent to hide from)', () => {
    const world = makeWorld(0x1); // solo, PLAYING by default
    expect(world.gameMode).toBe('solo');
    expect(fogActive(world)).toBe(false);
    expect(fogTargetAlpha(world)).toBe(0);
  });

  it('LIFTS the fog on WIN and POSTGAME (reveal-all)', () => {
    const world = make1v1(0);
    world.gameState = 'WIN';
    expect(fogActive(world)).toBe(false);
    expect(fogTargetAlpha(world)).toBe(0);
    world.gameState = 'POSTGAME';
    expect(fogTargetAlpha(world)).toBe(0);
  });

  it('shows no active fog in 1v1 LOBBY/TITLE (pre-match board visible)', () => {
    const world = make1v1(0);
    world.gameState = 'LOBBY';
    expect(fogActive(world)).toBe(false);
    world.gameState = 'TITLE';
    expect(fogActive(world)).toBe(false);
  });
});

// ─── stepFogAlpha (pure tween) ───────────────────────────────────────────────

describe('stepFogAlpha', () => {
  it('snaps ON instantly when the target rises (match start)', () => {
    expect(stepFogAlpha(0, 1, 0.02)).toBe(1);
    expect(stepFogAlpha(0.5, 1, 0.02)).toBe(1);
  });

  it('fades OFF gradually by at most fadeStep per call (win lift)', () => {
    expect(stepFogAlpha(1, 0, 0.02)).toBeCloseTo(0.98, 5);
    expect(stepFogAlpha(0.98, 0, 0.02)).toBeCloseTo(0.96, 5);
  });

  it('clamps to the target without undershooting on the final step', () => {
    expect(stepFogAlpha(0.01, 0, 0.02)).toBe(0);
  });

  it('holds steady when already at the target', () => {
    expect(stepFogAlpha(1, 1, 0.02)).toBe(1);
    expect(stepFogAlpha(0, 0, 0.02)).toBe(0);
  });
});

/**
 * ⭐ S155 P7 (owner) — THE FOG IS NO LONGER A ONE-WAY MIRROR.
 *
 * Owner: *"shouldnt my towers be hidden from him in fog of war during building stage and he has to
 * explore my zone with his cruiser/spark to see whats there? thats how it is for me at least, not
 * fair if bots see evcerything"*.
 *
 * ⛔ THEY WERE RIGHT, AND IT WAS ONE-SIDED BY CONSTRUCTION: `computeVisionSources` was hardcoded to
 * `world.localPlayerId`, and its only consumers were `fogRenderer.ts` and `exploredMemory.ts` — both
 * render-side. A grep of `src/bots/**` for fog or vision returns NOTHING. The bots were not cheating
 * on purpose; the fog simply had no existence outside the human's screen.
 *
 * These pin the SUBSTRATE that fixes it. The bot-side activation is deliberately not wired yet — see
 * the long note in `botBrain.ts` for why, and for the exact three lines that switch it on.
 */
describe('S155 P7 — per-seat vision', () => {
  const seatWorld = (): World => {
    const w = makeWorld(0x7e5);
    w.gameState = 'PLAYING';
    w.gameMode = 'bots'; // not solo ⇒ fog is eligible
    w.matchPhase = 'BUILD';
    w.localPlayerId = asPlayerId(0);
    w.players.set(asPlayerId(0), { avatarPos: { x: 100, y: 100 } } as never);
    w.players.set(asPlayerId(1), { avatarPos: { x: 1800, y: 900 } } as never);
    return w;
  };

  it('⭐ the HUMAN fog is byte-identical — computeVisionSources just delegates', () => {
    // The refactor's one hard requirement: this is the player's own screen and it must not move by a
    // pixel. Asserted, not assumed.
    const w = seatWorld();
    const cursor = { x: 400, y: 400 };
    expect(computeVisionSources(w, cursor)).toEqual(
      computeVisionSourcesForSeat(w, w.localPlayerId, cursor),
    );
  });

  it('each seat gets its OWN beacons — a seat is not lit by an enemy structure', () => {
    const w = seatWorld();
    // One primitive owned by seat 1, far from seat 0.
    w.primitives.set(1 as never, {
      id: 1, pos: { x: 1800, y: 900 }, placedBy: asPlayerId(1), bonds: new Set(),
    } as never);
    const seat0 = computeVisionSourcesForSeat(w, asPlayerId(0), { x: 100, y: 100 });
    const seat1 = computeVisionSourcesForSeat(w, asPlayerId(1), { x: 1800, y: 900 });
    // Seat 1 sees its own prim as a beacon; seat 0 does not.
    expect(seat1.some((s) => s.x === 1800 && s.y === 900 && s.radius === R_BEACON)).toBe(true);
    expect(seat0.some((s) => s.radius === R_BEACON)).toBe(false);
  });

  it('⭐ during BUILD a seat CANNOT see a distant enemy structure', () => {
    const w = seatWorld();
    // Seat 1's keep, on the far side of the board from seat 0's eye.
    expect(isVisibleToSeat(w, asPlayerId(0), { x: 100, y: 100 }, 1800, 900)).toBe(false);
    // ...and it CAN see its own ground.
    expect(isVisibleToSeat(w, asPlayerId(0), { x: 100, y: 100 }, 100, 100)).toBe(true);
  });

  it('⚠ during FIGHT the fog is DOWN for everyone, so visibility is a pass-through', () => {
    // Owner ruling R62 — fog is a BUILD-stage concern and lifts for the fight. This is what keeps the
    // change away from raid balance entirely: raiding happens in FIGHT, where nothing is filtered.
    const w = seatWorld();
    w.matchPhase = 'FIGHT';
    expect(isVisibleToSeat(w, asPlayerId(0), { x: 100, y: 100 }, 1800, 900)).toBe(true);
  });

  it('and in SOLO there is no fog at all, for any seat', () => {
    const w = seatWorld();
    w.gameMode = 'solo';
    expect(isVisibleToSeat(w, asPlayerId(0), { x: 100, y: 100 }, 1800, 900)).toBe(true);
  });
});
