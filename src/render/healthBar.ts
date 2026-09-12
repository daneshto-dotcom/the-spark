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
 * ⭐ S173 — THE CASTLE BAR CARRIED FAULT 1 TOO, AND THIS LINE USED TO SAY SO AND LEAVE IT: *"still
 * carries fault 1 — noted, not touched here."* The owner then found it by playing —
 * *"the Castle HP ... shows a green HP bar, but only once it's attacked"* — which is fault 1 word
 * for word, reported a second time. `drawKeep`'s `if (hpFrac < 1)` gate is gone and the castle now
 * shows a full bar while healthy, like every other pool on the board.
 * ⚠ Recording a defect is not fixing it; the note bought nothing but the ability to say it was known.
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
import { creatureSpriteScaleMul, towerArtForRecipe } from './towerFrames.ts';
import { liftOf } from './creatureLift.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import { getDefenderConfig } from '../state/defenders/defender.ts';
import { structureDefenceFifths, unitPoolFifths } from '../state/stats.ts';
import { componentOf } from '../game/structure.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import type { World } from '../state/world.ts';
import type { CreatureId, DefenderId, PlayerId, PrimitiveId } from '../types.ts';

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
 *
 * ⭐⭐ S174 — **EXPORTED, BECAUSE THE CASTLE HAS TO SIT THE SAME DISTANCE UP.**
 *
 * > *"It should be right above the image — like right above each tower, like when it ends, the
 * > rooftop or whatever. You take the HIGHEST POINT and you put a bar over it. Not a meter above.
 * > Not traversing the middle like the castle."*
 *
 * That last clause is a comparison between two bars drawn by two different files, so the gap cannot
 * be a private number in either of them. `gathererRenderer.castleBarTopY` imports this constant, so
 * a castle bar and a tower bar clear their art by the identical distance by construction rather
 * than by two people having typed the same digit.
 */
export const BAR_LIFT = 10;

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
 * ⭐⭐ S173 (owner) — **BUILDINGS ARE GREEN, CREATURES ARE RED. THAT IS THE READING.**
 *
 * > *"the Castle HP, it shows like a green HP bar, right? ... Let's make sure all the buildings have
 * > an HP bar just like the castle has, a green one, exactly the same. While spawn and creatures
 * > have the red HP bars."*
 *
 * So the colour is not decoration — it is what tells you at a glance whether the thing losing health
 * is a BUILDING of yours or a UNIT. P1 shipped tower bars earlier this session in `FILL_TINT` (red),
 * which was the right bar in the wrong colour.
 *
 * ⚠ *"EXACTLY THE SAME"* IS TAKEN LITERALLY: this is the castle's own ramp, not a flat green.
 * `gathererRenderer.drawKeep` fills with `hpFrac > 0.5 ? 0x6ee07a : hpFrac > 0.25 ? 0xffc14d :
 * 0xff4d4d` — green while healthy, amber past half, red in the last quarter, because the reading a
 * player needs is *"is that one nearly down?"*. A tower that matched only the healthy colour would
 * diverge from the castle the moment either took damage, which is the opposite of what he asked for.
 *
 * ⛔ THE 0.5 BOUNDARY IS SHARED WITH THE ART — `castleStateForHp` flips the castle to its damaged
 * sprite at exactly this number (`CASTLE_DAMAGED_BELOW`), and `towerStateForHp` does the same for
 * towers. Retuning this ramp without those makes the bar and the building disagree.
 */
function buildingTint(frac: number): number {
  return frac > 0.5 ? 0x6ee07a : frac > 0.25 ? 0xffc14d : 0xff4d4d;
}

/**
 * ⭐ Draw a health bar over every creature and every pooled defender.
 *
 * ⚠ IT WALKS THE MAPS ITSELF rather than riding the goblin loop, for the reason `drawBossAuras`
 * gives: that loop is gated on `GOBLIN_KINDS` and on an atlas being READY. Fault 2 above is exactly
 * what riding it costs, and a bar that waited for a sprite sheet to decode would blink on seconds
 * into every fight.
 */
