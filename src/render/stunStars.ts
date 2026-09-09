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
  const lift = STUN_STAR_LIFT * scaleMul;
  const rx = STUN_STAR_RX * scaleMul;
  const ry = STUN_STAR_RY * scaleMul;
  const r = STUN_STAR_R * scaleMul;
  for (let k = 0; k < STUN_STAR_COUNT; k++) {
    // Phase: a slow orbit, offset per star and per creature so nothing marches in step.
    const t = (tick * STUN_STAR_SPEED + k * (628 / STUN_STAR_COUNT) + id * 37) % 628;
    const a = t / 100; // ~radians, integer-derived
    const sx = x + Math.cos(a) * rx;
    const sy = y - lift + Math.sin(a) * ry;
    // A four-point twinkle rather than a filled dot: reads as a star at 3 px and needs no texture.
    g.star(sx, sy, 4, r, 0, 0).fill({ color: STUN_STAR_TINT, alpha: 0.9 * alpha });
  }
}
