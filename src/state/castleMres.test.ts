/**
 * SPARK — S192 (owner) — ⭐ THE KEEP'S OWN MAGIC RESISTANCE AXIS.
 *
 * *"when you're doing castle upgrades, you should be able to do either defense or resistance … All the
 * stats the castle starts with are gonna be as is and whatever amount of defense it currently has just
 * give it the same amount of magic resistance but moving forward there should be … its own upgrades for …
 * magic resistance or defense."*
 *
 * Driven through the REAL reducer (`UPGRADE_CASTLE_STAT`), the REAL damage funnel, and — for reach — the
 * REAL host tick with a Voltkin zapping a keep (the Voltkin's strike is magic, spec Q-V). Plus the four
 * sites: the factory (`emptyCastleUpgrades`), the wire (`snapshot`/`restore`), the wide hash, the rematch.
 */
import { describe, expect, it } from 'vitest';
import { dispatch, makeWorld, type World } from './world.ts';
import { damageEntity } from './damage.ts';
import {
  CASTLE_STATS, CASTLE_UPGRADE_MAX_LEVEL, CASTLE_UPGRADE_PRICE, castleMagicDamageAfterResist,
  castleMaxHpFor, castleUpgradePreview, emptyCastleUpgrades,
} from './castleUpgrades.ts';
import { castleMresLevel } from './magicResist.ts';
import { PLAYER_COLORS, phaseDurationTicks } from '../constants.ts';
import { asPlayerId, asSpawnerId, type PlayerId } from '../types.ts';
import { snapshot, restore } from './save.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { asCreatureId, makeCreature } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import type { Controls } from '../input/controls.ts';
import type { CreatureType } from './creatures/creature.ts';

function funded(points: number): { w: World; seat: PlayerId } {
  const w = makeWorld(0x192c);
  const seat = [...w.players.keys()][0] as PlayerId;
  w.scoreByPlayer.set(seat, points);
  return { w, seat };
}
const buy = (w: World, seat: PlayerId, stat: string): void => {
  dispatch(w, { type: 'UPGRADE_CASTLE_STAT', playerId: seat, stat } as never);
};

describe('S192 castle MRES — the purchase, through the real reducer', () => {
  it('MRES is a fifth axis on the wire validator, priced and capped exactly like DEF', () => {
    expect(CASTLE_STATS).toContain('mres');
    const { w, seat } = funded(CASTLE_UPGRADE_PRICE * (CASTLE_UPGRADE_MAX_LEVEL + 2));
    for (let i = 0; i < CASTLE_UPGRADE_MAX_LEVEL + 2; i++) buy(w, seat, 'mres');
    const u = w.players.get(seat)!.castleUpgrades;
    expect(u.mresLevel, 'capped at CASTLE_UPGRADE_MAX_LEVEL').toBe(CASTLE_UPGRADE_MAX_LEVEL);
    expect(w.scoreByPlayer.get(seat), 'the two over-cap presses took nothing').toBe(CASTLE_UPGRADE_PRICE * 2);
  });

  it('⛔ cannot be afforded below 100 VP, and a FALLEN keep buys nothing (R131)', () => {
    const poor = funded(CASTLE_UPGRADE_PRICE - 1);
    buy(poor.w, poor.seat, 'mres');
    expect(poor.w.players.get(poor.seat)!.castleUpgrades.mresLevel).toBe(0);
    const dead = funded(CASTLE_UPGRADE_PRICE);
    dead.w.players.get(dead.seat)!.castleHp = 0;
    buy(dead.w, dead.seat, 'mres');
    expect(dead.w.players.get(dead.seat)!.castleUpgrades.mresLevel).toBe(0);
    expect(dead.w.scoreByPlayer.get(dead.seat)).toBe(CASTLE_UPGRADE_PRICE);
  });

  it('⭐ HIS: a DEF point no longer raises MRES, and an MRES point raises only MRES', () => {
    const { w, seat } = funded(CASTLE_UPGRADE_PRICE * 6);
    for (let i = 0; i < 3; i++) buy(w, seat, 'def');
    let u = w.players.get(seat)!.castleUpgrades;
    expect([u.defLevel, u.mresLevel, castleMresLevel(u)]).toEqual([3, 0, 0]);
    for (let i = 0; i < 2; i++) buy(w, seat, 'mres');
    u = w.players.get(seat)!.castleUpgrades;
    expect([u.defLevel, u.mresLevel, castleMresLevel(u)]).toEqual([3, 2, 2]);
    expect(u.hpLevel + u.atkLevel + u.penLevel).toBe(0);
  });

  it('⭐ HIS: the keep STARTS with MRES = its starting DEF', () => {
    const u = emptyCastleUpgrades();
    expect(castleMresLevel(u)).toBe(u.defLevel);
  });

  it('the preview names what the next point buys (⚠ MINE wording)', () => {
    expect(castleUpgradePreview(emptyCastleUpgrades(), 'mres', 1)).toBe('-17% MAGIC');
    expect(castleUpgradePreview({ ...emptyCastleUpgrades(), mresLevel: 10 }, 'mres', 1)).toBe('MAX');
  });
});

