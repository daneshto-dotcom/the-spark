/**
 * SPARK — S188 — BLOOD FRENZY (orcs L0): when a seat's Warlord rages, its ORC units rage with him.
 *
 * The arithmetic (who is an orc, who can start it), the REACH through the real `runHostTick` (the bit
 * is written AND a frenzied unit really strikes twice as often), and the negatives the ruling turns
 * on: ⛔ a goblin owned by the orc seat passes ownership and must FAIL the type test; ⛔ a Warlord's
 * own rage latch is never cleared by the frenzy; a seat without the pick, another race with its
 * racial pick, and an ENEMY Warlord's rage all leave the seat's orcs calm.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType, WARLORD_RAGE_MULTIPLIER, phaseDurationTicks } from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { isFrenzySource, isOrcRacialCreatureType, runBloodFrenzy } from './bloodFrenzy.ts';
import {
  asCreatureId,
  creatureMaxEhp,
  makeCreature,
  rageMultiplier,
  ragedFireTick,
  type Creature,
  type CreatureType,
} from '../creatures/creature.ts';
import { CREATURE_CONFIGS, getCreatureConfig } from '../creatures/voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { creatureSpriteTint } from '../../render/goblinRenderer.ts';
import type { Controls } from '../../input/controls.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { DraftPick } from '../draft.ts';
import type { RaceId } from '../races.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSpawnerId, type BondId, type PlayerId } from '../../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const WARLORD: CreatureType = 't9BossOrcs';

function twoSeat(): World {
  const w = makeWorld(0x188b);
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
  return w;
}

function seatAs(w: World, seat: PlayerId, raceId: RaceId, picks: DraftPick[]): void {
  const pl = w.players.get(seat)!;
  pl.raceId = raceId;
  pl.draftPicks = [...picks];
}

function unit(w: World, type: CreatureType, owner: PlayerId, x: number, y: number): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  w.creatures.set(c.id, c);
  return c;
}

/** A Warlord of `owner`, frozen in place (a stun does not stop the rage LATCH — R152), at `pct` %. */
function warlord(w: World, owner: PlayerId, x: number, y: number, pct: number): Creature {
  const c = unit(w, WARLORD, owner, x, y);
  c.ehp = Math.floor((creatureMaxEhp(c) * pct) / 100);
  c.stunnedUntilTick = w.tick + 100_000;
  return c;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}
function ticks(w: World, n: number): void {
  const d = deps();
  const st = makeHostTickState(w);
  for (let i = 0; i < n; i++) runHostTick(w, d, st);
}

