/**
 * S196 `s196/tower-fx` (owner R196-T1) — **EVERY TOWER'S SIGNATURE.** Pure drawer per kind (deterministic
 * for an id/tick, alive over ticks, flares on the act, LOW lighter, smoke never on the bloomed layer), the
 * census (every `GodlyId` has one and every kind draws), the defender act arithmetic, and REACH through the
 * real `SpawnerZoneRenderer.sync` for a spawner and a defender of every kind — with the flare read off
 * synced state (a creature's `spawnedAtTick`/`sourceSpawnerId`; a defender's FSM) — plus the negatives:
 * no building drawn (no foot), an enemy tower in fog, and MINIMAL/`?fx=legacy` all draw nothing.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { recordingSink, type FxEmitRecord } from './emitter.ts';
import { setFxHooks, setFxLegacyFlag } from './fxState.ts';
import {
  TOWER_SIGNATURE, TOWER_SIG_FLARE_TICKS, TOWER_SIG_NO_ACT, bossHeartbeat, defenderSigAct, towerSigFlare,
  towerSignatureFx, type TowerSigKind,
} from './towerSignatureFx.ts';
import { SpawnerZoneRenderer } from '../spawnerZoneRenderer.ts';
import { __resetTowerCoverForTests, beginTowerCoverFrame, markTowerCover } from '../towerCover.ts';
import { beginConcealmentFrame, isConcealed, resetConcealmentForTest } from '../concealment.ts';
import { DEFENDER_FIRE_HOLD_TICKS, PLAYER_COLORS, PRIMITIVE_MAX_HP } from '../../constants.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { makeWorld } from '../../state/world.ts';
import { ALL_BLUEPRINT_IDS } from '../../state/blueprints.ts';
import { getDefenderConfig } from '../../state/defenders/defender.ts';
import { ALL_RACES, type RaceId } from '../../state/races.ts';
import type { GodlyId } from '../../state/godlyRecipes/types.ts';
import { asPlayerId, asPrimitiveId } from '../../types.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FOOT = { x: 400, y: 500, w: 120, h: 120 };
const ALL_KINDS: readonly TowerSigKind[] = ['goblinForge', 'laserCore', 'pentagramRunes', 'helgaHearth', 'stinkFumes', 'hubArcs', 'tvStatic', 'race3', 'boss9'];

interface Sinks { ground: ReturnType<typeof recordingSink>; top: ReturnType<typeof recordingSink>; shade: ReturnType<typeof recordingSink> }
function sinks(): Sinks { return { ground: recordingSink(), top: recordingSink(), shade: recordingSink() }; }
function all(s: Sinks): FxEmitRecord[] { return [...s.ground.out, ...s.top.out, ...s.shade.out]; }
function draw(kind: TowerSigKind, tick: number, opts: { low?: boolean; actAge?: number; charge?: number; race?: RaceId | null; id?: number } = {}): Sinks {
  const s = sinks();
  const race = 'race' in opts ? opts.race ?? null : 'orcs';
  towerSignatureFx(s, kind, opts.id ?? 7, FOOT.x, FOOT.y, FOOT.w, FOOT.h, tick, opts.low ?? false, opts.actAge ?? TOWER_SIG_NO_ACT, opts.charge ?? 0.5, race);
  return s;
}
const lum = (out: FxEmitRecord[]): number => out.reduce((a, e) => a + e.alpha * e.w * e.h, 0);

describe('S196 — the CENSUS: every tower id has a signature, and every kind draws', () => {
  it('⛔ every buildable tower id (ALL_BLUEPRINT_IDS) maps to a signature', () => {
    for (const id of ALL_BLUEPRINT_IDS) expect(TOWER_SIGNATURE[id], `${id} has no signature`).toBeDefined();
    // and the map covers exactly the buildable set (anti-vacuity: 19 at S196)
    expect(Object.keys(TOWER_SIGNATURE).sort()).toEqual([...ALL_BLUEPRINT_IDS].sort());
    expect(ALL_BLUEPRINT_IDS.length).toBeGreaterThanOrEqual(19);
  });
  it('⛔ every signature kind is used by some tower, and draws sprites (no kind is a silent no-op)', () => {
    const used = new Set(Object.values(TOWER_SIGNATURE));
    for (const k of ALL_KINDS) {
      expect(used.has(k), `${k} unused`).toBe(true);
      // over a short window (the hub's arcs and the TV's stray arc are periodic)
      let n = 0;
      for (let t = 1000; t < 1120; t += 7) n += all(draw(k, t)).length;
      expect(n, `${k} drew nothing`).toBeGreaterThan(20);
    }
  });
  it('⛔ the census source: the sync site dispatches through TOWER_SIGNATURE for BOTH collections', () => {
    const src = readFileSync(join(__dirname, '..', 'spawnerZoneRenderer.ts'), 'utf8');
    expect(src.match(/TOWER_SIGNATURE\[(sp|d)\.recipeId\]/g)?.length).toBe(2);
    const tv = readFileSync(join(__dirname, '..', 'voltkinTowerRenderer.ts'), 'utf8');
    expect(tv).toMatch(/towerSignatureFx\([^;]*'tvStatic'/);
  });
});

describe('S196 — each drawer, pure', () => {
  for (const k of ALL_KINDS) {
    it(`${k}: deterministic for (id, tick); alive (differs a few ticks later); light only on the bloomed layer`, () => {
      expect(all(draw(k, 1234))).toEqual(all(draw(k, 1234)));
      expect(all(draw(k, 1234))).not.toEqual(all(draw(k, 1240)));
      expect(all(draw(k, 1234, { id: 8 }))).not.toEqual(all(draw(k, 1234, { id: 7 })));
      for (let t = 1000; t < 1100; t += 9) {
        const s = draw(k, t, { actAge: 4 });
        expect(s.top.out.every((e) => e.blend === 'add'), 'normal-blend on top').toBe(true);
        expect(s.ground.out.every((e) => e.blend === 'add')).toBe(true);
        expect(s.shade.out.every((e) => e.blend === 'normal'), 'shade is normal-blend only').toBe(true);
        // every sprite stays near its tower (no NaN, no runaway)
        for (const e of all(s)) {
          expect(Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.w) && Number.isFinite(e.alpha)).toBe(true);
          expect(Math.abs(e.x - FOOT.x)).toBeLessThan(FOOT.w * 2.5);
          expect(e.y).toBeGreaterThan(FOOT.y - FOOT.h * 3);
          expect(e.y).toBeLessThan(FOOT.y + FOOT.h);
        }
      }
    });
    it(`${k}: LOW draws fewer sprites than HIGH (summed over a window)`, () => {
      let hi = 0;
      let lo = 0;
      for (let t = 2000; t < 2200; t += 5) { hi += all(draw(k, t)).length; lo += all(draw(k, t, { low: true })).length; }
      expect(lo).toBeLessThan(hi);
    });
  }

  const acting: readonly TowerSigKind[] = ['goblinForge', 'laserCore', 'pentagramRunes', 'helgaHearth', 'stinkFumes', 'race3', 'boss9'];
  for (const k of acting) {
    it(`⭐ ${k}: FLARES on the act — brighter at actAge 2 than with no act, and back to idle after the flare`, () => {
      const t = 3000;
      const idle = lum(all(draw(k, t)));
      const act = lum(all(draw(k, t, { actAge: 2 })));
      expect(act).toBeGreaterThan(idle * 1.15);
      expect(all(draw(k, t, { actAge: TOWER_SIG_FLARE_TICKS + 1 }))).toEqual(all(draw(k, t)));
    });
  }
  it('⭐ laserCore: the charge shows — a full charge glows brighter than an empty one', () => {
    expect(lum(all(draw('laserCore', 500, { charge: 1 })))).toBeGreaterThan(lum(all(draw('laserCore', 500, { charge: 0 }))) * 1.2);
  });
  it('⭐ stinkFumes: the wind-up thickens the fumes', () => {
    let lo = 0;
    let hi = 0;
    for (let t = 500; t < 600; t += 3) {
      lo += draw('stinkFumes', t, { charge: 0 }).shade.out.reduce((a, e) => a + e.alpha, 0);
      hi += draw('stinkFumes', t, { charge: 1 }).shade.out.reduce((a, e) => a + e.alpha, 0);
    }
    expect(hi).toBeGreaterThan(lo * 1.4);
  });
  it('race3 / boss9: each race draws its own motif; the boss is heavier than the tier-3', () => {
    const pics = ALL_RACES.map((r) => JSON.stringify(all(draw('race3', 777, { race: r }))));
    expect(new Set(pics).size).toBe(ALL_RACES.length);
    for (const r of ALL_RACES) {
      let a = 0;
      let b = 0;
      for (let t = 0; t < 200; t += 5) { a += lum(all(draw('race3', t, { race: r }))); b += lum(all(draw('boss9', t, { race: r }))); }
      expect(b, r).toBeGreaterThan(a);
    }
    // no race → nothing (a recipe that is not a race tower never reaches race3/boss9 with null)
    expect(all(draw('race3', 777, { race: null }))).toEqual([]);
  });
  it('the boss heartbeat is a double beat inside [0, 1]', () => {
    const v = Array.from({ length: 100 }, (_, i) => bossHeartbeat(i / 100));
    expect(Math.max(...v)).toBeLessThanOrEqual(1);
    expect(Math.min(...v)).toBeGreaterThanOrEqual(0);
    expect(bossHeartbeat(0.1)).toBeGreaterThan(0.9);
    expect(bossHeartbeat(0.3)).toBeGreaterThan(0.6);
    expect(bossHeartbeat(0.65)).toBeLessThan(0.01);
  });
});

describe('S196 — the act arithmetic (pure)', () => {
  it('towerSigFlare: 1 at the act, 0 at and past the flare, 0 for no act / a future tick', () => {
    expect(towerSigFlare(0)).toBe(1);
    expect(towerSigFlare(TOWER_SIG_FLARE_TICKS)).toBe(0);
    expect(towerSigFlare(TOWER_SIG_NO_ACT)).toBe(0);
    expect(towerSigFlare(-5)).toBe(0);
    expect(towerSigFlare(TOWER_SIG_FLARE_TICKS / 2)).toBeCloseTo(0.25);
  });
  it('defenderSigAct: FIRE/RECOVER carry the act age; IDLE charges toward nextFireTick; WINDUP is its own progress', () => {
    expect(defenderSigAct('FIRE', 3, 0, 100, 225, 3, DEFENDER_FIRE_HOLD_TICKS)).toEqual({ actAge: 3, charge: 0 });
    expect(defenderSigAct('RECOVER', 2, 0, 100, 225, 3, DEFENDER_FIRE_HOLD_TICKS)).toEqual({ actAge: DEFENDER_FIRE_HOLD_TICKS + 2, charge: 0 });
    expect(defenderSigAct('IDLE', 0, 1225, 1000, 225, 3, 12).charge).toBe(0);
    expect(defenderSigAct('IDLE', 0, 1000 + 225 / 2, 1000, 225, 3, 12).charge).toBeCloseTo(0.5);
    expect(defenderSigAct('IDLE', 50, 900, 1000, 225, 3, 12)).toEqual({ actAge: TOWER_SIG_NO_ACT, charge: 1 });
    expect(defenderSigAct('WINDUP', 10, 0, 0, 240, 20, 12).charge).toBe(0.5);
    expect(defenderSigAct('DORMANT', 10, 0, 0, 240, 20, 12)).toEqual({ actAge: TOWER_SIG_NO_ACT, charge: 0 });
  });
});

/* ── REACH — through the real `SpawnerZoneRenderer.sync` ───────────────────────────────────────── */

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
let hooks: Sinks;
function install(): void { hooks = sinks(); setFxHooks({ top: hooks.top, shade: hooks.shade, ground: hooks.ground, shock: { shock() {} } }); }

