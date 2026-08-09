/**
 * SPARK — S135 P0: a hunter's LIFETIME must reach every snapshot consumer.
 *
 * THE BUG. `serializeHunter` emitted no lifetime field and `deserializeHunter` hardcoded
 * `spawnedAtTick: 0` + `despawnAtTick: 0`. `hunterLifecycle.ts:148` gates the SEEKING escape
 * on `world.tick >= hunter.despawnAtTick`, so a rehydrated `despawnAtTick` of 0 makes
 * `world.tick >= 0` unconditionally true — a live SEEKING hunter flips to DESPAWNING on its
 * first post-rehydrate tick, abandons the chase, and (because `hunterSpawned` serializes) no
 * replacement ever spawns. Unlike the creature case this is a benign EARLY ESCAPE, not a
 * detonation — but it is still a real correctness loss on two HOST-AUTHORITATIVE paths.
 *
 * TWO CONSUMERS, ONE SERIALIZER. There is NO trimMirrorHunter: the disk path
 * (`snapshot`→`restore`, which `main.ts` feeds into `workerSim` INIT + host save/load) and
 * the wire path (`netSnapshot`→`applyNetSnapshot`, the promoted-successor mirror) both
 * rehydrate through the same `deserializeHunter`. So a deserialize mutation reds both — they
 * are belt-and-suspenders regression coverage, and the genuinely independent signal is the
 * behavioural assertion (TEST C runs the real `applyHunterTick`).
 *
 * THE FIX travels `despawnAtTick`, `spawnedAtTick` AND `prevPos` (additive-optional). Because
 * all eight hashed hunter fields now travel (prevPos reproduces because a fresh, un-ticked
 * hunter has prevPos===pos), a full host-vs-successor `hashWorldStateFull` equality CAN hold —
 * the guard the creature RESIDUAL could not use because creature spawnedAtTick never travels.
 *
 * TRAPS DESIGNED OUT (all cost a prior session a false result on this file's siblings):
 *  - Seed via `applySpawnHunter`, NEVER raw makeHunter+set: `restore` reconstructs
 *    `nextHunterId = maxId+1` and nextHunterId is hashed, so a raw-seeded source keeps
 *    nextHunterId=0 and the hash equality is a FALSE-RED even with a correct fix.
 *  - The target player is seated FAR from the spawn so pursuit cannot reach the 30px catch
 *    radius in the loop, and the behavioural assert is `state==='SEEKING'`, NOT `hunters.has`:
 *    a buggy hunter lingers HUNTER_DESPAWN_FADE_TICKS in DESPAWNING, so a presence assert
 *    would FALSE-GREEN against the bug.
 *  - The hunter is NOT ticked before the hash/field assertions: ticking moves pos so
 *    prevPos!==pos, which would diverge the prevPos hash token independent of the fix.
 *
 * NAMED MUTATION MATRIX (re-run after any fixture change; each observed RED against the
 * mutated line, per the S134 discipline). serializeHunter/deserializeHunter are unconditional
 * object literals with no branch, so the "fixture routed around the mutated line" vacuity that
 * bit save.creatureLifetime cannot occur here — but the matrix is still run empirically.
 *   M1 deserializeHunter hardcodes despawnAtTick:0 → TEST A hash + TEST A/B da-field + TEST C RED
 *   M2 deserializeHunter hardcodes spawnedAtTick:0 → TEST A hash + TEST A/B sa-field RED (TEST C blind — applyHunterTick never reads spawnedAtTick)
 *   M3 serializeHunter drops the despawnAtTick emit → same set as M1
 *   M4 serializeHunter drops the spawnedAtTick emit → same set as M2
 */
import { describe, expect, it } from 'vitest';
import { applyNetSnapshot, netSnapshot, restore, snapshot } from './save.ts';
import { makeWorld } from './world.ts';
import { applyHunterTick, applySpawnHunter } from './hunters/hunterLifecycle.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { HUNTER_HUNT_TICKS } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import type { World } from './worldTypes.ts';

const P0 = asPlayerId(0);
/** Non-zero on purpose: spawnedAtTick 500 ⇒ despawnAtTick 500 + 1800 = 2300. */
const SPAWN_TICK = 500;
/** Host tick when serialized — mid-chase (500 < 700 < 2300), so a correct hunter STAYS SEEKING. */
const HOST_TICK = 700;
const EXPECTED_DESPAWN = SPAWN_TICK + HUNTER_HUNT_TICKS;

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * A host world at tick 700 with ONE live SEEKING hunter that spawned at 500. Seeded via the
 * real `applySpawnHunter` so nextHunterId (1) and hunterSpawned (true) match what `restore`
 * reconstructs — the load-bearing precondition for the hash-equality assertion. The target
 * (P0, seated by makeWorld) is parked FAR from the top-edge spawn so it cannot be caught in a
 * short tick loop.
 */
