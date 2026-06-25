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
import { snapshot } from '../save.ts';

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

    expect(world.creatureSpawners.size).toBe(1);
    const sp = [...world.creatureSpawners.values()][0];
    expect(sp.ownerPlayerId).toBe(asPlayerId(1)); // the bot seat, not the human
    expect(sp.recipeId).toBe('pentagram');
    // The seeded ring is a REAL pentagram (re-validation keeps the spawner alive until raided).
    expect(isPentagramComponent(world, sp.anchorPrimitiveId)).toBe(true);

    // The ring is 5 Triangles placed by the bot seat.
    const botPrims = [...world.primitives.values()].filter((p) => p.placedBy === asPlayerId(1));
    expect(botPrims.length).toBe(5);
    expect(botPrims.every((p) => p.type === SparkType.Triangle)).toBe(true);
    expect(botPrims.every((p) => p.bonds.size === 2)).toBe(true); // closed 5-cycle ⇒ degree 2 each
  });

  it('seeds one spawner per bot in a multi-bot match', () => {
    const world = makeWorld(0xb0a7);
    startBots(world, 3);
    expect(world.creatureSpawners.size).toBe(3);
    // Each spawner is owned by a distinct bot seat (1,2,3).
    const owners = [...world.creatureSpawners.values()].map((s) => s.ownerPlayerId as unknown as number).sort();
    expect(owners).toEqual([1, 2, 3]);
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
