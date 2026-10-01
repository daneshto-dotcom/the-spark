/**
 * SPARK — S170 P5 — **"SEEING STARS", SHARED BY EVERY RENDERER THAT CAN DRAW A STUNNED UNIT.**
 *
 * Owner R152: *"maybe there is like a cool stunned 'seeing stars' effect above the stunned creatures
 * heads? it has to be consistent and coherent obviously."* — and in S170, of the whole ability-VFX
 * pass: the stun stars are the ONE existing ability visual he likes.
 *
 * ## ⛔ WHY THIS LEFT `goblinRenderer` AND BECAME A MODULE
 *
 * It shipped as a private method there, which silently scoped it to `GOBLIN_KINDS`. But `applyStun`
 * has exactly one production caller — the Kraken's sonar (`bossSkillsKraken.ts`) — and its victim
 * scan has **no type filter at all**. So the sonar stuns whatever is standing in the cone, including
 * `voltkin`, `chewer` and `lightningDrone`, and every one of those is drawn by a DIFFERENT renderer:
 * `creatureRenderer` (voltkin + drones) and `chewerRenderer`. Those three froze in place with no
 * stars and no explanation — the condition read as the game hanging rather than as a stun, on units
 * the owner's own counterplay is aimed at.
 *
 * ⚠ A renderer-local effect is the wrong shape for a condition that lives on `Creature`. The stun is
 * a property of the ENTITY, so its visual belongs wherever entities are drawn, not in one of the
 * three places that happens to own the goblins.
 *
 * ## ⭐ DERIVED, NEVER PUSHED — and it is the reference implementation for the rest of the pass
 *
 * Everything here is a pure function of `(tick, id, pos)`. `stunnedUntilTick` is serialized
 * (`save.ts`) and hashed (`stateHashFull.ts` `:su`), so both peers compute the same stars in the same
 * place on the same tick with nothing on the wire. That is mandatory rather than tidy: a one-shot
 * `world.effects` push is lost ~5/6 of the time, because effects sample into snapshots at
 * `NET_SNAPSHOT_HZ` (10) while the renderer wipes `world.effects` every frame at 60.
 *
 * ⚠ NO WALL CLOCK AND NO `Math.random`. The orbit phase is integer-derived from `tick` and the
 * creature id, so it is identical on every peer and survives a replay.
 */

import type { Graphics } from 'pixi.js';
import type { FxSink } from './fx/emitter.ts';
import { fxActive, fxTop } from './fx/fxState.ts';

/* ── The dial. ⚠ EVERY NUMBER HERE IS MINE, NOT THE OWNER'S: he asked for "a cool stunned 'seeing
 * stars' effect above the stunned creatures heads" and gave no geometry. Sized so three stars clear
 * a goblin's head without covering the HP pips, and deliberately small enough that a stunned crowd
 * does not become a wall of yellow. */
const STUN_STAR_COUNT = 3;
const STUN_STAR_R = 3.2;
/** Orbit radii — wider than tall, so it reads as a ring seen in perspective rather than a halo. */
const STUN_STAR_RX = 13;
const STUN_STAR_RY = 4.5;
/** How far above the creature's origin the ring floats. Clears the tallest goblin's head. */
const STUN_STAR_LIFT = 30;
/** Orbit speed, in integer phase units per tick — a lazy spin, not a blur. */
const STUN_STAR_SPEED = 4;
const STUN_STAR_TINT = 0xffe066;

/**
 * ⭐⭐ S170 P5 — **`scaleMul` IS THE BUG FIX, AND IT IS WORST ON THE UNITS THE STUN EXISTS FOR.**
 *
 * The lift and both orbit radii were flat constants, tuned against a goblin. `creatureSpriteScaleMul`
 * scales a sprite by type, and the six tier-9 bosses carry `T9_BOSS_SPRITE_SCALE_MUL` — so on a boss
 * the ring floated 30 px above the ORIGIN of a sprite several times that tall, i.e. INSIDE the
 * artwork. The stun's only counterplay target is a boss, and the boss is precisely where the one
 * effect the owner likes was invisible.
 *
 * Passing the multiplier in (rather than importing `creatureSpriteScaleMul` here) keeps this module
 * free of the atlas/type graph and lets the two non-atlas renderers pass 1 honestly.
 */
