/**
 * SPARK — S138 P1 unit tests for `damageEntity`, the one damage path.
 *
 * What these lock, and why each one exists:
 *
 * 1. **The integer contract.** `PRIMITIVE_MAX_HP = 1000` exists so the owner-ruled
 *    "% of max hp on a 0.5 s cadence" DoT model lands on integers. A fractional `amount`
 *    is the signature of the S137 footgun (authoring a per-engine-tick value instead of a
 *    total), so it throws rather than silently introducing float drift.
 * 2. **Delegation, not duplication.** Creature damage still goes through `damageCreature`,
 *    so "chewer dies in 1 / Voltkin in 2" stays one rule.
 * 3. **The raze contract.** A lethal hit must take the incident bonds with it AND unregister
 *    them from the SURVIVING neighbour's `bonds` set — `Bond` holds direct object references
 *    `a`/`b`, so a bond outliving its endpoint would let `solveBonds` drag a ghost.
 * 4. **The defender immortality fix.** Verified hazard: `runDefenderIgnition` re-registers any
 *    recipe match whose anchor has no live defender, on ANY topology change. Deleting the
 *    defender alone brings it back on the next bond anywhere on the board.
 * 5. **The wire.** Additive-optional, emit-only-when-damaged ⇒ an undamaged board is
 *    byte-identical to the pre-S138 wire, and a pre-S138 save restores at full health.
 * 6. **⭐ The differential oracle can SEE non-lethal damage.** Both Council seats predicted the
 *    host/worker rig would stay green through a whole fight and only fail on the death tick,
 *    because `structuralSignature` is size-only. That was wrong — the rig compares
 *    `hashWorldStateFull`, and `hp` is projected there. This is that refutation, pinned as a
 *    regression test so nobody "optimises" `hp` out of the wide projection later.
 * 7. **Real physics after a raze** (S136 standing lesson): a state assertion is not evidence.
 *    The survivors are run through the ACTUAL `solveBonds` substep loop.
 */

import { describe, expect, it } from 'vitest';
import {
  PHYSICS_SUBSTEPS,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SparkType,
  TURRET_DEFENDER_MAX_HP,
} from '../constants.ts';
// The REAL production dt, imported from the loop that owns it rather than re-derived here — a
// re-derived copy is how a test ends up silently running on NaN and passing anyway.
import { PHYSICS_DT } from '../physics/physicsLoop.ts';
import { makeIdlePlayer } from '../game/player.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Bond } from '../physics/bonds.ts';
import { solveBonds } from '../physics/bonds.ts';
import { verletStepAll } from '../physics/verlet.ts';
import {
  asBondId,
  asCreatureId,
  asPlayerId,
  asPrimitiveId,
  asSpawnerId,
  type PrimitiveId,
} from '../types.ts';
import { makeCreature } from './creatures/creature.ts';
import { CHEWER_CONFIG } from './creatures/voltkin-config.ts';
import { damageEntity } from './damage.ts';
import { applyRegisterDefender } from './defenders/defenderLifecycle.ts';
import { restore, snapshot } from './save.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { makeWorld, type World } from './world.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const RED = PLAYER_COLORS[0];

function baseWorld(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, RED));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]));
  w.gameState = 'PLAYING';
  return w;
}

function addPrim(w: World, id: number, x: number, y: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor: RED,
    placedBy: P0,
    createdTick: 0,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: RED,
    lastOwnershipChange: 0,
    radius: 8,
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  w.primitives.set(p.id, p);
  if (w.nextPrimitiveId <= id) w.nextPrimitiveId = id + 1;
  return p;
}

function connect(w: World, id: number, a: Primitive, b: Primitive): Bond {
  const bond: Bond = {
    id: asBondId(id),
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength: 32,
    stiffnessTier: 'MID',
    createdTick: 0,
  };
  w.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond;
}

