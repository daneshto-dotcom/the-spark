/**
 * SPARK — S167 — the TIER-9 BOSS TOWER: disjointness, the one-shot contract, R137, and the geometry.
 *
 * What this file is FOR, stated up front because almost none of it is the happy path:
 *
 *   · ⭐ **DISJOINTNESS FROM THE TIER-3 RING, IN BOTH DIRECTIONS.** Two ring recipes over the same
 *     six shapes is the only genuinely new hazard this feature introduces, and it is decided by two
 *     clauses of one walk: a 9-ring fails the 3-walk's CLOSURE test, a 3-ring fails the 9-walk's
 *     REVISIT guard. Neither is obvious from reading either recipe, and if either broke, a player
 *     would build one tower and get the other.
 *   · ⭐ **THE ONE-SHOT CONTRACT, DRIVEN THROUGH THE REAL `runHostTick`.** A state poke is not
 *     evidence (the S136 standing lesson). The property that matters is that nine shapes buy exactly
 *     ONE boss: `igniteOneSpawnerRecipe` de-dups only against LIVE spawners, so a tower that removed
 *     itself while its ring still stood would re-ignite on the next bond and mint bosses forever.
 *   · ⛔ **AND THE INVERSE — THE RING IS NEVER BURNED FOR NOTHING.** `applySpawnCreature` refuses a
 *     second live boss of the same (owner, type) with a bare `return world` that the caller cannot
 *     observe, so an arm that razed unconditionally would destroy nine shapes and produce nothing.
 *     That is the owner's S157 B1 report — *"the shapes are being consumed nevertheless - not
 *     cool!"* — and it is pinned here at three times the price.
 *   · **R137** — an off-race player must not release another race's boss. Predicates are race-BLIND,
 *     so this lives in owner resolution and nothing else would catch its removal. ⚠ The tier-3
 *     equivalent shipped in S166 with NO test at all; this file covers the tier-9 half.
 *   · **THE CHORD CLEARANCE** — new at n=9 and invisible to the tier-3 geometry check, which
 *     iterates `bp.bonds` and therefore only ever measures ADJACENT pairs. A nine-ring whose
 *     non-adjacent nodes fall inside `AUTO_BOND_RADIUS` welds itself shut the instant it closes.
 *   · **The art paths** — a 404 is swallowed by design (`loadAtlas`'s bare `catch`), so a typo ships
 *     as the green procedural puppet rather than as an error. Checked against disk.
 */

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUTO_BOND_RADIUS,
  FIGHT_PHASE_TICKS,
  PHASE_DURATION_TICKS,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SparkType,
  T9_RELEASE_DELAY_TICKS,
} from '../../constants.ts';
import { ALL_RACES, RACE_FEED_SHAPE, type RaceId } from '../races.ts';
import {
  T9_BOSS_NAMES,
  T9_BOSS_TYPE,
  T9_TOWER_IDS,
  T9_TOWER_SIZE,
  isT9BossType,
  isT9TowerId,
  raceForT9BossType,
  raceForT9TowerId,
  t9BossAtlasBase,
  t9TowerLabel,
} from '../t9BossIds.ts';
import { RACE_TOWER_IDS, RACE_TOWER_SIZE } from '../raceTowerIds.ts';
import { EXPECTED_COMPONENT_SIZE, blueprintBill, blueprintCost, blueprintFor } from '../blueprints.ts';
import { ALL_BLUEPRINT_IDS } from '../blueprints.ts';
import { applyBuildBlueprint } from '../blueprintBuild.ts';
import { makeCastleBank } from '../castleBank.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { runSpawnerIgnition } from '../godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { spawnerIntervalTicks } from '../spawners/spawner.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { detectNonet } from '../sudokuEvent.ts';
import { isPentagramComponent } from './pentagram.ts';
import { findRingAnchors, isRingAt, ringMembersAt } from './ringShape.ts';
import { findT9TowerAnchors, t9TowerOwnerForAnchor } from './t9BossTower.ts';
import { listRecipes } from './index.ts';
import type { Controls } from '../../input/controls.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import { asPlayerId, asPrimitiveId, type BondId } from '../../types.ts';
import { makeWorld, type World } from '../world.ts';
import '../godlyRecipes/registerAll.ts';

