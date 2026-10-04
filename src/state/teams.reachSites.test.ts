/**
 * ⭐⭐ S193 (audit F4, owner R192-T1) — **ONE TEAMMATE-vs-ENEMY REACH PAIR PER DAMAGE SITE, THROUGH THE HOST TICK.**
 *
 * *"teammates never damage each other — units, towers, and zone effects."* The census
 * (`teams.sites.test.ts`) proves each site ASKS the team predicate; it cannot prove the answer is reached,
 * and it is blind to an aliased operand (its docblock, audit F3). These pairs are the backstop: the same
 * fixture twice, once with a TEAMMATE of the source's owner in reach and once with an ENEMY. The teammate
 * must lose NOTHING to anything; the enemy must lose something (the control — without it a board where
 * nothing hurts anybody would pass).
 *
 * Board: four seats, teams [A, A, B, B] — seat 0 (the source's owner) and seat 1 are teammates.
 * Sites: the stink tower · Helga · the Voltkin's chain · the suicide goblin's blast · the lightning drone's
 * blast · the zombie boss's rot aura.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { PLAYER_COLORS, phaseDurationTicks } from '../constants.ts';
import { asDefenderId, asPlayerId, asSpawnerId, type PlayerId } from '../types.ts';
import type { Controls } from '../input/controls.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import { asCreatureId, makeCreature, type Creature, type CreatureType } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { makeDefender } from './defenders/defender.ts';
import { addBond, addPrim } from './s191PerfOracle.fixtures.ts';
import './godlyRecipes/princessHelga.ts';

const P = [0, 1, 2, 3].map((s) => asPlayerId(s));
const MATE = P[1]!;
const FOE = P[2]!;

function fourSeat(): World {
  const w = makeWorld(0x5193f4);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s]!, team: s < 2 ? 0 : 1 })),
    botSeats: [1, 2, 3],
  } as never);
  // ⭐ S195 — pin the S192 IDENTITY board (teammates NW+NE) these site tests were authored on. Since S195 a
  // [0,0,1,1] roster maps seat 1 to SW (`layoutForMatch`), which moves an enemy castle next to OPEN and lets its
  // race units into the measurement; the predicates under test do not depend on where the castles stand.
  // The arranged board is pinned on its own in `teams.zones.test.ts`.
  w.layout = 'QUADRANTS_4P';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT') * 10;
  w.creatures.clear();
  w.draft = null;
  return w;
}

function unit(w: World, owner: PlayerId, at: { x: number; y: number }, type: CreatureType = 't3Warband', held = true): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { ...at }, targetPos: { ...at },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  if (held) c.stunnedUntilTick = w.tick + 1_000_000;
  w.creatures.set(c.id, c);
  return c;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function ticks(w: World, n: number, each?: () => void): void {
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls, botManager: null,
    gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
  const st = makeHostTickState(w);
  for (let i = 0; i < n; i++) { runHostTick(w, d, st); each?.(); }
}

/** Open ground in seat 0's quadrant, > 300 px from every keep (`teams.reach.test.ts` pins it). */
const OPEN = { x: 600, y: 330 };

/** What the victim lost (its whole pool if it is gone). */
function lost(w: World, v: Creature, full: number): number {
  return full - (w.creatures.get(v.id)?.ehp ?? 0);
}

function pair(name: string, run: (victimOwner: PlayerId) => number): void {
  it(`⛔ ${name} — a TEAMMATE of its owner loses nothing`, () => {
    expect(run(MATE)).toBe(0);
  });
  it(`CONTROL — ${name} — an ENEMY in the same spot does`, () => {
    expect(run(FOE)).toBeGreaterThan(0);
  });
}

describe('S193 F4 — teammate vs enemy, per site, through the real host tick', () => {
  pair('the STINK TOWER (aura + aggro)', (owner) => {
    const w = fourSeat();
    const anchor = addPrim(w, 0, OPEN.x, OPEN.y);
    const d = makeDefender({
      id: asDefenderId(w.nextDefenderId++), kind: 'stinkTower', ownerPlayerId: P[0]!,
      anchorPrimitiveId: anchor.id, recipeId: 'stinkTower', pos: { ...OPEN }, registeredAtTick: w.tick,
    });
    w.defenders.set(d.id, d);
    const v = unit(w, owner, { x: OPEN.x + 50, y: OPEN.y });
    const full = v.ehp;
    ticks(w, 900);
    return lost(w, v, full);
  });

  pair('HELGA', (owner) => {
    const w = fourSeat();
    const anchor = addPrim(w, 0, OPEN.x, OPEN.y);
    const d = makeDefender({
      id: asDefenderId(w.nextDefenderId++), kind: 'princess', ownerPlayerId: P[0]!,
      anchorPrimitiveId: anchor.id, recipeId: 'helga', pos: { ...OPEN }, registeredAtTick: w.tick,
    });
    w.defenders.set(d.id, d);
    const v = unit(w, owner, { x: OPEN.x + 40, y: OPEN.y });
    const full = v.ehp;
    ticks(w, 900);
    return lost(w, v, full);
  });

  pair('the VOLTKIN’s chain (the hop beside an enemy it strikes)', (owner) => {
    const w = fourSeat();
    unit(w, P[0]!, OPEN, 'voltkin', false);
    unit(w, P[3]!, { x: OPEN.x + 30, y: OPEN.y }); // the enemy it strikes first
    const v = unit(w, owner, { x: OPEN.x + 55, y: OPEN.y }); // in hop range of the struck one
    const full = v.ehp;
    ticks(w, 600);
    return lost(w, v, full);
  });

  pair('the SUICIDE GOBLIN’s blast', (owner) => {
    const w = fourSeat();
    unit(w, P[0]!, OPEN, 'goblinSuicide', false);
    addPrim(w, 3, OPEN.x + 120, OPEN.y); // the enemy shape it runs at
    // It detonates at its strike reach (~50 px short of the shape, measured): stand inside its 70 px there.
    const v = unit(w, owner, { x: OPEN.x + 75, y: OPEN.y + 8 });
    const full = v.ehp;
    ticks(w, 500);
    return lost(w, v, full);
  });

  pair('the LIGHTNING DRONE’s blast', (owner) => {
    const w = fourSeat();
    unit(w, P[0]!, OPEN, 'lightningDrone', false);
    const a = addPrim(w, 3, OPEN.x + 110, OPEN.y);
    const b = addPrim(w, 3, OPEN.x + 140, OPEN.y);
    addBond(w, a, b); // the enemy connector it dives at
    // It detonates as soon as the connector is inside its 110 px (~16 px out, measured): stand inside that.
    const v = unit(w, owner, { x: OPEN.x + 40, y: OPEN.y + 10 });
    const full = v.ehp;
    ticks(w, 600);
    return lost(w, v, full);
  });

  pair('the ZOMBIE BOSS’s rot aura', (owner) => {
    const w = fourSeat();
    const boss = unit(w, P[0]!, OPEN, 't9BossZombies' as CreatureType, false);
    const v = unit(w, owner, { x: OPEN.x + 40, y: OPEN.y });
    const full = v.ehp;
    // He is pinned to the spot (a stunned boss takes no action, so he cannot simply be held).
    ticks(w, 400, () => {
      const b = w.creatures.get(boss.id);
      if (b !== undefined) { b.pos = { ...OPEN }; b.prevPos = { ...OPEN }; b.targetPos = { ...OPEN }; }
    });
    return lost(w, v, full);
  });
});
