/**
 * SPARK — S191 P12 (`s191/perf`) — THE NAV-UNIT ENEMY INDEX ON THE EDGES ITS ARGUMENT RESTS ON.
 *
 * Inside the S190 epoch, `pickNavUnit` re-acquires from a per-seat list of live creature objects,
 * re-validated by a fingerprint (Map identity, size, `nextCreatureId`), reading everything else live
 * (`EnemyCreatureIndex` in `creatureAI.ts`). Every case below compares the REAL function against the
 * VERBATIM pre-change one (`navUnitReference.fixtures.ts`) for every creature on the board — with no
 * lock, and holding each of several locks — both INSIDE an open epoch (the cache in use) and outside
 * it (the live scan), after each kind of change the cache has to survive:
 *   · an exact distance tie inserted high-id-first; the range boundary exactly at the acquire radius;
 *   · an untargetable TYPE (locust cloud), and the Ra ritual stamped on a unit AFTER the index was built;
 *   · a unit killed under the deferral (still in the Map — ⭐ S192 T13: NEITHER side may return it now);
 *   · a unit in `DESPAWNING` — still a target on both sides (no fade clause, by ruling);
 *   · a removal, a birth, and a removal + birth that leaves the Map's size unchanged;
 *   · a unit MOVED after the index was built, and one at NaN;
 *   · the epoch left open across a tick, and opened on a different world;
 *   · 200 random boards with random churn between queries.
 * The real-match proof is `s191Perf.differential.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import type { World } from '../world.ts';
import { closeBondTargetEpoch, openBondTargetEpoch, pickNavUnit } from './creatureAI.ts';
import { referencePickNavUnit } from './navUnitReference.fixtures.ts';
import { makeCreature, type CreatureType } from './creature.ts';
import { CREATURE_CONFIGS } from './voltkin-config.ts';
import { damageCreature, removeCreature } from './creatureLifecycle.ts';
import { birthCreature, emptyBoard } from '../s191PerfOracle.fixtures.ts';
import { GOBLIN_UNIT_ACQUIRE_RADIUS, GOBLIN_UNIT_LEASH_RADIUS } from '../../constants.ts';
import { asCreatureId, asPlayerId, type CreatureId } from '../../types.ts';

const ACQ = GOBLIN_UNIT_ACQUIRE_RADIUS * GOBLIN_UNIT_ACQUIRE_RADIUS;
const LEASH = GOBLIN_UNIT_LEASH_RADIUS * GOBLIN_UNIT_LEASH_RADIUS;

function board(): World {
  const w = emptyBoard();
  w.creatures.clear();
  w.tick = 1000;
  w.matchPhase = 'FIGHT';
  return w;
}

/** Insert under an id the caller allocated — lets a case control Map order against id order. */
function insertAs(w: World, id: CreatureId, seat: number, x: number, y: number, type: CreatureType = 'goblinMelee'): void {
  const c = makeCreature(CREATURE_CONFIGS[type], {
    id, ownerPlayerId: asPlayerId(seat), pos: { x, y }, targetPos: { x: 960, y: 540 },
    spawnedAtTick: w.tick, clock: w, draftPicks: w.players.get(asPlayerId(seat))?.draftPicks,
  });
  w.creatures.set(id, c);
}

interface Tally { compared: number; nonNull: number }

/** Every creature: no lock, then holding each of up to 6 other creatures — real vs reference. */
function compareAll(w: World, label: string, t: Tally): void {
  const all = [...w.creatures.values()];
  const locks: Array<CreatureId | null> = [null, ...all.slice(0, 6).map((c) => c.id), asCreatureId(99_999)];
  for (const c of all) {
    for (const held of locks) {
      const r = pickNavUnit(w, c, held, ACQ, LEASH);
      const f = referencePickNavUnit(w, c, held, ACQ, LEASH);
      t.compared++;
      if (f !== null) t.nonNull++;
      expect(r, `${label}: creature ${c.id as unknown as number} held=${String(held)}`).toBe(f);
    }
  }
}

/** Run `body` twice — inside an open epoch (the index) and outside one (the live scan). */
function bothWays(make: () => World, body: (w: World, check: (label: string) => void) => void): Tally {
  const t: Tally = { compared: 0, nonNull: 0 };
  for (const inEpoch of [true, false]) {
    const w = make();
    if (inEpoch) openBondTargetEpoch(w);
    try {
      body(w, (label) => compareAll(w, `${inEpoch ? 'epoch' : 'live'} · ${label}`, t));
    } finally {
      if (inEpoch) closeBondTargetEpoch();
    }
  }
  return t;
}

/** Four seats, a cluster of units per seat around the middle, all inside each other's radius. */
function brawl(): World {
  const w = board();
  for (let i = 0; i < 24; i++) {
    const seat = i % 4;
    birthCreature(w, seat, 900 + ((i * 37) % 160), 480 + ((i * 53) % 130));
  }
  return w;
}

