/**
 * SPARK — S190 (s188/draft-atk) — ⛔ EVERY CREATURE STRIKE ARM LANDS THE CREATURE'S OWN STRIKE.
 *
 * `draftAtkReaches.test.ts` proves the reach through the real host tick for the creature-vs-creature
 * arm. This file is the LEDGER for every other place a creature's strike is spent — each arm driven
 * through its real reducer, twice: once for a creature born to a seat that drafted ATK (it must land
 * `draftedAttackFifths`), once for an undrafted one (it must land exactly the type's
 * `attackFifths(atk, pen)`, the negative control — byte-identical to before S190).
 *
 * The arms, in `applyCreatureAttack`'s order, then the three strikes that live outside it:
 *   creature · HELGA (defender) · shape · landed stink bag · castle · connector
 *   · the Voltkin chain · the suicide goblin's blast · the lightning drone's blast
 *
 * ⚠ Every target is given a DEEP pool (10 000 fifths) so the strike is read off the pool it came out
 * of, rather than inferred from a death. `creatureStrike.guard.test.ts` is the mechanical half: it
 * counts the config derivations left in the tree, so a new arm cannot quietly re-derive.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, STINK_BAG_RADIUS, SparkType } from '../../constants.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import {
  asBondId, asCreatureId, asDefenderId, asPlayerId, asPrimitiveId, asStinkCloudId,
  type BondId,
} from '../../types.ts';
import { castleDamageAfterDefence } from '../castleUpgrades.ts';
import { makeDefender } from '../defenders/defender.ts';
import { makeStinkCloud } from '../defenders/stinkCloud.ts';
import { draftedAttackFifths, type DraftPick } from '../draft.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { attackFifths } from '../stats.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { makeCreature, type Creature, type CreatureType } from './creature.ts';
import { chainJumpFifths } from './voltkinChain.ts';
import { getCreatureConfig } from './voltkin-config.ts';

const P0 = asPlayerId(0); // the attacker's seat
const P1 = asPlayerId(1);
const DEEP = 10_000;
const ATK: DraftPick[] = ['hp', 'def', 'atk']; // the realistic wave-11 draft: one damage pick

function baseWorld(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]));
  return w;
}

function enemyPrim(w: World, id: number, x: number, y: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id), type: SparkType.Dot, placerColor: PLAYER_COLORS[1], placedBy: P1,
    createdTick: 0, pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: PLAYER_COLORS[1],
    lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(p.id, p);
  return p;
}

function bondBetween(w: World, id: number, a: Primitive, b: Primitive): Bond {
  const bond: Bond = {
    id: asBondId(id), aId: a.id, bId: b.id, a, b, restLength: 32, stiffnessTier: 'MID',
    damageFifths: 0, createdTick: 0,
  };
  w.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond;
}

/** A P0 creature of `type`, born through the real factory with `picks`, already ATTACKING. */
function attacker(w: World, type: CreatureType, picks: DraftPick[], x: number, y: number, id = 1): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(id), ownerPlayerId: P0, pos: { x, y }, targetPos: { x, y }, spawnedAtTick: 0,
    sourceSpawnerId: null, draftPicks: picks,
  });
  c.state = 'ATTACKING';
  w.creatures.set(c.id, c);
  return c;
}

/** A deep-pooled enemy creature that is not aiming at anyone (so no initiative roll applies). */
function punchingBag(w: World, x: number, y: number, id = 50): Creature {
  const c = makeCreature(getCreatureConfig('raceUnit'), {
    id: asCreatureId(id), ownerPlayerId: P1, pos: { x, y }, targetPos: { x, y }, spawnedAtTick: 0,
    sourceSpawnerId: null,
  });
  c.maxEhp = DEEP;
  c.ehp = DEEP;
  w.creatures.set(c.id, c);
  return c;
}

const typeStrike = (t: CreatureType) => attackFifths(getCreatureConfig(t).atk, getCreatureConfig(t).pen);
const draftedStrike = (t: CreatureType) =>
  draftedAttackFifths(getCreatureConfig(t).atk, getCreatureConfig(t).pen, ATK);

/** Runs `arm` for a drafted and an undrafted attacker; returns what each took off its target. */
function both(arm: (picks: DraftPick[]) => number): { drafted: number; plain: number } {
  return { drafted: arm(ATK), plain: arm([]) };
}

