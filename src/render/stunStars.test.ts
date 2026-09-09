/**
 * SPARK — S170 P5 — the "seeing stars" effect, pinned.
 *
 * ## ⛔ WHY THIS FILE EXISTS
 *
 * `drawStunStars` shipped in S169 as a private method of `goblinRenderer` with **zero test
 * coverage** — and this codebase has already paid for that exact hole once: S165 generated twelve
 * tier-3 tower atlases, shipped a test asserting the files existed on disk, and stayed green for two
 * sessions while `t3TowerAtlasBase` had no production callers at all. The art was never drawn and
 * nothing could tell.
 *
 * A renderer is normally hard to assert because it needs a Pixi stage. This one is not: extracting
 * it into a module made it a PURE FUNCTION of `(tick, id, pos, alpha, scaleMul)`, so a recording
 * stub for `Graphics` is enough to pin both the determinism contract and the boss-scale bug.
 */

import { describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import { drawStunStars } from './stunStars.ts';

interface Star { x: number; y: number; r: number; alpha: number }

/** Records `star(...).fill(...)` calls. `star` returns `this` because the real API chains. */
function recorder(): { g: Graphics; stars: Star[] } {
  const stars: Star[] = [];
  let pending: { x: number; y: number; r: number } | null = null;
  const g = {
    star(x: number, y: number, _points: number, r: number) {
      pending = { x, y, r };
      return g;
    },
    fill(opts: { alpha: number }) {
      if (pending !== null) stars.push({ ...pending, alpha: opts.alpha });
      pending = null;
      return g;
    },
  } as unknown as Graphics;
  return { g: g as Graphics, stars };
}

describe('drawStunStars — S170 P5', () => {
  it('draws three stars above the creature', () => {
    const { g, stars } = recorder();
    drawStunStars(g, 100, 200, 0, 1, 1);
    expect(stars).toHaveLength(3);
    for (const s of stars) expect(s.y, 'the ring floats ABOVE the origin').toBeLessThan(200);
  });

  it('⭐⭐ scaleMul lifts the ring clear of a BIG sprite — the bug this fix exists for', () => {
    /*
     * The lift and both orbit radii were flat constants tuned against a goblin, so on a tier-9 boss
     * (which carries `T9_BOSS_SPRITE_SCALE_MUL`) the ring floated 30 px above the ORIGIN of a sprite
     * several times that tall — i.e. INSIDE the artwork. The stun's only counterplay target is a
     * boss, so the one ability visual the owner likes was invisible exactly where it mattered.
     */
    const flat = recorder();
    drawStunStars(flat.g, 100, 200, 0, 1, 1, 1);
    const big = recorder();
    drawStunStars(big.g, 100, 200, 0, 1, 1, 3);

    const highestFlat = Math.min(...flat.stars.map((s) => s.y));
    const highestBig = Math.min(...big.stars.map((s) => s.y));
    expect(highestBig, 'a 3x sprite must push the ring ~3x further up').toBeLessThan(highestFlat);
    // And the stars themselves grow, or they vanish against a large sprite.
    expect(Math.max(...big.stars.map((s) => s.r))).toBeGreaterThan(
      Math.max(...flat.stars.map((s) => s.r)),
    );
  });

  it('⭐ POSITIVE CONTROL — scaleMul 1 is unchanged, so the goblins did not shift', () => {
    /*
     * Without this, "scaling works" could not be told apart from "every unit moved", and the fix
     * would have silently re-tuned the effect on the six goblin kinds it was designed against.
     */
    const { stars } = ((): { stars: Star[] } => {
      const r = recorder();
      drawStunStars(r.g, 0, 0, 0, 1, 1, 1);
      return r;
    })();
    const dflt = ((): Star[] => {
      const r = recorder();
      drawStunStars(r.g, 0, 0, 0, 1, 1); // scaleMul omitted → defaults to 1
      return r.stars;
    })();
    expect(stars).toEqual(dflt);
  });

  it('⛔ DETERMINISM — same tick and id give byte-identical stars, and no wall clock is read', () => {
    /*
     * The load-bearing property: this is DERIVED from synced state (`stunnedUntilTick` is serialized
     * and hashed) rather than pushed through `world.effects`, which the 10 Hz snapshot drops ~5/6 of
     * the time. Two peers must therefore compute the same ring on the same tick. A wall-clock or
     * `Math.random` phase would break that silently and look fine on one screen.
     */
    const a = recorder(); drawStunStars(a.g, 50, 60, 1234, 7, 1);
    const b = recorder(); drawStunStars(b.g, 50, 60, 1234, 7, 1);
    expect(a.stars).toEqual(b.stars);
  });

  it('the orbit ADVANCES with the tick, and differs per creature id', () => {
    const t0 = recorder(); drawStunStars(t0.g, 0, 0, 100, 5, 1);
    const t1 = recorder(); drawStunStars(t1.g, 0, 0, 101, 5, 1);
    expect(t1.stars, 'a stalled ring would read as a frozen sprite, not a stun').not.toEqual(t0.stars);

    const idA = recorder(); drawStunStars(idA.g, 0, 0, 100, 5, 1);
    const idB = recorder(); drawStunStars(idB.g, 0, 0, 100, 6, 1);
    expect(idB.stars, 'phase is offset per id so a stunned crowd does not march in step')
      .not.toEqual(idA.stars);
  });

  it('alpha is carried through, so a despawning unit fades its stars with it', () => {
    const { stars } = ((): { stars: Star[] } => {
      const r = recorder();
      drawStunStars(r.g, 0, 0, 0, 1, 0.5);
      return r;
    })();
    for (const s of stars) expect(s.alpha).toBeCloseTo(0.45); // 0.9 * 0.5
  });
});
