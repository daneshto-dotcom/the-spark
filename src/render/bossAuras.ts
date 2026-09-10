/**
 * SPARK — S170 P5 — **THE ZOMBIE'S ROT AURA AND THE KRAKEN'S SONAR WAVE, DERIVED FROM SYNCED STATE.**
 *
 * Owner, on the state of boss abilities: *"I didn't see that they have, like, cool generated videos
 * or effects."* Five bosses ran eight abilities and almost nothing was drawn — damage simply
 * happened. This module is the half of that pass that needs **no generated art**, so it could ship
 * without an owner-in-the-loop generation round.
 *
 * ## ⭐⭐ THE MECHANISM, AND WHY IT IS NOT A `world.effects` PUSH
 *
 * A one-shot `world.effects` push is lost about **five times in six**: effects are sampled into
 * snapshots at `NET_SNAPSHOT_HZ` (10) while `effectsRenderer.sync` wipes `world.effects` every
 * render frame at 60. So a pushed ability visual appears on the host and flickers or vanishes on the
 * peer. Everything here is instead a **pure function of synced state**, recomputed every frame:
 *
 *   · the rot aura reads a live zombie boss's `type`, `pos` and `stunnedUntilTick`;
 *   · the sonar wave reads `(world.tick + bossId) % KRAKEN_SONAR_INTERVAL_TICKS`.
 *
 * ⭐ **THAT SECOND ONE IS FREE BECAUSE OF THE DETERMINISM RULE, NOT DESPITE IT.** The sim is forbidden
 * from using accumulators, so `runKrakenSonar` phase-spreads by entity id against `world.tick` —
 * exactly the expression above. Both operands are synced and hashed, so a renderer can compute which
 * tick each Kraken fires, and how long ago it fired, with nothing on the wire and no new field. Even
 * the wave's DIRECTION re-derives: the sim aims at `nearestEnemyFor(world, boss, rangeSq)`, a pure
 * read of synced positions, so calling the same function here yields the same axis on every peer.
 *
 * ⚠ NO WALL CLOCK, NO `Math.random`, NO ACCUMULATORS — the same rules the sim obeys, because a
 * visual that disagrees between two screens is the same class of defect as a divergent sim, just
 * quieter. Animation phase comes from `world.tick` alone.
 *
 * ## ⭐ THE ONE ABILITY THAT NEEDED A SYNCED FIELD — and the owner is why
 *
 * Vlad's life sap could NOT be derived: its use-count lives in `sapLedger`, a host-local `Map` in
 * `hostTick`'s state that is never serialized, and the triggering condition is true for essentially
 * one tick (he drops below 40% and is healed straight back above it) so a 10 Hz snapshot misses it
 * ~5/6 of the time. It was parked for exactly that reason — until the owner named the requirement
 * that settles it: *"we do need enemies to be able to see Vlad's tether, not just the player that
 * owns Vlad."* A cross-player visual is not optional decoration, so it earned
 * `Creature.sapFlashUntilTick`: additive-optional (no protocol bump), serialized AND hashed, stamped
 * by the sim where the heal lands. See `drawLifeSap` at the bottom for the part that is a SPEC GAP
 * rather than a coding choice — R140 has no victim, so there is nothing to tether to.
 *
 * ## THE DESIGN RULE THESE FOLLOW
 *
 * State effects go **above the head**; environment effects go **on the floor**; never mixed. That is
 * why the stun stars read well (`stunStars.ts`) and why both of these sit on the ground: the aura is
 * something happening TO the terrain around the boss, and the wave is something crossing it.
 */

import type { Graphics } from 'pixi.js';
import { isConcealed } from './concealment.ts';
import {
  KRAKEN_SONAR_COS_HALF_ANGLE,
  KRAKEN_SONAR_INTERVAL_TICKS,
  KRAKEN_SONAR_RANGE,
  VLAD_SAP_FLASH_TICKS,
  ZOMBIE_AURA_RADIUS,
  RA_COLUMN_COUNT,
  RA_COLUMN_RADIUS,
  RA_COLUMN_TICKS,
  RA_RITUAL_TICKS,
} from '../constants.ts';
import { isStunned, isChannellingRa } from '../state/creatures/creature.ts';
import { raColumnPos } from '../state/bossSkillsPharaohRitual.ts';
import { nearestEnemyFor } from '../state/bossSkillsKraken.ts';
import { T9_BOSS_TYPE } from '../state/t9BossIds.ts';
import type { World } from '../state/world.ts';

