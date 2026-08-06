/**
 * SPARK — S133 P1: damage state must SURVIVE the mirror wire (host-migration fidelity).
 *
 * THE BUG. A client builds its world from `applyNetSnapshot`. On host migration that
 * client is promoted and becomes AUTHORITATIVE from exactly that world. `netSnapshot`
 * ran every creature through `trimMirrorCreature`, which stripped `hp` and
 * `chewProgress` as "host-only", and `deserializeCreature` rehydrates
 * `hp: s.hp ?? config.hp`. Net effect: **every damaged creature healed to full and
 * every chew reset to zero on every host handoff** — both of the game's damage models,
 * silently. (`CONNECTOR_HP` is not a field; it IS `chewProgress`.)
 *
 * These tests are the regression lock. They were written to FAIL against the pre-S133
 * strip and were verified doing so (mutation M5/M6/M7 in the session's mutation matrix)
 * — not written after the fix and assumed to cover it.
 *
 * The last test is a CHARACTERIZATION of what is still broken on purpose: the lifecycle
 * trio (`sourceSpawnerId`, `despawnAtTick`, `targetCreatureId`) is still stripped, so a
 * Voltkin's remaining lifetime still resets across a migration. Scoped out deliberately;
 * pinned here so it cannot be mistaken for fixed, and so the fix has a red target.
 */
import { describe, expect, it } from 'vitest';
import { applyNetSnapshot, netSnapshot } from './save.ts';
import { makeWorld } from './world.ts';
import { makeCreature, type Creature } from './creatures/creature.ts';
import { CHEWER_CONFIG, VOLTKIN_CONFIG } from './creatures/voltkin-config.ts';
import { asBondId, asCreatureId, asPlayerId, asSpawnerId, type PlayerId } from '../types.ts';
import type { World } from './worldTypes.ts';

const P0 = asPlayerId(0) as PlayerId;
const CHEWER = asCreatureId(11);
const VOLTKIN = asCreatureId(12);

/** A host world holding one DAMAGED chewer mid-chew, plus a Voltkin with a lifetime. */
function hostWorldWithDamage(): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';

  const chewer = makeCreature(CHEWER_CONFIG, {
    id: CHEWER,
    ownerPlayerId: P0,
    pos: { x: 120, y: 140 },
    targetPos: { x: 300, y: 300 },
    spawnedAtTick: 0,
    sourceSpawnerId: asSpawnerId(5), // persistent chewer (not a Voltkin)
  });
  // ⚠ The chewer carries the CHEW state, not the hp state. `CHEWER_CONFIG.hp` is 1, so a
  // chewer has NO damaged-but-alive value (0 is dead) — and `serializeCreature` emits `hp`
  // only when `hp < config.hp`, so an hp assertion on a chewer would test nothing. The hp
  // half of this fix is asserted on the Voltkin below (config hp 2 ⇒ damaged = 1).
  chewer.chewProgress = 4; // 4 of CHEW_HITS = 5 — one chew from severing the bond
  chewer.targetBondId = asBondId(77); // the bond that progress is AGAINST
  w.creatures.set(CHEWER, chewer);

  // ⚠ The Voltkin carries the HP state, and it MUST be mid-zap for this test to have
  // teeth. `trimMirrorCreature` early-returns unchanged when a creature has none of the
  // still-stripped keys, so a plain damaged Voltkin never enters the destructure and an
  // hp assertion on it passes whether or not hp is stripped — this test was VACUOUS that
  // way (mutation M9 caught it). `targetCreatureId` is emitted exactly when a Voltkin is
  // mid-zap (serializeCreature, S103 #8), which is a REAL game state and forces the
  // destructure path. `targetCreatureId` is readonly, hence the construction override.
  const voltkin: Creature = {
    ...makeCreature(VOLTKIN_CONFIG, {
      id: VOLTKIN,
      ownerPlayerId: P0,
      pos: { x: 400, y: 400 },
      targetPos: { x: 401, y: 401 },
      // NON-ZERO deliberately: the lifecycle characterization below distinguishes "the
      // value travelled" from "the value happened to equal the rehydrate default". With
      // spawnedAtTick 0 that test passed for the wrong reason (CHECK finding F1).
      spawnedAtTick: 500,
      sourceSpawnerId: null, // Voltkin — lifetime-bound, so makeCreature sets despawnAtTick
    }),
    targetCreatureId: CHEWER, // mid-zap at the chewer
  };
  voltkin.hp -= 1; // 1 — damaged from VOLTKIN_HP = 2, what damageCreature does
  w.creatures.set(VOLTKIN, voltkin);

  return w;
}

