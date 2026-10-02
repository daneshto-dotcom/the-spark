/**
 * SPARK — S194 T9 COHERENCE · **EVERY UNIT THAT DIES GETS THE SAME DEATH BEAT.**
 *
 * Owner, S194: *"Why? Are you gonna do different effects for each thing or? … make it consistent … you …
 * should have everything more … consistent and … cohesive and mindful of each other and coherent."*
 *
 * ⛔ WHAT WAS INCONSISTENT (measured from the shipped art and the three creature renderers, `18560cd8`):
 *
 * | unit | what a kill looked like |
 * |---|---|
 * | race units, tier-3 units, tier-9 bosses, direwolf | the atlas `die` row plays (`goblinRenderer` corpse) |
 * | Voltkin | a lightning cloud + zap-burst SFX (`creatureRenderer`) |
 * | chewer | a green-goo splat + splat SFX (`chewerRenderer`) |
 * | **the six goblins** (melee, archer, shield, hound, bat-rider, sapper) | ⛔ **nothing — they blink out**: none of their six sheets has a `die` row (a `"die"` grep over the six goblin-* anim manifests under public/godly = 0) |
 * | endgame monster, mega pants | ⛔ nothing visual (no `die` row) |
 * | locust cloud, lightning drone | ⛔ nothing on a kill |
 *
 * The goblins are the commonest unit in the game, so the commonest death on the board was the one with no
 * beat at all — while the same swing killing a race unit beside it played a full fall.
 *
 * ⭐ THE FIX IS ONE SHARED BEAT UNDER EVERY KILL, NOT TEN BESPOKE ONES. A soft flash in the dead unit's
 * SEAT colour (whose unit fell is the information), a ring of dust kicked up at its feet, and motes thrown
 * up and out that fall back — all on the S192 fx substrate, sized by the unit's sprite scale. The bespoke
 * identities (the `die` rows, the Voltkin's cloud, the chewer's goo) stay and play OVER it, exactly as the
 * combo silhouettes stay over the build juice (`buildFx.ts`): the shared beat is the floor every unit gets,
 * not a replacement for anyone's art.
 *
 * ⭐ KEYED BY FAMILY, so a new unit type cannot be added without deciding which beat it gets: `UNIT_FAMILY`
 * is a `Record<CreatureType, …>`, so `tsc` refuses a new `CreatureType` until it has a row, and
 * `unitDeathFx.census.test.ts` runs a real kill for EVERY row through the renderer.
 *
 * | family | members | the beat |
 * |---|---|---|
 * | `unit` | goblins, race + tier-3 units, direwolf, chewer | flash, dust ring, 8 motes |
 * | `boss` | the six tier-9 bosses, the endgame monster, mega pants | the same, ×1.6 motes, plus a soft shock ring |
 * | `swarm` | locust cloud, bat swarm | flash and 14 small motes scattering — a swarm has no feet to kick dust |
 * | `construct` | Voltkin, lightning drone | flash and cool-white spark motes, no dust — they are made of charge |
 *
 * ⚠ EVERY NUMBER HERE IS MINE (an owner LOOK item, like every other S192+ fx number). Sized so a goblin's
 * beat sits inside its own sprite box and a boss's reads at a glance from across the board.
 *
 * PURE: a function of (seed, position, scale, colour, the beat's 0..1 life). No Pixi, no DOM, no clock, no
 * `Math.random` (`fxGuards.test.ts`).
 */

import type { CreatureType } from '../../state/creatures/creature.ts';
import { clamp01, easeOutCubic, fxHash, mixColor, type FxSink } from './emitter.ts';

export type UnitFamily = 'unit' | 'boss' | 'swarm' | 'construct';

/** Every creature type, and the death beat it gets. ⛔ A `Record`, so a new type fails `tsc` until it has a row. */
export const UNIT_FAMILY: Readonly<Record<CreatureType, UnitFamily>> = {
  goblinMelee: 'unit',
  goblinArcher: 'unit',
  goblinShield: 'unit',
  goblinHound: 'unit',
  goblinBat: 'unit',
  goblinSuicide: 'unit',
  raceUnit: 'unit',
  t3Hound: 'unit',
  t3Scarab: 'unit',
  t3Piranha: 'unit',
  t3PiranhaElite: 'unit',
  t3Bat: 'unit',
  t3Warband: 'unit',
  t3Souleater: 'unit',
  direwolf: 'unit',
  chewer: 'unit',
  t3BatSwarm: 'swarm',
  locustCloud: 'swarm',
  voltkin: 'construct',
  lightningDrone: 'construct',
  t9BossVampires: 'boss',
  t9BossNagas: 'boss',
  t9BossMummies: 'boss',
  t9BossZombies: 'boss',
  t9BossOrcs: 'boss',
  t9BossDemons: 'boss',
  endgameMonster: 'boss',
  megaPants: 'boss',
};

