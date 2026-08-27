/**
 * SPARK — S87: bot brain — PURE goal selection + build-point choice.
 *
 * Every function here is a pure function of (world, bot inputs, rng draw) —
 * no dispatch, no mutation, no wall clock. The controller owns the FSM and
 * actuation; the brain only answers "what should I want right now?" and
 * "where should this spark go?". That split keeps the decision layer
 * exhaustively unit-testable on synthetic worlds (vitest, no Pixi).
 *
 * Determinism: callers pass the bot's seeded mulberry32; the brain draws
 * from it in a FIXED order per call so same-seed runs replay identically.
 */

import {
  AUTO_BOND_RADIUS,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
// S138 P2 — a bot's supply is now its own bank + its own porch, never the shared quarry.
import { bankCount, bankCountOf, isOwnPorchSpark } from '../state/castleBank.ts';
// S154 P3 (A5) — a bot's tower uses the SAME predicates the human path uses: affordability from
// `planBlueprintPayment` (the one the reducer calls) and legality from the footprint-aware
// `stampRefusalAt`, never a lookalike.
import { ALL_BLUEPRINT_IDS, blueprintBill, blueprintCost } from '../state/blueprints.ts';
import { planBlueprintPayment } from '../state/blueprintBuild.ts';
import { stampRefusalAt } from '../state/blueprintLegality.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { ALL_SPARK_TYPES, type SparkType } from '../constants.ts';
import { canBuildNow } from '../state/buildLegality.ts';
import { componentOf } from '../game/structure.ts';
import type { World } from '../state/world.ts';
import type { BondId, PlayerId, PotatoId, RainbowId, SparkId, Vec2 } from '../types.ts';
import type { BotConfig } from './botConfig.ts';

/** Margin kept from canvas edges for any chosen point. */
const EDGE_MARGIN = 50;
/** First-anchor distance beyond the spawner rim (build zone seed). */
const HOME_ANCHOR_REACH = 90;
/** Growth step from an existing own prim — inside AUTO_BOND_RADIUS so the
 *  host target re-pick forms a bond (60 × 0.8 = 48). */
const GROWTH_STEP = AUTO_BOND_RADIUS * 0.8;
/** Flee hop length when running from the hunter. */
const FLEE_HOP = 320;
/** S100 P1 (TD Phase 1a) — a bot keeps a light berth from chewers: if one is within this
 *  radius of its avatar, hop away (chewers chew enemy connectors, not the cursor, so this
 *  is a LIGHT avoid — just don't loiter in the swarm — gated below the hunter flee). */


const CHEWER_AVOID_RADIUS = 140;
const CHEWER_AVOID_RADIUS_SQ = CHEWER_AVOID_RADIUS * CHEWER_AVOID_RADIUS;

export type BotGoal =
  | { readonly kind: 'BUILD'; readonly sparkId: SparkId }
  | { readonly kind: 'SEVER'; readonly bondId: BondId; readonly pos: Vec2 }
  | { readonly kind: 'RAINBOW'; readonly rainbowId: RainbowId; readonly pos: Vec2 }
  | { readonly kind: 'CLEAN'; readonly pos: Vec2 }
  | { readonly kind: 'POTATO_GRAB'; readonly potatoId: PotatoId; readonly pos: Vec2 }
  | { readonly kind: 'SHRINK' }
  | { readonly kind: 'FLEE'; readonly pos: Vec2 }
  /**
   * S138 P2 — take one banked shape out onto my own porch via the shipped `PULL_FROM_BANK` client
   * intent. A castle command, so it needs no travel. `BotGoal` has NO wire surface (grep of save.ts
   * and net/ finds nothing), so adding a member costs no serialization, hash or protocol change.
   */
  | { readonly kind: 'PULL' }
  /**
   * ⭐ S154 P3 (owner R86) — STAMP A TOWER. Like `PULL` this is a castle command, so it needs no
   * travel: the payment comes out of the bank and the structure appears at `centre`. `BotGoal` has
   * NO wire surface (a grep of save.ts and net/ finds nothing), so adding members costs no
   * serialization, no hash entry and no protocol change — the same reasoning S138 P2 recorded for
   * `PULL`.
   */
  | { readonly kind: 'TOWER'; readonly blueprintId: GodlyId; readonly centre: Vec2 }
  /**
   * ⭐ S154 P3 — TELL MY OWN GATHERER WHAT TO FETCH. Without this a bot's tower is a lottery: bills
   * want 3-5 of ONE shape type and a bot's gatherer runs `preferredType: null`, so the right shapes
   * only ever arrive by luck. Bots have never emitted a single `ENQUEUE_GATHERER_ORDER` — the intent
   * has existed and been allowlisted since S141 and no bot ever used it.
   */
  | { readonly kind: 'ORDER'; readonly sparkType: SparkType }
  | { readonly kind: 'REST' };

/** ⭐ S154 P3 — the tower a bot has decided to build, and where. */
export interface TowerPlan {
  readonly blueprintId: GodlyId;
  readonly centre: Vec2;
}

/**
 * Blueprints in CHEAPEST-FIRST order, derived from the registry rather than hardcoded.
 *
 * ⚠ DERIVED, because `ALL_BLUEPRINT_IDS` is hand-written and this repo has already been bitten by
 * that once (goblinTower was fully implemented and simply never appeared in the panel). Sorting by
 * `blueprintCost` with an id tie-break keeps the order total and deterministic — no rng anywhere in
 * the bot think, which is what the seeded replay gates depend on.
 */
const TOWERS_BY_COST: readonly GodlyId[] = [...ALL_BLUEPRINT_IDS].sort(
  (a, b) => blueprintCost(a) - blueprintCost(b) || (a < b ? -1 : a > b ? 1 : 0),
);

/**
 * ⭐ PURE — how far a bot's tower is planted from its own home anchor, and why it is not closer.
 *
 * `stampRefusalAt` already refuses a site whose footprint comes within 60 px of ANY existing
 * primitive, so a stamp can never auto-bond at the moment it lands. The reverse is the danger: a bot
 * hand-builds loose shapes outward from its cluster at `GROWTH_STEP` (48 px, inside
 * `AUTO_BOND_RADIUS` 60), and a later loose shape landing within 60 px of a tower node auto-bonds a
 * chord into it — which drops a pentagram's ring below degree 2 or breaks a voltkin chain, and the
 * structure is torn down on the next re-validation with NO error and NO log line. Planting the tower
 * a clear span away from where the cluster grows is the cheap half of avoiding that.
 */
const TOWER_SITE_OFFSET = 210;
/** Candidate directions around the anchor, tried in a fixed order. Deterministic: never rng. */
const TOWER_SITE_ANGLES: readonly number[] = [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, 2.8, -2.8, Math.PI];

/**
 * ⭐ PURE — the tower this bot can afford AND legally place right now, or null.
 *
 * Affordability is decided by **`planBlueprintPayment`, the same function the reducer uses** — never
 * a lookalike. `footerBandModel.ts` states the rule this follows: a surface that says "you can build
 * this" while the build refuses it is the exact defect sharing the predicate exists to prevent.
 *
 * Legality is decided by **`stampRefusalAt`**, which is footprint-aware, and NOT by
 * `isLegalBuildPos` — that one tests a bare centre point and would happily return a site whose
 * outlying nodes are off-canvas or inside a spawner zone. `buildLegalityGates.test.ts` pins the
 * six-gate agreement sweep on the footprint-aware predicate, so this is the one to ask.
 */
export function chooseTowerPlan(world: World, seat: PlayerId, cfg: BotConfig): TowerPlan | null {
  if (!cfg.buildsTowers) return null;
  // Cheapest of all the gates and true of the whole board at once — `stampRefusalAt`'s own first
  // check. Asking it here means the candidate loop is skipped entirely for the whole FIGHT phase.
  if (world.matchPhase !== 'BUILD') return null;

  const anchor = castleAnchor(seat as unknown as number, world.layout);
  // ⭐ AMENDMENT A — only the rungs this tier climbs. See `towerTiers`.
  for (const id of TOWERS_BY_COST.slice(0, cfg.towerTiers)) {
    if (planBlueprintPayment(world, seat, id) === null) continue;
    for (const a of TOWER_SITE_ANGLES) {
      const centre = {
        x: anchor.x + Math.cos(a + Math.PI) * TOWER_SITE_OFFSET,
        y: anchor.y + Math.sin(a + Math.PI) * TOWER_SITE_OFFSET,
      };
      if (stampRefusalAt(world, centre, seat, id) === null) return { blueprintId: id, centre };
    }
  }
  return null;
}

/**
 * ⭐ PURE — the shape a bot should tell its gatherer to fetch next, or null if it needs nothing.
 *
 * The cheapest blueprint it cannot yet afford, minus what the bank already holds, in canonical
 * `SparkType` order so two runs of one seed agree. Returns one type at a time: the queue coalesces
 * by type anyway, and one order per think keeps the intent stream small.
 */
export function chooseTowerOrder(world: World, seat: PlayerId, cfg: BotConfig): SparkType | null {
  if (!cfg.buildsTowers) return null;
  for (const id of TOWERS_BY_COST.slice(0, cfg.towerTiers)) {
    if (planBlueprintPayment(world, seat, id) !== null) return null; // already affordable
    const bill = blueprintBill(id);
    for (const t of ALL_SPARK_TYPES) {
      const want = bill.get(t) ?? 0;
      if (want > 0 && bankCountOf(world.castleBanks, seat, t) < want) return t;
    }
  }
  return null;
}

/**
 * Priority arbitration for an idle bot. Order: survival (flee) → economy
 * repair (clean) → opportunities (rainbow) → aggression (sever / potato /
 * shrink) → default BUILD → REST.
 */
export function chooseGoal(
  world: World,
  seat: PlayerId,
  cfg: BotConfig,
  rng: () => number,
  buildReady: boolean,
): BotGoal {
  const me = world.players.get(seat);
  if (me === undefined) return { kind: 'REST' };

  // 1 — FLEE: a hunter locked onto me is a death sentence for my build loop.
  if (cfg.fleesHunter) {
    for (const h of world.hunters.values()) {
      if (h.targetPlayerId === seat) {
        return { kind: 'FLEE', pos: fleePoint(me.avatarPos, h.pos) };
      }
    }
    // 1b — S100 P1 (TD Phase 1a) — LIGHT chewer-avoid: if a chewer is loitering near my
    // avatar, hop away from the nearest one (reuses the FLEE goal + fleePoint, so no new
    // controller actuation). Gated under fleesHunter (the same "I dodge threats" trait) and
    // BELOW the hunter check (a locked hunter is the bigger danger). Deterministic: the
    // nearest chewer wins, tie-broken by Map (insertion) order. Without this, VS-BOTS gives
    // a false "spawners are fine" reading (R11) because bots ignore the swarm entirely.
    const chewer = nearestChewer(world, me.avatarPos);
    if (chewer !== null) {
      return { kind: 'FLEE', pos: fleePoint(me.avatarPos, chewer) };
    }
  }

  // 2 — CLEAN: my structure is fouled → income is ZERO until I walk the splat.
  if (cfg.cleansSplats) {
    for (const poop of world.poops.values()) {
      if (poop.state !== 'SPLAT_STRUCTURE' || poop.fouledPrimId === undefined) continue;
      const prim = world.primitives.get(poop.fouledPrimId);
      if (prim !== undefined && prim.placedBy === seat) {
        return { kind: 'CLEAN', pos: { x: poop.pos.x, y: poop.pos.y } };
      }
    }
  }

  // 3 — RAINBOW: chaos for everyone, and the bot likes chaos (rng-gated).
  if (cfg.claimsRainbow && world.rainbows.size > 0 && rng() < cfg.rainbowChance) {
    const rb = world.rainbows.values().next().value;
    if (rb !== undefined) {
      return { kind: 'RAINBOW', rainbowId: rb.id, pos: { x: rb.pos.x, y: rb.pos.y } };
    }
  }

  // 4 — SEVER: spend a charge on an enemy bond (rng-gated). S100 P1 (TD Phase 1a) —
  // PRIORITIZE an enemy SPAWNER-anchor's connectors over a generic bond: breaking any
  // connector of the exact pentagram reduces the component below the recipe → the
  // spawner is torn down (income + swarm STOP) on the next re-validation poll. Only when
  // no enemy spawner exists does the bot fall back to the generic nearest-enemy-bond
  // (the pre-S100 behaviour, byte-identical). Without this, bots never answer a spawner
  // and VS-BOTS balance tests read falsely (R11).
  if (cfg.canSever && me.disruptionCharges >= 1 && rng() < cfg.severChance) {
    const spawnerTarget = nearestEnemySpawnerBond(world, seat, me.avatarPos);
    if (spawnerTarget !== null) {
      return { kind: 'SEVER', bondId: spawnerTarget.bondId, pos: spawnerTarget.mid };
    }
    const target = nearestEnemyBond(world, seat, me.avatarPos);
    if (target !== null) return { kind: 'SEVER', bondId: target.bondId, pos: target.mid };
  }

  // 5 — POTATO (IMBA): grab a FREE potato and plant it on the enemy.
  if (
    cfg.usesPotato &&
    me.kind === 'Idle' &&
    me.carriedPotatoId === undefined
  ) {
    for (const potato of world.potatoes.values()) {
      if (potato.state === 'FREE' && nearestEnemyPrim(world, seat, potato.pos) !== null) {
        return {
          kind: 'POTATO_GRAB',
          potatoId: potato.id,
          pos: { x: potato.pos.x, y: potato.pos.y },
        };
      }
    }
  }

  // 6 — SHRINK (IMBA): at max charges, burn one squeezing enemy territory.
  if (cfg.usesShrink && me.disruptionCharges >= 2 && rng() < 0.5) {
    return { kind: 'SHRINK' };
  }

  // ⭐ 6b — S154 P3 (owner R86) — TOWER: spend the bank on a structure.
  //
  // Placed ABOVE the loose-shape BUILD branch, because a bot holding a full bill should raise the
  // tower rather than fritter the shapes away one at a time — that is the whole point of R86.
  //
  // ⛔ AND IT DRAWS NO `rng()`, WHICH IS WHY IT CAN SIT HERE AT ALL. `pickTargetSpark` documents that
  // it draws exactly once on the sloppy path and zero times on the smart path, and every seeded
  // replay gate (hostTick.replay, workerSim.differential, botController's same-seed stream test)
  // depends on the draw ORDER. A new branch above an existing one that consumed even one draw would
  // shift every downstream number and break all of them. `chooseTowerPlan` and `chooseTowerOrder` are
  // both pure functions of world state in canonical order — the `ALL_SPARK_TYPES.find` idiom
  // botController.ts:196 already uses for exactly this reason.
  const tower = chooseTowerPlan(world, seat, cfg);
  if (tower !== null) return { kind: 'TOWER', blueprintId: tower.blueprintId, centre: tower.centre };

  // 7 — BUILD: the bread and butter. Idle-only: claiming while Carrying
  // throws carry-1 (the controller self-heals that state before thinking,
  // but the brain must never PROPOSE it).
  if (buildReady && me.kind === 'Idle' && me.carriedPotatoId === undefined) {
    /*
     * ⛔ S154 AMENDMENT A — THE SAVE IS NOT HERE, AND THE REASON IS A MEASUREMENT.
     *
     * Owner, playing a HARD bot: *"he is building random free form connections rather than save to
     * build towers"*. Correct. P3 shipped the tower PLANNER and the ORDER goal but nothing that makes
     * a bot accumulate, so `chooseTowerPlan` almost never fires in real play. (P3's own acceptance
     * test passed because its fixture PRE-BANKS the bill — it proved the stamp path and could not
     * prove accumulation. That gap was the defect.)
     *
     * Five attempts at a gate here, each killed by evidence:
     *   1. gate PULL while any blueprint is unaffordable → permanent: six blueprints, one always is;
     *   2. gate BUILD while the shortfall is small → never fired: the shortfall sat at 4 (the FULL
     *      bill) for three sim-minutes;
     *   3. a "no gatherer ⇒ do not save" guard → DEAD CODE, `START_GAME` grants every seat one;
     *   4. gate BUILD on a 7-in-10-second duty cycle, any reachable tower → still zero towers;
     *   5. and then the measurement that explains all four:
     *
     *        PEAK POOL over 180 sim-seconds = **1 shape**. Not 3, not 2 — one. bank ∪ porch held a
     *        single shape at its fullest moment, non-empty about half the ticks, while the bot placed
     *        16 primitives. Income is ~1 MIXED shape every 11 s and a bill wants 4 of ONE TYPE.
     *
     * No gate in this function can build a tower out of that. Holding for 7 s cannot stack a pool
     * whose next arrival is 11 s away; it would take a ~45-60 s hold plus gatherer type-matching that
     * actually honours `gathererOrders` for a bot seat. That is an ECONOMY change with a real
     * game-feel cost — a bot that saves for a minute looks passive — which makes it the owner's call,
     * not a Micro amendment's. Written down here instead of shipped as an inert gate, because an
     * inert gate is precisely the dead-code class this session has been fixing.
     */
    const sparkId = pickTargetSpark(world, me.avatarPos, cfg, rng, me.id);
    if (sparkId !== null) return { kind: 'BUILD', sparkId };
    // S138 P2 — nothing on my porch. If my gatherer has banked anything, pull one out onto the porch
    // (the shipped PULL_FROM_BANK client intent) and collect it on a later think. This is the whole
    // of a bot's supply now: gatherer -> bank -> porch -> place. It can no longer touch the quarry.
    /*
     * ⭐ S154 P3 — ORDER THE BILL. This is the half that turns "a bot builds a tower sometimes, by
     * luck" into "reliably": blueprint bills want 3-5 of ONE shape type, and a bot's gatherer has
     * always run `preferredType: null`, so the right shapes only ever arrived by chance. Since
     * `planBlueprintPayment` counts **bank ∪ own porch**, shapes queued and hauled here are still
     * spendable on a bill even while they sit waiting to be placed.
     *
     * ⛔ AND IT DELIBERATELY DOES NOT GATE THE PULL BELOW IT — the first version did, and two
     * shipped tests caught it immediately. The reasoning was that PULL drains the bank one shape at
     * a time to feed the next single placement, so the bank never reaches a bill. True, but the
     * gate I wrote was effectively PERMANENT: `chooseTowerOrder` returns the shortfall of the
     * cheapest blueprint the seat cannot afford, and with six blueprints in the registry there is
     * essentially always one of those — so the bot stopped pulling, stopped placing, and just sat
     * ordering. `botController.test.ts` went from "an IMBA bot places at least 3" to one primitive.
     *
     * Ordering costs nothing and starves nothing, and it is enough: the TOWER branch above fires the
     * moment `planBlueprintPayment` says the bill is met, and it is checked BEFORE the loose-shape
     * BUILD, so a bot holding a full bill raises the tower rather than fritters the shapes away.
     */
    const wanted = chooseTowerOrder(world, seat, cfg);
    if (wanted !== null) {
      const queued = world.gathererOrders.get(me.id) ?? [];
      if (!queued.includes(wanted)) return { kind: 'ORDER', sparkType: wanted };
    }
    if (bankCount(world.castleBanks, me.id) > 0) return { kind: 'PULL' };
  }

  return { kind: 'REST' };
}

/**
 * Pick the free spark to go collect. Smart bots take the nearest; sloppy
 * bots draw from the nearest few at random (visible indecision).
 *
 * ⛔ S138 P2 — SCOPED TO THE BOT'S OWN PORCH. Owner playtest, verbatim: *"the bots in vs bots mode
 * can still grab primitives with their cruisers (original sparks and not with their gatherers which
 * is not fair)"*. This used to scan ALL of `world.freeSparks`, i.e. the shared quarry, so a bot ran
 * two income channels at once: its gatherer hauling into its bank AND its avatar reaching into the
 * common pile. Now a bot may only collect shapes standing in its OWN porch slots — shapes its own
 * gatherer hauled and that it then pulled out of its own bank. The quarry is off-limits to a bot.
 *
 * ⭐ REPLAY-SAFE BY CONSTRUCTION: this function draws `rng()` exactly ONCE on the sloppy path and
 * ZERO times on the smart path, regardless of how many candidates there are. Narrowing the candidate
 * set therefore cannot shift the seeded replay stream — which is the property that made this change
 * safe to make at all.
 */
export function pickTargetSpark(
  world: World,
  from: Vec2,
  cfg: BotConfig,
  rng: () => number,
  seat: PlayerId,
): SparkId | null {
  const seatIndex = seat as unknown as number;
  const free: Array<{ id: SparkId; d: number }> = [];
  for (const s of world.freeSparks.values()) {
    if (s.state.kind !== 'Free') continue;
    // S138 P2 — own porch only, never the quarry.
    if (!isOwnPorchSpark(seatIndex, s.pos, world.layout)) continue;
    const dx = s.pos.x - from.x;
    const dy = s.pos.y - from.y;
    free.push({ id: s.id, d: dx * dx + dy * dy });
  }
  if (free.length === 0) return null;
  free.sort((a, b) => a.d - b.d);
  if (cfg.smartPlacement) return free[0].id;
  const k = Math.min(free.length, 5);
  return free[Math.floor(rng() * k)].id;
}

/**
 * Choose where the carried spark should be placed.
 *
 * No own prims yet → home anchor on this seat's radial sector, just outside
 * the spawner no-build zone. Otherwise grow the frontier: step GROWTH_STEP
 * away from the spawner center off an existing own prim (bond guaranteed by
 * the host re-pick within AUTO_BOND_RADIUS), with difficulty aim jitter.
 * Smart bots prefer low-bond prims (spreads the structure toward the
 * functional-bond complexity cap and resists single-sever amputation).
 *
 * Validation: inside canvas margins, outside the spawner zone, outside enemy
 * territory. Tries up to 8 candidate directions before falling back to the
 * home anchor (which itself falls back to a jittered legal point).
 */
export function chooseBuildPos(
  world: World,
  seat: PlayerId,
  totalSeats: number,
  cfg: BotConfig,
  rng: () => number,
): Vec2 {
  const own: Array<{ pos: Vec2; bonds: number }> = [];
  for (const prim of world.primitives.values()) {
    if (prim.placedBy === seat) own.push({ pos: prim.pos, bonds: prim.bonds.size });
  }

  if (own.length === 0) {
    const home = homeAnchor(seat, totalSeats, cfg, rng);
    if (isLegalBuildPos(home, seat, world)) return home;
    // Home blocked (enemy camped the sector) — rotate around the rim.
    for (let i = 1; i <= 8; i++) {
      const p = homeAnchor(seat, totalSeats, cfg, rng, (i * Math.PI) / 5);
      if (isLegalBuildPos(p, seat, world)) return p;
    }
    return home; // hard fallback: dispatch validation rejects, bot re-decides
  }

  // Growth: pick the source prim. Smart = fewest bonds (frontier); sloppy =
  // random own prim.
  let source: { pos: Vec2; bonds: number };
  if (cfg.smartPlacement) {
    source = own.reduce((a, b) => (b.bonds < a.bonds ? b : a));
  } else {
    source = own[Math.floor(rng() * own.length)];
  }

  // Preferred growth direction: away from the spawner (expands the sector).
  const baseAngle = Math.atan2(
    source.pos.y - SPAWNER_CENTER_Y,
    source.pos.x - SPAWNER_CENTER_X,
  );
  for (let i = 0; i < 8; i++) {
    // Spiral the probe: 0, ±0.7, ±1.4, ±2.1, π rad off the outward ray.
    const off = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 0.7;
    const ang = baseAngle + off;
    const candidate = jitter(
      {
        x: source.pos.x + Math.cos(ang) * GROWTH_STEP,
        y: source.pos.y + Math.sin(ang) * GROWTH_STEP,
      },
      cfg.aimJitterPx,
      rng,
    );
    if (isLegalBuildPos(candidate, seat, world)) return candidate;
  }
  // Everything blocked — restart the colony at the home anchor.
  return homeAnchor(seat, totalSeats, cfg, rng);
}

/** This seat's radial home anchor just outside the spawner rim (+ jitter). */
export function homeAnchor(
  seat: PlayerId,
  totalSeats: number,
  cfg: BotConfig,
  rng: () => number,
  extraAngle = 0,
): Vec2 {
  const angle = Math.PI + ((seat as number) / Math.max(1, totalSeats)) * 2 * Math.PI + extraAngle;
  const r = SPAWNER_RADIUS + HOME_ANCHOR_REACH;
  return jitter(
    {
      x: SPAWNER_CENTER_X + Math.cos(angle) * r,
      y: SPAWNER_CENTER_Y + Math.sin(angle) * r,
    },
    cfg.aimJitterPx,
    rng,
  );
}

/** Canvas-margin + spawner-zone + enemy-territory legality (mirror of the
 *  dispatch gates so a bot rarely wastes a trip on a doomed placement). */
export function isLegalBuildPos(pos: Vec2, seat: PlayerId, world: World): boolean {
  if (pos.x < EDGE_MARGIN || pos.x > CANVAS_WIDTH - EDGE_MARGIN) return false;
  if (pos.y < EDGE_MARGIN || pos.y > CANVAS_HEIGHT - EDGE_MARGIN) return false;
  const dx = pos.x - SPAWNER_CENTER_X;
  const dy = pos.y - SPAWNER_CENTER_Y;
  if (dx * dx + dy * dy < (SPAWNER_RADIUS + 10) * (SPAWNER_RADIUS + 10)) return false;
  // ⭐ S149 P1 — zone partition, not influence bubble (see placePrimitive.ts). A bot that used the
  // old bubble would happily walk into another player's half and have every placement refused.
  return canBuildNow(world, pos, seat);
}

/** Nearest bond NOT owned by `seat` (cross-color bonds are impossible, so a
 *  bond whose aId-prim has a different placer is hostile). */
export function nearestEnemyBond(
  world: World,
  seat: PlayerId,
  from: Vec2,
): { bondId: BondId; mid: Vec2 } | null {
  let best: { bondId: BondId; mid: Vec2; d: number } | null = null;
  for (const bond of world.bonds.values()) {
    const a = world.primitives.get(bond.aId);
    const b = world.primitives.get(bond.bId);
    if (a === undefined || b === undefined) continue;
    if (a.placedBy === seat || b.placedBy === seat) continue;
    const mid = { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 };
    const dx = mid.x - from.x;
    const dy = mid.y - from.y;
    const d = dx * dx + dy * dy;
    if (best === null || d < best.d) best = { bondId: bond.id, mid, d };
  }
  return best === null ? null : { bondId: best.bondId, mid: best.mid };
}

/**
 * S100 P1 (TD Phase 1a) — nearest connector bond of an ENEMY spawner's anchor component.
 * Iterates live spawners (host-authoritative); for each one owned by a different seat,
 * walks the CURRENT connected component of its anchor primitive and considers every bond
 * whose BOTH endpoints lie inside that component (the recipe's connectors). Returns the
 * nearest such bond's id + midpoint, or null when no enemy spawner exists (→ the caller
 * falls back to the generic nearest-enemy-bond). Severing any one connector drops the
 * pentagram below the recipe shape, tearing the spawner down on the next re-validation.
 *
 * Deterministic: spawners iterate in Map (insertion = SpawnerId mint) order; the nearest
 * bond wins, ties broken by the first-seen (so by spawner order then component-walk order)
 * — the bot's avatar-distance is the only ranking key, identical across same-seed runs.
 */
export function nearestEnemySpawnerBond(
  world: World,
  seat: PlayerId,
  from: Vec2,
): { bondId: BondId; mid: Vec2 } | null {
  let best: { bondId: BondId; mid: Vec2; d: number } | null = null;
  for (const sp of world.creatureSpawners.values()) {
    if (sp.ownerPlayerId === seat) continue; // only raid ENEMY spawners
    const anchor = world.primitives.get(sp.anchorPrimitiveId);
    if (anchor === undefined) continue; // stale anchor (poll will tear it down)
    const comp = componentOf(anchor, world.primitives, world.bonds);
    for (const bondId of comp.bondIds) {
      const bond = world.bonds.get(bondId);
      if (bond === undefined) continue;
      // Connector = a bond internal to the component (both endpoints in the ring).
      if (!comp.primitiveIds.has(bond.aId) || !comp.primitiveIds.has(bond.bId)) continue;
      const a = world.primitives.get(bond.aId);
      const b = world.primitives.get(bond.bId);
      if (a === undefined || b === undefined) continue;
      const mid = { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 };
      const dx = mid.x - from.x;
      const dy = mid.y - from.y;
      const d = dx * dx + dy * dy;
      if (best === null || d < best.d) best = { bondId: bond.id, mid, d };
    }
  }
  return best === null ? null : { bondId: best.bondId, mid: best.mid };
}

/**
 * S100 P1 (TD Phase 1a) — nearest CHEWER position within CHEWER_AVOID_RADIUS of a point,
 * or null. Only chewers (sourceSpawnerId !== null) — a Voltkin isn't a swarm threat. Used
 * by the light chewer-avoid in chooseGoal. Deterministic: nearest wins, Map-order tie-break.
 */
export function nearestChewer(world: World, from: Vec2): Vec2 | null {
  let best: { pos: Vec2; d: number } | null = null;
  for (const c of world.creatures.values()) {
    if (c.sourceSpawnerId === null) continue; // Voltkin — not a chew-swarm threat
    const dx = c.pos.x - from.x;
    const dy = c.pos.y - from.y;
    const d = dx * dx + dy * dy;
    if (d > CHEWER_AVOID_RADIUS_SQ) continue;
    if (best === null || d < best.d) best = { pos: c.pos, d };
  }
  return best === null ? null : { x: best.pos.x, y: best.pos.y };
}

/** Nearest enemy primitive to a point (potato delivery target). */
export function nearestEnemyPrim(
  world: World,
  seat: PlayerId,
  from: Vec2,
): { pos: Vec2 } | null {
  let best: { pos: Vec2; d: number } | null = null;
  for (const prim of world.primitives.values()) {
    if (prim.placedBy === seat) continue;
    const dx = prim.pos.x - from.x;
    const dy = prim.pos.y - from.y;
    const d = dx * dx + dy * dy;
    if (best === null || d < best.d) best = { pos: prim.pos, d };
  }
  return best === null ? null : { pos: { x: best.pos.x, y: best.pos.y } };
}

/** Run directly away from the hunter, clamped to canvas margins. */
export function fleePoint(me: Vec2, hunter: Vec2): Vec2 {
  let dx = me.x - hunter.x;
  let dy = me.y - hunter.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    dx = 1;
    dy = 0;
  } else {
    dx /= len;
    dy /= len;
  }
  return {
    x: Math.min(CANVAS_WIDTH - EDGE_MARGIN, Math.max(EDGE_MARGIN, me.x + dx * FLEE_HOP)),
    y: Math.min(CANVAS_HEIGHT - EDGE_MARGIN, Math.max(EDGE_MARGIN, me.y + dy * FLEE_HOP)),
  };
}

function jitter(pos: Vec2, amplitude: number, rng: () => number): Vec2 {
  if (amplitude <= 0) return { x: pos.x, y: pos.y };
  return {
    x: pos.x + (rng() * 2 - 1) * amplitude,
    y: pos.y + (rng() * 2 - 1) * amplitude,
  };
}