export function drawHealthBars(
  g: Graphics,
  world: World,
  box?: SpriteBoxLookup,
  defenderBox?: (id: DefenderId) => { w: number; h: number } | null,
): void {
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
   *
   * ⛔ S172 (owner): *"Helga doesn't have a health bar. She should have a health bar."* She DID —
   * this loop drew one for her from S171 onward. It was drawn at `FALLBACK_SPRITE_H = 26`, and
   * Helga is far taller than 26 px, so the bar sat INSIDE HER BODY where he could not see it.
   * Exactly the same defect as the bosses, from the same cause: nobody handed this function the
   * MEASURED sprite. `PrincessRenderer` owns her sprite and is wired in from main.ts.
   */
  for (const d of world.defenders.values()) {
    if (d.ehp === null || d.ehp <= 0) continue;
    if (isConcealed(d.pos.x, d.pos.y, d.ownerPlayerId)) continue;
    // ⚠ MAX COMES FROM THE CONFIG, NOT FROM A STORED FIELD — `Defender` has no `maxEhp`, and its
    // live `ehp` is the same pure `unitPoolFifths(unitStats)` the factory seeded it with.
    const stats = getDefenderConfig(d.kind).unitStats;
    if (stats === null) continue; // a TOWER — handled by the structure pass below, not here
    const db = defenderBox?.(d.id) ?? null;
    drawBar(g, d.pos.x, d.pos.y, d.ehp, unitPoolFifths(stats.hp, stats.def), 1,
            db?.w ?? 0, db?.h ?? FALLBACK_SPRITE_H);
  }

  drawStructureBars(g, world);
}

/**
 * ⭐⭐ S173 (owner) — **A HEALTH BAR OVER EVERY TOWER.**
 *
 * > *"all towers should have health bars ... we should know how much health they have and how much
 * > they take before they get destroyed, before their first connector dies."*
 *
 * ## ⛔ A TOWER HAS NO POOL, SO THIS IS NOT A COPY OF HELGA'S FIX
 *
 * The defender loop above skips every tower at `stats === null`, and that skip is CORRECT: owner R75
 * — *"towers have attack and piercing but not def and hp because they are based on the connectors
 * that build them"* — means a tower's `ehp` is `null` by construction. There is no pool field to
 * read. The durability lives in the CONNECTORS, so the bar has to be DERIVED from them.
 *
 * ## THE AGGREGATE, AND WHY BOTH HALVES WERE ALREADY WRITTEN
 *
 *   · MAX — `structureDefenceFifths(n)` = `n × connectorCapacityFifths(n)` = `n × (n + 4)`.
 *     ⭐ This function already existed (`stats.ts`) with **zero production callers**. Its own
 *     docblock says it exists *"because the owner reasons about structures in these terms … so the
 *     HUD and the tests can speak their language"* — it was written FOR this readout and never
 *     wired, the same shape as the S167 `t3TowerAtlasBase` accident.
 *   · CURRENT — `max` minus the accumulated `Bond.damageFifths` over the component's bonds. That
 *     field is the ONLY stored durability state (R76: capacity is derived, damage is state).
 *
 * ⭐ ZERO WIRE COST, verified rather than assumed: `Bond.damageFifths` is already SERIALIZED
 * (`save.ts`, emitted only when non-zero) and already HASHED (`stateHashFull.ts`, the `:dmg`
 * projection). So a peer's bar shows the true number with no new field and no protocol bump.
 *
 * ## ⚠ IT IS THE **STRUCTURE'S** BAR, NOT THE TOWER'S — WHICH IS WHAT THE OWNER'S RULING IMPLIES
 *
 * He chose POOL semantics over WEAKEST-connector: *"total remaining"*, so that a tower's bar is
 * comparable with every other bar on screen. But a POOL belongs to a connected component, not to a
 * building — `connectorCapacityFifths` reads the CURRENT component's connector count, and two towers
 * welded into one lattice genuinely share one pool. So this draws ONE bar per STRUCTURE, at the
 * component's centroid, deduped by the component's lowest primitive id. Drawing per-tower would
 * paint two identical overlapping bars on one shared pool and imply two independent healths.
 *
 * ⚠ **AND THE CAPACITY FALLS AS CONNECTORS DIE**, so the TRACK shortens too — that is owner R76's
 * intended cascade (*"if you manage to damage its connectors then it also scales down in defense"*),
 * not a rendering bug. A bar that only ever shrank its fill would hide the acceleration.
 *
 * ## ⛔ THE HONEST LIMIT OF THIS BAR — A SECOND DAMAGE CHANNEL EXISTS AND IT IS NOT SHOWN
 *
 * A tower can die two ways, and this bar tracks ONE of them:
 *   1. CONNECTORS — `damageConnector` banks `damageFifths` until it reaches capacity, then the
 *      caller dispatches `SEVER_BOND`. **This is what the bar shows**, and it is what the owner named.
 *   2. PRIMITIVES — `damageEntity({kind:'primitive'})` does `prim.hp -= amount` and at zero calls
 *      `razePrimitives`, taking the shape AND its incident bonds out. `Primitive.hp` is a real
 *      required field seeded at `PRIMITIVE_MAX_HP`, and `towerRenderer` already picks its
 *      intact/damaged/destroyed FRAME from it via `towerHpFrac`.
 * So a structure being chewed on its SHAPES rather than its BONDS will lose connectors — and
 * therefore bar — in steps, without the smooth fill drop that connector damage gives. This is
 * recorded here rather than swept because the owner ruled the bar on connectors in his own words,
 * and a future session finding the bar "under-reporting" should find this paragraph first.
 */