/* ── ROT AURA dial. ⚠ MINE, NOT THE OWNER'S. He ruled the MECHANIC (R138: an aura damaging enemies
 * around him, 2.5% of the affected unit's own pool per second) and gave no look. His only note on
 * the existing zombie visual was that the death blast *"kinda looks just like a stink tower radius.
 * It didn't really do anything cool"* — so this deliberately does NOT draw a ring. A ring is what
 * the stink tower already is, and re-using that vocabulary is what made the blast read as nothing. */
const ROT_BUBBLES = 14;
/** Bubble radius range, in px. Small enough that fourteen of them read as texture, not as objects. */
const ROT_R_MIN = 2.2;
const ROT_R_MAX = 5.5;
/** A bubble's full swell-and-pop cycle, in ticks. Staggered per bubble so the ground never pulses. */
const ROT_CYCLE_TICKS = 42;
const ROT_TINT = 0x7bbf3a;
/** The lingering scorch under the boil — one flat disc, dark and low-contrast, not a bright ring. */
const ROT_SCORCH_TINT = 0x2a3d18;
const ROT_SCORCH_ALPHA = 0.28;

/* ── SONAR dial. ⚠ ALSO MINE. Owner R139 ruled the mechanic (a cone that STUNS and PUSHES BACK) and
 * S170's creative pass asked for *"a heavy, rippling crescent of high-pressure water... with a thick,
 * foamy leading edge"* whose edge visually CARRIES the units the knockback shoves. */
const SONAR_VISIBLE_TICKS = 24;
const SONAR_ARCS = 4;
const SONAR_TINT = 0x8fdcff;
const SONAR_FOAM_TINT = 0xffffff;

/**
 * Draw every live boss aura for this frame. Cheap no-op when no boss is on the board.
 *
 * ⚠ `g` is an EXISTING renderer's Graphics, never a new display object. A new child of
 * `fogHiddenLayer` would shift its indices and break `tower-art.spec.ts`'s two hardcoded probes —
 * which have already moved three times this session.
 */
export function drawBossAuras(g: Graphics, world: World): void {
  for (const [bossId, boss] of world.creatures) {
    if (boss.ehp <= 0) continue;
    /*
     * ⭐⭐ S170 (owner) — FOG: an enemy boss's ability VFX is not drawn unless the boss is in live
     * vision. ⚠ THIS WAS MY OWN LEAK, introduced earlier in this same session: these auras walk
     * `world.creatures` themselves rather than riding a culled renderer loop, so a rot aura, a sonar
     * wave or a life-sap flash would have advertised an enemy boss's exact position through the fog —
     * a bigger tell than the sprite, since the aura is 170px wide and the sonar crosses 260px.
     */
    if (isConcealed(boss.pos.x, boss.pos.y, boss.ownerPlayerId)) continue;
    if (boss.type === T9_BOSS_TYPE.zombies) drawRotAura(g, world, bossId as number, boss.pos, isStunned(boss, world.tick));
    if (boss.type === T9_BOSS_TYPE.nagas) drawSonarWave(g, world, bossId as number, boss);
    if (boss.type === T9_BOSS_TYPE.vampires) drawLifeSap(g, world, bossId as number, boss.pos, boss.sapFlashUntilTick);
    if (boss.type === T9_BOSS_TYPE.mummies) drawRaRitual(g, world, bossId as number, boss);
  }
}

/* ── RA RITUAL dial. ⚠ THE LOOK IS MINE; THE MECHANIC AND THE TELEGRAPH ARE HIS (R142, R171-B). */
const RA_TELEGRAPH_TINT = 0xffb43c;
const RA_COLUMN_TINT = 0xfff3c4;
const RA_HALO_TINT = 0xffd970;
/** How long the beam itself is visible after impact. Short — it is a strike, not a lingering pool. */
const RA_FLASH_TICKS = 14;

/**
 * ⭐⭐ S171 (owner R142 + R171-B) — **THE RA RITUAL: FIVE TELEGRAPHED COLUMNS OF SUNLIGHT.**
 *
 * The owner described the telegraph precisely, and it is the whole mechanic of the visual:
 *
 * > *"it should be an area ... It'll be, like, a circle on the ground before it shows that the
 * > column is coming of light ... kind of like when you see the shading when the meteor falls and
 * > see it, like, shading that gets bigger and bigger. In a lot of games, it works like that. You
 * > see, you know where the column is gonna hit. It starts, like, a little shaded area, and it gets
 * > bigger and bigger, and then it lands and kills everything in that circle that it lands on. The
 * > column comes from the sky."*
 *
 * ⛔ **THE TELEGRAPH IS A PROMISE, SO IT IS DRAWN FROM THE SIM'S OWN FUNCTION.** The landing spot
 * comes from `raColumnPos` — the same export `runPharaohRitual` damages through — rather than from a
 * second copy of the formula here. A telegraph a few pixels off its impact is a lie the player
 * learns not to trust, and two hand-written copies of one formula is exactly how they drift apart.
 *
 * ⚠ EVERYTHING IS DERIVED FROM ONE SYNCED NUMBER. `raRitualUntilTick` gives the start, the column
 * index and the progress of each telegraph, so both peers draw the identical five circles with
 * nothing pushed over the wire — the same reason the sonar wave needed no state at all.
 */
