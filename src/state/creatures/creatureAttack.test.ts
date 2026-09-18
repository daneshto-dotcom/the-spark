/**
 * SPARK — creature attack reducer tests (S27 P0). Pure reducer tests for
 * applyCreatureAttack, exercising the central severance path (Council R1 Q1
 * UNANIMOUS B: re-dispatch SEVER_BOND{cause:'creature'}) + ARC_FLASH emit +
 * defense-in-depth guards.
 *
 * Coverage:
 *   - Severs the target bond (canSeverBond 'creature' bypass; no charge cost)
 *   - Emits BOND_SEVERED with cause='creature' (audio routing — Q4 silent S27)
 *   - Emits ARC_FLASH visual with start/end at creature.pos / bond midpoint
 *   - Emits SEVER_ERASE per loser primitive (cascade reuse — same path)
 *   - No-op when creature is missing (race: peer-drop mid-attack)
 *   - No-op when creature is in wrong state (defense vs orchestration bug)
 *   - No-op when target bond is missing (race: bond severed by physics
 *     overstretch or another creature between target-select + attack-fire)
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLAYER_COLORS, SparkType, PRIMITIVE_MAX_HP } from '../../constants.ts';
import {
  asBondId,
  asPlayerId,
  asPrimitiveId,
  asSpawnerId,
  type BondId,
} from '../../types.ts';
import type { Bond } from '../../physics/bonds.ts';
import type { Primitive } from '../../game/primitive.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { makeWorld, type World } from '../world.ts';
import { applyCreatureAttack } from './creatureAttack.ts';
import { asCreatureId, makeCreature, makeVoltkinCreature, type Creature } from './creature.ts';
import { CHEWER_CONFIG, getCreatureConfig } from './voltkin-config.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const COLOR_P0 = PLAYER_COLORS[0];
const COLOR_P1 = PLAYER_COLORS[1];

function makePrim(id: number, placerColor: number, x: number, y: number): Primitive {
  return {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor,
    placedBy: P0,
    createdTick: 0,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: placerColor,
    lastOwnershipChange: 0,
    radius: 8,
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
}

function makeBond(id: number, a: Primitive, b: Primitive): Bond {
  return {
    id: asBondId(id),
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength: 32,
    stiffnessTier: 'MID',
    damageFifths: 0,
    createdTick: 0,
  };
}

function setupWorld(): {
  world: World;
  creature: Creature;
  bondId: BondId;
  primA: Primitive;
  primB: Primitive;
} {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, COLOR_P0));
  w.players.set(P1, makeIdlePlayer(P1, COLOR_P1));

  // Enemy bond at known midpoint (10, 0).
  const primA = makePrim(1, COLOR_P1, 0, 0);
  const primB = makePrim(2, COLOR_P1, 20, 0);
  w.primitives.set(primA.id, primA);
  w.primitives.set(primB.id, primB);
  const bond = makeBond(1, primA, primB);
  w.bonds.set(bond.id, bond);
  primA.bonds.add(bond.id);
  primB.bonds.add(bond.id);

  // Creature at known location with state preset to ATTACKING (main.ts orchestration
  // invariant; applyCreatureAttack's defense-in-depth re-checks the state).
  const creature = makeVoltkinCreature({
    id: asCreatureId(0),
    ownerPlayerId: P0,
    pos: { x: 50, y: 30 },
    targetPos: { x: 10, y: 0 },
    spawnedAtTick: 0,
  });
  creature.state = 'ATTACKING';
  creature.targetBondId = bond.id;
  w.creatures.set(creature.id, creature);

  return { world: w, creature, bondId: bond.id, primA, primB };
}

describe('applyCreatureAttack — happy path', () => {
  it('severs the target bond via SEVER_BOND{cause:creature} (canSeverBond bypass)', () => {
    const { world, creature, bondId } = setupWorld();
    expect(world.bonds.has(bondId)).toBe(true);
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    expect(world.bonds.has(bondId)).toBe(false);
  });

  it('S36 P3 — increments creature.killCount on successful sever', () => {
    const { world, creature, bondId } = setupWorld();
    expect(creature.killCount).toBe(0); // factory init
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    expect(creature.killCount).toBe(1); // post-sever increment
  });

  it("emits BOND_SEVERED audio event with cause='creature' (Council Q4 silent routing)", () => {
    const { world, creature, bondId } = setupWorld();
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    const bondSevered = world.effects.find((e) => e.kind === 'BOND_SEVERED');
    expect(bondSevered).toBeDefined();
    if (bondSevered && bondSevered.kind === 'BOND_SEVERED') {
      expect(bondSevered.cause).toBe('creature');
    }
  });

  it('emits ARC_FLASH visual with start=creature.pos and end=bond midpoint', () => {
    const { world, creature, bondId } = setupWorld();
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    const arc = world.effects.find((e) => e.kind === 'ARC_FLASH');
    expect(arc).toBeDefined();
    if (arc && arc.kind === 'ARC_FLASH') {
      expect(arc.start).toEqual({ x: 50, y: 30 }); // creature pre-mutation
      expect(arc.end).toEqual({ x: 10, y: 0 }); // bond midpoint (primA+primB)/2
    }
  });

  it('emits SEVER_ERASE effects via the canonical SEVER_BOND code path (cascade reuse)', () => {
    const { world, creature, bondId } = setupWorld();
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    // Two-prim chain: severing the lone bond drops the SMALLER side (single-prim
    // limb) per §VIII.4 sever rule. severSplit returns split.del.size = 1 → one
    // SEVER_ERASE effect (the loser prim).
    const severs = world.effects.filter((e) => e.kind === 'SEVER_ERASE');
    // S34 PB-9 — tightened from `>=1` weak assertion to exact count. The
    // §VIII.4 sever rule says a two-prim chain sever drops the SMALLER side
    // ⭐ S157 B2 — now TWO: the losing limb, plus the shape it left holding nothing. Both are real
    // removals and both draw the erase flourish, which is what the effect is for.
    // (single-prim limb) → split.del.size = 1 → one SEVER_ERASE for it, and one for the shape it
    // left bond-less. Exact count still catches mutations that produce 0 or 3+ (logic regression).
    expect(severs).toHaveLength(2);
  });
});

describe('applyCreatureAttack — chewer gnaw vs Voltkin lightning (S102 #2)', () => {
  // Same enemy bond (midpoint 10,0) but the attacker is a CHEWER, not a Voltkin.
  function setupChewer(): { world: World; creature: Creature; bondId: BondId } {
    const base = setupWorld();
    base.world.creatures.clear();
    const chewer = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(0), ownerPlayerId: P0,
      // ⭐ S177 P9 — was (50,30): 50 px from the bond midpoint (10,0) with a 35 px chewer reach,
      // i.e. biting from outside its own arm. The test is about the GNAW cause, not the distance.
      pos: { x: 20, y: 0 }, targetPos: { x: 10, y: 0 },
      spawnedAtTick: 0, sourceSpawnerId: asSpawnerId(1),
    });
    chewer.state = 'ATTACKING';
    chewer.targetBondId = base.bondId;
    base.world.creatures.set(chewer.id, chewer);
    return { world: base.world, creature: chewer, bondId: base.bondId };
  }

  it("a chewer's final bite severs with cause='chewer' (a GNAW), NOT 'creature' (lightning)", () => {
    const { world, creature, bondId } = setupChewer();
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    expect(world.bonds.has(bondId)).toBe(false); // still severs
    const bondSevered = world.effects.find((e) => e.kind === 'BOND_SEVERED');
    expect(bondSevered).toBeDefined();
    if (bondSevered && bondSevered.kind === 'BOND_SEVERED') {
      expect(bondSevered.cause).toBe('chewer'); // gnaw audio routing, not lightning-crackle
    }
  });

  it('a chewer emits NO ARC_FLASH (no lightning visual, no creature-attack screen-shake)', () => {
    const { world, creature, bondId } = setupChewer();
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    expect(world.effects.find((e) => e.kind === 'ARC_FLASH')).toBeUndefined();
  });

  /**
   * ⭐⭐⭐ S177 P9 (owner) — NOTHING SWINGS AT NOTHING.
   *
   * *"They shouldn't swing at nothing. Enemies should swing at each other or at buildings or at
   * anything only when they reach it. And they have acquired the target ... I'm in range. I stop.
   * I'm ready for my attack. There shouldn't be pretending to attack and not hitting anything."*
   */
  it('⛔ a chewer OUT of reach does not sever the connector it is committed to', () => {
    const { world, creature, bondId } = setupChewer();
    // Bond midpoint is (10,0); a chewer reaches 35. Put it well outside that.
    creature.pos = { x: 400, y: 400 };
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    expect(world.bonds.has(bondId), 'a connector cannot be cut from across the board').toBe(true);
    expect(world.effects.find((e) => e.kind === 'BOND_SEVERED')).toBeUndefined();
  });

  /**
   * ⭐⭐ THE MIME, KILLED AT ITS SOURCE. `creatureLifecycle`'s `primitiveValid` asks only whether the
   * shape still EXISTS, so before this a creature whose target drifted out of reach stayed in
   * ATTACKING for ever — full animation, full cadence, zero damage, and no path back to SEEKING
   * because the commitment never lapsed. Releasing it is what lets the creature walk back in.
   */
  it('⭐⭐ out of reach of its committed SHAPE it RELEASES it instead of miming a swing', () => {
    // ⚠ A STRUCTURE-ATTACKER, not the chewer: the shape arm is gated on `targetsStructures`, and a
    // chewer cuts connectors rather than shapes — it never reaches this branch at all.
    const { world } = setupChewer();
    world.creatures.clear();
    const g = makeCreature(getCreatureConfig('goblinMelee'), {
      id: asCreatureId(7), ownerPlayerId: asPlayerId(0),
      pos: { x: 900, y: 900 }, targetPos: { x: 900, y: 900 },
      spawnedAtTick: 0, sourceSpawnerId: null,
    });
    g.state = 'ATTACKING';
    world.creatures.set(g.id, g);
    const prim = [...world.primitives.values()][0]!;
    const hpBefore = prim.hp;
    g.targetPrimitiveId = prim.id;
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: g.id, bondId: null });
    expect(prim.hp, 'no damage from out of reach').toBe(hpBefore);
    expect(g.targetPrimitiveId, 'the commitment is RELEASED so it re-seeks and walks in').toBeNull();
  });

});