const P0 = asPlayerId(0);
const COLOR = PLAYER_COLORS[0]!;

/* ── bare-graph builders, copied from `ringShape.test.ts` so the harness stays one shape ────── */

function makePrim(id: number, type: SparkType): Primitive {
  return {
    id: asPrimitiveId(id),
    type,
    placerColor: COLOR,
    placedBy: P0,
    createdTick: 0,
    pos: { x: id * 40, y: 0 },
    prevPos: { x: id * 40, y: 0 },
    bonds: new Set(),
    ownerColor: COLOR,
    lastOwnershipChange: 0,
    radius: 8,
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
}

function addBond(world: World, id: number, aId: number, bId: number): void {
  const a = world.primitives.get(asPrimitiveId(aId))!;
  const b = world.primitives.get(asPrimitiveId(bId))!;
  const bond: Bond = {
    id: id as unknown as BondId,
    aId: asPrimitiveId(aId),
    bId: asPrimitiveId(bId),
    a,
    b,
    restLength: 50,
    stiffnessTier: 'MID',
    damageFifths: 0,
    createdTick: 0,
  };
  world.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
}

/** A bare closed ring of `n` primitives of `type` at ids `base..base+n-1`. */
function ringWorld(n: number, type: SparkType, base = 10): World {
  const w = makeWorld(1);
  for (let i = 0; i < n; i++) w.primitives.set(asPrimitiveId(base + i), makePrim(base + i, type));
  for (let i = 0; i < n; i++) addBond(w, 100 + i, base + i, base + ((i + 1) % n));
  return w;
}

/* ── the REAL host-tick harness, copied from `goblinTowerCadence.test.ts` ────────────────────── */

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(seed = 1): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(seed)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/**
 * Stamp `race`'s tier-9 tower for a seat OF THAT RACE, ignite it, and put the match in FIGHT.
 *
 * ⚠ FIGHT IS NOT DECORATION. S157 P0 gates the whole spawner poll on `matchPhase === 'FIGHT'`, so a
 * harness left in BUILD would show a tower that never releases and read as a bug in the feature.
 */
function buildAndIgnite(race: RaceId, seatRace: RaceId = race): World {
  const w = makeWorld(0);
  w.isHost = true;
  const p = makeIdlePlayer(P0, COLOR);
  p.raceId = seatRace;
  w.players.set(P0, p);
  const bank = makeCastleBank();
  const id = T9_TOWER_IDS[race];
  for (const [type, count] of blueprintBill(id)) {
    bank[type as number] = (bank[type as number] ?? 0) + count;
  }
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, {
    type: 'BUILD_BLUEPRINT',
    playerId: P0,
    blueprintId: id,
    centre: { x: 420, y: 400 },
  });
  runSpawnerIgnition(w);
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 100_000;
  return w;
}

/** Run the REAL host tick past the release deadline, with margin. */
function runPastRelease(w: World, extra = 0): void {
  const d = deps();
  const st = makeHostTickState(w);
  for (let i = 0; i < T9_RELEASE_DELAY_TICKS + 20 + extra; i++) runHostTick(w, d, st);
}

