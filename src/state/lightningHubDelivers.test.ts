/**
 * SPARK — S158 B2 (owner playtest): **the lightning drone tower "is not producing".**
 *
 * Owner, after a real match: *"the lighning drone tower is not producing or spawning suicide
 * drones."*
 *
 * ⚠ MEASURED BEFORE CHANGING ANYTHING, and the first finding was that it DOES produce: a hub ignites,
 * emits at ticks 900 / 1800 / 2700 and self-destructs at 3600. Reporting "works, closing" would have
 * been technically true and useless, because those numbers against a 45 s fight
 * (`FIGHT_PHASE_TICKS` 2700) mean the first drone arrives 15 s in, the second at 30 s and the third
 * at the phase edge — about two briefly-visible drones for a six-shape structure.
 *
 * TWO DEFECTS behind that, and neither is the emit path:
 *
 * 1. **The cadence was inherited, not chosen.** `DRONE_EMIT_INTERVAL_TICKS` was literally
 *    `= SPAWN_INTERVAL_TICKS // reuse the chewer cadence`. Same class as the laser turret S157 B7
 *    halved for the same reason.
 * 2. ⭐ **The BUILD phase gate re-aligned EVERY spawner on the chewer's 15 s**, whatever recipe it
 *    was. So even after fixing the cadence, a hub built during BUILD would have stood silent for up
 *    to 15 s of the fight it was built for. The cadence fix alone would not have been felt — which
 *    is exactly the kind of half-fix that gets reported as "still broken".
 *
 * These tests drive the REAL host tick plus the REAL ignition path, because the S139 standing lesson
 * is that a state assertion is not evidence. The last one fails against the old numbers.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from './world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { makeGameStateExtras } from './gameState.ts';
import { mulberry32 } from './rng.ts';
import { asBondId, asPlayerId, asPrimitiveId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Controls } from '../input/controls.ts';
import {
  DRONE_EMIT_INTERVAL_TICKS,
  FIGHT_PHASE_TICKS,
  LIGHTNING_HUB_DEGREE,
  PRIMITIVE_MAX_HP,
  SparkType,
  DRONE_MAX_PER_SPAWNER,
} from '../constants.ts';

const P0 = asPlayerId(0);
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function mk(w: World, type: SparkType, x: number, y: number): Primitive {
  const player = w.players.get(P0)!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const prim: Primitive = {
    id, type, placerColor: player.color, placedBy: P0, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: player.color,
    lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, prim);
  return prim;
}

/** A real hub: 1 Dot of bond-degree exactly 5 + 5 Circle leaves, plus the topology change that ignites it. */
function worldWithHub(): World {
  const w = makeWorld(0x1b2c);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.creatures.clear();
  const hub = mk(w, SparkType.Dot, 600, 400);
  for (let i = 0; i < LIGHTNING_HUB_DEGREE; i++) {
    const a = (i / LIGHTNING_HUB_DEGREE) * Math.PI * 2;
    const leaf = mk(w, SparkType.Circle, 600 + Math.cos(a) * 40, 400 + Math.sin(a) * 40);
    const bid = asBondId(w.nextBondId++);
    w.bonds.set(bid, {
      id: bid, aId: hub.id, bId: leaf.id, a: hub, b: leaf,
      restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
    });
    hub.bonds.add(bid);
    leaf.bonds.add(bid);
  }
  // `runSpawnerIgnition` scans only on a topology change — the one thing a hand-built fixture must
  // supply, and the reason the first version of this probe reported "spawners: 0" for 4000 ticks.
  w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 600, y: 400 }, bondCount: 5 });
  return w;
}

/** Runs the matcher + host tick together, the way main.ts does, counting every drone ever seen. */
function runFight(w: World, ticks: number): { everSeen: number; selfDestructedAt: number | null } {
  const d = deps();
  const st = makeHostTickState(w);
  const cursor = { lastMatcherTick: -1 };
  const seen = new Set<number>();
  let selfDestructedAt: number | null = null;
  let hadSpawner = false;
  for (let t = 0; t < ticks; t++) {
    runGodlyMatcherCore(w, cursor);
    runHostTick(w, d, st);
    if (w.creatureSpawners.size > 0) hadSpawner = true;
    if (hadSpawner && w.creatureSpawners.size === 0 && selfDestructedAt === null) selfDestructedAt = t;
    for (const c of w.creatures.values()) {
      if (c.type === 'lightningDrone') seen.add(c.id as unknown as number);
    }
  }
  return { everSeen: seen.size, selfDestructedAt };
}

