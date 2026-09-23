/**
 * SPARK — S188 — ENDLESS DYNASTY (`mummies.l5`): the arithmetic, the four sites of
 * `Player.dynastyHpLost`, the negatives, the A3 sentinel and the REACH through the real host tick.
 * The host-vs-worker proof lives in `racialB.differential.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { CASTLE_MAX_HP, phaseDurationTicks } from '../../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../../game/spawner.ts';
import { drop, pickup } from '../../game/player.ts';
import type { Controls } from '../../input/controls.ts';
import { asPlayerId, asSparkId, asSpawnerId, type PlayerId } from '../../types.ts';
import { damageEntity } from '../damage.ts';
import type { DraftPick } from '../draft.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import type { RaceId } from '../races.ts';
import { mulberry32 } from '../rng.ts';
import { applyNetSnapshot, netSnapshot, restore, snapshot } from '../save.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { T9_BOSS_TYPE } from '../t9BossIds.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import {
  DYNASTY_HP_PER_PHARAOH,
  DYNASTY_LIVE_PHARAOH_SENTINEL,
  livePharaohs,
  pharaohsOwed,
} from './endlessDynasty.ts';
import { drainRacialSpawnQueue, pendingRacialSpawns } from './racialTick.ts';

const P0 = asPlayerId(0); // the mummy seat
const P1 = asPlayerId(1);
const PHARAOH = T9_BOSS_TYPE.mummies;

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function hostDeps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/** A FIGHT world where P0 is `race` with `picks` ("level 5" = index 1). */
function fightWorld(race: RaceId = 'mummies', picks: DraftPick[] = ['hp', 'racial']): World {
  const w = makeWorld(0x5189);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  w.players.get(P0)!.raceId = race;
  w.players.get(P0)!.draftPicks = [...picks];
  w.players.get(P1)!.raceId = 'vampires';
  return w;
}

/** One castle hit through the ONE castle-damage site, then the post-sweep drain. */
function hitCastle(w: World, seat: PlayerId, amount: number): void {
  damageEntity(w, { kind: 'castle', seat }, amount, 'creature', null);
  drainRacialSpawnQueue(w);
}

const pharaohsOf = (w: World, seat: PlayerId = P0) =>
  [...w.creatures.values()].filter((c) => c.type === PHARAOH && c.ownerPlayerId === seat);

describe('ENDLESS DYNASTY — the arithmetic', () => {
  it('his number: one Pharaoh per whole 1,000 lost', () => {
    expect(DYNASTY_HP_PER_PHARAOH).toBe(1000);
    expect(pharaohsOwed(0, 999)).toBe(0);
    expect(pharaohsOwed(0, 1000)).toBe(1);
    expect(pharaohsOwed(999, 1000)).toBe(1);
    expect(pharaohsOwed(1000, 1999)).toBe(0);
    expect(pharaohsOwed(950, 2100)).toBe(2); // one huge hit can cross two thousands
    expect(pharaohsOwed(500, 500)).toBe(0);
  });

  it('A3 — the live-Pharaoh sentinel is 40 per seat (MINE, a performance backstop)', () => {
    expect(DYNASTY_LIVE_PHARAOH_SENTINEL).toBe(40);
  });
});

