/**
 * SPARK — S175 P6: the tower-cover phase ramp (owner R169 / S170 P11).
 *
 * ⛔ **THIS FILE IS THE ONLY GUARD THIS FEATURE HAS, AND THAT IS A MEASURED FACT.** Phase A.0 went
 * looking for what would catch a mistake here and found nothing: `new StructureRenderer` appears
 * only in `main.ts` and is never instantiated in any test, `structureRenderer.test.ts` covers pure
 * helpers only, and `fog.spec.ts` asserts the CONTAINER exists without ever asserting it has
 * children. So there is no existing test that would notice this feature hiding shapes it should not.
 * The module was written pure and Pixi-free precisely so that this file could exist.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  TOWER_COVER_FADE_TICKS,
  TOWER_COVER_REVEAL_TICKS,
  __resetTowerCoverForTests,
  beginTowerCoverFrame,
  coverAlphaForBond,
  coverAlphaForPrim,
  markTowerCover,
  pruneTowerCover,
} from './towerCover.ts';
import type { World } from '../state/world.ts';
import { asBondId, asPrimitiveId } from '../types.ts';

const P1 = asPrimitiveId(1);
const P2 = asPrimitiveId(2);
const B1 = asBondId(1);

/** The two fields this module reads, and nothing else — it is a renderer helper, not a sim. */
function w(tick: number, prims: number[] = [1, 2], bonds: number[] = [1]): World {
  return {
    tick,
    primitives: new Map(prims.map((n) => [asPrimitiveId(n), {}])),
    bonds: new Map(bonds.map((n) => [asBondId(n), {}])),
  } as unknown as World;
}

/** Advance one render frame with the given cover marks. */
function frame(tick: number, covered: boolean, anchor = 0): void {
  beginTowerCoverFrame(w(tick));
  if (covered) markTowerCover([P1], [B1], anchor);
}

beforeEach(__resetTowerCoverForTests);

describe('S175 P6 — inactive by default (a missing beginFrame is a VISIBLE regression, not a blank board)', () => {
  it('⛔ every alpha is 1 before beginTowerCoverFrame is ever called', () => {
    expect(coverAlphaForPrim(P1)).toBe(1);
    expect(coverAlphaForBond(B1)).toBe(1);
  });

  it('an unmarked shape is never faded', () => {
    frame(0, false);
    frame(1, false);
    expect(coverAlphaForPrim(P2)).toBe(1);
  });
});

describe('S175 P6 — the phase-out ramp', () => {
  it('⭐ a shape freshly covered by a NEW tower starts fully visible and fades to hidden', () => {
    // anchor === current tick ⇒ the ring was just built, so the ramp runs from the start.
    frame(100, true, 100); // marks land in the BUILDING buffer
    frame(101, true, 100); // promoted; consumers now see them
    const atStart = coverAlphaForPrim(P1);
    expect(atStart).toBeGreaterThan(0.9);

    frame(100 + TOWER_COVER_FADE_TICKS, true, 100);
    expect(coverAlphaForPrim(P1)).toBeLessThan(0.05);
  });

  it('the ramp is monotonic and bounded to [0,1] across its whole span', () => {
    frame(0, true, 0);
    let prev = Infinity;
    for (let t = 1; t <= TOWER_COVER_FADE_TICKS + 30; t += 10) {
      frame(t, true, 0);
      const a = coverAlphaForPrim(P1);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      prev = a;
    }
    expect(prev).toBeLessThan(0.05);
  });

  it('connectors phase with their shapes', () => {
    frame(0, true, 0);
    frame(TOWER_COVER_FADE_TICKS, true, 0);
    expect(coverAlphaForBond(B1)).toBeLessThan(0.05);
  });
});

describe('S175 P6 — the JOINER case, which is what Bond.createdTick is for', () => {
  /**
   * ⚠ A client arriving at a match in progress must not watch every standing tower phase out from
   * scratch. Seeding the ramp from the ring's own age makes an old tower already hidden on frame one.
   */
  it('⭐ a tower that was already standing is hidden IMMEDIATELY, not re-faded', () => {
    // First sight at tick 5000 of a ring whose bonds were created at tick 10.
    frame(5000, true, 10);
    frame(5001, true, 10);
    expect(coverAlphaForPrim(P1)).toBeLessThan(0.05);
  });

  it('an anchor in the FUTURE cannot produce an alpha above 1 (clamped, not trusted)', () => {
    frame(100, true, 99999);
    frame(101, true, 99999);
    const a = coverAlphaForPrim(P1);
    expect(a).toBeLessThanOrEqual(1);
    expect(a).toBeGreaterThanOrEqual(0);
  });
});