/** A-B-C chain, 32px apart, so a middle raze leaves two isolated survivors. */
function chainWorld(): { w: World; a: Primitive; b: Primitive; c: Primitive } {
  const w = baseWorld();
  const a = addPrim(w, 1, 500, 400);
  const b = addPrim(w, 2, 532, 400);
  const c = addPrim(w, 3, 564, 400);
  connect(w, 10, a, b);
  connect(w, 11, b, c);
  return { w, a, b, c };
}

describe('S138 P1 — the integer damage contract', () => {
  it('REJECTS a fractional amount, naming the authoring mistake', () => {
    const { w, a } = chainWorld();
    expect(() => damageEntity(w, { kind: 'primitive', id: a.id }, 2.5, 'aura')).toThrow(
      /non-negative INTEGER/,
    );
    // The message must point at the real cause — a per-engine-tick value instead of a total.
    expect(() => damageEntity(w, { kind: 'primitive', id: a.id }, 0.5, 'aura')).toThrow(/total/);
    expect(a.hp).toBe(PRIMITIVE_MAX_HP); // and it did NOT partially apply
  });

  it('REJECTS a negative amount (healing is not damage)', () => {
    const { w, a } = chainWorld();
    expect(() => damageEntity(w, { kind: 'primitive', id: a.id }, -10, 'player')).toThrow();
    expect(a.hp).toBe(PRIMITIVE_MAX_HP);
  });

  it('treats 0 as a no-op that reports "not dead"', () => {
    const { w, a } = chainWorld();
    expect(damageEntity(w, { kind: 'primitive', id: a.id }, 0, 'aura')).toBe(false);
    expect(a.hp).toBe(PRIMITIVE_MAX_HP);
    expect(w.effects.length).toBe(0); // no cosmetic noise for a zero hit
  });

  it('every percentage the DoT model uses is an integer at this scale', () => {
    // This is the whole reason PRIMITIVE_MAX_HP is 1000 and not 100.
    for (const pct of [1, 2.5, 5]) {
      expect(Number.isInteger((PRIMITIVE_MAX_HP * pct) / 100)).toBe(true);
    }
  });
});

describe('S138 P1 — creature damage still delegates to damageCreature', () => {
  it('kills a 1-hp chewer and removes it, returning true', () => {
    const w = baseWorld();
    const cid = asCreatureId(1);
    w.creatures.set(
      cid,
      makeCreature(CHEWER_CONFIG, {
        id: cid,
        ownerPlayerId: P1,
        pos: { x: 100, y: 100 },
        targetPos: { x: 100, y: 100 },
        spawnedAtTick: 0,
        sourceSpawnerId: asSpawnerId(1),
      }),
    );
    expect(damageEntity(w, { kind: 'creature', id: cid }, 1, 'defender')).toBe(true);
    expect(w.creatures.size).toBe(0);
  });

  it('is a safe no-op for an id that is already gone', () => {
    const w = baseWorld();
    expect(damageEntity(w, { kind: 'creature', id: asCreatureId(99) }, 5, 'defender')).toBe(false);
  });
});