const ANCHOR = asPrimitiveId(5);
function towerWorld(recipeId: GodlyId, owner = P0, at = { x: 400, y: 450 }) {
  const w: any = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]));
  w.primitives.set(ANCHOR, { id: ANCHOR, type: 0, placerColor: 0, placedBy: owner, createdTick: 0, pos: { ...at }, prevPos: { ...at }, bonds: new Set(), ownerColor: 0, lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null });
  const kind = recipeId === 'laserTurret' ? 'turret' : recipeId === 'helga' ? 'princess' : recipeId === 'stinkTower' ? 'stinkTower' : null;
  if (kind !== null) {
    w.defenders.set(3, { id: 3, kind, ownerPlayerId: owner, anchorPrimitiveId: ANCHOR, recipeId, pos: { ...at }, prevPos: { ...at }, walkTargetPos: null, state: 'IDLE', ticksInState: 0, nextFireTick: 0, ehp: null, bagsRemaining: 0, targetCreatureId: null, lastStrikePos: null });
  } else {
    w.creatureSpawners.set(1, { id: 1, anchorPrimitiveId: ANCHOR, recipeId, ownerPlayerId: owner });
  }
  return w;
}
/** One frame of the real renderer with the tower's building drawn (a published foot) or not. */
function frame(w: any, opts: { withFoot?: boolean; legacy?: boolean; tick?: number } = {}): Sinks {
  __resetTowerCoverForTests(); // each frame stands alone (no group history leaks between fixtures)
  const r = new SpawnerZoneRenderer({} as never, new Container());
  const t = opts.tick ?? 4000;
  w.tick = t - 1;
  beginTowerCoverFrame(w);
  if (opts.withFoot ?? true) markTowerCover([ANCHOR], [], 0, { x: 400, y: 510, w: 120, h: 120 });
  w.tick = t;
  beginTowerCoverFrame(w);
  install();
  setFxLegacyFlag(opts.legacy ?? false);
  r.sync(w);
  return hooks;
}

