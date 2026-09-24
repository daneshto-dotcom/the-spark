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
 * ## ⭐ THE KILLING BLOW IS SHOWN — owner, S172: *"it should show every hit ... whether it's the
 * last hit or the first hit, it doesn't matter. Always damage should be visible."*
 *
 * It is NOT a delta, because a creature is removed from `world.creatures` in the same tick its
 * `ehp` reaches 0. It is a DISAPPEARANCE, and the watcher carries the last-seen position and
 * owner forward so the number can still be placed and still be aimed.
 *
 * ⚠ THE VALUE IS THE REMAINING POOL, NOT THE SWING. Overkill is discarded at the damage site and
 * never serialized, so a 7-point goblin struck for 30 prints 7. That is the honest count of damage
 * actually dealt TO THAT CREATURE, it is the most either peer can know without a new synced field,
 * and it makes the arithmetic he wants players to learn come out exact: the numbers over a
 * creature's whole life sum to precisely its pool.
 */

import { Container, Text, TextStyle } from 'pixi.js';
import type { World } from '../state/world.ts';
import type { CreatureId, PlayerId } from '../types.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
// S181 — everything `fatalBlowFifths` needs, and every one of them is DERIVABLE ON BOTH PEERS from
// state already held: per-type attack config, the shared fifths ladder, and the keep's pure
// (seat, tick) firing schedule. No new wire field, no protocol bump.
import { CASTLE_ATTACK_RANGE } from '../constants.ts';
import { castleFiresOnTick } from '../state/castleGuns.ts';
import { castleShotFifthsFor } from '../state/castleUpgrades.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import { getDefenderConfig } from '../state/defenders/defender.ts';
import { attackFifths } from '../state/stats.ts';

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

/**
 * A non-creature damage pool being watched.
 *
 * ⚠ `rising` INVERTS THE TEST, and forgetting it would print a number every time a connector
 * HEALED. A connector does not carry remaining health — it carries ACCUMULATED damage
 * (`Bond.damageFifths` counts UP, and the component's SUM is tested against `structurePoolFifths`
 * — S178: this said `connectorCapacityFifths`, retired by R173-B), where every other pool here
 * counts DOWN. One flag, checked once, instead of a second near-identical loop.
 */
interface StructWatched {
  v: number;
  x: number;
  y: number;
  owner: PlayerId;
  rising: boolean;
  /** Emit the remainder when it vanishes? False for a pool whose disappearance is not a death. */
  deathOnVanish: boolean;
}

/**
 * PURE — what one frame's change in a damage pool should PRINT, if anything.
 *
 * ⭐ EXTRACTED SO THE RULE IS TESTABLE. The watcher that uses it lives inside a Pixi class and
 * cannot be instantiated in vitest (`damageNumbers.test.ts` covers only pure helpers, and that is
 * why). The interesting part was never the Text objects — it is the arithmetic, and especially the
 * INVERSION that connectors need.
 *
 * `rising` = the pool counts UP toward a cap (`Bond.damageFifths`) instead of DOWN toward zero.
 * ⚠ A rising pool can never report a HEAL: `damageFifths` going down means the connector was
 * repaired or replaced, and printing green over a rebuilt connector would read as the enemy healing
 * the thing they are chewing.
 */
