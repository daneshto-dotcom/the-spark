/**
 * SPARK — S75 P3 rainbow color-shuffle lifecycle reducers.
 *
 * Mirrors the bomb lifecycle shape: pure case-body helpers consumed by world.ts dispatch.
 *   SPAWN_RAINBOW     (host-internal; spawner cadence) — mint a rainbow in the spawn zone.
 *   TRIGGER_RAINBOW   (client INTENT) — any player clicking the rainbow runs an INSTANT global
 *                     colour-shuffle: a seeded DERANGEMENT permutation of the 6-colour palette is
 *                     applied to every player.color + every primitive.placerColor/ownerColor, so
 *                     every player (and their whole structure empire) gets a NEW, UNIQUE colour.
 *   DISSIPATE_RAINBOW (host-internal; TTL poll) — remove an un-clicked rainbow harmlessly.
 *
 * Determinism (Council DR4/DR7): the permutation is drawn from an EPHEMERAL mulberry32 seeded
 * from (world.rngSeed, world.tick) — stateless w.r.t. the world (no stored RNG), replay-safe
 * (same seed+tick => same shuffle), and NO perturbation of the spark/bomb/potato streams. The
 * remap is a per-field BIJECTION (order-independent). Host-authoritative; clients receive the
 * recoloured player/prim state in the next NetSnapshot (already-serialized colour fields).
 *
 * Completeness (Council DR8 — completeness IS determinism): territory + cross-colour bond
 * segregation + disruptionManager all read player.color / prim.placerColor LIVE, so remapping
 * those keeps them coherent; creatureAI now reads the owner's LIVE colour too (was the static
 * palette). The S60 fog-ghost remembered colour (exploredMemory) is client RENDER memory, not
 * authoritative state, so a briefly-stale ghost colour until re-scout is cosmetic-by-design.
 */

import { PLAYER_COLORS, RAINBOW_DERANGEMENT_MAX_REROLLS } from '../constants.ts';
import { mulberry32, type Rng } from './rng.ts';
import { asRainbowId, type PlayerId, type RainbowId, type Vec2 } from '../types.ts';
import { makeRainbow } from './rainbow.ts';
import type { World } from './worldTypes.ts';

/** Action shapes — exported so world.ts can compose GameAction. */
export interface SpawnRainbowAction {
  readonly type: 'SPAWN_RAINBOW';
  readonly pos: Vec2;
}
export interface TriggerRainbowAction {
  readonly type: 'TRIGGER_RAINBOW';
  readonly rainbowId: RainbowId;
  /** The clicking player — informational (the shuffle is global, owner-agnostic). */
  readonly playerId: PlayerId;
}
export interface DissipateRainbowAction {
  readonly type: 'DISSIPATE_RAINBOW';
  readonly rainbowId: RainbowId;
}

/** Host-only: mint a rainbow at the spawner-chosen position. */
export function applySpawnRainbow(world: World, action: SpawnRainbowAction): World {
  const id = asRainbowId(world.nextRainbowId++);
  world.rainbows.set(id, makeRainbow({ id, pos: action.pos, spawnedAtTick: world.tick }));
  return world;
}

/**
 * Build a colour-remap (oldColor -> newColor) that is a BIJECTION on PLAYER_COLORS (so the
 * assignment is unique — no two players ever collide) AND a DERANGEMENT over `activeColors`
 * (no colour currently held by a player maps to itself, so everyone visibly switches). Driven
 * by `rng` (Fisher-Yates); bounded re-roll (a fixed point is rare for <=6 colours); falls back
 * to the last still-UNIQUE permutation if no derangement is found within the cap. Uniqueness —
 * the user's HARD constraint ("any 2 players can't have the same colour") — ALWAYS holds (it's
 * a permutation); the visible-change guarantee is best-effort (Council DR5 synthesis).
 */