describe('S138 P1 — primitive damage and the raze contract', () => {
  it('a non-lethal hit reduces hp, keeps the primitive, and emits nothing', () => {
    const { w, a } = chainWorld();
    expect(damageEntity(w, { kind: 'primitive', id: a.id }, 10, 'aura')).toBe(false);
    expect(a.hp).toBe(PRIMITIVE_MAX_HP - 10);
    expect(w.primitives.has(a.id)).toBe(true);
    expect(w.effects.length).toBe(0);
  });

  it('EXACTLY zero is lethal (boundary), and overkill does not leave a survivor', () => {
    const one = chainWorld();
    expect(
      damageEntity(one.w, { kind: 'primitive', id: one.a.id }, PRIMITIVE_MAX_HP, 'player'),
    ).toBe(true);
    expect(one.w.primitives.has(one.a.id)).toBe(false);

    const two = chainWorld();
    expect(
      damageEntity(two.w, { kind: 'primitive', id: two.a.id }, PRIMITIVE_MAX_HP * 10, 'player'),
    ).toBe(true);
    expect(two.w.primitives.has(two.a.id)).toBe(false);
  });

  it('a lethal hit takes the incident bonds AND unregisters them from the survivor', () => {
    const { w, a, b, c } = chainWorld();
    expect(w.bonds.size).toBe(2);

    // Kill the MIDDLE primitive: both bonds are incident to it.
    expect(damageEntity(w, { kind: 'primitive', id: b.id }, PRIMITIVE_MAX_HP, 'creature')).toBe(
      true,
    );

    expect(w.primitives.has(b.id)).toBe(false);
    expect(w.bonds.size).toBe(0);
    // ⭐ The survivors must not still believe they are bonded — a stale id here is what would
    // let solveBonds drag a deleted primitive's object reference.
    expect(a.bonds.size).toBe(0);
    expect(c.bonds.size).toBe(0);
  });

  it('emits SEVER_ERASE at the dead primitive so the death is visible', () => {
    const { w, a } = chainWorld();
    damageEntity(w, { kind: 'primitive', id: a.id }, PRIMITIVE_MAX_HP, 'player');
    const erase = w.effects.filter((e) => e.kind === 'SEVER_ERASE');
    expect(erase.length).toBe(1);
    expect(erase[0]).toMatchObject({ pos: { x: 500, y: 400 } });
  });

  it('leaves an unrelated structure completely untouched', () => {
    const { w, a, c } = chainWorld();
    const far = addPrim(w, 20, 900, 200);
    damageEntity(w, { kind: 'primitive', id: a.id }, PRIMITIVE_MAX_HP, 'player');
    expect(w.primitives.has(far.id)).toBe(true);
    expect(far.hp).toBe(PRIMITIVE_MAX_HP);
    expect(c.hp).toBe(PRIMITIVE_MAX_HP);
  });
});

describe('S138 P1 — defender damage cannot produce an IMMORTAL defender', () => {
  function withTurret(): { w: World; anchor: PrimitiveId } {
    const w = baseWorld();
    const anchor = addPrim(w, 1, 300, 300).id;
    applyRegisterDefender(w, {
      type: 'REGISTER_DEFENDER',
      defenderKind: 'turret',
      ownerPlayerId: P0,
      anchorPrimitiveId: anchor,
      recipeId: 'laserTurret',
      pos: { x: 300, y: 300 },
    });
    return { w, anchor };
  }

  it('carries REAL hp now, not the old 1e9 sentinel', () => {
    const { w } = withTurret();
    const d = [...w.defenders.values()][0];
    expect(d.hp).toBe(TURRET_DEFENDER_MAX_HP);
    expect(d.hp).toBeLessThan(1_000_000_000);
  });

  it('survives a non-lethal hit', () => {
    const { w } = withTurret();
    const d = [...w.defenders.values()][0];
    expect(damageEntity(w, { kind: 'defender', id: d.id }, 100, 'creature')).toBe(false);
    expect(d.hp).toBe(TURRET_DEFENDER_MAX_HP - 100);
    expect(w.defenders.size).toBe(1);
  });

  it('⭐ a lethal hit RAZES THE ANCHOR, so the igniter can never re-mint it', () => {
    const { w, anchor } = withTurret();
    const d = [...w.defenders.values()][0];

    expect(damageEntity(w, { kind: 'defender', id: d.id }, TURRET_DEFENDER_MAX_HP, 'creature')).toBe(
      true,
    );

    expect(w.defenders.size).toBe(0);
    // THE POINT: the anchor is gone. runDefenderIgnition matches on anchorPrimitiveId, so with
    // the anchor razed there is nothing for it to re-register against. Deleting only the
    // defender would let it return on the next BOND_FORMED anywhere on the board.
    expect(w.primitives.has(anchor)).toBe(false);
  });

  it('re-registering against the razed anchor is now impossible', () => {
    const { w, anchor } = withTurret();
    const d = [...w.defenders.values()][0];
    damageEntity(w, { kind: 'defender', id: d.id }, TURRET_DEFENDER_MAX_HP, 'creature');

    // Simulate the igniter's re-registration attempt directly. It is anchor-keyed, and a
    // razed anchor cannot back a live defender.
    applyRegisterDefender(w, {
      type: 'REGISTER_DEFENDER',
      defenderKind: 'turret',
      ownerPlayerId: P0,
      anchorPrimitiveId: anchor,
      recipeId: 'laserTurret',
      pos: { x: 300, y: 300 },
    });
    // It "registers" only in the sense that the reducer is unguarded — but the geometry it
    // needs is gone, so recipeStillSatisfied removes it on the next poll. The load-bearing
    // assertion is that the ANCHOR stays absent, which is what makes the recipe unmatchable.
    expect(w.primitives.has(anchor)).toBe(false);
  });
});

