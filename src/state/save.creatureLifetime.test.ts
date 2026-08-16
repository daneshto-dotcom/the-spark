/**
 * SPARK — S134 P1: a creature's LIFETIME must reach every snapshot consumer.
 *
 * THE BUG. `serializeCreature` emitted `despawnAtTick` only inside a spread coupled to
 * `sourceSpawnerId !== null`, and `trimMirrorCreature` then stripped it from the wire
 * unconditionally. `deserializeCreature` rehydrates `despawnAtTick ?? 0`, and 0 is not a
 * neutral default — it is a DETONATION default:
 *   - `creatureLifecycle.ts` deletes any `!config.persistent` creature once
 *     `world.tick >= creature.despawnAtTick`, and all three CREATURE_CONFIGS are
 *     `persistent: false` ⇒ the whole creature population is deleted;
 *   - `hostTick.ts` Step 1.5 computes `world.tick >= despawnAtTick - 1` for a
 *     `selfExplode` drone in SEEKING ⇒ `>= -1`, unconditionally true, so every live drone
 *     DETONATES (severing up to DRONE_MAX_CONNECTORS enemy bonds each) BEFORE the lifetime
 *     gate everyone framed as the bug.
 *
 * THREE CONSUMERS, NOT ONE. The Voltkin case is live WITHOUT any host migration:
 * `main.ts` hands `snapshot(world)` to `workerSim.restore()` and then sets `isHost = true`,
 * so under `?worker=1` a Voltkin's lifetime is destroyed on the ORIGINAL host. TEST A
 * covers that path; TEST B/C cover promotion; TEST D covers the masked caps defect.
 *
 * Every test here was observed RED against the pre-S134 code before the fix was written,
 * and each is pinned by a named mutation, re-validated after every fixture change:
 *   M1 restore the emit coupling             → TESTS A, B, B2 re-RED
 *   M2 restore `despawnAtTick` in the trim    → TESTS B, B2, C re-RED; TEST A stays GREEN
 *   M3 restore `sourceSpawnerId` in the trim  → TESTS D, D2 re-RED
 * THE M1/M2 ASYMMETRY IS THE POINT: TEST A goes through `snapshot()`/`restore()` and never
 * touches the trim, so it is red under M1 and green under M2. That is what demonstrates the
 * two edits repair DIFFERENT consumers and neither alone is sufficient — three docblocks in
 * `save.ts` claimed the emit condition was the whole fix, and it is not.
 *
 * ⚠ RE-RUN THE MATRIX AFTER ANY FIXTURE CHANGE. It has produced a false all-green twice in
 * this file's history, both times because the fixture routed around the mutated line rather
 * than because an assertion was weak — first with no zap target at all (every creature took
 * the trim's early return), then with the P1-owned creature being the CHEWER, which has no
 * zap target and is therefore immune to M3. A mutation that fails to red is not evidence the
 * code is covered; it is evidence the mutated line never executed.
 */
import { describe, expect, it } from 'vitest';
import { applyNetSnapshot, netSnapshot, restore, snapshot } from './save.ts';
import { makeWorld } from './world.ts';
import { makeCreature } from './creatures/creature.ts';
import { applySpawnCreature } from './creatures/creatureLifecycle.ts';
import {
  CHEWER_CONFIG,
  LIGHTNING_DRONE_CONFIG,
  VOLTKIN_CONFIG,
} from './creatures/voltkin-config.ts';
import { makeGameStateExtras } from './gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import type { ControlsLike } from '../input/controlsCore.ts';
import {
  asCreatureId,
  asPlayerId,
  asPrimitiveId,
  asSpawnerId,
  type PlayerId,
} from '../types.ts';
import type { World } from './worldTypes.ts';

const P0 = asPlayerId(0) as PlayerId;
const P1 = asPlayerId(1) as PlayerId;
const CHEWER = asCreatureId(11);
const VOLTKIN = asCreatureId(12);
const DRONE = asCreatureId(13);
const SPAWNER_5 = asSpawnerId(5);

/** Tick the host world is at when it is serialized. Non-zero on purpose. */
const HOST_TICK = 700;
/** Chewer spawned at 600 ⇒ despawnAtTick 600 + CHEWER_CONFIG.lifetimeTicks. */
const CHEWER_SPAWNED = 600;
/** Voltkin spawned at 500 ⇒ despawnAtTick 500 + VOLTKIN_CONFIG.lifetimeTicks. */
const VOLTKIN_SPAWNED = 500;
/** Drone spawned at 690 — recently, so its fuse is nowhere near expiring. */
const DRONE_SPAWNED = HOST_TICK - 10;