// S94 BUGFIX — the rainbow derangement permutes only the 6 HUMAN colours. PLAYER_COLORS[6] is
// the bots-only Silver (0xc0c8d0, near-white); including it let a human get deranged INTO Silver
// and read as "stuck white" after a rainbow (and a poop-foul on that structure then reverts to
// the same Silver). Excluding it: humans shuffle among the 6 real colours, and a Silver bot's
// colour isn't in the map so the `?? p.color` fallback leaves it unchanged. MAX_PLAYERS=6.
const SHUFFLE_PALETTE = PLAYER_COLORS.slice(0, 6);

export function buildShuffleColorMap(rng: Rng, activeColors: ReadonlySet<number>): Map<number, number> {
  const n = SHUFFLE_PALETTE.length;
  let perm: number[] = [];
  for (let attempt = 0; attempt <= RAINBOW_DERANGEMENT_MAX_REROLLS; attempt++) {
    perm = Array.from({ length: n }, (_, i) => i);
    // Fisher-Yates shuffle (rng draws are deterministic from the ephemeral seed).
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    let deranged = true;
    for (let i = 0; i < n; i++) {
      if (perm[i] === i && activeColors.has(SHUFFLE_PALETTE[i])) {
        deranged = false;
        break;
      }
    }
    if (deranged) break;
  }
  const map = new Map<number, number>();
  for (let i = 0; i < n; i++) map.set(SHUFFLE_PALETTE[i], SHUFFLE_PALETTE[perm[i]]);
  return map;
}

/**
 * INSTANT global colour-shuffle. Idempotent: a missing rainbow (already triggered this tick by
 * another click, or dissipated) no-ops. Remaps every player.color + every primitive's
 * placerColor/ownerColor through ONE bijective derangement map, so each player's whole empire
 * shifts to a single new unique colour and territory / bond-segregation stay coherent.
 */
export function applyTriggerRainbow(world: World, action: TriggerRainbowAction): World {
  const rainbow = world.rainbows.get(action.rainbowId);
  if (rainbow === undefined) return world; // already triggered / dissipated (first-click-wins)
  world.rainbows.delete(action.rainbowId);
  // S84 P2 — stamp the switch tick: every peer's flyover celebration + yell key off
  // this synced field (see worldTypes docblock). Overwrite-on-retrigger = restart.
  world.rainbowSwitchTick = world.tick;

  // Active colours = those currently held by a player (the set the derangement must move).
  const activeColors = new Set<number>();
  for (const p of world.players.values()) activeColors.add(p.color);

  // Ephemeral, deterministic-per-(seed,tick) stream — no stored RNG; zero spark/bomb/potato drift.
  const rng = mulberry32((world.rngSeed ^ Math.imul(world.tick, 2654435761)) >>> 0);
  const colorMap = buildShuffleColorMap(rng, activeColors);

  // Per-field bijective remap (order-independent). player.color is the identity; prim placer/owner
  // colours follow so territory + cross-colour bond segregation (which read these LIVE) stay coherent.
  for (const p of world.players.values()) {
    p.color = colorMap.get(p.color) ?? p.color;
  }
  for (const prim of world.primitives.values()) {
    prim.placerColor = colorMap.get(prim.placerColor) ?? prim.placerColor;
    prim.ownerColor = colorMap.get(prim.ownerColor) ?? prim.ownerColor;
  }
  return world;
}

/** Host-only: remove an un-clicked rainbow when its TTL elapses (harmless; no shuffle). */
export function applyDissipateRainbow(world: World, action: DissipateRainbowAction): World {
  world.rainbows.delete(action.rainbowId);
  return world;
}

/**
 * Teardown — clear all rainbow state. Called on PLAYING -> WIN (WIN_TRIGGER) and (inline) on
 * RETURN_TO_TITLE / START_GAME so no rainbow persists across matches (mirror of the other hazards).
 */
export function teardownRainbows(world: World): void {
  world.rainbows.clear();
  world.nextRainbowId = 0;
}
