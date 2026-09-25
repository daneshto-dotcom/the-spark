/**
 * SPARK — S189 LOW (c), Council M2: **THE CREATURE-ID COUNTER IS MONOTONIC ACROSS A SAVE.**
 *
 * `applySnapshotCore` re-derived `nextCreatureId` as `max(LIVE id) + 1`. So when the highest-id
 * creature had died, a save/restore, a `?worker=1` adoption (its INIT is a save) or a host migration
 * (the successor applies the last NetSnapshot) minted that dead creature's id AGAIN.
 *
 * The fix serializes the counter (additive-optional, only when the derivation would under-state it)
 * and the reader takes `max(serialized, derived)`.
 *
 * Pinned: the arithmetic; REACH — a real kill through the host tick, then save/restore AND a
 * migration-style NetSnapshot apply, both minting the next NEW id; no post-restore mint collides with
 * any id that existed before the save; negatives — byte-identity when the derivation is right,
 * and an old snapshot without the field falls back to the derivation. ⭐ MUTATION-TESTED: dropping the
 * reader turns the REACH and collision cases red.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, phaseDurationTicks } from '../constants.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asCreatureId, asPlayerId, asSpawnerId, type CreatureId, type PlayerId } from '../types.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import type { Controls } from '../input/controls.ts';
import { applyNetSnapshot, netSnapshot, rederivedNextCreatureId, restore, snapshot } from './save.ts';
import { damageEntity } from './damage.ts';
import { zoneCastleAnchor } from './zones.ts';

const P1 = asPlayerId(1);
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function fightBoard(seed = 0xc189): World {
  const w = makeWorld(seed);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: '1v1',
    isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0] },
      { seat: 1, color: PLAYER_COLORS[1] },
    ],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  return w;
}

let spawnerSeq = 500;
function goblin(w: World, owner: PlayerId, x: number, y: number): CreatureId {
  const id = asCreatureId(w.nextCreatureId);
  dispatch(w, {
    type: 'SPAWN_CREATURE',
    creatureType: 'goblinMelee',
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    sourceSpawnerId: asSpawnerId(spawnerSeq++),
  } as never);
  if (!w.creatures.has(id)) throw new Error('fixture: the spawn was refused');
  return id;
}

/**
 * A board whose HIGHEST-id creatures have died: two seat-1 goblins (a low id far off, and one beside
 * seat 0's keep, which the castle gun kills through the real host tick). Anything the castles minted
 * meanwhile is then killed through the real damage path, so the live max is the low id and the
 * re-derivation under-states the counter. Returns every id that EVER existed, for the collision check.
 */
function boardWithDeadHighestId(): { w: World; low: CreatureId; dead: CreatureId; everSeen: Set<number> } {
  const w = fightBoard();
  const everSeen = new Set<number>();
  const low = goblin(w, P1, 1500, 900);
  const keep = zoneCastleAnchor(0, w.layout);
  const dead = goblin(w, P1, keep.x + 150, keep.y);
  const d = deps();
  const s = makeHostTickState(w);
  for (let t = 0; t < 2000 && w.creatures.has(dead); t++) {
    runHostTick(w, d, s);
    for (const id of w.creatures.keys()) everSeen.add(id as number);
  }
  everSeen.add(dead as number);
  if (w.creatures.has(dead)) throw new Error('fixture: the castle gun never killed the goblin');
  // Units the castles emitted while we waited are above `dead`; kill them the ordinary way.
  for (const id of [...w.creatures.keys()]) {
    if ((id as number) > (low as number)) damageEntity(w, { kind: 'creature', id }, 1_000_000, 'player', null);
  }
  if (!w.creatures.has(low)) throw new Error('fixture: the low-id goblin must still be alive');
  if (w.creatures.size !== 1) throw new Error('fixture: only the low-id goblin should survive');
  return { w, low, dead, everSeen };
}

describe('S189 LOW (c) — nextCreatureId is serialized and monotonic', () => {
  it('the arithmetic: the re-derivation is max(live id) + 1, or 0 on an empty board', () => {
    expect(rederivedNextCreatureId([])).toBe(0);
    expect(rederivedNextCreatureId([asCreatureId(3), asCreatureId(7), asCreatureId(5)])).toBe(8);
  });

  it('⭐⭐ REACH: after a real kill through the host tick, a save/restore mints a NEW id, not the dead one', () => {
    const { w, dead } = boardWithDeadHighestId();
    const counter = w.nextCreatureId;
    expect(counter, 'fixture: the derivation really would be wrong here').toBeGreaterThan(
      rederivedNextCreatureId(w.creatures.keys()),
    );
    const restored = makeWorld(1);
    restore(JSON.parse(JSON.stringify(snapshot(w))), restored);
    expect(restored.nextCreatureId).toBe(counter);
    const next = goblin(restored, P1, 900, 300);
    expect(next).not.toBe(dead);
    expect(next as number).toBe(counter);
  });

  it('⭐⭐ REACH: a migration successor (a client applying the last NetSnapshot) holds the host counter', () => {
    const { w } = boardWithDeadHighestId();
    const successor = makeWorld(2);
    applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(w))), successor);
    expect(successor.nextCreatureId).toBe(w.nextCreatureId);
  });

  it('⭐ NO COLLISION: the next three mints after a restore are ids that never existed before the save', () => {
    const { w, everSeen } = boardWithDeadHighestId();
    const restored = makeWorld(1);
    restore(JSON.parse(JSON.stringify(snapshot(w))), restored);
    for (let i = 0; i < 3; i++) {
      const id = goblin(restored, P1, 900, 200 + 100 * i);
      expect(everSeen.has(id as number), `id ${id as number} was minted before the save`).toBe(false);
    }
  });

  it('negative — byte-identity: with no dead id above the survivors the field is not emitted', () => {
    const w = fightBoard();
    goblin(w, P1, 1500, 900);
    goblin(w, P1, 1500, 700);
    expect(w.nextCreatureId).toBe(rederivedNextCreatureId(w.creatures.keys()));
    expect(JSON.stringify(snapshot(w)).includes('"nextCreatureId"')).toBe(false);
    expect(JSON.stringify(netSnapshot(w)).includes('"nextCreatureId"')).toBe(false);
  });

  it('negative — an OLD snapshot without the field restores to exactly the old derivation', () => {
    const { w } = boardWithDeadHighestId();
    const snap = JSON.parse(JSON.stringify(snapshot(w))) as Record<string, unknown>;
    delete snap.nextCreatureId;
    const restored = makeWorld(1);
    restore(snap as never, restored);
    expect(restored.nextCreatureId).toBe(rederivedNextCreatureId(restored.creatures.keys()));
  });

  it('negative — a serialized counter BELOW a live id is ignored (max, never a blind overwrite)', () => {
    const { w } = boardWithDeadHighestId();
    const snap = JSON.parse(JSON.stringify(snapshot(w))) as Record<string, unknown>;
    snap.nextCreatureId = 0;
    const restored = makeWorld(1);
    restore(snap as never, restored);
    expect(restored.nextCreatureId).toBe(rederivedNextCreatureId(restored.creatures.keys()));
  });
});
