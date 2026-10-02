/**
 * SPARK — S192 (owner R192-M1) — ⛔ THE MRES = DEF IDENTITY ORACLE, OVER A LONG BOTS MATCH.
 *
 * *"it will look the same, but it'll be calculated differently."* The magic substrate threads a class
 * through every damage call and rescales magic hits by `(5+DEF)/(5+MRES)`. The claim the spec rests on:
 * **with every MRES equal to DEF, nothing in the game changes** — so every difference the shipped table
 * makes is the table's, never the plumbing's.
 *
 * Three identical four-seat bots matches (`c5WaveFiveBoard.fixtures.ts`) run in lockstep from tick 0
 * through two whole waves, the board topped up in each FIGHT with the units the magic sources hit
 * (Voltkins to zap, castle soldiers of four races, bosses, souleaters):
 *   · twin A — `isMagicClass` forced false: EVERY hit is physical. This is master's arithmetic exactly.
 *   · twin B — the real magic path, with `mresFor` forced to the type's own DEF (the identity table).
 *   · twin C — the real magic path with the SHIPPED table (⚠ MINE), the anti-vacuity twin.
 * A and B are compared with `hashWorldStateFull` EVERY tick and must never differ; B must have pushed
 * real magic hits through the rescale (so it was not identical by never running); C must diverge from A
 * (so the table genuinely reaches the board and this oracle could see a difference if one existed).
 */
import { describe, expect, it, vi } from 'vitest';
import type { CreatureType } from './creatures/creature.ts';
import type { DamageClass } from './magicResist.ts';
import type { RaceId } from './races.ts';

type Mode = 'physical' | 'equal' | 'shipped';
const H = vi.hoisted(() => ({
  mode: 'shipped' as 'physical' | 'equal' | 'shipped', magicCalls: 0, dotCalls: 0, rescaled: 0,
  /** ⭐ S193 — per-SOURCE counts of B's magic calls (see `sourceOf`). */
  src: {} as Record<string, number>,
  /** B's world while it steps, so a SCORCHED creature beat can be told passive vs cast by its victim's zone. */
  world: null as unknown,
  castZone: -1 as number,
}));

/**
 * ⭐ S193 (audit MED) — WHICH SOURCE sent this magic call: the first frame of the call stack that names a
 * magic source's own function. Test-only (V8 stacks keep function names); never in production. SCORCHED
 * GROUND and the SCORCHED EARTH cast share `burnCreatures`, so a creature beat is told apart by where its
 * victim stands — the cast zone is another seat's land, the passive is the caster's own.
 */
function sourceOf(phase: number): string {
  const stack = new Error().stack ?? '';
  const has = (fn: string): boolean => stack.includes(`at ${fn} `);
  if (has('burnStructures')) return 'scorchConnector';
  if (has('burnHelgas')) return 'scorchHelga';
  if (has('burnCreatures')) {
    const w = H.world as { creatures: Map<number, { pos: { x: number; y: number } }>; layout: unknown } | null;
    const c = w?.creatures.get(phase);
    return c !== undefined && zoneOf(c.pos, w!.layout as never) === H.castZone ? 'scorchCast' : 'scorchPassive';
  }
  if (has('stinkAuraTick')) return 'stinkAura';
  if (has('stinkCloudTick')) return 'stinkCloud';
  if (has('runZombieRotAura')) return 'rot';
  if (has('applyVoltkinChain')) return 'voltkinChain';
  if (has('landRaColumn')) return 'ra';
  return 'other';
}

vi.mock('./magicResist.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('./magicResist.ts')>();
  const { getCreatureConfig } = await import('./creatures/voltkin-config.ts');
  return {
    ...real,
    isMagicClass: (cls: DamageClass): boolean => (H.mode === 'physical' ? false : real.isMagicClass(cls)),
    mresFor: (type: CreatureType, race: RaceId | null): number =>
      (H.mode === 'equal' ? getCreatureConfig(type).def : real.mresFor(type, race)),
    landedFifths: (amount: number, cls: DamageClass, def: number, mres: number, phase: number): number => {
      const out = real.landedFifths(amount, cls, def, mres, phase);
      if (H.mode === 'equal') {
        if (cls === 'magic') H.magicCalls++;
        else if (typeof cls === 'object') H.dotCalls++;
        const k = sourceOf(phase);
        H.src[k] = (H.src[k] ?? 0) + 1;
      }
      if (H.mode === 'shipped' && out !== amount) H.rescaled++;
      return out;
    },
  };
});

// ⭐ S193 (audit MED) — grant SCORCHED GROUND / SCORCHED EARTH (`demons.l0`) to the NAGAS seat (no demons seat
// sits at this table), so both the passive and the cast run in a real bots match. The auditor's lever.
vi.mock('./racialPerks.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('./racialPerks.ts')>();
  return {
    ...real,
    seatHoldsPerk: (p: Parameters<typeof real.seatHoldsPerk>[0], perk: Parameters<typeof real.seatHoldsPerk>[1]): boolean =>
      real.seatHoldsPerk(p, perk) || (perk === 'demons.l0' && (p as { raceId?: RaceId }).raceId === 'nagas'),
  };
});

