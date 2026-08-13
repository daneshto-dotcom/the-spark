/**
 * SPARK — S142 P1: THE SPAWNER CADENCE ROUND-TRIP CONTRACT.
 *
 * WHY THIS FILE EXISTS.
 * `deserializeSpawner` used to re-seed a spawner's cadence UNCONDITIONALLY —
 * `nextSpawnTick = tick + SPAWN_INTERVAL_TICKS`, `ignitedAtTick = tick`, `spawnedCount = 0`
 * — because `serializeSpawner` emitted only the four readonly identity fields. Its docblock
 * defended that with "a host save/load can't desync because every peer re-derives the
 * cadence identically; the next NetSnapshot re-syncs anyway."
 *
 * BOTH HALVES OF THAT DEFENCE FAIL ON THE SIM-WORKER INIT PATH:
 *   • only ONE side re-derives — `makeWorkerSim` runs `restore()` while the main thread
 *     keeps its ORIGINAL spawner objects; and
 *   • in solo / VS-BOTS there is no NetSnapshot at all, so nothing ever re-syncs it.
 *
 * And it is REACHABLE MID-MATCH: host-migration TAKEOVER sets `world.isHost = true` on a
 * peer that was a client (so its `simWorkerDriver` is null), after which the very next
 * frame satisfies every worker-adoption condition and adopts with LIVE spawners.
 * `spawnedCount` is NOT telemetry — `hostTick` self-destructs a structure spawner at
 * `STRUCTURE_SELFDESTRUCT_DRONE_COUNT` — so the reset silently granted the promoted host a
 * FRESH self-destruct lifetime.
 *
 * NOTHING AT RUNTIME COULD SEE IT: spawners are absent from `NARROW_HASHED_FAMILIES` (the
 * only hash compared at runtime), and a hash mismatch merely increments a counter while the
 * worker stays authoritative. That silence is why this needs an explicit contract test.
 *
 * ⚠ THE CONSTRAINT THAT MAKES THE OBVIOUS FIX WRONG. "Just serialize the fields" leaks the
 * upcoming spawn schedule to a modified client — the rngSeed-exclusion precedent
 * (TOWER_DEFENSE_DESIGN.md §3.3). So cadence rides the LOCAL paths (disk save, worker INIT)
 * and is stripped from the wire by `trimMirrorSpawner`. The wire half of this contract is
 * asserted in `save.replay.test.ts`; this file owns the round-trip half.
 */
import { describe, expect, it } from 'vitest';
import { restore, snapshot } from '../save.ts';
import { makeSpawner } from './spawner.ts';
import { makeWorld } from '../world.ts';
import { asPlayerId, asPrimitiveId, asSpawnerId } from '../../types.ts';
import { SPAWN_INTERVAL_TICKS } from '../../constants.ts';

const P0 = asPlayerId(0);

/** A world holding one spawner that is demonstrably MID-LIFE, not freshly ignited. */
function worldWithLiveSpawner(): ReturnType<typeof makeWorld> {
  const w = makeWorld(1);
  w.tick = 5_000;
  const sp = makeSpawner({
    id: asSpawnerId(7),
    ownerPlayerId: P0,
    anchorPrimitiveId: asPrimitiveId(3),
    recipeId: 'voltkin',
    ignitedAtTick: 1_234,
    nextSpawnTick: 5_040,
  });
  // Drive it away from every fresh-ignition default so a re-seed is unmistakable.
  sp.lastValidatedTick = 4_980;
  sp.spawnedCount = 9;
  w.creatureSpawners.set(sp.id, sp);
  return w;
}

describe('S142 P1 — spawner cadence survives a LOCAL round-trip (worker INIT / disk save)', () => {
  it('preserves all four cadence fields verbatim through snapshot -> restore', () => {
    const src = worldWithLiveSpawner();
    const dst = makeWorld(1);
    // A DIFFERENT tick on the destination: an unconditional re-seed would derive from this
    // value, so the assertions below cannot pass by coincidence.
    dst.tick = 9_999;
    restore(snapshot(src), dst);

    const sp = dst.creatureSpawners.get(asSpawnerId(7));
    expect(sp).toBeDefined();
    expect(sp!.nextSpawnTick).toBe(5_040);
    expect(sp!.lastValidatedTick).toBe(4_980);
    expect(sp!.ignitedAtTick).toBe(1_234);
    // THE ONE THAT IS A GAMEPLAY CAP, NOT TELEMETRY.
    expect(sp!.spawnedCount).toBe(9);
  });

  it('the restored spawner is NOT merely a fresh-ignition spawner that happens to match', () => {
    const src = worldWithLiveSpawner();
    const dst = makeWorld(1);
    dst.tick = 9_999;
    restore(snapshot(src), dst);
    const sp = dst.creatureSpawners.get(asSpawnerId(7))!;
    // Exactly the values the OLD unconditional re-seed would have produced.
    expect(sp.nextSpawnTick).not.toBe(dst.tick + SPAWN_INTERVAL_TICKS);
    expect(sp.ignitedAtTick).not.toBe(9_999);
    expect(sp.spawnedCount).not.toBe(0);
  });
});

describe('S142 P1 — the CLIENT / legacy path still re-seeds, exactly as before', () => {
  it('a payload with the cadence fields absent re-seeds from the load tick', () => {
    // This is precisely the shape a client receives: `netSnapshot` ran `trimMirrorSpawner`,
    // so the four fields are gone. It is also every pre-S142 save on disk. The historical
    // re-seed is the CORRECT behaviour here and must not regress.
    const src = worldWithLiveSpawner();
    const snap = snapshot(src);
    expect(snap.creatureSpawners).toBeDefined();
    const stripped = {
      ...snap,
      creatureSpawners: snap.creatureSpawners!.map((s) => ({
        id: s.id,
        ownerPlayerId: s.ownerPlayerId,
        anchorPrimitiveId: s.anchorPrimitiveId,
        recipeId: s.recipeId,
      })),
    };

    const dst = makeWorld(1);
    dst.tick = 9_999;
    restore(stripped as typeof snap, dst);

    const sp = dst.creatureSpawners.get(asSpawnerId(7))!;
    // `restore` sets world.tick from the snapshot, so the re-seed anchors on THAT tick —
    // the same value the pre-S142 code used. Asserted against the restored tick rather
    // than a literal so this stays true if the fixture tick ever changes.
    expect(sp.nextSpawnTick).toBe(dst.tick + SPAWN_INTERVAL_TICKS);
    expect(sp.ignitedAtTick).toBe(dst.tick);
    expect(sp.lastValidatedTick).toBe(dst.tick);
    expect(sp.spawnedCount).toBe(0);
  });
});
