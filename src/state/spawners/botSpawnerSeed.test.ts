/**
 * SPARK — S104 P2: host-seeded bot chewer-spawner tests.
 *
 * Proves the vs-bots TD playability fix: at 'bots' match start the host places ONE valid pentagram
 * + spawner per bot seat (so the player's turret/HELGA/Voltkin have enemy chewers to shoot), it is
 * mode-gated, and it is fully DETERMINISTIC (pure seat-angle math, no RNG — two same-seed starts are
 * byte-identical, the determinism HARD gate the Council required for this new sim-affecting seed).
 */

import { describe, it, expect } from 'vitest';
import { PLAYER_COLORS, SparkType } from '../../constants.ts';
import { asPlayerId } from '../../types.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { isPentagramComponent } from '../godlyRecipes/pentagram.ts';
import { isLightningHubComponent } from '../godlyRecipes/lightningHub.ts';
import { snapshot } from '../save.ts';
import {
  collectSpawnerLockedPrimitiveIds,
  collectHostMergeCandidates,
  pickHostTargetPrimitive,
} from '../placePrimitive.ts';

function startBots(world: World, botCount: number): void {
  const total = botCount + 1; // seat 0 = the human, seats 1..botCount = bots
  const roster = Array.from({ length: total }, (_, seat) => ({ seat, color: PLAYER_COLORS[seat] }));
  const botSeats = Array.from({ length: botCount }, (_, i) => i + 1);
  dispatch(world, { type: 'START_GAME', mode: 'bots', isHost: true, roster, botSeats });
}

describe('S104 P2 — host-seeded bot chewer-spawner', () => {
  it('seeds exactly one VALID pentagram spawner per bot seat, owned by the bot', () => {
    const world = makeWorld(0xb0a7);
    startBots(world, 1);

    // S113 Batch C — each bot seat now ALSO gets a lightning-hub spawner, so 2 spawners per bot.
    expect(world.creatureSpawners.size).toBe(2);
    const sp = [...world.creatureSpawners.values()].find((s) => s.recipeId === 'pentagram')!;
    expect(sp.ownerPlayerId).toBe(asPlayerId(1)); // the bot seat, not the human
    expect(sp.recipeId).toBe('pentagram');
    // The seeded ring is a REAL pentagram (re-validation keeps the spawner alive until raided).
    expect(isPentagramComponent(world, sp.anchorPrimitiveId)).toBe(true);

    // The ring is 5 Triangles placed by the bot seat (the lightning-hub's Dot+Circles filtered out).
    const ringPrims = [...world.primitives.values()].filter(
      (p) => p.placedBy === asPlayerId(1) && p.type === SparkType.Triangle,
    );
    expect(ringPrims.length).toBe(5);
    expect(ringPrims.every((p) => p.bonds.size === 2)).toBe(true); // closed 5-cycle ⇒ degree 2 each
  });

  it('S113 — also seeds one VALID lightning-hub spawner per bot seat (1 Dot deg-5 + 5 Circle leaves)', () => {
    const world = makeWorld(0xb0a7);
    startBots(world, 1);
    const hub = [...world.creatureSpawners.values()].find((s) => s.recipeId === 'lightningHub')!;
    expect(hub).toBeDefined();
    expect(hub.ownerPlayerId).toBe(asPlayerId(1));
    expect(isLightningHubComponent(world, hub.anchorPrimitiveId)).toBe(true);
    // The hub anchor is the Dot (degree 5); the 5 leaves are Circles (degree 1).
    const dot = world.primitives.get(hub.anchorPrimitiveId)!;
    expect(dot.type).toBe(SparkType.Dot);
    expect(dot.bonds.size).toBe(5);
    const circles = [...world.primitives.values()].filter(
      (p) => p.placedBy === asPlayerId(1) && p.type === SparkType.Circle,
    );
    expect(circles.length).toBe(5);
    expect(circles.every((p) => p.bonds.size === 1)).toBe(true);
  });

  it('seeds one spawner per bot in a multi-bot match', () => {
    const world = makeWorld(0xb0a7);
    startBots(world, 3);
    // S113 Batch C — 2 spawners per bot (pentagram + lightning-hub) = 6 for 3 bots.
    expect(world.creatureSpawners.size).toBe(6);
    const pentagrams = [...world.creatureSpawners.values()].filter((s) => s.recipeId === 'pentagram');
    const hubs = [...world.creatureSpawners.values()].filter((s) => s.recipeId === 'lightningHub');
    expect(pentagrams.map((s) => s.ownerPlayerId as unknown as number).sort()).toEqual([1, 2, 3]);
    expect(hubs.map((s) => s.ownerPlayerId as unknown as number).sort()).toEqual([1, 2, 3]);
  });

  it('does NOT seed in solo or 1v1', () => {
    const solo = makeWorld(0x501);
    dispatch(solo, { type: 'START_GAME', mode: 'solo', isHost: true });
    expect(solo.creatureSpawners.size).toBe(0);
    expect(solo.primitives.size).toBe(0);

    const duel = makeWorld(0x111);
    dispatch(duel, { type: 'START_GAME', mode: '1v1', isHost: true });
    expect(duel.creatureSpawners.size).toBe(0);
    expect(duel.primitives.size).toBe(0);
  });

  it('is deterministic — two same-seed bots starts are byte-identical (HARD gate)', () => {
    // snapshot() stamps a wall-clock savedAt; strip it so the compare is over deterministic state only.
    const detJson = (w: World): string => {
      const s = snapshot(w) as { savedAt?: string };
      delete s.savedAt;
      return JSON.stringify(s);
    };
    const wA = makeWorld(0xdeadbee);
    startBots(wA, 2);
    const wB = makeWorld(0xdeadbee);
    startBots(wB, 2);
    expect(detJson(wA)).toBe(detJson(wB));
  });
});

