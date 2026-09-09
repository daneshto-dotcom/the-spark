/**
 * SPARK — S170 — fog-of-war concealment, pinned.
 *
 * ## ⛔ WHY THIS FILE IS THE POINT, AND NOT AN AFTERTHOUGHT
 *
 * Three attempts at hiding enemy structures shipped GREEN and concealed nothing: two backdrop
 * re-layerings and an inverse Pixi mask. Every one of them passed every gate, because the mechanism
 * they used was invisible to the suite — `renderer.extract` does not apply filter effects, and Pixi
 * implements alpha masks as filters, so no assertion in this repo could tell "the board is
 * concealed" from "the mask texture looks correct". The owner found all three by playing.
 *
 * ⭐ Culling was chosen over masking largely BECAUSE of this file: it is a pure predicate over synced
 * state, so the behaviour the owner cares about is directly assertable with no GPU. That is the
 * property the previous mechanism lacked, independent of whether it worked.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { beginConcealmentFrame, concealmentContext, isConcealed, resetConcealmentForTest } from './concealment.ts';
import { makeWorld, type World } from '../state/world.ts';
import { R_PERSONAL, SPAWNER_CENTER_X, SPAWNER_CENTER_Y } from '../constants.ts';
import { asPlayerId } from '../types.ts';

const ME = asPlayerId(0);
const THEM = asPlayerId(1);

/** A networked match in BUILD — the only state in which `fogActive` is true (owner R62). */
function fogUpWorld(): World {
  const w = makeWorld(1);
  w.gameMode = '1v1';
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.localPlayerId = ME;
  return w;
}

const FAR = { x: 1700, y: 950 }; // nowhere near the quarry or the cursor
const CURSOR = { x: 200, y: 200 };

beforeEach(() => resetConcealmentForTest());

describe('isConcealed — the owner hide-list', () => {
  it("⛔ an ENEMY's thing in the dark is concealed", () => {
    const w = fogUpWorld();
    beginConcealmentFrame(w, CURSOR);
    expect(isConcealed(FAR.x, FAR.y, THEM)).toBe(true);
  });

  it('⭐ MY OWN thing is NEVER concealed, anywhere on the board', () => {
    /*
     * Owner: *"your own character zone or quadrant should be always lit and visible. Okay?
     * Completely. Not just around your structures."* An owner test rather than geometry is what
     * makes that true in a corner the cursor has never visited.
     */
    const w = fogUpWorld();
    beginConcealmentFrame(w, CURSOR);
    expect(isConcealed(FAR.x, FAR.y, ME)).toBe(false);
  });

  it('⭐ the spark REVEALS: an enemy thing under the cursor is visible', () => {
    const w = fogUpWorld();
    beginConcealmentFrame(w, { x: FAR.x, y: FAR.y });
    expect(isConcealed(FAR.x, FAR.y, THEM)).toBe(false);
  });

  it('⭐⭐ and it goes DARK AGAIN when the spark leaves — the owner said this explicitly', () => {
    /*
     * *"UNLESS I moused over them before and then moved away — then there is fog again over that
     * whole area because I'm not there anymore with my [spark]."*
     *
     * ⚠ This is the assertion that forbids the obvious wrong fix: making concealment STICKY, i.e.
     * "once seen, always drawn". That would be permanent map-wide intel after one sweep. Remembering
     * where the buildings WERE is a different feature and a different layer (S60's ghost
     * silhouettes), which draws the last-seen state and is deliberately not this predicate's job.
     */
    const w = fogUpWorld();
    beginConcealmentFrame(w, { x: FAR.x, y: FAR.y });
    expect(isConcealed(FAR.x, FAR.y, THEM)).toBe(false);
    beginConcealmentFrame(w, CURSOR); // spark walks away
    expect(isConcealed(FAR.x, FAR.y, THEM), 'the fog must close behind you').toBe(true);
  });

  it('⭐ the reveal is bounded by R_PERSONAL, not unlimited', () => {
    const w = fogUpWorld();
    beginConcealmentFrame(w, { x: 1000, y: 1000 });
    // Just inside the radius, and comfortably outside it.
    expect(isConcealed(1000 + R_PERSONAL - 5, 1000, THEM)).toBe(false);
    expect(isConcealed(1000 + R_PERSONAL * 3, 1000, THEM)).toBe(true);
  });

  it('⭐ the shared QUARRY is always visible — his "until they are in the center which is lit"', () => {
    /*
     * `computeVisionSourcesForSeat` always includes the spawner disc for every seat, so an enemy
     * gatherer that walks in to mine is visible there and concealed on the way home. No special
     * case was needed for it, which is worth pinning precisely because it is free and therefore easy
     * to break by "tidying" the sources list.
     */
    const w = fogUpWorld();
    beginConcealmentFrame(w, CURSOR);
    expect(isConcealed(SPAWNER_CENTER_X, SPAWNER_CENTER_Y, THEM)).toBe(false);
  });
});

