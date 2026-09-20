/**
 * SPARK — S185 — **THE STINK BAG'S PORTRAIT ARRIVES BEFORE THE PLAYER CAN ASK FOR IT.**
 *
 * Owner, S185: *"Stink bags — they're clickable now, but you don't have their image. Should be able
 * to see their image on the character sheet."*
 *
 * ⭐ THE ART WAS NEVER MISSING, AND THAT IS THE WHOLE POINT OF THIS FILE. Every link in the chain
 * was already correct and was verified by hand before a line was changed:
 *   · the asset ships — `public/godly/stink-bag/anim/stink-bag-atlas.png`, and the live site serves
 *     it and its manifest with HTTP 200;
 *   · the manifest matches the parser — 12 idle frames on row 0, 128×128 cells;
 *   · the routing is correct — `characterSheetModel`'s bag card carries
 *     `{ kind: 'namedBuildingFrame', building: 'stinkBag' }`, and `main.ts`'s portrait switch maps
 *     `'stinkBag'` to `stinkCloudRenderer.portraitTexture()`.
 *
 * ⛔ WHAT WAS WRONG WAS THE *TIMING*, AND A DOCBLOCK THAT CALLED IT ACCEPTABLE. The atlas was
 * fetched only once a bag already existed — the latest possible moment — so the card resolved its
 * portrait while 222 KB was still in flight and fell back to the stink TOWER's codex emblem. That
 * fallback is indistinguishable from the S182 bug it was written to replace, which is exactly what
 * he reported. A graceful degradation nobody can tell apart from a defect is a defect.
 *
 * ⚠ WHY THESE TESTS ARE STRUCTURED AS THEY ARE. No renderer runs under vitest and `ensureAtlas`
 * does real network I/O, so the assertions here are about WHEN THE LOAD IS TRIGGERED, not about
 * pixels — the trigger is the thing that regressed and the thing a future edit would silently undo.
 * `ensureAtlas` is stubbed and counted; that is a real behavioural assertion about this class, not
 * a source-text guard, so it cannot go green over a line that is never reached (the S182 §2 trap).
 */

import { describe, expect, it, vi } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { makeWorld, type World } from '../state/world.ts';
import { StinkCloudRenderer } from './stinkCloudRenderer.ts';

const P0 = asPlayerId(0);

function emptyWorld(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  return w;
}

/**
 * A renderer with its network load stubbed out and counted. Constructed without a Pixi parent —
 * `sync`'s early-return path touches only `this.haze.clear()` and the reaper, neither of which
 * needs a live stage.
 */
function rendererWithCountedLoad(): { r: StinkCloudRenderer; loads: () => number } {
  const r = Object.create(StinkCloudRenderer.prototype) as StinkCloudRenderer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const any = r as any;
  /**
   * A chainable Graphics stand-in. Pixi's Graphics API is fluent (`g.circle(...).fill(...)`), so a
   * stub that returns anything else throws on the second call in a chain — which is how the
   * bag-present case failed first time. The Proxy answers every method with itself, which is the
   * whole contract this test needs: these assertions are about the LOAD TRIGGER, never about pixels.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fluent: any = new Proxy({}, { get: () => (): any => fluent });
  any.haze = fluent;
  any.sprites = new Map();
  any.frames = null;
  any.manifest = null;
  any.loadStarted = false;
  any.reapAllSprites = (): void => {};
  const spy = vi.fn();
  any.ensureAtlas = spy;
  return { r, loads: () => spy.mock.calls.length };
}

/** A stink tower standing on the board, with no bag thrown yet. */
function addStinkTower(w: World): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  w.defenders.set(1 as any, { id: 1, kind: 'stinkTower', ownerPlayerId: P0 } as any);
}

/** A defender that is NOT a stink tower — the control for the roster scan. */
function addOtherDefender(w: World): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  w.defenders.set(2 as any, { id: 2, kind: 'turret', ownerPlayerId: P0 } as any);
}

describe('⭐ S185 — the bag atlas is pre-warmed on the TOWER, not on the bag', () => {
  it('a standing stink tower with no bag yet starts the fetch', () => {
    const { r, loads } = rendererWithCountedLoad();
    const w = emptyWorld();
    addStinkTower(w);

    expect(w.stinkClouds.size).toBe(0); // the early-return path, deliberately
    r.sync(w);
    expect(loads()).toBe(1);
  });

  /**
   * ⛔ THE CONTROL, AND IT IS WHAT STOPS THE TEST ABOVE FROM PASSING VACUOUSLY. If the scan were
   * replaced by an unconditional `ensureAtlas()` — the obvious "fix" that costs every player a
   * 222 KB fetch on the title screen — this assertion is the only thing that would notice.
   */
  it('CONTROL — an empty board does NOT fetch, so the title screen pays nothing', () => {
    const { r, loads } = rendererWithCountedLoad();
    r.sync(emptyWorld());
    expect(loads()).toBe(0);
  });

  it('CONTROL — a board with only a non-stink defender does not fetch either', () => {
    const { r, loads } = rendererWithCountedLoad();
    const w = emptyWorld();
    addOtherDefender(w);
    r.sync(w);
    expect(loads()).toBe(0);
  });

  it('a bag already in the world still triggers the load, the original path intact', () => {
    const { r, loads } = rendererWithCountedLoad();
    const w = emptyWorld();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    w.stinkClouds.set(7 as any, { id: 7, pos: { x: 0, y: 0 }, landedAtTick: 0, ownerPlayerId: P0 } as any);
    r.sync(w);
    expect(loads()).toBeGreaterThanOrEqual(1);
  });
});

describe('⭐ S185 — the portrait accessor is self-sufficient', () => {
  /**
   * The accessor kicks the load itself, so whatever asks for the picture first starts fetching it.
   * Belt and braces against a future refactor that moves or gates the board-side call.
   */
  it('asking for the portrait starts the fetch even if sync never ran', () => {
    const { r, loads } = rendererWithCountedLoad();
    expect(r.portraitTexture()).toBeNull(); // nothing resident yet — that is expected
    expect(loads()).toBe(1);
  });

  it('returns frame 0 once the atlas is resident — identity, not a status read', () => {
    const { r } = rendererWithCountedLoad();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const any = r as any;
    const f0 = { id: 'frame0' };
    any.frames = [f0, { id: 'frame1' }, { id: 'frame2' }];
    expect(r.portraitTexture()).toBe(f0);
  });
});