describe('S175 P6 — the REVEAL, which is the half the owner actually described', () => {
  /**
   * Owner: *"once the first connector gets destroyed … that's when you see the connectors again, you
   * can rebuild it. And then it gets built and then the connectors … disappear."*
   */
  it('⭐ when the tower stops being drawn, the shapes come back', () => {
    frame(0, true, 0);
    frame(TOWER_COVER_FADE_TICKS, true, 0);
    expect(coverAlphaForPrim(P1)).toBeLessThan(0.05);

    /*
     * The ring breaks: nobody marks it any more.
     *
     * ⚠ THE FLIP HAPPENS ON THE FRAME THE MARK STOPS ARRIVING, NOT ON THE FRAME THE TOWER BROKE,
     * and the ramp runs its full span FROM THERE. Two frames are needed: one where the promoted set
     * no longer contains the shape (this is where `covered` flips), and one a full fade later. The
     * first version of this test collapsed those and read 0 — the mechanic, not a defect.
     */
    const broke = TOWER_COVER_FADE_TICKS + 1;
    frame(broke, false);       // promotion still carries the old mark
    frame(broke + 1, false);   // promoted set is now empty -> `covered` flips here
    frame(broke + 1 + TOWER_COVER_FADE_TICKS, false);
    expect(coverAlphaForPrim(P1)).toBeGreaterThan(0.95);
  });

  /**
   * ⛔ THE REGRESSION THIS CASE EXISTS FOR. Reversing mid-ramp must continue from where the ramp
   * actually is. If the reversal restarted from the far end, a connector broken one frame after the
   * tower finished building would SNAP to invisible and then fade in — a visible pop, in the one
   * feature whose entire purpose is to remove pops.
   */
  it('⛔ reversing mid-ramp continues from the CURRENT alpha, it does not jump', () => {
    frame(0, true, 0);
    const half = Math.floor(TOWER_COVER_FADE_TICKS / 2);
    frame(half, true, 0);
    const mid = coverAlphaForPrim(P1);
    expect(mid).toBeGreaterThan(0.35);
    expect(mid).toBeLessThan(0.65);

    // Uncover on the very next frame — alpha must move UP from `mid`, never snap down to 0 first.
    frame(half + 1, false);
    const afterFlip = coverAlphaForPrim(P1);
    expect(afterFlip).toBeGreaterThanOrEqual(mid - 0.05);
    expect(afterFlip).toBeLessThan(mid + 0.15);
  });
});

describe('S175 P6 — housekeeping', () => {
  it('pruning drops phases for shapes that no longer exist', () => {
    frame(0, true, 0);
    frame(1, true, 0);
    expect(coverAlphaForPrim(P1)).toBeLessThan(1);
    // The shape is destroyed: prune, then a fresh id must read as untracked (alpha 1).
    pruneTowerCover(w(2, [], []));
    beginTowerCoverFrame(w(3));
    expect(coverAlphaForPrim(P1)).toBe(1);
  });

  it('marks made this frame are NOT visible until the next frame (the deliberate one-frame lag)', () => {
    beginTowerCoverFrame(w(10));
    markTowerCover([P1], [B1], 10);
    // Same frame: the promotion has not happened, so nothing is covered yet.
    expect(coverAlphaForPrim(P1)).toBe(1);
  });
});