describe('S192 castle MRES — incoming damage, through the real funnel', () => {
  function keep(def: number, mres: number): { w: World; seat: PlayerId } {
    const f = funded(0);
    f.w.players.get(f.seat)!.castleUpgrades = { ...emptyCastleUpgrades(), defLevel: def, mresLevel: mres };
    return f;
  }
  const lost = (f: { w: World; seat: PlayerId }): number =>
    castleMaxHpFor(f.w.players.get(f.seat)!.castleUpgrades) - f.w.players.get(f.seat)!.castleHp;

  it('MAGIC is defended by MRES: floor(amount × 5 / (5 + mres)), never below 1 — DEF does not touch it', () => {
    const k = keep(5, 5);
    damageEntity(k.w, { kind: 'castle', seat: k.seat }, 100, 'creature', null, 'magic');
    expect(lost(k)).toBe(50);
    const defOnly = keep(10, 0);
    damageEntity(defOnly.w, { kind: 'castle', seat: defOnly.seat }, 100, 'creature', null, 'magic');
    expect(lost(defOnly), 'bought DEF does not defend magic').toBe(100);
    const tiny = keep(0, 10);
    damageEntity(tiny.w, { kind: 'castle', seat: tiny.seat }, 1, 'creature', null, 'magic');
    expect(lost(tiny), 'never below 1').toBe(1);
    expect(castleMagicDamageAfterResist(100, { ...emptyCastleUpgrades(), mresLevel: 5 })).toBe(50);
  });

  it('⛔ PHYSICAL is still defended by DEF only — MRES does not touch it', () => {
    const k = keep(0, 10);
    damageEntity(k.w, { kind: 'castle', seat: k.seat }, 100, 'creature', null, 'physical');
    expect(lost(k)).toBe(100);
    const d = keep(5, 0);
    damageEntity(d.w, { kind: 'castle', seat: d.seat }, 100, 'creature', null, 'physical');
    expect(lost(d)).toBe(50);
  });
});

