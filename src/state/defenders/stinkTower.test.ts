/**
 * SPARK — S141 P1 STINK TOWER behaviour tests.
 *
 * Three of these exist because a Council seat or the A.0 sweep predicted the exact failure:
 *
 *  - **BOTH KILL PATHS.** The S139 Council's decisive finding was that the recipe-break poll — not
 *    `damageEntity` — is how a tower most often actually dies, so a death blast wired into only one
 *    path would essentially never fire. Each path is asserted separately; a test that covered only
 *    the damage path is the precise false-green that was predicted.
 *  - **DECONSTRUCTION MUST NOT DETONATE.** This is the interaction neither seat found and it is the
 *    severe one: the recipe is easy to build by accident, an accidental tower self-removes when the
 *    player keeps building, and without the anchor-gone discriminator that removal would blast the
 *    player's own structure.
 *  - **THE `applyRadialClear` TRAP.** That helper DELETES primitives instead of damaging them. A test
 *    that a full-health primitive SURVIVES a blast is what proves the new bridge is not it.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, type World } from '../world.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import {
  PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType,
  STINK_BAG_DAMAGE, STINK_DEATH_BLAST_BASE_DAMAGE, STINK_DEATH_BLAST_BASE_RADIUS,
  STINK_DEATH_BLAST_PER_BAG_DAMAGE, STINK_DEATH_BLAST_PER_BAG_RADIUS, STINK_TOWER_BAGS,
} from '../../constants.ts';
import { asDefenderId, asPlayerId, asPrimitiveId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import { applyRadialDamage, destroyDefender } from '../damage.ts';
import { applyDefenderTick, applyRemoveDefender, applyRegisterDefender, teardownDefenders } from './defenderLifecycle.ts';
import { getDefenderConfig, makeDefender, type Defender } from './defender.ts';
import { stinkBlastFor, stinkShardDir, stinkIsDepleted } from './stinkTower.ts';
import { snapshot, restore } from '../save.ts';
import { determinismParts } from '../stateHashFull.ts';
import { STINK_HUB_TYPE } from '../godlyRecipes/stinkTower.ts';

import { attackFifths } from '../stats.ts';
import { STINK_BAG_ATK, STINK_BAG_PEN } from '../../constants.ts';
/** S151 P2 — the unit-side half of a splash, on the stat ladder. */
const UNIT_SPLASH = attackFifths(STINK_BAG_ATK, STINK_BAG_PEN);
const P0 = asPlayerId(0); // the tower's owner
const P1 = asPlayerId(1); // the enemy

function setup(): World {
  const w = makeWorld(0);
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]));
  return w;
}

let nextPrim = 100;
function addPrim(w: World, owner = P1, x = 300, y = 300, type = SparkType.Circle): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(nextPrim++), type,
    placerColor: PLAYER_COLORS[owner as unknown as number], placedBy: owner,
    createdTick: 0, pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: PLAYER_COLORS[owner as unknown as number], lastOwnershipChange: 0,
    radius: 8, hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  w.primitives.set(p.id, p);
  return p;
}

/** A live stink tower anchored on a real Square primitive at (x, y). */
function addTower(w: World, x = 300, y = 300, bags = STINK_TOWER_BAGS): Defender {
  const anchor = addPrim(w, P0, x, y, STINK_HUB_TYPE);
  const d = makeDefender({
    id: asDefenderId(w.nextDefenderId++), kind: 'stinkTower', ownerPlayerId: P0,
    anchorPrimitiveId: anchor.id, recipeId: 'stinkTower', pos: { x, y }, registeredAtTick: 0,
  });
  d.bagsRemaining = bags;
  w.defenders.set(d.id, d);
  return d;
}

