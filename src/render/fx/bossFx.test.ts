/**
 * S193 `s193/visuals-boss` (visuals-2) — V09 Ra, V10 Kraken sonar, V15 stun stars, V17 locust cloud.
 *
 * Two halves, both owed by the S193 rules:
 *   · the LAYOUTS as pure functions — arithmetic (where every sprite sits, against the sim's own
 *     numbers), determinism, and the windows each effect lives in;
 *   · REACH — the REAL renderer entry points (`drawBossAuras`, `drawStunStars`, `drawLocustClouds`) with the
 *     fx hooks installed exactly as `fxRuntime.installFx` installs them, but with recording sinks. A layout
 *     that is correct and never called is the S182 "green over a live bug" hole; these close it. Each has
 *     its NEGATIVE: legacy mode (`?fx=legacy`) draws the S170/S171 Graphics and emits nothing.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import {
  KRAKEN_SONAR_COS_HALF_ANGLE, KRAKEN_SONAR_INTERVAL_TICKS, KRAKEN_SONAR_RANGE, PLAYER_COLORS, PRIMITIVE_MAX_HP,
  RA_COLUMN_RADIUS, RA_COLUMN_TICKS, RA_RITUAL_TICKS,
} from '../../constants.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { damageCreature } from '../../state/creatures/creatureLifecycle.ts';
import type { Creature } from '../../state/creatures/creature.ts';
import { raColumnImpactTick, raColumnPos } from '../../state/bossSkillsPharaohRitual.ts';
import { T9_BOSS_TYPE } from '../../state/t9BossIds.ts';
import { dispatch, makeWorld, type World } from '../../state/world.ts';
import { asCreatureId, asPlayerId } from '../../types.ts';
import { drawBossAuras } from '../bossAuras.ts';
import { drawLocustClouds, locustCloudFx, locustMote, LOCUST_FX_SPRITES } from '../locustCloud.ts';
import { drawStunStars, stunStarPos, stunStarsFx, STUN_STARS_FX_HEAD_CLEAR, STUN_STARS_FX_PER_STAR } from '../stunStars.ts';
import { NULL_SHOCK, recordingSink, type FxDisplaceSink, type FxEmitRecord } from './emitter.ts';
import { setFxDisplaceHook, setFxHooks, setFxLegacyFlag } from './fxState.ts';
import {
  RA_FX_DUST_LIFE, RA_FX_DUST_PUFFS, RA_FX_HALO_SUNS, RA_FX_SPARKS, raBeamFx, raBeamGlow, raColumnSeed, raHaloFx,
  raTelegraphFx, raTelegraphRadius,
} from './raFx.ts';
import { SONAR_FX_FOAM, sonarFx } from './sonarFx.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function displaces(): FxDisplaceSink & { out: number[][] } {
  const out: number[][] = [];
  return { out, ripple(x, y, r, rot, s) { out.push([x, y, r, rot, s]); } };
}

/** Install the hooks the way `installFx` does, with recording sinks. */
function installRecording() {
  const top = recordingSink();
  const shade = recordingSink();
  const ground = recordingSink();
  const disp = displaces();
  setFxHooks({ top, shade, ground, shock: NULL_SHOCK });
  setFxDisplaceHook(disp);
  return { top: top.out, shade: shade.out, ground: ground.out, disp: disp.out };
}

afterEach(() => {
  setFxHooks(null);
  setFxDisplaceHook(null);
  setFxLegacyFlag(false);
});