function drawStructureBars(g: Graphics, world: World): void {
  /*
   * ⚠ DEDUP BY COMPONENT, and the key must be DETERMINISTIC rather than whichever tower was visited
   * first. `Map` iteration is insertion order, and letting it decide anything is the defect class
   * this codebase spends most of its comments on — so the key is the component's LOWEST primitive
   * id, which is the same value whichever member we entered through.
   */
  const drawn = new Set<PrimitiveId>();

  /**
   * ⛔⛔ S173, SECOND PASS (owner, having PLAYED the first one) — **A BAR INSIDE THE BUILDING IS A
   * BAR HE CANNOT SEE, AND I SHIPPED THAT EXACT DEFECT AGAIN.**
   *
   * > *"You said the towers have health bars, but I don't see them having health bars. Look. The
   * > zombies have. Towers don't."*
   *
   * The first pass drew every structure bar at `FALLBACK_SPRITE_H = 26`, with a comment claiming
   * there was *"no sprite to measure"*. That comment was false and the arithmetic is unforgiving —
   * tower sprites are FOOT-anchored at `sprite.y = cy + sizePx * 0.5`, so the top of the building
   * sits at `cy − sizePx / 2`:
   *
   *   · a tier-3 tower is 84 px ⇒ its top is 42 px above the centroid, and the bar was drawn 36 px
   *     above it — **6 px INSIDE the pyramid**;
   *   · a tier-9 boss tower is 150 px ⇒ top 75 px up, bar 36 px up — **39 px inside it**.
   *
   * ⛔ THIS IS THE S172 HELGA BUG, VERBATIM: *"It was drawn at `FALLBACK_SPRITE_H = 26`, and Helga
   * is far taller than 26 px, so the bar sat INSIDE HER BODY where he could not see it."* The fix
   * there was to feed the measured sprite in. I read that paragraph, wrote the tower arm, and put
   * the same constant in the same place — because a STRUCTURE felt like a different thing from a
   * CREATURE. It is not: anything drawn taller than 26 px hides its own bar.
   *
   * ⭐ AND THE HEIGHT WAS NEVER UNKNOWABLE. `towerArtForRecipe(recipeId).sizePx` is the exact number
   * `towerRenderer` itself sizes the sprite with, from the same table. No measurement plumbing is
   * needed — just asking the function that already knows.
   *
   * ⚠ WIDTH TOO, and for the owner's other standing rule (R171-E, *"at least the length of the
   * creature's width that it represents"*): a 15 px bar over an 84 px pyramid reads as a scratch.
   * The sprite width is passed as the FLOOR, exactly as the creature arm does it.
   */
  /**
   * ⛔⛔ S174 (owner, THIRD report on this one bar) — **HALF THE SPRITE, NOT THE WHOLE SPRITE.**
   *
   * > *"the towers have their health in the middle of them ... it is there, it's just way too up,
   * > and it is like behind the other tower ... You take the HIGHEST POINT and you put a bar over
   * > it. Not a meter above."*
   *
   * `h` here feeds `drawBar`'s RISE parameter, and the anchor this arm passes as `y` is the
   * component CENTROID. `towerRenderer` foot-anchors the building at `sprite.y = cy + sizePx * 0.5`
   * with `TOWER_SPRITE_ANCHOR = {x: 0.5, y: 1}` — so the roof is `sizePx * 0.5` above the centroid,
   * NOT `sizePx`. The S173 pass passed the full `sizePx` and overshot by half a building: 42 px on a
   * tier-3, 75 px on a tier-9. That is his *"way too up ... behind the other tower"*, and the bar he
   * saw crossing a neighbouring tower's body was this one, floating over its own.
   *
   * ⚠ THE PREVIOUS FIX AND THIS ONE ARE THE SAME MISTAKE IN OPPOSITE DIRECTIONS, and the pair is the
   * lesson: S173 corrected "26 px, far too low" by reaching for the sprite's size without checking
   * WHICH POINT the anchor was. A test that only asserts "above the top" passes for both the correct
   * lift and a lift of any size — which is why `healthBar.test.ts` now pins the gap on BOTH sides.
   *
   * ⚠ WIDTH IS STILL THE FULL `sizePx`, and that is not an inconsistency: width is a FLOOR on the
   * bar's length (owner R171-E, *"at least the length of the creature's width"*), and the building
   * really is `sizePx` wide. Only the vertical reading was halved.
   */
  const spriteBoxFor = (recipeId: GodlyId | null): { w: number; h: number } => {
    const art = recipeId === null ? null : towerArtForRecipe(recipeId);
    // `null` is the pentagram, the goblin tower and the lightning hub — they have no building art,
    // so their bar rides above the SHAPES themselves and the small fallback is correct there.
    if (art === null) return { w: 0, h: FALLBACK_SPRITE_H };
    return { w: art.sizePx, h: art.sizePx * 0.5 };
  };

  const bar = (anchorId: PrimitiveId, ownerPlayerId: PlayerId, recipeId: GodlyId | null): void => {
    const anchor = world.primitives.get(anchorId);
    if (anchor === undefined) return; // broken between the re-validation poll and this frame
    if (isConcealed(anchor.pos.x, anchor.pos.y, ownerPlayerId)) return;

    const comp = componentOf(anchor, world.primitives, world.bonds);
    const n = comp.bondIds.size;
    if (n === 0) return; // a lone shape has no connectors, so it has no durability to show

    let key: PrimitiveId | null = null;
    let cx = 0;
    let cy = 0;
    let count = 0;
    for (const id of comp.primitiveIds) {
      if (key === null || (id as number) < (key as number)) key = id;
      const p = world.primitives.get(id);
      if (p === undefined) continue;
      cx += p.pos.x;
      cy += p.pos.y;
      count++;
    }
    if (key === null || count === 0) return;
    if (drawn.has(key)) return;
    drawn.add(key);

    let damage = 0;
    for (const bondId of comp.bondIds) damage += world.bonds.get(bondId)?.damageFifths ?? 0;

    const max = structureDefenceFifths(n);
    const current = Math.max(0, Math.min(max, max - damage));
    if (current <= 0) return; // already collapsing — the sever path owns the next frame

    const sb = spriteBoxFor(recipeId);
    // ⭐ S173 (owner): a BUILDING reads green, on the castle's own ramp. See buildingTint.
    drawBar(g, cx / count, cy / count, current, max, 1, sb.w, sb.h, buildingTint(current / max));
  };

  // The two pooled-less DEFENDER kinds — `turret` and `stinkTower`, both `unitStats: null`.
  for (const d of world.defenders.values()) {
    if (d.ehp !== null) continue; // Helga and anything else with a real pool is drawn above
    bar(d.anchorPrimitiveId, d.ownerPlayerId, null);
  }

  /*
   * …AND THE SPAWNER TOWERS, which are a SEPARATE MAP and not defenders at all. The goblin tower in
   * the owner's screenshot is one of these, as are the pentagram, the lightning hub, the six race
   * tier-3 towers and the six tier-9 boss towers. Missing this map would have shipped bars on two
   * tower kinds and called the job done.
   */
  for (const sp of world.creatureSpawners.values()) {
    bar(sp.anchorPrimitiveId, sp.ownerPlayerId, sp.recipeId);
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
  /**
   * ⛔⛔ S174 (owner) — **HOW FAR THE ART'S TOP EDGE IS ABOVE `y`. IT IS NOT "SPRITE HEIGHT".**
   *
   * It used to be called `spriteH`, and that name is exactly how the tower bar shipped at double the
   * lift it needed. A CREATURE is foot-anchored at `y`, so for a creature the rise IS the whole
   * sprite height and the two readings coincide. A STRUCTURE is anchored at its CENTROID and
   * `towerRenderer` foot-anchors the building at `cy + sizePx * 0.5` — so the roof is only
   * `sizePx * 0.5` above the anchor, and passing the full `sizePx` put the bar half a building too
   * high (42 px on a tier-3, 75 px on a tier-9). The owner: *"it is there, it's just way too up, and
   * it is like behind the other tower."*
   *
   * ⚠ THE NAME WAS THE WHOLE BUG. Both call sites were "the sprite's height", both were literally
   * true, and only one of them answered the question the arithmetic asks. Callers now pass a RISE
   * ABOVE THE ANCHOR and the anchor convention is theirs to state.
   */
  spriteRise: number,
  /** ⭐ S173 — the FILL colour. Creatures keep the red; BUILDINGS pass the castle ramp (owner). */
  fillTint: number = FILL_TINT,
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
  // Clear the art's own top edge, then a small constant gap. `spriteRise` is how far that edge is
  // above `y` — a full sprite height for a foot-anchored creature, HALF a building for a
  // centroid-anchored structure. See the parameter's docblock.
  const by = y - spriteRise - BAR_LIFT * scale;

  g.rect(bx, by, w, h).fill({ color: TRACK_TINT, alpha: TRACK_ALPHA });
  g.rect(bx, by, fw, h).fill({ color: fillTint, alpha: 0.95 });
}