describe('S141 P1 — the death blast scales with the unthrown magazine', () => {
  it('is linear in bags and clamped at both ends', () => {
    for (let n = 0; n <= STINK_TOWER_BAGS; n++) {
      const { damage, radius } = stinkBlastFor(n);
      expect(damage).toBe(STINK_DEATH_BLAST_BASE_DAMAGE + n * STINK_DEATH_BLAST_PER_BAG_DAMAGE);
      expect(radius).toBe(STINK_DEATH_BLAST_BASE_RADIUS + n * STINK_DEATH_BLAST_PER_BAG_RADIUS);
    }
    // Clamped: a corrupt count can never produce an unbounded blast.
    expect(stinkBlastFor(-5)).toEqual(stinkBlastFor(0));
    expect(stinkBlastFor(999)).toEqual(stinkBlastFor(STINK_TOWER_BAGS));
  });

  it('a full tower blasts strictly harder and wider than a spent one (the tactical read)', () => {
    const full = stinkBlastFor(STINK_TOWER_BAGS);
    const spent = stinkBlastFor(0);
    expect(full.damage).toBeGreaterThan(spent.damage);
    expect(full.radius).toBeGreaterThan(spent.radius);
  });

  it('every blast damage value is an INTEGER (damageEntity throws on a fraction)', () => {
    for (let n = 0; n <= STINK_TOWER_BAGS; n++) {
      expect(Number.isInteger(stinkBlastFor(n).damage)).toBe(true);
    }
  });

  it('shard directions are deterministic, unit-length, and differ per index', () => {
    const a = stinkShardDir(3, 120, 0);
    const b = stinkShardDir(3, 120, 0);
    expect(a).toEqual(b); // same inputs → same output, on host and mirror alike
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(1, 10);
    expect(stinkShardDir(3, 120, 1)).not.toEqual(a);
    expect(stinkShardDir(4, 120, 0)).not.toEqual(a); // keyed on the defender too
  });
});

describe('S141 P1 — applyRadialDamage is NOT applyRadialClear', () => {
  it('⭐ a full-health primitive in radius SURVIVES (it is damaged, not erased)', () => {
    // This is the whole reason the bridge exists. applyRadialClear would have razed this shape.
    const w = setup();
    const victim = addPrim(w, P1, 300, 300);
    applyRadialDamage(w, 300, 300, 200, STINK_BAG_DAMAGE, UNIT_SPLASH, 'hazard', P0);
    expect(w.primitives.has(victim.id)).toBe(true);
    expect(victim.hp).toBe(PRIMITIVE_MAX_HP - STINK_BAG_DAMAGE);
  });

  it('spares everything the blast owner owns, and hits everything they do not', () => {
    const w = setup();
    const mine = addPrim(w, P0, 300, 300);
    const theirs = addPrim(w, P1, 305, 300);
    applyRadialDamage(w, 300, 300, 200, STINK_BAG_DAMAGE, UNIT_SPLASH, 'hazard', P0);
    expect(mine.hp).toBe(PRIMITIVE_MAX_HP); // untouched
    expect(theirs.hp).toBe(PRIMITIVE_MAX_HP - STINK_BAG_DAMAGE);
  });

  it('respects the radius (a shape outside is untouched)', () => {
    const w = setup();
    const near = addPrim(w, P1, 300, 300);
    const far = addPrim(w, P1, 900, 900);
    applyRadialDamage(w, 300, 300, 100, STINK_BAG_DAMAGE, UNIT_SPLASH, 'hazard', P0);
    expect(near.hp).toBeLessThan(PRIMITIVE_MAX_HP);
    expect(far.hp).toBe(PRIMITIVE_MAX_HP);
  });

  it('enough applications DO kill — damage accumulates rather than being cosmetic', () => {
    const w = setup();
    const victim = addPrim(w, P1, 300, 300);
    const hits = Math.ceil(PRIMITIVE_MAX_HP / STINK_BAG_DAMAGE);
    for (let i = 0; i < hits; i++) applyRadialDamage(w, 300, 300, 200, STINK_BAG_DAMAGE, UNIT_SPLASH, 'hazard', P0);
    expect(w.primitives.has(victim.id)).toBe(false);
  });
});

