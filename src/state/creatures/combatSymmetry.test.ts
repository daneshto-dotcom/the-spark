/**
 * SPARK — S155 N1: **A MUTUAL MELEE EXCHANGE IS SYMMETRIC.**
 *
 * ## The report
 *
 * Owner, after a real cross-network 2-player match: *"player 2 had a way bigger army then me but
 * theyt couldnt even destroy one of my goblins. i think the spawn stats have only been implemented
 * foir player 1 and all other players just have the units as beauty without doing anything."*
 *
 * And when I guessed the armies were never engaging, the correction that cracked it: *"both players
 * goblins did appear to be fighting each other but only Player one spawn actuall managed to kill the
 * other players didnt seem to do any damange to player one"*.
 *
 * ## What it actually was — and it was neither of the two obvious answers
 *
 * The owner's hypothesis was a per-seat one (stats only wired for player 1). Mine was that units
 * never engaged. **Both were wrong.** A probe stood two identical melee goblins on top of each other,
 * one per seat, and varied each candidate independently:
 *
 * | setup | outcome (before the fix) |
 * |---|---|
 * | seat A inserted first | A kills B, **A takes ZERO damage** |
 * | seat B inserted first | B kills A, **B takes ZERO damage** |
 * | creature ids swapped as well | no effect whatsoever |
 *
 * ⛔ THE DECIDING VARIABLE WAS `world.creatures` ITERATION ORDER. Not the seat. Not the id. The
 * host-tick creature loop reached one of them first, its strike deleted the other outright, and every
 * later step in that same tick reads `world.creatures.get(id)` → undefined — so the loser never
 * reached its own fire tick. It never struck back even once.
 *
 * And the advantage was TOTAL rather than marginal because of the shipped stat table: a melee goblin
 * has `ehp = hp × (5+def) = 1 × 7 = 7` fifths and deals `atk × (5+pen) = 2 × 6 = 12`. Every goblin
 * except the Shield one-shots every other goblin, so first-strike WAS the whole fight.
 *
 * ⭐ Creatures are stored in SPAWN order, so whoever spawned first won every exchange for the whole
 * match — which is exactly why it read as *"only player 1's stats work"*. A per-seat theory and an
 * iteration-order bug are indistinguishable from the sofa.
 *
 * ## The fix, and what it deliberately does NOT touch
 *
 * `runHostTick` now opens a one-tick deferral set before the creature loop and sweeps it immediately
 * after, so a creature that takes a lethal blow still lands the strike it had already committed to.
 * A mutual engagement destroys BOTH, and a bigger army wins on attrition — the outcome the owner
 * expected and did not get.
 *
 * ⚠ THE ONE-SHOT ARITHMETIC IS LEFT ALONE ON PURPOSE. `GOBLIN_MELEE_HP = 1` is the owner's R70 ruling
 * (*"as fragile as a chewer"*) and ATK/DEF/PEN are R72's ladder. Those are balance numbers and not
 * mine to retune; removing the ORDER advantage is sufficient to make the fight fair. The consequence
 * is worth stating plainly for whoever tunes next: with both blows landing and everything one-shotting,
 * goblin-vs-goblin melee is now mutual annihilation, so armies trade 1:1. If survivors are wanted,
 * that is an HP/DEF decision.
 */
import { describe, expect, it } from 'vitest';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, makeCreature } from './creature.ts';
import { GOBLIN_MELEE_CONFIG } from './voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import type { Controls } from '../../input/controls.ts';
import { asPlayerId } from '../../types.ts';
import { PLAYER_COLORS, FIGHT_PHASE_TICKS } from '../../constants.ts';

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls, botManager: null, gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

const A = asPlayerId(0); // "player 1" — the host seat
const B = asPlayerId(1); // "player 2" — the joiner seat

function duelWorld(): World {
  const w = makeWorld(0xd0e1);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  });
  w.matchPhase = 'FIGHT'; // combat only runs in FIGHT
  w.phaseEndsAtTick = w.tick + FIGHT_PHASE_TICKS;
  return w;
}

