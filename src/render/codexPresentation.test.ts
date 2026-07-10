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
 *      pentagram, 1 line + 7 spirals for the turret, 1 dot + 5 circles for the hub — with the
 *      right bond topology (ring vs spokes).
 */

import { describe, expect, it } from 'vitest';
import { SparkType } from '../constants.ts';
import { CODEX_COPY, codexCopyFor, emblemLayout } from './codexPresentation.ts';

const ALL_IDS = ['voltkin', 'nonet', 'pentagram', 'lightningHub', 'laserTurret', 'helga'] as const;

describe('S121 P4 — codex copy budgets (the anti-overflow contract)', () => {
  it('covers every codex entry (2 godly + 4 towers)', () => {
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

  it('the three characters keep their own art', () => {
    expect(CODEX_COPY['voltkin'].sprite).toContain('voltkin');
    expect(CODEX_COPY['helga'].sprite).toContain('helga');
    expect(CODEX_COPY['nonet'].sprite).toContain('kami');
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

  it('LASER TURRET: 1 Line hub + 7 Spirals, every Spiral bonded to the Line', () => {
    const spec = CODEX_COPY['laserTurret'].emblem;
    expect(spec).toBeDefined();
    const layout = emblemLayout(spec!);
    expect(layout.hub?.type).toBe(SparkType.Line);
    expect(layout.nodes).toHaveLength(7); // seven. not four.
    for (const n of layout.nodes) expect(n.type).toBe(SparkType.Spiral);
    expect(layout.bonds).toHaveLength(7); // one spoke per spiral
    for (const b of layout.bonds) expect([b.x1, b.y1]).toEqual([0, 0]); // all spokes from the hub
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
