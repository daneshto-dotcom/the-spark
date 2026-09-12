/**
 * SPARK — S121 P4 CODEX presentation tests.
 *
 * Enforces the codex coherence contract at the source:
 *   1. COPY BUDGETS — every entry's copy is written to FIT its tile zone (name ≤ 16 chars,
 *      power ≤ 44, recipe ≤ 150). The tile layout in codexOverlay.ts is sized for exactly these
 *      budgets, so "text coming out of the boxes" fails HERE, at authoring time, not on screen.
 *   2. IMAGE COHERENCE — every entry has EITHER character art OR a recipe emblem, never neither /
 *      both; and NO non-Voltkin entry may point at Voltkin art (the S121 owner bug: pentagram /
 *      laser turret / lightning hub all wore the voltkin-zap placeholder).
 *   3. EMBLEM TRUTH — emblemLayout must depict the REAL recipe: 5 ring triangles for the
 *      pentagram, 1 line + 6 spirals for the turret (S140 P1 retune), 1 dot + 5 circles for the hub — with the
 *      right bond topology (ring vs spokes).
 */

import { describe, expect, it } from 'vitest';
import { SparkType } from '../constants.ts';
import { CODEX_COPY, codexCopyFor, emblemLayout } from './codexPresentation.ts';
import { TURRET_HUB_DEGREE, TURRET_SIZE } from '../state/godlyRecipes/laserTurret.ts';
import { STINK_HUB_TYPE, STINK_LEAF_TYPE } from '../state/godlyRecipes/stinkTower.ts';
import { STINK_TOWER_HUB_DEGREE, STINK_TOWER_SIZE } from '../constants.ts';

const ALL_IDS = [
  // ⭐ S173 P5 — 'nonet' was the second id here and is gone; see the NONET regression test below.
  'voltkin', 'pentagram', 'lightningHub', 'laserTurret', 'helga',
  'stinkTower', // S141 P1 — the first NON-GODLY entry
  'goblinTower', // S151 P3 — one tower, six outputs (owner R70)
  /*
   * S166 — the six tier-3 race towers (R108/R119). Six ids, ONE module, and the copy is what makes
   * them legible: `CODEX_COPY` is keyed by `string`, so `tsc` cannot demand these and `codexCopyFor`
   * falls back to `id.toUpperCase()` with a BLANK power line rather than failing. This pinned list
   * is the only thing that turns an omission red.
   *
   * ⚠ The budget test below is not a formality here — the demons entry came in at 154 chars against
   * a 150 ceiling and had to be trimmed, which only surfaced because these ids joined this list.
   */
  't3TowerVampires', 't3TowerNagas', 't3TowerMummies',
  't3TowerZombies', 't3TowerOrcs', 't3TowerDemons',
  /*
   * S167 — the six tier-9 BOSS towers, here for exactly the reason the tier-3 block above is: tsc
   * cannot demand them and `codexCopyFor` falls back to `id.toUpperCase()` with a BLANK power line,
   * so 'T9TOWERVAMPIRES' would ship green into the footer card and the FIX popover title.
   *
   * ⚠ AND THE BUDGET TEST BELOW EARNED ITS KEEP AGAIN. The first draft of these six ran 36 chars
   * of `power` against the 34 ceiling and ~210 of `recipe` against 150; all twelve lines were
   * rewritten to fit and re-measured FROM THE FILE. 'ARCHDEMON TOWER' is 15 of the 16-char `name`
   * budget, so a longer boss name than that cannot be a tower label without a re-think.
   */
  't9TowerVampires', 't9TowerNagas', 't9TowerMummies',
  't9TowerZombies', 't9TowerOrcs', 't9TowerDemons',
] as const;

