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

/** How far above the sprite's own top the bar floats. Scaled per type, like everything else here. */
const BAR_LIFT = 26;

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
export function drawHealthBars(g: Graphics, world: World): void {
  for (const c of world.creatures.values()) {
    if (c.ehp <= 0) continue;
    if (isConcealed(c.pos.x, c.pos.y, c.ownerPlayerId)) continue;
    const cfg = getCreatureConfig(c.type);
    const max = unitPoolFifths(cfg.hp, cfg.def);
    if (max <= 0) continue;
    const scale = creatureSpriteScaleMul(c.type);
    drawBar(g, c.pos.x, c.pos.y - liftOf(c.type), c.ehp, max, scale);
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
    drawBar(g, d.pos.x, d.pos.y, d.ehp, unitPoolFifths(stats.hp, stats.def), 1);
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
  const w = span(max);
  // ⚠ CLAMPED TO THE TRACK. `span()` has a floor, so a nearly-dead unit would otherwise draw a fill
  // slightly LONGER than its own track once `ehp` falls under the floor's threshold.
  const fw = Math.min(w, span(ehp));
  const h = BAR_H * scale;
  const bx = x - w / 2;
  const by = y - BAR_LIFT * scale;

  g.rect(bx, by, w, h).fill({ color: TRACK_TINT, alpha: TRACK_ALPHA });
  g.rect(bx, by, fw, h).fill({ color: FILL_TINT, alpha: 0.95 });
}