/**
 * Two melee goblins, one per seat, 4 px apart so RANGE can never be the variable. `bFirst` controls
 * the `creatures` INSERTION order — which is what the host-tick loop follows, and which was the
 * actual bug. `idA`/`idB` vary the creature ids independently, to rule those out too.
 */
function seedDuel(w: World, idA: number, idB: number, bFirst: boolean): void {
  const pos = { x: 900, y: 540 };
  const mk = (id: number, owner: typeof A, x: number) => {
    const c = makeCreature(GOBLIN_MELEE_CONFIG, {
      id: asCreatureId(id), ownerPlayerId: owner, pos: { x, y: pos.y },
      targetPos: { ...pos }, spawnedAtTick: w.tick, sourceSpawnerId: null,
    });
    c.state = 'SEEKING'; // skip the SPAWNING window so both are live and symmetric
    return c;
  };
  const ga = mk(idA, A, pos.x);
  const gb = mk(idB, B, pos.x + 4);
  if (bFirst) { w.creatures.set(gb.id, gb); w.creatures.set(ga.id, ga); }
  else { w.creatures.set(ga.id, ga); w.creatures.set(gb.id, gb); }
  w.nextCreatureId = Math.max(idA, idB) + 1;
}

const CASES = [
  { label: 'seat A first in the loop', idA: 1, idB: 2, bFirst: false },
  { label: 'seat B first in the loop', idA: 1, idB: 2, bFirst: true },
  { label: 'seat B first AND lower id', idA: 2, idB: 1, bFirst: true },
  { label: 'seat A first AND higher id', idA: 2, idB: 1, bFirst: false },
] as const;

describe('S155 N1 — mutual melee is symmetric, whatever the loop order', () => {
  it.each(CASES)(
    '$label: BOTH die — neither seat is invulnerable',
    ({ idA, idB, bFirst }) => {
      const w = duelWorld();
      seedDuel(w, idA, idB, bFirst);
      const d = deps();
      const st = makeHostTickState(w);
      for (let t = 0; t < 60 * 30; t++) runHostTick(w, d, st);

      /*
       * ⭐ THE ASSERTION THE OWNER'S MATCH BOUGHT. Before the fix exactly one of these was DEAD and
       * the other sat on FULL ehp — and which one flipped purely with the insertion order. Both
       * halves are asserted: "B dies" alone would also be satisfied by the original bug.
       */
      expect(w.creatures.has(asCreatureId(idA)), 'seat A goblin should be dead').toBe(false);
      expect(w.creatures.has(asCreatureId(idB)), 'seat B goblin should be dead').toBe(false);
    },
  );

  it('⛔ the deferral NEVER survives a tick boundary (nothing serialized or hashed can see it)', () => {
    // The field is 'acknowledged' in FIELD_COVERAGE on the strength of exactly this property.
    const w = duelWorld();
    seedDuel(w, 1, 2, false);
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 200; t++) {
      runHostTick(w, d, st);
      expect(w.pendingCreatureDeaths).toBeNull();
    }
  });

  it('a LONE creature with no enemy is untouched — the deferral adds no incidental deaths', () => {
    // Anti-vacuity: the cases above would also pass if the fix simply killed everything.
    const w = duelWorld();
    const pos = { x: 900, y: 540 };
    const solo = makeCreature(GOBLIN_MELEE_CONFIG, {
      id: asCreatureId(9), ownerPlayerId: A, pos: { ...pos }, targetPos: { ...pos },
      spawnedAtTick: w.tick, sourceSpawnerId: null,
    });
    solo.state = 'SEEKING';
    w.creatures.set(solo.id, solo);
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 60 * 10; t++) runHostTick(w, d, st);
    const alive = w.creatures.get(asCreatureId(9));
    expect(alive, 'a goblin with nothing to fight must still be alive').not.toBeUndefined();
    expect(alive?.ehp).toBe(solo.ehp);
  });
});