describe('S192 castle MRES — ⭐ REACH: a Voltkin zapping a keep, through the real host tick', () => {
  const stub = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
  function siege(attacker: CreatureType, def: number, mres: number): number[] {
    const w = makeWorld(0x192d);
    w.gameState = 'TITLE';
    dispatch(w, {
      type: 'START_GAME', mode: '1v1', isHost: true,
      roster: [{ seat: 0, color: PLAYER_COLORS[0], raceId: 'orcs' }, { seat: 1, color: PLAYER_COLORS[1], raceId: 'orcs' }],
    } as never);
    w.gameState = 'PLAYING';
    w.isHost = true;
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT') * 100;
    w.creatures.clear();
    w.draft = null;
    const P0 = asPlayerId(0);
    w.players.get(P0)!.castleUpgrades = { ...emptyCastleUpgrades(), defLevel: def, mresLevel: mres };
    w.players.get(P0)!.castleHp = castleMaxHpFor(w.players.get(P0)!.castleUpgrades);
    const home = castleAnchor(0, w.layout);
    const c = makeCreature(getCreatureConfig(attacker), {
      id: asCreatureId(w.nextCreatureId++), ownerPlayerId: asPlayerId(1), pos: { x: home.x + 40, y: home.y },
      targetPos: { x: home.x, y: home.y }, spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(991), clock: w,
    });
    c.ehp = 1_000_000; c.maxEhp = 1_000_000; // the castle gun shoots it; it must stay to swing
    w.creatures.set(c.id, c);
    const deps = {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stub, botManager: null,
      gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
    } as unknown as HostTickDeps;
    const st = makeHostTickState(w);
    const hits: number[] = [];
    let hp = w.players.get(P0)!.castleHp;
    for (let i = 0; i < 900; i++) {
      runHostTick(w, deps, st);
      const now = w.players.get(P0)!.castleHp;
      if (now < hp) hits.push(hp - now);
      hp = now;
    }
    return hits;
  }

  it('the Voltkin zap (magic, 33) lands 33 × 5/10 = 16 on a keep with MRES 5 — and its full 33 on one with DEF 5', () => {
    const resisted = siege('voltkin', 0, 5);
    const armoured = siege('voltkin', 5, 0);
    expect(resisted.length, 'the Voltkin reached the keep and zapped it').toBeGreaterThan(0);
    expect(armoured.length).toBeGreaterThan(0);
    expect(new Set(resisted)).toEqual(new Set([16]));
    expect(new Set(armoured), 'DEF is no defence against magic').toEqual(new Set([33]));
  });

  it('⛔ NEGATIVE — a goblin swing (physical, 12) is untouched by MRES and cut by DEF', () => {
    expect(new Set(siege('goblinMelee', 0, 10))).toEqual(new Set([12]));
    expect(new Set(siege('goblinMelee', 5, 0))).toEqual(new Set([6]));
  });
});

describe('S192 castle MRES — the four sites', () => {
  it('the wire: round-trips; omitted when 0 so an S187-only keep is byte-identical; absent loads as 0', () => {
    const { w, seat } = funded(CASTLE_UPGRADE_PRICE * 2);
    buy(w, seat, 'def');
    const s187 = snapshot(w).players.find((p) => p.id === seat)!.castleUpgrades!;
    expect('mresLevel' in s187, 'not emitted while 0').toBe(false);
    buy(w, seat, 'mres');
    const snap = snapshot(w);
    expect(snap.players.find((p) => p.id === seat)!.castleUpgrades!.mresLevel).toBe(1);
    const back = makeWorld(0x192c);
    restore(JSON.parse(JSON.stringify(snap)), back);
    expect(back.players.get(seat)!.castleUpgrades.mresLevel).toBe(1);
    const old = JSON.parse(JSON.stringify(snap));
    delete old.players.find((p: { id: number }) => p.id === seat).castleUpgrades.mresLevel;
    const legacy = makeWorld(0x192c);
    restore(old, legacy);
    expect(legacy.players.get(seat)!.castleUpgrades.mresLevel).toBe(0);
  });

  it('the wide hash sees it', () => {
    const a = funded(0);
    const b = funded(0);
    expect(hashWorldStateFull(a.w)).toBe(hashWorldStateFull(b.w));
    b.w.players.get(b.seat)!.castleUpgrades = { ...emptyCastleUpgrades(), mresLevel: 1 };
    expect(hashWorldStateFull(a.w)).not.toBe(hashWorldStateFull(b.w));
  });

  it('the factory starts at 0, and a new match (START_GAME) resets a bought MRES', () => {
    expect(emptyCastleUpgrades().mresLevel).toBe(0);
    const w = makeWorld(0x192e);
    w.gameState = 'TITLE';
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true } as never);
    const seat = asPlayerId(0);
    w.players.get(seat)!.castleUpgrades = { ...emptyCastleUpgrades(), mresLevel: 7 };
    w.gameState = 'TITLE';
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true } as never);
    expect(w.players.get(seat)!.castleUpgrades.mresLevel).toBe(0);
  });
});