describe('isConcealed — when the fog is not up at all', () => {
  it('⛔ NOTHING is concealed during the FIGHT phase (owner R62)', () => {
    /*
     * *"You shouldn't be able to see it unless you're in fight phase."* `fogActive` is BUILD-only,
     * so the fight reveal is not a special case here — it falls out of the predicate.
     */
    const w = fogUpWorld();
    w.matchPhase = 'FIGHT';
    beginConcealmentFrame(w, CURSOR);
    expect(isConcealed(FAR.x, FAR.y, THEM)).toBe(false);
    expect(concealmentContext().active).toBe(false);
  });

  it('⛔ nothing is concealed in SOLO — there is no opponent to hide from', () => {
    const w = fogUpWorld();
    w.gameMode = 'solo';
    beginConcealmentFrame(w, CURSOR);
    expect(isConcealed(FAR.x, FAR.y, THEM)).toBe(false);
  });

  it('⛔ nor on the TITLE screen', () => {
    const w = fogUpWorld();
    w.gameState = 'TITLE';
    beginConcealmentFrame(w, CURSOR);
    expect(isConcealed(FAR.x, FAR.y, THEM)).toBe(false);
  });
});

describe('the frame protocol', () => {
  it('⛔ FAILS OPEN with no beginFrame — a missing hook regresses to old behaviour, not a blank board', () => {
    /*
     * The deliberate default. If a future refactor moves the render tick and drops the hook, every
     * renderer draws exactly as it did before this module existed. The alternative default would
     * blank the entire board, which is a far worse and far more confusing failure.
     */
    expect(isConcealed(FAR.x, FAR.y, THEM)).toBe(false);
    expect(concealmentContext().active).toBe(false);
  });

  it('recomputes per frame — a new frame with a new cursor changes the answer', () => {
    const w = fogUpWorld();
    beginConcealmentFrame(w, CURSOR);
    const a = isConcealed(FAR.x, FAR.y, THEM);
    beginConcealmentFrame(w, { x: FAR.x, y: FAR.y });
    const b = isConcealed(FAR.x, FAR.y, THEM);
    expect([a, b]).toEqual([true, false]);
  });

  it('⚠ an UNOWNED thing is judged by geometry alone', () => {
    /*
     * `owner === null` is a free spark in the pool. The quarry is a permanent vision source, so pool
     * sparks stay visible, while a stray unowned spark in a dark corner does not — which is the
     * behaviour you want and is why the owner check is `!== null && === local` rather than a bare
     * equality that would treat null as "not mine, conceal it" or as "mine, show it".
     */
    const w = fogUpWorld();
    beginConcealmentFrame(w, CURSOR);
    expect(isConcealed(SPAWNER_CENTER_X, SPAWNER_CENTER_Y, null)).toBe(false);
    expect(isConcealed(FAR.x, FAR.y, null)).toBe(true);
  });
});
