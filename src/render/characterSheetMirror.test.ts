/**
 * SPARK — S182: **EVERY FIELD THE CARD READS MUST ACTUALLY BE ON THE JOINER.**
 *
 * ## Why this file exists
 *
 * Owner: *"Sometimes player two can't click and see the stat sheets, either of his own characters or
 * of the enemies. That's an unfinished pathway or a bug."* The S182 brief asks, correctly, for the
 * one hypothesis that would explain a **player-2-only** failure rather than a player-agnostic one:
 *
 * > *whether the data is even on the peer — enumerate every field the sheet model reads and check
 * > each against what `save.ts` serializes and what `trimMirrorCreature` strips. A sheet needing a
 * > stripped field would fail only on the joiner, which is exactly his report.*
 *
 * ⛔ READING THE SERIALIZER IS NOT THE SAME AS PROVING IT. `netSnapshot` derives from `snapshot()`
 * by destructure-and-drop, so whether a given field survives is a property of the code and not of
 * anyone's reading — the `state/layoutWire.test.ts` / `net/raceWire.test.ts` lesson. And no existing
 * gate can see this class of gap: the worker differential compares two rigs fed from the SAME disk
 * snapshot, so a field missing from the wire is missing from both sides equally and they agree.
 *
 * ⭐ SO THE ASSERTION IS END-TO-END AND ON THE CARD ITSELF, not on field names: build a populated
 * host world, push it through the REAL `netSnapshot` → `applyNetSnapshot` path a joiner uses, and
 * require the rendered card to come back IDENTICAL. That catches a stripped field, a field with no
 * serializer surface, and a field that rehydrates to a different value — without needing a list
 * that can itself go stale.
 *
 * ## The verdict this file records
 *
 * It PASSES, and that is the finding. `trimMirrorCreature` strips `targetCreatureId` alone; the card
 * reads none of the stripped or non-travelling fields (`targetCreatureId`, `prevPos`, `targetPos`,
 * `spawnedAtTick`), and reads no spawner cadence, which is the other thing stripped on the wire
 * (`trimMirrorSpawner`). **So "player 2 has no data" is RULED OUT as the cause**, and the real
 * defect was the Idle gate around the open gesture — see `characterSheet.wired.test.ts`.
 *
 * ⚠ Kept anyway, and not as consolation: the hypothesis was worth testing and will be worth
 * re-testing. The next field added to a card is one `trimMirror*` line away from being host-only,
 * and this is the only gate in the suite that would notice.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, STINK_AURA_RADIUS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { makeWorld, type World } from '../state/world.ts';
import { applyNetSnapshot, netSnapshot } from '../state/save.ts';
import { CREATURE_CONFIGS } from '../state/creatures/voltkin-config.ts';
import type { CreatureType } from '../state/creatures/creature.ts';
import { applySpawnCreature } from '../state/creatures/creatureLifecycle.ts';
import { makeStinkCloud } from '../state/defenders/stinkCloud.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { makeDefender } from '../state/defenders/defender.ts';
import { applyBuildBlueprint } from '../state/blueprintBuild.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import { asDefenderId, asPlayerId, asStinkCloudId, type CreatureId } from '../types.ts';
import { characterSheetModel, type SheetTarget } from './characterSheetModel.ts';

const HOST_SEAT = asPlayerId(0);
const JOINER_SEAT = asPlayerId(1);

const ALL_TYPES = Object.keys(CREATURE_CONFIGS) as CreatureType[];

/** A two-seat PLAYING world on the HOST, populated with one of everything the card can target. */
function populatedHost(): { world: World; creatureIds: Map<CreatureType, CreatureId> } {
  const world = makeWorld(0x5182);
  world.isHost = true;
  world.gameState = 'PLAYING';
  world.gameMode = '1v1';
  world.players.set(HOST_SEAT, makeIdlePlayer(HOST_SEAT, PLAYER_COLORS[0]));
  world.players.set(JOINER_SEAT, makeIdlePlayer(JOINER_SEAT, PLAYER_COLORS[1]));

  // One creature of EVERY shipped type, alternating owners so the "· ENEMY" subtitle arm is
  // exercised from both seats rather than only the friendly one.
  const creatureIds = new Map<CreatureType, CreatureId>();
  ALL_TYPES.forEach((type, i) => {
    const before = new Set(world.creatures.keys());
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: type,
      ownerPlayerId: i % 2 === 0 ? HOST_SEAT : JOINER_SEAT,
      pos: { x: 300 + i * 7, y: 300 },
      targetPos: { x: 900, y: 300 },
      sourceSpawnerId: null,
    });
    for (const id of world.creatures.keys()) {
      if (!before.has(id)) creatureIds.set(type, id);
    }
  });

  // A landed stink bag — its own map, and the one target family that is neither creature,
  // defender, structure nor keep.
  const bagId = asStinkCloudId(1);
  world.stinkClouds.set(
    bagId,
    makeStinkCloud({
      id: bagId,
      pos: { x: 500, y: 400 },
      ownerPlayerId: JOINER_SEAT,
      landedAtTick: world.tick,
      radius: STINK_AURA_RADIUS,
    }),
  );

  /*
   * ⭐ S182 SELF-AUDIT — **A REAL STRUCTURE, AND THEREFORE A REAL DEFENDER.** The first version of
   * this file crossed the wire for creature / castle / stinkCloud only, leaving two of the five
   * `SheetTarget` families — `structure` and `defender` — completely unverified on the joiner. The
   * structure card is the widest of them all (`componentOf`, banked bond damage, `structureActionModel`,
   * `feedHint`, `owned`), so it was the biggest hole, not the smallest.
   *
   * A laser turret is built through the REAL reducer so the primitives, the bonds and the defender it
   * mints are all genuine rather than hand-placed.
   */
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill('laserTurret')) {
    bank[type as number] = (bank[type as number] ?? 0) + count;
  }
  world.castleBanks.set(HOST_SEAT, bank);
  applyBuildBlueprint(world, {
    type: 'BUILD_BLUEPRINT',
    playerId: HOST_SEAT,
    blueprintId: 'laserTurret',
    centre: { x: 700, y: 500 },
  });

  /*
   * ⚠ HELGA, NOT THE TURRET, AND THAT IS THE POINT. `applyBuildBlueprint` lays the shapes; the
   * defender is minted later by IGNITION, so one is placed directly here — the subject under test is
   * the WIRE, not the lifecycle. It must be the PRINCESS because `defenderSheet` returns null on
   * `ehp === null`, and every other `DefenderKind` is a tower with a null pool (R75). A turret would
   * give null on both sides and the comparison would be vacuous — which is exactly the trap the
   * S182 self-audit caught in the `defenderFrame{stinkTower}` claim.
   */
  const anchor = [...world.primitives.keys()][0];
  if (anchor !== undefined) {
    const helgaId = asDefenderId(1);
    world.defenders.set(
      helgaId,
      makeDefender({
        id: helgaId,
        kind: 'princess',
        ownerPlayerId: HOST_SEAT,
        anchorPrimitiveId: anchor,
        recipeId: 'helga',
        pos: { x: 720, y: 520 },
        registeredAtTick: 0,
      }),
    );
  }

  world.tick = 1234; // a non-zero tick, so anything tick-derived cannot pass by both being 0
  return { world, creatureIds };
}

