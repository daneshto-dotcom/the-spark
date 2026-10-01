/**
 * SPARK — S191 (`s189/weld`, deploy #5) — THE DORMANT SEAM CENSUS, the rows that are SIM paths.
 *
 * Master gained code between this branch's base (15035b9, deploy #2) and deploy #4 (7404a49) that
 * reads defenders, and none of it was written knowing a Helga can now be `'DORMANT'` (R190-J: killed,
 * record kept, `ehp = null`, revived at the next phase edge). The census table lives in
 * `.claude/plans/S189_PROGRESS_weld.md` (S191 step 3); every row it calls safe BECAUSE of a gate is
 * proven here through the REAL host tick, not by reading the gate.
 *
 * ⭐ WRATH / POWER OF RA — a column's unit arm is `applyRadialDamage`, whose defender arm is
 * `damageEntity(defender)`. The brief's claim: `ehp === null` (damage.ts) excludes a dormant Helga.
 * Proven by landing a real column (`runHostTick` → `racialTick` → `runPowerOfRa`) on her, with a
 * CONTROL in the same column so the test cannot pass because the column missed.
 */
import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from './world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from './hostTick.ts';
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { makeGameStateExtras } from './gameState.ts';
import { mulberry32 } from './rng.ts';
import type { Controls } from '../input/controls.ts';
import { PRIMITIVE_MAX_HP, RA_RITUAL_TICKS, SparkType } from '../constants.ts';
import { asBondId, asCreatureId, asPlayerId, asPrimitiveId, asSpawnerId, type BondId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import { damageEntity } from './damage.ts';
import { makeCreature } from './creatures/creature.ts';
import { CHEWER_CONFIG } from './creatures/voltkin-config.ts';
import { RA_STRIKE_FIFTHS, raStrikeColumnPos } from './racial/powerOfRa.ts';
import { raColumnImpactTick } from './bossSkillsPharaohRitual.ts';
import './godlyRecipes/registerAll.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function worldInBuild(seed = 0x5191): World {
  const w = makeWorld(seed);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.creatures.clear();
  return w;
}

function mk(w: World, type: SparkType, x: number, y: number, seat = P0): Primitive {
  const player = w.players.get(seat)!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const prim: Primitive = {
    id, type, placerColor: player.color, placedBy: seat, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: player.color,
    lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, prim);
  return prim;
}

function bond(w: World, a: Primitive, b: Primitive): BondId {
  const bid = asBondId(w.nextBondId++);
  w.bonds.set(bid, {
    id: bid, aId: a.id, bId: b.id, a, b,
    restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
  });
  a.bonds.add(bid);
  b.bonds.add(bid);
  return bid;
}

function tick(w: World, st: HostTickState, n: number): void {
  const d = deps();
  const cursor = { lastMatcherTick: -1 };
  for (let i = 0; i < n; i++) {
    runGodlyMatcherCore(w, cursor);
    runHostTick(w, d, st);
    w.effects.length = 0; // the real frame loop's per-frame wipe
  }
}

/** Her hall for P0 at (500,300): Triangle hub + alternating Spiral/Circle leaves, ignited. */
function hall(w: World, st: HostTickState): Primitive {
  const hub = mk(w, SparkType.Triangle, 500, 300);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    bond(w, hub, mk(w, i % 2 === 0 ? SparkType.Spiral : SparkType.Circle, 500 + Math.cos(a) * 40, 300 + Math.sin(a) * 40));
  }
  w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 500, y: 300 }, bondCount: 6 });
  tick(w, st, 2);
  return hub;
}

function crossPhase(w: World, st: HostTickState): void {
  const from = w.matchPhase;
  w.phaseEndsAtTick = w.tick + 1;
  tick(w, st, 3);
  expect(w.matchPhase, `the phase must flip from ${from}`).not.toBe(from);
}

const helga = (w: World) => [...w.defenders.values()].find((d) => d.kind === 'princess');

describe('⭐ S191 census — a WRATH / POWER OF RA column does not touch a DORMANT Helga', () => {
  it('the column lands on her (the control in it is hit) and her record is untouched; she still revives', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const hub = hall(w, st);
    crossPhase(w, st); // → FIGHT
    const h = helga(w)!;
    expect(damageEntity(w, { kind: 'defender', id: h.id }, h.ehp!, 'creature', null), 'the blow kills').toBe(true);
    expect(helga(w)?.state).toBe('DORMANT');
    /*
     * Stand the dormant record FAR from her hall, so the column's CONNECTOR arm cannot reach the hall
     * (a severed own connector would legitimately stop the revive and hide what this test is about).
     * A dormant Helga never moves on her own (`applyDefenderTick` returns first), so this is a spot
     * she could have died on.
     */
    const at = { x: 900, y: 520 };
    h.pos = { ...at };
    h.prevPos = { ...at };

    // P1 casts: column 0 is aimed so it lands exactly on her (aim = spot − column-0 offset).
    const off = raStrikeColumnPos(P1, 0, { x: 0, y: 0 }, 0);
    const aim = { x: at.x - off.x, y: at.y - off.y };
    expect(raStrikeColumnPos(P1, 0, aim, 0), 'column 0 falls on her').toEqual(at);
    const untilTick = w.tick + RA_RITUAL_TICKS;
    w.players.get(P1)!.raStrikes = [{ wave: w.waveNumber, x: aim.x, y: aim.y, untilTick }];
    const impact = raColumnImpactTick(untilTick, 0);

    tick(w, st, impact - w.tick - 1); // up to the tick BEFORE the column
    // CONTROL — a P0 chewer placed on the same spot the frame before the column lands.
    const control = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(w.nextCreatureId++), ownerPlayerId: P0,
      pos: { ...at }, targetPos: { ...at }, spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(99),
    });
    control.ehp = RA_STRIKE_FIFTHS * 10; // survives the column, so the drop is readable
    w.creatures.set(control.id, control);
    const killHitsBefore = w.structureKillHits.length;
    tick(w, st, 1); // THE column lands on this tick (`runHostTick` advances the clock first)
    expect(w.tick, 'the column tick ran').toBe(impact);
    expect(w.matchPhase).toBe('FIGHT');

    expect(w.creatures.get(control.id)?.ehp, 'CONTROL: the column hit the spot — the P0 unit took it')
      .toBe(RA_STRIKE_FIFTHS * 10 - RA_STRIKE_FIFTHS);
    const after = helga(w)!;
    expect(after.state, 'she is still DORMANT').toBe('DORMANT');
    expect(after.ehp, 'no pool appeared and none went negative').toBeNull();
    expect(w.structureKillHits.length, 'no second killing blow was recorded on her').toBe(killHitsBefore);

    crossPhase(w, st); // → BUILD
    expect(helga(w)?.state, 'her hall stood, so the edge revives her').toBe('IDLE');
    expect(helga(w)?.anchorPrimitiveId).toBe(hub.id);
  });
});
