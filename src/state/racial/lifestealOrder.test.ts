/**
 * SPARK — S188 fix round F1 — ⛔ LIFESTEAL MUST NOT MAKE A MELEE DEPEND ON `world.creatures` ORDER.
 *
 * The S155 N1 defect class. The strike batch defers DEATHS so a mutual exchange resolves
 * simultaneously whoever the loop reaches first. A lifesteal that heals INSIDE the batch reopens the
 * hole: a vampire unit whose own blow lands first is topped up before the incoming blow, and survives;
 * the identical unit a slot later is dead before its heal. So heals made during the batch are
 * ACCUMULATED (`World.pendingLifestealFifths`) and applied just before the deferred sweep, sorted by
 * creature id, skipping anyone who died this tick.
 *
 * The fixture is two identical duels on one board through the REAL host tick. In pair A the vampire
 * is inserted BEFORE its attacker; in pair B AFTER. Warband vs warband: 24-fifth pool, 18-fifth swing,
 * CRIMSON TIDE heals 9. The vampire starts at 12: blow-first it would be 12 + 9 − 18 = 3 and live;
 * struck-first it is 12 − 18 and dead. Both duels must end the same way.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, phaseDurationTicks } from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, makeCreature, type Creature } from '../creatures/creature.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import type { Controls } from '../../input/controls.ts';
import { asPlayerId, asSpawnerId, type PlayerId } from '../../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function board(): World {
  const w = makeWorld(0x188f);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  w.draft = null;
  const vamp = w.players.get(P0)!;
  vamp.raceId = 'vampires';
  vamp.draftPicks = ['racial', 'racial']; // CRIMSON TIDE, 50 %
  const other = w.players.get(P1)!;
  other.raceId = 'orcs';
  other.draftPicks = ['hp', 'def'];
  return w;
}

function unit(w: World, owner: PlayerId, x: number, y: number): Creature {
  const c = makeCreature(getCreatureConfig('t3Warband'), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  w.creatures.set(c.id, c);
  return c;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
const deps = (): HostTickDeps => ({
  spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
  botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
} as unknown as HostTickDeps);

describe('S188 F1 — a vampire melee resolves the same whatever the insertion order', () => {
  it('⛔ two identical duels, vampire inserted first vs second, end identically', () => {
    const w = board();
    // Pair A — the vampire first. Pair B — the attacker first. Far apart, far from both keeps' guns.
    const vA = unit(w, P0, 600, 250);
    const eA = unit(w, P1, 620, 250);
    const eB = unit(w, P1, 620, 830);
    const vB = unit(w, P0, 600, 830);
    vA.ehp = 12;
    vB.ehp = 12;

    const d = deps();
    const st = makeHostTickState(w);
    let struck = false;
    for (let t = 0; t < 200 && !struck; t++) {
      runHostTick(w, d, st);
      // the first exchange has landed once either attacker has been hurt
      struck = (w.creatures.get(eA.id)?.ehp ?? 0) < 24 || (w.creatures.get(eB.id)?.ehp ?? 0) < 24;
    }
    expect(struck, 'fixture: the duels engaged').toBe(true);
    const a = w.creatures.get(vA.id);
    const b = w.creatures.get(vB.id);
    expect(a === undefined, 'pair A vampire alive/dead').toBe(b === undefined);
    expect(a?.ehp).toBe(b?.ehp);
    expect(w.creatures.get(eA.id)?.ehp).toBe(w.creatures.get(eB.id)?.ehp);
  });
});