describe('S158 B2 — the hub delivers inside ONE fight', () => {
  it('ignites at all (the control — a fixture that never ignites proves nothing below)', () => {
    const w = worldWithHub();
    w.matchPhase = 'FIGHT';
    const d = deps();
    const st = makeHostTickState(w);
    const cursor = { lastMatcherTick: -1 };
    runGodlyMatcherCore(w, cursor);
    runHostTick(w, d, st);
    expect(w.creatureSpawners.size, 'the hub must become a spawner').toBe(1);
    expect([...w.creatureSpawners.values()][0]!.recipeId).toBe('lightningHub');
  });

  it('⭐ S159 P9 — KEEPS PRODUCING all fight and does NOT self-destruct (was: 3 drones, then gone)', () => {
    /*
     * INVERTED, not deleted — the S158 B2b treatment, applied to a behaviour the owner has RE-RULED.
     *
     * This asserted the S113 design: exactly `STRUCTURE_SELFDESTRUCT_DRONE_COUNT` drones and then a
     * self-destruct inside the same fight. The owner played it: *"lightning drone tower spawns like 3
     * drones and then dissapears! wtf? it should not be so. he should continuously spawn them at the
     * equal intervals."* So the assertion flips — more than the retired burst, and the hub is STILL
     * STANDING at the whistle. Measured at 9 drones in one 45 s fight on the 5 s cadence.
     *
     * ⚠ The two claims the ORIGINAL test existed for both survive elsewhere: that the cadence lets a
     * hub deliver inside ONE fight (the BUILD-carry test below still pins it) and that a hub is
     * dormant during BUILD (its own CONTROL). Only the self-destruct half is retired.
     */
    const w = worldWithHub();
    w.matchPhase = 'FIGHT';
    const { everSeen, selfDestructedAt } = runFight(w, FIGHT_PHASE_TICKS);
    // eslint-disable-next-line no-console
    console.log(`[S159 P9] one 45 s fight: ${everSeen} drones, selfDestructedAt=${selfDestructedAt}`);
    expect(everSeen, 'more than the retired 3-drone burst').toBeGreaterThan(DRONE_MAX_PER_SPAWNER);
    expect(selfDestructedAt, 'and the hub survives its own production').toBeNull();
    expect(w.creatureSpawners.size, 'still standing at the whistle').toBe(1);
  });

  it('⭐ S159 P9 — never exceeds DRONE_MAX_PER_SPAWNER in the air at once', () => {
    // With the self-destruct retired, this cap stops being a restatement of the burst and becomes the
    // hub's whole balance — so it is asserted directly instead of inferred from a tower that died.
    const w = worldWithHub();
    w.matchPhase = 'FIGHT';
    const d = deps();
    const st = makeHostTickState(w);
    const cursor = { lastMatcherTick: -1 };
    let peak = 0;
    for (let t = 0; t < FIGHT_PHASE_TICKS; t++) {
      runGodlyMatcherCore(w, cursor);
      runHostTick(w, d, st);
      let live = 0;
      for (const c of w.creatures.values()) if (c.type === 'lightningDrone') live++;
      if (live > peak) peak = live;
    }
    // eslint-disable-next-line no-console
    console.log(`[S159 P9] peak live drones from one hub: ${peak} (cap ${DRONE_MAX_PER_SPAWNER})`);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(DRONE_MAX_PER_SPAWNER);
  });

  it('⭐ a hub carried through BUILD is never more than ITS OWN cadence from firing', () => {
    /*
     * THE SECOND DEFECT, and the one a cadence change alone would have hidden. The BUILD re-alignment
     * advanced `nextSpawnTick` by the CHEWER's 15 s for every recipe, so a hub crossing the phase edge
     * carried a deadline up to 900 ticks past it — a third of the fight, silent, with a correct cadence.
     *
     * ⚠ THE ASSERTION IS THE INVARIANT, NOT A SYMPTOM, AND THE FIRST VERSION WAS THE SYMPTOM. It said
     * "the first drone arrives in the first quarter of the fight", which a mutation test showed PASSES
     * with the bug restored: at that particular BUILD length the wrong step happened to land inside the
     * window anyway. The property that actually holds is `nextSpawnTick - tick <= the recipe's own
     * interval`, and it is swept across BUILD lengths so no single lucky alignment can hide a
     * regression.
     */
    for (const buildTicks of [400, 900, 1000, 1500, 2000, 2600, 3300]) {
      const w = worldWithHub();
      w.matchPhase = 'BUILD';
      const d = deps();
      const st = makeHostTickState(w);
      const cursor = { lastMatcherTick: -1 };
      for (let t = 0; t < buildTicks; t++) {
        runGodlyMatcherCore(w, cursor);
        runHostTick(w, d, st);
      }
      expect(w.creatureSpawners.size, `hub must survive a ${buildTicks}-tick BUILD`).toBe(1);
      const sp = [...w.creatureSpawners.values()][0]!;
      expect(sp.spawnedCount, 'and emit NOTHING while dormant (S157 P0)').toBe(0);
      expect(
        sp.nextSpawnTick - w.tick,
        `after a ${buildTicks}-tick BUILD the hub is ${sp.nextSpawnTick - w.tick} ticks from firing, ` +
          `which is more than its own ${DRONE_EMIT_INTERVAL_TICKS}-tick cadence — it was re-aligned on ` +
          `some other recipe's clock`,
      ).toBeLessThanOrEqual(DRONE_EMIT_INTERVAL_TICKS);
    }
  });

  it('CONTROL — it is still DORMANT during BUILD, which S157 P0 shipped and this must not undo', () => {
    const w = worldWithHub();
    w.matchPhase = 'BUILD';
    const { everSeen } = runFight(w, 2000);
    expect(everSeen, 'no drone may be minted outside the fight').toBe(0);
  });
});

