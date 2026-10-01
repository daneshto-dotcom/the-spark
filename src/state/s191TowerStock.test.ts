/**
 * SPARK — S191 (owner item 2, widened to SYSTEMIC) — **A UNIT ITS TOWER PRODUCED IS STOCK.**
 *
 * > *"pencil chewers die before the [fight] starts … they go back to their building for the build
 * > phase. They stay there, but then when fight starts, they all died. Like why? They should be
 * > continuously producing them … released in and fight during fight and then they continue being
 * > spawned just like a tier three tower or a castle."* — owner, S191
 * >
 * > *"It does the same thing to the drones from the drone hub … I had like three drones in each
 * > tower, and then the fight started. Boom, they disappeared, and it started producing them from
 * > zero … If you have some drone stock, you should be able to use them the next fight … it should
 * > be a systemic fix for all the other spawn that get the same … bug."* — owner, S191
 *
 * ## THE DIAGNOSIS (reproduced below, through the real host tick)
 *
 * Both units carried a clock that kept running while they sat at home. The chewer was
 * `persistent: false` with a 3000-tick (50 s) ABSOLUTE lifetime (S104 P1's churn); the drone was
 * `persistent: false` with an 8 s ABSOLUTE fly-time fuse. Spawners are dormant outside FIGHT (S157 P0),
 * so both are born in FIGHT; `recallArmies` sends them home at the whistle; the creature fan-out is
 * FIGHT-gated, so nothing ticks them through BUILD — and on the FIRST FIGHT tick the auto-delete
 * (`applyCreatureTick` step 1, `world.tick >= despawnAtTick`) and the drone's Step 1.5 fuse
 * (`world.tick >= despawnAtTick - 1`) fire for every one of them at once.
 *
 * ## THE FIX — ONE MECHANISM, THE TIER-3 / CASTLE ONE
 *
 * Tower units are `persistent: true` with a match-length lifetime, exactly as every tier-3 unit, every
 * goblin and the castle's race unit already are. They survive BUILD at home, are released at FIGHT,
 * and leave the board only by DYING or by being USED (a drone that detonates on an enemy connector).
 * The tower keeps producing up to its EXISTING ceiling: the drone hub's 3 in the air (its owner's S113
 * figure), and the chewer's none (S157 B8b — caps OFF, sentinels only).
 */
import { describe, expect, it } from 'vitest';
import {
  DRONE_EMIT_INTERVAL_TICKS,
  DRONE_MAX_PER_SPAWNER,
  PHASE_DURATION_TICKS,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SPAWN_INTERVAL_TICKS,
  SparkType,
} from '../constants.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { blueprintBill } from './blueprints.ts';
import { makeCastleBank } from './castleBank.ts';
import { runSpawnerIgnition } from './godlyMatcherCore.ts';
import { stampRefusalAt } from './blueprintLegality.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { damageEntity } from './damage.ts';
import { CREATURE_CONFIGS } from './creatures/voltkin-config.ts';
import { ownHomePos } from './creatures/creatureAI.ts';
import type { Controls } from '../input/controls.ts';
import type { Primitive } from '../game/primitive.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import { asPlayerId, asPrimitiveId, type BondId, type PlayerId, type SpawnerId } from '../types.ts';
import './godlyRecipes/pentagram.ts';
import './godlyRecipes/lightningHub.ts';

const P0 = asPlayerId(0); // demons: the pentagram and the hub
const P1 = asPlayerId(1);

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

interface Rig { w: World; step: (n: number) => void; spawners: Map<GodlyId, SpawnerId> }

function stamp(w: World, seat: PlayerId, id: GodlyId): void {
  const bank = w.castleBanks.get(seat) ?? makeCastleBank();
  for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(seat, bank);
  const home = castleAnchor(seat as unknown as number, w.layout);
  for (let r = 200; r <= 420; r += 20) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const at = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r };
      if (stampRefusalAt(w, at, seat, id) === null) {
        applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: seat, blueprintId: id, centre: at } as never);
        return;
      }
    }
  }
  throw new Error(`fixture: no legal site for ${id}`);
}

/**
 * A 1v1, in FIGHT, the whistle `fightLeft` ticks away, with ONE of seat 0's towers standing and ignited:
 *
 *   · `'hub'` — a lightning hub, and seat 1 has NO connector anywhere: a drone has nothing to home on
 *     and hovers at its hub, so the hub fills to its ceiling;
 *   · `'pentagram'` — a pentagram, plus a long seat-1 CHEW POST beside it: a chewer with nothing to
 *     chew marches on the enemy keep and its gun shoots it, so the post keeps every chewer busy at
 *     home, and only the rule under test decides whether one is still alive.
 */
