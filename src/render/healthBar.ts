/**
 * SPARK — S171 (owner R171-E) — **A THIN HEALTH BAR OVER EVERY UNIT.**
 *
 * > *"how the fuck do I know if your Kraken has so much more health than my enemies? If it's even
 * > worth building an enemy that attacks, like, to see how much something it attacks, how much
 * > health comes off. It should be a really thin red health bar above every enemy, and you can see
 * > it just decreases the more damage it takes. ... Obviously, the size of the creature also depends
 * > on the size of the health bar. So the big Kraken will have a big health bar. It'll be a little
 * > thicker ... maybe even the health bar will be white. We'll see how it looks, but the health bar
 * > needs to be really thin."*
 *
 * ## ⛔ THERE WAS ALREADY A HEALTH READOUT, AND ITS THREE DEFECTS ARE HIS COMPLAINT, ITEM FOR ITEM
 *
 * `goblinRenderer.drawHpPips` drew per-HP pips above the head. It is deleted by this module, and it
 * is worth recording exactly what was wrong with it, because each fault maps onto a sentence above:
 *
 *   1. **It hid while undamaged** — `if (remaining >= hpPoints) return; // undamaged: no clutter`.
 *      A full-health Kraken therefore drew NOTHING, so there was no pool to compare against. That
 *      is *"how the fuck do I know if your Kraken has so much more health"* precisely: the answer
 *      was on screen only for things that were already hurt.
 *   2. **It covered 20 of 23 types** — the loop was gated on `GOBLIN_KINDS`, so the chewer, the
 *      Voltkin and the lightning drone had no readout at all.
 *   3. **It was unscaled** — 1.6 px pips at a flat `BODY_R * 2.5` lift, tuned against a goblin. On a
 *      boss sprite the pips sat *inside the chest*. That is the identical defect S170 fixed on the
 *      stun stars, and `creatureSpriteScaleMul` is the identical cure.
 *
 * The castle bar (`gathererRenderer.drawKeep`) still carries fault 1 — noted, not touched here.
 *
 * ## ⭐ IT COSTS NOTHING ON THE WIRE, WHICH IS WHY IT IS A SMALL CHANGE
 *
 * A bar needs CURRENT and MAX. Both are already on every peer:
 *   · CURRENT — `serializeCreature` emits `ehp` only when damaged, but `deserializeCreature`
 *     rehydrates the omitted case from config, so `c.ehp` is always populated and always correct.
 *     `trimMirrorCreature` strips only `targetCreatureId`. `applySnapshotCore` clears and rebuilds,
 *     so no stale value can outlive a heal.
 *   · MAX — `unitPoolFifths(config.hp, config.def)` is a pure function of the wire-carried TYPE.
 * Zero new fields, zero protocol bump, zero four-sites work.
 *
 * ⛔ AND IT IS NOT THE ONE-SHOT PROBLEM. A bar is a continuous readout of synced, hashed state, not
 * an event — so the rule that kills naive damage numbers (a `world.effects` push is lost ~5/6 of the
 * time) simply does not apply. This is the `stunStars` shape: derived per frame, nothing on the wire.
 *
 * ## THE ENCODING, AND THE TRAP IN THE OBVIOUS VERSION
 *
 * TRACK LENGTH encodes MAX pool; FILL LENGTH encodes CURRENT pool — **both on the same scale**, so
 * two bars anywhere on screen are directly comparable by eye. That is the whole ask.
 *
 * ⚠ THE OBVIOUS ALTERNATIVE INVERTS HIS OWN COMPARISON. Sizing the track by max and then filling it
 * by a PERCENTAGE makes a Kraken at 10 % draw a shorter fill than a healthy goblin — when 10 % of
 * 132 fifths is 13, and a goblin's whole pool is 7–16. They are comparable in fact and the picture
 * would say otherwise. Filling in absolute units keeps the picture honest.
 *
 * ⚠ `sqrt` COMPRESSES THE RANGE ON PURPOSE. Linear on a 143-fifth boss against a 7-fifth chewer is a
 * 20:1 bar, which is a stripe next to a dash. `sqrt` makes it ~4.5:1 — the boss still visibly
 * dwarfs the chewer, which is the point, without the small units becoming unreadable.
 */

import type { Graphics } from 'pixi.js';
import { isConcealed } from './concealment.ts';
import { creatureSpriteScaleMul } from './towerFrames.ts';
import { liftOf } from './creatureLift.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import { getDefenderConfig } from '../state/defenders/defender.ts';
import { unitPoolFifths } from '../state/stats.ts';
import type { World } from '../state/world.ts';
import type { CreatureId } from '../types.ts';