const G: CreatureType = 'goblinMelee'; // a structure-attacker: every arm of applyCreatureAttack reaches it

describe('the arithmetic this ledger expects', () => {
  it('a melee goblin strikes 12, and one ATK pick makes it 13; the three blasters move too', () => {
    expect(typeStrike(G)).toBe(12);
    expect(draftedStrike(G)).toBe(13);
    expect([typeStrike('goblinSuicide'), draftedStrike('goblinSuicide')]).toEqual([20, 22]);
    expect([typeStrike('lightningDrone'), draftedStrike('lightningDrone')]).toEqual([30, 33]);
    expect([typeStrike('voltkin'), draftedStrike('voltkin')]).toEqual([33, 36]);
  });
});

describe('⛔ every arm of applyCreatureAttack lands the creature’s OWN strike', () => {
  it('creature → creature', () => {
    const r = both((picks) => {
      const w = baseWorld();
      const a = attacker(w, G, picks, 500, 500);
      const bag = punchingBag(w, 510, 500);
      a.targetCreatureId = bag.id;
      dispatch(w, { type: 'CREATURE_ATTACK', creatureId: a.id, bondId: null, targetCreatureId: bag.id });
      return DEEP - bag.ehp;
    });
    expect(r).toEqual({ drafted: draftedStrike(G), plain: typeStrike(G) });
  });

  it('creature → HELGA (the one defender with a pool)', () => {
    const r = both((picks) => {
      const w = baseWorld();
      const a = attacker(w, G, picks, 500, 500);
      const anchor = enemyPrim(w, 90, 510, 500);
      const d = makeDefender({
        id: asDefenderId(7), kind: 'princess', ownerPlayerId: P1, anchorPrimitiveId: anchor.id,
        recipeId: 'helga', pos: { x: 510, y: 500 }, registeredAtTick: 0,
      });
      d.ehp = DEEP;
      w.defenders.set(d.id, d);
      dispatch(w, { type: 'CREATURE_ATTACK', creatureId: a.id, bondId: null, targetCreatureId: null });
      return DEEP - (w.defenders.get(d.id)?.ehp ?? 0);
    });
    expect(r).toEqual({ drafted: draftedStrike(G), plain: typeStrike(G) });
  });

  it('creature → SHAPE', () => {
    const r = both((picks) => {
      const w = baseWorld();
      const a = attacker(w, G, picks, 500, 500);
      const p = enemyPrim(w, 91, 515, 500);
      // Bonded, because a LONE shape is clamped to `LONE_PRIMITIVE_POOL_FIFTHS` before the hit lands.
      bondBetween(w, 9, p, enemyPrim(w, 92, 700, 500));
      p.hp = DEEP;
      a.targetPrimitiveId = p.id;
      dispatch(w, { type: 'CREATURE_ATTACK', creatureId: a.id, bondId: null, targetCreatureId: null });
      return DEEP - p.hp;
    });
    expect(r).toEqual({ drafted: draftedStrike(G), plain: typeStrike(G) });
  });

  it('creature → LANDED STINK BAG', () => {
    const r = both((picks) => {
      const w = baseWorld();
      const a = attacker(w, G, picks, 500, 500);
      const id = asStinkCloudId(3);
      w.stinkClouds.set(id, makeStinkCloud({
        id, pos: { x: 515, y: 500 }, ownerPlayerId: P1, landedAtTick: 0, radius: STINK_BAG_RADIUS, ehp: DEEP,
      }));
      dispatch(w, { type: 'CREATURE_ATTACK', creatureId: a.id, bondId: null, targetCreatureId: null });
      return DEEP - (w.stinkClouds.get(id)?.ehp ?? 0);
    });
    expect(r).toEqual({ drafted: draftedStrike(G), plain: typeStrike(G) });
  });

  it('creature → CASTLE (read through the keep’s own DEF, like every castle hit)', () => {
    const r = both((picks) => {
      const w = baseWorld();
      const k = castleAnchor(1, w.layout);
      const a = attacker(w, G, picks, k.x, k.y + 10);
      const before = w.players.get(P1)!.castleHp;
      dispatch(w, { type: 'CREATURE_ATTACK', creatureId: a.id, bondId: null, targetCreatureId: null });
      return before - w.players.get(P1)!.castleHp;
    });
    const u = baseWorld().players.get(P1)!.castleUpgrades;
    expect(r).toEqual({
      drafted: castleDamageAfterDefence(draftedStrike(G), u),
      plain: castleDamageAfterDefence(typeStrike(G), u),
    });
    expect(r.drafted).toBeGreaterThan(r.plain);
  });

  it('creature → CONNECTOR (banked on the bond; a 3-connector pool of 24 holds it)', () => {
    const r = both((picks) => {
      const w = baseWorld();
      const [p1, p2, p3] = [enemyPrim(w, 1, 500, 500), enemyPrim(w, 2, 540, 500), enemyPrim(w, 3, 520, 540)];
      const b1 = bondBetween(w, 1, p1, p2);
      bondBetween(w, 2, p2, p3);
      bondBetween(w, 3, p3, p1);
      const a = attacker(w, G, picks, 520, 480);
      a.targetBondId = b1.id;
      dispatch(w, { type: 'CREATURE_ATTACK', creatureId: a.id, bondId: b1.id, targetCreatureId: null });
      return w.bonds.get(b1.id)?.damageFifths ?? -1;
    });
    expect(r).toEqual({ drafted: draftedStrike(G), plain: typeStrike(G) });
  });
});

