/**
 * SPARK — S100 P1 (TD Phase 1a) chewer behaviour tests.
 *
 * Covers the PDR acceptance gates for the chewer creature:
 *   - Voltkin regression: still auto-deletes at tick 1200, enters DESPAWNING at 1140.
 *   - Chewer lifetime (S104 P1): a chewer is now FINITE (persistent:false) — it enters DESPAWNING
 *     at despawnAtTick−CREATURE_DESPAWNING_TICKS and auto-deletes at despawnAtTick (the churn that
 *     keeps the spawner producing). Was: "a persistent chewer does NOT auto-despawn" (now inverted).
 *   - Chew loop: a chewer reaches chewProgress 5 on a stationary enemy bond, severs it
 *     exactly on the 5th hit, and does not re-seek (re-select its target) mid-chew.
 *   - Caps: global / per-spawner / per-victim; Voltkin-vs-chewer populations counted
 *     INDEPENDENTLY (a chewer swarm does not block a Voltkin summon).
 *   - Enemy-only targeting: a chewer with no enemy bonds idles, never targeting its
 *     owner's own bonds.
 *
 * Fixtures build real Primitive/Bond objects (with live a/b refs) so the FSM range
 * gate + bondMidpoint + isEnemyBond all see consistent state, mirroring the
 * creatureLifecycle.test.ts setupSeeking helper.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeWorld, dispatch, type World } from '../world.ts';
import {
  applyCreatureTick,
  applySpawnCreature,
  underChewerCaps,
} from './creatureLifecycle.ts';
import { applyCreatureAttack } from './creatureAttack.ts';
import { findNearestBondTarget } from './creatureAI.ts';
import {
  asCreatureId,
  VOLTKIN_LIFETIME_TICKS,
  CREATURE_DESPAWNING_TICKS,
} from './creature.ts';
import {
  CHEW_INTERVAL_TICKS,
  CHEWER_MAX_GLOBAL,
  CHEWER_MAX_PER_SPAWNER,
  CHEWER_MAX_PER_VICTIM,
  PLAYER_COLORS,
  SparkType,
  PRIMITIVE_MAX_HP,
} from '../../constants.ts';
import { asPlayerId, asPrimitiveId, asSpawnerId, type BondId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { CHEWER_CONFIG } from './voltkin-config.ts';

import { getCreatureConfig } from './voltkin-config.ts';
import { attackFifths, connectorCapacityFifths } from '../stats.ts';
/** Add an enemy (player-1-coloured) bond whose midpoint is at (midX, midY). */
function addEnemyBond(
  world: World,
  bondId: number,
  primAId: number,
  primBId: number,
  midX: number,
  midY: number,
  ownerColor: number,
  ownerPlayer: number,
): BondId {
  const primA: Primitive = {
    id: asPrimitiveId(primAId),
    type: SparkType.Dot,
    placerColor: ownerColor,
    placedBy: asPlayerId(ownerPlayer),
    createdTick: 0,
    pos: { x: midX - 10, y: midY },
    prevPos: { x: midX - 10, y: midY },
    bonds: new Set(),
    ownerColor,
    lastOwnershipChange: 0,
    radius: 8,
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  const primB: Primitive = {
    id: asPrimitiveId(primBId),
    type: SparkType.Dot,
    placerColor: ownerColor,
    placedBy: asPlayerId(ownerPlayer),
    createdTick: 0,
    pos: { x: midX + 10, y: midY },
    prevPos: { x: midX + 10, y: midY },
    bonds: new Set(),
    ownerColor,
    lastOwnershipChange: 0,
    radius: 8,
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  world.primitives.set(primA.id, primA);
  world.primitives.set(primB.id, primB);
  const bond: Bond = {
    id: bondId as unknown as BondId,
    aId: primA.id,
    bId: primB.id,
    a: primA,
    b: primB,
    restLength: 32,
    stiffnessTier: 'MID',
    damageFifths: 0,
    createdTick: 0,
  };
  world.bonds.set(bond.id, bond);
  primA.bonds.add(bond.id);
  primB.bonds.add(bond.id);
  return bond.id;
}

function spawnChewer(
  world: World,
  pos: { x: number; y: number },
  spawnerId: number,
  ownerPlayer = 0,
  victimPlayerId?: number,
): void {
  applySpawnCreature(world, {
    type: 'SPAWN_CREATURE',
    creatureType: 'chewer',
    ownerPlayerId: asPlayerId(ownerPlayer),
    pos,
    targetPos: pos,
    sourceSpawnerId: asSpawnerId(spawnerId),
    ...(victimPlayerId !== undefined ? { victimPlayerId: asPlayerId(victimPlayerId) } : {}),
  });
}

describe('Voltkin regression — persistent gate does not touch the Voltkin lifecycle', () => {
  it('a Voltkin still enters DESPAWNING one despawn-window before its end, then auto-deletes', () => {
    /*
     * ⭐ S155 P3 — REWRITTEN TO TEST WHAT IT CLAIMS, rather than re-baselined.
     *
     * The intent stated in the describe title is *"the persistent gate does not touch the Voltkin
     * lifecycle"* — i.e. the FSM RELATIONSHIP: DESPAWNING opens `CREATURE_DESPAWNING_TICKS` before
     * `despawnAtTick`, and the creature is gone at `despawnAtTick`. That relationship is entirely
     * phase-independent.
     *
     * The absolute numbers 1140/1200 were an accident of `makeWorld` opening in BUILD at tick 0, and
     * they broke the moment Voltkin's clock started at FIGHT (S155 P3, owner). Re-pinning them to
     * 6540/6600 would have re-encoded the same accident one phase later, so the ticks are now DERIVED
     * from the creature's own `despawnAtTick`. The test can no longer be broken by a phase-length
     * re-tune, and it now fails only if the thing it is named after actually regresses.
     */
    const world = makeWorld(1);
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: { x: 100, y: 100 },
      targetPos: { x: 200, y: 200 },
    });
    const id = asCreatureId(0);
    const c = world.creatures.get(id)!;
    // The lifetime is still exactly VOLTKIN_LIFETIME_TICKS long — only its START moved.
    const despawnAt = c.despawnAtTick;
    expect(despawnAt - world.phaseEndsAtTick).toBe(VOLTKIN_LIFETIME_TICKS);
    c.state = 'SEEKING';
    world.tick = despawnAt - CREATURE_DESPAWNING_TICKS;
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.get(id)!.state).toBe('DESPAWNING');
    world.tick = despawnAt;
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.has(id)).toBe(false);
  });

  it('S104 P1 — a chewer (now finite, persistent:false) enters DESPAWNING then auto-deletes at its lifetime', () => {
    const world = makeWorld(1);
    spawnChewer(world, { x: 100, y: 100 }, 0);
    const id = asCreatureId(0);
    const c = world.creatures.get(id)!;
    const life = CHEWER_CONFIG.lifetimeTicks; // 3000 (S104); spawnedAtTick 0 → despawnAtTick = life
    expect(c.despawnAtTick).toBe(life);
    // Forced into DESPAWNING at despawnAtTick − CREATURE_DESPAWNING_TICKS (the churn fix; was: never).
    c.state = 'SEEKING';
    world.tick = life - CREATURE_DESPAWNING_TICKS;
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.get(id)!.state).toBe('DESPAWNING');
    // Auto-deletes at despawnAtTick — the spawner slot frees so its 15s cadence keeps producing.
    world.tick = life;
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.has(id)).toBe(false);
  });
});