describe('S141 P1 — the blast fires from BOTH kill paths, and NOT from deconstruction', () => {
  /**
   * ⭐ S151 P2 (owner R75) — PATH A WAS "DEATH BY DAMAGE", AND THAT PATH NO LONGER EXISTS.
   * A tower has no hit points to subtract: *"towers have attack and piercing but not def and hp
   * because they are based on the connectors that build them."* So the only way a tower dies is that
   * its structure comes apart — which is PATH B, and which was always the likelier path anyway (the
   * S139 Council said so explicitly). What this test now guards is that the blast still fires when a
   * tower dies with its ANCHOR already destroyed, via `destroyDefender` directly.
   */
  it('PATH A — a tower destroyed with its anchor already gone still detonates', () => {
    const w = setup();
    const tower = addTower(w, 300, 300);
    const victim = addPrim(w, P1, 320, 300);
    w.primitives.delete(tower.anchorPrimitiveId); // the connectors gave way and took the keystone
    destroyDefender(w, tower);
    expect(w.defenders.has(tower.id)).toBe(false);
    expect(victim.hp).toBeLessThan(PRIMITIVE_MAX_HP); // it blew up
  });

  it('PATH B — the recipe-break poll with a DEAD anchor detonates (the path S139 said would be missed)', () => {
    const w = setup();
    const tower = addTower(w, 300, 300);
    const victim = addPrim(w, P1, 320, 300);
    // Simulate what the poll sees after something razed the anchor.
    w.primitives.delete(tower.anchorPrimitiveId);
    applyRemoveDefender(w, { type: 'REMOVE_DEFENDER', defenderId: tower.id });
    expect(w.defenders.has(tower.id)).toBe(false);
    expect(victim.hp).toBeLessThan(PRIMITIVE_MAX_HP);
  });

  it('⭐ PATH C — DECONSTRUCTION (anchor still standing) does NOT detonate', () => {
    // The severe interaction: an accidental tower removes itself the moment the player bonds a
    // fourth shape on. Without this rule, continuing your own build would blast your own structure.
    const w = setup();
    const tower = addTower(w, 300, 300);
    const bystander = addPrim(w, P1, 320, 300);
    expect(w.primitives.has(tower.anchorPrimitiveId)).toBe(true); // anchor alive = reshaped, not killed
    applyRemoveDefender(w, { type: 'REMOVE_DEFENDER', defenderId: tower.id });
    expect(w.defenders.has(tower.id)).toBe(false); // still removed…
    expect(bystander.hp).toBe(PRIMITIVE_MAX_HP); // …but nothing exploded
    expect(w.primitives.has(tower.anchorPrimitiveId)).toBe(true); // and the anchor was NOT razed
  });

  it('TEARDOWN is silent — a reset is not a death', () => {
    const w = setup();
    addTower(w, 300, 300);
    const bystander = addPrim(w, P1, 320, 300);
    teardownDefenders(w);
    expect(w.defenders.size).toBe(0);
    expect(bystander.hp).toBe(PRIMITIVE_MAX_HP);
    expect(w.nextDefenderId).toBe(0);
  });

  it('is structurally idempotent — a second destroy cannot double-blast', () => {
    const w = setup();
    const tower = addTower(w, 300, 300);
    w.primitives.delete(tower.anchorPrimitiveId);
    const victim = addPrim(w, P1, 320, 300);
    destroyDefender(w, tower);
    const afterFirst = victim.hp;
    // A second call for a defender no longer in the map must find nothing to do.
    applyRemoveDefender(w, { type: 'REMOVE_DEFENDER', defenderId: tower.id });
    expect(victim.hp).toBe(afterFirst);
  });

  it('the blast never damages the tower owner (being killed is punishment enough)', () => {
    const w = setup();
    const tower = addTower(w, 300, 300);
    const ownShape = addPrim(w, P0, 320, 300);
    w.primitives.delete(tower.anchorPrimitiveId);
    applyRemoveDefender(w, { type: 'REMOVE_DEFENDER', defenderId: tower.id });
    expect(ownShape.hp).toBe(PRIMITIVE_MAX_HP);
  });

  it('⭐ S151 P2 — the immortal-defender hazard is now UNREACHABLE, not merely defended against', () => {
    // The old guard relied on the damage path RAZING the anchor so `runDefenderIgnition` could never
    // re-mint the tower. With no damage path, the hazard has no entry point: a tower dies only when
    // its connectors break, at which point the recipe stops matching and there is nothing to
    // re-register. A player who repairs those bonds SHOULD get the tower back — that is FIX.
    const w = setup();
    const tower = addTower(w, 300, 300);
    w.primitives.delete(tower.anchorPrimitiveId);
    destroyDefender(w, tower);
    expect(w.defenders.size).toBe(0);
  });
});