describe('⛔ …and the three strikes that live outside it', () => {
  it('the VOLTKIN CHAIN — every link is halved from the Voltkin’s OWN strike', () => {
    const r = both((picks) => {
      const w = baseWorld();
      const v = attacker(w, 'voltkin', picks, -100, 0);
      const [pa, pb] = [enemyPrim(w, 1, 0, 0), enemyPrim(w, 2, 80, 0)];
      const b1 = bondBetween(w, 1, pa, pb);
      const hop = punchingBag(w, 40, 60); // the chain's first hop, 60 px off the bond midpoint
      dispatch(w, { type: 'CREATURE_ATTACK', creatureId: v.id, bondId: b1.id, targetCreatureId: null });
      return DEEP - hop.ehp;
    });
    // The seed (the bond) spends jump 0; the first link is jump 1.
    expect(r).toEqual({
      drafted: chainJumpFifths(draftedStrike('voltkin'), 1),
      plain: chainJumpFifths(typeStrike('voltkin'), 1),
    });
    expect([r.plain, r.drafted]).toEqual([16, 18]);
  });

  it('the SUICIDE GOBLIN’s blast — units, shapes AND connectors all take the bomber’s own number', () => {
    const run = (picks: DraftPick[]) => {
      const w = baseWorld();
      // A 5-connector chain 100 px apart (pool 50), so only ONE bond midpoint sits in the 70 px
      // blast and it is banked rather than cut.
      const ps = [0, 1, 2, 3, 4, 5].map((i) => enemyPrim(w, 10 + i, i * 100, 0));
      const bonds: BondId[] = [];
      for (let i = 0; i < 5; i++) bonds.push(bondBetween(w, 20 + i, ps[i]!, ps[i + 1]!).id);
      for (const p of ps) p.hp = DEEP;
      const bomber = attacker(w, 'goblinSuicide', picks, 50, 30);
      const bag = punchingBag(w, 60, 30);
      dispatch(w, { type: 'SUICIDE_BLAST', creatureId: bomber.id });
      return {
        unit: DEEP - bag.ehp,
        shape: DEEP - ps[0]!.hp,
        connector: w.bonds.get(bonds[0]!)?.damageFifths ?? -1,
      };
    };
    const d = draftedStrike('goblinSuicide');
    const t = typeStrike('goblinSuicide');
    expect(run(ATK)).toEqual({ unit: d, shape: d, connector: d });
    expect(run([])).toEqual({ unit: t, shape: t, connector: t });
  });

  it('the LIGHTNING DRONE’s blast', () => {
    const r = both((picks) => {
      const w = baseWorld();
      const drone = attacker(w, 'lightningDrone', picks, 500, 500);
      const bag = punchingBag(w, 520, 500);
      dispatch(w, { type: 'DRONE_EXPLODE', creatureId: drone.id });
      return DEEP - bag.ehp;
    });
    expect(r).toEqual({ drafted: draftedStrike('lightningDrone'), plain: typeStrike('lightningDrone') });
  });
});