describe('Chew loop — 5 hits sever exactly on the 5th; no re-seek mid-chew', () => {
  let world: World;
  let enemyBondId: BondId;
  beforeEach(() => {
    world = makeWorld(0);
    world.players.clear();
    world.players.set(asPlayerId(0), makeIdlePlayer(asPlayerId(0), PLAYER_COLORS[0]));
    world.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), PLAYER_COLORS[1]));
    // Stationary enemy bond near the chewer.
    enemyBondId = addEnemyBond(world, 1, 10, 11, 50, 0, PLAYER_COLORS[1], 1);
  });

  /**
   * ⭐ S151 P2 (owner R76) — REWRITTEN. This used to assert "5 hits sever exactly on the 5th", which
   * was true only while a connector's durability lived on the ATTACKER as `chewHits: 5`. That is
   * exactly the inversion R76 removed: every bond in the game was equally tough, so building a dense
   * structure bought a defender nothing.
   *
   * The property that replaces it is the one the owner actually wants: a chewer gnaws on its cadence
   * and the CONNECTOR decides when it gives way, so bites-to-sever scales with the structure's
   * complexity. The commitment behaviour (no re-seek mid-gnaw) is unchanged and still pinned below.
   */
  it('⭐ gnaws on the cadence until the CONNECTOR gives way — bites scale with complexity', () => {
    spawnChewer(world, { x: 0, y: 0 }, 0);
    const id = asCreatureId(0);
    const c = world.creatures.get(id)!;
    c.state = 'ATTACKING';
    c.ticksInState = 0;
    c.targetBondId = enemyBondId;

    const chewer = getCreatureConfig('chewer');
    const bite = attackFifths(chewer.atk, chewer.pen);
    const capacity = connectorCapacityFifths(world.bonds.size);
    const expectedBites = Math.ceil(capacity / bite);

    let bites = 0;
    let lastProgress = 0;
    // Run well past the expected break so a failure reads as "never severed" rather than "ran out".
    for (let t = 1; t <= (expectedBites + 3) * CHEW_INTERVAL_TICKS; t++) {
      applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
      const cc = world.creatures.get(id);
      if (cc === undefined) break;
      if (!world.bonds.has(enemyBondId)) break;
      // Target must NOT change while mid-gnaw: it stays committed.
      expect(cc.targetBondId).toBe(enemyBondId);
      expect(cc.chewProgress).toBeGreaterThanOrEqual(lastProgress); // monotonic
      lastProgress = cc.chewProgress;

      // The host fires the real CREATURE_ATTACK on EVERY bite now (hostTick gates on
      // `ticksInState % CHEW_INTERVAL_TICKS === 0`), not once at a fixed attackFireTick.
      if (cc.ticksInState > 0 && cc.ticksInState % CHEW_INTERVAL_TICKS === 0) {
        bites++;
        applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: id, bondId: enemyBondId });
      }
    }

    expect(world.bonds.has(enemyBondId), 'the connector should have given way').toBe(false);
    expect(bites, 'bites should match the connector capacity, not a flat 5').toBe(expectedBites);
  });

  it('does not re-seek (chewProgress stays committed) — releases only when the bond vanishes', () => {
    spawnChewer(world, { x: 0, y: 0 }, 0);
    const id = asCreatureId(0);
    const c = world.creatures.get(id)!;
    c.state = 'ATTACKING';
    c.ticksInState = 0;
    c.targetBondId = enemyBondId;
    // Add a SECOND, closer enemy bond — a re-seeking creature would switch to it.
    const closer = addEnemyBond(world, 2, 20, 21, 5, 0, PLAYER_COLORS[1], 1);
    // Advance one chew interval so chewProgress > 0 (committed).
    for (let t = 0; t < CHEW_INTERVAL_TICKS; t++) {
      applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    }
    expect(world.creatures.get(id)!.chewProgress).toBe(1);
    expect(world.creatures.get(id)!.targetBondId).toBe(enemyBondId); // not the closer bond
    void closer;

    // Now the committed bond vanishes (another actor severed it) → release + re-seek.
    world.bonds.delete(enemyBondId);
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    const cc = world.creatures.get(id)!;
    expect(cc.chewProgress).toBe(0);
    expect(cc.state).toBe('SEEKING');
    expect(cc.targetBondId).toBe(null);
  });
});