function addShape(w: World, owner: PlayerId, x: number, y: number): Primitive {
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const seat = owner as unknown as number;
  const p = {
    id, type: SparkType.Square, placerColor: PLAYER_COLORS[seat]!, placedBy: owner, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set<BondId>(), ownerColor: PLAYER_COLORS[seat]!,
    lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  } as unknown as Primitive;
  w.primitives.set(id, p);
  return p;
}
let nextBond = 18900;
function building(w: World, owner: PlayerId, x: number, y: number, n: number): BondId[] {
  let prev = addShape(w, owner, x, y);
  const out: BondId[] = [];
  for (let i = 1; i <= n; i++) {
    const next = addShape(w, owner, x + 32 * i, y);
    const id = asBondId(nextBond++);
    w.bonds.set(id, { id, aId: prev.id, bId: next.id, a: prev, b: next, restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 } as never);
    prev.bonds.add(id);
    next.bonds.add(id);
    out.push(id);
    prev = next;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 BLOOD FRENZY — who is an orc, and who can start it', () => {
  it('the three orc RACIAL types are orcs', () => {
    expect(isOrcRacialCreatureType('raceUnit')).toBe(true);
    expect(isOrcRacialCreatureType('t3Warband')).toBe(true);
    expect(isOrcRacialCreatureType('t9BossOrcs')).toBe(true);
  });

  it('⛔ NO goblin is an orc — every goblin type fails the type test', () => {
    const goblins = Object.keys(CREATURE_CONFIGS).filter((t) => t.startsWith('goblin'));
    expect(goblins.length, 'fixture: the goblin roster was found').toBeGreaterThanOrEqual(6);
    for (const t of goblins) expect(isOrcRacialCreatureType(t as CreatureType), t).toBe(false);
  });

  it('nor is anything else that is not an orc (direwolf, chewer, Voltkin, drone, other races)', () => {
    for (const t of ['direwolf', 'chewer', 'voltkin', 'lightningDrone', 't3Bat', 't3Hound', 't9BossVampires'] as CreatureType[]) {
      expect(isOrcRacialCreatureType(t), t).toBe(false);
    }
  });

  it('a source is a Warlord raging by his OWN latch — below the line, alive, enraged', () => {
    const w = twoSeat();
    const low = warlord(w, P0, 300, 300, 40);
    low.enraged = true;
    expect(isFrenzySource(low)).toBe(true);
    low.enraged = false;
    expect(isFrenzySource(low), 'the latch has not fired').toBe(false);
    const dead = warlord(w, P0, 300, 300, 40);
    dead.enraged = true;
    dead.ehp = 0;
    expect(isFrenzySource(dead), 'a corpse awaiting the sweep').toBe(false);
  });

  it('⛔ a Warlord raged BY the frenzy (healthy, or at exactly 50 %) is NOT a source — no self-sustain', () => {
    const w = twoSeat();
    const healthy = warlord(w, P0, 300, 300, 100);
    healthy.enraged = true;
    expect(isFrenzySource(healthy)).toBe(false);
    const half = unit(w, WARLORD, P0, 300, 300);
    half.ehp = creatureMaxEhp(half) / 2;
    expect(Number.isInteger(half.ehp), 'fixture: 374 halves exactly').toBe(true);
    half.enraged = true; // the latch KEEPS state at exactly 50 %
    expect(isFrenzySource(half)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 BLOOD FRENZY — ⭐ REACH through the real host tick', () => {
  function frenzyBoard(raceId: RaceId, picks: DraftPick[], warlordPct: number) {
    const w = twoSeat();
    seatAs(w, P0, raceId, picks);
    const boss = warlord(w, P0, 250, 250, warlordPct);
    const soldier = unit(w, 'raceUnit', P0, 300, 800);
    const raider = unit(w, 't3Warband', P0, 340, 800);
    const goblin = unit(w, 'goblinMelee', P0, 380, 800);
    const bat = unit(w, 'goblinBat', P0, 420, 800);
    return { w, boss, soldier, raider, goblin, bat };
  }

  it('⭐ his Warlord rages → the seat’s race unit and tier-3 orc rage with him (×2)', () => {
    const b = frenzyBoard('orcs', ['racial'], 40);
    ticks(b.w, 2);
    expect(b.boss.enraged, 'the Warlord’s own latch').toBe(true);
    expect(b.w.creatures.get(b.soldier.id)?.enraged).toBe(true);
    expect(b.w.creatures.get(b.raider.id)?.enraged).toBe(true);
    expect(rageMultiplier(b.w.creatures.get(b.soldier.id)!)).toBe(WARLORD_RAGE_MULTIPLIER);
  });

  it('⛔⛔ HIS RULING: the orc seat’s GOBLINS do NOT rage — and do not change colour', () => {
    const b = frenzyBoard('orcs', ['racial'], 40);
    ticks(b.w, 2);
    expect(b.w.creatures.get(b.goblin.id)?.enraged ?? false).toBe(false);
    expect(b.w.creatures.get(b.bat.id)?.enraged ?? false).toBe(false);
    // The tint the renderer draws is `creatureSpriteTint(seat, c.enraged === true)`, so it FOLLOWS
    // the bit: the goblin keeps its seat wash while the race unit beside it goes red.
    const seat = PLAYER_COLORS[0]!;
    const g = b.w.creatures.get(b.goblin.id)!;
    const s = b.w.creatures.get(b.soldier.id)!;
    expect(creatureSpriteTint(seat, g.enraged === true)).toBe(creatureSpriteTint(seat, false));
    expect(creatureSpriteTint(seat, s.enraged === true)).toBe(creatureSpriteTint(seat, true));
    expect(creatureSpriteTint(seat, true)).not.toBe(creatureSpriteTint(seat, false));
  });

  it('a calm Warlord (above half) starts nothing', () => {
    const b = frenzyBoard('orcs', ['racial'], 90);
    ticks(b.w, 2);
    expect(b.boss.enraged).toBe(false);
    expect(b.w.creatures.get(b.soldier.id)?.enraged ?? false).toBe(false);
  });

  it('⛔ NEGATIVE: an orc seat WITHOUT the pick — its Warlord rages alone', () => {
    const b = frenzyBoard('orcs', ['hp'], 40);
    ticks(b.w, 2);
    expect(b.boss.enraged).toBe(true);
    expect(b.w.creatures.get(b.soldier.id)?.enraged ?? false).toBe(false);
    expect(b.w.creatures.get(b.raider.id)?.enraged ?? false).toBe(false);
  });

  it('⛔ NEGATIVE: ANOTHER race with its racial pick is not frenzied', () => {
    // A vampire seat cannot build a Warlord (R137), so this plants one to isolate the RACE gate.
    const b = frenzyBoard('vampires', ['racial'], 40);
    ticks(b.w, 2);
    expect(b.w.creatures.get(b.soldier.id)?.enraged ?? false).toBe(false);
  });

  it('⛔ NEGATIVE: an ENEMY Warlord’s rage never frenzies your orcs', () => {
    const w = twoSeat();
    seatAs(w, P0, 'orcs', ['racial']);
    seatAs(w, P1, 'orcs', ['racial']);
    warlord(w, P1, 1700, 250, 40);
    const mine = unit(w, 'raceUnit', P0, 300, 800);
    ticks(w, 2);
    expect(w.creatures.get(mine.id)?.enraged ?? false).toBe(false);
  });

  /**
   * ⛔⛔ THIS IS THE TEST THAT FOUND THE S168 DEFECT — `ragedFireTick` in `creatures/creature.ts`.
   * Its first run measured a frenzied raider banking **0** against a calm one's 54: rage halved the
   * cadence to 30 and left the fire tick at 30, so an enraged unit left ATTACKING one tick before it
   * would have struck. An enraged Warlord had never landed a blow since S168.
   *
   * ⚠ TWENTY connectors (pool 20 × 25 = 500), so no connector breaks inside the window: a break
   * SPENDS the pool and drains `damageFifths`, which would hide swings from this sum.
   */
  it('⭐ BEHAVIOUR, not just the bit: a frenzied orc banks EXACTLY TWICE the damage on a building', () => {
    const banked = (picks: DraftPick[], type: CreatureType): number => {
      const w = twoSeat();
      seatAs(w, P0, 'orcs', picks);
      warlord(w, P0, 150, 150, 40);
      const bonds = building(w, P1, 500, 300, 20);
      const orc = unit(w, type, P0, 495, 300);
      orc.ehp = 10_000; // hold it on the board; this measures the swing rate, nothing else
      ticks(w, 600);
      expect(bonds.every((b) => w.bonds.has(b)), 'fixture: nothing broke, so nothing was drained').toBe(true);
      return bonds.reduce((s, b) => s + (w.bonds.get(b)?.damageFifths ?? 0), 0);
    };
    for (const type of ['t3Warband', 'raceUnit'] as CreatureType[]) {
      const calm = banked(['hp'], type);
      const frenzied = banked(['racial'], type);
      expect(calm, `fixture: the calm ${type} strikes the building`).toBeGreaterThan(0);
      expect(frenzied, `${type}: twice the swings`).toBe(calm * WARLORD_RAGE_MULTIPLIER);
    }
  });

  it('⛔ ragedFireTick: an enraged swing lands INSIDE its halved cycle; a calm one is unchanged', () => {
    for (const cfg of Object.values(CREATURE_CONFIGS)) {
      const cadence = Math.max(1, Math.round(cfg.attackCadenceTicks / WARLORD_RAGE_MULTIPLIER));
      if (cfg.attackFireTick >= cfg.attackCadenceTicks) continue; // the chewer's legacy span — never enraged
      expect(ragedFireTick(cfg.attackFireTick, { enraged: true }), cfg.type).toBeLessThan(cadence);
      expect(ragedFireTick(cfg.attackFireTick, { enraged: false })).toBe(cfg.attackFireTick);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 BLOOD FRENZY — ⛔ a Warlord’s OWN rage latch is untouched by the frenzy', () => {
  it('⛔ the frenzy ending never calms a Warlord — only his own latch does', () => {
    // A seat holding the pick with NO source (the only Warlord sits at exactly 50 %, where the latch
    // keeps whatever state he is in), so the frenzy is OFF this tick and runs its clear.
    const w = twoSeat();
    seatAs(w, P0, 'orcs', ['racial']);
    const half = unit(w, WARLORD, P0, 250, 250);
    half.ehp = creatureMaxEhp(half) / 2;
    half.enraged = true;
    half.stunnedUntilTick = w.tick + 100_000;
    const soldier = unit(w, 'raceUnit', P0, 300, 800);
    soldier.enraged = true; // left over from a frenzy that has now ended
    ticks(w, 1);
    expect(w.creatures.get(soldier.id)?.enraged ?? false, 'the frenzy clears the race unit').toBe(false);
    expect(half.enraged, 'but the Warlord keeps the state HIS latch holds at exactly 50 %').toBe(true);
  });

  it('⛔ when the raging Warlord dies, the frenzy ends — a frenzy-raged second Warlord cannot sustain it', () => {
    const w = twoSeat();
    seatAs(w, P0, 'orcs', ['racial']);
    const source = warlord(w, P0, 250, 250, 40);
    const second = warlord(w, P0, 350, 250, 100);
    const soldier = unit(w, 'raceUnit', P0, 300, 800);
    ticks(w, 2);
    expect(second.enraged, 'the healthy Warlord rages with the first').toBe(true);
    expect(w.creatures.get(soldier.id)?.enraged).toBe(true);

    w.creatures.delete(source.id);
    ticks(w, 2);
    expect(second.enraged, 'his own latch calmed him (100 % > 50 %)').toBe(false);
    expect(w.creatures.get(soldier.id)?.enraged ?? false).toBe(false);
  });

  it('runBloodFrenzy on its own never lowers a Warlord’s bit, whatever the seat', () => {
    const w = twoSeat();
    seatAs(w, P0, 'orcs', ['racial']);
    const own = warlord(w, P0, 250, 250, 45);
    own.enraged = true;
    runBloodFrenzy(w);
    expect(own.enraged).toBe(true);
  });
});