describe('ENDLESS DYNASTY — counting what the keep ACTUALLY lost', () => {
  it('accrues each hit; the 1,000th point raises ONE Pharaoh at the keep, owned by the seat', () => {
    const w = fightWorld();
    hitCastle(w, P0, 400);
    hitCastle(w, P0, 400);
    expect(w.players.get(P0)!.dynastyHpLost).toBe(800);
    expect(pharaohsOf(w)).toHaveLength(0);
    hitCastle(w, P0, 400);
    expect(w.players.get(P0)!.dynastyHpLost).toBe(1200);
    const ph = pharaohsOf(w);
    expect(ph).toHaveLength(1);
    const a = castleAnchor(0, w.layout);
    expect(Math.hypot(ph[0]!.pos.x - a.x, ph[0]!.pos.y - a.y)).toBeLessThanOrEqual(46 + 1e-6);
    expect(ph[0]!.sourceSpawnerId).toBeNull(); // the tier-9 release shape, exempt from the latch
  });

  it('counts AFTER the keep’s purchased DEF', () => {
    const w = fightWorld();
    const pl = w.players.get(P0)!;
    pl.castleUpgrades = { ...pl.castleUpgrades, defLevel: 5 }; // floor(amount × 5 / 10)
    hitCastle(w, P0, 300);
    expect(w.players.get(P0)!.dynastyHpLost).toBe(150);
    expect(w.players.get(P0)!.castleHp).toBe(CASTLE_MAX_HP - 150);
  });

  it('⚠ MINE — a killing blow’s overkill is not a loss, and a fallen keep raises nobody', () => {
    const w = fightWorld();
    w.players.get(P0)!.castleHp = 300;
    w.players.get(P0)!.dynastyHpLost = 900;
    hitCastle(w, P0, 5000);
    expect(w.players.get(P0)!.castleHp).toBe(0);
    expect(w.players.get(P0)!.dynastyHpLost).toBe(1200); // +300, not +5000
    expect(pharaohsOf(w)).toHaveLength(0);
  });

  it('⛔ one hit that crosses TWO thousands raises TWO — the latch must not eat the second', () => {
    const w = fightWorld();
    w.players.get(P0)!.dynastyHpLost = 950;
    hitCastle(w, P0, 1150); // 950 → 2100
    expect(pharaohsOf(w)).toHaveLength(2);
  });

  it('regeneration never un-counts a loss', () => {
    const w = fightWorld();
    hitCastle(w, P0, 700);
    w.players.get(P0)!.castleHp = CASTLE_MAX_HP; // as if the regen had healed it all back
    hitCastle(w, P0, 300);
    expect(w.players.get(P0)!.dynastyHpLost).toBe(1000);
    expect(pharaohsOf(w)).toHaveLength(1);
  });

  it('A5 — the Pharaoh is QUEUED at the hit and born only at the drain', () => {
    const w = fightWorld();
    w.players.get(P0)!.dynastyHpLost = 990;
    damageEntity(w, { kind: 'castle', seat: P0 }, 20, 'creature', null);
    expect(pendingRacialSpawns(w)).toBe(1);
    expect(pharaohsOf(w)).toHaveLength(0);
    drainRacialSpawnQueue(w);
    expect(pharaohsOf(w)).toHaveLength(1);
  });

  it('⛔ A3 — at 40 live Pharaohs the next one is NOT born, and its 1,000 is still consumed', () => {
    const w = fightWorld();
    const a = castleAnchor(0, w.layout);
    for (let i = 0; i < DYNASTY_LIVE_PHARAOH_SENTINEL; i++) {
      dispatch(w, { type: 'SPAWN_CREATURE', creatureType: PHARAOH, ownerPlayerId: P0, pos: { ...a }, targetPos: { ...a } });
    }
    expect(livePharaohs(w, P0)).toBe(DYNASTY_LIVE_PHARAOH_SENTINEL);
    w.players.get(P0)!.dynastyHpLost = 990;
    hitCastle(w, P0, 20);
    expect(livePharaohs(w, P0)).toBe(DYNASTY_LIVE_PHARAOH_SENTINEL);
    expect(w.players.get(P0)!.dynastyHpLost).toBe(1010); // consumed, never rewound
    // …and one fewer live Pharaoh lets the NEXT thousand through again.
    w.creatures.delete(pharaohsOf(w)[0]!.id);
    hitCastle(w, P0, 1000);
    expect(livePharaohs(w, P0)).toBe(DYNASTY_LIVE_PHARAOH_SENTINEL);
  });
});

describe('ENDLESS DYNASTY — negatives: nothing counts and nothing rises', () => {
  const nothing = (w: World): void => {
    w.players.get(P0)!.dynastyHpLost = 0;
    hitCastle(w, P0, 2500 - 1);
    expect(w.players.get(P0)!.dynastyHpLost).toBe(0);
    expect(pharaohsOf(w)).toHaveLength(0);
  };

  it('a mummy seat WITHOUT the level-5 perk (took the general option at wave 6)', () => {
    nothing(fightWorld('mummies', ['hp', 'def']));
  });

  it('a mummy seat that took the LEVEL-0 racial only', () => {
    nothing(fightWorld('mummies', ['racial', 'hp']));
  });

  it('a seat of ANOTHER race that took ITS level-5 racial', () => {
    nothing(fightWorld('zombies', ['hp', 'racial']));
  });

  it('an ENEMY castle being hit accrues nothing for the mummy seat', () => {
    const w = fightWorld();
    hitCastle(w, P1, 2000);
    expect(w.players.get(P0)!.dynastyHpLost).toBe(0);
    expect(w.players.get(P1)!.dynastyHpLost).toBe(0);
    expect(pharaohsOf(w, P0)).toHaveLength(0);
    expect(pharaohsOf(w, P1)).toHaveLength(0);
  });
});