describe('S121 P4 — codex copy budgets (the anti-overflow contract)', () => {
  it('covers every codex entry — CODEX_COPY and ALL_IDS agree exactly, both ways', () => {
    for (const id of ALL_IDS) expect(CODEX_COPY[id], id).toBeDefined();
    expect(Object.keys(CODEX_COPY).sort()).toEqual([...ALL_IDS].sort());
  });

  it('name ≤ 16 chars, power ≤ 34, recipe ≤ 150 (the tile zones are sized for these)', () => {
    for (const id of ALL_IDS) {
      const c = CODEX_COPY[id];
      expect(c.name.length, `${id} name`).toBeLessThanOrEqual(16);
      // 34 chars is the most the power line can carry inside a 240px tile at the fitText floor
      // (live-measured in the S121 preview: 42 chars escaped even at fontSize 10).
      expect(c.power.length, `${id} power`).toBeLessThanOrEqual(34);
      expect(c.recipe.length, `${id} recipe`).toBeLessThanOrEqual(150);
      expect(c.name).toBe(c.name.toUpperCase()); // codex headers are uppercase by convention
      expect(c.power.length, `${id} power non-empty`).toBeGreaterThan(0);
    }
  });

  it('unknown id falls back honestly (never crashes the codex)', () => {
    const fb = codexCopyFor('someFutureTower');
    expect(fb.name).toBe('SOMEFUTURETOWER');
    expect(fb.recipe).toBe('???');
    expect(fb.sprite).toBeUndefined();
    expect(fb.emblem).toBeUndefined();
  });
});

describe('S121 P4 — image coherence (characters wear their art; geometry wears its build)', () => {
  it('every entry has EXACTLY ONE of sprite | emblem', () => {
    for (const id of ALL_IDS) {
      const c = CODEX_COPY[id];
      const hasSprite = c.sprite !== undefined;
      const hasEmblem = c.emblem !== undefined;
      expect(hasSprite !== hasEmblem, `${id}: sprite XOR emblem`).toBe(true);
    }
  });

  it('REGRESSION: no non-Voltkin entry wears Voltkin art (the S121 owner bug)', () => {
    for (const id of ALL_IDS) {
      if (id === 'voltkin') continue;
      const sprite = CODEX_COPY[id].sprite ?? '';
      expect(sprite.includes('voltkin'), `${id} must not wear voltkin art`).toBe(false);
    }
  });

  it('the two characters keep their own art', () => {
    expect(CODEX_COPY['voltkin'].sprite).toContain('voltkin');
    expect(CODEX_COPY['helga'].sprite).toContain('helga');
  });

  it('⭐ S173 P5 REGRESSION: NONET appears NOWHERE in the codex — owner: "Easter egg"', () => {
    // Owner: *"no [NONET] be anywhere in the codex. Easter egg."* The entry used to be a SYNTHETIC
    // one (no recipe, no predicate) minted by codexOverlay's now-deleted `nonetEntry()` from a row
    // in this table. Because CODEX_COPY is keyed by `string`, tsc can neither demand nor forbid a
    // key — re-adding one would compile and ship green. This test is the only thing that says no,
    // and it checks the COPY as well as the key so a 'sudoku trial' card under another name is
    // caught too. The mechanic itself is untouched: sudokuEvent/sudokuOverlay still run the trial.
    for (const [id, copy] of Object.entries(CODEX_COPY)) {
      const blob = `${id} ${copy.name} ${copy.power} ${copy.recipe} ${copy.sprite ?? ''}`;
      expect(blob.toLowerCase(), `${id} must not mention NONET`).not.toContain('nonet');
    }
  });
});