const bossCount = (w: World, race: RaceId): number =>
  [...w.creatures.values()].filter((c) => c.type === T9_BOSS_TYPE[race]).length;

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S167 — the six boss towers are registered and identifiable', () => {
  it('registers exactly six MORE spawner recipes, one per race, with distinct ids', () => {
    const byId = new Map(listRecipes().map((r) => [r.id as string, r]));
    for (const race of ALL_RACES) {
      expect(byId.has(T9_TOWER_IDS[race] as string), `${race} boss tower registered`).toBe(true);
      expect(byId.get(T9_TOWER_IDS[race] as string)?.kind, race).toBe('spawner');
    }
    // Anti-vacuity: six DISTINCT ids, not one id six times.
    expect(new Set(ALL_RACES.map((r) => T9_TOWER_IDS[r])).size).toBe(6);
    // And they are distinct from the tier-3 six — twelve ids in total across the two tiers.
    expect(new Set(ALL_RACES.flatMap((r) => [T9_TOWER_IDS[r], RACE_TOWER_IDS[r]])).size).toBe(12);
  });

  it('the two tiers do not answer to each other’s predicates', () => {
    for (const race of ALL_RACES) {
      expect(raceForT9TowerId(T9_TOWER_IDS[race])).toBe(race);
      expect(isT9TowerId(T9_TOWER_IDS[race])).toBe(true);
      /*
       * ⛔ THE CROSS-TIER HALF, AND IT IS THE ONE THAT MATTERS. `isT9TowerId` returning true for a
       * tier-3 id would put a FEED button on a one-shot tower (`seatFeedTowerAt` keys off the tier-3
       * predicate) and would route a boss tower through the 3-ring re-validator.
       */
      expect(isT9TowerId(RACE_TOWER_IDS[race]), `t3 ${race}`).toBe(false);
      expect(raceForT9TowerId(RACE_TOWER_IDS[race]), `t3 ${race}`).toBe(null);
    }
    for (const other of ['goblinTower', 'pentagram', 'stinkTower', 'voltkin'] as const) {
      expect(isT9TowerId(other), other).toBe(false);
    }
  });

  it('boss CreatureTypes round-trip to their race and to nothing else', () => {
    for (const race of ALL_RACES) {
      expect(raceForT9BossType(T9_BOSS_TYPE[race])).toBe(race);
      expect(isT9BossType(T9_BOSS_TYPE[race])).toBe(true);
    }
    expect(new Set(ALL_RACES.map((r) => T9_BOSS_TYPE[r])).size).toBe(6);
    for (const other of ['chewer', 'goblinMelee', 't3Hound', 'raceUnit'] as const) {
      expect(isT9BossType(other), other).toBe(false);
      expect(raceForT9BossType(other), other).toBe(null);
    }
  });

  it('every boss has a name, and the label is DERIVED from it (one place to rename)', () => {
    for (const race of ALL_RACES) {
      expect(T9_BOSS_NAMES[race].length).toBeGreaterThan(0);
      expect(t9TowerLabel(race)).toBe(`${T9_BOSS_NAMES[race]} TOWER`);
    }
    expect(new Set(ALL_RACES.map((r) => T9_BOSS_NAMES[r])).size).toBe(6);
  });

  it('⛔ no boss NAME leaks into a serialized literal or an art path', () => {
    /*
     * The zombie boss's name is an unresolved trademark question with the owner. Keying the wire
     * literals and the art paths by RACE is what keeps that decision free — this test is what keeps
     * it free NEXT session, when someone "tidies" the tables by naming them after the bosses.
     */
    for (const race of ALL_RACES) {
      const name = T9_BOSS_NAMES[race].toLowerCase();
      expect(String(T9_TOWER_IDS[race]).toLowerCase(), `${race} GodlyId`).not.toContain(name);
      expect(String(T9_BOSS_TYPE[race]).toLowerCase(), `${race} CreatureType`).not.toContain(name);
      expect(t9BossAtlasBase(race).toLowerCase(), `${race} art path`).not.toContain(name);
    }
  });
});