/**
 * ⭐⭐⭐ S181 (owner) — **THE FLOATER MUST BE THE SWING, NOT WHAT WAS LEFT TO TAKE.**
 *
 * > *"it says that it hits 40 per shot, but it only does 6 damage … oh yeah, it is, because now I
 * > saw it hit the zombie hound for 10, because that's his total HP, so it only shows the maximum.
 * > We need to show the ACTUAL damage being taken. And if it's over his total health amount, that's
 * > fine. He just dies. It shouldn't be capped at his health."*
 *
 * And again, on creatures, so it is not only a castle problem: *"my soul eaters are fighting the
 * zombie. Soul eater supposed to do fourteen a swing … but they're only doing like six. It's the
 * same issue … it's capped when buildings are targeted and the same when creatures are targeted."*
 *
 * ## WHY THE OLD NUMBER WAS WRONG, AND WHY IT WAS DELIBERATE
 *
 * A creature is deleted from `world.creatures` on the same tick its pool hits zero, so the fatal hit
 * is never observable as a delta. S172 printed **what it had left when last seen**, and wrote down
 * the trade: *"overkill is discarded at the damage site and never serialized … it also makes the
 * arithmetic come out exact: the numbers over a creature's whole life sum to precisely its pool."*
 * That summing property is what the owner has now overruled. He wants the SWING.
 *
 * ## ⛔ WHY THE KILLER IS DERIVED FROM REACH RATHER THAN READ FROM A FIELD
 *
 * `targetCreatureId` would answer this outright — and `trimMirrorCreature` STRIPS IT FROM THE WIRE.
 * It is the ONE field it strips (this file's own note at the `damageAnchor` docblock says so), so a
 * joiner cannot know which creature struck. Sending the amount instead is worse: a one-shot push
 * rides `world.effects`, which is sampled at 10 Hz and wiped by the renderer at 60, so it is lost
 * ~5/6 of the time. Everything below is re-derived every frame from state BOTH peers already hold —
 * positions, owners, types — which is this codebase's standing rule for per-strike visuals.
 *
 * ## THE RULE
 *
 * Enumerate everything hostile to the victim that could have reached its last position: enemy
 * creatures inside their own `attackRange`, enemy unit-class defenders inside theirs, and an enemy
 * keep that FIRED THIS TICK with the victim inside `CASTLE_ATTACK_RANGE` (`castleFiresOnTick` is a
 * pure function of `(seat, tick)` and exists precisely so a renderer can re-derive the shot without
 * a wire field). The biggest swing among them is the blow that finished it.
 *
 * ⚠ **THE LARGEST, NOT THE NEAREST, AND NOT A SUM.** A creature dies to ONE blow; showing a sum
 * would invent damage. Taking the largest is right in the case that matters — the number he is
 * checking against the card is the big one — and where several things could have landed it, the
 * largest is also the only choice that can never print LESS than the pool that was actually
 * consumed, which is the specific lie he reported.
 *
 * ⚠ RENDER-ONLY, SO A MIS-ATTRIBUTION COSTS A WRONG NUMBER AND NEVER A DESYNC. Ties are broken by
 * magnitude alone, so both peers compute the same figure from the same snapshot.
 *
 * Returns `null` when nothing hostile was in reach — an aura tick, a blast, a scrap — and the caller
 * then falls back to the remaining pool, which is still better than printing nothing.
 */
/**
 * How close a recorded kill-hit must be to a vanished creature's last seen position to be ITS hit.
 *
 * ⚠ NOT ZERO, because the two are sampled at different instants: the record is written at the tick
 * the blow landed, while `last` is the position from the previous snapshot the renderer saw. A
 * creature moves a few px per tick, so an exact match would reject the correct record.
 */
const KILL_HIT_MATCH_PX = 40;

/**
 * ⭐⭐ S181 — PURE-ish — CONSUME the recorded fatal swing for the creature that died near `(x, y)`.
 *
 * ⛔ IT REMOVES THE ENTRY IT USES, and that matters when two creatures die on the same tick in the
 * same melee: without consuming, both floaters would read the larger of the two swings. Each record
 * is spent once, nearest-first.
 *
 * ⚠ THE ARRAY IS WIPED BY ITS CONSUMER, the `effects` contract this codebase uses for every
 * per-frame presentational channel (`razedNotKilled`, `connectorBreakHits`). Anything left unclaimed
 * at the end of the sweep is dropped by the caller.
 */
function takeKillHitNear(world: World, x: number, y: number, owner: PlayerId): number | null {
  let bestIdx = -1;
  let bestD2 = KILL_HIT_MATCH_PX * KILL_HIT_MATCH_PX;
  for (let i = 0; i < world.creatureKillHits.length; i++) {
    const h = world.creatureKillHits[i];
    if (h === undefined || h.owner !== owner) continue;
    const dx = h.pos.x - x;
    const dy = h.pos.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > bestD2) continue;
    bestD2 = d2;
    bestIdx = i;
  }
  if (bestIdx < 0) return null;
  const hit = world.creatureKillHits[bestIdx];
  world.creatureKillHits.splice(bestIdx, 1);
  return hit?.amount ?? null;
}