/**
 * ⭐ S158 P2 — WHY THESE TESTS NO LONGER ENUMERATE TO THE CAP, AND WHAT THAT UNCOVERED.
 *
 * ## 1. The cost, which had become a coin-flip on every deploy
 *
 * S157 B8b turned the chewer caps OFF the only way a constant can be turned off — by raising all
 * three to `10_000` ("owner: no cap — sentinel backstop only"). Every test in this block looped to
 * `CAP + k`, and every iteration called `underChewerCaps`, which scans the whole creature map. So the
 * loops silently became O(n²) at n = 10 000. The per-victim test alone took **2.1 s** in isolation
 * and **TIMED OUT at vitest's 5 s default** under full-suite parallelism.
 *
 * `npx vitest run` is a gating step in `deploy.yml`. A suite that fails on a busy runner is a deploy
 * that fails at random, for a reason nobody would go looking for in a cap test. It was reported as
 * 3220/3220 at the S157 close and measured 3219/3220 at the S158 boot — same code, different machine
 * load. **The fix is the cost, not the timeout**: raising `testTimeout` would hide it and hand the
 * problem back the moment a runner got busier.
 *
 * The population is now built by CLONING one real spawned chewer, so the records are exactly what
 * the spawn path produces, and the cap scan is paid once at the boundary instead of 10 000 times.
 *
 * ## 2. ⛔ And the old per-victim and per-spawner assertions were VACUOUS
 *
 * Visible only while fixing the cost: B8b set all three sentinels to the **same** `10_000`. The old
 * per-victim test spawned `CHEWER_MAX_PER_VICTIM + 4` chewers across distinct spawners and asserted
 * (a) at most CAP were committed to the victim, and (b) `underChewerCaps` then reported `false`.
 * **Both are fully satisfied by the GLOBAL cap**, which bites at the identical count — so neither
 * assertion could distinguish the per-victim rule from the global one, and both would still pass
 * with the per-victim branch deleted outright. The per-spawner test has the same shape and the same
 * hole.
 *
 * While the three constants are equal, the per-spawner and per-victim boundaries are **not
 * independently reachable**, so no honest test can pin them. Rather than keep two expensive tests
 * that prove something they do not prove, this block now pins the sentinel that IS observable, and
 * adds a TRIPWIRE that goes red the moment the constants stop being equal — which is exactly when
 * real per-spawner / per-victim coverage becomes both possible and necessary.
 */