describe('S167 — ⭐ the 9-ring and the 3-ring are MUTUALLY EXCLUSIVE, in both directions', () => {
  it('a 9-ring is NOT a 3-ring, from any node, for every race shape', () => {
    for (const race of ALL_RACES) {
      const shape = RACE_FEED_SHAPE[race];
      const w = ringWorld(T9_TOWER_SIZE, shape);
      expect(findRingAnchors(w, shape, T9_TOWER_SIZE).length, `${race} is a 9-ring`).toBe(9);
      /*
       * ⛔ THE CLOSURE TEST IS THE WHOLE DEFENCE HERE, and it is worth knowing which clause saves
       * us: every node of a 9-ring has EXACTLY two same-type neighbours, so the exact-2 clause is
       * satisfied and does nothing. Three hops from the anchor simply is not the anchor.
       */
      expect(findRingAnchors(w, shape, RACE_TOWER_SIZE), `${race} must not read as a 3-ring`)
        .toEqual([]);
    }
  });

  it('a 3-ring is NOT a 9-ring, from any node, for every race shape', () => {
    for (const race of ALL_RACES) {
      const shape = RACE_FEED_SHAPE[race];
      const w = ringWorld(RACE_TOWER_SIZE, shape);
      expect(findRingAnchors(w, shape, RACE_TOWER_SIZE).length, `${race} is a 3-ring`).toBe(3);
      // Here the REVISIT guard is what rejects it, at step 3.
      expect(findRingAnchors(w, shape, T9_TOWER_SIZE), `${race} must not read as a 9-ring`)
        .toEqual([]);
    }
  });

  it('and neither reads as a pentagram — the near-miss recipe', () => {
    const w = ringWorld(T9_TOWER_SIZE, SparkType.Triangle);
    for (const id of w.primitives.keys()) {
      expect(isPentagramComponent(w, id), `node ${String(id)}`).toBe(false);
    }
  });

  it('⛔ a 9-ring does NOT summon the NONET trial (owner R132 moved it to 12)', () => {
    /*
     * "Nine of one shape" used to be the sudoku trigger, and the owner moved NONET to 12 expressly
     * to free 9 for this tower. `detectNonet` requires a component of EXACTLY 12, so a bare 9-ring
     * cannot fire it — but that is a property of a constant someone could edit back.
     */
    for (const race of ALL_RACES) {
      const w = ringWorld(T9_TOWER_SIZE, RACE_FEED_SHAPE[race]);
      expect(detectNonet(w), `${race} 9-ring must not fire NONET`).toBe(null);
    }
  });

  it('ringMembersAt returns the nine members, distinct, and closing the ring', () => {
    const w = ringWorld(T9_TOWER_SIZE, SparkType.Dot);
    const anchor = asPrimitiveId(10);
    const ring = ringMembersAt(w, anchor, SparkType.Dot, T9_TOWER_SIZE);
    expect(ring).not.toBe(null);
    expect(ring!.length).toBe(9);
    expect(new Set(ring!).size, 'members must be distinct').toBe(9);
    expect(ring![0]).toBe(anchor);
    // Every id in the walk is a real primitive of the ring's own type.
    for (const id of ring!) expect(w.primitives.get(id)?.type).toBe(SparkType.Dot);
    // And the boolean wrapper agrees with the members form — they are one walk, not two.
    expect(isRingAt(w, anchor, SparkType.Dot, T9_TOWER_SIZE)).toBe(true);
    expect(ringMembersAt(w, anchor, SparkType.Dot, RACE_TOWER_SIZE)).toBe(null);
  });
});