function drawRaRitual(
  g: Graphics,
  world: World,
  id: number,
  boss: { pos: { x: number; y: number }; raRitualUntilTick?: number },
): void {
  const until = boss.raRitualUntilTick;
  if (until === undefined) return;
  if (!isChannellingRa(boss, world.tick)) return;

  const start = until - RA_RITUAL_TICKS;
  const elapsed = world.tick - start;

  // The priest himself: a rising halo while he channels, so the source of it all is legible.
  const pulse = 0.5 + 0.5 * Math.sin((world.tick / 9) % (Math.PI * 2));
  g.circle(boss.pos.x, boss.pos.y, 30 + pulse * 6)
    .stroke({ color: RA_HALO_TINT, width: 2, alpha: 0.35 + pulse * 0.3 });

  for (let k = 0; k < RA_COLUMN_COUNT; k++) {
    const windowStart = k * RA_COLUMN_TICKS;
    const impact = (k + 1) * RA_COLUMN_TICKS;
    if (elapsed < windowStart) continue;              // not yet announced
    if (elapsed > impact + RA_FLASH_TICKS) continue;  // done and faded

    const pos = raColumnPos(id, k, boss.pos.x, boss.pos.y);

    if (elapsed < impact) {
      /*
       * THE SHADE THAT GETS BIGGER. `t` runs 0→1 across the full two seconds, and the radius grows
       * with it up to the EXACT kill radius the sim will use — so what the player dodges out of is
       * the real circle, at its real size, at the moment it lands.
       */
      const t = (elapsed - windowStart) / RA_COLUMN_TICKS;
      const r = RA_COLUMN_RADIUS * (0.18 + 0.82 * t);
      g.circle(pos.x, pos.y, r).fill({ color: RA_TELEGRAPH_TINT, alpha: 0.10 + 0.22 * t });
      g.circle(pos.x, pos.y, r).stroke({ color: RA_TELEGRAPH_TINT, width: 1.5, alpha: 0.35 + 0.5 * t });
    } else {
      /*
       * THE COLUMN, FROM THE SKY. Drawn as a tall tapering shaft standing on the circle plus a
       * ground flare, fading over `RA_FLASH_TICKS`. The board is seen at an angle, so the beam rises
       * off the TOP of the ellipse rather than from its centre.
       */
      const f = 1 - (elapsed - impact) / RA_FLASH_TICKS; // 1 → 0
      const halfW = RA_COLUMN_RADIUS * 0.42 * f;
      const top = pos.y - 520;
      g.moveTo(pos.x - halfW, pos.y)
        .lineTo(pos.x - halfW * 0.45, top)
        .lineTo(pos.x + halfW * 0.45, top)
        .lineTo(pos.x + halfW, pos.y)
        .fill({ color: RA_COLUMN_TINT, alpha: 0.55 * f });
      // A hotter core, so the shaft has depth rather than reading as a flat quad.
      g.moveTo(pos.x - halfW * 0.35, pos.y)
        .lineTo(pos.x - halfW * 0.14, top)
        .lineTo(pos.x + halfW * 0.14, top)
        .lineTo(pos.x + halfW * 0.35, pos.y)
        .fill({ color: 0xffffff, alpha: 0.5 * f });
      // The scorch it lands in — at the true kill radius, so the aftermath states the hitbox.
      g.circle(pos.x, pos.y, RA_COLUMN_RADIUS * (1 + (1 - f) * 0.25))
        .fill({ color: RA_HALO_TINT, alpha: 0.42 * f });
    }
  }
}

/**
 * The ground under a live zombie boss BOILS: sickly bubbles swell and pop over a dark scorch.
 *
 * ⚠ GATED ON THE STUN, and that is not decoration. `runZombieRotAura` returns early for a stunned
 * boss (owner R152 — *"cant do anything"*), so an aura that kept boiling while he was stunned would
 * advertise damage that is not being dealt, and would make the player's only counterplay look like
 * it failed. The visual and the sim read the SAME predicate.
 */