function rig(tower: 'hub' | 'pentagram', fightLeft: number, picks: Array<'racial' | 'hp'> = []): Rig {
  const w = makeWorld(0x5191);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'demons' },
      { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'orcs' },
    ],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.draft = null;
  w.players.get(P0)!.draftPicks = [...picks];
  w.creatures.clear();
  const recipe: GodlyId = tower === 'hub' ? 'lightningHub' : 'pentagram';
  stamp(w, P0, recipe);
  runSpawnerIgnition(w);
  const spawners = new Map<GodlyId, SpawnerId>();
  for (const [id, sp] of w.creatureSpawners) spawners.set(sp.recipeId, id);
  if (!spawners.has(recipe)) throw new Error(`fixture: the ${recipe} did not ignite`);
  if (tower === 'pentagram') {
    const anchor = w.primitives.get(w.creatureSpawners.get(spawners.get(recipe)!)!.anchorPrimitiveId)!;
    chewPost(w, { x: anchor.pos.x - 150, y: anchor.pos.y - 160 });
  }
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + fightLeft;
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
  const st: HostTickState = makeHostTickState(w);
  // Only seat 0's tower units are measured: the castles' race units are removed as they appear, so
  // no soldier walks into the fixture and nothing but the rule under test decides the count.
  const step = (n: number): void => {
    for (let i = 0; i < n; i++) {
      runHostTick(w, d, st);
      for (const [id, c] of [...w.creatures]) if (c.sourceSpawnerId === null || (c.sourceSpawnerId as unknown as number) < 0) w.creatures.delete(id);
    }
  };
  return { w, step, spawners };
}

const of = (w: World, spawner: SpawnerId | undefined, type: string) =>
  [...w.creatures.values()].filter((c) => c.type === type && c.sourceSpawnerId === spawner);

/** Run to the whistle, through a WHOLE BUILD, and stop on the first tick of the next FIGHT. */
function acrossBuild(r: Rig): void {
  let guard = 0;
  while (r.w.matchPhase === 'FIGHT') { r.step(1); if (++guard > 100_000) throw new Error('runaway'); }
  expect(r.w.matchPhase, 'fixture: the whistle blew on the real clock').toBe('BUILD');
  while (r.w.matchPhase === 'BUILD') { r.step(1); if (++guard > 200_000) throw new Error('runaway'); }
  expect(r.w.matchPhase, 'fixture: the next FIGHT began on the real clock').toBe('FIGHT');
}