describe('ENDLESS DYNASTY — Player.dynastyHpLost, the four sites', () => {
  it('SAVE: survives snapshot → restore (worker INIT, host migration)', () => {
    const w = fightWorld();
    w.players.get(P0)!.dynastyHpLost = 1734;
    const dst = makeWorld(1);
    restore(JSON.parse(JSON.stringify(snapshot(w))), dst);
    expect(dst.players.get(P0)!.dynastyHpLost).toBe(1734);
  });

  it('WIRE: survives netSnapshot → applyNetSnapshot, and costs NO bytes at zero', () => {
    const w = fightWorld();
    const zero = JSON.stringify(netSnapshot(w));
    expect(zero).not.toContain('dynastyHpLost');
    w.players.get(P0)!.dynastyHpLost = 42;
    const dst = makeWorld(1);
    applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(w))), dst);
    expect(dst.players.get(P0)!.dynastyHpLost).toBe(42);
  });

  it('WIRE: a malformed value is floored and clamped, never trusted', () => {
    const w = fightWorld();
    w.players.get(P0)!.dynastyHpLost = 5;
    const snap = JSON.parse(JSON.stringify(netSnapshot(w)));
    snap.players.find((p: { id: number }) => p.id === 0).dynastyHpLost = -7.5;
    const dst = makeWorld(1);
    applyNetSnapshot(snap, dst);
    expect(dst.players.get(P0)!.dynastyHpLost).toBe(0);
  });

  it('HASH: the running loss moves the wide hash (a Pharaoh’s tick depends on it)', () => {
    const w = fightWorld();
    const before = hashWorldStateFull(w);
    w.players.get(P0)!.dynastyHpLost = 1;
    expect(hashWorldStateFull(w)).not.toBe(before);
  });

  it('CARRY FSM: picking up and dropping a shape keeps the count', () => {
    const w = fightWorld();
    const p = w.players.get(P0)!;
    p.dynastyHpLost = 777;
    const carrying = pickup(p, asSparkId(5));
    expect(carrying.dynastyHpLost).toBe(777);
    expect(drop(carrying).dynastyHpLost).toBe(777);
  });

  it('MATCH RESET: a rematch starts every seat at zero', () => {
    const w = fightWorld();
    w.players.get(P0)!.dynastyHpLost = 1500;
    w.gameState = 'TITLE';
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    expect(w.players.get(P0)!.dynastyHpLost).toBe(0);
  });
});

describe('ENDLESS DYNASTY — REACH: a real host tick, a real enemy, a real castle hit', () => {
  /**
   * An enemy tier-9 boss parked in reach of P0's keep with nothing else to hit. The AI marches it,
   * the strike lands through `applyCreatureAttack`'s castle arm → `damageEntity` → the accrual, and
   * the drain raises the Pharaoh — nothing here is called by hand. The count starts just short of a
   * thousand so the first real swing crosses it.
   */
  function siege(picks: DraftPick[]): { w: World; crossTick: number } {
    const w = fightWorld('mummies', picks);
    w.players.get(P0)!.dynastyHpLost = picks[1] === 'racial' ? 990 : 0;
    const a = castleAnchor(0, w.layout);
    const at = { x: a.x + 60, y: a.y };
    dispatch(w, {
      type: 'SPAWN_CREATURE', creatureType: 't9BossVampires', ownerPlayerId: P1,
      pos: at, targetPos: at, sourceSpawnerId: asSpawnerId(77),
    });
    const deps = hostDeps();
    const state = makeHostTickState(w);
    for (let i = 0; i < 1200; i++) {
      runHostTick(w, deps, state);
      if (w.players.get(P0)!.castleHp < CASTLE_MAX_HP) return { w, crossTick: w.tick };
    }
    throw new Error('fixture: the boss never hit the keep in 1200 ticks');
  }

  it('with the perk: the first real castle hit crosses 1,000 and a Pharaoh rises that tick', () => {
    const { w, crossTick } = siege(['hp', 'racial']);
    expect(w.players.get(P0)!.dynastyHpLost).toBeGreaterThanOrEqual(1000);
    const ph = pharaohsOf(w);
    expect(ph).toHaveLength(1);
    expect(ph[0]!.spawnedAtTick).toBe(crossTick);
  });

  it('without the perk: the same siege raises nobody and counts nothing', () => {
    const { w } = siege(['hp', 'def']);
    expect(w.players.get(P0)!.dynastyHpLost).toBe(0);
    expect(pharaohsOf(w)).toHaveLength(0);
  });
});
