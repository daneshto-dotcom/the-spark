/**
 * SPARK — S158 P7 (CF-S157-c): **Helga can be killed.**
 *
 * Owner's ask, verbatim: she should hold the field *"until she is destroyed herself"*. She could not
 * be. S157 B6 shipped the other half — she outlives her tower and returns only next turn — and
 * bounded her life by the FIGHT instead, which is why she was neither immortal nor killable.
 *
 * ## The ruling this untangles, because it is the whole reason the field was missing
 *
 * R75: *"towers have attack and piercing but not def and hp because they are based on the connectors
 * that build them"*. S151 P2 read that as "defenders have no hp" and deleted the field, the wire
 * bytes, the hash term and the damage arm — for EVERY kind.
 *
 * R77 then corrected the over-reading: *"Helga — 4atk, 4pierce, 6hp, 4 def … those are all spawned
 * units."* She is a UNIT that happens to live in `world.defenders`, not an emplacement.
 *
 * So the substrate comes back **scoped by `config.unitStats`** — the very field R77 forced into
 * existence. A defender with unit stats carries a pool; a tower carries `null` and is exactly as
 * immune as it is today. Half of the tests below exist to prove that second half, because a fix that
 * quietly made turrets shootable would be re-litigating a ruling nobody asked to reopen.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { mulberry32 } from '../rng.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { applyRadialDamage, damageEntity } from '../damage.ts';
import { makeDefender } from './defender.ts';
import { killableDefenderInReach } from '../creatures/creatureAI.ts';
import { applySpawnCreature } from '../creatures/creatureLifecycle.ts';
import { unitPoolFifths, attackFifths } from '../stats.ts';
import { asDefenderId, asPlayerId, asPrimitiveId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Controls } from '../../input/controls.ts';
import {
  GOBLIN_MELEE_ATK,
  GOBLIN_MELEE_PEN,
  PRIMITIVE_MAX_HP,
  PRINCESS_DEF,
  PRINCESS_HP,
  SparkType,
} from '../../constants.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
const HELGA_POOL = unitPoolFifths(PRINCESS_HP, PRINCESS_DEF);

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

function make1v1(): World {
  const w = makeWorld(0x7158);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.creatures.clear();
  return w;
}

function addPrimAt(world: World, seat: 0 | 1, x: number, y: number): Primitive {
  const player = world.players.get(asPlayerId(seat))!;
  const id = asPrimitiveId(world.nextPrimitiveId++);
  const prim: Primitive = {
    id, type: SparkType.Square, placerColor: player.color, placedBy: player.id,
    createdTick: world.tick, pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: player.color, lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  world.primitives.set(id, prim);
  return prim;
}

/** A defender of `kind` planted at (x,y), owned by `seat`, through the real factory. */
function plant(w: World, kind: 'princess' | 'turret' | 'stinkTower', seat: 0 | 1, x: number, y: number) {
  const anchor = addPrimAt(w, seat, x, y);
  const d = makeDefender({
    id: asDefenderId(w.nextDefenderId++),
    kind,
    ownerPlayerId: asPlayerId(seat),
    anchorPrimitiveId: anchor.id,
    recipeId: kind === 'princess' ? 'helga' : kind === 'turret' ? 'laserTurret' : 'stinkTower',
    pos: { x, y },
    registeredAtTick: w.tick,
  });
  w.defenders.set(d.id, d);
  return d;
}

describe('S158 P7 — the pool exists, and ONLY for a unit-class defender', () => {
  it('⭐ HELGA is minted with a real pool off the shared ladder (R77: 6 hp, 4 def)', () => {
    const w = make1v1();
    expect(plant(w, 'princess', 0, 500, 500).ehp).toBe(HELGA_POOL);
  });

  it('⛔ a TOWER is minted with null — R75 is not reopened', () => {
    const w = make1v1();
    expect(plant(w, 'turret', 0, 500, 500).ehp).toBeNull();
    expect(plant(w, 'stinkTower', 0, 600, 500).ehp).toBeNull();
  });
});

