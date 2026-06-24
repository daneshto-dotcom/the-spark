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
import { isInsideEnemyTerritory } from '../state/territory.ts';
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
  | { readonly kind: 'REST' };

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

  // 7 — BUILD: the bread and butter. Idle-only: claiming while Carrying
  // throws carry-1 (the controller self-heals that state before thinking,
  // but the brain must never PROPOSE it).
  if (buildReady && me.kind === 'Idle' && me.carriedPotatoId === undefined) {
    const sparkId = pickTargetSpark(world, me.avatarPos, cfg, rng);
    if (sparkId !== null) return { kind: 'BUILD', sparkId };
  }

  return { kind: 'REST' };
}

/**
 * Pick the free spark to go collect. Smart bots take the nearest; sloppy
 * bots draw from the nearest few at random (visible indecision).
 */
export function pickTargetSpark(
  world: World,
  from: Vec2,
  cfg: BotConfig,
  rng: () => number,
): SparkId | null {
  const free: Array<{ id: SparkId; d: number }> = [];
  for (const s of world.freeSparks.values()) {
    if (s.state.kind !== 'Free') continue;
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
  return !isInsideEnemyTerritory(pos, seat, world);
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
