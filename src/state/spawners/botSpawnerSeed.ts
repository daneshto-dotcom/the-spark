/**
 * SPARK — S104 P2: host-seeded bot chewer-spawner (vs-bots TD playability).
 *
 * THE PROBLEM (owner playtest #1): "I tried the turret on vs-bots and it didn't work." A defender
 * (laser turret / HELGA / Voltkin zap) only targets ENEMY creatures — but the bot brain never
 * builds a chewer spawner, so in vs-bots there are ZERO enemy chewers and a player's turret has
 * nothing to shoot.
 *
 * THE FIX (Council S104 M9 — chosen over teaching the bot a scripted multi-place pentagram builder):
 * at vs-bots match start the HOST deterministically PLACES one real 5-triangle pentagram ring per bot
 * seat and registers a spawner over it, via PURE seat-angle math — ZERO bot-RNG draws, so the bot's
 * single shared mulberry32 stream is untouched (no draw-order surgery, no vs-bots replay-baseline
 * churn from the bot AI). The existing spawner substrate then mints the bot's chewers on the normal
 * 15s cadence; the player's turret/HELGA/Voltkin now have live enemy targets and visibly work.
 *
 * It must place a REAL pentagram (5 triangles, each bonded to exactly 2 neighbours = a closed
 * 5-cycle) because the spawner's re-validation (spawnerLifecycle.recipeStillSatisfied →
 * isPentagramComponent) tears the spawner down if the exact shape isn't present — which is also the
 * COUNTERPLAY: the player can raid (sever) any one connector to break the ring and stop the swarm.
 *
 * Determinism: positions are pure fns of (seat, playerCount); ids are allocated sequentially from
 * world.nextPrimitiveId / nextBondId; no RNG, no wall-clock. Two same-seed vs-bots runs stay
 * byte-identical (the runBotSpawnerSeedStress HARD gate proves it). Host-authoritative — this runs
 * in the START_GAME reducer (bots mode is host-only; clients receive the ring + spawner via snapshot).
 */

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  SparkType,
} from '../../constants.ts';
import { asBondId, asPrimitiveId, type PlayerId, type PrimitiveId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import type { World } from '../world.ts';
import { applyRegisterSpawner } from './spawnerLifecycle.ts';

// S113 Batch C — bot lightning-hub seed geometry (1 Dot hub + 5 Circle leaves = isLightningHubComponent).
const HUB_LEAVES = 5;
const HUB_R = 36; // leaf ring radius (px) — leaves bonded only to the hub (degree-1 leaves; hub degree 5)
const HUB_DOT_RADIUS = 4;
const HUB_CIRCLE_RADIUS = 9;
// Placed in a SEPARATE sector from the pentagram: closer in (+150 vs the pentagram's +240) AND an
// angular offset, so the two host-placed structures never sit within AUTO_BOND_RADIUS of each other.
const LIGHTNING_HUB_REACH = SPAWNER_RADIUS + 150;
const LIGHTNING_HUB_ANGLE_OFFSET = 0.6; // rad

const RING_SIZE = 5; // a pentagram is exactly 5 triangles (isPentagramComponent gate)
const RING_R = 40; // ring radius (px) — triangles spaced so they don't overlap (radius 8 each)
/** Distance from arena centre to a bot's pentagram, out in its radial sector (clamped to canvas).
 *  Beyond the bot's home-anchor build seed (SPAWNER_RADIUS + ~90) so the bot grows outward roughly
 *  toward it rather than starting on top of it. NOTE (S107 P4): the bot used to SELF-BREAK this ring
 *  — its frontier would grow within AUTO_BOND_RADIUS of a node and auto-merge in, raising the node's
 *  degree above the pentagram recipe's exact-2 → the next re-validation poll tore the spawner down.
 *  FIXED at the auto-bond layer instead of by distance: placePrimitive now excludes any live spawner's
 *  locked-ring nodes from auto-bond candidacy (collectSpawnerLockedPrimitiveIds), so the ring stays
 *  degree-2 regardless of how close the bot builds. Kept at +240 (NOT relocated farther) precisely so
 *  the ring stays reachable for the player's raid counterplay (explicit sever still breaks it). */
const PENTAGRAM_REACH = SPAWNER_RADIUS + 240;
const TRIANGLE_RADIUS = 8;
const EDGE_MARGIN = 80;

/**
 * Seed one chewer-spawner per bot seat. No-op unless this is a 'bots' match with ≥1 bot seat.
 * Called from applyStartGame AFTER seating (players must exist so the owner colour resolves).
 */
export function seedBotSpawners(world: World): void {
  if (world.gameMode !== 'bots' || world.botSeats.size === 0) return;
  const total = world.players.size;
  // Deterministic seat order (botSeats is a Set; sort so the pass order is stable across runs).
  const seats = [...world.botSeats].sort((a, b) => (a as number) - (b as number));
  for (const seat of seats) {
    const player = world.players.get(seat);
    if (player === undefined) continue;
    const color = player.color; // = PLAYER_COLORS[seat]; the ring is the bot's own colour (same-colour bonds)

    // Pentagram centre in the bot's radial sector (matches radialSpawnPos's seat angle), clamped on-canvas.
    const angle = Math.PI + ((seat as number) / Math.max(1, total)) * 2 * Math.PI;
    const cx = clamp(SPAWNER_CENTER_X + Math.cos(angle) * PENTAGRAM_REACH, EDGE_MARGIN, CANVAS_WIDTH - EDGE_MARGIN);
    const cy = clamp(SPAWNER_CENTER_Y + Math.sin(angle) * PENTAGRAM_REACH, EDGE_MARGIN, CANVAS_HEIGHT - EDGE_MARGIN);

    // Place 5 triangles in a ring.
    const ids: PrimitiveId[] = [];
    for (let i = 0; i < RING_SIZE; i++) {
      const a = (i / RING_SIZE) * Math.PI * 2;
      const px = cx + Math.cos(a) * RING_R;
      const py = cy + Math.sin(a) * RING_R;
      const id = asPrimitiveId(world.nextPrimitiveId++);
      const prim: Primitive = {
        id,
        type: SparkType.Triangle,
        placerColor: color,
        placedBy: seat,
        createdTick: world.tick,
        pos: { x: px, y: py },
        prevPos: { x: px, y: py },
        bonds: new Set(),
        ownerColor: color,
        lastOwnershipChange: world.tick,
        radius: TRIANGLE_RADIUS,
      };
      world.primitives.set(id, prim);
      ids.push(id);
    }

    // Bond consecutive triangles into a CLOSED 5-cycle (each node ends at degree exactly 2).
    for (let i = 0; i < RING_SIZE; i++) {
      const aPrim = world.primitives.get(ids[i])!;
      const bPrim = world.primitives.get(ids[(i + 1) % RING_SIZE])!;
      const restLength = Math.hypot(bPrim.pos.x - aPrim.pos.x, bPrim.pos.y - aPrim.pos.y);
      const bondId = asBondId(world.nextBondId++);
      const bond: Bond = {
        id: bondId,
        aId: aPrim.id,
        bId: bPrim.id,
        a: aPrim,
        b: bPrim,
        restLength,
        stiffnessTier: 'MID',
        createdTick: world.tick,
      };
      world.bonds.set(bondId, bond);
      aPrim.bonds.add(bondId);
      bPrim.bonds.add(bondId);
    }

    // Register the spawner over the ring's anchor (the lowest PrimitiveId = ids[0], the first placed).
    const anchor = ids.reduce((m, x) => ((x as number) < (m as number) ? x : m), ids[0]);
    applyRegisterSpawner(world, {
      type: 'REGISTER_SPAWNER',
      ownerPlayerId: seat,
      anchorPrimitiveId: anchor,
      recipeId: 'pentagram',
    });

    // S113 Batch C — also seed a lightning-DRONE hub per bot seat (owner decision #9: host-seed the
    // proven path) so the owner SEES drones fly at them in vs-bots (their main test mode). It emits 3
    // drones then self-destructs — a one-time demo burst, distinct from the persistent chewer ring.
    seedOneLightningHub(world, seat, color, total);
  }
}

/**
 * S113 Batch C — place ONE lightning-hub (1 Dot hub of degree 5 + 5 Circle leaves) for a bot seat and
 * register a lightningHub spawner over the Dot. Pure seat-angle math (no RNG), in a separate sector
 * from the bot's pentagram. The Dot is the anchor (isLightningHubComponent re-validates from it).
 */
function seedOneLightningHub(world: World, seat: PlayerId, color: number, total: number): void {
  const angle =
    Math.PI + ((seat as number) / Math.max(1, total)) * 2 * Math.PI + LIGHTNING_HUB_ANGLE_OFFSET;
  const cx = clamp(SPAWNER_CENTER_X + Math.cos(angle) * LIGHTNING_HUB_REACH, EDGE_MARGIN, CANVAS_WIDTH - EDGE_MARGIN);
  const cy = clamp(SPAWNER_CENTER_Y + Math.sin(angle) * LIGHTNING_HUB_REACH, EDGE_MARGIN, CANVAS_HEIGHT - EDGE_MARGIN);

  // Centre Dot hub (will end at bond-degree HUB_LEAVES = 5).
  const hubId = asPrimitiveId(world.nextPrimitiveId++);
  const hub: Primitive = {
    id: hubId,
    type: SparkType.Dot,
    placerColor: color,
    placedBy: seat,
    createdTick: world.tick,
    pos: { x: cx, y: cy },
    prevPos: { x: cx, y: cy },
    bonds: new Set(),
    ownerColor: color,
    lastOwnershipChange: world.tick,
    radius: HUB_DOT_RADIUS,
  };
  world.primitives.set(hubId, hub);

  // 5 Circle leaves around the hub, each bonded ONLY to the hub (degree-1 leaf; hub ends degree 5).
  for (let i = 0; i < HUB_LEAVES; i++) {
    const a = (i / HUB_LEAVES) * Math.PI * 2;
    const px = cx + Math.cos(a) * HUB_R;
    const py = cy + Math.sin(a) * HUB_R;
    const leafId = asPrimitiveId(world.nextPrimitiveId++);
    const leaf: Primitive = {
      id: leafId,
      type: SparkType.Circle,
      placerColor: color,
      placedBy: seat,
      createdTick: world.tick,
      pos: { x: px, y: py },
      prevPos: { x: px, y: py },
      bonds: new Set(),
      ownerColor: color,
      lastOwnershipChange: world.tick,
      radius: HUB_CIRCLE_RADIUS,
    };
    world.primitives.set(leafId, leaf);
    const restLength = Math.hypot(px - cx, py - cy);
    const bondId = asBondId(world.nextBondId++);
    const bond: Bond = {
      id: bondId,
      aId: hubId,
      bId: leafId,
      a: hub,
      b: leaf,
      restLength,
      stiffnessTier: 'MID',
      createdTick: world.tick,
    };
    world.bonds.set(bondId, bond);
    hub.bonds.add(bondId);
    leaf.bonds.add(bondId);
  }

  applyRegisterSpawner(world, {
    type: 'REGISTER_SPAWNER',
    ownerPlayerId: seat,
    anchorPrimitiveId: hubId,
    recipeId: 'lightningHub',
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