beforeEach(() => { __resetTowerCoverForTests(); resetConcealmentForTest(); setFxLegacyFlag(false); });
afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); __resetTowerCoverForTests(); resetConcealmentForTest(); });

const REACH_IDS: readonly GodlyId[] = ALL_BLUEPRINT_IDS.filter((id) => id !== 'voltkin'); // the TV is not a record

describe('S196 REACH — `SpawnerZoneRenderer.sync` draws every tower\'s signature', () => {
  for (const id of REACH_IDS) {
    it(`⭐ ${id}: drawn while its building stands; ⛔ nothing without a foot; ⛔ nothing under MINIMAL/legacy`, () => {
      // the drawer's own output at this tick, for the same id/foot, is what the renderer must emit
      const on = frame(towerWorld(id));
      expect(all(on).length, `${id}: no signature drawn`).toBeGreaterThan(3);
      expect(all(frame(towerWorld(id), { withFoot: false })), `${id}: drew with no building`).toEqual([]);
      expect(all(frame(towerWorld(id), { legacy: true })), `${id}: drew in legacy/MINIMAL`).toEqual([]);
    });
  }

  it('⛔ NEGATIVE — an ENEMY tower in fog draws nothing; the same tower in the open does', () => {
    const fogged = (): any => {
      const w = towerWorld('t3TowerOrcs', P1, { x: 1700, y: 950 });
      w.gameMode = '1v1'; w.gameState = 'PLAYING'; w.matchPhase = 'BUILD'; w.localPlayerId = 0;
      return w;
    };
    const w = fogged();
    beginConcealmentFrame(w, { x: 100, y: 100 });
    expect(isConcealed(400, 510, P1), 'fixture: the foot is in fog').toBe(true);
    expect(all(frame(w))).toEqual([]);
    const w2 = fogged();
    beginConcealmentFrame(w2, { x: 400, y: 510 }); // the cursor is the local player's vision source
    expect(isConcealed(400, 510, P1), 'fixture: the cursor lights the foot').toBe(false);
    expect(all(frame(w2)).length).toBeGreaterThan(3);
  });

  it('⭐ the SPAWNER flare is read off synced births: a creature this spawner minted 2 ticks ago lights it up', () => {
    const base = lum(all(frame(towerWorld('goblinTower'))));
    const w = towerWorld('goblinTower');
    w.creatures.set(77, { id: 77, sourceSpawnerId: 1, spawnedAtTick: 3998 });
    const lit = lum(all(frame(w)));
    expect(lit).toBeGreaterThan(base * 1.15);
    // ⛔ another spawner's creature, or an old one, does not
    const w2 = towerWorld('goblinTower');
    w2.creatures.set(78, { id: 78, sourceSpawnerId: 9, spawnedAtTick: 3998 });
    w2.creatures.set(79, { id: 79, sourceSpawnerId: 1, spawnedAtTick: 3000 });
    expect(lum(all(frame(w2)))).toBeCloseTo(base, 6);
  });

  it('⭐ the DEFENDER flare is read off its synced FSM: a turret in FIRE outshines the same turret at rest', () => {
    const rest = towerWorld('laserTurret');
    rest.defenders.get(3).state = 'RECOVER';
    rest.defenders.get(3).ticksInState = 40; // long after the shot: no flare, charge 0
    const fire = towerWorld('laserTurret');
    fire.defenders.get(3).state = 'FIRE';
    fire.defenders.get(3).ticksInState = 1;
    expect(lum(all(frame(fire)))).toBeGreaterThan(lum(all(frame(rest))) * 1.15);
    // the turret's config is the one the sync reads (the cadence the IDLE charge rides)
    expect(getDefenderConfig('turret').fireIntervalTicks).toBeGreaterThan(0);
  });
});