/**
 * ⛔⛔ S182 — THE ARC IS VOLTKIN'S SIGNATURE, AND ONLY VOLTKIN'S.
 *
 * Owner: *"Why does my fucking zombie boss have Voltkin music and electric beams going through
 * towers and connectors? How does that make sense?"*
 *
 * The bond-strike arm gated its ARC_FLASH on `!isChewer`, which meant "is the Voltkin" only while
 * Voltkin and the chewer were the sole creatures that could reach a connector. S181's targeting
 * rework gave `targetBondId` to every `targetsStructures` creature — 21 unit types and all six
 * tier-9 bosses — and every one of them started firing the Voltkin's cyan bolt, plus the screen
 * shake `main.ts` derives from it.
 *
 * ⚠ THESE ARE BEHAVIOUR TESTS AND THEY ARE NOT SUFFICIENT ON THEIR OWN. The failure mode of this
 * bug class is a predicate that is still TRUE for the wrong set, so `s181Regressions.test.ts` R9
 * carries the source-text tripwire that the guard NAMES the type instead of negating another one.
 * Both halves, or a future negation passes these while re-breaking the game.
 */
describe('S182 — only the VOLTKIN emits ARC_FLASH on a bond strike', () => {
  /** The same enemy bond as `setupWorld` (midpoint 10,0), struck by an arbitrary creature type. */
  function strikeWith(type: Parameters<typeof getCreatureConfig>[0]): World {
    const base = setupWorld();
    base.world.creatures.clear();
    const c = makeCreature(getCreatureConfig(type), {
      id: asCreatureId(0), ownerPlayerId: P0,
      // ON the bond midpoint, so no unit's attackRange can decide this test for it.
      pos: { x: 10, y: 0 }, targetPos: { x: 10, y: 0 },
      spawnedAtTick: 0, sourceSpawnerId: null,
    });
    c.state = 'ATTACKING';
    c.targetBondId = base.bondId;
    base.world.creatures.set(c.id, c);
    applyCreatureAttack(base.world, {
      type: 'CREATURE_ATTACK', creatureId: c.id, bondId: base.bondId,
    });
    // Every type below out-damages a lone connector's 6-fifth pool, so the sever arm IS reached —
    // which is the whole point: reaching it without emitting is the fix.
    expect(base.world.bonds.has(base.bondId), `${type} must actually sever, or the test proves nothing`).toBe(false);
    return base.world;
  }

  it('⛔ the ZOMBIE BOSS — the owner\'s own bug report — draws NO lightning', () => {
    const w = strikeWith('t9BossZombies');
    expect(w.effects.find((e) => e.kind === 'ARC_FLASH')).toBeUndefined();
  });

  /**
   * ⛔ S182 — THIS TEST USED TO BE A DUPLICATE WEARING A SECOND HAT, and the owner caught it.
   *
   * It asserted `filter(ARC_FLASH).toHaveLength(0)` on the very same world the test above already
   * checked with `find(ARC_FLASH).toBeUndefined()`. Two spellings of one fact: it could not fail
   * unless its neighbour failed too, so it added coverage of nothing while LOOKING like a second
   * guard for a second symptom. That is worse than no test — it is a false entry in the ledger.
   *
   * ⭐ THE SHAKE IS A CLAIM ABOUT `main.ts`, SO IT IS ASSERTED AGAINST `main.ts`. The reducer cannot
   * observe a shake at all — the renderer derives it by scanning `world.effects` for an ARC_FLASH
   * newer than its cursor. So the honest guard is the IMPLICATION: no ARC_FLASH emitted => no shake
   * triggered. Pin the linkage here, and the behaviour test above (no ARC_FLASH for a boss) then
   * genuinely carries the shake conclusion. This fails on its own the day someone gives the shake a
   * second trigger, which is exactly when the claim above would quietly stop being true.
   */
  it('⛔ and no screen shake — the CREATURE shake has exactly two feeds, both ARC_FLASH', () => {
    /*
     * ⚠ THIS ASSERTION WAS OVER-BROAD ON ITS FIRST CUT AND FAILED HONESTLY, which is the point of
     * writing it against the real file. It demanded that EVERY `screenShake.trigger` be fed by an
     * ARC_FLASH scan; `main.ts` has a THIRD, the Nonet sudoku resolve jolt, which is a different
     * mechanic entirely. The claim that survives is narrower and is the one the boss test needs:
     * the creature-attack shake has exactly the two ARC_FLASH cursors (host + client), and NOTHING
     * routes a shake off a BOND_SEVERED — so no-arc really does mean no-shake for a creature.
     */
    const main = readFileSync('src/main.ts', 'utf-8');
    const triggers = [...main.matchAll(/screenShake\.trigger\(/g)];
    const feeds = triggers.map((m) =>
      main.slice(Math.max(0, (m.index ?? 0) - 600), m.index ?? 0));
    const arcFed = feeds.filter((f) => f.includes("kind === 'ARC_FLASH'"));
    expect(arcFed.length, 'the host cursor and the client cursor').toBe(2);
    // ⛔ AND NO SECOND ROUTE FOR A CREATURE SEVER. If someone ever shakes off BOND_SEVERED, the
    // boss test above would silently stop covering the shake — this is what keeps it honest.
    for (const f of feeds) {
      expect(f, 'a shake must never be driven by a sever cause').not.toContain("kind === 'BOND_SEVERED'");
    }
  });

  it('a GOBLIN draws no lightning (21 unit types reach this arm since S181)', () => {
    const w = strikeWith('goblinMelee');
    expect(w.effects.find((e) => e.kind === 'ARC_FLASH')).toBeUndefined();
  });

  it('⭐ every one of the six tier-9 bosses is silent', () => {
    for (const boss of [
      't9BossVampires', 't9BossNagas', 't9BossMummies',
      't9BossZombies', 't9BossOrcs', 't9BossDemons',
    ] as const) {
      const w = strikeWith(boss);
      expect(w.effects.find((e) => e.kind === 'ARC_FLASH'), `${boss} must not zap`).toBeUndefined();
    }
  });

  /**
   * ⛔⛔ THE OTHER HALF OF HIS REPORT — *"Voltkin MUSIC and electric beams"*. The beams were the
   * ARC_FLASH above. The music is this: `audioManager` routes `BOND_SEVERED{cause:'creature'}` to
   * `lightning-crackle.ogg` with a 700 ms music duck, and EVERY non-chewer creature used to sever
   * with that cause. Fixing only the arc would have left him still hearing the Voltkin.
   *
   * ⚠ THE BRIEF ASKED FOR THIS PAIR EXPLICITLY (*"the same pair for the audio cause"*) and the
   * first cut of this file shipped without it, so the suite was green while the reported symptom
   * was live. That is the failure mode this whole file exists to prevent.
   */
  it('⛔ the ZOMBIE BOSS severs as `unit` — NOT the cause that plays lightning-crackle', () => {
    const w = strikeWith('t9BossZombies');
    const sev = w.effects.find((e) => e.kind === 'BOND_SEVERED');
    expect(sev).toBeDefined();
    if (sev && sev.kind === 'BOND_SEVERED') expect(sev.cause).toBe('unit');
  });

  it('a GOBLIN severs as `unit` too — 21 unit types reach this arm since S181', () => {
    const w = strikeWith('goblinMelee');
    const sev = w.effects.find((e) => e.kind === 'BOND_SEVERED');
    if (sev && sev.kind === 'BOND_SEVERED') expect(sev.cause).toBe('unit');
  });

  it('⭐ and the VOLTKIN keeps `creature` — the crackle is its signature, not a catch-all', () => {
    const w = strikeWith('voltkin');
    const sev = w.effects.find((e) => e.kind === 'BOND_SEVERED');
    expect(sev).toBeDefined();
    if (sev && sev.kind === 'BOND_SEVERED') expect(sev.cause).toBe('creature');
  });

  it('⭐ AND THE VOLTKIN STILL DOES — the fix removes a leak, not the mechanic', () => {
    const w = strikeWith('voltkin');
    const arc = w.effects.find((e) => e.kind === 'ARC_FLASH');
    expect(arc, 'the arc IS Voltkin\'s signature and must survive').toBeDefined();
  });
});

describe('applyCreatureAttack — defense-in-depth guards', () => {
  it('no-op when creature is missing from world.creatures (race: peer-drop)', () => {
    const { world, bondId } = setupWorld();
    world.creatures.clear();
    const effectsBefore = world.effects.length;
    expect(() =>
      applyCreatureAttack(world, {
        type: 'CREATURE_ATTACK',
        creatureId: asCreatureId(999),
        bondId,
      }),
    ).not.toThrow();
    expect(world.bonds.has(bondId)).toBe(true); // bond survives
    expect(world.effects.length).toBe(effectsBefore); // no effects emitted
  });

  it('no-op when creature is in wrong state (e.g. main.ts orchestration drift)', () => {
    const { world, creature, bondId } = setupWorld();
    creature.state = 'SEEKING'; // not ATTACKING
    const effectsBefore = world.effects.length;
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    expect(world.bonds.has(bondId)).toBe(true);
    expect(world.effects.length).toBe(effectsBefore);
  });

  it('S36 P3 — does NOT increment killCount when target bond missing (race)', () => {
    const { world, creature, bondId } = setupWorld();
    world.bonds.delete(bondId); // simulate concurrent severance
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    expect(creature.killCount).toBe(0); // no kill counted — bond was already gone
  });

  it('no-op when target bond is missing (race: severed by physics or another actor)', () => {
    const { world, creature, bondId } = setupWorld();
    world.bonds.delete(bondId); // simulate concurrent severance
    const effectsBefore = world.effects.length;
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    expect(world.effects.length).toBe(effectsBefore); // no ARC_FLASH on empty target
  });
});