describe('Caps — the sentinel backstop; independent populations', () => {
  function worldWithPlayers(n: number): World {
    const world = makeWorld(0);
    world.players.clear();
    for (let i = 0; i < n; i++) {
      world.players.set(asPlayerId(i), makeIdlePlayer(asPlayerId(i), PLAYER_COLORS[i]));
    }
    return world;
  }

  /**
   * Fill the creature map to exactly `n` chewers by cloning one REAL spawn — O(n), where `n` real
   * spawns would be O(n²) because each one re-scans the whole map for the cap.
   *
   * ⚠ The seed comes from `applySpawnCreature`, not a hand-written literal, so the clones carry every
   * field the real path sets. A literal would drift the first time `Creature` grows a field, and
   * would then be quietly testing a shape the game never produces.
   *
   * ⚠ `pos`/`prevPos`/`targetPos` are COPIED rather than shared. A bare spread would alias one vector
   * across 10 000 records, so a single mutation would move the whole swarm at once — harmless for
   * counting, and a trap for whoever next builds a movement assertion on this helper.
   */
  function fillChewers(world: World, n: number, spreadSpawners = true): void {
    spawnChewer(world, { x: 0, y: 0 }, 0);
    const seed = [...world.creatures.values()].at(-1);
    expect(seed, 'the seed spawn must land, or every clone below is vacuous').toBeDefined();
    for (let i = world.creatures.size; i < n; i++) {
      const id = asCreatureId(world.nextCreatureId++);
      world.creatures.set(id, {
        ...seed!,
        id,
        pos: { ...seed!.pos },
        prevPos: { ...seed!.prevPos },
        targetPos: { ...seed!.targetPos },
        sourceSpawnerId: asSpawnerId(spreadSpawners ? i : 0),
      });
    }
    expect(world.creatures.size, 'fill must land exactly on n').toBe(n);
  }

  it('⭐ the sentinel backstop flips EXACTLY at the cap, and refuses through the real spawn path', () => {
    const world = worldWithPlayers(2);
    fillChewers(world, CHEWER_MAX_GLOBAL - 1);

    // One short of the cap the gate is OPEN — the half the old ≤-cap assertion never checked, and
    // the half that fails if someone makes the comparison off-by-one in the safe-looking direction.
    expect(underChewerCaps(world, asSpawnerId(999))).toBe(true);
    spawnChewer(world, { x: 1, y: 0 }, 999);
    expect(world.creatures.size).toBe(CHEWER_MAX_GLOBAL);

    // AT the cap the gate is SHUT, and the refusal runs through the real spawn path rather than the
    // predicate alone — five more attempts add nothing.
    expect(underChewerCaps(world, asSpawnerId(1000))).toBe(false);
    for (let s = 0; s < 5; s++) spawnChewer(world, { x: s * 7, y: 0 }, 2000 + s);
    expect(world.creatures.size).toBe(CHEWER_MAX_GLOBAL);
  });

  it('⚠ TRIPWIRE — the three caps are one sentinel today, so per-spawner/per-victim cannot be tested', () => {
    /*
     * Not a behaviour assertion — a NOTICE with teeth. While the three constants are equal the global
     * cap always bites first (or simultaneously), so any test claiming to prove the per-spawner or
     * per-victim rule is actually proving the global one. That is exactly how the two tests this
     * replaced passed while asserting nothing.
     *
     * If you LOWER either of these below the global cap you have made that rule reachable again, and
     * this goes red to say so. That is the moment to write the real boundary tests: fill to `CAP - 1`
     * with `fillChewers(world, n, false)` for per-spawner (all one spawner), assert the gate open,
     * spawn one, assert it shut — while the global count stays comfortably below its own cap, so the
     * assertion cannot be satisfied by the wrong rule.
     */
    expect(
      CHEWER_MAX_PER_SPAWNER,
      'per-spawner cap is now below global — it is independently reachable, so write its boundary test',
    ).toBeGreaterThanOrEqual(CHEWER_MAX_GLOBAL);
    expect(
      CHEWER_MAX_PER_VICTIM,
      'per-victim cap is now below global — it is independently reachable, so write its boundary test',
    ).toBeGreaterThanOrEqual(CHEWER_MAX_GLOBAL);
  });

  it('the per-victim hint is ACCEPTED and cannot flip a healthy gate shut', () => {
    // The one thing about the per-victim branch that IS observable while the sentinels are equal:
    // passing the optional hint must not change the answer below the cap. If a future edit let the
    // victim tally leak into the global one — an easy mistake, they share a single loop — this reddens.
    const world = worldWithPlayers(2);
    const bond = addEnemyBond(world, 100, 200, 201, 40, 0, PLAYER_COLORS[1], 1);
    fillChewers(world, 8);
    for (const c of world.creatures.values()) c.targetBondId = bond;
    expect(underChewerCaps(world, asSpawnerId(0), asPlayerId(1))).toBe(true);
    expect(underChewerCaps(world, asSpawnerId(0), asPlayerId(0))).toBe(true);
    expect(underChewerCaps(world, asSpawnerId(0))).toBe(true);
  });

  it('independent populations: a saturated chewer swarm does NOT block a Voltkin summon', () => {
    const world = worldWithPlayers(2);
    fillChewers(world, CHEWER_MAX_GLOBAL); // saturated
    expect(world.creatures.size).toBe(CHEWER_MAX_GLOBAL);
    // A Voltkin summon (sourceSpawnerId == null) must still succeed — it is counted
    // against the null-population only (currently 0 for this owner).
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: { x: 500, y: 500 },
      targetPos: { x: 600, y: 600 },
    });
    const voltkins = [...world.creatures.values()].filter((c) => c.sourceSpawnerId === null);
    expect(voltkins.length).toBe(1);
    expect(voltkins[0].type).toBe('voltkin');
  });

  it('independent populations: a live Voltkin does NOT consume a chewer cap slot', () => {
    const world = worldWithPlayers(2);
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: { x: 0, y: 0 },
      targetPos: { x: 10, y: 10 },
    });
    // The Voltkin is live; the chewer population must still reach its own full cap beside it.
    fillChewers(world, CHEWER_MAX_GLOBAL + 1); // +1 = the Voltkin already occupying a map slot
    expect(underChewerCaps(world, asSpawnerId(1))).toBe(false); // chewers saturated…
    const chewers = [...world.creatures.values()].filter((c) => c.sourceSpawnerId !== null);
    expect(chewers.length).toBe(CHEWER_MAX_GLOBAL); // …at exactly CAP, the Voltkin costing nothing
  });
});

