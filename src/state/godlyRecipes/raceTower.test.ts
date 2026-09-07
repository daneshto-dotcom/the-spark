/**
 * SPARK — S166 P2 — the tier-3 race tower: registration, R137, the feed rule, and the B12 geometry.
 *
 * What this file is FOR, stated up front because most of it is not about the happy path:
 *
 *   · **R137** — an off-race player must not ignite another race's ring. Predicates are race-BLIND
 *     (`(world, bondPos)` carries no seat), so the check lives in owner resolution and nothing else
 *     would catch its removal.
 *   · **The B12 arithmetic** — `RING_R = 40` at n=3 gives a 69.3 px side, past `AUTO_BOND_RADIUS`,
 *     which stamps fine and is UN-BUILDABLE BY HAND. That is a defect with no visible symptom until
 *     a player tries to build one, so it is pinned as arithmetic.
 *   · **The art paths** — a wrong path 404s and `Assets.load` swallows it by design (the renderer
 *     falls back to a procedural puppet), so a typo ships looking merely ugly. Checked against disk.
 *   · **The feed rule** — one function serves the panel AND the reducer, and if they disagreed the
 *     player gets a lit button that silently does nothing.
 */

import { describe, expect, it } from 'vitest';
import { AUTO_BOND_RADIUS, SparkType } from '../../constants.ts';
import { ALL_RACES, RACE_FEED_SHAPE } from '../races.ts';
import {
  RACE_TOWER_IDS,
  RACE_TOWER_LABELS,
  RACE_TOWER_SIZE,
  RACE_TOWER_UNIT,
  isRaceTowerId,
  raceForTowerId,
  t3TowerAtlasBase,
  t3UnitAtlasBase,
} from '../raceTowerIds.ts';
import { EXPECTED_COMPONENT_SIZE, blueprintCost, blueprintFor } from '../blueprints.ts';
import { fedCreatureType } from '../goblinTowerFeed.ts';
import { listRecipes } from './index.ts';
import '../godlyRecipes/registerAll.ts';

describe('S166 — the six race towers are registered and identifiable', () => {
  it('registers exactly six spawner recipes, one per race, with the right ids', () => {
    const ids = new Set(listRecipes().map((r) => r.id as string));
    for (const race of ALL_RACES) {
      expect(ids.has(RACE_TOWER_IDS[race] as string), `${race} tower registered`).toBe(true);
    }
    // Anti-vacuity: six DISTINCT ids, not one id six times.
    expect(new Set(ALL_RACES.map((r) => RACE_TOWER_IDS[r])).size).toBe(6);
  });

  it('every race tower is kind:spawner — a defender would never be fed', () => {
    const byId = new Map(listRecipes().map((r) => [r.id as string, r]));
    for (const race of ALL_RACES) {
      expect(byId.get(RACE_TOWER_IDS[race] as string)?.kind, race).toBe('spawner');
    }
  });

  it('raceForTowerId round-trips, and refuses every non-race recipe', () => {
    for (const race of ALL_RACES) {
      expect(raceForTowerId(RACE_TOWER_IDS[race])).toBe(race);
      expect(isRaceTowerId(RACE_TOWER_IDS[race])).toBe(true);
    }
    for (const other of ['goblinTower', 'pentagram', 'stinkTower', 'voltkin'] as const) {
      expect(raceForTowerId(other), other).toBe(null);
      expect(isRaceTowerId(other), other).toBe(false);
    }
  });

  it('the six outputs are six DISTINCT creature types — R135 varies them per race', () => {
    const units = ALL_RACES.map((r) => RACE_TOWER_UNIT[r]);
    expect(new Set(units).size).toBe(6);
    // ⛔ AND NONE OF THEM IS `raceUnit`. R134 makes the castle's soldier a different POPULATION;
    // emitting it here would silently collapse the two the owner had just separated.
    expect(units).not.toContain('raceUnit');
  });

  it('the feed shape is the race OWN shape (R119) and the six are distinct', () => {
    // "The tower is made of what it eats" — recipe shape == feed shape, which is the whole design.
    expect(new Set(ALL_RACES.map((r) => RACE_FEED_SHAPE[r])).size).toBe(6);
  });
});