function hostWorldWithHunter(): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  const p0 = w.players.get(P0)!;
  p0.avatarPos.x = 100;
  p0.avatarPos.y = 1000;
  w.tick = SPAWN_TICK;
  applySpawnHunter(w, { type: 'SPAWN_HUNTER' });
  w.tick = HOST_TICK;
  return w;
}

/** The DISK path — `snapshot()`→`restore()`. This IS the ?worker=1 seam: `main.ts` feeds
 *  exactly this pair into `workerSim.restore()` then sets isHost=true. */
function throughTheDisk(host: World): World {
  const fresh = makeWorld(0);
  fresh.gameState = 'PLAYING';
  restore(clone(snapshot(host)), fresh);
  return fresh;
}

/** The WIRE path — what a promoted successor inherits via the host→client mirror. */
function throughTheWire(host: World): World {
  const client = makeWorld(0);
  client.gameState = 'PLAYING';
  applyNetSnapshot(clone(netSnapshot(host)), client);
  return client;
}

const onlyHunter = (w: World) => [...w.hunters.values()][0];

describe('S135 P0 — hunter lifetime survives serialization', () => {
  it('TEST A — the DISK/worker-INIT path preserves the lifetime AND the whole-world hash', () => {
    const host = hostWorldWithHunter();
    // Sanity: the fixture really built a mid-chase hunter, not a degenerate one.
    expect(onlyHunter(host).state).toBe('SEEKING');
    expect(onlyHunter(host).despawnAtTick).toBe(EXPECTED_DESPAWN);

    const fresh = throughTheDisk(host);
    const h = onlyHunter(fresh);
    // Pre-fix these rehydrated to 0 (a value that could never pass by accident: both are
    // strictly ahead of the host tick).
    expect(h.despawnAtTick).toBe(EXPECTED_DESPAWN);
    expect(h.spawnedAtTick).toBe(SPAWN_TICK);
    expect(h.despawnAtTick).toBeGreaterThan(HOST_TICK);
    expect(h.prevPos).toEqual(onlyHunter(host).prevPos);

    // THE STRONGEST GUARD — a byte-exact full-world hash. Valid for a hunter only because the
    // fix travels all three fields AND the un-ticked hunter has prevPos===pos on both sides.
    expect(hashWorldStateFull(fresh)).toBe(hashWorldStateFull(host));
  });

  it('TEST B — the WIRE/promoted-successor path preserves the lifetime', () => {
    const host = hostWorldWithHunter();
    const client = throughTheWire(host);
    const h = onlyHunter(client);
    expect(h.despawnAtTick).toBe(EXPECTED_DESPAWN);
    expect(h.spawnedAtTick).toBe(SPAWN_TICK);
    expect(h.despawnAtTick).toBeGreaterThan(client.tick);
    expect(h.state).toBe('SEEKING');
    expect(h.prevPos).toEqual(onlyHunter(host).prevPos);
  });

  it('TEST C — a rehydrated SEEKING hunter KEEPS CHASING, it does not escape on tick 1', () => {
    const fresh = throughTheDisk(hostWorldWithHunter());
    fresh.isHost = true;
    const id = [...fresh.hunters.keys()][0];
    expect(fresh.hunters.get(id)!.state).toBe('SEEKING'); // before any tick

    // ⛔ RUNS THE REAL GATE rather than re-deriving it. With despawnAtTick rehydrated 0 the
    // SEEKING escape check `world.tick >= 0` is true and the hunter transitions to DESPAWNING
    // on the very first tick; with the real 2300 it keeps chasing. The target sits far away so
    // it cannot be CATCHING instead — the only non-SEEKING outcome here is the bug.
    for (let t = 0; t < 5; t++) {
      fresh.tick++;
      applyHunterTick(fresh, { type: 'HUNTER_TICK', hunterId: id });
    }
    expect(fresh.hunters.has(id)).toBe(true);
    expect(fresh.hunters.get(id)!.state).toBe('SEEKING');
  });

  it('the host world is UNMUTATED by either serialization path', () => {
    const host = hostWorldWithHunter();
    throughTheWire(host);
    throughTheDisk(host);
    expect(onlyHunter(host).despawnAtTick).toBe(EXPECTED_DESPAWN);
    expect(onlyHunter(host).spawnedAtTick).toBe(SPAWN_TICK);
    expect(onlyHunter(host).state).toBe('SEEKING');
  });
});