describe('S121 P4 — emblem truth (the tile depicts the REAL recipe)', () => {
  it('PENTAGRAM: 5 Triangles in a closed ring (each bonded to exactly two)', () => {
    const spec = CODEX_COPY['pentagram'].emblem;
    expect(spec).toBeDefined();
    const layout = emblemLayout(spec!);
    expect(layout.hub).toBeUndefined();
    expect(layout.nodes).toHaveLength(5);
    for (const n of layout.nodes) expect(n.type).toBe(SparkType.Triangle);
    expect(layout.bonds).toHaveLength(5); // a closed 5-ring has exactly 5 edges
  });

  it('LASER TURRET: the emblem shows exactly as many Spirals as the PREDICATE demands', () => {
    // ⚠ S140 P1 — THIS TEST NOW READS THE RECIPE, NOT A LITERAL. It used to hardcode `7` with the
    // comment "seven. not four.", which meant the owner's retune to six required DELETING the very
    // guard that existed to stop the emblem and the predicate disagreeing. Binding it to
    // TURRET_HUB_DEGREE makes it survive any future retune and makes it STRONGER than the version it
    // replaces: the emblem is now provably a picture of the shipped gate, at whatever value that gate
    // holds. This matters because the predicate is strict `!==` with no upper tolerance — a codex that
    // says seven while the gate says six builds a turret and then kills it 0.5 s later.
    const spec = CODEX_COPY['laserTurret'].emblem;
    expect(spec).toBeDefined();
    const layout = emblemLayout(spec!);
    expect(layout.hub?.type).toBe(SparkType.Line);
    expect(layout.nodes).toHaveLength(TURRET_HUB_DEGREE);
    for (const n of layout.nodes) expect(n.type).toBe(SparkType.Spiral);
    expect(layout.bonds).toHaveLength(TURRET_HUB_DEGREE); // one spoke per spiral
    for (const b of layout.bonds) expect([b.x1, b.y1]).toEqual([0, 0]); // all spokes from the hub
    // The star is 1 hub + N leaves, so the emblem also pins the component size the predicate gates on.
    expect(layout.nodes.length + 1).toBe(TURRET_SIZE);
  });

  it('LASER TURRET: no stale "seven" survives in player-visible copy (the S140 retune trap)', () => {
    // ⛔ "BUILDS AT SIX, DIES AT SEVEN." A player who follows copy that still says seven adds a
    // seventh Spiral, which pushes the hub past TURRET_HUB_DEGREE — stillValid goes false and the
    // host removes the turret within 0.5 s. So stale copy is not cosmetic here; it is a trap that
    // destroys the thing the player just built. This asserts the copy agrees with the gate.
    const copy = CODEX_COPY['laserTurret'];
    const text = `${copy.name} ${copy.power} ${copy.recipe}`;
    expect(text).not.toMatch(/seven/i);
    expect(text).not.toMatch(/\b7\b/);
    expect(copy.recipe).toContain(String(TURRET_HUB_DEGREE));
  });

  it('STINK TOWER: the emblem is a picture of the SHIPPED gate, at whatever value that gate holds', () => {
    // S141 P1 — authored the S140 way from day one: this reads the recipe's own constants, so a
    // retune of the shapes moves the emblem's contract with it and a retune that forgets the codex
    // fails HERE rather than shipping a tile that instructs a build the host rejects. The recipe is
    // explicitly flagged as a Claude ruling the owner may overturn, which makes binding rather than
    // hardcoding the difference between a one-line retune and another copy migration.
    const spec = CODEX_COPY['stinkTower'].emblem;
    expect(spec).toBeDefined();
    const layout = emblemLayout(spec!);
    expect(layout.hub?.type).toBe(STINK_HUB_TYPE);
    expect(layout.nodes).toHaveLength(STINK_TOWER_HUB_DEGREE);
    for (const n of layout.nodes) expect(n.type).toBe(STINK_LEAF_TYPE);
    expect(layout.bonds).toHaveLength(STINK_TOWER_HUB_DEGREE); // one spoke per leaf
    for (const b of layout.bonds) expect([b.x1, b.y1]).toEqual([0, 0]);
    // 1 hub + N leaves, so the emblem also pins the component size the predicate gates on.
    expect(layout.nodes.length + 1).toBe(STINK_TOWER_SIZE);
  });

  it('STINK TOWER: the copy states the SAME leaf count the predicate demands', () => {
    // The laserTurret trap generalised: this recipe's gate is also a strict equality with no upper
    // tolerance, so copy that names a different number would tell the player to build something the
    // host tears down 0.5 s later. Assert the shipped copy contains the shipped degree.
    const copy = CODEX_COPY['stinkTower'];
    expect(copy.recipe).toContain(String(STINK_TOWER_HUB_DEGREE));
    expect(`${copy.name} ${copy.power} ${copy.recipe}`).not.toMatch(/\bfive\b/i);
  });

  it('LIGHTNING HUB: 1 Dot hub + 5 Circles, every Circle bonded to the Dot', () => {
    const spec = CODEX_COPY['lightningHub'].emblem;
    expect(spec).toBeDefined();
    const layout = emblemLayout(spec!);
    expect(layout.hub?.type).toBe(SparkType.Dot);
    expect(layout.nodes).toHaveLength(5);
    for (const n of layout.nodes) expect(n.type).toBe(SparkType.Circle);
    expect(layout.bonds).toHaveLength(5);
  });

  it('nodes sit on the spec radius, centered on (0,0) — the emblem fits its tile zone', () => {
    for (const id of ALL_IDS) {
      const spec = CODEX_COPY[id].emblem;
      if (spec === undefined) continue;
      expect(spec.radius, `${id} radius fits the 130px art zone`).toBeLessThanOrEqual(48);
      const layout = emblemLayout(spec);
      for (const n of layout.nodes) {
        expect(Math.hypot(n.x, n.y), `${id} node on radius`).toBeCloseTo(spec.radius, 6);
      }
    }
  });
});
