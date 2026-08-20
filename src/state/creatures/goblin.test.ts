/**
 * SPARK — S139 P2: the GOBLIN (free starter melee unit, first STRUCTURE attacker).
 *
 * ## What this file is for, in priority order
 *
 * 1. **Pinning the two measured bugs that were fixed to make this possible.** `applySpawnCreature`
 *    ignored `action.creatureType` on the null-spawner path (so a goblin spawned a VOLTKIN), and its
 *    population gate was type-blind (so the goblin would have permanently blocked its owner's Voltkin
 *    summon). Neither was type-checkable and neither had any existing coverage, because 'voltkin' was
 *    the only value ever passed on that branch. Both now have failing-before/passing-after tests.
 * 2. **Replacing coverage this session deliberately removed.** The frozen-reference differential gate
 *    (`hostTick.differential.test.ts`) had goblins cleared from two fixtures, because
 *    `referenceHostTick` is a verbatim copy of the pre-S119 host tick and cannot contain a branch
 *    added later. The determinism obligation moved here, as a same-world double-run.
 * 3. **Real-physics acceptance, not state pokes.** The S136 standing lesson is that a state assertion
 *    is not evidence: the goblin must be shown closing distance and actually reducing a primitive's
 *    hp while the ACTUAL host tick runs. Note this is exactly the class of failure P1 uncovered — a
 *    subsystem that static-parses perfectly and is never reached.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { mulberry32 } from '../rng.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { findNearestEnemyPrimitiveFrom } from './creatureAI.ts';
import { applySpawnCreature } from './creatureLifecycle.ts';
import { CREATURE_CONFIGS, getCreatureConfig } from './voltkin-config.ts';
import { asPlayerId, asPrimitiveId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Controls } from '../../input/controls.ts';
import {
  GOBLIN_DAMAGE_VS_PRIMITIVE,
  GOBLIN_MELEE_HP,
  PRIMITIVE_MAX_HP,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SparkType,
} from '../../constants.ts';

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function deps(seed = 1): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(seed)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/** A 1v1 world in PLAYING with the starter grant already applied by START_GAME. */
function make1v1(): World {
  const w = makeWorld(0x9111);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  // ⭐ S149 P3 — PIN THE FIGHT PHASE. Creatures are now dormant outside FIGHT: during BUILD the
  // host tick does not fan out CREATURE_TICK at all, so a goblin neither closes on a target nor
  // dispatches CREATURE_ATTACK, and the acceptance test below ("closes on an enemy shape and
  // actually REDUCES its hp") measured a creature that was correctly doing nothing.
  //
  // ⚠ AN EQUIVALENCE STATEMENT, NOT A WORKAROUND — the same move the S119 differential gate makes
  // for scoring. `START_GAME` opens every match in BUILD (Q12), but the behaviour these tests
  // exercise is COMBAT, and the phase in which combat happens IS `FIGHT`. Pinning it is what makes
  // the fixture describe the situation the assertions are about. Laundering would be relaxing the
  // dormancy guard so the test passed in BUILD, which would put back the defect P2/P3 just closed.
  w.matchPhase = 'FIGHT';
  return w;
}

function addPrimAt(world: World, seat: 0 | 1, x: number, y: number, hp = PRIMITIVE_MAX_HP): Primitive {
  const player = world.players.get(asPlayerId(seat))!;
  const id = asPrimitiveId(world.nextPrimitiveId++);
  const prim: Primitive = {
    id,
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
    hp,
    origin: null,
  };
  world.primitives.set(id, prim);
  return prim;
}

