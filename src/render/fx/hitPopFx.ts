/**
 * SPARK — S194 T9 COHERENCE · **EVERY HIT THAT PRINTS A RED NUMBER ALSO LANDS VISIBLY ON THE THING IT HIT.**
 *
 * Owner, S194: *"make it consistent … everything more … consistent and … cohesive and mindful of each other."*
 *
 * ⛔ WHAT WAS INCONSISTENT. Every attack in the game had an impact beat at the victim EXCEPT the commonest one:
 *
 * | attack | impact at the victim (`18560cd8`) |
 * |---|---|
 * | laser turret | spark burst at the beam's end (`turretRenderer` → `lightningSparksFx`) |
 * | Voltkin arc | spark burst at the arc's end (`lightningFx`) |
 * | castle gun | impact spark burst (`castleShotFx`) |
 * | Helga's slap | flash, ring and 8 streaks (`slapImpactFx`) |
 * | archer / harpoon | flash + dust puff (`projectileImpactFx`) |
 * | chewer bite | flash + chips (`chewBiteFx`) |
 * | **every MELEE unit** (goblins, race units, tier-3, bosses, direwolf) | ⛔ **nothing** — the number floats up from a victim that never visibly took the blow |
 * | blasts, ROT, SCORCHED GROUND, the stink aura | their own area effect, nothing at each victim |
 *
 * And within the floaters themselves, the heal had a companion and the hit did not: a heal number sparkles
 * (`floaterFx.healSparkleFx`), a damage number did nothing at the victim at all.
 *
 * ⭐ THE FIX IS THE HIT'S FLOOR, IN THE ONE PLACE EVERY HIT IS ALREADY KNOWN. `DamageNumbers` is the single
 * consumer that derives every hit in the game from synced state — creatures, shapes, connectors, Helga, stink
 * bags and the keep — so the pop is drawn from there, at the VICTIM (not the drifted number), for exactly the
 * hits that print. Nothing can print a red number without landing a pop, and nothing can pop without printing.
 * The bespoke impacts above stay and play over it, the way the combo silhouettes stay over the build juice.
 *
 * Keyed by what was hit (`HitTarget`), so the keep's pop reads at castle scale and a goblin's sits inside it.
 * ⚠ EVERY NUMBER IS MINE (an owner LOOK item). Small and fast on purpose: 12 frames, 5 sprites — a melee
 * scrum of thirty units must read as "blows landing", not as a fireworks display.
 *
 * PURE: (seed, position, size, the pop's 0..1 life). No Pixi, no clock, no `Math.random`.
 */

import { easeOutCubic, fxHash, mixColor, type FxSink } from './emitter.ts';

export type HitTarget = 'unit' | 'structure' | 'keep';

/** The pop's radius per target, before the unit's sprite scale. ⚠ MINE. */
export const HIT_POP_SIZE: Readonly<Record<HitTarget, number>> = { unit: 9, structure: 8, keep: 20 };
/** How long a pop lives, in render FRAMES — the floaters' own clock (`damageNumbers.advance`). ⚠ MINE. */
export const HIT_POP_FRAMES = 12;
/** Sparks per pop. */
export const HIT_POP_SPARKS = 3;
/** Pops alive at once — a 120-unit wave-5 fight must not turn into hundreds of sprites. ⚠ MINE. */
export const HIT_POP_MAX_LIVE = 40;

/** A white-hot core and a red rim — the red of the damage number itself (0xe01b1b), lifted for additive light. */
export const HIT_POP_CORE = 0xfff3ea;
export const HIT_POP_RIM = 0xff4a2a;

/** Draw one hit pop; `t` is its 0..1 life, `size` its radius in px. */
export function hitPopFx(top: FxSink, seed: number, x: number, y: number, size: number, t: number): void {
  if (t < 0 || t >= 1) return;
  const life = 1 - t;
  const go = easeOutCubic(t);
  const core = size * (2.2 - 0.8 * t);
  top.emit('core', x, y, core, core, 0, 0.9 * life * life, HIT_POP_CORE, 'add');
  const ring = size * 2 * (0.8 + 1.4 * go);
  top.emit('ring', x, y, ring, ring, 0, 0.7 * life, HIT_POP_RIM, 'add');
  for (let s = 0; s < HIT_POP_SPARKS; s++) {
    const a = fxHash(seed, s, 0x417) * Math.PI * 2;
    const r = size * (0.8 + 1.6 * fxHash(seed, s, 0x418)) * go;
    top.emit('soft', x + Math.cos(a) * r, y + Math.sin(a) * r, size * 0.9 * life + 2, 2.4, a, 0.9 * life,
      mixColor(HIT_POP_CORE, HIT_POP_RIM, t), 'add');
  }
}

/** True for an emit that `hitPopFx` made — lets the heal-sparkle tests count only the sparkle. */
export function isHitPopEmit(e: { tint: number }): boolean {
  return e.tint === HIT_POP_CORE || e.tint === HIT_POP_RIM || isHitPopSpark(e.tint);
}
function isHitPopSpark(tint: number): boolean {
  // The sparks cool core → rim along `mixColor`; both ends are red-dominant, so a spark tint is one whose
  // red channel is 0xff and whose blue is no higher than the core's. The heal sparkle is green-dominant.
  return ((tint >> 16) & 0xff) === 0xff && (tint & 0xff) <= (HIT_POP_CORE & 0xff) && ((tint >> 8) & 0xff) <= 0xf3;
}
