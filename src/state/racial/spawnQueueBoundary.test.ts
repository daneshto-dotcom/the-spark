/**
 * SPARK — S189 LOW (d): **THE RACIAL SPAWN QUEUE IS EMPTY WHEREVER A SAVE CAN LAND.**
 *
 * S188's queue (Council A5) was documented as "empty at every tick boundary by construction". It was
 * not: the host applies a remote INTENT with `dispatch` the moment it arrives, OUTSIDE `runHostTick`,
 * so a RAID that killed a demons.l5 seat's chewer queued HELLSPAWN's two children and they waited for
 * the next tick. A save in that gap (a NetSnapshot on a zero-tick frame, a `?worker=1` adoption, a
 * migration successor's last snapshot) carried the dead parent and NO children; a `restore()` into
 * the same world kept the stale closure and later spawned children of a parent the restored world had
 * alive.
 *
 * Pinned: REACH with a save mid-gap (the production intent path, then `snapshot` → a fresh world:
 * the split is IN the save); the same-world restore cannot inherit queued work; the window semantics
 * (silent inside a host tick, a final drain at its end — the negative); and ⭐ MUTATION-TESTED:
 * dropping the out-of-tick drain in `dispatch` turns both REACH cases red.
 */
import { describe, expect, it } from 'vitest';
import { phaseDurationTicks } from '../../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../../game/spawner.ts';
import type { Controls } from '../../input/controls.ts';
import { asPlayerId, asSpawnerId, type CreatureId, type PlayerId } from '../../types.ts';
import type { CreatureType } from '../creatures/creature.ts';
import type { DraftPick } from '../draft.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import type { RaceId } from '../races.ts';
import { mulberry32 } from '../rng.ts';
import { restore, snapshot } from '../save.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { pendingRacialSpawns, queueAfterStrike } from './racialTick.ts';
import { beginHostTickSpawnWindow, endHostTickSpawnWindow } from './spawnQueue.ts';

const P0 = asPlayerId(0); // the demon seat (HELLSPAWN, demons.l5)
const P1 = asPlayerId(1); // the raider
const PENTAGRAM = asSpawnerId(40);

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function hostDeps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/** The `hellspawn.test.ts` board: seat 0 demons holding the level-5 pick, in FIGHT. */
function fightWorld(race: RaceId = 'demons', picks: DraftPick[] = ['hp', 'racial']): World {
  const w = makeWorld(0x5191);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  w.players.get(P0)!.raceId = race;
  w.players.get(P0)!.draftPicks = [...picks];
  w.players.get(P1)!.raceId = 'vampires';
  return w;
}

function spawnAt(w: World, owner: PlayerId, type: CreatureType, x: number, y: number): CreatureId {
  const id = w.nextCreatureId as unknown as CreatureId;
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: type, ownerPlayerId: owner,
    pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: PENTAGRAM,
  });
  if (!w.creatures.has(id)) throw new Error(`fixture: ${type} did not spawn`);
  return id;
}

const chewersOf = (w: World): number =>
  [...w.creatures.values()].filter((c) => c.type === 'chewer' && c.ownerPlayerId === P0).length;

/** The production intent path: the host applies the raider's RAID_TARGET with `dispatch`, between ticks. */
function raid(w: World, id: CreatureId): void {
  w.players.get(P1)!.raidPoints = 1;
  dispatch(w, { type: 'RAID_TARGET', target: { kind: 'creature', id }, playerId: P1 } as never);
}

