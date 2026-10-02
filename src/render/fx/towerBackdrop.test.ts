/**
 * S194 `s194/visuals-6` — **THE PER-RACE TOWER BACKGROUND (`towerBackdropFx`), AND ITS REACH.**
 *
 * Owner: *"each race aura. So whenever you place a building, like a lot cooler around it, not just aura,
 * but like background"*; S193 Q1: the goo *"is not really around the tower, it's behind it."*
 *
 * Pure: every race draws, deterministically, animated by the tick; it is centred on the FOOT; it WRAPS
 * (some of it rides OVER the building on the front layers, the ground part stays on the ground layer);
 * LOW is a cheaper version. REACH: `GroundDecalRenderer.sync` on a real built laser turret (a DEFENDER)
 * emits it at the published foot, falls back without one, and `?fx=legacy` emits nothing and keeps the
 * S185 Graphics drawing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The decal renderer builds its one-fade `AlphaFilter` at construction, which compiles a GL program
// (a canvas) — unavailable under Node. The filter is HIGH-only and these cases run LOW / legacy.
vi.mock('pixi.js', async (orig) => ({
  ...(await orig<typeof import('pixi.js')>()),
  AlphaFilter: class { alpha = 1; constructor(o?: { alpha?: number }) { this.alpha = o?.alpha ?? 1; } },
}));

import { Container } from 'pixi.js';
import { recordingSink, type FxEmitRecord } from './emitter.ts';
import { setFxHooks, setFxLegacyFlag } from './fxState.ts';
import { setFxHighQualityRuntime } from './fxRuntime.ts';
import { BACKDROP_CENTRE_LIFT, BACKDROP_POOL_R, backdropGeom, towerBackdropFx } from './towerBackdropFx.ts';
import { ALL_RACES, type RaceId } from '../../state/races.ts';
import { GroundDecalRenderer } from '../groundDecalRenderer.ts';
import { __resetTowerCoverForTests, beginTowerCoverFrame, markTowerCover } from '../towerCover.ts';
import { resetConcealmentForTest } from '../concealment.ts';
import { PLAYER_COLORS } from '../../constants.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { asPlayerId } from '../../types.ts';
import { makeWorld } from '../../state/world.ts';
import { blueprintBill } from '../../state/blueprints.ts';
import { applyBuildBlueprint } from '../../state/blueprintBuild.ts';
import { makeCastleBank } from '../../state/castleBank.ts';
import { runGodlyMatcherCore } from '../../state/godlyMatcherCore.ts';
import { towerFootprintAt } from '../../state/towerMembers.ts';
import '../../state/godlyRecipes/laserTurret.ts';

const FOOT = { x: 500, y: 400, w: 84, h: 84 };

function run(race: RaceId, tick: number, low = false) {
  const back = recordingSink(); const front = recordingSink(); const shade = recordingSink();
  towerBackdropFx(back, front, shade, race, 7, FOOT.x, FOOT.y, FOOT.w, FOOT.h, tick, low);
  return { back: back.out, front: front.out, shade: shade.out, all: [...back.out, ...front.out, ...shade.out] };
}

describe('S194 — `towerBackdropFx`, every race', () => {
  for (const race of ALL_RACES) {
    it(`${race}: draws, deterministically, animated by the tick`, () => {
      const a = run(race, 1000);
      expect(a.all.length, 'a real picture, not a token sprite').toBeGreaterThan(15);
      expect(run(race, 1000)).toEqual(a);
      expect(run(race, 1003).all).not.toEqual(a.all);
    });

    it(`${race}: ⭐ it WRAPS — ground on the ground layer, and some of it rides OVER the building`, () => {
      const r = run(race, 1000);
      expect(r.back.length).toBeGreaterThan(0);
      expect(r.front.length + r.shade.length, 'nothing in front of the building = a disc behind it').toBeGreaterThan(0);
      // Over the building means within its silhouette's columns, at or above the foot line.
      const overArt = [...r.front, ...r.shade].filter((e) => Math.abs(e.x - FOOT.x) < FOOT.w * 0.6 && e.y <= FOOT.y + 6);
      expect(overArt.length).toBeGreaterThan(0);
    });

    it(`${race}: ⭐ centred on the FOOT, not half a building up (S193: "behind it")`, () => {
      const g = backdropGeom(FOOT.x, FOOT.y, FOOT.w, FOOT.h);
      const pools = run(race, 1000).back.filter((e) => e.tex === 'soft' && e.w >= g.R * 1.9);
      expect(pools.length).toBeGreaterThan(0);
      for (const p of pools) {
        expect(p.x).toBe(FOOT.x);
        expect(Math.abs(p.y - FOOT.y), 'the pool sits at the base').toBeLessThanOrEqual(FOOT.h * BACKDROP_CENTRE_LIFT + 1e-9);
      }
    });

    it(`${race}: LOW is a cheaper version of the same picture`, () => {
      const hi = run(race, 1000).all.length;
      const lo = run(race, 1000, true).all.length;
      expect(lo).toBeGreaterThan(5);
      expect(lo).toBeLessThan(hi);
    });
  }

  it('it is the race\'s OWN colour family (the zombies are green, the demons violet — S185)', () => {
    const green = (c: number) => ((c >> 8) & 0xff) > ((c >> 16) & 0xff) && ((c >> 8) & 0xff) > (c & 0xff);
    const violet = (c: number) => (c & 0xff) > ((c >> 8) & 0xff) && ((c >> 16) & 0xff) > ((c >> 8) & 0xff);
    const share = (out: FxEmitRecord[], f: (c: number) => boolean) => out.filter((e) => e.blend === 'add' && f(e.tint)).length / out.filter((e) => e.blend === 'add').length;
    expect(share(run('zombies', 1000).all, green)).toBeGreaterThan(0.8);
    expect(share(run('demons', 1000).all, violet)).toBeGreaterThan(0.8);
  });

  it('the mummy sand vortex orbits: motes in FRONT of the building and motes BEHIND it at once', () => {
    const r = run('mummies', 1000);
    const g = backdropGeom(FOOT.x, FOOT.y, FOOT.w, FOOT.h);
    const motes = (out: FxEmitRecord[]) => out.filter((e) => e.tex === 'soft' && e.w < 20).length;
    expect(motes(r.front)).toBeGreaterThan(4);
    expect(motes(r.back)).toBeGreaterThan(4);
    expect(g.R).toBe(FOOT.w * BACKDROP_POOL_R);
  });
});

/* ── REACH through the real decal renderer ───────────────────────────────────────────────────── */