describe('S158 P7 — damage', () => {
  it('⭐ subtracts from HELGA and reports the kill only on the blow that lands it', () => {
    const w = make1v1();
    const h = plant(w, 'princess', 1, 500, 500);
    expect(damageEntity(w, { kind: 'defender', id: h.id }, HELGA_POOL - 1, 'creature')).toBe(false);
    expect(w.defenders.get(h.id)!.ehp).toBe(1);
    expect(damageEntity(w, { kind: 'defender', id: h.id }, 1, 'creature')).toBe(true);
    expect(w.defenders.has(h.id), 'and this arm REMOVES her — it honours the contract in full').toBe(false);
  });

  it('⛔ a TOWER takes NOTHING and reports no kill, however hard it is hit', () => {
    const w = make1v1();
    const t = plant(w, 'turret', 1, 500, 500);
    expect(damageEntity(w, { kind: 'defender', id: t.id }, 999_999, 'creature')).toBe(false);
    expect(w.defenders.has(t.id), 'towers still die by recipe-break, and by nothing else').toBe(true);
    expect(w.defenders.get(t.id)!.ehp).toBeNull();
  });

  it('emits a visible death so a client sees SOMETHING happen where she stood', () => {
    const w = make1v1();
    const h = plant(w, 'princess', 1, 500, 500);
    w.effects.length = 0;
    damageEntity(w, { kind: 'defender', id: h.id }, HELGA_POOL, 'creature');
    expect(w.effects.filter((e) => e.kind === 'SEVER_ERASE')).toHaveLength(1);
  });

  it('does NOT raze her anchor — her recipe is the player\'s to rebuild next turn', () => {
    const w = make1v1();
    const h = plant(w, 'princess', 1, 500, 500);
    const anchorId = h.anchorPrimitiveId;
    damageEntity(w, { kind: 'defender', id: h.id }, HELGA_POOL, 'creature');
    expect(w.primitives.has(anchorId), 'killing her must not punish the player\'s shapes too').toBe(true);
  });

  it('is idempotent on a defender already gone', () => {
    const w = make1v1();
    const h = plant(w, 'princess', 1, 500, 500);
    damageEntity(w, { kind: 'defender', id: h.id }, HELGA_POOL, 'creature');
    expect(damageEntity(w, { kind: 'defender', id: h.id }, HELGA_POOL, 'creature')).toBe(false);
  });
});

describe('S158 P7 — area damage reaches her again', () => {
  it('⭐ a blast in range hurts HELGA on the UNIT scale', () => {
    const w = make1v1();
    const h = plant(w, 'princess', 1, 500, 500);
    applyRadialDamage(w, 500, 500, 120, 10, 3, 'hazard', P0);
    expect(w.defenders.get(h.id)!.ehp).toBe(HELGA_POOL - 3);
  });

  it('⛔ the same blast does nothing to a TOWER — the S151 note still holds for towers', () => {
    const w = make1v1();
    const t = plant(w, 'turret', 1, 500, 500);
    applyRadialDamage(w, 500, 500, 120, 10, 3, 'hazard', P0);
    expect(w.defenders.get(t.id)!.ehp).toBeNull();
    expect(w.defenders.has(t.id)).toBe(true);
  });

  it('a blast SPARES the owner\'s own princess', () => {
    const w = make1v1();
    const h = plant(w, 'princess', 0, 500, 500);
    applyRadialDamage(w, 500, 500, 120, 10, 3, 'hazard', P0); // spare = P0, who owns her
    expect(w.defenders.get(h.id)!.ehp).toBe(HELGA_POOL);
  });

  it('and one out of range is untouched', () => {
    const w = make1v1();
    const h = plant(w, 'princess', 1, 900, 900);
    applyRadialDamage(w, 500, 500, 120, 10, 3, 'hazard', P0);
    expect(w.defenders.get(h.id)!.ehp).toBe(HELGA_POOL);
  });
});