describe('S167 — the blueprint geometry, including the hazard that is NEW at n=9', () => {
  it('costs 9, and the component size agrees', () => {
    for (const race of ALL_RACES) {
      expect(blueprintCost(T9_TOWER_IDS[race]), race).toBe(T9_TOWER_SIZE);
      expect(EXPECTED_COMPONENT_SIZE[T9_TOWER_IDS[race]], race).toBe(T9_TOWER_SIZE);
    }
  });

  it('all six are in ALL_BLUEPRINT_IDS — the list tsc cannot check', () => {
    for (const race of ALL_RACES) {
      expect(ALL_BLUEPRINT_IDS, `${race} boss tower must be buildable`)
        .toContain(T9_TOWER_IDS[race]);
    }
  });

  it('every stamped side is hand-buildable: 30..60 px', () => {
    for (const race of ALL_RACES) {
      const bp = blueprintFor(T9_TOWER_IDS[race]);
      expect(bp.nodes.length, race).toBe(9);
      expect(bp.bonds.length, `${race} ring is closed`).toBe(9);
      for (const [a, b] of bp.bonds) {
        const p = bp.nodes[a]!;
        const q = bp.nodes[b]!;
        const side = Math.hypot(p.dx - q.dx, p.dy - q.dy);
        expect(side, `${race} side <= auto-bond`).toBeLessThanOrEqual(AUTO_BOND_RADIUS);
        expect(side, `${race} side >= floor`).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it('⛔ NO NON-ADJACENT PAIR IS INSIDE AUTO_BOND_RADIUS — the self-welding chord', () => {
    /*
     * The hazard that does not exist at n=3 or n=5, and that the tier-3 geometry check is
     * STRUCTURALLY BLIND to because it iterates `bp.bonds` and therefore only sees adjacent pairs.
     *
     * If two non-adjacent nodes fell within 60 px, a chord would weld itself the instant the ring
     * closed, giving two nodes a THIRD same-type neighbour — and `isRingAt`'s exact-2 clause would
     * then reject the ring permanently. The tower would stamp perfectly and be dead on arrival, for
     * every race, every time, with no error anywhere.
     */
    for (const race of ALL_RACES) {
      const bp = blueprintFor(T9_TOWER_IDS[race]);
      const adjacent = new Set(bp.bonds.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
      let checked = 0;
      for (let i = 0; i < bp.nodes.length; i++) {
        for (let j = i + 1; j < bp.nodes.length; j++) {
          if (adjacent.has(`${i}-${j}`)) continue;
          const p = bp.nodes[i]!;
          const q = bp.nodes[j]!;
          const d = Math.hypot(p.dx - q.dx, p.dy - q.dy);
          expect(d, `${race} chord ${i}-${j} would auto-bond`).toBeGreaterThan(AUTO_BOND_RADIUS);
          checked++;
        }
      }
      // Anti-vacuity: a 9-ring has 9·(9-1)/2 - 9 = 27 non-adjacent pairs. Zero would prove nothing.
      expect(checked, `${race} non-adjacent pairs checked`).toBe(27);
    }
  });

  it('the bill is NINE of the race’s own feed shape and nothing else', () => {
    for (const race of ALL_RACES) {
      const bill = [...blueprintBill(T9_TOWER_IDS[race])];
      expect(bill.length, `${race} single-shape bill`).toBe(1);
      expect(bill[0]![0], `${race} shape`).toBe(RACE_FEED_SHAPE[race]);
      expect(bill[0]![1], `${race} count`).toBe(9);
    }
  });
});

describe('S167 — the release cadence is the tower’s own, not the chewer’s', () => {
  it('spawnerIntervalTicks returns the release delay for all six, and it is well under 8 s', () => {
    for (const race of ALL_RACES) {
      expect(spawnerIntervalTicks(T9_TOWER_IDS[race]), race).toBe(T9_RELEASE_DELAY_TICKS);
    }
    /*
     * The owner's whole budget for spawn + release + crumble is 8 s. Without a tier-9 arm this
     * function hands back the CHEWER's 15 s, which is nearly double the budget for the release beat
     * alone — with tsc green and every other test green. Pinned as arithmetic, at 60 Hz.
     */
    expect(T9_RELEASE_DELAY_TICKS).toBeLessThan(8 * 60);
  });
});

describe('S167 — ⛔ R137: an off-race seat cannot release another race’s boss', () => {
  it('the owner resolver refuses every race but the ring’s own', () => {
    for (const race of ALL_RACES) {
      const w = buildAndIgnite(race);
      const anchors = findT9TowerAnchors(w, race);
      expect(anchors.length, `${race} ring found`).toBeGreaterThan(0);
      const anchor = anchors[0]!;
      // The matching seat resolves.
      expect(t9TowerOwnerForAnchor(w, anchor, race), `${race} own seat`).toBe(P0);
      // Every other race's resolver refuses the SAME anchor.
      for (const other of ALL_RACES) {
        if (other === race) continue;
        expect(t9TowerOwnerForAnchor(w, anchor, other), `${other} on a ${race} ring`).toBe(null);
      }
    }
  });

  it('an off-race seat holding a valid ring never ignites a spawner at all', () => {
    // A vampire seat that somehow assembled nine Circles must not field the zombie boss.
    const w = buildAndIgnite('zombies', 'vampires');
    expect(w.creatureSpawners.size, 'no spawner may ignite off-race').toBe(0);
    runPastRelease(w);
    expect(bossCount(w, 'zombies'), 'no zombie boss for a vampire seat').toBe(0);
  });
});

describe('S167 — ⭐ THE ONE-SHOT CONTRACT, through the real host tick', () => {
  it('nine shapes buy exactly ONE boss, and the ring is consumed', () => {
    for (const race of ALL_RACES) {
      const w = buildAndIgnite(race);
      expect(w.creatureSpawners.size, `${race} tower ignited`).toBe(1);
      expect(w.primitives.size, `${race} ring standing`).toBe(9);
      expect(bossCount(w, race), `${race} no boss before the delay`).toBe(0);

      runPastRelease(w);

      expect(bossCount(w, race), `${race} exactly one boss`).toBe(1);
      expect(w.creatureSpawners.size, `${race} tower is gone`).toBe(0);
      expect(w.primitives.size, `${race} ring consumed`).toBe(0);
    }
  });

  it('⛔ and it does NOT re-ignite off a ring that is no longer there', () => {
    /*
     * THE DEFECT THIS PINS: `igniteOneSpawnerRecipe` de-dups on (anchor, owner) against the LIVE
     * spawner map only — its own docblock says *"CAN rebuild after removal"*. If the crumble left
     * the nine shapes standing, the very next bond formed anywhere would re-ignite the tower and the
     * seat would field an unlimited stream of bosses. Razing the ring is what makes one-shot mean
     * one-shot, so this asserts the CONSEQUENCE rather than the mechanism.
     */
    const w = buildAndIgnite('orcs');
    runPastRelease(w);
    expect(bossCount(w, 'orcs')).toBe(1);

    // Drive the ignition sweep again, hard, exactly as a later topology change would.
    for (let i = 0; i < 5; i++) runSpawnerIgnition(w);
    runPastRelease(w);

    expect(w.creatureSpawners.size, 'nothing may re-ignite').toBe(0);
    expect(bossCount(w, 'orcs'), 'still exactly one boss').toBe(1);
  });

  it('⭐⭐ a SECOND tower RELEASES a second boss — the owner report, inverted (S170 P2)', () => {
    /*
     * ⭐⭐ S170 P2 (owner) — **THIS TEST USED TO DEFEND THE BUG, AND IT IS INVERTED, NOT DELETED.**
     *
     * It previously asserted that a second tower WAITS while the first boss lives — no second boss,
     * nine shapes still standing. That is, verbatim, the owner's report: *"my wife did two pharaohs,
     * and the second waited until the first is dead"*, and again a session later: *"she tried to get
     * two and she could not build them. She can only build one at a time. The second one only came
     * out of a structure when the first one [died]."*
     *
     * So the suite was green ON the defect. Two gates blocked a second boss and S169 removed only
     * the one-live-per-(owner, type) latch in `applySpawnCreature` — reachable only by a direct
     * dispatch, hence provable in a unit test and invisible in play. The gate the owner actually hit
     * was the `bossAlive` check in `hostTick`'s release arm, and this assertion is what kept it.
     *
     * ⚠ THE S157 B1 CONCERN IT WAS WRITTEN FOR IS GENUINELY GONE, not overruled. It existed so a
     * tower would not burn nine shapes for a boss the latch would silently refuse (*"the shapes are
     * being consumed nevertheless - not cool!"*). With t9 types exempt from that latch the dispatch
     * SUCCEEDS, so the ring buys a boss instead of buying nothing. The price stays — a second boss
     * still costs a fresh nine of the race shape, which the spec names as the intended cap.
     *
     * It is kept in its inverted form so a future session that re-adds either gate fails HERE, with
     * the owner's words attached, rather than rediscovering this from a playtest.
     */
    const w = buildAndIgnite('demons');
    runPastRelease(w);
    expect(bossCount(w, 'demons'), 'first boss out').toBe(1);
    expect(w.primitives.size, 'first ring consumed').toBe(0);

    /*
     * Build a SECOND nine-ring for the same seat while its boss is still alive.
     *
     * ⚠ BACK TO BUILD FIRST, AND BOTH HALVES OF THAT ARE MEASURED RATHER THAN ASSUMED.
     * `applyBuildBlueprint` REFUSES SILENTLY — no primitives, no error, no effect of its own — in
     * two cases this harness hits: a stamp outside the seat's own zone ((1200, 700) and (800, 540)
     * both yield zero nodes on a one-seat board, while (420, 400) and (700, 800) work), and a stamp
     * attempted during FIGHT. Leaving the world in FIGHT here made this test fail with "second tower
     * ignited: expected +0 to be 1", which reads like a defect in the feature and is not one.
     *
     * The BUILD -> stamp -> FIGHT sequence is also simply what a player does.
     */
    w.matchPhase = 'BUILD';
    const bank = w.castleBanks.get(P0)!;
    for (const [type, count] of blueprintBill(T9_TOWER_IDS.demons)) {
      bank[type as number] = (bank[type as number] ?? 0) + count;
    }
    applyBuildBlueprint(w, {
      type: 'BUILD_BLUEPRINT',
      playerId: P0,
      blueprintId: T9_TOWER_IDS.demons,
      centre: { x: 700, y: 800 },
    });
    runSpawnerIgnition(w);
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 100_000;
    expect(w.creatureSpawners.size, 'second tower ignited').toBe(1);
    expect(w.primitives.size, 'second ring standing').toBe(9);

    runPastRelease(w, T9_RELEASE_DELAY_TICKS * 2);

    expect(bossCount(w, 'demons'), '⭐ TWO bosses alive for one seat — the owner asked for this').toBe(2);
    expect(w.primitives.size, 'the second ring is SPENT, because it bought a boss').toBe(0);
    expect(w.creatureSpawners.size, 'and the one-shot tower consumed itself as designed').toBe(0);
  });

  it('the boss carries no sourceSpawnerId — the one-live gate, not the goblin cap', () => {
    /*
     * This is what buys "only ONE of a seat's bosses alive at a time" for free. A non-null id would
     * route the boss through `underGoblinCaps` instead, sharing GOBLIN_MAX_GLOBAL with every goblin
     * tower — the S157 B1 / S165 W1-C defect a third time.
     */
    const w = buildAndIgnite('mummies');
    runPastRelease(w);
    const boss = [...w.creatures.values()].find((c) => c.type === T9_BOSS_TYPE.mummies);
    expect(boss, 'boss exists').toBeDefined();
    expect(boss!.sourceSpawnerId).toBe(null);
    expect(boss!.ownerPlayerId).toBe(P0);
  });
});

describe('S167 — the art paths resolve to files that exist', () => {
  it('every boss atlas path this code builds is on disk', () => {
    /*
     * `loadAtlas` swallows a failed fetch with a bare `catch {}` and falls back to the green
     * procedural puppet, so a typo here ships as merely-wrong-art rather than as an error. This is
     * the only gate that can see it.
     *
     * ⚠ SKIPPED, NOT FAILED, UNTIL THE ART IS BUILT. The atlases are generated in this batch's art
     * priority; asserting them before they exist would make a red suite the normal state, which is
     * how a red suite stops meaning anything. The moment one appears, all six are required.
     */
    const root = join(process.cwd(), 'public');
    const bases = ALL_RACES.map((r) => t9BossAtlasBase(r));
    const present = bases.filter((b) => existsSync(join(root, `${b}-atlas.png`)));
    if (present.length === 0) return; // art not generated yet — see the note above
    for (const base of bases) {
      expect(existsSync(join(root, `${base}-atlas.png`)), `${base}-atlas.png`).toBe(true);
      expect(existsSync(join(root, `${base}-anim.json`)), `${base}-anim.json`).toBe(true);
    }
  });
});

describe('S167 — ⭐ THE BOSS PERSISTS ACROSS PHASES, and keeps its damage', () => {
  /*
   * Owner, §B item 7: *"It persists across phases: if it survives to the end of that turn's FIGHT
   * phase it returns to the castle and attacks again the next phase, until killed."* And §D Q3a
   * rules the other half: it does NOT heal on the way — *"if it healed at the castle each phase,
   * 'until they die' would be unreachable for anything the defender can out-damage in one phase."*
   *
   * ⭐ BOTH HALVES ARE ALREADY TRUE, AND THIS TEST EXISTS BECAUSE I FIRST BELIEVED THEY WERE NOT.
   * The boss config's docblock originally said the persistence half was unimplemented. Checking
   * rather than assuming: NOTHING culls creatures at a phase edge — `world.creatures.clear()` is
   * reachable only from a title-return and a godly abort — and the creature fan-out is merely
   * DORMANT outside FIGHT (S149 P3), not destructive. So a boss survives the edge by construction,
   * and nothing anywhere resets `hp`.
   *
   * ⚠ WHAT IS GENUINELY NOT IMPLEMENTED is the literal *"returns to the castle"* WALK — all creature
   * locomotion advances toward the enemy and there is no retreat mode. The boss simply stands where
   * the whistle blew and resumes when the next FIGHT starts, which satisfies "attacks again the next
   * phase" without the journey. Named here so the distinction is a decision rather than a surprise.
   */
  it('survives a FIGHT → BUILD → FIGHT round trip with its damage intact', () => {
    const w = buildAndIgnite('vampires');
    runPastRelease(w);
    const boss = [...w.creatures.values()].find((c) => c.type === T9_BOSS_TYPE.vampires);
    expect(boss, 'boss released').toBeDefined();

    /*
      * Wound it, so "keeps its damage" is a measurement rather than a tautology on a full-health unit.
      *
      * ⚠ `ehp`, NOT `hp` — the field was renamed in S151 P2 precisely because its UNIT changed: it
      * holds `unitPoolFifths(config.hp, config.def)`, i.e. fifths, and a v28 peer reading `hp: 40`
      * would have seen forty hit points where the host meant eight. The rename is the guard.
      */
    const wounded = Math.max(1, Math.floor(boss!.ehp / 2));
    boss!.ehp = wounded;
    const bossId = boss!.id;

    // Force the edge: end FIGHT on the next tick and run through BUILD and into the next FIGHT.
    w.phaseEndsAtTick = w.tick + 1;
    const d = deps();
    const st = makeHostTickState(w);
    const phases = new Set<string>();
    for (let i = 0; i < PHASE_DURATION_TICKS + FIGHT_PHASE_TICKS + 200; i++) {
      runHostTick(w, d, st);
      phases.add(w.matchPhase);
    }

    // Anti-vacuity: the run must actually have crossed both edges, or this proves nothing.
    expect([...phases].sort(), 'the run must cross BUILD and FIGHT').toEqual(['BUILD', 'FIGHT']);

    const after = w.creatures.get(bossId);
    expect(after, '⛔ the boss must SURVIVE the phase edge — "lives until it dies"').toBeDefined();
    expect(after!.ehp, '⛔ and must NOT heal — §D Q3a').toBe(wounded);
    expect(bossCount(w, 'vampires'), 'still exactly one').toBe(1);
  });
});