/** The world a JOINER actually holds: a fresh sim fed only by the wire. */
function mirrorOf(host: World): World {
  const client = makeWorld(0xc11e47);
  client.isHost = false;
  client.gameMode = '1v1';
  client.gameState = 'PLAYING';
  client.players.set(HOST_SEAT, makeIdlePlayer(HOST_SEAT, PLAYER_COLORS[0]));
  client.players.set(JOINER_SEAT, makeIdlePlayer(JOINER_SEAT, PLAYER_COLORS[1]));
  applyNetSnapshot(netSnapshot(host), client);
  return client;
}

describe('S182 — a card renders identically on the host and on the joiner', () => {
  it('⭐ the mirror is genuinely fed from the WIRE, not from a shared reference', () => {
    // The negative control. Without it, every assertion below could be comparing a world to itself.
    const { world: host } = populatedHost();
    const client = mirrorOf(host);
    expect(client).not.toBe(host);
    expect(client.creatures).not.toBe(host.creatures);
    expect(client.creatures.size, 'the creatures really crossed').toBe(host.creatures.size);
    expect(client.creatures.size).toBeGreaterThan(0);
    expect(client.stinkClouds.size, 'and so did the bag').toBe(1);
  });

  it('⛔ EVERY creature card is byte-identical on the joiner — for its own units and the enemy', () => {
    const { world: host, creatureIds } = populatedHost();
    const client = mirrorOf(host);
    expect(creatureIds.size).toBe(ALL_TYPES.length);
    for (const [type, id] of creatureIds) {
      const target: SheetTarget = { kind: 'creature', id };
      // Read from the JOINER's seat on both sides: the seat only decorates the subtitle, so any
      // difference that shows up is the DATA differing, which is the thing under test.
      const onHost = characterSheetModel(host, JOINER_SEAT, target);
      const onClient = characterSheetModel(client, JOINER_SEAT, target);
      expect(onHost, `${type} has a card on the host`).not.toBeNull();
      expect(onClient, `${type} must have a card on the JOINER too`).not.toBeNull();
      expect(onClient, `${type} card differs across the wire`).toEqual(onHost);
    }
  });

  it('⛔ the landed stink bag — the newest target family — survives the wire intact', () => {
    const { world: host } = populatedHost();
    const client = mirrorOf(host);
    const [bagId] = [...host.stinkClouds.keys()];
    const target: SheetTarget = { kind: 'stinkCloud', id: bagId };
    expect(characterSheetModel(client, HOST_SEAT, target)).toEqual(
      characterSheetModel(host, HOST_SEAT, target),
    );
  });

  it('⛔ both castles read the same from both sides of the wire', () => {
    const { world: host } = populatedHost();
    const client = mirrorOf(host);
    for (const seat of [HOST_SEAT, JOINER_SEAT]) {
      const target: SheetTarget = { kind: 'castle', seat };
      // From the joiner's own seat, so `mine` is exercised in both polarities.
      expect(characterSheetModel(client, JOINER_SEAT, target)).toEqual(
        characterSheetModel(host, JOINER_SEAT, target),
      );
    }
  });

  it('⛔ the STRUCTURE card — the widest of the five — survives the wire intact', () => {
    const { world: host } = populatedHost();
    const client = mirrorOf(host);
    const prims = [...host.primitives.keys()];
    expect(prims.length, 'the turret really built').toBeGreaterThan(0);
    expect(client.primitives.size, 'and its primitives crossed').toBe(host.primitives.size);
    expect(client.bonds.size, 'and so did its bonds').toBe(host.bonds.size);
    for (const primitiveId of prims) {
      const target: SheetTarget = { kind: 'structure', primitiveId };
      // From the OWNER's seat, so `actions` / `owned` / `feedHint` are all populated rather than null.
      expect(
        characterSheetModel(client, HOST_SEAT, target),
        `structure card for ${String(primitiveId)} differs across the wire`,
      ).toEqual(characterSheetModel(host, HOST_SEAT, target));
    }
  });

  it('⛔ the DEFENDER card survives the wire intact', () => {
    const { world: host } = populatedHost();
    const client = mirrorOf(host);
    expect(host.defenders.size, 'a unit-class defender is on the board').toBeGreaterThan(0);
    expect(client.defenders.size, 'which crossed the wire').toBe(host.defenders.size);
    for (const id of host.defenders.keys()) {
      const target: SheetTarget = { kind: 'defender', id };
      expect(
        characterSheetModel(client, HOST_SEAT, target),
        `defender card for ${String(id)} differs across the wire`,
      ).toEqual(characterSheetModel(host, HOST_SEAT, target));
    }
  });

  /**
   * ⚠ NAMED, NOT ASSUMED. `trimMirrorCreature` strips `targetCreatureId` and nothing else, and
   * `prevPos` / `targetPos` / `spawnedAtTick` have no serializer surface at all (its docblock says
   * so in as many words). This pins that the card does not READ any of them — the cheap check that
   * makes the equality tests above evidence about the RIGHT fields rather than a coincidence.
   */
  it('⭐ the sheet model reads none of the fields the wire strips or never carries', () => {
    const src = [
      readSource('characterSheetModel.ts'),
      readSource('characterSheet.ts'),
    ].join('\n');
    for (const hostOnly of ['targetCreatureId', 'prevPos', 'targetPos', 'spawnedAtTick']) {
      expect(src, `the card must not depend on host-only ${hostOnly}`).not.toContain(hostOnly);
    }
    // And no spawner cadence, the other thing `netSnapshot` strips (`trimMirrorSpawner`).
    for (const cadence of ['nextSpawnTick', 'lastValidatedTick', 'spawnedCount', 'ignitedAtTick']) {
      expect(src, `the card must not depend on stripped spawner cadence ${cadence}`).not.toContain(
        cadence,
      );
    }
  });
});

function readSource(name: string): string {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
}
