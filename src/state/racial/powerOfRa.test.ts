/**
 * SPARK — S188 P6 — **POWER OF RA (`mummies.l0`)**, pinned.
 *
 * > *"once per fight, you can use the power of Ra … you get to choose where it lands … it will hit
 * > and damage buildings or creatures in that area."* — owner
 *
 * What this file has to catch is not "does the reducer set a field" — it is the three ways an aimed
 * ability silently fails in this codebase:
 *   1. a REFUSAL that is not one (a client that sends garbage, a seat without the perk, a second cast
 *      in one fight) — every refusal below is asserted as a true NO-OP on the whole world;
 *   2. a mechanic that exists and never REACHES what it changes — so the columns are driven through
 *      the real `runHostTick` and measured on real victims standing on each landing spot, the same
 *      discipline the Pharaoh's "exactly FIVE columns land" test was written for;
 *   3. state that does not survive the wire, the save, the hash or a rematch.
 */

import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  RA_COLUMN_ATK,
  RA_COLUMN_COUNT,
  RA_COLUMN_PEN,
  RA_COLUMN_RADIUS,
  RA_COLUMN_TICKS,
  RA_RITUAL_TICKS,
  SparkType,
} from '../../constants.ts';
import { asPlayerId, asPrimitiveId, asSpawnerId, type BondId, type CreatureId, type PlayerId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Controls } from '../../input/controls.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from '../hostTick.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { mulberry32 } from '../rng.ts';
import { attackFifths } from '../stats.ts';
import { raColumnImpactTick, raColumnPos } from '../bossSkillsPharaohRitual.ts';
import { generalPickForWave } from '../draft.ts';
import { draftOptionsFor } from '../draftEvent.ts';
import { RACIAL_PERK_BUILT, seatHoldsPerk } from '../racialPerks.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { applyNetSnapshot, netSnapshot, restore, snapshot } from '../save.ts';
import { BENCH_INTENT_POLICY } from '../benchGate.ts';
import { ELIMINATION_INTENT_POLICY } from '../elimination.ts';
import { CLIENT_INTENT_TYPES, isClientIntentAllowed, parseNetMessage } from '../../net/protocol.ts';
import { applyCastPowerOfRa, raStrikeColumnPos, RA_STRIKE_FIFTHS, runPowerOfRa } from './powerOfRa.ts';
import { raAimPoint, raCastRefusal, raStrikeFromWire, type RaStrike } from './powerOfRaRules.ts';

const P0 = asPlayerId(0); // the caster — MUMMIES, took POWER OF RA in the pre-wave-1 draft
const P1 = asPlayerId(1); // the enemy — ORCS

/** Well clear of both castles and of the spawn disc, so nothing else on the board touches a victim. */
const AIM = { x: 960, y: 260 };

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/**
 * A real 1v1 start: seat 0 is MUMMIES and takes the racial pick THROUGH THE DRAFT (so this also
 * proves the perk is choosable), seat 1 is ORCS and takes the general. Pinned to a long FIGHT.
 */
function raWorld(): World {
  const w = makeWorld(0x5a188);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: '1v1',
    isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'mummies' },
      { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'orcs' },
    ],
  });
  dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: 'racial' });
  dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P1, pick: generalPickForWave(1) });
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  return w;
}

const cast = (w: World, x: number, y: number, playerId: PlayerId = P0): void => {
  dispatch(w, { type: 'CAST_POWER_OF_RA', playerId, x, y });
};

let nextSentinel = 9100;
/** A chewer at (x, y) with a pool large enough to MEASURE a 300-fifth column instead of dying to it. */
function victim(w: World, owner: PlayerId, x: number, y: number): CreatureId {
  dispatch(w, {
    type: 'SPAWN_CREATURE',
    creatureType: 'chewer',
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    // A distinct sentinel per spawn — the one-live-per-(owner,type) latch eats a second `null`.
    sourceSpawnerId: asSpawnerId(nextSentinel++),
  });
  const id = [...w.creatures.keys()].at(-1)!;
  const c = w.creatures.get(id)!;
  c.ehp = 10_000;
  c.maxEhp = 10_000;
  return id;
}