describe('S166 — the blueprint, and the B12 geometry that has no visible symptom', () => {
  it('is three of the race own shape with three ring bonds', () => {
    for (const race of ALL_RACES) {
      const bp = blueprintFor(RACE_TOWER_IDS[race]);
      expect(bp.nodes.length, `${race} nodes`).toBe(RACE_TOWER_SIZE);
      expect(bp.bonds.length, `${race} bonds`).toBe(RACE_TOWER_SIZE);
      for (const n of bp.nodes) expect(n.type, `${race} node type`).toBe(RACE_FEED_SHAPE[race]);
      expect(bp.label).toBe(RACE_TOWER_LABELS[race]);
      // A ring, not a chain: every node appears in exactly two bonds.
      const deg = new Map<number, number>();
      for (const [a, b] of bp.bonds) {
        deg.set(a, (deg.get(a) ?? 0) + 1);
        deg.set(b, (deg.get(b) ?? 0) + 1);
      }
      expect([...deg.values()].sort(), `${race} degrees`).toEqual([2, 2, 2]);
    }
  });

  it('⛔ B12 — every side is ≤ AUTO_BOND_RADIUS, or the tower is UN-BUILDABLE BY HAND', () => {
    /*
     * The defect this exists for: `RING_R = 40` (correct at n=5) gives 40·√3 ≈ 69.3 px at n=3,
     * past AUTO_BOND_RADIUS (60). The blueprint would STAMP perfectly and a player placing three
     * shapes by hand could never get them to bond. `TRI_RING_R = 34` gives 58.9 px.
     */
    for (const race of ALL_RACES) {
      const bp = blueprintFor(RACE_TOWER_IDS[race]);
      for (const [a, b] of bp.bonds) {
        const p = bp.nodes[a]!;
        const q = bp.nodes[b]!;
        const side = Math.hypot(p.dx - q.dx, p.dy - q.dy);
        expect(side, `${race} side ≤ auto-bond`).toBeLessThanOrEqual(AUTO_BOND_RADIUS);
        // And the floor: comfortably clear of the ~22 px sum-of-radii where soft-collision strains.
        expect(side, `${race} side ≥ floor`).toBeGreaterThanOrEqual(40);
      }
    }
  });

  it('costs 3 — the new tier, and the cheapest structure in the game', () => {
    for (const race of ALL_RACES) {
      expect(blueprintCost(RACE_TOWER_IDS[race]), race).toBe(RACE_TOWER_SIZE);
      expect(EXPECTED_COMPONENT_SIZE[RACE_TOWER_IDS[race]], race).toBe(RACE_TOWER_SIZE);
    }
    // The footer's `3` chip appears because of this, with no hardcoded list edited (R108).
    expect(blueprintCost('stinkTower')).toBeGreaterThan(RACE_TOWER_SIZE);
  });
});

describe('S166 — the art paths resolve to files that exist', () => {
  /*
   * ⛔ CHECKED AGAINST DISK, because a wrong path is SILENT. `Assets.load` failures are swallowed by
   * design in this renderer stack and the creature falls back to `drawGoblin`'s green procedural
   * puppet — the owner's "gay green circle". The filenames carry BOTH race and creature
   * (`t3-vampires-bat`), which is exactly the shape a hand-typed path gets wrong.
   */
  const exists = (rel: string): boolean => {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    return existsSync(join(process.cwd(), 'public', rel));
  };

  it('every unit atlas + anim descriptor is on disk', () => {
    for (const race of ALL_RACES) {
      const base = t3UnitAtlasBase(race);
      expect(exists(`${base}-atlas.png`), `${race} unit atlas`).toBe(true);
      expect(exists(`${base}-anim.json`), `${race} unit anim`).toBe(true);
    }
  });

  it('every tower atlas + anim descriptor is on disk', () => {
    for (const race of ALL_RACES) {
      const base = t3TowerAtlasBase(race);
      expect(exists(`${base}-atlas.png`), `${race} tower atlas`).toBe(true);
      expect(exists(`${base}-anim.json`), `${race} tower anim`).toBe(true);
    }
  });

  it('anti-vacuity: a deliberately wrong path is NOT reported as existing', () => {
    expect(exists('/art/race-tier3-units/t3-vampires-NOPE-atlas.png')).toBe(false);
  });
});

describe('S166 — fedCreatureType: the ONE rule the panel and the reducer share', () => {
  const SHAPES: readonly SparkType[] = [
    SparkType.Triangle, SparkType.Square, SparkType.Line,
    SparkType.Circle, SparkType.Dot, SparkType.Spiral,
  ];

  it('a race tower accepts ONLY its own shape, and yields its own unit (R119)', () => {
    for (const race of ALL_RACES) {
      const id = RACE_TOWER_IDS[race];
      const own = RACE_FEED_SHAPE[race];
      expect(fedCreatureType(id, own), `${race} own shape`).toBe(RACE_TOWER_UNIT[race]);
      for (const s of SHAPES) {
        if (s === own) continue;
        // ⛔ REFUSED, NOT SUBSTITUTED. Returning some other unit here would hand a player a
        // different race's creature; returning a goblin would hand them the wrong economy.
        expect(fedCreatureType(id, s), `${race} refuses ${String(s)}`).toBe(null);
      }
    }
  });

  it('the goblin tower still maps all six shapes — additive, not replacing', () => {
    for (const s of SHAPES) {
      const out = fedCreatureType('goblinTower', s);
      expect(out, `goblinTower ${String(s)}`).not.toBe(null);
      // And it never yields a tier-3 unit: the two feed economies stay separate.
      expect(String(out).startsWith('t3')).toBe(false);
    }
  });

  it('a non-feedable structure refuses every shape', () => {
    for (const id of ['pentagram', 'lightningHub', 'stinkTower', 'voltkin'] as const) {
      for (const s of SHAPES) expect(fedCreatureType(id, s), `${id} ${String(s)}`).toBe(null);
    }
  });
});
