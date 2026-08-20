/**
 * SPARK — S87 P3: bot gameplay-behavior integration tests.
 *
 * Each test drives the REAL dispatch pipeline (BotManager ticked like
 * main.ts) and asserts the bot performs the disruptive/reactive verbs —
 * sever, rainbow claim, potato plant, hunter flee — not just the build loop.
 */

import { describe, expect, it } from 'vitest';
import {
  PLAYER_COLORS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SparkType,
} from '../constants.ts';
import { bankAdd } from '../state/castleBank.ts';
import { makeHunter } from '../state/hunters/hunter.ts';
import { makeRainbow } from '../state/rainbow.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import {
  asHunterId,
  asPlayerId,
  asRainbowId,
  asSparkId,
  type PlayerId,
} from '../types.ts';
import { BotManager } from './botManager.ts';
import { ownZonePoint } from '../state/zones.fixtures.ts';

const BOT = asPlayerId(1);
const ENEMY = asPlayerId(2);

// ⭐ S149 P1 — three seats ⇒ QUADRANTS_4P, and ENEMY (seat 2) owns the BOTTOM-RIGHT quadrant.
// These fixtures placed its structure at `SPAWNER_CENTER_X - 42x` ("the west side"), which is
// zone 3 — enemy ground for seat 2 under the zone partition, though the old influence bubble
// allowed it. The tests are about the bot's SEVER verb and its charge economy, not territory, so
// the structure simply moves onto its owner's real ground.
const L = 'QUADRANTS_4P' as const;
const ENEMY_GROUND = ownZonePoint(ENEMY, L);

function botsWorld(seed = 0xabc): World {
  const world = makeWorld(seed);
  world.gameState = 'TITLE';
  dispatch(world, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: [0, 1, 2].map((seat) => ({ seat, color: PLAYER_COLORS[seat] })),
    botSeats: [1, 2],
  });
  // ⚠ S148 P2 — the host-seeded bot pentagrams are GONE (R50), so these clears are no-ops today.
  // Retained so these reactive-behaviour tests stay independent of whatever START_GAME seeds next.
  world.primitives.clear();
  world.bonds.clear();
  world.creatureSpawners.clear();
  world.nextPrimitiveId = 0;
  world.nextBondId = 0;
  world.nextSpawnerId = 0;
  return world;
}

function run(world: World, manager: BotManager, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    manager.tick(world);
    world.tick++;
  }
}

function placePrimFor(world: World, seat: PlayerId, x: number, y: number, sparkId: number): void {
  world.freeSparks.set(asSparkId(sparkId), {
    id: asSparkId(sparkId),
    type: SparkType.Line,
    pos: { x, y },
    prevPos: { x, y },
    radius: 8,
    createdTick: 0,
    state: { kind: 'Free' },
  });
  dispatch(world, { type: 'UPDATE_AVATAR_POS', playerId: seat, pos: { x, y } });
  dispatch(world, { type: 'PICKUP_SPARK', sparkId: asSparkId(sparkId), playerId: seat, pos: { x, y } });
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId: seat,
    targetPrimitiveId: null,
    stiffnessTier: 'MID',
    placementPos: { x, y },
  });
}

