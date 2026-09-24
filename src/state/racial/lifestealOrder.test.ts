/**
 * SPARK — S188 fix round F1 — ⛔ LIFESTEAL MUST NOT MAKE A MELEE DEPEND ON `world.creatures` ORDER.
 *
 * The S155 N1 defect class. The strike batch defers DEATHS so a mutual exchange resolves
 * simultaneously whoever the loop reaches first. A lifesteal that heals INSIDE the batch reopens the
 * hole: a vampire unit whose own blow lands first is topped up before the incoming blow, and survives;
 * the identical unit a slot later is dead before its heal. So heals made during the batch are
 * ACCUMULATED (`World.pendingLifestealFifths`) and applied just before the deferred sweep, sorted by
 * creature id, skipping anyone who died this tick.
 *
 * The fixture is two identical fights on one board through the REAL host tick. In pair A the vampire
 * is inserted BEFORE its attacker; in pair B AFTER. Warband vs warband: 24-fifth pool, 18-fifth swing,
 * CRIMSON TIDE heals 9. The vampire starts at 12: heal-first it would be 12 + 9 − 18 = 3 and live;
 * struck-first it is 12 − 18 and dead. Both fights must end the same way.
 *
 * ⚠ NO STRIKE IS MUTUAL, AND THAT IS LOAD-BEARING. Two units targeting EACH OTHER are arbitrated by
 * the S156 P4 initiative roll (`winsInitiative`, owner ruling) — only one swings, decided by ids and
 * tick — so a mutual duel would differ between the pairs for a reason that has nothing to do with
 * loop order (the first cut of this test measured exactly that). So the vampire strikes a STUNNED
 * enemy chewer (which targets nobody) while the enemy warband strikes the vampire.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, phaseDurationTicks } from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, makeCreature, type Creature, type CreatureType } from '../creatures/creature.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { damageEntity } from '../damage.ts';
import { applyPendingLifesteal } from './lifesteal.ts';
import { creatureMaxEhp } from '../creatures/creature.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import type { Controls } from '../../input/controls.ts';
import { asPlayerId, asSpawnerId, type PlayerId } from '../../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function board(): World {
  const w = makeWorld(0x188f);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  w.draft = null;
  const vamp = w.players.get(P0)!;
  vamp.raceId = 'vampires';
  vamp.draftPicks = ['racial', 'racial']; // CRIMSON TIDE, 50 %
  const other = w.players.get(P1)!;
  other.raceId = 'orcs';
  other.draftPicks = ['hp', 'def'];
  return w;
}

function unit(w: World, owner: PlayerId, x: number, y: number, type: CreatureType = 't3Warband'): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  w.creatures.set(c.id, c);
  return c;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
const deps = (): HostTickDeps => ({
  spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
  botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
} as unknown as HostTickDeps);

describe('S188 F1 — a vampire melee resolves the same whatever the insertion order', () => {
  it('⛔ two identical duels, vampire inserted first vs second, end identically', () => {
    const w = board();
    // Pair A — the vampire first. Pair B — the attacker first. Far apart, far from both keeps' guns.
    // Each pair: the enemy warband E 25 px behind the vampire V, a stunned enemy chewer X 15 px ahead.
    // V's nearest enemy is X (so V strikes X, not E); E's only enemy is V; X targets nobody.
    const pair = (y: number, vampireFirst: boolean) => {
      const make = () => {
        const v = unit(w, P0, 600, y);
        const x = unit(w, P1, 615, y, 'chewer');
        x.stunnedUntilTick = w.tick + 100_000;
        return { v, x };
      };
      if (vampireFirst) {
        const { v, x } = make();
        return { v, x, e: unit(w, P1, 575, y) };
      }
      const e = unit(w, P1, 575, y);
      return { e, ...make() };
    };
    const A = pair(250, true);
    const B = pair(830, false);
    const vA = A.v, eA = A.e, vB = B.v, eB = B.e;
    vA.ehp = 12;
    vB.ehp = 12;
    expect([...w.creatures.keys()].indexOf(vA.id)).toBeLessThan([...w.creatures.keys()].indexOf(eA.id));
    expect([...w.creatures.keys()].indexOf(vB.id)).toBeGreaterThan([...w.creatures.keys()].indexOf(eB.id));

    const d = deps();
    const st = makeHostTickState(w);
    let struck = false;
    for (let t = 0; t < 200 && !struck; t++) {
      runHostTick(w, d, st);
      // the first exchange has landed once either vampire has been struck or has struck its chewer
      struck = !w.creatures.has(A.x.id) || !w.creatures.has(B.x.id) ||
        (w.creatures.get(vA.id)?.ehp ?? 0) !== 12 || (w.creatures.get(vB.id)?.ehp ?? 0) !== 12;
    }
    expect(struck, 'fixture: the fights engaged').toBe(true);
    expect(w.creatures.has(A.x.id), 'both vampires landed their blow').toBe(w.creatures.has(B.x.id));
    const a = w.creatures.get(vA.id);
    const b = w.creatures.get(vB.id);
    expect(a === undefined, 'pair A vampire alive/dead').toBe(b === undefined);
    expect(a?.ehp).toBe(b?.ehp);
    expect(w.creatures.get(eA.id)?.ehp).toBe(w.creatures.get(eB.id)?.ehp);
    // ⭐ And the rule both now follow: heals land AFTER every blow of the tick, and a unit killed this
    // tick is not healed back over the line — so 12 − 18 is dead in BOTH, whatever the order.
    expect(a).toBeUndefined();
  });
});

describe('S188 F1 — the accumulator itself', () => {
  const vampireAt = (w: World, ehp: number): Creature => {
    const v = unit(w, P0, 600, 250);
    v.ehp = ehp;
    return v;
  };
  const by = (c: Creature) => ({ kind: 'creature' as const, id: c.id });

  it('inside the batch a heal is only SUMMED; it lands at the close, capped at the full pool', () => {
    const w = board();
    const v = vampireAt(w, 5);
    w.pendingCreatureDeaths = new Set();
    w.pendingLifestealFifths = new Map();
    damageEntity(w, { kind: 'castle', seat: P1 }, 18, 'creature', by(v)); // +9
    damageEntity(w, { kind: 'castle', seat: P1 }, 18, 'creature', by(v)); // +9
    expect(v.ehp, 'nothing applied mid-batch').toBe(5);
    expect(w.pendingLifestealFifths.get(v.id)).toBe(18);
    applyPendingLifesteal(w);
    expect(v.ehp).toBe(Math.min(creatureMaxEhp(v), 5 + 18)); // 23 of 24
    expect(w.pendingLifestealFifths.size).toBe(0);
  });

  it('⛔ a unit that died in the batch, or is pending death, is not healed back', () => {
    const w = board();
    const dead = vampireAt(w, 3);
    const doomed = vampireAt(w, 3);
    w.pendingCreatureDeaths = new Set([doomed.id]);
    w.pendingLifestealFifths = new Map([[dead.id, 9], [doomed.id, 9]]);
    dead.ehp = 0;
    applyPendingLifesteal(w);
    expect(dead.ehp).toBe(0);
    expect(doomed.ehp).toBe(3);
  });

  it('outside the batch (no accumulator open) a heal lands at once, as before', () => {
    const w = board();
    const v = vampireAt(w, 5);
    expect(w.pendingLifestealFifths).toBeNull();
    damageEntity(w, { kind: 'castle', seat: P1 }, 18, 'creature', by(v));
    expect(v.ehp).toBe(14);
  });

  it('⛔ the accumulator is null at every tick boundary (never serialized, never hashed)', () => {
    const w = board();
    const d = deps();
    const st = makeHostTickState(w);
    for (let i = 0; i < 5; i++) {
      runHostTick(w, d, st);
      expect(w.pendingLifestealFifths).toBeNull();
    }
  });
});
