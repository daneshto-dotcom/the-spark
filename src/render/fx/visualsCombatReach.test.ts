/**
 * S193 `s193/visuals-combat` (visuals-4) — **REACH: THE REAL DRAWERS REALLY CALL THE NEW LAYOUTS.**
 *
 * The layouts are tested pure in `combatFx.test.ts`. This file proves each one is REACHED from the
 * production drawer it was wired into, by installing recording sinks as the live fx hooks
 * (`setFxHooks`, exactly what `fxRuntime.installFx` does in the game) and driving the real code:
 * `drawArcFlash`, `TurretRenderer.sync`, `syncCreatureProjectiles`, `drawChewBite`,
 * `PrincessRenderer.sync`. Each case has its NEGATIVE: with no hooks installed (vitest's default, and
 * the `?fx=legacy` state) the same call emits nothing, i.e. the legacy look is untouched.
 *
 * Two wirings are not driveable here and are pinned by source instead (bottom of the file): the
 * lightning-cloud burst (it needs a creature observed alive and then gone across two frames of a
 * renderer that loads a texture atlas) and the Voltkin TV crackle (it draws only once the TV atlas
 * manifest has loaded, which Node cannot fetch). Their layouts are tested pure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audioManager.ts', () => ({
  playLaserSFX: vi.fn(async () => {}),
  playSlapSFX: vi.fn(async () => {}),
  playZapBurstSFX: vi.fn(async () => {}),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Container, Graphics } from 'pixi.js';
import { recordingSink, type FxEmitRecord } from './emitter.ts';
import { setFxHooks, setFxLegacyFlag } from './fxState.ts';
import { LASER_STYLE, VOLT_STYLE } from './lightningFx.ts';
import { drawArcFlash } from '../effects/arcFlash.ts';
import { drawChewBite } from '../effects/chewBite.ts';
import { TurretRenderer } from '../turretRenderer.ts';
import { PrincessRenderer } from '../princessRenderer.ts';
import { syncCreatureProjectiles } from '../creatureProjectile.ts';
import { ARROW_FLIGHT_TICKS, PLAYER_COLORS } from '../../constants.ts';
import { asCreatureId, asDefenderId, asPlayerId, asPrimitiveId } from '../../types.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { makeWorld, type World } from '../../state/world.ts';
import { makeCreature } from '../../state/creatures/creature.ts';
import { GOBLIN_ARCHER_CONFIG } from '../../state/creatures/voltkin-config.ts';
import { makeDefender } from '../../state/defenders/defender.ts';
import { resetConcealmentForTest } from '../concealment.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

let top: ReturnType<typeof recordingSink>;
let shade: ReturnType<typeof recordingSink>;
let ground: ReturnType<typeof recordingSink>;

function install(): void {
  top = recordingSink();
  shade = recordingSink();
  ground = recordingSink();
  setFxHooks({ top, shade, ground, shock: { shock() {} } });
}

beforeEach(() => { resetConcealmentForTest(); setFxLegacyFlag(false); });
afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); });

function world(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]));
  return w;
}

const arc = { kind: 'ARC_FLASH' as const, tick: 500, start: { x: 100, y: 100 }, end: { x: 300, y: 160 }, creatureId: asCreatureId(9) };
const tints = (out: FxEmitRecord[]) => new Set(out.map((e) => e.tint));

describe('S193 V07 REACH — the Voltkin / drone arc (`drawArcFlash`)', () => {
  it('with fx live: the glow and sheath reach the bloomed top layer, sparks at both ends', () => {
    install();
    const g = new Graphics();
    drawArcFlash(g, arc, 0.25);
    const t = tints(top.out);
    expect(t.has(VOLT_STYLE.glow) && t.has(VOLT_STYLE.sheath)).toBe(true);
    expect(top.out.every((e) => e.blend === 'add')).toBe(true);
    const near = (x: number, y: number) => top.out.some((e) => Math.hypot(e.x - x, e.y - y) < 40 && e.tex === 'soft' && e.h <= 3);
    expect(near(100, 100) && near(300, 160), 'sparks at the origin and at the strike').toBe(true);
  });

  it('NEGATIVE: with nothing installed (legacy) the arc emits no fx at all', () => {
    const sink = recordingSink();
    setFxHooks(null);
    drawArcFlash(new Graphics(), arc, 0.25);
    expect(sink.out).toEqual([]);
    install();
    setFxLegacyFlag(true);
    drawArcFlash(new Graphics(), arc, 0.25);
    expect(top.out, '?fx=legacy draws the S30 arc only').toEqual([]);
  });

  it('⛔ DETERMINISM through the drawer — same effect and age → identical sprites; next re-strike differs', () => {
    install();
    drawArcFlash(new Graphics(), arc, 0.25);
    const a = top.out.slice();
    install();
    drawArcFlash(new Graphics(), arc, 0.25);
    expect(top.out).toEqual(a);
    install();
    drawArcFlash(new Graphics(), arc, 0.5);
    expect(top.out).not.toEqual(a);
  });
});

describe('S193 V07 REACH — the laser turret (`TurretRenderer.sync`)', () => {
  function firingTurret(ticksInState: number): World {
    const w = world();
    const d = makeDefender({
      id: asDefenderId(4), kind: 'turret', ownerPlayerId: P0, anchorPrimitiveId: asPrimitiveId(1),
      recipeId: 'no-ramp-art' as never, pos: { x: 200, y: 200 }, registeredAtTick: 0,
    });
    d.state = 'FIRE';
    d.ticksInState = ticksInState;
    d.lastStrikePos = { x: 420, y: 260 };
    w.defenders.set(d.id, d);
    w.tick = 900;
    return w;
  }

  it('a firing turret puts the red beam glow and the impact sparks on the top layer', () => {
    install();
    const r = new TurretRenderer({ stage: new Container() } as never, new Container());
    r.sync(firingTurret(2));
    expect(tints(top.out).has(LASER_STYLE.glow)).toBe(true);
    expect(top.out.some((e) => Math.hypot(e.x - 420, e.y - 260) < 40), 'sparks at the strike').toBe(true);
  });

  it('NEGATIVE: a turret that is not firing emits nothing; legacy emits nothing', () => {
    install();
    const r = new TurretRenderer({ stage: new Container() } as never, new Container());
    const w = firingTurret(2);
    w.defenders.get(asDefenderId(4))!.state = 'IDLE';
    r.sync(w);
    expect(top.out).toEqual([]);
    setFxLegacyFlag(true);
    r.sync(firingTurret(2));
    expect(top.out).toEqual([]);
  });
});

describe('S193 V13 REACH — arrows (`syncCreatureProjectiles`)', () => {
  function archerVsGoblin(ticksInState: number): World {
    const w = world();
    const mk = (id: number, owner: typeof P0, x: number) => {
      const c = makeCreature(GOBLIN_ARCHER_CONFIG, {
        id: asCreatureId(id), ownerPlayerId: owner, pos: { x, y: 300 }, targetPos: { x, y: 300 },
        spawnedAtTick: 0, sourceSpawnerId: null,
      });
      w.creatures.set(c.id, c);
      return c;
    };
    const a = mk(1, P0, 100);
    mk(2, P1, 180);
    a.state = 'ATTACKING';
    a.ticksInState = ticksInState;
    w.tick = 1000;
    return w;
  }
  const FIRE = GOBLIN_ARCHER_CONFIG.attackFireTick;

  it('in flight: the four-streak trail reaches the top layer', () => {
    install();
    syncCreatureProjectiles(new Graphics(), archerVsGoblin(FIRE - Math.floor(ARROW_FLIGHT_TICKS / 2)));
    expect(top.out.length).toBe(4);
    expect(shade.out).toEqual([]);
  });

  it('just after the fire tick: the impact puff lands ON the victim (dust on shade, flash on top)', () => {
    install();
    syncCreatureProjectiles(new Graphics(), archerVsGoblin(FIRE + 2));
    expect(shade.out.length).toBeGreaterThan(0);
    expect(shade.out.some((e) => e.tex === 'smoke' && Math.abs(e.x - 180) < 1)).toBe(true);
  });

  it('NEGATIVE: legacy draws no trail and no puff; long after landing there is no puff', () => {
    install();
    setFxLegacyFlag(true);
    syncCreatureProjectiles(new Graphics(), archerVsGoblin(FIRE - 3));
    syncCreatureProjectiles(new Graphics(), archerVsGoblin(FIRE + 2));
    expect(top.out).toEqual([]);
    expect(shade.out).toEqual([]);
    setFxLegacyFlag(false);
    syncCreatureProjectiles(new Graphics(), archerVsGoblin(FIRE + 20));
    expect(top.out).toEqual([]);
    expect(shade.out).toEqual([]);
  });
});

describe('S193 V23 REACH — the chew bite and the slap', () => {
  const bite = { kind: 'CHEW_BITE' as const, tick: 300, pos: { x: 50, y: 70 }, creatureId: asCreatureId(5) };

  it('`drawChewBite` throws graphite chips on the shade layer; legacy throws none', () => {
    install();
    drawChewBite(new Graphics(), bite, 0.3);
    expect(shade.out.filter((e) => e.tex === 'soft').length).toBe(7);
    install();
    setFxLegacyFlag(true);
    drawChewBite(new Graphics(), bite, 0.3);
    expect(shade.out).toEqual([]);
  });

  it('`PrincessRenderer.sync` lights the slap at her strike point; not outside FIRE', () => {
    const helga = (state: 'FIRE' | 'RECOVER'): World => {
      const w = world();
      const d = makeDefender({
        id: asDefenderId(6), kind: 'princess', ownerPlayerId: P0, anchorPrimitiveId: asPrimitiveId(1),
        recipeId: 'helga' as never, pos: { x: 500, y: 500 }, registeredAtTick: 0,
      });
      d.state = state;
      d.ticksInState = 2;
      d.lastStrikePos = { x: 530, y: 490 };
      w.defenders.set(d.id, d);
      w.tick = 2000;
      return w;
    };
    install();
    const r = new PrincessRenderer({ stage: new Container() } as never, new Container());
    r.sync(helga('FIRE'));
    expect(top.out.some((e) => e.tex === 'ring' && e.x === 530 && e.y === 490)).toBe(true);
    install();
    r.sync(helga('RECOVER'));
    expect(top.out).toEqual([]);
  });
});

describe('S193 V07 — the two wirings Node cannot drive, pinned by source', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  it('the lightning cloud calls its fx drawer behind `fxActive()` and keys it to the tick', () => {
    const s = src('creatureRenderer.ts');
    expect(s).toMatch(/if \(fxActive\(\)\) \{ this\.drawLightningCloudFx\(g, s, t, tick\); continue; \}/);
    expect(s).toMatch(/this\.drawLightningClouds\(nowSec, world\.tick\);/);
    expect(s).toMatch(/bornTick: world\.tick/);
  });

  it('the Voltkin TV crackles on BOTH its live and its dying path', () => {
    const s = src('voltkinTowerRenderer.ts');
    expect(s.match(/tvCrackleFx\(fxTop\(\)/g)?.length).toBe(2);
    expect(s.match(/tvCrackleIntensity\((row|ghostRow)\)/g)?.length).toBe(2);
  });
});