function goblinsOf(world: World, seat: number) {
  return [...world.creatures.values()].filter(
    (c) => c.type === 'goblinMelee' && (c.ownerPlayerId as unknown as number) === seat,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
describe('S139 P2 — the two measured spawn bugs (both were silent and untyped)', () => {
  it('applySpawnCreature RESPECTS creatureType on the null-spawner path (was: always a Voltkin)', () => {
    const w = make1v1();
    w.creatures.clear();
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE',
      creatureType: 'goblinMelee',
      ownerPlayerId: asPlayerId(0),
      pos: { x: 100, y: 100 },
      targetPos: { x: 100, y: 100 },
      sourceSpawnerId: null,
    });
    const spawned = [...w.creatures.values()];
    expect(spawned).toHaveLength(1);
    // BEFORE THE FIX this was 'voltkin': the branch called makeVoltkinCreature unconditionally and
    // never read action.creatureType. tsc could not see it — the field was simply ignored.
    expect(spawned[0]!.type).toBe('goblinMelee');
  });

  it('the max-1-per-owner gate is TYPE-AWARE: a goblin does not block that player\'s Voltkin', () => {
    const w = make1v1();
    w.creatures.clear();
    const P0 = asPlayerId(0);
    const mk = (creatureType: 'goblinMelee' | 'voltkin') =>
      applySpawnCreature(w, {
        type: 'SPAWN_CREATURE',
        creatureType,
        ownerPlayerId: P0,
        pos: { x: 100, y: 100 },
        targetPos: { x: 100, y: 100 },
        sourceSpawnerId: null,
      });

    mk('goblinMelee');
    mk('voltkin');
    const types = [...w.creatures.values()].map((c) => c.type).sort();
    // BEFORE THE FIX the gate returned early on ANY null-spawner creature owned by this player, so
    // the Voltkin summon was silently swallowed for the rest of the match.
    expect(types).toEqual(['goblinMelee', 'voltkin']);
  });

  it('...but a SECOND goblin for the same owner is still refused (the invariant is preserved, not deleted)', () => {
    const w = make1v1();
    w.creatures.clear();
    const mk = () =>
      applySpawnCreature(w, {
        type: 'SPAWN_CREATURE',
        creatureType: 'goblinMelee',
        ownerPlayerId: asPlayerId(0),
        pos: { x: 100, y: 100 },
        targetPos: { x: 100, y: 100 },
        sourceSpawnerId: null,
      });
    mk();
    mk();
    expect(goblinsOf(w, 0)).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S139 P2 — findNearestEnemyPrimitiveFrom', () => {
  it('picks the NEAREST enemy shape and never the owner\'s own', () => {
    const w = make1v1();
    w.creatures.clear();
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: asPlayerId(0),
      pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 }, sourceSpawnerId: null,
    });
    const goblin = goblinsOf(w, 0)[0]!;

    addPrimAt(w, 0, 10, 0); // OWN shape, closest of all — must be ignored
    const nearEnemy = addPrimAt(w, 1, 60, 0);
    addPrimAt(w, 1, 400, 0); // farther enemy

    expect(findNearestEnemyPrimitiveFrom(w, goblin)).toBe(nearEnemy.id);
  });

  it('returns null when only own shapes exist — NO own-target fallback (the R8 lesson)', () => {
    const w = make1v1();
    w.creatures.clear();
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: asPlayerId(0),
      pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 }, sourceSpawnerId: null,
    });
    const goblin = goblinsOf(w, 0)[0]!;
    addPrimAt(w, 0, 10, 0);
    addPrimAt(w, 0, 20, 0);
    // Voltkin's `bestEnemyId ?? bestOwnId` fallback is a VOLTKIN feature. Inheriting it here would
    // have goblins demolish their own builder's structures whenever no enemy shape existed.
    expect(findNearestEnemyPrimitiveFrom(w, goblin)).toBeNull();
  });

  it('skips a shape already at hp <= 0, and tie-breaks on the LOWER PrimitiveId (determinism)', () => {
    const w = make1v1();
    w.creatures.clear();
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: asPlayerId(0),
      pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 }, sourceSpawnerId: null,
    });
    const goblin = goblinsOf(w, 0)[0]!;
    addPrimAt(w, 1, 50, 0, 0); // dead shape at the SAME distance — must be skipped
    const a = addPrimAt(w, 1, 50, 0);
    const b = addPrimAt(w, 1, 50, 0); // exact tie with `a`
    expect((b.id as unknown as number) > (a.id as unknown as number)).toBe(true);
    expect(findNearestEnemyPrimitiveFrom(w, goblin)).toBe(a.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S148 P2 — the starter grant is GONE: goblins come from the tower (R49)', () => {
  /**
   * ⛔ THIS DESCRIBE USED TO ASSERT THE OPPOSITE, AND THE INVERSION IS THE POINT.
   *
   * S139 granted every seated player one free `goblinMelee` at START_GAME, from the owner's spec of
   * the time ("each player starts with one goblin of every kind"). The tower-defence pivot supersedes
   * that: R18/R24 make goblins the OUTPUT of a goblin tower — feed it shapes from inventory, one
   * goblin per shape, the shape deciding which of six kinds. That tower is S153 and unbuilt, so until
   * it exists the correct number of goblins on an opening board is ZERO.
   *
   * The owner confirmed the reversal explicitly (R49) after a playtest where one starter goblin
   * destroyed a HELGA tower and a laser tower. These tests are kept and inverted rather than deleted,
   * so the absence is asserted rather than merely un-tested — if a future session re-adds a seeder,
   * this goes red instead of the design quietly regressing.
   */
  it('grants NO goblin to any seated player at START_GAME', () => {
    const w = make1v1();
    expect(w.players.size).toBe(2);
    expect(goblinsOf(w, 0)).toHaveLength(0);
    expect(goblinsOf(w, 1)).toHaveLength(0);
  });

  it('the opening board carries no creatures at all — castle, one gatherer, 100 points (R50)', () => {
    const w = make1v1();
    // The owner's words: "everyone should start with nothing but the castle and one gatherer".
    expect(w.creatures.size).toBe(0);
    expect(w.creatureSpawners.size).toBe(0);
    expect(w.defenders.size).toBe(0);
    // ...and the positive control, so this cannot pass on a world that failed to start.
    expect(w.gameState).toBe('PLAYING');
    expect(w.gatherers.size).toBe(2);
  });

  it('a re-applied START_GAME still mints nothing', () => {
    const w = make1v1();
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    expect(goblinsOf(w, 0)).toHaveLength(0);
    expect(goblinsOf(w, 1)).toHaveLength(0);
  });

  it('⭐ RUNS IDENTICALLY ON BOTH PEERS — the seed is not host-only', () => {
    // clientHandlers has the JOINER dispatch its OWN local START_GAME, so both peers mint these
    // units independently and must agree exactly. Two worlds built the same way must be
    // hash-identical; any RNG draw, wall-clock read or roster-size-derived geometry would break this.
    const a = makeWorld(0x9111);
    dispatch(a, { type: 'START_GAME', mode: '1v1', isHost: true });
    const b = makeWorld(0x9111);
    dispatch(b, { type: 'START_GAME', mode: '1v1', isHost: false }); // the JOINER's local dispatch
    expect(hashWorldStateFull(a)).toBe(hashWorldStateFull(b));
  });

  it('does not consume nextPrimitiveId or nextBondId (divergence there is PERMANENT)', () => {
    const fresh = makeWorld(0x9111);
    const beforePrim = fresh.nextPrimitiveId;
    const beforeBond = fresh.nextBondId;
    dispatch(fresh, { type: 'START_GAME', mode: '1v1', isHost: true });
    // A tower-style grant would have consumed these; the id allocators do NOT self-correct at the
    // next snapshot, so a joiner that spent them differently stays wrong for the whole match.
    expect(fresh.nextPrimitiveId).toBe(beforePrim);
    expect(fresh.nextBondId).toBe(beforeBond);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S139 P2 — config + the owner\'s "6 attacks" rule', () => {
  it('is registered in the exhaustive CREATURE_CONFIGS table', () => {
    expect(CREATURE_CONFIGS.goblinMelee).toBeDefined();
    expect(CREATURE_CONFIGS.goblinMelee.type).toBe('goblinMelee');
  });

  it('takes the VOLTKIN cadence path, not the chew path (chewHits === 0)', () => {
    // A.0b: the chew branch handles ONLY bonds and bounces out of ATTACKING when targetBondId is
    // null, so a chewHits>0 goblin would never reach its attackFireTick.
    expect(getCreatureConfig('goblinMelee').chewHits).toBe(0);
  });

  it('SIX strikes fell a full-hp shape, and five do NOT (the owner\'s rule, both directions)', () => {
    expect(GOBLIN_DAMAGE_VS_PRIMITIVE * 5).toBeLessThan(PRIMITIVE_MAX_HP);
    expect(GOBLIN_DAMAGE_VS_PRIMITIVE * 6).toBeGreaterThanOrEqual(PRIMITIVE_MAX_HP);
    // 166 would have given 996 after six — silently making the rule SEVEN attacks.
    expect(Number.isInteger(GOBLIN_DAMAGE_VS_PRIMITIVE)).toBe(true);
  });

  it('SIX single-target hits fell a goblin (the same rule on the creature hp scale)', () => {
    expect(GOBLIN_MELEE_HP).toBe(6);
    expect(getCreatureConfig('goblinMelee').hp).toBe(GOBLIN_MELEE_HP);
  });

  it('is exempt from the canvas-centre repulse, like the chewer', async () => {
    // Keyed on the CONFIG flag, not on provenance: the goblin is granted with
    // sourceSpawnerId === null, so on the provenance test alone it would inherit Voltkin's phantom
    // ~300 px push and be unable to close on any shape near the middle of the board.
    const { computeSteeringAccel } = await import('../../physics/creatureVerlet.ts');
    const w = make1v1();
    // S148 P2 — spawned EXPLICITLY. This used to read the free starter goblin off the opening board;
    // that grant is gone (R49), so the unit under test is minted here instead. Note the property
    // being tested is unchanged and still worth pinning: the exemption is keyed on the CONFIG flag,
    // not on provenance, so it must hold for a tower-minted goblin exactly as it did for a seeded one.
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE',
      creatureType: 'goblinMelee',
      ownerPlayerId: asPlayerId(0),
      pos: { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y },
      targetPos: { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y },
      sourceSpawnerId: null,
    });
    const goblin = goblinsOf(w, 0)[0]!;
    goblin.state = 'SEEKING';
    // Sit it exactly at the repulse origin with its target THERE too: any non-zero accel here can
    // only be the repulse, since the arrive force is zero at zero distance.
    goblin.pos = { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y };
    goblin.targetPos = { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y };
    const accel = computeSteeringAccel(goblin, 0);
    expect(Math.hypot(accel.x, accel.y)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S139 P2 — REAL-PHYSICS acceptance (the actual host tick, not state pokes)', () => {
  it('⭐ closes on an enemy shape and actually REDUCES its hp', () => {
    const w = make1v1();
    // Isolate: only seat 0's goblin, only one enemy shape, no spawner clutter in the way.
    w.creatures.clear();
    const goblin = (() => {
      applySpawnCreature(w, {
        type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: asPlayerId(0),
        pos: { x: 500, y: 500 }, targetPos: { x: 500, y: 500 }, sourceSpawnerId: null,
      });
      return goblinsOf(w, 0)[0]!;
    })();
    const victim = addPrimAt(w, 1, 620, 500);
    const startDist = Math.hypot(victim.pos.x - goblin.pos.x, victim.pos.y - goblin.pos.y);

    const d = deps();
    const st = makeHostTickState(w);
    // Long enough to cover SPAWNING (30) + travel + a windup + at least one fire tick.
    for (let t = 0; t < 400; t++) runHostTick(w, d, st);

    const live = w.creatures.get(goblin.id);
    expect(live, 'the goblin should still be alive').toBeDefined();
    const endDist = Math.hypot(victim.pos.x - live!.pos.x, victim.pos.y - live!.pos.y);
    // (a) it MOVED toward the shape — real Verlet integration, not a teleport
    expect(endDist).toBeLessThan(startDist);
    // (b) and the shape genuinely took damage. This is the assertion that would have caught P1's
    // dead dispatcher: it proves the damage path is REACHED, not merely present.
    const after = w.primitives.get(victim.id);
    if (after !== undefined) {
      expect(after.hp).toBeLessThan(PRIMITIVE_MAX_HP);
    } // else it was destroyed outright, which is a stronger pass
  });

  it('⭐ is DETERMINISTIC: two identical runs agree on hashWorldStateFull', () => {
    // This is the coverage that moved here when goblins were removed from the frozen-reference
    // differential fixtures. A frozen reference cannot describe a branch added after it was frozen;
    // a same-world double-run can, and it is the property that actually matters for host/mirror
    // agreement.
    const build = (): World => {
      const w = make1v1();
      addPrimAt(w, 1, 620, 500);
      addPrimAt(w, 1, 300, 240);
      return w;
    };
    const a = build();
    const b = build();
    const da = deps(7);
    const db = deps(7);
    const sa = makeHostTickState(a);
    const sb = makeHostTickState(b);
    for (let t = 0; t < 200; t++) {
      runHostTick(a, da, sa);
      runHostTick(b, db, sb);
      expect(hashWorldStateFull(a), `divergence at tick ${t}`).toBe(hashWorldStateFull(b));
    }
  });
});