describe('Enemy-only targeting — chewer never eats its own structure', () => {
  it('a chewer with NO enemy bonds returns null (idles), never targets own bonds', () => {
    const world = makeWorld(0);
    world.players.clear();
    world.players.set(asPlayerId(0), makeIdlePlayer(asPlayerId(0), PLAYER_COLORS[0]));
    // Only OWN bonds exist (player 0's colour).
    addEnemyBond(world, 1, 10, 11, 50, 0, PLAYER_COLORS[0], 0);
    addEnemyBond(world, 2, 12, 13, 80, 0, PLAYER_COLORS[0], 0);
    spawnChewer(world, { x: 0, y: 0 }, 0, 0);
    const chewer = world.creatures.get(asCreatureId(0))!;
    // enemyOnly:true → null when no enemy bond exists.
    expect(findNearestBondTarget(world, chewer, true)).toBe(null);
    // Voltkin default (enemyOnly:false) WOULD fall back to an own bond (byte-for-byte).
    expect(findNearestBondTarget(world, chewer, false)).not.toBe(null);
  });

  it('a chewer targets the enemy bond when one exists (own bonds present too)', () => {
    const world = makeWorld(0);
    world.players.clear();
    world.players.set(asPlayerId(0), makeIdlePlayer(asPlayerId(0), PLAYER_COLORS[0]));
    world.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), PLAYER_COLORS[1]));
    // Own bond (closer) + enemy bond (farther).
    addEnemyBond(world, 1, 10, 11, 20, 0, PLAYER_COLORS[0], 0); // own
    const enemy = addEnemyBond(world, 2, 12, 13, 200, 0, PLAYER_COLORS[1], 1); // enemy
    spawnChewer(world, { x: 0, y: 0 }, 0, 0);
    const chewer = world.creatures.get(asCreatureId(0))!;
    // enemyOnly:true picks the enemy bond even though the own bond is closer.
    expect(findNearestBondTarget(world, chewer, true)).toBe(enemy);
  });
});