import { runHostTick } from './hostTick.ts';
import { dispatch, type World } from './world.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { startC5Match, topUpCreatures, WAVE_TICKS } from './c5WaveFiveBoard.fixtures.ts';
import { zoneOf, zoneCastleAnchor } from './zones.ts';
import { makeStinkCloud } from './defenders/stinkCloud.ts';
import { makeDefender } from './defenders/defender.ts';
import { STINK_HUB_TYPE, STINK_LEAF_TYPE } from './godlyRecipes/stinkTower.ts';
import { PRIMITIVE_MAX_HP } from './damage.ts';
import { SparkType, STINK_BAG_RADIUS } from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';
import { asDefenderId, asPlayerId, asPrimitiveId, asStinkCloudId, type BondId, type PlayerId } from '../types.ts';

const WAVES = 2;
const CREATURES = 28;
// ⭐ S193 — the zombie boss LEADS the mix: `topUpCreatures` picks type `floor(i / 4) % length`, so a type
// late in the list only spawns when 20+ slots are empty at once. After the master merge the board never
// emptied that far and B ran ZERO DoT beats (the anti-vacuity assertion below caught it); first in the
// list, every top-up that refills a slot can bring his ROT aura (a magic DoT) back onto the board.
const MIX: readonly CreatureType[] = ['t9BossZombies', 'voltkin', 'raceUnit', 't9BossDemons', 't3Souleater', 'voltkin', 'goblinMelee'];

/** The SCORCH caster (the nagas seat, see the mock) and the seat whose land it casts on. */
function scorchSeats(w: World): { caster: PlayerId; target: PlayerId } {
  const seats = [...w.players.values()].sort((a, b) => Number(a.id) - Number(b.id));
  const caster = seats.find((p) => p.raceId === 'nagas')!;
  const target = seats.find((p) => p.id !== caster.id)!;
  return { caster: caster.id, target: target.id };
}

/** A real star: `hub` + `leaves`, every leaf bonded to the hub, all owned by `seat`. Returns the hub. */
function star(w: World, seat: PlayerId, hubType: SparkType, leaves: readonly SparkType[], at: { x: number; y: number }): Primitive {
  const pl = w.players.get(seat)!;
  const prim = (type: SparkType, x: number, y: number): Primitive => {
    const p = {
      id: asPrimitiveId(w.nextPrimitiveId++), type, placerColor: pl.color, placedBy: seat,
      createdTick: 0, pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: pl.color,
      lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
    } as unknown as Primitive;
    w.primitives.set(p.id, p);
    return p;
  };
  const hub = prim(hubType, at.x, at.y);
  const OFFS: ReadonlyArray<readonly [number, number]> = [[32, 0], [16, 28], [-16, 28], [-32, 0], [-16, -28], [16, -28]];
  leaves.forEach((type, i) => {
    const [dx, dy] = OFFS[(i * OFFS.length) / leaves.length]!;
    const leaf = prim(type, at.x + dx, at.y + dy);
    const id = w.nextBondId++ as unknown as BondId;
    w.bonds.set(id, { id, aId: hub.id, bId: leaf.id, a: hub, b: leaf, restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 } as never);
    hub.bonds.add(id);
    leaf.bonds.add(id);
  });
  return hub;
}

/**
 * ⭐ S193 (audit MED) — the board pieces the bots never build on their own, placed IDENTICALLY in all three
 * twins: a STINK TOWER (real star + its defender) and a HELGA (real star + defender), both the TARGET seat's,
 * on its own land — so the SCORCHED EARTH cast burns the tower's connectors (connector DoT) and Helga
 * (the defender arm), and the tower's aura reaches whoever marches on that castle.
 */
function placeBoard(w: World): void {
  const { target } = scorchSeats(w);
  const home = zoneCastleAnchor(Number(target), w.layout);
  const sx = home.x + (home.x < 960 ? 160 : -160);
  const sAt = { x: sx, y: home.y };
  const sHub = star(w, target, STINK_HUB_TYPE, [STINK_LEAF_TYPE, STINK_LEAF_TYPE, STINK_LEAF_TYPE], sAt);
  const st = makeDefender({ id: asDefenderId(w.nextDefenderId++), kind: 'stinkTower', ownerPlayerId: target, anchorPrimitiveId: sHub.id, recipeId: 'stinkTower', pos: sAt, registeredAtTick: 0 });
  w.defenders.set(st.id, st);
  const hAt = { x: sx, y: home.y + (home.y < 540 ? 120 : -120) };
  const hHub = star(w, target, SparkType.Triangle, [SparkType.Spiral, SparkType.Circle, SparkType.Spiral, SparkType.Circle, SparkType.Spiral, SparkType.Circle], hAt);
  const helga = makeDefender({ id: asDefenderId(w.nextDefenderId++), kind: 'princess', ownerPlayerId: target, anchorPrimitiveId: hHub.id, recipeId: 'helga', pos: hAt, registeredAtTick: 0 });
  w.defenders.set(helga.id, helga);
}