describe('S183 — the reveal is FASTER than the fade, because he gave both numbers', () => {
  /**
   * > *"It should disappear within, like, two seconds after this tower is built, like, phase out."*
   * > *"The connectors come back … That's when they phase back in within like a second."*
   */
  it('⭐ two seconds out, one second back — at 60 Hz', () => {
    expect(TOWER_COVER_FADE_TICKS).toBe(120);
    expect(TOWER_COVER_REVEAL_TICKS).toBe(60);
    expect(TOWER_COVER_REVEAL_TICKS).toBeLessThan(TOWER_COVER_FADE_TICKS);
  });

  it('⭐ a hidden shape is fully back one REVEAL span after the mark stops, not one FADE span', () => {
    frame(0, true, 0);
    frame(TOWER_COVER_FADE_TICKS, true, 0);
    expect(coverAlphaForPrim(P1)).toBeLessThan(0.05);

    const broke = TOWER_COVER_FADE_TICKS + 1;
    frame(broke, false); // promotion still carries the old mark
    frame(broke + 1, false); // promoted set is empty -> `covered` flips HERE
    const flip = broke + 1;

    // Half a REVEAL span in it is roughly halfway back — which it would NOT be on a 120-tick ramp.
    frame(flip + TOWER_COVER_REVEAL_TICKS / 2, false);
    const mid = coverAlphaForPrim(P1);
    expect(mid).toBeGreaterThan(0.35);
    expect(mid).toBeLessThan(0.65);

    frame(flip + TOWER_COVER_REVEAL_TICKS, false);
    expect(coverAlphaForPrim(P1)).toBeGreaterThan(0.99);
  });

  it('⛔ the asymmetry does not break the mid-ramp reversal — alpha is carried, not ticks', () => {
    frame(0, true, 0);
    frame(Math.floor(TOWER_COVER_FADE_TICKS / 2), true, 0);
    const mid = coverAlphaForPrim(P1);
    frame(Math.floor(TOWER_COVER_FADE_TICKS / 2) + 1, false);
    // Re-projected onto the SHORTER span, the alpha must land where it was, not jump.
    expect(coverAlphaForPrim(P1)).toBeGreaterThanOrEqual(mid - 0.05);
    expect(coverAlphaForPrim(P1)).toBeLessThan(mid + 0.15);
  });
});

/**
 * SPARK — S183 — ⛔⛔ **THE MECHANICAL SITE CENSUS. A SOURCE-TEXT GUARD PROVES A LINE EXISTS; THIS
 * COUNTS THE LINES THAT MUST.**
 *
 * The defect these exist for is not hypothetical and it is not old: `spawnerZoneRenderer` drew a
 * stroke over every spawner bond, a bead at every midpoint, a disc, three rings and a core — every
 * frame, from S100 to S183 — with the string `towerCover` appearing nowhere in the file. So while
 * `structureRenderer` faded a built tower's connectors to nothing, this redrew charged copies of
 * them on top. Eight sessions. Every gate green. The owner kept reporting he could see the shapes,
 * and a grep for "is the hiding wired up" kept answering yes, because it WAS wired up — at one of
 * the two draw sites.
 *
 * > **A source-text guard proves a line EXISTS. It cannot prove the line is REACHED.** (S182)
 *
 * So these do not grep for a symbol. They ENUMERATE and PIN:
 *
 *  · how many renderers PUBLISH cover, and which building class each serves;
 *  · which collections the ramp renderer walks, so dropping `world.defenders` fails;
 *  · how many renderers CONSUME cover alpha — a new one is a deliberate act, not a surprise;
 *  · every `alpha:` a draw call in `spawnerZoneRenderer` passes, each of which must be scaled by a
 *    cover alpha. **A sixth un-scaled fill fails this test.** That is the S182 footer pattern
 *    ("count the opaque `.fill({` calls and pin the total at five") applied to the file that
 *    proved why it is needed.
 *
 * ⚠ CRLF-NORMALISED ON READ. A `ci.*.test.ts` that parses a repo file and forgets this false-reds
 * on Windows only, where CI stays green — which looks like someone else's broken test.
 */