function drawRotAura(g: Graphics, world: World, id: number, pos: { x: number; y: number }, stunned: boolean): void {
  if (stunned) return;
  g.circle(pos.x, pos.y, ZOMBIE_AURA_RADIUS)
    .fill({ color: ROT_SCORCH_TINT, alpha: ROT_SCORCH_ALPHA });

  for (let k = 0; k < ROT_BUBBLES; k++) {
    // Deterministic pseudo-scatter: integer hash of (bubble index, boss id). No Math.random.
    const h = (k * 2654435761 + id * 40503) >>> 0;
    const ang = ((h % 628) / 100);
    const dist = ((h >>> 9) % ZOMBIE_AURA_RADIUS);
    const bx = pos.x + Math.cos(ang) * dist;
    const by = pos.y + Math.sin(ang) * dist * 0.55; // squashed: the board is seen at an angle

    // Each bubble runs its own swell→pop cycle, offset so the field never pulses in unison.
    const phase = (world.tick + k * 7 + id * 3) % ROT_CYCLE_TICKS;
    const t = phase / ROT_CYCLE_TICKS;
    // Swell for the first 70%, then pop: radius collapses and alpha goes with it.
    const swell = t < 0.7 ? t / 0.7 : 1 - (t - 0.7) / 0.3;
    const r = ROT_R_MIN + (ROT_R_MAX - ROT_R_MIN) * swell;
    g.circle(bx, by, r).fill({ color: ROT_TINT, alpha: 0.18 + 0.42 * swell });
  }
}

/**
 * The Kraken's sonar: a heavy crescent of water with a foamy leading edge, expanding along the axis
 * the sim actually aimed at.
 *
 * ⭐⭐ THE WHOLE FUNCTION IS DERIVED, and this is the reference case for the rest of the ability-art
 * pass. `runKrakenSonar` fires when `(world.tick + bossId) % KRAKEN_SONAR_INTERVAL_TICKS === 0`, so
 * `sinceFire` below reconstructs how many ticks ago that happened — on any peer, from two synced
 * numbers, with no new wire field and no effect push to lose.
 *
 * ⚠ AND THE AXIS RE-DERIVES RATHER THAN BEING REMEMBERED. Calling the sim's own `nearestEnemyFor`
 * gives the same aim the wave was fired along, because it is a pure read of synced positions. The
 * alternative — caching the axis at fire time in renderer state — would desync on a late-joining
 * peer and on host migration, and would silently drift from whatever the sim aimed at.
 */
function drawSonarWave(
  g: Graphics,
  world: World,
  id: number,
  boss: { pos: { x: number; y: number } } & Parameters<typeof nearestEnemyFor>[1],
): void {
  const sinceFire = ((world.tick + id) % KRAKEN_SONAR_INTERVAL_TICKS);
  if (sinceFire >= SONAR_VISIBLE_TICKS) return; // between waves — nothing to draw

  const rangeSq = KRAKEN_SONAR_RANGE * KRAKEN_SONAR_RANGE;
  const aim = nearestEnemyFor(world, boss, rangeSq);
  if (aim === null) return; // no target in reach ⇒ the sim fired no wave either

  const ax = aim.pos.x - boss.pos.x;
  const ay = aim.pos.y - boss.pos.y;
  const len = Math.sqrt(ax * ax + ay * ay);
  if (len < 1) return;
  const ux = ax / len;
  const uy = ay / len;
  const heading = Math.atan2(uy, ux);
  // KRAKEN_SONAR_COS_HALF_ANGLE is the cosine of the half-angle the SIM tests, so the drawn cone is
  // the real hitbox rather than an artistic guess at it.
  const half = Math.acos(KRAKEN_SONAR_COS_HALF_ANGLE);

  const t = sinceFire / SONAR_VISIBLE_TICKS; // 0 → 1 as the wave crosses the cone
  const front = KRAKEN_SONAR_RANGE * t;
  const fade = 1 - t;

  // Stacked arcs trailing the front: the body of the water, thinning as it passes.
  for (let k = 0; k < SONAR_ARCS; k++) {
    const r = front - k * 14;
    if (r <= 6) continue;
    g.arc(boss.pos.x, boss.pos.y, r, heading - half, heading + half)
      .stroke({ width: 5 - k, color: SONAR_TINT, alpha: (0.5 - k * 0.1) * fade });
  }
  // ⭐ THE FOAMY LEADING EDGE, thicker and brighter than the body. It is drawn LAST and at the front
  // radius so it coincides with where the knockback is applied — the wave must look like it CARRIES
  // the units it shoves, which is the detail that makes it read as force rather than as a coloured
  // triangle.
  g.arc(boss.pos.x, boss.pos.y, front, heading - half, heading + half)
    .stroke({ width: 7, color: SONAR_FOAM_TINT, alpha: 0.75 * fade });
}