describe('S158 P7 — a unit can find her, and a tower stays unfindable', () => {
  function goblinNear(w: World, x: number, y: number) {
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: P0,
      pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: null,
    });
    return [...w.creatures.values()].at(-1)!;
  }

  it('⭐ killableDefenderInReach finds an ENEMY princess in range', () => {
    const w = make1v1();
    const h = plant(w, 'princess', 1, 520, 500);
    expect(killableDefenderInReach(w, goblinNear(w, 500, 500), 100)).toBe(h.id);
  });

  it('⛔ and NEVER a tower — the filter is the pool, not the kind', () => {
    const w = make1v1();
    plant(w, 'turret', 1, 520, 500);
    plant(w, 'stinkTower', 1, 530, 500);
    expect(killableDefenderInReach(w, goblinNear(w, 500, 500), 100)).toBeNull();
  });

  it('never her own side\'s princess', () => {
    const w = make1v1();
    plant(w, 'princess', 0, 520, 500);
    expect(killableDefenderInReach(w, goblinNear(w, 500, 500), 100)).toBeNull();
  });

  it('respects reach, and breaks ties on the LOWEST id (float distance cannot decide it)', () => {
    const w = make1v1();
    const g = goblinNear(w, 500, 500);
    const first = plant(w, 'princess', 1, 520, 500);
    plant(w, 'princess', 1, 480, 500); // equidistant, higher id
    expect(killableDefenderInReach(w, g, 10), 'out of reach').toBeNull();
    expect(killableDefenderInReach(w, g, 100)).toBe(first.id);
  });
});

