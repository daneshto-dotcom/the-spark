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
 * ✅ AMENDED S134 P1 — the last test's red target HAS NOW BEEN HIT and its assertions are
 * flipped in place. `sourceSpawnerId` and `despawnAtTick` now survive the wire; only
 * `targetCreatureId` is still stripped (correctly — host AI re-acquires it every IDLE
 * tick), and `spawnedAtTick` still does not travel at all (no serializer surface).
 *
 * ⚠ WHY THIS FILE COULD NOT HAVE CAUGHT S134's BUG ON ITS OWN, worth keeping in mind when
 * writing the next characterization: every assertion here runs through `netSnapshot`, so
 * the "fix the emit condition" change that three save.ts docblocks recommended would have
 * left this file entirely GREEN while the wire stayed byte-identical and host migration
 * stayed broken. The S134 red target that actually bit is in `save.creatureLifetime.test.ts`,
 * which exercises the DISK/worker-INIT path (`snapshot()` → `restore()`) as well — a
 * production, authority-assuming consumer that needs no migration at all.
 */
import { describe, expect, it } from 'vitest';
import { applyNetSnapshot, netSnapshot } from './save.ts';
import { makeWorld } from './world.ts';
import { makeCreature, type Creature } from './creatures/creature.ts';
import { CHEWER_CONFIG, VOLTKIN_CONFIG } from './creatures/voltkin-config.ts';
import { asBondId, asCreatureId, asPlayerId, asSpawnerId, type PlayerId } from '../types.ts';
import type { World } from './worldTypes.ts';

import { unitPoolFifths } from './stats.ts';
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
  voltkin.ehp -= 1; // damaged by one hit from VOLTKIN_HP (8 since S150 R71), what damageCreature does
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
    // ⭐ S150 R71 — DERIVED, NOT A LITERAL. This read `toBe(1)`, which was VOLTKIN_HP(2) minus one
    // hit — so retuning the constant to 8 broke a test whose actual subject is "damage survives the
    // wire", not "a Voltkin has 1 hp". Pin the INVARIANT (one hit less than full), never the
    // arithmetic result of a constant that is explicitly a playtest dial.
    expect(v!.ehp).toBe(unitPoolFifths(VOLTKIN_CONFIG.hp, VOLTKIN_CONFIG.def) - 1);
    expect(v!.ehp).not.toBe(unitPoolFifths(VOLTKIN_CONFIG.hp, VOLTKIN_CONFIG.def));
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
    expect(host.creatures.get(VOLTKIN)!.ehp).toBe(unitPoolFifths(VOLTKIN_CONFIG.hp, VOLTKIN_CONFIG.def) - 1); // S150 R71 — derived, see above
  });

  it('S134 — the lifecycle fields now SURVIVE; only targeting + the untravelled trio reset', () => {
    const host = hostWorldWithDamage();
    const client = throughTheMirrorWire(host);

    // ✅ FLIPPED IN S134. This assertion was `.toBeNull()` and was authored as the red
    // target ("when it IS fixed this expectation flips"). A chewer now keeps its parent
    // spawner across the wire, which is what re-arms CHEWER_MAX_PER_SPAWNER on a promoted
    // host and stops `applySpawnCreature` counting it as the owner's Voltkin population.
    expect(Number(host.creatures.get(CHEWER)!.sourceSpawnerId)).toBe(5);
    expect(Number(client.creatures.get(CHEWER)!.sourceSpawnerId)).toBe(5);

    // STILL STRIPPED, AND CORRECTLY SO — a Voltkin mid-zap forgets what it was zapping.
    // `targetCreatureId` is re-acquired every IDLE tick by host AI a client never runs.
    expect(Number(host.creatures.get(VOLTKIN)!.targetCreatureId)).toBe(Number(CHEWER));
    expect(client.creatures.get(VOLTKIN)!.targetCreatureId).toBeNull();

    // ✅ FLIPPED IN S134 — both were `.toBe(0)`. The successor no longer deletes its whole
    // creature population (and no longer mass-detonates its drones, which fired EARLIER
    // than the lifetime gate via hostTick Step 1.5's `world.tick >= despawnAtTick - 1`).
    // Note the two types took DIFFERENT broken paths pre-fix, which is why both are
    // asserted: the Voltkin's value was never EMITTED (the emit was coupled to
    // `sourceSpawnerId !== null` and a Voltkin hardcodes null), while the chewer's was
    // emitted and then STRIPPED by trimMirrorCreature. Fixing either alone left the other.
    expect(host.creatures.get(VOLTKIN)!.despawnAtTick).toBeGreaterThan(0);
    expect(client.creatures.get(VOLTKIN)!.despawnAtTick).toBe(
      host.creatures.get(VOLTKIN)!.despawnAtTick,
    );
    expect(client.creatures.get(CHEWER)!.despawnAtTick).toBe(
      host.creatures.get(CHEWER)!.despawnAtTick,
    );

    // ⚠ STILL BROKEN ON PURPOSE, KEPT AS THE LIVE CHARACTERIZATION. `spawnedAtTick` is not
    // a SerializedCreature field at all, is never emitted, and is hardcoded to 0 on
    // rehydrate. The fixture's Voltkin uses spawnedAtTick 500 precisely so this stays
    // distinguishable from "the value happened to equal the default" (CHECK finding F1).
    // Because of this the successor's world is NOT equal to the predecessor's — do not
    // write a host-vs-successor hashWorldStateFull equality test expecting it to pass.
    expect(host.creatures.get(VOLTKIN)!.spawnedAtTick).toBeGreaterThan(0);
    expect(client.creatures.get(VOLTKIN)!.spawnedAtTick).toBe(0);
  });
});