/** Move a creature onto a point, verlet-safely (prevPos travels with it). */
function place(w: World, id: CreatureId, at: { x: number; y: number }): void {
  const c = w.creatures.get(id)!;
  c.pos = { x: at.x, y: at.y };
  c.prevPos = { x: at.x, y: at.y };
  c.targetPos = { x: at.x, y: at.y };
}

function addPrim(w: World, seat: PlayerId, x: number, y: number): Primitive {
  const player = w.players.get(seat)!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const prim: Primitive = {
    id, type: SparkType.Square, placerColor: player.color, placedBy: player.id,
    createdTick: w.tick, pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: player.color, lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, prim);
  return prim;
}

/** A real one-connector structure (both endpoints registered), rest length = actual length. */
function pair(w: World, seat: PlayerId, x: number, y: number): { bondId: BondId; a: Primitive; b: Primitive } {
  const a = addPrim(w, seat, x - 20, y);
  const b = addPrim(w, seat, x + 20, y);
  const bondId = w.nextBondId++ as unknown as BondId;
  w.bonds.set(bondId, {
    id: bondId, aId: a.id, bId: b.id, a, b,
    restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0,
  } as never);
  a.bonds.add(bondId);
  b.bonds.add(bondId);
  return { bondId, a, b };
}

function tickTo(w: World, d: HostTickDeps, s: HostTickState, target: number): void {
  let guard = 0;
  while (w.tick < target) {
    runHostTick(w, d, s);
    if (++guard > 100_000) throw new Error('tickTo ran away');
  }
}