describe('S141 P1 — ammo survives the wire and the disk', () => {
  it('a PARTIALLY SPENT tower stays spent across a save/load round-trip', () => {
    // ⛔ The deserializer has NO spread, so a forgotten assignment would silently restore the FACTORY
    // DEFAULT — a full magazine. A tower you starved would come back armed. No pre-existing test
    // compared a round-tripped defender field set, which is why this one exists.
    const w = setup();
    addTower(w, 300, 300, 2);
    const w2 = setup();
    restore(JSON.parse(JSON.stringify(snapshot(w))), w2); // full JSON round-trip (the wire path)
    const loaded = [...w2.defenders.values()].find((d) => d.kind === 'stinkTower');
    expect(loaded).toBeDefined();
    expect(loaded!.bagsRemaining).toBe(2);
  });

  it('a FULLY SPENT tower stays spent (absent-means-zero, not absent-means-full)', () => {
    const w = setup();
    addTower(w, 300, 300, 0);
    const w2 = setup();
    restore(JSON.parse(JSON.stringify(snapshot(w))), w2);
    const loaded = [...w2.defenders.values()].find((d) => d.kind === 'stinkTower');
    expect(loaded!.bagsRemaining).toBe(0);
    expect(stinkIsDepleted(loaded!)).toBe(true);
  });

  it('the other kinds round-trip unchanged at zero (no byte cost for a magazine they lack)', () => {
    const w = setup();
    const anchor = addPrim(w, P0, 500, 500, SparkType.Line);
    applyRegisterDefender(w, {
      type: 'REGISTER_DEFENDER', defenderKind: 'turret', ownerPlayerId: P0,
      anchorPrimitiveId: anchor.id, recipeId: 'laserTurret', pos: { x: 500, y: 500 },
    });
    const w2 = setup();
    restore(JSON.parse(JSON.stringify(snapshot(w))), w2);
    const t = [...w2.defenders.values()].find((d) => d.kind === 'turret');
    expect(t!.bagsRemaining).toBe(0);
  });

  it('⭐ bagsRemaining CONTRIBUTES TO THE WIDE HASH (the union alone does not hash it)', () => {
    // A.0 CRITICAL: the hash projection is a hand-written template with no executable link to the
    // DefenderHashed union, so adding the name to the union silences tsc while leaving the oracle
    // blind. Two worlds differing ONLY in bag count must hash differently.
    const a = setup(); addTower(a, 300, 300, 5);
    const b = setup(); addTower(b, 300, 300, 4);
    expect(determinismParts(a).join('|')).not.toBe(determinismParts(b).join('|'));
  });
});

describe('S141 P1 — motion posture and the magazine in play', () => {
  it('the tower is PINNED to its anchor and its prevPos stays frozen (prevPos is hashed)', () => {
    const w = setup();
    const tower = addTower(w, 300, 300);
    const anchor = w.primitives.get(tower.anchorPrimitiveId)!;
    // Drift the anchor as the Verlet solver would, then tick.
    anchor.pos.x = 340; anchor.pos.y = 355;
    for (let i = 0; i < 5; i++) applyDefenderTick(w, { type: 'DEFENDER_TICK', defenderId: tower.id });
    expect(tower.pos).toEqual({ x: 340, y: 355 }); // followed its anchor
    expect(tower.prevPos).toEqual(tower.pos); // …with ZERO implicit velocity
  });

  it('the magazine only decrements on an actual throw, and never below zero', () => {
    const w = setup();
    const tower = addTower(w, 300, 300, 1);
    const config = getDefenderConfig('stinkTower');
    expect(config.bags).toBe(STINK_TOWER_BAGS);
    // Spend it directly through the FSM-independent helper contract.
    tower.bagsRemaining = 0;
    expect(stinkIsDepleted(tower)).toBe(true);
    expect(tower.bagsRemaining).toBe(0);
  });

  it('a depleted tower still ticks without throwing (it becomes an area denier, not a corpse)', () => {
    const w = setup();
    const tower = addTower(w, 300, 300, 0);
    const enemy = addPrim(w, P1, 310, 300);
    // Run a full DoT period so the aura beat is guaranteed to land at least once.
    for (let t = 0; t < 120; t++) {
      w.tick = t;
      applyDefenderTick(w, { type: 'DEFENDER_TICK', defenderId: tower.id });
    }
    expect(enemy.hp).toBeLessThan(PRIMITIVE_MAX_HP); // the aura bit
    expect(tower.bagsRemaining).toBe(0); // and it threw nothing
  });

  it('the depleted aura spares the owner', () => {
    const w = setup();
    const tower = addTower(w, 300, 300, 0);
    const ownShape = addPrim(w, P0, 310, 300);
    for (let t = 0; t < 120; t++) {
      w.tick = t;
      applyDefenderTick(w, { type: 'DEFENDER_TICK', defenderId: tower.id });
    }
    expect(ownShape.hp).toBe(PRIMITIVE_MAX_HP);
  });
});