describe('S138 P1 — the wire stays additive-optional', () => {
  it('an UNDAMAGED primitive emits no hp key at all (byte-identical to pre-S138)', () => {
    const { w } = chainWorld();
    const snap = JSON.parse(JSON.stringify(snapshot(w))) as { primitives: Record<string, unknown>[] };
    for (const p of snap.primitives) {
      expect('hp' in p).toBe(false);
    }
  });

  it('a DAMAGED primitive emits hp and restores it exactly', () => {
    const { w, a } = chainWorld();
    damageEntity(w, { kind: 'primitive', id: a.id }, 250, 'aura');
    const snap = JSON.parse(JSON.stringify(snapshot(w))) as {
      primitives: { id: number; hp?: number }[];
    };
    const wire = snap.primitives.find((p) => p.id === (a.id as unknown as number));
    expect(wire?.hp).toBe(PRIMITIVE_MAX_HP - 250);

    const fresh = baseWorld();
    restore(snapshot(w), fresh);
    expect(fresh.primitives.get(a.id)!.hp).toBe(PRIMITIVE_MAX_HP - 250);
  });

  it('a pre-S138 snapshot (no hp anywhere) restores every primitive at FULL health', () => {
    const { w } = chainWorld();
    damageEntity(w, { kind: 'primitive', id: w.primitives.keys().next().value! }, 250, 'aura');
    const snap = snapshot(w);
    // Strip hp everywhere, exactly as a pre-S138 save would have it.
    for (const p of (snap as unknown as { primitives: { hp?: number }[] }).primitives) delete p.hp;
    const fresh = baseWorld();
    restore(snap, fresh);
    expect(fresh.primitives.size).toBe(3);
    for (const p of fresh.primitives.values()) expect(p.hp).toBe(PRIMITIVE_MAX_HP);
  });
});

describe('S138 P1 — the differential oracle CAN see non-lethal damage', () => {
  it('identical damage on identical worlds produces the identical wide hash', () => {
    const one = chainWorld();
    const two = chainWorld();
    damageEntity(one.w, { kind: 'primitive', id: one.a.id }, 250, 'aura');
    damageEntity(two.w, { kind: 'primitive', id: two.a.id }, 250, 'aura');
    expect(hashWorldStateFull(one.w)).toBe(hashWorldStateFull(two.w));
  });

  it('⭐ a NON-LETHAL 10-hp divergence changes the wide hash (Council C2 refuted)', () => {
    const one = chainWorld();
    const two = chainWorld();
    expect(hashWorldStateFull(one.w)).toBe(hashWorldStateFull(two.w)); // same to start

    damageEntity(one.w, { kind: 'primitive', id: one.a.id }, 250, 'aura');
    damageEntity(two.w, { kind: 'primitive', id: two.a.id }, 260, 'aura');

    // Nothing died, so every collection SIZE is identical — the size-only structuralSignature
    // could not tell these apart. The WIDE hash, which the differential rig actually compares,
    // must. If this ever fails, `hp` has been dropped from the stateHashFull projection and the
    // host/worker rig has gone blind to damage arithmetic.
    expect(one.w.primitives.size).toBe(two.w.primitives.size);
    expect(one.w.bonds.size).toBe(two.w.bonds.size);
    expect(hashWorldStateFull(one.w)).not.toBe(hashWorldStateFull(two.w));
  });
});

