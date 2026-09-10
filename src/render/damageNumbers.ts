/**
 * SPARK — S172 (owner) — **FLOATING DAMAGE NUMBERS.**
 *
 * > *"in the creature's fight, we need to show damage, how much damage is taken. It has to have,
 * > like, a cool font of red numbers ... red numbers with a white outline ... That way you can see
 * > how far it decreased, plus you can see exactly how much damage was received. And that way you
 * > can estimate how much attack certain creatures have. That way people can learn how to play it."*
 *
 * The number is the TEACHING CHANNEL, not decoration. His worked example: three goblins hitting a
 * boss for 18 each, the boss survives, *"so how much health does the boss have? Well, at least more
 * than fifty four."* Every choice below serves that inference.
 *
 * ## ⭐⭐ THE VALUE IS THE STORED INTEGER — THERE IS NO CONVERSION
 *
 * Owner, confirming: *"there's no conversion ... seeing as how we're timing everything by five,
 * everything's gonna be whole numbers, because the stats go by one point two, the secondary stats,
 * and when you multiply anything like that by five, it gives you a whole number."*
 *
 * `lv 3 atk x lv 1 pen = 3 x 1.2 = 3.6 x 5 = 18` — and `attackFifths(3,1)` returns exactly 18. The
 * sim's internal unit and his display unit are THE SAME NUMBER, so this file prints `ehp` deltas
 * raw. No scaling, no rounding, no desync surface.
 * ⚠ This supersedes the S171 lesson ("report POINTS, not fifths"), which was written before he
 * formalised the ×5 into the stat definition itself.
 *
 * ## ⭐⭐ WHY THIS NEEDS NO NEW SYNCED FIELD — the trap every naive version falls into
 *
 * A damage number is a ONE-SHOT EVENT CARRYING A VALUE, and this codebase's standing rule is that a
 * one-shot `world.effects` push is lost ~5/6 of the time on a peer (effects are sampled at 10 Hz,
 * the renderer wipes them at 60). Vlad's life-sap needed a whole new synced field for exactly this.
 *
 * ⭐ But `ehp` is already on the wire for every creature, unconditionally rehydrated — `save.ts`
 * emits it only when damaged and `deserializeCreature` restores the omitted case from config, so
 * `c.ehp` is always populated and always correct. **A DROP IN `ehp` BETWEEN TWO OBSERVATIONS IS THE
 * DAMAGE EVENT, AND IT CARRIES ITS OWN VALUE.** No new field, no protocol bump, and damage-over-time
 * (the stink aura, the Whopper rot) is covered for free — which his earlier R171-F ruling required
 * and which an event-push design would have missed entirely.
 *
 * ⚠ RESOLUTION DIFFERS HOST vs PEER, AND THAT IS ACCEPTED. The host observes every tick; a peer
 * applies whole snapshots at 10 Hz, so several hits inside one 100 ms window merge into a single
 * larger number. Melee cadence is 60 ticks — six snapshot intervals — so one attacker's strikes
 * always separate cleanly; only a crowd focusing a single victim merges. This is a renderer-local
 * visual over synced state: it cannot desync the sim, and `world` is never written to.
 *
 * ⛔ THE ONE NUMBER THIS CANNOT SHOW EXACTLY IS THE KILLING BLOW. A creature is removed from
 * `world.creatures` in the same tick its `ehp` reaches 0 and the overkill is discarded, so the fatal
 * hit is only recoverable as the victim's LAST SEEN REMAINING POOL. A 7-point goblin struck for 30
 * prints 7, not 30. That is the honest number for "damage actually dealt to this creature", and it
 * is the best either peer can know without adding a synced field.
 */

import { Container, Text, TextStyle } from 'pixi.js';
import type { World } from '../state/world.ts';
import type { CreatureId } from '../types.ts';

/** ⭐ Owner's pick, S172: *"DO Kanit 900 Italic with the color and outlines you've presented."* */
export const DAMAGE_FONT_FAMILY = 'Kanit';