describe('RAID_TARGET \u2014 a raid is a 2-ATK hit on units (owner R78, S152 P1)', () => {
  const RAIDER = asPlayerId(0);

  it('right-clicking an enemy chewer pops it and spends exactly 1 RAID POINT', () => {
    const world = makeWorld(2); // P0 raider, P1 owns the chewer
    world.players.get(RAIDER)!.raidPoints = 2;
    spawnChewer(world, { x: 100, y: 100 }, 7, 1); // ownerPlayer 1 = enemy
    const id = asCreatureId(0);
    expect(world.creatures.has(id)).toBe(true);
    dispatch(world, { type: 'RAID_TARGET', target: { kind: 'creature', id }, playerId: RAIDER });
    expect(world.creatures.has(id)).toBe(false); // chewer = 5 fifths, raid = 10 -> dead in one
    expect(world.players.get(RAIDER)!.raidPoints).toBe(1);
  });

  it('\u2b50 SPENDS A RAID POINT AND NOT A DISRUPTION CHARGE \u2014 the two currencies are separate', () => {
    const world = makeWorld(2);
    const raider = world.players.get(RAIDER)!;
    raider.raidPoints = 1;
    raider.disruptionCharges = 2;
    spawnChewer(world, { x: 100, y: 100 }, 7, 1);
    dispatch(world, {
      type: 'RAID_TARGET', target: { kind: 'creature', id: asCreatureId(0) }, playerId: RAIDER,
    });
    expect(raider.raidPoints).toBe(0);
    expect(raider.disruptionCharges).toBe(2); // untouched \u2014 severing is still separately funded
  });

  it('cannot raid your OWN unit (enemy-only) \u2014 survives, no point spent', () => {
    const world = makeWorld(1);
    world.players.get(RAIDER)!.raidPoints = 2;
    spawnChewer(world, { x: 100, y: 100 }, 7, 0); // ownerPlayer 0 = the raider
    const id = asCreatureId(0);
    dispatch(world, { type: 'RAID_TARGET', target: { kind: 'creature', id }, playerId: RAIDER });
    expect(world.creatures.has(id)).toBe(true);
    expect(world.players.get(RAIDER)!.raidPoints).toBe(2);
  });

  it('no raid point -> the raid is a no-op (the unit survives)', () => {
    const world = makeWorld(2);
    world.players.get(RAIDER)!.raidPoints = 0;
    spawnChewer(world, { x: 100, y: 100 }, 7, 1);
    const id = asCreatureId(0);
    dispatch(world, { type: 'RAID_TARGET', target: { kind: 'creature', id }, playerId: RAIDER });
    expect(world.creatures.has(id)).toBe(true);
  });

  it('orphaned chewer (spawner already destroyed) is still raid-killable', () => {
    const world = makeWorld(2);
    world.players.get(RAIDER)!.raidPoints = 2;
    spawnChewer(world, { x: 100, y: 100 }, 99, 1); // spawner id 99 was never registered / is gone
    const id = asCreatureId(0);
    dispatch(world, { type: 'RAID_TARGET', target: { kind: 'creature', id }, playerId: RAIDER });
    expect(world.creatures.has(id)).toBe(false);
  });

  it('\u2b50 THE CHEWERS-ONLY RESTRICTION IS GONE, BUT THE LADDER STILL PROTECTS A VOLTKIN', () => {
    // S102 refused any non-chewer outright. Owner R78 says "units", so a voltkin IS a legal target
    // now \u2014 and it survives anyway, because 8 hp / 3 def = 8 * (5+3) = 64 fifths against a raid's
    // 10. The protection comes from the shared arithmetic, NOT from a special case. This test
    // INVERTED at S152: it used to assert the raid was refused.
    const world = makeWorld(2);
    world.players.get(RAIDER)!.raidPoints = 3;
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE', creatureType: 'voltkin', ownerPlayerId: asPlayerId(1),
      pos: { x: 100, y: 100 }, targetPos: { x: 100, y: 100 },
    });
    const id = asCreatureId(0);
    dispatch(world, { type: 'RAID_TARGET', target: { kind: 'creature', id }, playerId: RAIDER });
    expect(world.creatures.has(id)).toBe(true);              // 10 < 64 \u2014 it holds
    expect(world.players.get(RAIDER)!.raidPoints).toBe(2);   // but the point WAS spent
  });

  it('\u2b50 SEVEN RAIDS KILL A VOLTKIN \u2014 the R78 kill table, verified by accumulation', () => {
    // 64 fifths / 10 per raid: six raids bank 60 and it lives; the seventh reaches 70 and it dies.
    // This is the pool semantics owner R74 settled ("Damage pool"), not a threshold.
    const world = makeWorld(2);
    world.players.get(RAIDER)!.raidPoints = 7;
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE', creatureType: 'voltkin', ownerPlayerId: asPlayerId(1),
      pos: { x: 100, y: 100 }, targetPos: { x: 100, y: 100 },
    });
    const id = asCreatureId(0);
    for (let i = 0; i < 6; i++) {
      dispatch(world, { type: 'RAID_TARGET', target: { kind: 'creature', id }, playerId: RAIDER });
      expect(world.creatures.has(id)).toBe(true);
    }
    dispatch(world, { type: 'RAID_TARGET', target: { kind: 'creature', id }, playerId: RAIDER });
    expect(world.creatures.has(id)).toBe(false);
  });

  it('\u2b50 LEAVES A RAIDED CLOUD IN THE RAIDER\u2019S COLOUR, AT THE VICTIM\u2019S POSITION', () => {
    // Owner R78: the cloud exists so "they will know who attacked them". The colour must therefore
    // be the RAIDER'S, and the position must be where the unit STOOD \u2014 which is only reachable if
    // the reducer captured it BEFORE damageEntity removed the creature.
    const world = makeWorld(2);
    const raider = world.players.get(RAIDER)!;
    raider.raidPoints = 1;
    spawnChewer(world, { x: 123, y: 456 }, 7, 1);
    world.effects.length = 0;
    dispatch(world, {
      type: 'RAID_TARGET', target: { kind: 'creature', id: asCreatureId(0) }, playerId: RAIDER,
    });
    const cloud = world.effects.find((e) => e.kind === 'RAIDED');
    expect(cloud).toBeDefined();
    expect(cloud!.kind === 'RAIDED' && cloud!.color).toBe(raider.color);
    expect(cloud!.kind === 'RAIDED' && cloud!.pos.x).toBe(123);
    expect(cloud!.kind === 'RAIDED' && cloud!.pos.y).toBe(456);
    expect(cloud!.kind === 'RAIDED' && cloud!.killed).toBe(true);
  });

  it('a raid that only DAMAGES still emits a cloud, flagged killed:false', () => {
    const world = makeWorld(2);
    world.players.get(RAIDER)!.raidPoints = 1;
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE', creatureType: 'voltkin', ownerPlayerId: asPlayerId(1),
      pos: { x: 10, y: 20 }, targetPos: { x: 10, y: 20 },
    });
    world.effects.length = 0;
    dispatch(world, {
      type: 'RAID_TARGET', target: { kind: 'creature', id: asCreatureId(0) }, playerId: RAIDER,
    });
    const cloud = world.effects.find((e) => e.kind === 'RAIDED');
    expect(cloud).toBeDefined();
    expect(cloud!.kind === 'RAIDED' && cloud!.killed).toBe(false);
  });

  it('a raid on a creature that no longer exists spends NOTHING', () => {
    const world = makeWorld(2);
    world.players.get(RAIDER)!.raidPoints = 2;
    dispatch(world, {
      type: 'RAID_TARGET', target: { kind: 'creature', id: asCreatureId(999) }, playerId: RAIDER,
    });
    expect(world.players.get(RAIDER)!.raidPoints).toBe(2);
  });
});