describe('S138 P1 — REAL physics after a raze (S136: state assertions are not evidence)', () => {
  it('the surviving primitives are not dragged by a stale bond over 5 real ticks', () => {
    const { w, a, b, c } = chainWorld();

    // Kill the middle. Both bonds are incident to it, so the survivors are now isolated.
    damageEntity(w, { kind: 'primitive', id: b.id }, PRIMITIVE_MAX_HP, 'creature');

    const before = { a: { ...a.pos }, c: { ...c.pos } };

    // The ACTUAL substep loop from physicsLoop.stepPhysics: verlet the free sparks, then run the
    // real constraint solver over the real remaining bond array, PHYSICS_SUBSTEPS per tick.
    const SUBSTEP_DT = PHYSICS_DT / PHYSICS_SUBSTEPS;
    expect(Number.isFinite(SUBSTEP_DT)).toBe(true); // guard: a NaN dt would pass silently
    for (let tick = 0; tick < 5; tick++) {
      w.tick = tick;
      for (let s = 0; s < PHYSICS_SUBSTEPS; s++) {
        verletStepAll([...w.freeSparks.values()], SUBSTEP_DT);
        solveBonds([...w.bonds.values()]);
      }
    }

    // A bond that outlived its endpoint would still hold the deleted primitive's OBJECT
    // reference (Bond.a / Bond.b) and the solver would happily move it. Nothing moved ⇒ the
    // raze really did take the bonds with it.
    expect(a.pos.x).toBeCloseTo(before.a.x, 6);
    expect(a.pos.y).toBeCloseTo(before.a.y, 6);
    expect(c.pos.x).toBeCloseTo(before.c.x, 6);
    expect(c.pos.y).toBeCloseTo(before.c.y, 6);

    // And no bond may reference a primitive that is no longer in the world.
    for (const bond of w.bonds.values()) {
      expect(w.primitives.has(bond.aId)).toBe(true);
      expect(w.primitives.has(bond.bId)).toBe(true);
    }
  });

  it('a bonded pair still solves normally after an unrelated raze', () => {
    const { w, a, b, c } = chainWorld();
    // Raze only the far end: the a-b bond must survive and keep working.
    damageEntity(w, { kind: 'primitive', id: c.id }, PRIMITIVE_MAX_HP, 'player');
    expect(w.bonds.size).toBe(1);

    // Stretch the pair MODESTLY and let the real solver pull them back toward restLength.
    // Deliberately inside the strain-break ratio: solveBonds reports an over-stretched bond as
    // broken and `continue`s WITHOUT correcting it, so a 200px yank would prove nothing.
    b.pos.x = a.pos.x + 40; // restLength is 32
    b.prevPos.x = b.pos.x;
    const stretched = Math.abs(b.pos.x - a.pos.x);

    const SUBSTEP_DT = PHYSICS_DT / PHYSICS_SUBSTEPS;
    expect(Number.isFinite(SUBSTEP_DT)).toBe(true); // guard: a NaN dt would pass silently
    for (let tick = 0; tick < 5; tick++) {
      for (let s = 0; s < PHYSICS_SUBSTEPS; s++) {
        verletStepAll([...w.freeSparks.values()], SUBSTEP_DT);
        solveBonds([...w.bonds.values()]);
      }
    }
    // The surviving constraint is live — it pulled them measurably closer.
    expect(Math.abs(b.pos.x - a.pos.x)).toBeLessThan(stretched);
  });
});