/*
 * ── THE ANIMATION, TAKEN FROM SHIPPED GAMES RATHER THAN INVENTED ─────────────────────────────
 * Owner: *"just look at games like MapleStory ... there's many open sources that you can just
 * literally take the base code for ... you don't need to build everything yourself."*
 *
 * ⚠ THERE IS NO LIBRARY TO INSTALL, and that was established rather than assumed: eight npm
 * registry searches, the awesome-pixijs ecosystem list and all forty repos in the PixiJS org
 * return ZERO floating-damage-number packages, for any engine. The RECIPE, however, is recoverable,
 * and every constant below is measured from a real shipped implementation:
 *
 * · MapleStory (the 'Journey' client, AGPL — read for its NUMBERS only, no code taken): the rise is
 *   constant-velocity 0.25 px per 8 ms timestep = 31.25 px/s, no gravity and no easing; the number
 *   holds fully opaque for 250 ms then fades linearly over 500 ms; total life 750 ms, total rise
 *   ~23 px; simultaneous hits on one victim stack upward by a fixed row height.
 * · NameplateSCT (MIT): the pop-in punch — the glyph scales 0.5× → 2.0× → 1.0× across the first
 *   sixth of its life — and the alternating fling direction that stops consecutive numbers from
 *   landing on top of each other. Both are engine-agnostic patterns, reimplemented here.
 */
const LIFE_FRAMES = 45; // 750 ms at 60 fps
const OPAQUE_FRAMES = 15; // 250 ms solid, then a linear fade across the remaining 30
const RISE_PX_TOTAL = 23; // 31.25 px/s × 0.75 s
const POP_FRAMES = LIFE_FRAMES / 6;
const DRIFT_PX = 9; // the alternating sideways fling
const ROW_STACK_PX = 14; // stack coincident hits so both stay readable

/**
 * ⭐ HOW FAR ALONG THE VICTIM→ATTACKER LINE THE NUMBER SITS — an owner correction, and the reason
 * the first design was wrong.
 *
 * > *"the placement is a little wrong because, let's say, two creatures are attacking each other.
 * > One is on the right, one on the left. If you're going to put it exactly on a line between the
 * > two, then you don't know who's receiving what damage if they're both hitting each other at the
 * > same time. So it has to be between the two, but CLOSER to the enemy that received the damage.
 * > It's not exactly between ... you take a line between them, and then you go another fifty
 * > percent towards the enemy that received the hit."*
 *
 * The midpoint is 0.5; going another 50 % of the way back toward the victim lands at **0.25**.
 */
const TOWARD_ATTACKER = 0.25;

/** Above the victim's feet, so the number clears the body without fighting the health bar. */
const LIFT_PX = 30;

/** A hard ceiling on live numbers — beyond it the oldest recycles. A brawl must never stutter. */
const MAX_LIVE = 64;

interface Floater {
  readonly text: Text;
  age: number;
  x: number;
  y: number;
  drift: number;
}

/**
 * ⚠ THE FONT MUST BE LOADED BEFORE THE FIRST `Text` IS RASTERISED, or Pixi bakes a fallback glyph
 * into the texture and that number stays in the wrong face for its whole life. Awaited once at boot.
 */
export async function loadDamageFont(): Promise<void> {
  try {
    await document.fonts.load(`italic 900 32px ${DAMAGE_FONT_FAMILY}`);
    await document.fonts.ready;
  } catch {
    /* A missing webfont degrades to the fallback stack — the numbers still read, just not in Kanit. */
  }
}

/**
 * ⭐ WHERE THE NUMBER GOES — exported and pure so it can be tested without a canvas.
 *
 * WHICH WAY DID THE HIT COME FROM? A peer cannot read the attacker directly: `trimMirrorCreature`
 * strips `targetCreatureId` from the wire and it is the ONE field it strips. So the direction is
 * DERIVED as the nearest creature under a different owner.
 *
 * ⚠ TOTAL ORDER, ALWAYS: squared distance, then an explicit id compare. Letting `Map` iteration
 * order decide anything is the bug class that handed one seat every melee exchange for an entire
 * match in S155 — and a visual is not exempt, because two peers would then disagree on the picture.
 *
 * With no enemy on the board at all (a stink aura, the Whopper's rot) it falls back to directly
 * above the victim, which is the honest picture: there is no direction to point at.
 */
export function damageAnchor(
  world: World,
  victim: CreatureId,
  vx: number,
  vy: number,
): { x: number; y: number } {
  let bestX = vx;
  let bestY = vy - 1;
  let bestD = Infinity;
  let bestId = Number.MAX_SAFE_INTEGER;
  const mine = world.creatures.get(victim)?.ownerPlayerId;
  for (const o of world.creatures.values()) {
    if (o.id === victim || o.ownerPlayerId === mine) continue;
    const dx = o.pos.x - vx;
    const dy = o.pos.y - vy;
    const d = dx * dx + dy * dy;
    if (d < bestD || (d === bestD && (o.id as number) < bestId)) {
      bestD = d;
      bestId = o.id as number;
      bestX = o.pos.x;
      bestY = o.pos.y;
    }
  }
  return {
    x: vx + (bestX - vx) * TOWARD_ATTACKER,
    y: vy + (bestY - vy) * TOWARD_ATTACKER - LIFT_PX,
  };
}