/** A Graphics that records circles, strokes, stars and pen moves. */
function gfx() {
  const circles: number[] = [];
  const strokes: number[] = [];
  const stars: Array<{ x: number; y: number }> = [];
  const lines: Array<[number, number, number, number]> = [];
  let pen: [number, number] = [0, 0];
  let ops = 0;
  const g = {
    circle(_x: number, _y: number, r: number) { ops++; circles.push(r); return g; },
    moveTo(x: number, y: number) { ops++; pen = [x, y]; return g; },
    lineTo(x: number, y: number) { ops++; lines.push([pen[0], pen[1], x, y]); pen = [x, y]; return g; },
    arc() { ops++; return g; },
    ellipse() { ops++; return g; },
    star(x: number, y: number) { ops++; stars.push({ x, y }); return g; },
    fill() { ops++; return g; },
    stroke(o: { width?: number }) { ops++; strokes.push(o.width ?? 0); return g; },
    texture() { ops++; return g; },
    setFillStyle() { return g; },
  } as unknown as Graphics;
  return { g, circles, strokes, stars, lines, ops: () => ops };
}

// ───────────────────────────────────────────────────────── V09 — Ra
describe('V09 Ra — the layouts', () => {
  const start = 1000;
  const impact = start + RA_COLUMN_TICKS;
  const run = (tick: number) => {
    const g = recordingSink();
    raTelegraphFx(g, 77, 400, 300, tick, start, impact, RA_COLUMN_RADIUS);
    return g.out;
  };

  it('the telegraph lives exactly from the announcement to the impact', () => {
    expect(run(start - 1)).toEqual([]);
    expect(run(start).length).toBeGreaterThan(0);
    expect(run(impact - 1).length).toBeGreaterThan(0);
    expect(run(impact), 'gone on the impact tick: the strike takes over').toEqual([]);
  });

  it('ARITHMETIC — the glow ring rides the SAME curve as the hitbox shade, ending at the exact kill radius', () => {
    for (const tick of [start, start + 30, impact - 1]) {
      const t = (tick - start) / RA_COLUMN_TICKS;
      const r = RA_COLUMN_RADIUS * (0.18 + 0.82 * t); // `drawRaColumns`' own formula, written out
      expect(raTelegraphRadius(RA_COLUMN_RADIUS, t)).toBeCloseTo(r, 9);
      const ring = run(tick).find((e) => e.tex === 'ring')!;
      expect(ring.w * 0.82 / 2).toBeCloseTo(r, 9); // the ring texture peaks at 82 % of its half-size
    }
  });

  it('the sand motes SPIRAL IN: born outside the circle, each closing on the centre as it ages', () => {
    const tick = start + 80;
    const motes = run(tick).filter((e) => e.tex === 'soft' && e.w < 20);
    expect(motes.length, '~life / period motes').toBeGreaterThanOrEqual(15);
    // Only motes the telegraph gave birth to: one tick in, at most one exists.
    expect(run(start).filter((e) => e.tex === 'soft' && e.w < 20).length).toBeLessThanOrEqual(1);
    for (const m of motes) expect(Math.hypot(m.x - 400, m.y - 300)).toBeLessThanOrEqual(RA_COLUMN_RADIUS * 1.45 + 1e-9);
    expect(motes.some((m) => Math.hypot(m.x - 400, m.y - 300) > RA_COLUMN_RADIUS), 'some are still outside the ring').toBe(true);
    expect(motes.some((m) => Math.hypot(m.x - 400, m.y - 300) < RA_COLUMN_RADIUS * 0.4), 'some have nearly arrived').toBe(true);
  });

  it('⛔ DETERMINISM — the same column on the same tick is byte-identical; another column differs', () => {
    expect(run(start + 50)).toEqual(run(start + 50));
    const other = recordingSink();
    raTelegraphFx(other, 78, 400, 300, start + 50, start, impact, RA_COLUMN_RADIUS);
    expect(other.out).not.toEqual(run(start + 50));
  });

  it('ARITHMETIC — the beam glow window matches the art table (beam drops at −48, flash 0..5, gone by +30)', () => {
    expect(raBeamGlow(-49, true, 0)).toBe(0);
    expect(raBeamGlow(-48, true, 0)).toBeCloseTo(1 / 12, 9);
    expect(raBeamGlow(-10, true, 1)).toBeCloseTo(1, 9);
    expect(raBeamGlow(0, true, 0)).toBe(1.5);
    expect(raBeamGlow(29, true, 0)).toBeGreaterThan(0);
    expect(raBeamGlow(30, true, 0)).toBe(0);
    // No art: only the code beam's 14 ticks — no glow over an empty sky before impact.
    expect(raBeamGlow(-10, false, 1)).toBe(0);
    expect(raBeamGlow(0, false, 0)).toBe(1.4);
    expect(raBeamGlow(15, false, 0)).toBe(0);
  });

  it('the impact: dust on SHADE (normal blend), light on TOP (additive), only after the damage tick', () => {
    const run2 = (rel: number) => {
      const top = recordingSink();
      const shade = recordingSink();
      raBeamFx(top, shade, 5, 400, 300, impact + rel, impact, true, RA_COLUMN_RADIUS);
      return { top: top.out, shade: shade.out };
    };
    expect(run2(-1).shade).toEqual([]);
    const at = run2(0);
    expect(at.shade.length).toBe(RA_FX_DUST_PUFFS);
    expect(at.shade.every((e) => e.blend === 'normal' && e.tex === 'smoke')).toBe(true);
    expect(at.top.every((e) => e.blend === 'add')).toBe(true);
    expect(at.top.filter((e) => e.tex === 'core' && e.w === 5).length).toBe(RA_FX_SPARKS);
    expect(run2(RA_FX_DUST_LIFE).shade).toEqual([]);
    // The dust rolls out to about the kill radius, never far past it.
    for (const e of run2(40).shade) expect(Math.abs(e.x - 400)).toBeLessThanOrEqual(RA_COLUMN_RADIUS * 1.25);
  });

  it('the halo: six suns on the orbit, the far half UNDER him (ground), the near half over him (top)', () => {
    for (const tick of [0, 13, 140]) {
      const ground = recordingSink();
      const top = recordingSink();
      raHaloFx(ground, top, 9, 500, 500, tick);
      const suns = [...ground.out, ...top.out].filter((e) => e.tex === 'core');
      expect(suns.length).toBe(RA_FX_HALO_SUNS);
      for (const s of ground.out.filter((e) => e.tex === 'core')) expect(s.y).toBeLessThan(500);
      for (const s of top.out.filter((e) => e.tex === 'core')) expect(s.y).toBeGreaterThanOrEqual(500);
      expect(ground.out.some((e) => e.tex === 'ring')).toBe(true);
    }
  });
});

