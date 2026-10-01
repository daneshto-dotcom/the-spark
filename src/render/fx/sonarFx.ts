/**
 * SPARK — S193 `s193/visuals-boss` (V10) — **THE KRAKEN'S SONAR, REBUILT AS A HEAVY CRESCENT OF WATER.**
 *
 * The S170 drawing (`bossAuras.ts` `drawSonarWave`, kept behind `?fx=legacy`) was four stroked arcs. S170's
 * creative pass asked for *"a heavy, rippling crescent of high-pressure water... with a thick, foamy leading
 * edge"* whose edge visually CARRIES the units the knockback shoves. Now:
 *   · BODY — two trailing bands of soft blue water, each a row of sprites stretched along the arc, on the
 *     GROUND layer (it crosses the terrain — `bossAuras.ts`' floor/head rule);
 *   · FOAM — a white leading edge exactly at the front radius, over the units (TOP), so the wave reads
 *     as hitting them;
 *   · SPRAY — droplets thrown FORWARD off the front on little arcs, born where the front was on their
 *     birth tick and outrunning it;
 *   · RIPPLE — on HIGH, a `DisplacementFilter` arc on the ground art at the front (`fxDisplace`).
 *
 * ⛔ THE CONE IS THE SIM'S. `heading` comes from the sim's own `nearestEnemyFor` and `half` from
 * `KRAKEN_SONAR_COS_HALF_ANGLE` (both resolved by the caller, exactly as the S170 drawing did), so the foam
 * spans the real hitbox's angle and sits on the real front. Every sprite is a pure function of the boss id,
 * `world.tick` and the fire tick `tick − sinceFire` — itself re-derived from `(tick + id) % interval`.
 * No Pixi, no DOM, no clock, no `Math.random`. ⚠ Every number below is MINE.
 */

import { envelope, forEachLive, fxHash, fxSeed, type FxDisplaceSink, type FxSink } from './emitter.ts';

const WATER = 0x8fdcff;
const WATER_DEEP = 0x3f9fd8;
const FOAM = 0xffffff;

export const SONAR_FX_BODY_BANDS = 3;
export const SONAR_FX_BODY_SPRITES = 14;
export const SONAR_FX_FOAM = 24;
export const SONAR_FX_SPRAY_LIFE = 10;
export const SONAR_FX_SPRAY_PER_TICK = 2;
/** The ripple's peak shove in board px, at the moment of firing (it fades with the wave). */
export const SONAR_FX_RIPPLE_PX = 10;

/** 0 at both tips of the cone, 1 on its axis — so the crescent thins to points instead of ending in a cut. */
function taper(i: number, n: number): number {
  return Math.sqrt(Math.sin((Math.PI * (i + 0.5)) / n));
}

export function sonarFx(
  top: FxSink,
  ground: FxSink,
  displace: FxDisplaceSink,
  id: number,
  bx: number,
  by: number,
  heading: number,
  half: number,
  sinceFire: number,
  visibleTicks: number,
  range: number,
  tick: number,
): void {
  if (sinceFire < 0 || sinceFire >= visibleTicks) return;
  const seed = fxSeed(id, 0x50a4);
  const t = sinceFire / visibleTicks;
  const front = range * t;
  const fade = 1 - t;
  const a0 = heading - half;
  const span = 2 * half;

  // BODY — the water behind the front, thinning as it passes.
  for (let j = 0; j < SONAR_FX_BODY_BANDS; j++) {
    const r = front - 10 - j * 15;
    if (r <= 8) continue;
    const n = SONAR_FX_BODY_SPRITES;
    const seg = (span * r) / n;
    for (let i = 0; i < n; i++) {
      const th = a0 + ((i + 0.5) / n) * span;
      ground.emit('soft', bx + Math.cos(th) * r, by + Math.sin(th) * r, seg * 1.9, 26 - j * 6, th + Math.PI / 2,
        (0.8 - j * 0.22) * fade * taper(i, n), j === 0 ? WATER : WATER_DEEP, 'add');
    }
  }

  if (front <= 6) return;
  // FOAM — the leading edge, at the front radius, jittered so it boils rather than reading as a line.
  for (let i = 0; i < SONAR_FX_FOAM; i++) {
    const th = a0 + ((i + 0.2 + 0.6 * fxHash(seed, i, 1)) / SONAR_FX_FOAM) * span;
    const r = front + (fxHash(seed, i, tick) - 0.5) * 6;
    const fx = bx + Math.cos(th) * r;
    const fy = by + Math.sin(th) * r;
    const tp = taper(i, SONAR_FX_FOAM);
    const size = 13 + 9 * fxHash(seed, i, 2);
    top.emit('soft', fx, fy, size * 1.9, size, th + Math.PI / 2, 0.95 * fade * tp, FOAM, 'add');
    if ((i & 1) === 0) top.emit('core', fx, fy, 7, 7, 0, fade * tp, FOAM, 'add');
  }

  // SPRAY — droplets born on the front at their birth tick, thrown forward faster than it travels.
  const fire = tick - sinceFire;
  const speed = range / visibleTicks; // the front's own speed, px a tick
  forEachLive(tick, 1, SONAR_FX_SPRAY_LIFE, SONAR_FX_SPRAY_PER_TICK, 0, (birth, k, u) => {
    const age = birth - fire;
    if (age < 1 || age > visibleTicks - 4) return;
    const th = heading + (fxHash(seed, birth, k + 10) * 2 - 1) * half * 0.9;
    const d = speed * age + u * speed * SONAR_FX_SPRAY_LIFE * (1.2 + 0.6 * fxHash(seed, birth, k + 11));
    const hop = Math.sin(u * Math.PI) * (8 + 10 * fxHash(seed, birth, k + 12));
    const birthFade = 1 - age / visibleTicks;
    top.emit('core', bx + Math.cos(th) * d, by + Math.sin(th) * d - hop, 6, 6, 0,
      envelope(u, 0.15) * birthFade, k === 0 ? FOAM : WATER, 'add');
  });

  // RIPPLE — the ground itself shoved along the front (HIGH only; a no-op sink otherwise).
  if (front > 12) displace.ripple(bx, by, front, heading, SONAR_FX_RIPPLE_PX * fade);
}