/* ── LIFE SAP dial. ⚠ MINE, NOT THE OWNER'S. He ruled the MECHANIC (R140: heals 20% of his health,
 * three uses, only below 40%) and for the LOOK gave a reference rather than geometry: *"It needs to be
 * looking scary and cool, like life sap, you know, and Dota... research Lifesap in Dota and you'll see
 * how it looks."* */
const SAP_MOTES = 18;
/** Where the motes are born, as a multiple of the convergence radius. */
const SAP_SPAWN_R = 96;
const SAP_MOTE_R = 3.4;
const SAP_TINT = 0xb3122b;
const SAP_CORE_TINT = 0xff4d6a;

/**
 * ⭐⭐ S170 P7 (owner R140) — **VLAD'S LIFE SAP, AND IT IS DRAWN AS WHAT IT ACTUALLY IS.**
 *
 * Owner: *"we do need enemies to be able to see Vlad's tether, not just the player that owns Vlad. It
 * needs to be looking scary and cool, like life sap, you know, and Dota."*
 *
 * ⛔ **THE HONEST PART, AND IT IS A SPEC GAP RATHER THAN A CODING CHOICE: THERE IS NO VICTIM.**
 * R140 as he ruled it is a pure SELF-HEAL — `runVladLifeSap` does
 * `vlad.ehp = Math.min(max, vlad.ehp + heal)` and touches nobody else. Nothing is drained from any
 * unit. Dota's lifesteal shows blood travelling FROM a victim TO the caster, so drawing a tether here
 * would paint a damage relationship that does not exist — the same class of lie as the drone's
 * unconditional blast graphic (S170 P2b), where a full explosion played for an event that hit nothing.
 * A visual must never claim a mechanic the sim does not have.
 *
 * ⭐ SO IT READS AS A DRAIN WITHOUT NAMING A DONOR: crimson motes converge on him from every side and
 * are swallowed at his chest, over a brightening core. Life flowing INWARD is the Dota read; where it
 * came from is left unstated, which is exactly as specific as the mechanic is.
 *
 * ⚠ IF HE WANTS THE TETHER, THE MECHANIC HAS TO CHANGE FIRST — the sap would need to drain a nearby
 * enemy, which is his ruling to make, not a detail to infer from a reference to another game. Recorded
 * as an open question rather than silently built either way.
 *
 * ⚠ CROSS-PLAYER BY CONSTRUCTION. `sapFlashUntilTick` is serialized and hashed, so the enemy sees this
 * on the same tick the owner does — which was his actual requirement. It is NOT gated on the local
 * seat, and it deliberately does not ride the fog's concealment rules any differently from the boss
 * itself: if you can see Vlad, you can see him feed.
 */
function drawLifeSap(
  g: Graphics,
  world: World,
  id: number,
  pos: { x: number; y: number },
  until: number | undefined,
): void {
  if (until === undefined || world.tick >= until) return;
  const remaining = until - world.tick;
  // 0 -> 1 across the flash. Integer-derived: no wall clock, no accumulator.
  const t = 1 - remaining / VLAD_SAP_FLASH_TICKS;

  // The core swells and brightens as the life lands.
  g.circle(pos.x, pos.y, 10 + 16 * t).fill({ color: SAP_CORE_TINT, alpha: 0.5 * (1 - t) + 0.15 });

  for (let k = 0; k < SAP_MOTES; k++) {
    // Deterministic bearing per mote per boss - identical on every peer.
    const h = (k * 2246822519 + id * 668265263) >>> 0;
    const ang = (h % 628) / 100;
    // Each mote travels inward on its own stagger, so they arrive as a stream not a ring.
    const lead = ((h >>> 11) % 40) / 100; // 0 .. 0.39
    const travel = Math.min(1, Math.max(0, (t - lead) / (1 - lead || 1)));
    if (travel <= 0) continue;
    const dist = SAP_SPAWN_R * (1 - travel);
    const mx = pos.x + Math.cos(ang) * dist;
    const my = pos.y + Math.sin(ang) * dist * 0.7; // squashed: the board is seen at an angle
    // A mote shrinks as it is swallowed, which is what sells "absorbed" over "orbiting".
    g.circle(mx, my, SAP_MOTE_R * (1 - travel * 0.55))
      .fill({ color: SAP_TINT, alpha: 0.35 + 0.55 * travel });
  }
}