describe('S87 P3 — disruptive/reactive bot behaviors (real pipeline)', () => {
  it('a charged IMBA bot cruises to an enemy bond and SEVERS it', () => {
    const world = botsWorld();
    // Enemy structure: two bonded prims on the west side.
    placePrimFor(world, ENEMY, ENEMY_GROUND.x, ENEMY_GROUND.y, 60);
    placePrimFor(world, ENEMY, ENEMY_GROUND.x - 42, ENEMY_GROUND.y, 61);
    const enemyBonds = [...world.bonds.values()].filter((b) => {
      const a = world.primitives.get(b.aId);
      return a !== undefined && a.placedBy === ENEMY;
    });
    expect(enemyBonds.length).toBeGreaterThanOrEqual(1);
    // Arm the bot with a charge; no free sparks → BUILD can't outprioritize.
    const manager = new BotManager(['IMBA'], 0xabc);
    world.players.get(BOT)!.disruptionCharges = 1;
    run(world, manager, 60 * 20);
    const survivingEnemyBonds = enemyBonds.filter((b) => world.bonds.has(b.id));
    expect(survivingEnemyBonds.length).toBeLessThan(enemyBonds.length);
    expect(world.players.get(BOT)!.disruptionCharges).toBe(0); // paid for it
  });

  it('an uncharged bot never severs (the charge economy binds bots)', () => {
    const world = botsWorld();
    placePrimFor(world, ENEMY, ENEMY_GROUND.x, ENEMY_GROUND.y, 60);
    placePrimFor(world, ENEMY, ENEMY_GROUND.x - 42, ENEMY_GROUND.y, 61);
    const bondCount = world.bonds.size;
    const manager = new BotManager(['IMBA'], 0xabc);
    run(world, manager, 60 * 10);
    expect(world.bonds.size).toBe(bondCount);
  });

  it('an IMBA bot races to the rainbow and triggers the colour shuffle', () => {
    const world = botsWorld();
    world.rainbows.set(
      asRainbowId(0),
      makeRainbow({
        id: asRainbowId(0),
        pos: { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y - 120 },
        spawnedAtTick: world.tick,
      }),
    );
    const colorsBefore = [...world.players.values()].map((p) => p.color).join(',');
    const manager = new BotManager(['IMBA'], 0xabc);
    run(world, manager, 60 * 15);
    expect(world.rainbows.size).toBe(0); // claimed (not dissipated — no TTL poll here)
    const colorsAfter = [...world.players.values()].map((p) => p.color).join(',');
    expect(colorsAfter).not.toBe(colorsBefore); // derangement actually ran
  });

  it('a HARD bot flees a hunter that is chasing it; NOOB does not', () => {
    const fledDistance = (difficulty: 'HARD' | 'NOOB'): number => {
      const world = botsWorld();
      const me = world.players.get(BOT)!;
      const hunterPos = { x: me.avatarPos.x + 60, y: me.avatarPos.y };
      world.hunters.set(
        asHunterId(0),
        makeHunter({
          id: asHunterId(0),
          pos: hunterPos,
          targetPlayerId: BOT,
          spawnedAtTick: world.tick,
        }),
      );
      const manager = new BotManager([difficulty, 'NOOB'], 0xabc);
      run(world, manager, 60 * 5); // hunter held static (no HUNTER_TICK here)
      const after = world.players.get(BOT)!.avatarPos;
      return Math.hypot(after.x - hunterPos.x, after.y - hunterPos.y);
    };
    expect(fledDistance('HARD')).toBeGreaterThan(200); // ran away
    expect(fledDistance('NOOB')).toBeLessThan(200); // oblivious
  });

  it('an IMBA bot grabs a free potato and plants it ARMED near enemy prims', () => {
    const world = botsWorld();
    placePrimFor(world, ENEMY, SPAWNER_CENTER_X + 420, SPAWNER_CENTER_Y + 200, 70);
    // FREE potato in the spawn zone.
    dispatch(world, {
      type: 'SPAWN_POTATO',
      pos: { x: SPAWNER_CENTER_X - 80, y: SPAWNER_CENTER_Y },
    });
    expect(world.potatoes.size).toBe(1);
    const manager = new BotManager(['IMBA'], 0xabc);
    run(world, manager, 60 * 20);
    const potato = [...world.potatoes.values()][0];
    // Either planted (ARMED) or already detonated near the enemy — both prove
    // the carry+plant loop ran. FREE means the bot never engaged: fail.
    if (potato !== undefined) {
      expect(potato.state).toBe('ARMED');
      const enemyPrim = [...world.primitives.values()].find((p) => p.placedBy === ENEMY);
      if (enemyPrim !== undefined && potato.state === 'ARMED') {
        const d = Math.hypot(potato.pos.x - enemyPrim.pos.x, potato.pos.y - enemyPrim.pos.y);
        expect(d).toBeLessThan(300); // delivered to the enemy's doorstep
      }
    }
  });

  it('smart placement weaves redundancy bonds (denser web than prim chain)', () => {
    const world = botsWorld(0x77);
    // ⛔ S138 P2 — was: 16 free sparks in a ring around the spawner centre. A bot can no longer
    // reach into the shared quarry (owner playtest: grabbing with cruisers "is not fair"), so the
    // supply now arrives the legitimate way — through the bot's own bank, topped up between chunks
    // the way a working gatherer would keep hauling. `CASTLE_BANK_CAP` bounds each top-up, which is
    // why this refills instead of seeding 16 at once.
    // S146 P2 — the inventory is limitless, so a "top up" is just: put some shapes in. The old
    // loop pushed up to CASTLE_BANK_CAP whole Spark entities and counted refusals; there is no cap
    // and no refusal now, so the fixture states the stock it wants directly.
    const TOP_UP = 7;
    const topUpBank = (): void => {
      for (let i = 0; i < TOP_UP; i++) bankAdd(world.castleBanks, BOT, SparkType.Dot);
    };

    const manager = new BotManager(['IMBA'], 0x77);
    for (let chunk = 0; chunk < 8; chunk++) {
      topUpBank();
      run(world, manager, 60 * 5);
    }
    const prims = [...world.primitives.values()].filter((p) => p.placedBy === BOT);
    expect(prims.length).toBeGreaterThanOrEqual(4);
    // A pure chain has prims-1 bonds; redundancy weaving should exceed that
    // at least once across the structure.
    expect(world.bonds.size).toBeGreaterThan(prims.length - 1);
  });
});