/** A 16-connector seat-1 chain (pool 16 × 21 = 336 fifths — many minutes of chewing). */
function chewPost(w: World, at: { x: number; y: number }, connectors = 16): void {
  const player = w.players.get(P1)!;
  const prims: Primitive[] = [];
  for (let i = 0; i < connectors + 1; i++) {
    const id = asPrimitiveId(w.nextPrimitiveId++);
    const x = at.x + i * 22;
    const p: Primitive = {
      id, type: SparkType.Square, placerColor: player.color, placedBy: P1, createdTick: w.tick,
      pos: { x, y: at.y }, prevPos: { x, y: at.y }, bonds: new Set(), ownerColor: player.color,
      lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
    };
    w.primitives.set(id, p);
    prims.push(p);
  }
  for (let i = 0; i < connectors; i++) {
    const a = prims[i]!;
    const b = prims[i + 1]!;
    const id = w.nextBondId++ as unknown as BondId;
    w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: 22, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 } as never);
    a.bonds.add(id);
    b.bonds.add(id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 item 2 — ⭐ REACH: the owner’s two cases, through the real host tick', () => {
  it('⭐⭐ PENCIL CHEWERS: the ones at home through a whole BUILD are alive when the next FIGHT starts', () => {
    const r = rig('pentagram', SPAWN_INTERVAL_TICKS * 2 + 60); // two emits, then the whistle
    const pent = r.spawners.get('pentagram');
    r.step(SPAWN_INTERVAL_TICKS * 2 + 30);
    const before = of(r.w, pent, 'chewer').map((c) => c.id);
    expect(before.length, 'anti-vacuity: the pentagram produced chewers in FIGHT').toBeGreaterThanOrEqual(2);
    acrossBuild(r);
    const after = of(r.w, pent, 'chewer').map((c) => c.id);
    expect(after, 'every chewer that went home for BUILD is alive at the FIGHT start').toEqual(expect.arrayContaining(before));
  });

  it('⭐⭐ DRONES: a hub holding its full stock at the end of BUILD still holds it — and RELEASES it — at FIGHT start', () => {
    const r = rig('hub', PHASE_DURATION_TICKS); // a long FIGHT with nothing to hit: the hub fills its ceiling
    const hub = r.spawners.get('lightningHub');
    r.step(PHASE_DURATION_TICKS - 30);
    const held = of(r.w, hub, 'lightningDrone').map((c) => c.id);
    expect(held.length, 'the hub filled to its existing ceiling and holds it').toBe(DRONE_MAX_PER_SPAWNER);
    acrossBuild(r);
    const atBell = of(r.w, hub, 'lightningDrone').map((c) => c.id);
    expect(atBell.sort(), 'no reset to zero — the same drones, at the bell').toEqual([...held].sort());
    // RELEASED: an enemy structure appears (16 connectors — enough for three blasts of at most
    // DRONE_MAX_CONNECTORS each), and the stock flies and detonates on it: USED, not lost.
    const bondsBefore = r.w.bonds.size;
    chewPost(r.w, { x: 1250, y: 300 });
    const post = r.w.bonds.size - bondsBefore;
    for (let i = 0; i < 1200 && held.some((id) => r.w.creatures.has(id)); i++) r.step(1);
    expect(held.some((id) => r.w.creatures.has(id)), 'the whole stock was spent on the enemy').toBe(false);
    expect(bondsBefore + post - r.w.bonds.size, 'each drone cut at least one enemy connector').toBeGreaterThanOrEqual(held.length);
    // …and the hub goes on producing after its stock is spent (the ceiling freed by USE, not by age).
    r.step(DRONE_EMIT_INTERVAL_TICKS + 1);
    expect(of(r.w, hub, 'lightningDrone').length, 'production resumed').toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 item 2 — production continues, the ceilings are the existing ones', () => {
  it('⭐ the pentagram keeps producing in FIGHT ON TOP of the stock it carried in (no ceiling: S157 B8b)', () => {
    const r = rig('pentagram', SPAWN_INTERVAL_TICKS + 60);
    const pent = r.spawners.get('pentagram');
    r.step(SPAWN_INTERVAL_TICKS + 30);
    acrossBuild(r);
    const stock = of(r.w, pent, 'chewer').length;
    expect(stock).toBeGreaterThanOrEqual(1);
    r.w.phaseEndsAtTick = r.w.tick + 1_000_000;
    r.step(SPAWN_INTERVAL_TICKS * 3);
    expect(of(r.w, pent, 'chewer').length, 'three more emits on the same cadence').toBe(stock + 3);
  });

  it('⛔ the hub’s ceiling HOLDS: a long idle FIGHT never puts more than its 3 in the air', () => {
    const r = rig('hub', 1_000_000);
    const hub = r.spawners.get('lightningHub');
    let most = 0;
    for (let i = 0; i < PHASE_DURATION_TICKS; i++) {
      r.step(1);
      most = Math.max(most, of(r.w, hub, 'lightningDrone').length);
    }
    expect(most).toBe(DRONE_MAX_PER_SPAWNER);
  });

  it('⭐ a chewer or drone still leaves by DYING — persistence is not immortality', () => {
    const r = rig('pentagram', 1_000_000);
    r.step(SPAWN_INTERVAL_TICKS + 30);
    const chewer = of(r.w, r.spawners.get('pentagram'), 'chewer')[0]!;
    damageEntity(r.w, { kind: 'creature', id: chewer.id }, 1_000, 'aura', null);
    expect(r.w.creatures.has(chewer.id)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 item 2 — HELLSPAWN, and a fallen pentagram, follow the same rule', () => {
  it('⭐ HELLSPAWN children persist too, and go home to their PENTAGRAM for BUILD', () => {
    const r = rig('pentagram', SPAWN_INTERVAL_TICKS + 60, ['hp', 'racial']); // demons.l5 — HELLSPAWN
    const pent = r.spawners.get('pentagram');
    r.step(SPAWN_INTERVAL_TICKS + 30);
    const parent = of(r.w, pent, 'chewer')[0]!;
    damageEntity(r.w, { kind: 'creature', id: parent.id }, 1_000, 'aura', null);
    r.step(2); // the split is queued and born after the sweep
    const children = [...r.w.creatures.values()].filter((c) => c.hellspawnGen === 1).map((c) => c.id);
    expect(children.length, 'anti-vacuity: the death split').toBe(2);
    acrossBuild(r);
    for (const id of children) expect(r.w.creatures.has(id), `child ${id} survived BUILD`).toBe(true);
    const anchor = r.w.primitives.get(r.w.creatureSpawners.get(pent!)!.anchorPrimitiveId)!;
    for (const id of children) {
      const c = r.w.creatures.get(id)!;
      expect(c.sourceSpawnerId, 'a child answers to its parent’s pentagram').toBe(pent);
      expect(Math.hypot(c.pos.x - anchor.pos.x, c.pos.y - anchor.pos.y), 'and went home to it').toBeLessThanOrEqual(60);
    }
  });

  it('⭐ when the pentagram FALLS its chewers do what a tier-3 tower’s units do: run home to the castle, and live', () => {
    const r = rig('pentagram', SPAWN_INTERVAL_TICKS + 60);
    const pent = r.spawners.get('pentagram')!;
    r.step(SPAWN_INTERVAL_TICKS + 30);
    const orphans = of(r.w, pent, 'chewer').map((c) => c.id);
    expect(orphans.length).toBeGreaterThanOrEqual(1);
    dispatch(r.w, { type: 'REMOVE_SPAWNER', spawnerId: pent });
    acrossBuild(r);
    const keep = castleAnchor(0, r.w.layout);
    for (const id of orphans) {
      const c = r.w.creatures.get(id);
      expect(c, 'an orphaned chewer is not deleted with its tower').toBeDefined();
      expect(Math.hypot(c!.pos.x - keep.x, c!.pos.y - keep.y), 'it went home to the castle').toBeLessThanOrEqual(60);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 item 2 — the ONE mechanism: every tower unit is on the tier-3 / castle lifecycle', () => {
  it('⭐ chewer and drone are persistent like the tier-3 unit and the castle’s race unit', () => {
    for (const t of ['chewer', 'lightningDrone', 'raceUnit', 't3Warband'] as const) {
      expect(CREATURE_CONFIGS[t].persistent, t).toBe(true);
      expect(CREATURE_CONFIGS[t].lifetimeTicks, `${t}: match-length`).toBe(CREATURE_CONFIGS.raceUnit.lifetimeTicks);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S192 fix round — the drone stock findings (STOCK-2 / STOCK-3 / STOCK-5)', () => {
  it('⛔ STOCK-3 (AUDIT-D1) — drones recalled with their OLD fuse still live are alive at the next FIGHT start (master: 2 → 0)', () => {
    const r = rig('hub', DRONE_EMIT_INTERVAL_TICKS * 2 + 60); // two emits, then the whistle — no idle-hold needed
    const hub = r.spawners.get('lightningHub');
    r.step(DRONE_EMIT_INTERVAL_TICKS * 2 + 30);
    const before = of(r.w, hub, 'lightningDrone').map((c) => c.id);
    expect(before.length, 'anti-vacuity: the hub produced drones in FIGHT').toBeGreaterThanOrEqual(1);
    acrossBuild(r);
    expect(of(r.w, hub, 'lightningDrone').map((c) => c.id), 'every drone that went home is alive at the bell')
      .toEqual(expect.arrayContaining(before));
  });

  it('⛔ STOCK-2 — a drone whose target is used up mid-flight goes back to its HUB, it does not hover in enemy ground', () => {
    const r = rig('hub', 1_000_000);
    const hub = r.spawners.get('lightningHub')!;
    r.step(PHASE_DURATION_TICKS - 30); // the hub fills its ceiling with idle stock
    const stock = of(r.w, hub, 'lightningDrone').map((c) => c.id);
    expect(stock.length).toBe(DRONE_MAX_PER_SPAWNER);
    const bondsBefore = r.w.bonds.size;
    chewPost(r.w, { x: 1500, y: 300 }, 1); // ONE enemy connector: the first blast uses it up
    let guard = 0;
    while (r.w.bonds.size > bondsBefore && guard++ < 2_000) r.step(1);
    expect(r.w.bonds.size, 'fixture: the target was used up').toBe(bondsBefore);
    const survivors = stock.filter((id) => r.w.creatures.has(id));
    expect(survivors.length, 'anti-vacuity: some stock outlived the target').toBeGreaterThanOrEqual(1);
    r.step(900); // long enough to fly home across the board
    for (const id of survivors) {
      const c = r.w.creatures.get(id);
      expect(c, `drone ${id} still alive (stock is kept)`).toBeDefined();
      const home = ownHomePos(r.w, c!)!;
      expect(Math.hypot(c!.pos.x - home.x, c!.pos.y - home.y), `drone ${id} went home to its hub`).toBeLessThanOrEqual(120);
    }
  });

  it('⛔ STOCK-5 — a held stock drone whose 60-minute deadline arrives does NOT fuse out at home (persistent ⇒ no fuse)', () => {
    const r = rig('hub', 1_000_000);
    const hub = r.spawners.get('lightningHub')!;
    r.step(PHASE_DURATION_TICKS - 30);
    const stock = of(r.w, hub, 'lightningDrone');
    expect(stock.length).toBe(DRONE_MAX_PER_SPAWNER);
    for (const c of stock) c.despawnAtTick = r.w.tick + 1; // as if held 60 minutes of match time
    r.step(3);
    for (const c of stock) expect(r.w.creatures.has(c.id), `drone ${c.id} kept`).toBe(true);
  });
});