export function drawStunStars(
  g: Graphics,
  x: number,
  y: number,
  tick: number,
  id: number,
  alpha: number,
  scaleMul = 1,
): void {
  const r = STUN_STAR_R * scaleMul;
  // ⭐ S193 (V15) — the rebuilt stars (`stunStarsFx` below) on the same orbit; `?fx=legacy` keeps the flat stars.
  if (fxActive()) { stunStarsFx(fxTop(), x, y, tick, id, alpha, scaleMul); return; }
  for (let k = 0; k < STUN_STAR_COUNT; k++) {
    const { sx, sy } = stunStarPos(k, x, y, tick, id, scaleMul);
    // A four-point twinkle rather than a filled dot: reads as a star at 3 px and needs no texture.
    g.star(sx, sy, 4, r, 0, 0).fill({ color: STUN_STAR_TINT, alpha: 0.9 * alpha });
  }
}

/** Star `k`'s place on the orbit — ONE formula, shared by the legacy drawing and the rebuilt one. PURE. */
export function stunStarPos(k: number, x: number, y: number, tick: number, id: number, scaleMul = 1): { sx: number; sy: number } {
  // Phase: a slow orbit, offset per star and per creature so nothing marches in step.
  const t = (tick * STUN_STAR_SPEED + k * (628 / STUN_STAR_COUNT) + id * 37) % 628;
  const a = t / 100; // ~radians, integer-derived
  return { sx: x + Math.cos(a) * STUN_STAR_RX * scaleMul, sy: y - STUN_STAR_LIFT * scaleMul + Math.sin(a) * STUN_STAR_RY * scaleMul };
}

/**
 * ⚠ MINE (S193, measured on the 2x screenshots in `SPARK_Visuals_Pilot/visuals-2`): with today's atlases
 * `STUN_STAR_LIFT` puts the ring at the CHEST of a goblin (~70 % of its 45 px height) and at the belly of the
 * zombie boss — and the legacy stars, drawn in the renderer's Graphics UNDER the sprites, are hidden behind
 * the art there. The rebuilt stars draw OVER the sprite, so they are lifted this much more (× scaleMul)
 * to sit above the head where `bossAuras.ts`' rule says a state effect belongs. Legacy is untouched.
 */
export const STUN_STARS_FX_HEAD_CLEAR = 22;

/** Sprites per rebuilt star: a soft halo, two crossed glints and a hot centre. */
export const STUN_STARS_FX_PER_STAR = 4;

/**
 * ⭐ S193 `s193/visuals-boss` (V15) — **THE STARS AS LIGHT.** Same three stars on the same orbit
 * (`stunStarPos`), now additive sprites on the bloomed TOP layer: a soft halo, a four-point glint made of
 * two crossed stretched hot-cores that slowly spin, and a white centre. Each TWINKLES — its brightness
 * and size breathe on its own phase from `(tick, k, id)`, so a stunned crowd shimmers instead of
 * blinking in step. ⚠ The numbers are MINE (the owner asked only for "cool" and "consistent").
 * PURE: no Pixi, no clock, no `Math.random` — the sink is handed in.
 */
export function stunStarsFx(top: FxSink, x: number, y: number, tick: number, id: number, alpha: number, scaleMul = 1): void {
  if (alpha <= 0) return;
  const r = STUN_STAR_R * scaleMul;
  for (let k = 0; k < STUN_STAR_COUNT; k++) {
    const { sx, sy: sy0 } = stunStarPos(k, x, y, tick, id, scaleMul);
    const sy = sy0 - STUN_STARS_FX_HEAD_CLEAR * scaleMul;
    const tw = 0.5 + 0.5 * Math.sin(((tick * 23 + k * 211 + id * 97) % 628) / 100);
    const spin = (((tick * 3 + k * 120 + id * 53) % 360) * Math.PI) / 180;
    const len = r * (4.6 + 1.6 * tw);
    top.emit('soft', sx, sy, r * 7, r * 7, 0, (0.28 + 0.22 * tw) * alpha, STUN_STAR_TINT, 'add');
    top.emit('core', sx, sy, len, r * 1.1, spin, (0.75 + 0.25 * tw) * alpha, STUN_STAR_TINT, 'add');
    top.emit('core', sx, sy, len, r * 1.1, spin + Math.PI / 2, (0.75 + 0.25 * tw) * alpha, STUN_STAR_TINT, 'add');
    top.emit('core', sx, sy, r * 2, r * 2, 0, (0.7 + 0.3 * tw) * alpha, 0xffffff, 'add');
  }
}