describe('S189 LOW (d) — the racial spawn queue never outlives the boundary a save lands on', () => {
  it('⭐⭐ REACH, SAVE MID-GAP: a RAID kills a HELLSPAWN chewer between ticks — the split is IN the save', () => {
    const w = fightWorld();
    const parent = spawnAt(w, P0, 'chewer', 900, 500);
    raid(w, parent);
    expect(w.creatures.has(parent), 'fixture: the raid killed the chewer').toBe(false);
    // No tick runs. This is the gap: the next thing that happens is a save.
    expect(pendingRacialSpawns(w), 'nothing is left queued for a later tick').toBe(0);
    const successor = makeWorld(9);
    restore(JSON.parse(JSON.stringify(snapshot(w))), successor);
    expect(chewersOf(successor), 'the two HELLSPAWN children reached the save').toBe(2);
  });

  it('⭐⭐ REACH: a restore into the SAME world cannot inherit queued work (no phantom split)', () => {
    const w = fightWorld();
    const parent = spawnAt(w, P0, 'chewer', 900, 500);
    const before = JSON.parse(JSON.stringify(snapshot(w)));
    raid(w, parent);
    restore(before, w); // back to the parent alive
    const d = hostDeps();
    const s = makeHostTickState(w);
    runHostTick(w, d, s);
    // ⛔ with the stale closure still queued, this tick's drain spawned two children of a live parent.
    expect(w.creatures.has(parent)).toBe(true);
    expect(chewersOf(w)).toBe(1);
  });

  it('negative — inside a host-tick window the out-of-tick drain is SILENT; the window end drains', () => {
    const w = fightWorld();
    let ran = 0;
    beginHostTickSpawnWindow(w);
    queueAfterStrike(w, () => { ran++; });
    dispatch(w, { type: 'UPDATE_AVATAR_POS', playerId: P0, pos: { x: 500, y: 500 } } as never);
    expect(ran, 'mid-tick, a top-level dispatch must not drain (A5 post-sweep order)').toBe(0);
    expect(pendingRacialSpawns(w)).toBe(1);
    endHostTickSpawnWindow(w);
    expect(ran, 'the final drain at the end of the tick').toBe(1);
    expect(pendingRacialSpawns(w)).toBe(0);
  });

  it('control — OUTSIDE a window, the next top-level dispatch drains, once, FIFO', () => {
    const w = fightWorld();
    const order: number[] = [];
    queueAfterStrike(w, () => order.push(1));
    queueAfterStrike(w, () => order.push(2));
    dispatch(w, { type: 'UPDATE_AVATAR_POS', playerId: P0, pos: { x: 500, y: 500 } } as never);
    expect(order).toEqual([1, 2]);
    dispatch(w, { type: 'UPDATE_AVATAR_POS', playerId: P0, pos: { x: 501, y: 500 } } as never);
    expect(order).toEqual([1, 2]);
  });

  it('⭐ every real host tick ends with nothing queued (the invariant a between-ticks save relies on)', () => {
    const w = fightWorld();
    for (let i = 0; i < 6; i++) spawnAt(w, P0, 'chewer', 800 + i * 20, 500);
    const d = hostDeps();
    const s = makeHostTickState(w);
    for (let t = 0; t < 120; t++) {
      if (t % 20 === 0) {
        const victim = [...w.creatures.values()].find((c) => c.type === 'chewer' && c.ownerPlayerId === P0);
        if (victim !== undefined) {
          raid(w, victim.id);
          // ⛔ audit U2-1 — empty straight after a between-ticks raid ONLY if the previous
          // runHostTick CLOSED its window: delete `endHostTickSpawnWindow`, or add an early return that
          // skips it, and the window stays open, the out-of-tick drain goes silent, and this goes red.
          expect(pendingRacialSpawns(w), `straight after the raid at tick ${w.tick}`).toBe(0);
        }
      }
      runHostTick(w, d, s);
      expect(pendingRacialSpawns(w), `tick ${w.tick}`).toBe(0);
    }
  });
  it('⭐⭐ REACH (audit U2-1): a BOT raid inside runHostTick, after the post-sweep drain, is born by the FINAL drain', () => {
    const w = fightWorld();
    const parent = spawnAt(w, P0, 'chewer', 900, 500);
    let raided = false;
    // The bots act AFTER the post-sweep drain (hostTick's botManager.tick). Inside the tick the
    // out-of-tick hook is silent, so only `endHostTickSpawnWindow`'s final drain can birth the split.
    const bot = {
      tick(world: World): void {
        if (raided) return;
        raided = true;
        world.players.get(P1)!.raidPoints = 1;
        dispatch(world, { type: 'RAID_TARGET', target: { kind: 'creature', id: parent }, playerId: P1 } as never);
      },
    };
    const d = { ...hostDeps(), botManager: bot } as unknown as HostTickDeps;
    const s = makeHostTickState(w);
    runHostTick(w, d, s);
    expect(raided, 'fixture: the bot ran').toBe(true);
    expect(w.creatures.has(parent), 'fixture: the bot raid killed the chewer').toBe(false);
    expect(pendingRacialSpawns(w), 'nothing queued when the tick ends').toBe(0);
    expect(chewersOf(w), 'both HELLSPAWN children born by the end of the SAME tick').toBe(2);
  });
});