describe('S107 P4 — the seeded bot pentagram is protected from auto-bond self-break', () => {
  it('collectSpawnerLockedPrimitiveIds returns exactly the 5 seeded ring nodes', () => {
    const world = makeWorld(0xb0a7);
    startBots(world, 1);
    const locked = collectSpawnerLockedPrimitiveIds(world);
    // The pentagram ring nodes (5 Triangles).
    const ringIds = [...world.primitives.values()]
      .filter((p) => p.placedBy === asPlayerId(1) && p.type === SparkType.Triangle)
      .map((p) => p.id);
    expect(ringIds.length).toBe(5);
    // S113 Batch C — BOTH structures are registered spawners, so the locked set = 5 ring Triangles
    // + 6 hub nodes (1 Dot + 5 Circles) = 11. Every pentagram ring node is still locked (protection holds).
    expect(locked.size).toBe(11);
    for (const id of ringIds) expect(locked.has(id)).toBe(true);
  });

  it('auto-bond EXCLUDES the ring nodes (which WOULD be in range without the lock) — degree stays 2', () => {
    const world = makeWorld(0xb0a7);
    startBots(world, 1);
    const ring = [...world.primitives.values()].filter(
      (p) => p.placedBy === asPlayerId(1) && p.type === SparkType.Triangle,
    );
    const botColor = ring[0].placerColor; // the ring is the bot's own colour (same-colour bonds)
    // A build point 2px off a ring node — the worst case: well inside AUTO_BOND_RADIUS (60)
    // and MERGE_REACH_RADIUS (100). This is exactly what the bot frontier hits.
    const near = { x: ring[0].pos.x + 2, y: ring[0].pos.y + 2 };

    // SIGNAL CHECK — with NO lock, the same-colour ring node IS a candidate in range
    // (so the test has real signal: this is the bond that used to self-break the spawner).
    const unguardedMerge = collectHostMergeCandidates(world, near, botColor, new Set());
    expect(unguardedMerge.length).toBeGreaterThan(0);
    expect(pickHostTargetPrimitive(world, near, botColor, new Set())).not.toBeNull();

    // FIX — the default spawner-locked exclusion drops every ring node from auto-bond
    // candidacy: no primary target, no merge candidate, so the ring keeps degree 2.
    expect(collectHostMergeCandidates(world, near, botColor)).toHaveLength(0);
    expect(pickHostTargetPrimitive(world, near, botColor)).toBeNull();

    // The ring is still a valid pentagram (untouched), and degree-2 is intact.
    const sp = [...world.creatureSpawners.values()][0];
    expect(isPentagramComponent(world, sp.anchorPrimitiveId)).toBe(true);
    expect(ring.every((p) => p.bonds.size === 2)).toBe(true);
  });
});