interface DeathLook {
  /** Motes thrown per death. */
  readonly motes: number;
  /** Dust puffs kicked up at the feet (0 = none). */
  readonly dust: number;
  /** A soft shock ring running out from the body. */
  readonly ring: boolean;
  /** The mote colour at birth — they cool toward the seat colour as they fall. */
  readonly hot: number;
}

/** ⚠ MINE — the per-family look. One table, so the families differ ONLY where a reason is written above. */
export const UNIT_DEATH_LOOK: Readonly<Record<UnitFamily, DeathLook>> = {
  unit: { motes: 8, dust: 6, ring: false, hot: 0xffffff },
  boss: { motes: 13, dust: 9, ring: true, hot: 0xffffff },
  swarm: { motes: 14, dust: 0, ring: false, hot: 0xffffff },
  construct: { motes: 10, dust: 0, ring: false, hot: 0xe8f6ff },
};

/** How long the beat lasts, in ticks (0.6 s). ⚠ MINE — the length of the `die` row's first half. */
export const UNIT_DEATH_LIFE_TICKS = 36;
/** The base body radius the beat is sized from, before the sprite scale (a goblin's sprite is ~2.5× this tall). */
export const UNIT_DEATH_BASE_R = 13;
/** Dust is a warm grey with a breath of the seat colour, so it reads as ground, not as light. */
const DUST = 0x8a8072;

/**
 * Draw one death beat. `t` is its 0..1 life; `scale` the unit's sprite scale (`creatureSpriteScaleMul`).
 * `top` is the bloomed additive layer, `shade` the non-bloomed normal-blend one (dust covers, it does not glow).
 */
export function unitDeathFx(
  top: FxSink, shade: FxSink, seed: number, family: UnitFamily,
  x: number, y: number, scale: number, color: number, t: number,
): void {
  if (t < 0 || t >= 1) return;
  const look = UNIT_DEATH_LOOK[family];
  const r = UNIT_DEATH_BASE_R * scale;
  const fade = 1 - t;

  // The flash: a soft disc in the seat colour and a hot core, gone in the first fifth.
  if (t < 0.2) {
    const f = 1 - t / 0.2;
    top.emit('soft', x, y, r * 4.2, r * 4.2, 0, 0.55 * f, color, 'add');
    top.emit('core', x, y, r * 1.9, r * 1.9, 0, 0.85 * f, mixColor(color, 0xffffff, 0.6), 'add');
  }

  if (look.ring) {
    const d = r * 2 * (1 + 2.6 * easeOutCubic(t));
    top.emit('ring', x, y, d, d, 0, 0.6 * fade * fade, color, 'add');
  }

  // Dust kicked out along the ground at the feet, swelling as it settles.
  if (look.dust > 0) {
    const e = easeOutCubic(t);
    const footY = y + r * 0.45;
    for (let k = 0; k < look.dust; k++) {
      const a = (k / look.dust) * Math.PI * 2 + fxHash(seed, k, 3) * 0.7;
      const d = r * (0.5 + 1.5 * e) * (0.8 + 0.4 * fxHash(seed, k, 4));
      const s = r * (1.1 + 1.3 * e);
      const rot = fxHash(seed, k, 5) * Math.PI * 2 + t * 0.8;
      shade.emit('smoke', x + Math.cos(a) * d, footY + Math.sin(a) * d * 0.45 - r * 0.4 * e, s, s, rot,
        0.5 * fade * fade, mixColor(DUST, color, 0.22), 'normal');
    }
  }

  // Motes: thrown up and out, then falling, cooling from hot to the seat colour.
  const g = r * 3.2; // fall over the beat's life, in px
  for (let k = 0; k < look.motes; k++) {
    const a = -Math.PI / 2 + (fxHash(seed, k, 1) - 0.5) * 2.6;
    const speed = r * (1.4 + 1.8 * fxHash(seed, k, 2));
    const px = x + Math.cos(a) * speed * t;
    const py = y + Math.sin(a) * speed * t + g * t * t;
    const sz = (family === 'swarm' ? 2.6 : 3.6) * Math.min(scale, 1.8);
    top.emit('soft', px, py, sz, sz, 0, 0.9 * clamp01(fade * 1.3), mixColor(look.hot, color, t), 'add');
  }
}