function renderSource(file: string): string {
  return readFileSync(new URL(`./${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * ⛔ **COMMENTS ARE STRIPPED BEFORE ANY CENSUS, AND THAT IS NOT TIDINESS.** This repo retires a
 * constant by QUOTING the expression it replaced, verbatim, at the site — so the very docblock
 * recording that `Math.max(coverAlphaForBond(...), DAMAGED_BOND_MIN_ALPHA)` is gone contains the
 * text that proves it is still there. A census that counts prose counts the wrong thing.
 */
function codeOf(file: string): string {
  return renderSource(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('S183 — the cover PUBLISH sites, counted and named', () => {
  /** Every renderer that commits a sprite and therefore declares cover, and what it serves. */
  const PUBLISHERS: readonly (readonly [string, string])[] = [
    ['towerRenderer.ts', 'the twelve race towers + the six tier-9 boss towers'],
    ['structureRampRenderer.ts', 'the five RAMP_SPECS towers, spawners AND defenders'],
    ['voltkinTowerRenderer.ts', 'the Voltkin TV'],
    // S185 — the last structure in the tree with a drawn sprite and no publish site. The owner
    // reported it twice: "it was [the] stink tower shapes in the background, it looks stupid."
    ['stinkTowerRenderer.ts', 'the stink tower — a defender with its own veo sheet, no ramp art'],
  ];

  it('⛔ EXACTLY four renderers publish cover, and each commits it exactly once', () => {
    for (const [file, serves] of PUBLISHERS) {
      expect(countOf(renderSource(file), 'markTowerCover('), `${file} serves ${serves}`).toBe(1);
    }
  });

  it('⛔ and no OTHER renderer publishes — a fifth publisher must be a deliberate act', () => {
    // A new publisher is not forbidden; it is required to come here and say which class it serves.
    // (`towerCover.ts` itself declares the function, and the test files reference it.)
    const named = new Set(PUBLISHERS.map(([f]) => f));
    for (const file of ['structureRenderer.ts', 'spawnerZoneRenderer.ts', 'turretRenderer.ts',
      'princessRenderer.ts', 'chewerRenderer.ts', 'creatureRenderer.ts']) {
      expect(named.has(file)).toBe(false);
      expect(countOf(renderSource(file), 'markTowerCover('), `${file}`).toBe(0);
    }
  });

  /**
   * ⛔ THE HALF THAT HAD NO SITE AT ALL BEFORE S183. Every publish site walked
   * `world.creatureSpawners`, so the laser turret and HELGA — which live in `world.defenders` —
   * could not be covered by anything in the tree. Dropping either loop fails here.
   */
  it('⛔ the ramp renderer walks BOTH collections — spawners and defenders', () => {
    const src = renderSource('structureRampRenderer.ts');
    const walked = [...src.matchAll(/of world\.(\w+)\.values\(\)/g)].map((m) => m[1]).sort();
    expect(walked).toEqual(['creatureSpawners', 'defenders']);
  });
});

describe('S183 — the cover CONSUME sites, counted and pinned', () => {
  const CONSUMERS = ['structureRenderer.ts', 'spawnerZoneRenderer.ts'];

  it('⛔ exactly these renderers read a cover alpha, and every other one reads none', () => {
    for (const file of CONSUMERS) {
      const src = renderSource(file);
      expect(countOf(src, 'coverAlphaFor'), `${file} must consume cover`).toBeGreaterThan(0);
    }
    for (const file of ['towerRenderer.ts', 'voltkinTowerRenderer.ts', 'structureRampRenderer.ts',
      'turretRenderer.ts', 'princessRenderer.ts']) {
      expect(countOf(renderSource(file), 'coverAlphaFor'), `${file}`).toBe(0);
    }
  });

  /**
   * ⭐⭐ **THE ONE WITH TEETH.** `spawnerZoneRenderer` draws six things and every one of them used
   * to ignore cover. This extracts every `alpha:` a draw call in that file passes and requires
   * each to end in a cover multiplier. A seventh draw added without one turns this red before it
   * can ship over an invisible connector.
   */
  it('⛔ EVERY alpha the spawner aura draws with is scaled by a cover alpha — all six', () => {
    const src = codeOf('spawnerZoneRenderer.ts');
    const alphas = [...src.matchAll(/\balpha:\s*([^,}\n]+)/g)].map((m) => m[1]!.trim());
    // disc · ring stroke · bond stroke · spark bead · core glow · core dot
    expect(alphas, `found:\n${alphas.join('\n')}`).toHaveLength(6);
    for (const a of alphas) {
      expect(a, `un-covered alpha: ${a}`).toMatch(/\*\s*(zoneAlpha|bondCover)$/);
    }
  });

  /**
   * ⛔ S183 — the retired `DAMAGED_BOND_MIN_ALPHA` pin, which un-hid a connector the instant it
   * took a point of damage. The owner ruled it out (*"It does not come back when the building
   * starts dying"*); a one-line revert would silently restore the behaviour he corrected.
   */
  it('⛔ a DAMAGED connector is no longer pinned back to visible', () => {
    const src = codeOf('structureRenderer.ts');
    expect(src).toContain('const coverAlpha = coverAlphaForBond(bond.id);');
    expect(src).not.toMatch(/Math\.max\(\s*coverAlphaForBond/);
    expect(src).not.toContain('DAMAGED_BOND_MIN_ALPHA');
  });
});