const CHEWER_EXPIRY = CHEWER_SPAWNED + CHEWER_CONFIG.lifetimeTicks;
const VOLTKIN_EXPIRY = VOLTKIN_SPAWNED + VOLTKIN_CONFIG.lifetimeTicks;
const DRONE_EXPIRY = DRONE_SPAWNED + LIGHTNING_DRONE_CONFIG.lifetimeTicks;

/**
 * A host world at tick 700 covering BOTH serializer branches AND BOTH trim branches.
 *
 * ⛔ THE TRIM-BRANCH COVERAGE IS NOT OPTIONAL, AND THIS FIXTURE'S FIRST DRAFT GOT IT
 * WRONG. `trimMirrorCreature` early-returns unchanged when `targetCreatureId === undefined`.
 * The first version of this fixture gave NO creature a zap target, so every creature took
 * the early return, the destructure never executed, and mutations M2/M3 (which re-add a
 * field to that destructure) BOTH PASSED — 8/8 green against deliberately broken code.
 * That is the S133 M9 lesson repeating verbatim: a guard can be vacuous because the
 * FIXTURE takes a different code path, not because the assertion is weak.
 *
 * So the three creatures are chosen to cover the matrix, not for variety:
 *   CHEWER  sourceSpawnerId SET, no zap target  → serializer emits both; trim EARLY-RETURNS
 *   VOLTKIN sourceSpawnerId NULL, zap target    → serializer omits spawner; trim DESTRUCTURES
 *   DRONE   sourceSpawnerId SET, zap target     → the only combination that can catch M3
 * A drone legitimately carries both: `hostTick` assigns `targetCreatureId` to any
 * non-chewer, and a drone is spawner-emitted. Without it, re-adding `sourceSpawnerId` to
 * the destructure is invisible to this file.
 */
function hostWorldWithLifetimes(): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  w.tick = HOST_TICK;

  w.creatures.set(
    CHEWER,
    makeCreature(CHEWER_CONFIG, {
      id: CHEWER,
      ownerPlayerId: P0,
      pos: { x: 120, y: 140 },
      targetPos: { x: 300, y: 300 },
      spawnedAtTick: CHEWER_SPAWNED,
      sourceSpawnerId: SPAWNER_5,
    }),
  );

  // `targetCreatureId` is readonly on Creature, hence the construction override — same
  // idiom as save.migrationDamage.test.ts, whose docblock records the identical reason.
  w.creatures.set(VOLTKIN, {
    ...makeCreature(VOLTKIN_CONFIG, {
      id: VOLTKIN,
      ownerPlayerId: P0,
      pos: { x: 400, y: 400 },
      targetPos: { x: 401, y: 401 },
      spawnedAtTick: VOLTKIN_SPAWNED,
      sourceSpawnerId: null,
    }),
    targetCreatureId: CHEWER, // mid-zap ⇒ forces the trim DESTRUCTURE branch
  });

  // ⚠ THE DRONE IS OWNED BY P1, AND THAT IS LOAD-BEARING — two earlier drafts got it wrong.
  // TEST D2 asserts that a rehydrated spawner-emitted creature is not mis-counted as the
  // summoning player's Voltkin, so the P1-owned creature must be one that mutation M3 can
  // actually strip. Draft 1 owned everything with P0 and summoned as P1, so P0's creatures
  // could never block the gate and the assertion passed unconditionally. Draft 2 moved the
  // CHEWER to P1 — still wrong, because the chewer has no zap target, takes
  // `trimMirrorCreature`'s EARLY RETURN, and is therefore IMMUNE to M3. Only a creature
  // with BOTH a spawner and a zap target reaches the destructure, and the drone is the one
  // realistic creature that carries both.
  w.creatures.set(DRONE, {
    ...makeCreature(LIGHTNING_DRONE_CONFIG, {
      id: DRONE,
      ownerPlayerId: P1,
      pos: { x: 500, y: 500 },
      targetPos: { x: 900, y: 900 },
      spawnedAtTick: DRONE_SPAWNED,
      sourceSpawnerId: SPAWNER_5,
    }),
    targetCreatureId: CHEWER, // spawner-emitted AND mid-zap — the M3 detector
  });

  return w;
}

/** The WIRE path — exactly what a client does, and what a promoted successor inherits. */
function throughTheWire(host: World): World {
  const client = makeWorld(0);
  client.gameState = 'PLAYING';
  applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(host))), client);
  return client;
}

/**
 * The DISK path — `snapshot()` → `restore()`. This is NOT only save/load: `main.ts` feeds
 * exactly this pair into `workerSim.restore()` and then sets `isHost = true`, so it is a
 * production, authority-assuming consumer on the ORIGINAL host under `?worker=1`.
 */
function throughTheDisk(host: World): World {
  const fresh = makeWorld(0);
  fresh.gameState = 'PLAYING';
  restore(JSON.parse(JSON.stringify(snapshot(host))), fresh);
  return fresh;
}