/**
 * How big a creature is actually DRAWN, supplied by the renderer that owns its sprite.
 *
 * ⚠ THE BAR CANNOT WORK THIS OUT ITSELF, and that is why it is injected rather than imported. This
 * module walks `world.creatures` deliberately — so it covers the three types the goblin loop misses
 * — but on-screen size lives in the atlas + `GOBLIN_SPRITE_BASE_SCALE`, which only the sprite owner
 * knows. `null` for anything with no sprite (the procedural puppets), which falls back to a default.
 */
export type SpriteBoxLookup = (id: CreatureId) => { w: number; h: number } | null;

/**
 * ⚠ "REALLY THIN" IS HIS REQUIREMENT AND HE SAID IT TWICE. 1.5 px at scale 1. A boss multiplies it,
 * so the Kraken's bar is *"a little thicker"* exactly as asked, without a second dial.
 */
const BAR_H = 1.5;

/** px of bar per √fifth. ⚠ MINE — see the `sqrt` note in the docblock for why it is not linear. */
const BAR_PX_PER_SQRT_FIFTH = 3.4;

/** Floor and ceiling, so a chewer is still readable and a boss does not become a scenery element. */
const BAR_MIN_W = 9;
const BAR_MAX_W = 62;

/**
 * ⭐ S171 (owner, second pass) — **CLEARANCE ABOVE THE SPRITE'S OWN TOP, not a flat offset.**
 *
 * The first version lifted a flat 26 px and the owner sent a screenshot of a bar sitting ON a
 * creature: *"the health bars should be above the heads of the enemies"*. Sprites are FOOT-anchored,
 * so a fixed lift lands inside anything taller than the number it was tuned against — the same class
 * as the old HP pips ending up inside a boss's chest. The bar now clears the measured sprite HEIGHT
 * and this is only the gap above it.
 */
const BAR_LIFT = 10;

/** Fallback height for a creature with no atlas sprite (the procedural puppets). */
const FALLBACK_SPRITE_H = 26;

/**
 * ⚠ HIS FIRST CHOICE WAS RED AND HIS OPEN QUESTION WAS WHITE — *"maybe even the health bar will be
 * white. We'll see how it looks."* Shipped RED; the swap is this one constant.
 */
const FILL_TINT = 0xe0342f;
const TRACK_TINT = 0x140a08;
const TRACK_ALPHA = 0.5;

/**
 * ⭐ Draw a health bar over every creature and every pooled defender.
 *
 * ⚠ IT WALKS THE MAPS ITSELF rather than riding the goblin loop, for the reason `drawBossAuras`
 * gives: that loop is gated on `GOBLIN_KINDS` and on an atlas being READY. Fault 2 above is exactly
 * what riding it costs, and a bar that waited for a sprite sheet to decode would blink on seconds
 * into every fight.
 */
export function drawHealthBars(g: Graphics, world: World, box?: SpriteBoxLookup): void {
  for (const c of world.creatures.values()) {
    if (c.ehp <= 0) continue;
    if (isConcealed(c.pos.x, c.pos.y, c.ownerPlayerId)) continue;
    const cfg = getCreatureConfig(c.type);
    const max = unitPoolFifths(cfg.hp, cfg.def);
    if (max <= 0) continue;
    const scale = creatureSpriteScaleMul(c.type);
    const b = box?.(c.id) ?? null;
    drawBar(g, c.pos.x, c.pos.y - liftOf(c.type), c.ehp, max, scale,
            b?.w ?? 0, b?.h ?? FALLBACK_SPRITE_H * scale);
  }

  /*
   * ⭐ DEFENDERS TOO, AND HELGA IS THE REASON. She is the one named character on the board with a
   * real pool and no readout, and a `CREATURE_CONFIGS` coverage test cannot see her because she is
   * not a creature. A tower carries `ehp === null` and is skipped — it has no pool to show.
   */
  for (const d of world.defenders.values()) {
    if (d.ehp === null || d.ehp <= 0) continue;
    if (isConcealed(d.pos.x, d.pos.y, d.ownerPlayerId)) continue;
    // ⚠ MAX COMES FROM THE CONFIG, NOT FROM A STORED FIELD — `Defender` has no `maxEhp`, and its
    // live `ehp` is the same pure `unitPoolFifths(unitStats)` the factory seeded it with.
    const stats = getDefenderConfig(d.kind).unitStats;
    if (stats === null) continue; // a tower: no pool, nothing to show
    drawBar(g, d.pos.x, d.pos.y, d.ehp, unitPoolFifths(stats.hp, stats.def), 1, 0, FALLBACK_SPRITE_H);
  }
}

/**
 * One bar. Track length from MAX, fill length from CURRENT, both through the same `sqrt` mapping so
 * the two are directly comparable — see the encoding note in the docblock.
 */