export function fatalBlowFifths(
  world: World,
  at: { x: number; y: number },
  victimOwner: PlayerId,
): number | null {
  let best = 0;

  for (const a of world.creatures.values()) {
    if (a.ownerPlayerId === victimOwner) continue;
    const cfg = getCreatureConfig(a.type);
    const r = cfg.attackRange + FATAL_REACH_SLACK;
    const dx = a.pos.x - at.x;
    const dy = a.pos.y - at.y;
    if (dx * dx + dy * dy > r * r) continue;
    best = Math.max(best, attackFifths(cfg.atk, cfg.pen));
  }

  for (const d of world.defenders.values()) {
    if (d.ownerPlayerId === victimOwner) continue;
    const cfg = getDefenderConfig(d.kind);
    const r = cfg.attackRange + FATAL_REACH_SLACK;
    const dx = d.pos.x - at.x;
    const dy = d.pos.y - at.y;
    if (dx * dx + dy * dy > r * r) continue;
    best = Math.max(best, attackFifths(cfg.atk, cfg.pen));
  }

  /*
   * ⭐ THE KEEP, AND IT IS THE CASE HE REPORTED FIRST. Gated on `castleFiresOnTick` so a keep only
   * claims a kill on a tick it actually shot — without that gate every death anywhere near a keep
   * would print 40.
   */
  for (const [seat, p] of world.players) {
    if (seat === victimOwner) continue;
    if (p.castleHp <= 0) continue;
    const seatN = seat as unknown as number;
    if (!castleFiresOnTick(seatN, world.tick)) continue;
    const c = castleAnchor(seatN, world.layout);
    const dx = c.x - at.x;
    const dy = c.y - at.y;
    const r = CASTLE_ATTACK_RANGE + FATAL_REACH_SLACK;
    if (dx * dx + dy * dy > r * r) continue;
    // ⭐ S188 P3 — THIS keep's shot, with its bought ATK / PEN: the number `castleGunsTick` deals
    // (it reads `castleShotFifthsFor` too). The base `castleShotFifths()` printed 40 for a 48 kill.
    best = Math.max(best, castleShotFifthsFor(p.castleUpgrades));
  }

  return best > 0 ? best : null;
}

/**
 * How much further than its stated reach an attacker may be and still be credited.
 *
 * ⚠ IT EXISTS BECAUSE THE VICTIM HAS ALREADY MOVED. The position used here is where the victim was
 * last SEEN, one snapshot before it vanished, while the attacker has kept walking — so an exact
 * reach compare would miss the true killer on the frame that matters. A goblin's reach is 35 px;
 * this is deliberately small next to that, enough to cover one snapshot of drift without letting a
 * distant unit claim a kill.
 */
const FATAL_REACH_SLACK = 24;