/** Exactly what a client does, and therefore what a promoted successor inherits. */
function throughTheMirrorWire(host: World): World {
  const client = makeWorld(0);
  client.gameState = 'PLAYING';
  applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(host))), client);
  return client;
}

describe('S133 P1 — damage survives the mirror wire (host-migration fidelity)', () => {
  it('a DAMAGED creature does not heal across the wire', () => {
    const host = hostWorldWithDamage();
    const client = throughTheMirrorWire(host);

    const v = client.creatures.get(VOLTKIN);
    expect(v).toBeDefined();
    // Pre-S133 this was VOLTKIN_CONFIG.hp (2) — a full heal on every host handoff.
    expect(v!.hp).toBe(1);
    expect(v!.hp).not.toBe(VOLTKIN_CONFIG.hp);
  });

  it('chew progress — the bond HP — does not reset across the wire', () => {
    const client = throughTheMirrorWire(hostWorldWithDamage());
    // Pre-S133 this was 0: a bond one chew from severing was handed back intact.
    expect(client.creatures.get(CHEWER)!.chewProgress).toBe(4);
  });

  it('chew progress arrives WITH the bond it is progress against (coherent, not orphaned)', () => {
    const client = throughTheMirrorWire(hostWorldWithDamage());
    const c = client.creatures.get(CHEWER)!;
    // Shipping progress without its target would leave the successor re-aiming 4 chews
    // at whatever it re-acquires — worse than resetting. The pair must travel together.
    expect(c.chewProgress).toBe(4);
    expect(Number(c.targetBondId)).toBe(77);
  });

  it('the host world itself is UNMUTATED by serialization (no aliasing through the wire)', () => {
    const host = hostWorldWithDamage();
    throughTheMirrorWire(host);
    expect(host.creatures.get(CHEWER)!.chewProgress).toBe(4);
    expect(host.creatures.get(VOLTKIN)!.hp).toBe(1);
  });

  it('CHARACTERIZATION — the lifecycle/targeting fields still reset (known, scoped out of S133)', () => {
    const host = hostWorldWithDamage();
    const client = throughTheMirrorWire(host);

    // A chewer loses its parent spawner. Still stripped by trimMirrorCreature; pinned so
    // it cannot silently be called fixed — when it IS fixed this expectation flips.
    expect(Number(host.creatures.get(CHEWER)!.sourceSpawnerId)).toBe(5);
    expect(client.creatures.get(CHEWER)!.sourceSpawnerId).toBeNull();

    // A Voltkin mid-zap forgets what it was zapping.
    expect(Number(host.creatures.get(VOLTKIN)!.targetCreatureId)).toBe(Number(CHEWER));
    expect(client.creatures.get(VOLTKIN)!.targetCreatureId).toBeNull();

    // ⛔ THE SHARPEST REMAINING CASE, and it is worse than a mis-timed expiry: the
    // successor DELETES ITS ENTIRE CREATURE POPULATION on the first creature tick.
    // `despawnAtTick` rehydrates to 0; on PROMOTION the ex-client starts running the
    // lifetime gate (`creatureLifecycle.ts`: delete when `world.tick >= despawnAtTick`),
    // which 0 makes unconditionally true; and ALL THREE `CREATURE_CONFIGS` are
    // `persistent: false` (Voltkin, chewer since S104 P1, lightning drone) so the gate
    // applies to every type. Already recorded in `SPARK_Blueprint.md` §XV.6 as a live
    // hazard in three paths — S133 CHECK rediscovered it; the Blueprint got there first.
    // Only PARTLY fixable by un-stripping: serializeCreature emits `despawnAtTick` for
    // chewers ONLY, so that would rescue one of three types. Deliberately not shipped.
    expect(host.creatures.get(VOLTKIN)!.despawnAtTick).toBeGreaterThan(0);
    expect(client.creatures.get(VOLTKIN)!.despawnAtTick).toBe(0);
    // The CHEWER's value IS emitted by the serializer — and still lands at 0, because this
    // function strips it. That is the half the un-strip could have rescued.
    expect(client.creatures.get(CHEWER)!.despawnAtTick).toBe(0);
    // And `spawnedAtTick` cannot rescue it: it is not a SerializedCreature field, is never
    // emitted, and is hardcoded to 0 on rehydrate. Two earlier S133 drafts claimed the
    // expiry was "re-derivable from spawnedAtTick" — this pins that it is not.
    expect(host.creatures.get(VOLTKIN)!.spawnedAtTick).toBeGreaterThan(0);
    expect(client.creatures.get(VOLTKIN)!.spawnedAtTick).toBe(0);
  });
});