describe('S191 perf — pickNavUnit through the enemy index agrees with the verbatim live scan', () => {
  it('a brawl, an exact tie inserted high-id-first, and the range boundary exactly at the acquire radius', () => {
    const t = bothWays(() => {
      const w = brawl();
      // Exact tie: two enemies of seat 0 at the same distance from a seat-0 unit, the HIGHER id inserted first.
      const lo = asCreatureId(w.nextCreatureId++);
      const hi = asCreatureId(w.nextCreatureId++);
      insertAs(w, asCreatureId(w.nextCreatureId++), 0, 300, 300);
      insertAs(w, hi, 1, 300 + 50, 300);
      insertAs(w, lo, 2, 300 - 50, 300);
      // Boundary: exactly at the acquire radius (included: the gate is `>`), and a hair beyond it.
      insertAs(w, asCreatureId(w.nextCreatureId++), 0, 1500, 900);
      insertAs(w, asCreatureId(w.nextCreatureId++), 3, 1500 + GOBLIN_UNIT_ACQUIRE_RADIUS, 900);
      insertAs(w, asCreatureId(w.nextCreatureId++), 0, 1500, 200);
      insertAs(w, asCreatureId(w.nextCreatureId++), 3, 1500 + GOBLIN_UNIT_ACQUIRE_RADIUS + 1e-9, 200);
      return w;
    }, (_w, check) => check('tie + boundary'));
    expect(t.nonNull, 'anti-vacuity: units were found').toBeGreaterThan(100);
  });

  it('untargetable by TYPE, and the Ra ritual stamped AFTER the index was built (read live)', () => {
    bothWays(() => {
      const w = brawl();
      insertAs(w, asCreatureId(w.nextCreatureId++), 1, 910, 490, 'locustCloud'); // nearest to many, never selectable
      return w;
    }, (w, check) => {
      check('locust cloud');
      const victim = [...w.creatures.values()].find((c) => c.ownerPlayerId === asPlayerId(1) && c.type === 'goblinMelee')!;
      victim.raRitualUntilTick = w.tick + 10; // "between realities" from now on
      check('ritual stamped mid-epoch');
      victim.raRitualUntilTick = w.tick; // strictly `<` — it has ended
      check('ritual ended');
    });
  });

  it('⭐ S192 T13 — a unit killed under the deferral is NEVER returned, by either side; removals and births are seen at once', () => {
    let corpseWasNearest = 0;
    let pendingReturned = 0;
    let heldCorpseKept = 0;
    bothWays(brawl, (w, check) => {
      w.pendingCreatureDeaths = new Set();
      const seat0 = [...w.creatures.values()].find((c) => c.ownerPlayerId === asPlayerId(0))!;
      check('before');
      const pick = referencePickNavUnit(w, seat0, null, ACQ, LEASH)!;
      expect(pick).not.toBeNull();
      expect(damageCreature(w, pick, 1_000_000, w.pendingCreatureDeaths), 'lethal, deferred').toBe(true);
      expect(w.creatures.has(pick), 'still in the Map until the sweep').toBe(true);
      // Anti-vacuity: the corpse IS still the geometrically nearest enemy — the old rule returned it.
      corpseWasNearest++;
      const after = pickNavUnit(w, seat0, null, ACQ, LEASH);
      if (after === pick) pendingReturned++;
      expect(after === null || w.pendingCreatureDeaths.has(after) === false, 'never a corpse').toBe(true);
      // And a lock ON the corpse is dropped, not held (the hold branch).
      if (pickNavUnit(w, seat0, pick, ACQ, LEASH) === pick) heldCorpseKept++;
      check('after a deferred kill');
      expect(removeCreature(w, pick)).toBe(true);
      check('after a removal (size drops)');
      birthCreature(w, 2, seat0.pos.x + 3, seat0.pos.y);
      check('after a birth right beside a seat-0 unit');
      // Removal + birth between two queries: the size is back where it was, only the counter moved.
      const sizeBefore = w.creatures.size;
      const doomed = [...w.creatures.values()].find((c) => c.ownerPlayerId === asPlayerId(3))!;
      expect(removeCreature(w, doomed.id)).toBe(true);
      birthCreature(w, 3, seat0.pos.x - 4, seat0.pos.y + 1);
      expect(w.creatures.size, 'fixture: the size is unchanged').toBe(sizeBefore);
      check('after a removal + birth of equal count');
      w.pendingCreatureDeaths = null;
    });
    expect(corpseWasNearest, 'the corpse case ran in BOTH modes').toBe(2);
    expect(pendingReturned, 'the dying unit was returned').toBe(0);
    expect(heldCorpseKept, 'a lock on the dying unit was held').toBe(0);
  });

  it('⭐ S192 — a unit in DESPAWNING is still picked by both sides, acquire and hold (no fade clause, by ruling)', () => {
    bothWays(brawl, (w, check) => {
      const seat0 = [...w.creatures.values()].find((c) => c.ownerPlayerId === asPlayerId(0))!;
      const pick = referencePickNavUnit(w, seat0, null, ACQ, LEASH)!;
      expect(pick).not.toBeNull();
      w.creatures.get(pick)!.state = 'DESPAWNING';
      check('after the nearest enemy entered DESPAWNING');
      expect(pickNavUnit(w, seat0, null, ACQ, LEASH)).toBe(pick);
      expect(pickNavUnit(w, seat0, pick, ACQ, LEASH)).toBe(pick);
    });
  });

  it('⭐ S192 T6 — one chaser, one drone or chewer, at every distance band: index and live scan agree with the reference', () => {
    // ONE quarry per board, so the give-up rule — not a nearer candidate — decides every answer.
    const chasers: CreatureType[] = ['goblinMelee', 'goblinShield', 'goblinArcher', 't3Bat', 't9BossOrcs', 't9BossNagas'];
    let compared = 0;
    let nulls = 0;
    let found = 0;
    for (const type of chasers) {
      for (const quarry of ['lightningDrone', 'chewer'] as CreatureType[]) {
        for (const dx of [30, 60, 120, 210]) {
          const t = bothWays(() => {
            const w = board();
            insertAs(w, asCreatureId(w.nextCreatureId++), 0, 600, 500, type);
            insertAs(w, asCreatureId(w.nextCreatureId++), 1, 600 + dx, 500, quarry);
            return w;
          }, (_w, check) => check(`${type} vs ${quarry} at ${dx}`));
          compared += t.compared;
          found += t.nonNull;
          nulls += t.compared - t.nonNull;
        }
      }
    }
    // Anti-vacuity both ways: the rule both kept and dropped quarries across the bands.
    expect(compared).toBeGreaterThan(300);
    expect(found, 'some quarries were chased').toBeGreaterThan(20);
    expect(nulls, 'some quarries were let go').toBeGreaterThan(20);
  });

  it('a unit moved after the index was built, a unit at NaN, and held locks of every kind', () => {
    bothWays(brawl, (w, check) => {
      check('before');
      const all = [...w.creatures.values()];
      all[3]!.pos.x = 5; all[3]!.pos.y = 5; // far away now — positions are never cached
      all[7]!.pos.x = all[0]!.pos.x + 1; all[7]!.pos.y = all[0]!.pos.y; // and one moved right beside another
      check('after two moves');
      all[9]!.pos.x = NaN;
      check('after a NaN position');
    });
  });

  it('an epoch left open across a tick, or opened on another world, falls back to the live scan', () => {
    const w = brawl();
    const other = brawl();
    const t: Tally = { compared: 0, nonNull: 0 };
    openBondTargetEpoch(other);
    try {
      compareAll(w, 'epoch open on ANOTHER world', t);
    } finally { closeBondTargetEpoch(); }
    openBondTargetEpoch(w);
    try {
      compareAll(w, 'epoch open', t);
      w.tick++;
      birthCreature(w, 1, 950, 500);
      compareAll(w, 'epoch left open into the next tick', t);
    } finally { closeBondTargetEpoch(); }
  });

  it('200 random boards, random churn between queries, inside an epoch', () => {
    let seed = 0x9a1;
    const rnd = (): number => { seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; return seed / 2 ** 32; };
    const t: Tally = { compared: 0, nonNull: 0 };
    for (let iter = 0; iter < 200; iter++) {
      const w = board();
      const n = 4 + Math.floor(rnd() * 30);
      const spread = iter % 2 === 0 ? 400 : 1500;
      for (let i = 0; i < n; i++) {
        const type: CreatureType = rnd() < 0.08 ? 'locustCloud' : 'goblinMelee';
        birthCreature(w, Math.floor(rnd() * 4), 960 + (rnd() - 0.5) * spread, 540 + (rnd() - 0.5) * spread, type);
      }
      w.pendingCreatureDeaths = new Set();
      openBondTargetEpoch(w);
      try {
        for (let step = 0; step < 6; step++) {
          compareAll(w, `random board ${iter} step ${step}`, t);
          const all = [...w.creatures.values()];
          const c = all[Math.floor(rnd() * all.length)];
          if (c === undefined) break;
          const k = rnd();
          if (k < 0.2) damageCreature(w, c.id, 1_000_000, w.pendingCreatureDeaths);
          else if (k < 0.4) removeCreature(w, c.id);
          else if (k < 0.6) birthCreature(w, Math.floor(rnd() * 4), c.pos.x + (rnd() - 0.5) * 60, c.pos.y + (rnd() - 0.5) * 60);
          else if (k < 0.75) { c.pos.x += (rnd() - 0.5) * 400; c.pos.y += (rnd() - 0.5) * 400; }
          else if (k < 0.85) c.raRitualUntilTick = w.tick + 1 + Math.floor(rnd() * 3);
          else if (k < 0.9) c.state = 'DESPAWNING'; // S192 — state churn; no predicate reads it
          else { removeCreature(w, c.id); birthCreature(w, Math.floor(rnd() * 4), c.pos.x, c.pos.y); }
        }
      } finally { closeBondTargetEpoch(); }
    }
    expect(t.compared, 'anti-vacuity: comparisons').toBeGreaterThan(20_000);
    expect(t.nonNull, 'anti-vacuity: units found').toBeGreaterThan(2_000);
  });
});