describe('S158 P7 — end to end, through the real host tick', () => {
  it('⭐ a goblin standing next to HELGA actually WEARS HER DOWN through the real host tick', () => {
    const w = make1v1();
    const h = plant(w, 'princess', 1, 520, 500);
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: P0,
      pos: { x: 500, y: 500 }, targetPos: { x: 500, y: 500 }, sourceSpawnerId: null,
    });

    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 120; t++) runHostTick(w, d, st);

    // BEFORE THIS PRIORITY she took NOTHING here. She was neither a creature, a bond, a primitive nor
    // a castle, so no engage term let the goblin leave SEEKING and no strike clause matched her — it
    // ran its whole cadence against nothing, the "static-parses but never fires" shape S139 P2 names.
    expect(w.defenders.get(h.id)!.ehp, 'she must be losing points to a unit').toBeLessThan(HELGA_POOL);
  });

  it('⭐ and enough attackers actually DESTROY her — the whole owner ask', () => {
    /*
     * ⚠ ONE GOBLIN CANNOT DO IT, AND THAT IS CORRECT RATHER THAN A GAP. Measured: a lone melee goblin
     * takes her to 42/54 and then dies — she slaps back, and he has 2 hp. My first version of this
     * test asserted a solo kill, failed, and the probe showed the strike working perfectly while the
     * ATTACKER expired. The fixture was wrong, not the feature.
     *
     * Four goblin kinds, because `applySpawnCreature` refuses a second live creature of the same
     * (owner, type) on the null-spawner path — the blueprint Q10 invariant.
     */
    const w = make1v1();
    const h = plant(w, 'princess', 1, 520, 500);
    const KINDS = ['goblinMelee', 'goblinShield', 'goblinArcher', 'goblinBat'] as const;
    const d = deps();
    const st = makeHostTickState(w);

    let died = false;
    for (let wave = 0; wave < 6 && !died; wave++) {
      for (const kind of KINDS) {
        applySpawnCreature(w, {
          type: 'SPAWN_CREATURE', creatureType: kind, ownerPlayerId: P0,
          pos: { x: 500, y: 500 }, targetPos: { x: 520, y: 500 }, sourceSpawnerId: null,
        });
      }
      for (let t = 0; t < 200 && !died; t++) {
        runHostTick(w, d, st);
        died = !w.defenders.has(h.id);
      }
    }
    expect(died, 'she must be destroyable by units, not merely damageable by a test helper').toBe(true);
  });

  it('⭐ …even when she has WALKED AWAY from her hub, with no enemy shape anywhere near', () => {
    /*
     * ⛔ THIS TEST EXISTS BECAUSE A MUTATION TEST SAID THE ENGAGE TERM WAS UNPROVEN.
     *
     * Deleting `defenderInReach` from the SEEKING→ATTACKING condition left the whole suite GREEN. The
     * reason is subtle and worth keeping: every other fixture plants Helga on her own anchor, which is
     * an ENEMY SHAPE, so `structureInReach` was already letting the goblin engage and the strike arm
     * did the rest. The term I added was doing nothing in any test that existed.
     *
     * It is not doing nothing in the GAME: Helga WALKS to her victims (S110 P4), so she routinely
     * stands away from her hub with no shape of her side nearby — and there, without this term, a
     * goblin beside her would never leave SEEKING. That is the case this fixture builds: her anchor is
     * 200 px away, so `structureInReach` cannot be what engages the attacker.
     */
    const w = make1v1();
    // ⚠ 200 px away: comfortably outside a melee goblin's 35 px engage range (GOBLIN_ATTACK_RANGE),
    // so no SHAPE can be what engages him — and comfortably INSIDE her own 380 px leash from home
    // (PRINCESS_SLAP_RANGE), so she pursues him rather than drifting back to her hub and outrunning
    // the fixture. My first attempt put it at 1400 and measured exactly that: she walked home at
    // speed while he trailed behind, and nothing ever met.
    const farAnchor = addPrimAt(w, 1, 700, 500);
    const d0 = makeDefender({
      id: asDefenderId(w.nextDefenderId++),
      kind: 'princess',
      ownerPlayerId: P1,
      anchorPrimitiveId: farAnchor.id,
      recipeId: 'helga',
      pos: { x: 520, y: 500 }, // …but SHE is here, mid-pursuit
      registeredAtTick: w.tick,
    });
    w.defenders.set(d0.id, d0);
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: P0,
      pos: { x: 500, y: 500 }, targetPos: { x: 500, y: 500 }, sourceSpawnerId: null,
    });

    const d = deps();
    const st = makeHostTickState(w);
    /*
     * ⚠ THE ASSERTION IS "HE ENGAGED HER", NOT "HE HURT HER", AND THAT IS THE SHARPER TEST.
     *
     * Measured while writing it: he DOES reach ATTACKING here (t≈140) and then she SLAPS HIM DEAD
     * before his own fire tick comes round — 4 atk / 4 pierce against a 2 hp goblin is a one-shot.
     * Asserting damage would therefore be asserting the outcome of a duel she wins, which says
     * nothing about the term under test. Entering ATTACKING with no shape, no bond, no creature and
     * no castle in reach is something ONLY `defenderInReach` can cause, so that is what is pinned.
     */
    let engaged = false;
    for (let t = 0; t < 200 && !engaged; t++) {
      runHostTick(w, d, st);
      engaged = [...w.creatures.values()].some((c) => c.state === 'ATTACKING');
    }
    expect(
      engaged,
      'with no shape in reach, ONLY the defender engage term can put the goblin into ATTACKING',
    ).toBe(true);
  });

  it('the kill table follows the ROSTER, not a bespoke constant', () => {
    // One strike is the attacker's own atk/pen on the shared ladder, so retuning the goblin retunes
    // what it does to her. Pinning the arithmetic rather than a magic number is what keeps that true.
    const perHit = attackFifths(GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN);
    expect(perHit).toBeGreaterThan(0);
    const w = make1v1();
    const h = plant(w, 'princess', 1, 500, 500);
    damageEntity(w, { kind: 'defender', id: h.id }, perHit, 'creature');
    expect(w.defenders.get(h.id)!.ehp).toBe(HELGA_POOL - perHit);
  });

  it('⭐ is DETERMINISTIC: two identical runs agree on hashWorldStateFull every tick', () => {
    const build = (): World => {
      const w = make1v1();
      plant(w, 'princess', 1, 520, 500);
      applySpawnCreature(w, {
        type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: P0,
        pos: { x: 500, y: 500 }, targetPos: { x: 500, y: 500 }, sourceSpawnerId: null,
      });
      return w;
    };
    const a = build();
    const b = build();
    const da = deps(31);
    const db = deps(31);
    const sa = makeHostTickState(a);
    const sb = makeHostTickState(b);
    for (let t = 0; t < 300; t++) {
      runHostTick(a, da, sa);
      runHostTick(b, db, sb);
      expect(hashWorldStateFull(a), `divergence at tick ${t}`).toBe(hashWorldStateFull(b));
    }
  });

  it('CONTROL — the pool is HASHED, so a host and a mirror cannot silently disagree about her', () => {
    const w = make1v1();
    const h = plant(w, 'princess', 1, 500, 500);
    const before = hashWorldStateFull(w);
    w.defenders.get(h.id)!.ehp = HELGA_POOL - 1;
    expect(hashWorldStateFull(w), 'one point of damage must move the digest').not.toBe(before);
  });

  it('CONTROL — P1 is spared by P1\'s own blast, so the spare is owner-scoped not seat-0-scoped', () => {
    const w = make1v1();
    const h = plant(w, 'princess', 1, 500, 500);
    applyRadialDamage(w, 500, 500, 120, 10, 3, 'hazard', P1);
    expect(w.defenders.get(h.id)!.ehp).toBe(HELGA_POOL);
  });
});