describe('S158 B2b — THE OWNER\u2019S ACTUAL BOARD: a hub with a neighbour attached', () => {
  /**
   * \u26d4 THE TEST THAT WOULD HAVE CAUGHT IT, and the reason the first two probes did not.
   *
   * Owner, after I reported the tower produces: *"drone tower was NOT producing. maybe he was on the
   * chewers clock but no drones were actually being produced."* They were right. Both earlier probes
   * built an ISOLATED hub on an empty board, where it works perfectly.
   *
   * On a real board you build things next to each other. ONE ordinary shape bonded to ONE LEAF grew
   * the component past six, the whole-component recipe test returned false, and the re-validation
   * poll removed the spawner within half a second \u2014 silently, and for the rest of the match.
   */
  it('\u2b50 a hub with a shape bonded to one of its LEAVES still emits its drones', () => {
    const w = worldWithHub();
    // The neighbour. Exactly what killed it: one shape, one bond, onto a leaf.
    const leaf = [...w.primitives.values()].find((p) => p.type === SparkType.Circle)!;
    const neighbour = mk(w, SparkType.Square, leaf.pos.x + 20, leaf.pos.y);
    const bid = asBondId(w.nextBondId++);
    w.bonds.set(bid, {
      id: bid, aId: leaf.id, bId: neighbour.id, a: leaf, b: neighbour,
      restLength: 20, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
    });
    leaf.bonds.add(bid);
    neighbour.bonds.add(bid);

    w.matchPhase = 'FIGHT';
    const { everSeen } = runFight(w, FIGHT_PHASE_TICKS);
    // S159 P9 — was `.toBe(STRUCTURE_SELFDESTRUCT_DRONE_COUNT)`. The claim is unchanged in substance
    // (a neighbouring shape must not silently kill the tower); only its arithmetic moved, because the
    // hub is a factory now rather than a three-shot burst.
    expect(everSeen, 'a neighbouring shape must not silently kill the tower').toBeGreaterThan(
      DRONE_MAX_PER_SPAWNER,
    );
  });

  it('\u26d4 CONTROL \u2014 breaking the STAR still kills it, which is the counterplay that must survive', () => {
    const w = worldWithHub();
    w.matchPhase = 'FIGHT';
    const d = deps();
    const st = makeHostTickState(w);
    const cursor = { lastMatcherTick: -1 };
    runGodlyMatcherCore(w, cursor);
    runHostTick(w, d, st);
    expect(w.creatureSpawners.size, 'ignited first').toBe(1);

    // An enemy eats a leaf. The star is broken, so the tower must go.
    const leaf = [...w.primitives.values()].find((p) => p.type === SparkType.Circle)!;
    for (const bid of leaf.bonds) w.bonds.delete(bid);
    w.primitives.delete(leaf.id);
    for (const p of w.primitives.values()) {
      for (const bid of [...p.bonds]) if (!w.bonds.has(bid)) p.bonds.delete(bid);
    }
    for (let t = 0; t < 120; t++) {
      runGodlyMatcherCore(w, cursor);
      runHostTick(w, d, st);
    }
    expect(w.creatureSpawners.size, 'a broken star must still tear the spawner down').toBe(0);
  });
});