export function poolDelta(
  prev: number, cur: number, rising: boolean,
): { amount: number; kind: FloaterKind } | null {
  const delta = rising ? cur - prev : prev - cur;
  if (delta > 0) return { amount: Math.round(delta), kind: 'damage' };
  if (delta < 0 && !rising) return { amount: Math.round(-delta), kind: 'heal' };
  return null;
}

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
 * ⚠ THE OWNER IS PASSED IN, NOT LOOKED UP, and that is not a style choice. The killing blow is
 * rendered AFTER the victim has already left `world.creatures`, so a lookup returns `undefined` —
 * and then every creature on the board counts as "another owner", including the victim's own
 * allies, and the number would point at a friend. The caller remembers who it belonged to.
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
  /** `null` for a STRUCTURE: there is no self-creature to exclude from the enemy scan. */
  victim: CreatureId | null,
  vx: number,
  vy: number,
  owner?: PlayerId,
): { x: number; y: number } {
  let bestX = vx;
  let bestY = vy - 1;
  let bestD = Infinity;
  let bestId = Number.MAX_SAFE_INTEGER;
  const mine = owner ?? (victim === null ? undefined : world.creatures.get(victim)?.ownerPlayerId);
  /*
   * ⚠ WRITTEN IN THE PLAIN `ownerPlayerId ===` FORM ON PURPOSE. The S171 acquisition census
   * finds enemy-shaped scans with a regex on `ownerPlayerId` followed by an equality operator,
   * so a CAST written between the field and the operator makes a real scan INVISIBLE to the
   * guard. This file did exactly that for one commit in S172 and dropped out of the census
   * while still scanning enemies every frame. Keep the branded type and no cast.
   */
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

/** Damage is red, healing is green. Both carry the white outline. */
export type FloaterKind = 'damage' | 'heal';

/** What the renderer remembers about a creature between frames. */
interface Watched {
  ehp: number;
  x: number;
  y: number;
  owner: PlayerId;
}

export class DamageNumbers {
  readonly layer = new Container();

  /**
   * Last observation per creature. A DROP in `ehp` is damage, a RISE is healing, and a creature
   * that VANISHES was killed — its last remembered pool is the damage that finished it.
   *
   * ⚠ Position and owner are remembered too, and both are load-bearing for the killing blow: by
   * the time a death is observable the creature is gone from `world.creatures`, so neither can be
   * looked up any more. An earlier version of this file dropped the fatal number entirely for
   * exactly that reason.
   */
  private readonly watched = new Map<CreatureId, Watched>();
  /**
   * ⭐⭐ S175 P9 (owner) — **EVERYTHING ELSE THAT TAKES DAMAGE, WATCHED THE SAME WAY.**
   *
   * Owner: *"when characters attack a tower, you don't see damage on the tower. You only see the
   * damage that the tower does to them … I wanna see damage on a castle. I wanna see damage on
   * connectors. I wanna see damage on all other towers that spawn or that protect or even on the
   * poop bags that are dropped. You gotta see damage everywhere, not just on characters."*
   *
   * ⭐ IT COSTS NOTHING ON THE WIRE, and that is why it is a watch rather than an event. Every pool
   * this reads is ALREADY a required or already-emitted serialized field — `Primitive.hp`,
   * `Bond.damageFifths`, `Player.castleHp`, `Defender.ehp`, `StinkCloud.ehp`. Diffing them frame to
   * frame gives every peer the identical numbers with no new state and **no PROTOCOL_VERSION bump**.
   * The alternative, pushing a hit event, is the thing this file's own header rules out: a one-shot
   * `world.effects` push is lost ~5/6 of the time because effects are sampled at 10 Hz.
   *
   * Keyed `"<kind>:<id>"` in ONE map rather than five, so the vanish-is-death sweep below stays a
   * single pass and cannot be implemented four-fifths of the way — the failure mode this codebase
   * calls the four-sites warning.
   */
  private readonly watchedStruct = new Map<string, StructWatched>();
  /**
   * ⭐ S182 — the last mass-clear epoch this renderer has seen. See `World.structureWatchEpoch`.
   * Starts at 0, matching a fresh World, so a normal boot clears nothing.
   */
  private watchEpoch = 0;
  private readonly live: Floater[] = [];
  private readonly pool: Text[] = [];
  /** Alternates, so two numbers on one victim fling opposite ways (the NameplateSCT trick). */
  private flip = 1;

  private readonly damageStyle = new TextStyle({
    fontFamily: [DAMAGE_FONT_FAMILY, 'Impact', 'sans-serif'],
    fontWeight: '900',
    fontStyle: 'italic',
    fontSize: 20,
    // ⭐ Owner on the shipped look: *"It looks sick. We made it really look good. I like that."*
    // Left exactly as it shipped.
    fill: 0xe01b1b,
    stroke: { color: 0xffffff, width: 3, join: 'round' },
  });

  /**
   * ⭐ HEALING, S172 (owner): *"when a creature gets healed — so for example Vlad does his life sap,
   * or in the future we will have other healing effects — then the same number of how much he was
   * healed for, near the creature that was healed, but in GREEN with white outline."*
   *
   * Same face, same size, same outline, same motion: only the hue carries the meaning, so the two
   * read as one system rather than two features. Identical geometry also means a heal landing in
   * the same frame as a hit stacks against it correctly instead of overlapping it.
   */
  private readonly healStyle = new TextStyle({
    fontFamily: [DAMAGE_FONT_FAMILY, 'Impact', 'sans-serif'],
    fontWeight: '900',
    fontStyle: 'italic',
    fontSize: 20,
    fill: 0x2fbf3f,
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
      const prev = this.watched.get(c.id);
      const owner = c.ownerPlayerId;
      this.watched.set(c.id, { ehp: c.ehp, x: c.pos.x, y: c.pos.y, owner });
      if (prev === undefined) continue; // first sighting is neither a hit nor a heal
      const delta = prev.ehp - c.ehp;
      if (delta > 0) this.emit(world, c.id, c.pos.x, c.pos.y, delta, 'damage', owner);
      else if (delta < 0) this.emit(world, c.id, c.pos.x, c.pos.y, -delta, 'heal', owner);
    }

    /*
     * ⭐⭐ THE KILLING BLOW — owner, S172: *"damage is [not] shown on the last hit when a creature
     * dies, but it should show. It should show every hit ... whether it's the last hit or the first
     * hit, it doesn't matter. Always damage should be visible."*
     *
     * A creature is deleted from `world.creatures` in the same tick its pool reaches zero, so the
     * fatal hit is never observable as a delta — the creature simply VANISHES. The disappearance
     * IS the event, and what it had left when last seen is the damage that finished it.
     *
     * ⛔⛔ S181 — **THIS USED TO PRINT THE REMAINING POOL AND THE OWNER OVERRULED IT.** The note that
     * stood here argued: *"overkill is discarded at the damage site and never serialized, so a
     * 7-point goblin hit for 30 prints 7 … it also makes the arithmetic come out exact: the numbers
     * over a creature's whole life sum to precisely its pool."* That summing property was the
     * reason, and it is no longer wanted:
     *
     * > *"it says that it hits 40 per shot, but it only does 6 damage … I saw it hit the zombie
     * > hound for 10 because that's his total HP, so it only shows the maximum. We need to show the
     * > ACTUAL damage being taken. And if it's over his total health amount, that's fine. He just
     * > dies. It shouldn't be capped at his health."*
     *
     * `fatalBlowFifths` now derives the real swing from reach (see its docblock for why reach and
     * not `targetCreatureId`, which is stripped from the wire). The remainder survives ONLY as the
     * fallback when nothing hostile was in reach.
     */
    for (const [id, last] of this.watched) {
      if (seen.has(id)) continue;
      this.watched.delete(id);
      if (last.ehp <= 0) continue;
      /*
       * ⭐⭐⭐ S181 (owner) — **PRINT THE SWING, AND ONLY FALL BACK TO THE REMAINDER.** His report in
       * one line: *"it says it hits 40 per shot but it only does 6 damage … we need to show the
       * actual damage being taken, and if it's over his total health amount, that's fine, he just
       * dies."* `fatalBlowFifths` derives the real blow from reach; `last.ehp` is kept as the
       * fallback for a death nothing hostile was standing next to — an aura tick, a blast, a scrap —
       * because printing the remainder still beats printing nothing, which is what S172 fixed.
       */
      /*
       * ⭐⭐⭐ S181 — THREE SOURCES, BEST FIRST, AND THE ORDER IS THE WHOLE DESIGN.
       *
       *  1. `world.creatureKillHits` — the EXACT swing, recorded by `damageCreature` at the moment
       *     the pool emptied. Authoritative wherever the sim runs in-process (solo, vs-bots, host).
       *  2. `fatalBlowFifths` — derived from reach when no record arrived. That is the JOINER case:
       *     `creatureKillHits` is per-frame and host-local, so a peer applying snapshots has no
       *     record to read, and `targetCreatureId` (which would name the killer outright) is the one
       *     field `trimMirrorCreature` strips from the wire.
       *  3. `last.ehp` — the remainder, S172's number, kept for a death nothing hostile was standing
       *     next to at all: an aura tick, a blast, a scrap. Printing the remainder still beats
       *     printing nothing, which is the defect S172 existed to fix.
       *
       * ⚠ MATCHED BY POSITION, NOT BY ID. The record cannot carry a `CreatureId` usefully: the
       * creature is deleted in the same tick, so the id is meaningless to a consumer that only
       * learns of the death by the entry VANISHING from the map. Position is what both halves share.
       */
      const recorded = takeKillHitNear(world, last.x, last.y, last.owner);
      const swing = recorded ?? fatalBlowFifths(world, { x: last.x, y: last.y }, last.owner);
      this.emit(world, id, last.x, last.y, swing ?? last.ehp, 'damage', last.owner);
    }

    /*
     * ⛔⛔ S181 — **WIPE THE UNCLAIMED KILL-SWING RECORDS. THIS LINE WAS MISSING AND MY OWN COMMENT
     * CLAIMED IT EXISTED** — `worldTypes` said the field is *"wiped by the consumer"*, and the
     * consumer only ever SPLICED the records it matched. Anything unclaimed stayed forever.
     *
     * ⚠ AND UNCLAIMED RECORDS ARE GUARANTEED, NOT THEORETICAL. `damageCreature` pushes BEFORE the
     * channelling-Pharaoh branch restores `ehp = 1` and returns without a death — correct, the blow
     * was dealt — but that creature never vanishes, so nothing claims its record. On a host that is
     * an array growing for the whole match, and a stale swing waiting to be mis-attributed to the
     * next creature that happens to die near where it was pushed.
     *
     * ⭐ ITS TWO SIBLINGS EACH HAVE FOUR SITES — three phase resets plus the consumer's wipe. I
     * matched the three and missed the fourth, which is the exact "populated in three of four
     * places" failure the project's four-sites rule is about. `killSwing.test.ts` now asserts this
     * line too, because its original version only checked the three phase files.
     */
    world.creatureKillHits.length = 0;

    this.syncStructures(world);
    this.advance();
  }

  /**
   * ⭐⭐ S175 P9 — damage on the things that are NOT creatures.
   *
   * ⛔⛔ REWRITTEN S177 P1 — **THE SHAPE IS ON THE LADDER NOW, AND THIS DOCBLOCK USED TO SAY
   * OTHERWISE.** It read: *"EACH SYSTEM PRINTS IN ITS OWN UNIT, and that is the owner's own
   * distinction rather than an oversight"*, resting on his S174 correction that `Primitive.hp` (1000)
   * and `CASTLE_MAX_HP` (1500) were *"separate systems"*.
   *
   * He watched it and ruled the opposite, S177: *"when he attacks the tower, it shows us a hundred
   * sixty four. That is not consistent. And we have a system for this. Like, this should be the
   * canonical system moving forward."* A tower IS shapes plus connectors, so the shape scale was the
   * thing printing 167 over a tower. It is gone: `PRIMITIVE_MAX_HP` is 70 fifths and every attacker
   * spends `attackFifths(atk, pen)` on it.
   *
   * ⇒ A creature, a connector, a defender, a bag AND a shape now all print the SAME number for the
   * same swing — which is the teaching channel this feature exists to be.
   *
   * ⚠ THE CASTLE IS THE ONE POOL STILL ON ITS OWN SCALE, stated rather than quietly unified: he did
   * not raise it, a keep at 1500 taking 6 a swing never produced an absurd number, and folding it in
   * would retune every castle-damage relationship in the game for no complaint. Its number still
   * matches the BAR above it, which is the consistency a player can actually check.
   */
  private syncStructures(world: World): void {
    const seen = new Set<string>();
    /*
     * ⭐⭐ S182 — **A MASS CLEAR IS NOT A MASSACRE.** Nine mid-match paths `.clear()` the world's
     * structure maps (match start, title return, soft reset, godly abort). This Map is built ONCE
     * in `main.ts` and `sync` is the only method that exists — there is no reset path — so on the
     * next frame the vanish sweep below saw every watched key gone at once and printed a full-pool
     * damage number for each: a new match opening in a shower of numbers nobody dealt.
     *
     * ⛔ CLEARED WITHOUT EMITTING, and BEFORE the sweep. Dropping the watch is exactly right: those
     * entities did not die, they ceased to be the subject of a match. The next `sync` re-seeds the
     * watch, and a first sighting is neither a hit nor a heal (see `track`).
     */
    if (world.structureWatchEpoch !== this.watchEpoch) {
      this.watchEpoch = world.structureWatchEpoch;
      this.watchedStruct.clear();
    }
    /*
     * ⭐⭐⭐ S179 (owner) — **A SHAPE THAT WAS REMOVED DID NOT TAKE A HIT, SO IT PRINTS NOTHING.**
     *
     * *"a basic creature ... has a total damage output of six ... But then he attacks a building.
     * And it shows 56 freaking damage. Why? It's the same system for buildings and for people."*
     *
     * He is right and nothing dealt 56. The vanish sweep below prints a vanished pool's REMAINDER —
     * correct for a killing blow, a lie for a shape the raze contract took when its connector gave
     * way. Measured before fixing: a two-shape structure whose bond was severed printed **"56"** and
     * **"70"**, two numbers for hits that never happened.
     */
    const removedNotKilled = new Set<string>(world.razedNotKilled.map((id) => `p:${id}`));
    world.razedNotKilled.length = 0; // per-FRAME, wiped by the consumer — the `effects` contract

    /*
     * ⭐⭐⭐ S182 (owner, REPORTED TWICE) — **THE SWING, NOT THE REMAINDER**, for the three pools
     * that still lied after S181 fixed creatures: shapes, landed stink bags and Helga.
     *
     * The sweep below can only see what a vanished pool had LEFT, so a goblin swinging 12 into a
     * 5-fifth remainder printed "5". `damageEntity` records the real number at the moment it lands
     * (the only place that still knows it — the overkill is discarded there), keyed by the same
     * watch key this sweep uses, so joining the two needs no proximity matching.
     *
     * ⚠ A `null` amount is the OTHER half: the key was REMOVED, not hit (an expired bag, a broken
     * Helga recipe, a scrapped building). Those printed a full-pool phantom. `null` suppresses the
     * number entirely — the `razedNotKilled` line directly above, generalised to any watch key.
     *
     * ⚠ LAST WRITE WINS on a duplicate key, which is the correct precedence: the only way a key
     * gets both records in one frame is damage landing and THEN a removal path taking it, and the
     * removal is what actually ended it.
     */
    const killBlow = new Map<string, number | null>();
    for (const h of world.structureKillHits) killBlow.set(h.key, h.amount);
    world.structureKillHits.length = 0; // wipe 4 of 5 — the consumer's, per the `effects` contract

    /*
     * ⭐⭐ S179 (owner) — the swing that BREAKS a connector, which the diff below cannot see because
     * `damageConnector` spends the structure pool and every counter drops. Emitted from the recorded
     * hit so it is the SAME number a unit would show for the same swing, which is what he asked for.
     */
    for (const hit of world.connectorBreakHits) {
      const bond = world.bonds.get(hit.bondId);
      if (bond === undefined) continue;
      const a = world.primitives.get(bond.aId);
      const b = world.primitives.get(bond.bId);
      if (a === undefined || b === undefined) continue;
      this.emitAt(world, (a.pos.x + b.pos.x) / 2, (a.pos.y + b.pos.y) / 2, hit.amount, 'damage', a.placedBy);
    }
    world.connectorBreakHits.length = 0;
    const track = (
      key: string, v: number, x: number, y: number, owner: PlayerId,
      rising: boolean, deathOnVanish: boolean,
    ): void => {
      seen.add(key);
      const prev = this.watchedStruct.get(key);
      this.watchedStruct.set(key, { v, x, y, owner, rising, deathOnVanish });
      if (prev === undefined) return; // first sighting is neither a hit nor a heal
      const d = poolDelta(prev.v, v, rising);
      if (d !== null) this.emitAt(world, x, y, d.amount, d.kind, owner);
    };

    // SHAPES — `hp` out of PRIMITIVE_MAX_HP, which is 70 FIFTHS since S177 P1. Same ladder as a
    // creature, so this prints the same number a creature would for the same swing.
    for (const prim of world.primitives.values()) {
      track(`p:${prim.id}`, prim.hp, prim.pos.x, prim.pos.y, prim.placedBy, false, true);
    }

    /*
     * CONNECTORS — the one pool that counts UP. Anchored at the bond's MIDPOINT, which is where a
     * chewer is standing and where the player is already looking.
     */
    for (const bond of world.bonds.values()) {
      const a = world.primitives.get(bond.aId);
      const b = world.primitives.get(bond.bId);
      if (a === undefined || b === undefined) continue;
      track(
        `b:${bond.id}`, bond.damageFifths,
        (a.pos.x + b.pos.x) / 2, (a.pos.y + b.pos.y) / 2,
        a.placedBy, true, false,
      );
    }

    // DEFENDERS — turret / Helga / stink tower. `ehp` is null for kinds with no unit stats.
    for (const d of world.defenders.values()) {
      if (d.ehp === null) continue;
      track(`d:${d.id}`, d.ehp, d.pos.x, d.pos.y, d.ownerPlayerId, false, true);
    }

    // LANDED STINK BAGS — his *"even on the poop bags that are dropped"*.
    for (const cloud of world.stinkClouds.values()) {
      track(`s:${cloud.id}`, cloud.ehp, cloud.pos.x, cloud.pos.y, cloud.ownerPlayerId, false, true);
    }

    /*
     * CASTLES — `deathOnVanish` is FALSE and that is the `damage.ts` contract, not a shortcut: a
     * castle is NEVER removed. *"A seat with a fallen castle keeps its avatar, its gatherers and
     * its shapes, it has simply LOST."* Emitting a phantom final number on a player leaving would
     * be inventing a hit that never happened.
     */
    for (const p of world.players.values()) {
      // Seat IS the PlayerId, cast exactly as creatureAI.ts:599 and castleGuns.ts do.
      const at = castleAnchor(p.id as unknown as number, world.layout);
      track(`c:${p.id}`, p.castleHp, at.x, at.y, p.id, false, false);
    }

    /*
     * ⭐ THE KILLING BLOW, for structures. Same rule the creature sweep above states: a pool that
     * VANISHES was destroyed, and what it had left when last seen is the damage that finished it.
     * A severed connector is skipped (`deathOnVanish: false`) because its pool was counting UP —
     * there is no remainder to print, and the severance is its own loud event.
     */
    for (const [key, last] of this.watchedStruct) {
      if (seen.has(key)) continue;
      this.watchedStruct.delete(key);
      // ⭐ S179 — removed, not killed: no hit happened, so no number. See the note at the top.
      if (removedNotKilled.has(key)) continue;
      if (!last.deathOnVanish) continue;
      /*
       * ⭐ S182 — the recorded swing if the host has one, the remainder if it does not.
       *
       * ⚠ THE FALLBACK IS NOT LAZINESS, it is the peer path: `structureKillHits` is host-local and
       * never serialized, so a client applying snapshots has no record and keeps exactly the
       * behaviour it had before this change. Same shape as `fatalBlowFifths` for creatures.
       */
      const blow = killBlow.get(key);
      if (blow === null) continue; // removed, not killed — print nothing
      const amount = blow ?? last.v;
      if (amount > 0) {
        this.emitAt(world, last.x, last.y, Math.round(amount), 'damage', last.owner);
      }
    }
  }

  /** `emit` for a target that is not a creature — no id to exclude from the anchor scan. */
  private emitAt(
    world: World, x: number, y: number, amount: number, kind: FloaterKind, owner: PlayerId,
  ): void {
    if (amount <= 0) return;
    this.place(damageAnchor(world, null, x, y, owner), amount, kind);
  }

  private emit(
    world: World,
    victim: CreatureId,
    vx: number,
    vy: number,
    amount: number,
    kind: FloaterKind,
    owner: PlayerId,
  ): void {
    if (amount <= 0) return;
    this.place(damageAnchor(world, victim, vx, vy, owner), amount, kind);
  }

  /**
   * Put one floater on screen at an already-resolved anchor.
   *
   * ⭐ EXTRACTED IN S175 P9 so the creature path and the structure path cannot diverge in stacking,
   * pooling or the alternating drift. Two copies of this would drift the moment one of them was
   * retuned — the duplication class this codebase keeps paying for.
   */
  private place(at: { x: number; y: number }, amount: number, kind: FloaterKind): void {
    const { x, y } = at;
    let stack = 0;
    for (const f of this.live) {
      if (Math.abs(f.x - x) < 12 && Math.abs(f.y - y) < ROW_STACK_PX) stack++;
    }

    const t = this.pool.pop() ?? new Text({ text: '', style: this.damageStyle });
    t.style = kind === 'heal' ? this.healStyle : this.damageStyle;
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