const P0 = asPlayerId(0);
let back: ReturnType<typeof recordingSink>;
let front: ReturnType<typeof recordingSink>;
let shade: ReturnType<typeof recordingSink>;
function install(): void {
  back = recordingSink(); front = recordingSink(); shade = recordingSink();
  setFxHooks({ top: front, shade, ground: back, shock: { shock() {} } });
}

function turretWorld(race: RaceId): any {
  const w: any = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0], { x: 0, y: 0 }, race));
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill('laserTurret')) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'laserTurret', centre: { x: 300, y: 300 } });
  runGodlyMatcherCore(w, { lastMatcherTick: 0 });
  expect(w.defenders.size, 'fixture: the turret stands (a DEFENDER)').toBe(1);
  w.tick = 2000;
  return w;
}

beforeEach(() => { __resetTowerCoverForTests(); resetConcealmentForTest(); setFxLegacyFlag(false); setFxHighQualityRuntime(false); });
afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); setFxHighQualityRuntime(true); __resetTowerCoverForTests(); });

describe('S194 REACH — `GroundDecalRenderer.sync` draws the background for a built tower', () => {
  it('⭐ at the FOOT the sprite renderer published (a defender — the laser turret)', () => {
    const w = turretWorld('nagas');
    const d = [...w.defenders.values()][0];
    const fp = towerFootprintAt(w, d.recipeId, d.anchorPrimitiveId)!;
    const r = new GroundDecalRenderer({} as never, new Container());
    const foot = { x: 333, y: 377, w: 90, h: 90 };
    beginTowerCoverFrame(w);
    markTowerCover(fp.prims, [], 0, foot);
    beginTowerCoverFrame(w);
    install();
    r.sync(w);
    expect(back.out.length + front.out.length, 'the background reached the fx layers').toBeGreaterThan(10);
    const g = backdropGeom(foot.x, foot.y, foot.w, foot.h);
    const pools = back.out.filter((e) => e.tex === 'soft' && e.w >= g.R * 1.9);
    expect(pools.length).toBeGreaterThan(0);
    expect(pools.every((e) => e.x === foot.x && Math.abs(e.y - g.y) < 1e-9)).toBe(true);
  });

  it('with no published foot (atlas still loading) it still draws, from the shapes', () => {
    const w = turretWorld('zombies');
    const r = new GroundDecalRenderer({} as never, new Container());
    beginTowerCoverFrame(w);
    install();
    r.sync(w);
    expect(back.out.length + front.out.length).toBeGreaterThan(10);
  });

  it('⛔ NEGATIVE — `?fx=legacy` emits no background sprites (the S185 Graphics drawing stands alone)', () => {
    const w = turretWorld('zombies');
    const r = new GroundDecalRenderer({} as never, new Container());
    install();
    setFxLegacyFlag(true);
    r.sync(w);
    expect([...back.out, ...front.out, ...shade.out]).toEqual([]);
  });

  it('⛔ NEGATIVE — no tower on the board, no background', () => {
    const w: any = makeWorld(0);
    w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
    const r = new GroundDecalRenderer({} as never, new Container());
    install();
    r.sync(w);
    expect([...back.out, ...front.out, ...shade.out]).toEqual([]);
  });
});