function drawBar(
  g: Graphics,
  x: number,
  y: number,
  ehp: number,
  max: number,
  scale: number,
  /** The creature's drawn sprite width, or 0 when it has no sprite. */
  spriteW: number,
  /** The creature's drawn sprite height — how far the bar has to rise to clear its head. */
  spriteH: number,
): void {
  const span = (v: number): number =>
    Math.min(BAR_MAX_W, Math.max(BAR_MIN_W, Math.sqrt(Math.max(0, v)) * BAR_PX_PER_SQRT_FIFTH));

  /*
   * ⛔⛔ LENGTH IS **NOT** SCALED BY THE SPRITE, AND THE FIRST DRAFT SCALED IT.
   *
   * Multiplying the whole bar by `creatureSpriteScaleMul` felt right — a bigger unit, a bigger bar —
   * and it silently destroyed the one property the encoding exists for. Length is the READOUT: two
   * fills are only comparable if equal remaining pools draw equal pixels, and a per-type multiplier
   * on length makes a boss's fill longer than a goblin's for the *same* remaining health. The
   * cross-unit comparability test caught it at 14.4 px against 9.
   *
   * So the split is: LENGTH carries the data and is scale-free; THICKNESS and LIFT are presentation
   * and do scale. That also satisfies the owner's sentence more exactly than uniform scaling did —
   * *"the big Kraken will have a big health bar, it'll be a little thicker"*. His bar is already
   * longer because his POOL is bigger, which is the honest reason for it to be.
   */
  /*
   * ⭐ S171 (owner, second pass) — **AT LEAST AS WIDE AS THE CREATURE IT BELONGS TO.**
   *
   * *"make them longer (at least the length of the creatures width that it represents)"*. So the
   * pool-derived length is a FLOOR, not the answer: whichever is longer wins.
   *
   * ⚠ The TRACK is what `span()` sizes. The FILL is a plain fraction of it — see below.
   */
  /*
   * ⛔⛔ S172 (owner) — **THE FILL IS LINEAR, AND EVERY EARLIER VERSION OF IT WAS A LIE.**
   *
   * Owner, having played S171's bars: *"they don't seem to decrease. The creatures just die ... The
   * whole idea of a health bar is that you can see how much health someone has. Now it's just a
   * freaking artistic thing."* He was right twice over, and neither cause was a threshold.
   *
   * 1. ⛔ **`span()` WAS APPLIED TO THE FILL AS WELL AS THE TRACK, AND ITS FLOOR FROZE SIX UNITS.**
   *    `BAR_MIN_W / BAR_PX_PER_SQRT_FIFTH` squared is 7.01, so for any unit whose WHOLE POOL is
   *    ≤ 7 fifths, `span(ehp)` and `span(max)` both clamp to the same 9 px at every health level.
   *    The fill could not move. That is goblinMelee (pool 7), goblinHound (5), goblinArcher (6),
   *    raceUnit (6), locustCloud (5) and chewer (5) — the six most numerous units in the game had a
   *    bar that was mathematically incapable of decreasing.
   * 2. ⛔ **AND ABOVE THE FLOOR THE SQRT UNDER-REPORTED IT.** A unit at half health drew 71 % of its
   *    track; at a tenth it still drew 32 %.
   *
   * ⭐ THE SPLIT THAT FIXES BOTH WITHOUT LOSING WHAT THE SQRT WAS FOR. The two properties were
   * never in conflict — they belong to different parts of the bar:
   *   · the **TRACK** keeps `span()`, so its LENGTH still encodes the max pool and a boss's bar is
   *     still visibly longer than a chewer's (*"the big Kraken will have a big health bar"*, R171-E);
   *   · the **FILL** is now `w × ehp/max`, a straight fraction, so half health is half a bar on
   *     every unit in the game.
   * No owner ruling is overturned: the sqrt encoding he asked for lives on in the track, which is
   * the part that does the cross-unit comparing. Widening to the sprite needs no `k` any more — a
   * fraction of the final width is correct whatever set that width.
   *
   * ⚠ `healthBar.test.ts` asserts this for EVERY `CreatureType`, not one boss. The S171 test that
   * should have caught it used `t9BossNagas`, whose 132-fifth pool sits 19× above the floor.
   */
  const w = Math.max(span(max), spriteW);
  const fw = max > 0 ? w * Math.min(1, Math.max(0, ehp / max)) : 0;
  const h = BAR_H * scale;
  const bx = x - w / 2;
  // Clear the sprite's own top, then a small constant gap. Foot-anchored, so the top is one full
  // sprite height above `y`.
  const by = y - spriteH - BAR_LIFT * scale;

  g.rect(bx, by, w, h).fill({ color: TRACK_TINT, alpha: TRACK_ALPHA });
  g.rect(bx, by, fw, h).fill({ color: FILL_TINT, alpha: 0.95 });
}