/** Seat 0's Pharaoh, entering his ritual (the `raRitualFightGate` fixture). */
function ritualBoard(): { w: World; until: number; id: number } {
  const w = makeWorld(0);
  w.isHost = true;
  w.gameState = 'PLAYING';
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: T9_BOSS_TYPE.mummies, ownerPlayerId: P0,
    pos: { x: 900, y: 500 }, targetPos: { x: 900, y: 500 },
  });
  const boss = [...w.creatures.values()].find((c) => c.type === T9_BOSS_TYPE.mummies)!;
  damageCreature(w, boss.id, 100_000);
  return { w, until: boss.raRitualUntilTick!, id: boss.id as number };
}

describe('V09 Ra — REACH through the real drawBossAuras', () => {
  it('with fx installed: telegraph sand + halo suns are emitted, AND the Graphics hitbox circle is still exact', () => {
    const { w, until, id } = ritualBoard();
    const start = until - RA_RITUAL_TICKS;
    w.tick = start + 60; // column 0, half way through its telegraph
    const rec = installRecording();
    const g = gfx();
    drawBossAuras(g.g, w);
    expect(rec.ground.some((e) => e.tex === 'ring'), 'the telegraph ring').toBe(true);
    expect([...rec.ground, ...rec.top].filter((e) => e.tex === 'core' && e.w === 14).length, 'the six suns').toBe(RA_FX_HALO_SUNS);
    // ⛔ THE PROMISE: the shade is still drawn at the sim's growing radius, at the sim's landing point.
    const t = 60 / RA_COLUMN_TICKS;
    expect(g.circles.some((r) => Math.abs(r - RA_COLUMN_RADIUS * (0.18 + 0.82 * t)) < 1e-9)).toBe(true);
    // The telegraph ring (sized to the hitbox, not the halo's ring) is centred on the SIM's landing point.
    const p = raColumnPos(id, 0, 900, 500);
    const teleRingW = (2 * RA_COLUMN_RADIUS * (0.18 + 0.82 * t)) / 0.82;
    const teleRings = rec.ground.filter((e) => e.tex === 'ring' && Math.abs(e.w - teleRingW) < 1e-9);
    expect(teleRings.length).toBe(1);
    expect([teleRings[0]!.x, teleRings[0]!.y]).toEqual([p.x, p.y]);
    // The legacy halo stroke (width 2) is replaced, not doubled.
    expect(g.strokes.includes(2)).toBe(false);
  });

  it('the impact frame emits the dust burst seeded by the SIM\'s impact tick', () => {
    const { w, until, id } = ritualBoard();
    const imp = raColumnImpactTick(until, 0);
    w.tick = imp + 3;
    const rec = installRecording();
    drawBossAuras(gfx().g, w);
    expect(rec.shade.filter((e) => e.tex === 'smoke').length).toBe(RA_FX_DUST_PUFFS);
    // The same column drawn directly, with the seed the renderer must have used, matches exactly.
    const p = raColumnPos(id, 0, 900, 500);
    const top = recordingSink();
    const shade = recordingSink();
    raBeamFx(top, shade, raColumnSeed(imp, p.x, p.y), p.x, p.y, w.tick, imp, false, RA_COLUMN_RADIUS);
    expect(rec.shade).toEqual(shade.out);
  });

  it('NEGATIVE — legacy mode: nothing emitted, the S171 halo stroke is back', () => {
    const { w, until } = ritualBoard();
    w.tick = until - RA_RITUAL_TICKS + 60;
    const rec = installRecording();
    setFxLegacyFlag(true);
    const g = gfx();
    drawBossAuras(g.g, w);
    expect(rec.ground.length + rec.top.length + rec.shade.length).toBe(0);
    expect(g.strokes.includes(2)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────── V10 — Kraken sonar
describe('V10 Kraken sonar — the layout', () => {
  const half = Math.acos(KRAKEN_SONAR_COS_HALF_ANGLE);
  const run = (since: number, heading = 0) => {
    const top = recordingSink();
    const ground = recordingSink();
    const d = displaces();
    sonarFx(top, ground, d, 4, 500, 500, heading, half, since, 24, KRAKEN_SONAR_RANGE, 2000 + since);
    return { top: top.out, ground: ground.out, disp: d.out };
  };

  it('lives only while the wave travels', () => {
    expect(run(24).top).toEqual([]);
    expect(run(-1).top).toEqual([]);
    expect(run(8).top.length).toBeGreaterThan(0);
  });

  it('ARITHMETIC — the foam sits ON the front (range × since/24, ±3 px) and INSIDE the sim\'s cone', () => {
    for (const heading of [0, 1.1, -2.5]) {
      const since = 12;
      const front = KRAKEN_SONAR_RANGE * (since / 24);
      const foam = run(since, heading).top.filter((e) => e.tex === 'soft');
      expect(foam.length).toBe(SONAR_FX_FOAM);
      for (const f of foam) {
        expect(Math.abs(Math.hypot(f.x - 500, f.y - 500) - front)).toBeLessThanOrEqual(3 + 1e-9);
        const a = Math.atan2(f.y - 500, f.x - 500);
        const off = Math.abs(Math.atan2(Math.sin(a - heading), Math.cos(a - heading)));
        expect(off).toBeLessThanOrEqual(half + 1e-9);
      }
    }
  });

  it('the ground ripple is asked for at the front, along the axis, fading with the wave', () => {
    const r = run(12, 0.7);
    expect(r.disp.length).toBe(1);
    const [x, y, radius, rot, s] = r.disp[0]!;
    expect([x, y]).toEqual([500, 500]);
    expect(radius).toBeCloseTo(KRAKEN_SONAR_RANGE / 2, 9);
    expect(rot).toBe(0.7);
    expect(s).toBeGreaterThan(run(20, 0.7).disp[0]![4]!);
  });

  it('spray droplets are thrown AHEAD of the front', () => {
    const since = 14;
    const front = KRAKEN_SONAR_RANGE * (since / 24);
    const drops = run(since).top.filter((e) => e.tex === 'core' && e.w === 6);
    expect(drops.length).toBeGreaterThan(5);
    expect(drops.some((d) => Math.hypot(d.x - 500, d.y - 500) > front + 5)).toBe(true);
  });

  it('⛔ DETERMINISM', () => {
    expect(run(10)).toEqual(run(10));
  });
});

function sonarBoard(): { w: World; id: number } {
  const w = makeWorld(3);
  w.gameState = 'PLAYING';
  w.creatures.clear();
  const put = (id: number, type: string, owner: typeof P0, x: number, y: number): Creature => {
    const c = {
      id: asCreatureId(id), type, ownerPlayerId: owner, pos: { x, y }, prevPos: { x, y },
      state: 'SEEKING', ticksInState: 0, stateEnteredTick: 0, spawnTick: 0, despawnAtTick: 1_000_000,
      ehp: PRIMITIVE_MAX_HP, sourceSpawnerId: null, targetBondId: null, targetCreatureId: null, targetPrimitiveId: null,
    } as unknown as Creature;
    w.creatures.set(c.id, c);
    return c;
  };
  put(5, T9_BOSS_TYPE.nagas, P0, 500, 500);
  put(6, 'goblinMelee', P1, 600, 500); // due east, in range
  // The sim fires when (tick + id) % interval === 0; put us 10 ticks after a firing.
  w.tick = KRAKEN_SONAR_INTERVAL_TICKS * 3 - 5 + 10;
  return { w, id: 5 };
}

describe('V10 Kraken sonar — REACH through the real drawBossAuras', () => {
  it('with fx installed: foam along the axis the SIM aims (nearestEnemyFor), a ripple request, no stroked arcs', () => {
    const { w } = sonarBoard();
    const rec = installRecording();
    const g = gfx();
    drawBossAuras(g.g, w);
    expect(rec.top.filter((e) => e.tex === 'soft').length).toBe(SONAR_FX_FOAM);
    expect(rec.disp.length).toBe(1);
    expect(rec.disp[0]![3], 'heading east, at the goblin').toBeCloseTo(0, 9);
    expect(g.strokes.length, 'the S170 arcs are replaced').toBe(0);
  });

  it('NEGATIVE — legacy mode: the S170 arcs, nothing emitted', () => {
    const { w } = sonarBoard();
    const rec = installRecording();
    setFxLegacyFlag(true);
    const g = gfx();
    drawBossAuras(g.g, w);
    expect(rec.top.length + rec.ground.length + rec.disp.length).toBe(0);
    expect(g.strokes.length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────── V15 — stun stars
describe('V15 stun stars', () => {
  it('ARITHMETIC — the rebuilt stars ride the legacy orbit (one shared formula), lifted HEAD_CLEAR × scale above it', () => {
    for (const scale of [1, 3]) {
      const g = gfx();
      drawStunStars(g.g, 100, 200, 37, 4, 1, scale);
      expect(g.stars.length).toBe(3);
      const top = recordingSink();
      stunStarsFx(top, 100, 200, 37, 4, 1, scale);
      expect(top.out.length).toBe(3 * STUN_STARS_FX_PER_STAR);
      const centres = top.out.filter((e) => e.tint === 0xffffff);
      expect(centres.map((e) => [e.x, e.y])).toEqual(g.stars.map((s) => [s.x, s.y - STUN_STARS_FX_HEAD_CLEAR * scale]));
      expect(centres.map((e) => [e.x, e.y])).toEqual([0, 1, 2].map((k) => { const p = stunStarPos(k, 100, 200, 37, 4, scale); return [p.sx, p.sy - STUN_STARS_FX_HEAD_CLEAR * scale]; }));
    }
  });

  it('they twinkle (consecutive ticks differ in brightness) and alpha 0 draws nothing', () => {
    const a = recordingSink();
    const b = recordingSink();
    stunStarsFx(a, 0, 0, 10, 1, 1);
    stunStarsFx(b, 0, 0, 11, 1, 1);
    expect(a.out.map((e) => e.alpha)).not.toEqual(b.out.map((e) => e.alpha));
    const z = recordingSink();
    stunStarsFx(z, 0, 0, 10, 1, 0);
    expect(z.out).toEqual([]);
    expect(a.out.every((e) => e.blend === 'add')).toBe(true);
  });

  it('REACH + NEGATIVE — drawStunStars routes to TOP when fx is on, to Graphics in legacy', () => {
    const rec = installRecording();
    const g = gfx();
    drawStunStars(g.g, 100, 200, 37, 4, 1);
    expect(rec.top.length).toBe(3 * STUN_STARS_FX_PER_STAR);
    expect(g.stars.length).toBe(0);
    setFxLegacyFlag(true);
    const g2 = gfx();
    drawStunStars(g2.g, 100, 200, 37, 4, 1);
    expect(g2.stars.length).toBe(3);
    expect(rec.top.length).toBe(3 * STUN_STARS_FX_PER_STAR);
  });
});

// ───────────────────────────────────────────────────────── V17 — locust cloud
describe('V17 locust cloud', () => {
  function cloudBoard(): World {
    const w = makeWorld(5);
    w.gameState = 'PLAYING';
    w.creatures.clear();
    w.tick = 321;
    const c = {
      id: asCreatureId(42), type: 'locustCloud', ownerPlayerId: P0, pos: { x: 300, y: 260 }, prevPos: { x: 300, y: 260 },
      ehp: PRIMITIVE_MAX_HP, state: 'SEEKING', despawnAtTick: 1_000_000,
    } as unknown as Creature;
    w.creatures.set(c.id, c);
    return w;
  }

  it('ARITHMETIC — every streak is centred on the S171 stroke it replaces (same mote, same orbit, same count)', () => {
    const g = gfx();
    setFxLegacyFlag(false);
    drawLocustClouds(g.g, cloudBoard()); // no hooks installed → the legacy strokes
    expect(g.lines.length).toBe(LOCUST_FX_SPRITES - 2);
    const shade = recordingSink();
    locustCloudFx(shade, 321, 42, 300, 260);
    expect(shade.out.length).toBe(LOCUST_FX_SPRITES);
    const streaks = shade.out.filter((e) => e.tex === 'soft');
    streaks.forEach((s, k) => {
      const [x0, y0, x1, y1] = g.lines[k]!;
      expect(s.x).toBeCloseTo((x0 + x1) / 2, 9);
      expect(s.y).toBeCloseTo((y0 + y1) / 2, 9);
      const m = locustMote(k, 321, 42, 300, 260);
      expect([m.mx, m.my, m.ex, m.ey].map((v) => +v.toFixed(9))).toEqual([x0, y0, x1, y1].map((v) => +v.toFixed(9)));
    });
  });

  it('it is dirt, not light: every sprite is normal blend (the SHADE layer, never bloomed)', () => {
    const shade = recordingSink();
    locustCloudFx(shade, 10, 1, 0, 0);
    expect(shade.out.every((e: FxEmitRecord) => e.blend === 'normal')).toBe(true);
  });

  it('REACH + NEGATIVE — drawLocustClouds routes to SHADE when fx is on, to Graphics in legacy', () => {
    const rec = installRecording();
    const g = gfx();
    drawLocustClouds(g.g, cloudBoard());
    expect(rec.shade.length).toBe(LOCUST_FX_SPRITES);
    expect(g.ops()).toBe(0);
    setFxLegacyFlag(true);
    const g2 = gfx();
    drawLocustClouds(g2.g, cloudBoard());
    expect(g2.lines.length).toBe(LOCUST_FX_SPRITES - 2);
  });
});