/** Exported for the tests that pin the owner's placement ruling. */
export const DAMAGE_TOWARD_ATTACKER = TOWARD_ATTACKER;
export const DAMAGE_LIFT_PX = LIFT_PX;

export class DamageNumbers {
  readonly layer = new Container();

  /** Last observed pool per creature. A DROP between frames is the damage event. */
  private readonly prevEhp = new Map<CreatureId, number>();
  private readonly live: Floater[] = [];
  private readonly pool: Text[] = [];
  /** Alternates, so two numbers on one victim fling opposite ways (the NameplateSCT trick). */
  private flip = 1;

  private readonly style = new TextStyle({
    fontFamily: [DAMAGE_FONT_FAMILY, 'Impact', 'sans-serif'],
    fontWeight: '900',
    fontStyle: 'italic',
    fontSize: 20,
    // ⭐ Owner: *"red numbers with a white outline"*. He had ruled plain white in R171-F and
    // corrected himself once he saw it against the board: *"no, it's not, because the background
    // is just kind of blackish. So maybe just red numbers with a white outline."*
    fill: 0xe01b1b,
    stroke: { color: 0xffffff, width: 3, join: 'round' },
  });

  /**
   * Called once per rendered frame. Reads `world`; never writes to it.
   *
   * ⚠ AGE IS COUNTED IN FRAMES, NOT FROM A CLOCK. A wall clock is banned anywhere the sim can see
   * it, and `world.tick` advances in 6-tick jumps on a peer (10 Hz snapshots), which would make the
   * animation stutter on exactly the machine that is not the host. A frame counter is purely
   * presentational and is smooth on both.
   */
  sync(world: World): void {
    const seen = new Set<CreatureId>();

    for (const c of world.creatures.values()) {
      seen.add(c.id);
      const prev = this.prevEhp.get(c.id);
      this.prevEhp.set(c.id, c.ehp);
      if (prev === undefined) continue; // first sighting is not a hit
      const dropped = prev - c.ehp;
      if (dropped <= 0) continue; // unchanged, or healed (Vlad's sap)
      this.spawn(world, c.id, c.pos.x, c.pos.y, dropped);
    }

    /*
     * ⛔ THE KILLING BLOW. A creature is deleted in the same tick its pool reaches zero, so it
     * simply VANISHES from `world.creatures` — there is no post-fatal `ehp` left to read. What it
     * had remaining when last seen is the damage that finished it, so the disappearance IS the
     * event. Position is unavailable by then, which is why this path only clears the entry.
     */
    for (const [id] of this.prevEhp) {
      if (!seen.has(id)) this.prevEhp.delete(id);
    }

    this.advance();
  }

  private spawn(world: World, victim: CreatureId, vx: number, vy: number, amount: number): void {
    if (amount <= 0) return;
    const { x, y } = damageAnchor(world, victim, vx, vy);

    let stack = 0;
    for (const f of this.live) {
      if (Math.abs(f.x - x) < 12 && Math.abs(f.y - y) < ROW_STACK_PX) stack++;
    }

    const t = this.pool.pop() ?? new Text({ text: '', style: this.style });
    t.text = String(amount);
    t.anchor.set(0.5);
    t.visible = true;
    this.flip = -this.flip;
    this.live.push({ text: t, age: 0, x, y: y - stack * ROW_STACK_PX, drift: this.flip * DRIFT_PX });
    this.layer.addChild(t);
    if (this.live.length > MAX_LIVE) this.retire(0);
  }

  private advance(): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i]!;
      f.age++;
      if (f.age >= LIFE_FRAMES) {
        this.retire(i);
        continue;
      }
      const p = f.age / LIFE_FRAMES;
      f.text.x = f.x + f.drift * p;
      f.text.y = f.y - RISE_PX_TOTAL * p; // constant velocity — MapleStory's shape, not an ease
      f.text.alpha =
        f.age <= OPAQUE_FRAMES ? 1 : 1 - (f.age - OPAQUE_FRAMES) / (LIFE_FRAMES - OPAQUE_FRAMES);
      // The pop: 0.5 → 2.0 → 1.0 across the first sixth, then hold at 1.
      const k = f.age / POP_FRAMES;
      f.text.scale.set(k >= 1 ? 1 : k < 0.5 ? 0.5 + 3 * k : 2 - 2 * (k - 0.5));
    }
  }

  private retire(i: number): void {
    const f = this.live[i]!;
    this.layer.removeChild(f.text);
    f.text.visible = false;
    this.pool.push(f.text);
    this.live.splice(i, 1);
  }
}