/** The auditor's lever: keep three landed stink CLOUDS on the board, owned by three seats. */
function seedClouds(w: World): void {
  if (w.stinkClouds.size >= 3) return;
  for (const [x, y, seat] of [[960, 540, 1], [700, 400, 2], [1200, 700, 3]] as const) {
    const id = asStinkCloudId(w.nextStinkCloudId++);
    w.stinkClouds.set(id, makeStinkCloud({ id, pos: { x, y }, ownerPlayerId: asPlayerId(seat), landedAtTick: w.tick, radius: STINK_BAG_RADIUS }));
  }
}

/** ⭐ S193 — the floor EACH magic source must clear in B; losing any one source turns this red. */
const SOURCE_FLOORS: Readonly<Record<string, number>> = {
  rot: 1, voltkinChain: 1, ra: 1, scorchPassive: 1, scorchCast: 1, scorchHelga: 1, scorchConnector: 1, stinkAura: 1, stinkCloud: 1,
};

describe('S192 MRES — ⛔ MRES = DEF is byte-identical to the all-physical game over a bots match', () => {
  it('A (physical) and B (magic, MRES = DEF) agree on hashWorldStateFull every tick; C (shipped table) does not', async () => {
    const A = startC5Match(false);
    const B = startC5Match(false);
    const C = startC5Match(false);
    for (const m of [A, B, C]) placeBoard(m.world);
    expect(hashWorldStateFull(B.world)).toBe(hashWorldStateFull(A.world));
    const { caster, target } = scorchSeats(A.world);
    H.castZone = zoneOf(zoneCastleAnchor(Number(target), A.world.layout), A.world.layout) ?? -2;
    const end = WAVES * WAVE_TICKS;
    let compared = 0;
    let cDivergedAt = -1;
    let fights = 0;
    let castWave = -1;
    const step = (m: typeof A, mode: Mode): void => {
      H.mode = mode;
      H.world = m.world;
      m.bots.tick(m.world);
      runHostTick(m.world, m.deps, m.state);
      m.world.effects.length = 0;
    };
    while (A.world.tick < end && (A.world.gameState as string) === 'PLAYING') {
      if (A.world.tick % 500 === 0) await new Promise<void>((r) => setImmediate(r));
      if (A.world.matchPhase === 'FIGHT' && A.world.tick % 60 === 0) {
        fights++;
        const live = cDivergedAt < 0 ? [A, B, C] : [A, B];
        for (const m of live) topUpCreatures(m.world, CREATURES, MIX);
        for (const m of live) seedClouds(m.world);
        // ⭐ S193 — one SCORCHED EARTH cast per wave on the target seat's land, the same intent in every twin.
        if (castWave !== A.world.waveNumber) {
          castWave = A.world.waveNumber;
          for (const m of live) dispatch(m.world, { type: 'CAST_SCORCHED_EARTH', playerId: caster, zoneSeat: target });
        }
      }
      step(A, 'physical');
      step(B, 'equal');
      const ha = hashWorldStateFull(A.world);
      const hb = hashWorldStateFull(B.world);
      if (ha !== hb) throw new Error(`MRES = DEF DIVERGED from the all-physical game at tick ${A.world.tick}`);
      compared++;
      if (cDivergedAt < 0) {
        step(C, 'shipped');
        if (hashWorldStateFull(C.world) !== ha) cDivergedAt = A.world.tick;
      }
    }
    H.mode = 'shipped';
    console.log(`[S192 MRES differential] ${compared} ticks compared · B magic hits ${H.magicCalls} · B DoT ticks ${H.dotCalls} · C diverged at tick ${cDivergedAt} after ${H.rescaled} rescaled hits · per source ${JSON.stringify(H.src)}`);
    // ⭐ S193 — two whole waves, OR the whole match when it ends sooner: after the master merge the bots
    // can WIN inside wave 2 (a match that is over has no more ticks to compare). Never less than one wave.
    const ended = (A.world.gameState as string) !== 'PLAYING';
    expect(compared, 'at least one whole wave').toBeGreaterThanOrEqual(WAVE_TICKS);
    if (!ended) expect(compared, 'the run covered two whole waves').toBeGreaterThanOrEqual(end - 1);
    expect(fights, 'both FIGHTs ran').toBeGreaterThan(0);
    // ⛔ ANTI-VACUITY — B ran the magic arithmetic for real, many times, single hits AND DoT beats…
    expect(H.magicCalls, 'magic single hits went through the rescale in B').toBeGreaterThan(20);
    expect(H.dotCalls, 'magic DoT ticks went through the rescale in B').toBeGreaterThan(0);
    // …and ⭐ S193 — FROM EVERY SOURCE, each with its own floor, so losing one source cannot hide behind the rest.
    for (const [src, floor] of Object.entries(SOURCE_FLOORS)) {
      expect(H.src[src] ?? 0, `source ${src} reached the rescale in B`).toBeGreaterThanOrEqual(floor);
    }
    // …and the shipped table genuinely changes the board, so this oracle can see a difference.
    expect(cDivergedAt, 'the shipped MRES table reached the board').toBeGreaterThan(0);
    expect(H.rescaled).toBeGreaterThan(0);
  }, 600_000);
});