describe('S134 P1 — creature lifetime survives serialization', () => {
  it('TEST A — the DISK/worker-INIT path preserves a Voltkin lifetime (no migration involved)', () => {
    const host = hostWorldWithLifetimes();
    const fresh = throughTheDisk(host);

    // Pre-fix: the chewer's 3600 survived (sourceSpawnerId non-null ⇒ emitted) while the
    // Voltkin's became 0, because the emit was coupled to sourceSpawnerId. Measured on
    // clean HEAD: `DISK chewer despawn= 3600 voltkin despawn= 0 (host voltkin= 1700)`.
    expect(host.creatures.get(VOLTKIN)!.despawnAtTick).toBe(VOLTKIN_EXPIRY);
    expect(fresh.creatures.get(VOLTKIN)!.despawnAtTick).toBe(VOLTKIN_EXPIRY);
    expect(fresh.creatures.get(CHEWER)!.despawnAtTick).toBe(CHEWER_EXPIRY);

    // The value must be a real travelled value, not a coincidence: both expiries are
    // strictly ahead of the host tick, so `0` could never pass by accident.
    expect(fresh.creatures.get(VOLTKIN)!.despawnAtTick).toBeGreaterThan(HOST_TICK);
  });

  it('TEST B — a promoted host inherits real lifetimes, not zeros', () => {
    const host = hostWorldWithLifetimes();
    const client = throughTheWire(host);

    // Pre-fix, measured on clean HEAD: `WIRE chewer despawn= 0 spawner= null |
    // voltkin despawn= 0 | tick= 700`. Both zero ⇒ `world.tick >= 0` is true ⇒ the
    // successor deletes its entire creature population on the first creature tick.
    expect(client.creatures.get(CHEWER)!.despawnAtTick).toBe(CHEWER_EXPIRY);
    // The VOLTKIN and DRONE both carry a zap target, so unlike the chewer they reach
    // `trimMirrorCreature`'s DESTRUCTURE rather than its early return. They are what makes
    // this test able to detect mutation M2 (re-adding `despawnAtTick: _d` to the strip);
    // asserting on the chewer alone would pass against that mutation.
    expect(client.creatures.get(VOLTKIN)!.despawnAtTick).toBe(VOLTKIN_EXPIRY);
    expect(client.creatures.get(DRONE)!.despawnAtTick).toBe(DRONE_EXPIRY);
    for (const c of client.creatures.values()) {
      expect(c.despawnAtTick).toBeGreaterThan(client.tick);
    }
  });

  it('TEST B2 — the successor still HOLDS its creatures after running real host ticks', () => {
    const client = throughTheWire(hostWorldWithLifetimes());
    client.isHost = true;

    const deps: HostTickDeps = {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
      controls: { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as ControlsLike,
      botManager: null,
      gameStateExtras: makeGameStateExtras(),
      alivePeerIds: null,
      hostSeats: new Map(),
    };
    const state = makeHostTickState(client);

    // The end-to-end claim, not a field assertion: promotion must not empty the population.
    expect(client.creatures.size).toBe(3);
    for (let t = 0; t < 5; t++) runHostTick(client, deps, state);
    expect(client.creatures.size).toBe(3);
  });

  it('TEST C — a promoted host does not mass-detonate its inherited drones', () => {
    const host = hostWorldWithLifetimes();
    host.creatures.get(DRONE)!.state = 'SEEKING';

    const client = throughTheWire(host);
    client.isHost = true;

    const inherited = client.creatures.get(DRONE);
    expect(inherited).toBeDefined();
    expect(inherited!.despawnAtTick).toBe(DRONE_EXPIRY);

    // ⚠ The state must be re-asserted ON THE CLIENT. `state` does ride the wire, but the
    // drone is put back into SEEKING explicitly here so this test cannot quietly stop
    // exercising hostTick Step 1.5 if the FSM's post-apply state ever changes — the branch
    // is gated on `droneCandidate.state === 'SEEKING'` and a SPAWNING drone skips it
    // entirely (LIGHTNING_DRONE_CONFIG.spawnTicks is 30, so a freshly-made drone cannot
    // reach SEEKING inside this loop).
    (client.creatures.get(DRONE) as { state: string }).state = 'SEEKING';

    const deps: HostTickDeps = {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
      controls: { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as ControlsLike,
      botManager: null,
      gameStateExtras: makeGameStateExtras(),
      alivePeerIds: null,
      hostSeats: new Map(),
    };
    const state = makeHostTickState(client);

    // ⛔ RUNS THE REAL BRANCH rather than re-deriving its predicate. An earlier draft
    // asserted `client.tick >= despawnAtTick - 1` — a hand-copy of hostTick Step 1.5's
    // `fuseExpiring` — which would stay green if that predicate ever changed field or
    // offset. Now the production tick actually executes: with despawnAtTick rehydrated 0
    // the fuse reads `700 >= -1`, unconditionally true, and DRONE_EXPLODE deletes the drone
    // (and severs up to DRONE_MAX_CONNECTORS enemy bonds) on the very first tick.
    for (let t = 0; t < 5; t++) runHostTick(client, deps, state);
    expect(client.creatures.has(DRONE)).toBe(true);
  });

  it('TEST D — per-spawner caps still work on a promoted host (sourceSpawnerId survives)', () => {
    const host = hostWorldWithLifetimes();
    const client = throughTheWire(host);

    // Pre-fix the chewer's parent spawner rehydrated null, so `underChewerCaps` compared
    // against null, the perSpawner term always scored 0, and CHEWER_MAX_PER_SPAWNER
    // silently degraded to the global cap. Un-stripping it is what re-arms the cap — and
    // it can only be asserted once creatures stop being deleted, which is precisely why
    // this ships in the SAME commit as the lifetime fix rather than after it.
    expect(Number(client.creatures.get(CHEWER)!.sourceSpawnerId)).toBe(5);

    // ⛔ THE DRONE IS THE ONE THAT ACTUALLY DETECTS A REGRESSION HERE, and dropping it
    // would make this test vacuous. The chewer has no zap target, so it takes
    // `trimMirrorCreature`'s EARLY RETURN and its spawner survives no matter what the
    // destructure says. The drone carries BOTH a spawner and a zap target, so it is the
    // only creature that reaches the destructure with a non-null spawner. Mutation M3
    // (re-add `sourceSpawnerId: _s` to the destructure) passes 8/8 without this line.
    expect(Number(client.creatures.get(DRONE)!.sourceSpawnerId)).toBe(5);

    // A Voltkin's null is still null — it is emitted conditionally on purpose, since
    // `deserializeCreature` already rehydrates `?? null` and an emitted null would be
    // zero-information bytes on every snapshot forever.
    expect(client.creatures.get(VOLTKIN)!.sourceSpawnerId).toBeNull();
  });

  it('TEST D2 — a rehydrated spawner-emitted creature is NOT counted as a Voltkin', () => {
    const client = throughTheWire(hostWorldWithLifetimes());
    client.isHost = true;
    client.tick = HOST_TICK;

    // `applySpawnCreature` routes on `sourceSpawnerId === null` to the Voltkin branch and
    // rejects when a null-spawner creature belongs to the SUMMONING player
    // (`creatureLifecycle.ts`: `c.sourceSpawnerId === null && c.ownerPlayerId === action.ownerPlayerId`).
    // P1 owns exactly one creature — the spawner-emitted DRONE — and no genuine Voltkin.
    // Pre-fix that drone rehydrated with a null spawner, was mis-read as P1's Voltkin, and
    // BLOCKED P1's own summon. Post-fix it keeps spawner 5 and the summon lands.
    const nullSpawnerForP1 = [...client.creatures.values()].filter(
      (c) => c.sourceSpawnerId === null && c.ownerPlayerId === P1,
    );
    expect(nullSpawnerForP1).toHaveLength(0);

    const before = client.creatures.size;
    applySpawnCreature(client, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: P1,
      pos: { x: 700, y: 700 },
      targetPos: { x: 720, y: 720 },
      sourceSpawnerId: null,
      anchorPrimitiveId: asPrimitiveId(1),
    } as never);
    // THE M3 DETECTOR. Under mutation M3 the chewer's spawner rehydrates null, P1 appears
    // to already own a Voltkin, and this spawn is silently refused ⇒ size unchanged.
    expect(client.creatures.size).toBe(before + 1);
  });

  it('the host world is UNMUTATED by either serialization path', () => {
    const host = hostWorldWithLifetimes();
    throughTheWire(host);
    throughTheDisk(host);
    expect(host.creatures.get(VOLTKIN)!.despawnAtTick).toBe(VOLTKIN_EXPIRY);
    expect(host.creatures.get(CHEWER)!.despawnAtTick).toBe(CHEWER_EXPIRY);
    expect(Number(host.creatures.get(CHEWER)!.sourceSpawnerId)).toBe(5);
  });

  it('RESIDUAL — prevPos/targetPos/spawnedAtTick still do NOT travel (logged, not fixed)', () => {
    const client = throughTheWire(hostWorldWithLifetimes());
    const v = client.creatures.get(VOLTKIN)!;

    // Pinned so nobody attaches a round-trip-FIDELITY claim to this fix. The successor's
    // world is NOT equal to the predecessor's: these three have no serializer surface at
    // all, so a host-vs-successor `hashWorldStateFull` equality test cannot pass and must
    // not be written until they travel too.
    expect(v.spawnedAtTick).toBe(0);
    expect(v.prevPos).toEqual(v.pos);
    expect(v.targetPos).toEqual(v.pos);
  });
});