/** Everything a no-op must leave alone, as one comparable value. */
const fingerprint = (w: World): string => `${hashWorldStateFull(w)}|${JSON.stringify(snapshot(w).players)}`;

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 P6 — POWER OF RA is live in the draft (RACIAL_PERK_BUILT)', () => {
  it('⭐ mummies are offered it before wave 1, and the draft pick makes the seat HOLD it', () => {
    expect(RACIAL_PERK_BUILT['mummies.l0']).toBe(true);
    expect(draftOptionsFor(1, 'mummies').racial).toBe('mummies.l0');
    const w = raWorld();
    expect(w.players.get(P0)!.draftPicks).toEqual(['racial']);
    expect(seatHoldsPerk(w.players.get(P0)!, 'mummies.l0')).toBe(true);
    expect(raCastRefusal(w, P0), 'a mummy seat that took it can cast in FIGHT').toBeNull();
  });

  it('the damage is the Pharaoh\'s column — attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN), one ladder', () => {
    expect(RA_STRIKE_FIFTHS).toBe(attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN));
    expect(RA_STRIKE_FIFTHS).toBe(300);
    // …and the landing spot IS his function, re-centred and seeded by the seat, not a copy.
    for (let k = 0; k < RA_COLUMN_COUNT; k++) {
      expect(raStrikeColumnPos(P1, k, AIM)).toEqual(raColumnPos(1, k, AIM.x, AIM.y));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 P6 — the reducer: legal only for a mummies.l0 seat, in FIGHT, once per fight, on the board', () => {
  it('⭐ a legal cast stamps exactly { wave, x, y, untilTick } and nothing else', () => {
    const w = raWorld();
    const t0 = w.tick;
    cast(w, AIM.x, AIM.y);
    expect(w.players.get(P0)!.raStrikes).toHaveLength(1);
    expect(w.players.get(P0)!.raStrikes[0]).toEqual({
      wave: w.waveNumber, x: AIM.x, y: AIM.y, untilTick: t0 + RA_RITUAL_TICKS,
    });
    expect(w.players.get(P1)!.raStrikes, 'the other seat is untouched').toEqual([]);
  });

  it('⭐ COUNCIL A1 — a float aim is STORED as its rounded integer, clamped to the canvas', () => {
    const w = raWorld();
    cast(w, 100.4, 1079.6);
    expect(w.players.get(P0)!.raStrikes[0]).toMatchObject({ x: 100, y: 1080 });
    expect(raAimPoint(0, 0)).toEqual({ x: 0, y: 0 });
    expect(raAimPoint(CANVAS_WIDTH, CANVAS_HEIGHT)).toEqual({ x: CANVAS_WIDTH, y: CANVAS_HEIGHT });
    expect(raAimPoint(CANVAS_WIDTH - 0.2, 0.4)).toEqual({ x: CANVAS_WIDTH, y: 0 });
  });

  const refusals: ReadonlyArray<readonly [string, (w: World) => void, () => { x: unknown; y: unknown }]> = [
    ['NaN x', () => {}, () => ({ x: Number.NaN, y: 300 })],
    ['NaN y', () => {}, () => ({ x: 300, y: Number.NaN })],
    ['+Infinity', () => {}, () => ({ x: Number.POSITIVE_INFINITY, y: 300 })],
    ['-Infinity', () => {}, () => ({ x: 300, y: Number.NEGATIVE_INFINITY })],
    ['off the left edge', () => {}, () => ({ x: -1, y: 300 })],
    ['off the right edge', () => {}, () => ({ x: CANVAS_WIDTH + 1, y: 300 })],
    ['off the top edge', () => {}, () => ({ x: 300, y: -0.5 })],
    ['off the bottom edge', () => {}, () => ({ x: 300, y: CANVAS_HEIGHT + 1 })],
    ['a string (the wire checks only `type`)', () => {}, () => ({ x: '300', y: 300 })],
    ['null (what JSON makes of NaN)', () => {}, () => ({ x: null, y: 300 })],
    ['missing', () => {}, () => ({ x: undefined, y: undefined })],
    ['an object', () => {}, () => ({ x: { valueOf: () => 300 }, y: 300 })],
    ['a seat that never took the perk', (w) => { w.players.get(P0)!.draftPicks.length = 0; }, () => AIM],
    ['a seat that took the GENERAL option', (w) => { w.players.get(P0)!.draftPicks.splice(0, 1, 'hp'); }, () => AIM],
    ['ANOTHER race holding its own racial', (w) => { w.players.get(P0)!.raceId = 'vampires'; }, () => AIM],
    ['during BUILD', (w) => { w.matchPhase = 'BUILD'; }, () => AIM],
    ['outside a PLAYING match', (w) => { w.gameState = 'WIN'; }, () => AIM],
    ['an ELIMINATED seat', (w) => { w.players.get(P0)!.castleHp = 0; }, () => AIM],
    ['a BENCHED seat', (w) => { w.players.get(P0)!.benchedUntilTick = w.tick + 600; }, () => AIM],
  ];

  it.each(refusals)('⛔ NO-OP: %s', (_label, arrange, aim) => {
    const w = raWorld();
    arrange(w);
    const before = fingerprint(w);
    const { x, y } = aim();
    expect(() => dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x: x as number, y: y as number }))
      .not.toThrow();
    // …and the reducer itself, bypassing dispatch's bench/elimination gates, refuses too.
    expect(() => applyCastPowerOfRa(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x: x as number, y: y as number }))
      .not.toThrow();
    expect(w.players.get(P0)!.raStrikes, 'nothing was stored').toEqual([]);
    expect(fingerprint(w), 'the refusal must leave the whole world as it found it').toBe(before);
  });

  it('⛔ NO-OP: a seat that does not exist', () => {
    const w = raWorld();
    const before = fingerprint(w);
    expect(() => cast(w, AIM.x, AIM.y, asPlayerId(3))).not.toThrow();
    expect(fingerprint(w)).toBe(before);
    expect(raCastRefusal(w, asPlayerId(3))).toBe('NO_SEAT');
  });

  it('⛔ NO-OP: a second cast in the SAME fight keeps the first aim, and says USED', () => {
    const w = raWorld();
    cast(w, AIM.x, AIM.y);
    const first = [...w.players.get(P0)!.raStrikes];
    w.tick += 5;
    cast(w, 200, 900);
    expect(w.players.get(P0)!.raStrikes, 'the second call changed nothing').toEqual(first);
    expect(raCastRefusal(w, P0)).toBe('USED');
  });

  it('the refusal NAMES each reason, because the button prints it', () => {
    const w = raWorld();
    expect(raCastRefusal(w, P1), 'orcs never hold it').toBe('NOT_HELD');
    w.matchPhase = 'BUILD';
    expect(raCastRefusal(w, P0)).toBe('NOT_FIGHT');
    w.matchPhase = 'FIGHT';
    w.players.get(P0)!.benchedUntilTick = w.tick + 10;
    expect(raCastRefusal(w, P0)).toBe('BENCHED');
    w.players.get(P0)!.castleHp = 0;
    expect(raCastRefusal(w, P0)).toBe('ELIMINATED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 P6 — ⭐⭐ REACH: the columns land through the REAL host tick', () => {
  it('⭐⭐ exactly FIVE columns, each on its own spot, each dealing 300 to an ENEMY creature — and 0 to the caster\'s', () => {
    const w = raWorld();
    const d = deps();
    const s = makeHostTickState(w);
    const enemy = victim(w, P1, 100, 900);
    const own = victim(w, P0, 140, 900);
    const t0 = w.tick;
    cast(w, AIM.x, AIM.y);
    const strike = w.players.get(P0)!.raStrikes[0]!;

    for (let k = 0; k < RA_COLUMN_COUNT; k++) {
      const impact = raColumnImpactTick(strike.untilTick, k);
      expect(impact, `column ${k} lands every RA_COLUMN_TICKS`).toBe(t0 + (k + 1) * RA_COLUMN_TICKS);
      tickTo(w, d, s, impact - 1);
      const spot = raStrikeColumnPos(P0, k, strike);
      place(w, enemy, spot);
      place(w, own, { x: spot.x + 6, y: spot.y });
      const eBefore = w.creatures.get(enemy)!.ehp;
      const oBefore = w.creatures.get(own)!.ehp;
      runHostTick(w, d, s); // THE impact tick
      expect(w.tick).toBe(impact);
      expect(eBefore - w.creatures.get(enemy)!.ehp, `column ${k} hit the enemy for exactly one column`)
        .toBe(attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN));
      expect(w.creatures.get(own)!.ehp, `column ${k} spared the caster's own unit`).toBe(oBefore);
    }

    // …and there is no sixth. Stand the enemy on every spot for another full ritual's worth.
    const after = w.creatures.get(enemy)!.ehp;
    for (let t = 0; t < RA_RITUAL_TICKS; t++) {
      place(w, enemy, raStrikeColumnPos(P0, t % RA_COLUMN_COUNT, strike));
      runHostTick(w, d, s);
    }
    expect(w.creatures.get(enemy)!.ehp, 'a sixth column landed').toBe(after);
  });

  it('⭐⭐ an ENEMY connector takes the column (300 fifths, it breaks) — the caster\'s own takes 0', () => {
    const w = raWorld();
    const d = deps();
    const s = makeHostTickState(w);
    cast(w, AIM.x, AIM.y);
    const strike = w.players.get(P0)!.raStrikes[0]!;
    const spot = raStrikeColumnPos(P0, 0, strike);
    const enemy = pair(w, P1, spot.x, spot.y - 18);
    const own = pair(w, P0, spot.x, spot.y + 18);
    w.connectorBreakHits.length = 0;

    tickTo(w, d, s, raColumnImpactTick(strike.untilTick, 0) - 1);
    expect(w.bonds.has(enemy.bondId), 'anti-vacuity: the enemy connector stood until the column').toBe(true);
    runHostTick(w, d, s);

    expect(
      w.connectorBreakHits.find((h) => h.bondId === enemy.bondId)?.amount,
      'the breaking hit on the ENEMY connector was the column, on the one ladder',
    ).toBe(attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN));
    expect(w.bonds.has(enemy.bondId), 'and it broke').toBe(false);
    expect(w.primitives.has(enemy.a.id) || w.primitives.has(enemy.b.id), 'the building is gone').toBe(false);

    expect(w.bonds.has(own.bondId), "the caster's own connector stands").toBe(true);
    expect(w.bonds.get(own.bondId)!.damageFifths, 'and took nothing').toBe(0);
    expect(w.primitives.get(own.a.id)!.hp).toBe(PRIMITIVE_MAX_HP);
    expect(w.primitives.get(own.b.id)!.hp).toBe(PRIMITIVE_MAX_HP);
    expect(w.connectorBreakHits.some((h) => h.bondId === own.bondId)).toBe(false);
  });

  it('⭐ an enemy connector too big to break in one column still BANKS the full 300', () => {
    const w = raWorld();
    cast(w, AIM.x, AIM.y);
    const strike = w.players.get(P0)!.raStrikes[0]!;
    const spot = raStrikeColumnPos(P0, 0, strike);
    // A 16-connector enemy chain: pool 16 × 21 = 336 > 300, so one column banks rather than cuts.
    const prims: Primitive[] = [];
    for (let i = 0; i < 17; i++) prims.push(addPrim(w, P1, spot.x - 400 + i * 50, spot.y + 300));
    let centre: BondId | null = null;
    for (let i = 0; i < 16; i++) {
      const id = w.nextBondId++ as unknown as BondId;
      w.bonds.set(id, { id, aId: prims[i]!.id, bId: prims[i + 1]!.id, a: prims[i], b: prims[i + 1],
        restLength: 50, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 } as never);
      prims[i]!.bonds.add(id);
      prims[i + 1]!.bonds.add(id);
      if (i === 8) centre = id;
    }
    // Move ONLY the centre connector under the column (its midpoint), its shapes just outside it.
    const c = w.bonds.get(centre!)!;
    c.a.pos = { x: spot.x - 45, y: spot.y + 60 }; c.a.prevPos = { ...c.a.pos };
    c.b.pos = { x: spot.x + 45, y: spot.y - 60 }; c.b.prevPos = { ...c.b.pos };
    w.tick = raColumnImpactTick(strike.untilTick, 0);
    runPowerOfRa(w);
    expect(w.bonds.get(centre!)?.damageFifths, 'the connector took the whole column').toBe(RA_STRIKE_FIFTHS);
  });

  it('⚠ the sun sets with the fight — a column due after FIGHT→BUILD never lands', () => {
    const w = raWorld();
    const d = deps();
    const s = makeHostTickState(w);
    cast(w, AIM.x, AIM.y);
    const strike = w.players.get(P0)!.raStrikes[0]!;
    tickTo(w, d, s, raColumnImpactTick(strike.untilTick, 1)); // two columns are down
    // End the fight for real, through the match clock.
    w.phaseEndsAtTick = w.tick + 1;
    tickTo(w, d, s, w.tick + 2);
    expect(w.matchPhase, 'anti-vacuity: the clock really flipped').toBe('BUILD');
    const enemy = victim(w, P1, 100, 900);
    const before = w.creatures.get(enemy)!.ehp;
    for (let k = 2; k < RA_COLUMN_COUNT; k++) {
      tickTo(w, d, s, raColumnImpactTick(strike.untilTick, k) - 1);
      place(w, enemy, raStrikeColumnPos(P0, k, strike));
      runHostTick(w, d, s);
    }
    expect(w.creatures.get(enemy)!.ehp, 'no column may land during BUILD').toBe(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 audit F1 — a column still breaks the connector if the caster is benched or out mid-strike', () => {
  it.each([
    ['benched by the hunter', (w: World) => { w.players.get(P0)!.benchedUntilTick = w.tick + 100_000; }],
    ['eliminated (castle fell)', (w: World) => { w.players.get(P0)!.castleHp = 0; }],
  ] as const)('⛔ %s after the cast: the enemy connector still breaks, no pool banked past it', (_l, arrange) => {
    const w = raWorld();
    cast(w, AIM.x, AIM.y);
    const strike = w.players.get(P0)!.raStrikes[0]!;
    const spot = raStrikeColumnPos(P0, 0, strike);
    /*
     * ⚠ A LONG connector: both shapes stand OUTSIDE the 70 px column, only the midpoint is inside.
     * With shapes inside the circle the area damage razes them and takes the bond with it, so the
     * test would pass even if the sever were refused — which is exactly how the first draft of this
     * test stayed green over the bug (caught by mutating the fix back out).
     */
    const a = addPrim(w, P1, spot.x - 90, spot.y);
    const b = addPrim(w, P1, spot.x + 90, spot.y);
    const bondId = w.nextBondId++ as unknown as BondId;
    w.bonds.set(bondId, { id: bondId, aId: a.id, bId: b.id, a, b, restLength: 180, stiffnessTier: 'MID',
      damageFifths: 0, createdTick: 0 } as never);
    a.bonds.add(bondId);
    b.bonds.add(bondId);
    // anti-vacuity: both shapes really are outside the column, so only a SEVER can take the bond
    expect(Math.hypot(a.pos.x - spot.x, a.pos.y - spot.y)).toBeGreaterThan(RA_COLUMN_RADIUS);
    expect(Math.hypot(b.pos.x - spot.x, b.pos.y - spot.y)).toBeGreaterThan(RA_COLUMN_RADIUS);
    arrange(w); // AFTER the cast, BEFORE the column
    w.tick = raColumnImpactTick(strike.untilTick, 0);
    runPowerOfRa(w);
    expect(w.bonds.has(bondId), 'the column that drained its pool must also cut it').toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 P6 — once per FIGHT, across two fights, through the real match clock', () => {
  it('⭐ cast in fight N → refused for the rest of N → refused in BUILD → legal again in fight N+1', () => {
    const w = raWorld();
    const d = deps();
    const s = makeHostTickState(w);
    const waveA = w.waveNumber;
    cast(w, AIM.x, AIM.y);
    expect(w.players.get(P0)!.raStrikes[0]!.wave).toBe(waveA);
    tickTo(w, d, s, w.tick + 30);
    cast(w, 300, 300);
    expect(w.players.get(P0)!.raStrikes[0]!.x, 'still fight N: the second call is refused').toBe(AIM.x);

    w.phaseEndsAtTick = w.tick + 1;
    tickTo(w, d, s, w.tick + 2);
    expect(w.matchPhase).toBe('BUILD');
    expect(w.waveNumber, 'the wave turns on entry into BUILD').toBe(waveA + 1);
    cast(w, 300, 300);
    expect(raCastRefusal(w, P0)).toBe('NOT_FIGHT');
    expect(w.players.get(P0)!.raStrikes[0]!.wave, 'refused in BUILD').toBe(waveA);

    w.phaseEndsAtTick = w.tick + 1;
    tickTo(w, d, s, w.tick + 2);
    expect(w.matchPhase).toBe('FIGHT');
    expect(raCastRefusal(w, P0), 'a new fight, a new call').toBeNull();
    cast(w, 300, 300);
    expect(w.players.get(P0)!.raStrikes[0]).toMatchObject({ wave: waveA + 1, x: 300, y: 300 });
    expect(raCastRefusal(w, P0)).toBe('USED');
  });

  it('⭐ a REMATCH starts with no strike stored (applyStartGame)', () => {
    const w = raWorld();
    cast(w, AIM.x, AIM.y);
    expect(w.players.get(P0)!.raStrikes).toHaveLength(1);
    w.gameState = 'TITLE';
    dispatch(w, {
      type: 'START_GAME', mode: '1v1', isHost: true,
      roster: [
        { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'mummies' },
        { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'orcs' },
      ],
    });
    expect(w.players.get(P0)!.raStrikes).toEqual([]);
  });

  it('⛔ the carry FSM does not forget a cast (pickup / drop rebuild the player)', async () => {
    const { pickup, drop } = await import('../../game/player.ts');
    const w = raWorld();
    cast(w, AIM.x, AIM.y);
    const p = w.players.get(P0)!;
    const carried = pickup(p, 77 as never);
    expect(carried.raStrikes).toEqual(p.raStrikes);
    expect(drop(carried).raStrikes).toEqual(p.raStrikes);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 P6 — the intent is on BOTH allowlists, and both policies decided it', () => {
  it('⭐ a client may send it, and the wire parser accepts it', () => {
    expect(isClientIntentAllowed('CAST_POWER_OF_RA')).toBe(true);
    expect(CLIENT_INTENT_TYPES.has('CAST_POWER_OF_RA')).toBe(true);
    const msg = { kind: 'INTENT', intentSeq: 1, action: { type: 'CAST_POWER_OF_RA', playerId: 0, x: 5, y: 6 } };
    expect(parseNetMessage(msg), 'KNOWN_GAME_ACTION_TYPES_RECORD must list it').toEqual(msg);
  });

  it('⛔ BENCH: deny — and dispatch really refuses a benched caster', () => {
    expect(BENCH_INTENT_POLICY.CAST_POWER_OF_RA).toBe('deny');
    const w = raWorld();
    w.players.get(P0)!.benchedUntilTick = w.tick + 600;
    const before = w.diagnostics.rejectReasons.actorBenched;
    cast(w, AIM.x, AIM.y);
    expect(w.diagnostics.rejectReasons.actorBenched).toBe(before + 1);
    expect(w.players.get(P0)!.raStrikes).toEqual([]);
  });

  it('⛔ ELIMINATION: deny — and dispatch really refuses a fallen caster', () => {
    expect(ELIMINATION_INTENT_POLICY.CAST_POWER_OF_RA).toBe('deny');
    const w = raWorld();
    w.players.get(P0)!.castleHp = 0;
    const before = w.diagnostics.rejectReasons.actorEliminated;
    cast(w, AIM.x, AIM.y);
    expect(w.diagnostics.rejectReasons.actorEliminated).toBe(before + 1);
    expect(w.players.get(P0)!.raStrikes).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 P6 — Player.raStrikes survives the save, the wire and the hash', () => {
  it('⭐ save → JSON → restore, and net snapshot → JSON → apply, both carry it exactly', () => {
    const w = raWorld();
    cast(w, AIM.x, AIM.y);
    const want = w.players.get(P0)!.raStrikes;

    const saved = JSON.parse(JSON.stringify(snapshot(w)));
    const r = makeWorld(1);
    restore(saved, r);
    expect(r.players.get(P0)!.raStrikes).toEqual(want);
    expect(r.players.get(P1)!.raStrikes).toEqual([]);

    const net = JSON.parse(JSON.stringify(netSnapshot(w)));
    const c = makeWorld(2);
    applyNetSnapshot(net, c);
    expect(c.players.get(P0)!.raStrikes).toEqual(want);
  });

  it('⭐ a seat that never cast costs no bytes — the key is absent, not null', () => {
    const w = raWorld();
    const players = snapshot(w).players as unknown as Record<string, unknown>[];
    for (const p of players) expect('raStrikes' in p).toBe(false);
  });

  it('⛔ a malformed strike from the wire rehydrates as "never cast", never as a strike', () => {
    const good: RaStrike = { wave: 3, x: 10, y: 20, untilTick: 900 };
    expect(raStrikeFromWire(good)).toEqual(good);
    for (const bad of [
      undefined, null, 7, 'x', [], {},
      { ...good, x: 10.5 }, { ...good, y: -1 }, { ...good, x: CANVAS_WIDTH + 1 },
      { ...good, wave: '3' }, { ...good, untilTick: null }, { wave: 3, x: 10, y: 20 },
    ]) {
      expect(raStrikeFromWire(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('⭐ every field of it moves the WIDE hash — two sims cannot disagree about a strike invisibly', () => {
    const w = raWorld();
    const none = hashWorldStateFull(w);
    const base: RaStrike = { wave: 1, x: 500, y: 400, untilTick: 1000 };
    w.players.get(P0)!.raStrikes = [base];
    const withStrike = hashWorldStateFull(w);
    expect(withStrike, 'null → a strike').not.toBe(none);
    for (const [k, v] of [['wave', 2], ['x', 501], ['y', 401], ['untilTick', 1001]] as const) {
      w.players.get(P0)!.raStrikes = [{ ...base, [k]: v }];
      expect(hashWorldStateFull(w), `raStrikes[0].${k}`).not.toBe(withStrike);
    }
  });

  it('⭐ DETERMINISM — two identical worlds, the same cast, 700 host ticks, the same wide hash', () => {
    const run = (): number => {
      // ⚠ The fixture's sentinel spawner id is a module counter, and `sourceSpawnerId` IS hashed —
      // so it is reset here, or the two runs differ by a test artefact rather than by the sim.
      nextSentinel = 9100;
      const w = raWorld();
      const d = deps();
      const s = makeHostTickState(w);
      victim(w, P1, AIM.x, AIM.y);
      pair(w, P1, AIM.x + 30, AIM.y + 30);
      pair(w, P0, AIM.x - 30, AIM.y - 30);
      cast(w, AIM.x, AIM.y);
      tickTo(w, d, s, w.tick + RA_RITUAL_TICKS + 100);
      return hashWorldStateFull(w);
    };
    expect(run()).toBe(run());
  });
});

void RA_COLUMN_RADIUS;
