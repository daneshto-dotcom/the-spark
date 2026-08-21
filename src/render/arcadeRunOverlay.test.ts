/**
 * SPARK — S150 P3: the arcade run overlay's VISIBILITY CONTRACT.
 *
 * ## ⛔ WHY THIS FILE EXISTS AT ALL, AND WHY IT ASSERTS ONLY ONE THING
 *
 * It does not test the drawing — no headless test can see contrast or z-order, which is the standing
 * "look at the frame" lesson. It tests the ONE property that has actually shipped as a bug in this
 * repo, twice in a single session: **a renderer whose visibility is keyed on the wrong thing draws
 * on a screen it does not belong to.** S149 shipped border walls onto the TITLE SCREEN (a
 * never-started world reads `matchPhase === 'BUILD'`), then found four more HUD instruments leaking
 * the same way (`world.players` holds P1 from boot, so every "is the player alive" guard passes on
 * the menu).
 *
 * This overlay is the INVERSE case — it belongs ON the title screen — so the failure mode inverts
 * with it: it must never survive into a match. The guarantee is structural rather than careful:
 * `render()` takes `onTitle` as an ARGUMENT and there is no `show()`/`hide()` pair for a future exit
 * path to forget. These assertions pin that structure, so removing the argument breaks a test rather
 * than a playtest.
 *
 * Pixi is stubbed rather than mocked-in-depth: the contract under test is entirely about which
 * branch `render()` takes, and `getUiPoints()` reports that faithfully.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class FakeContainer {
    children: unknown[] = [];
    visible = true;
    eventMode = 'auto';
    hitArea: unknown = null;
    position = { set: () => {} };
    anchor = { set: () => {} };
    parent: FakeContainer | null = null;
    addChild(c: { parent?: FakeContainer | null }): void {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1); // addChild MOVES an existing child, as Pixi does
      this.children.push(c);
      c.parent = this as unknown as FakeContainer;
    }
    destroy(): void {}
  }
  class FakeGraphics extends FakeContainer {
    clear() { return this; }
    rect() { return this; }
    roundRect() { return this; }
    fill() { return this; }
    stroke() { return this; }
  }
  class FakeText extends FakeContainer {
    text: string;
    style: { fontSize: number; fill: number };
    constructor(o: { text: string; style: { fontSize: number; fill: number } }) {
      super();
      this.text = o.text;
      this.style = o.style;
    }
  }
  return { Application: class {}, Container: FakeContainer, Graphics: FakeGraphics, Text: FakeText };
});

const { ArcadeRunOverlay } = await import('./arcadeRunOverlay.ts');
const { startRun, finishRun, commitRun, typeLetter } = await import('./arcadeRun.ts');

function installStorage(): void {
  const map = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  } as Storage;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const make = () => new ArcadeRunOverlay({ stage: undefined } as any, new (class {
  children: unknown[] = [];
  addChild(c: { parent?: unknown }) { this.children.push(c); c.parent = this; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
})() as any);

beforeEach(installStorage);

describe('S150 P3 — the overlay is invisible unless a run is live ON THE TITLE SCREEN', () => {
  it('nothing to draw with no run', () => {
    const o = make();
    o.render(null, 0, true);
    expect(o.getUiPoints().visible).toBe(false);
    expect(o.getUiPoints().phase).toBeNull();
  });

  it('⭐ A LIVE RUN DRAWS NOTHING ONCE THE APP LEAVES THE TITLE SCREEN', () => {
    // THE regression guard. If someone "optimises" the render call behind an `if (arcadeRun)` and
    // drops the gameState argument, this is what goes red — instead of a clock floating over a real
    // match, discovered by the owner in a playtest.
    const o = make();
    const run = startRun(0);
    o.render(run, 5_000, false);
    expect(o.getUiPoints().visible).toBe(false);
  });

  it('and it comes back the moment the title screen returns — no latched state', () => {
    const o = make();
    const run = startRun(0);
    o.render(run, 1_000, true);
    expect(o.getUiPoints().visible).toBe(true);
    o.render(run, 2_000, false);
    expect(o.getUiPoints().visible).toBe(false);
    o.render(run, 3_000, true);
    expect(o.getUiPoints().visible).toBe(true);
    // Recomputed from (run, onTitle) every frame, so the clock is live again rather than frozen at
    // whatever it read when it was hidden.
    expect(o.getUiPoints().clock).toBe('0:03.00');
  });

  it('exposes NO show()/hide() for a future exit path to forget', () => {
    // The structural claim in the docblock, asserted rather than asserted-in-prose. Adding an
    // imperative visibility toggle to this class should fail here and force a conversation.
    const o = make();
    expect((o as unknown as Record<string, unknown>).show).toBeUndefined();
    expect((o as unknown as Record<string, unknown>).hide).toBeUndefined();
  });
});

describe('S150 P3 — each phase reports what it drew', () => {
  it('RUNNING shows a live clock and swallows no pointers', () => {
    const o = make();
    o.render(startRun(1_000), 4_500, true);
    const ui = o.getUiPoints();
    expect(ui.phase).toBe('RUNNING');
    expect(ui.clock).toBe('0:03.50');
    // The clock floats over the NONET grid; eating its clicks would make the puzzle unplayable.
    expect(ui.place).toBe('');
  });

  it('ENTER_INITIALS shows the frozen time and the cursor', () => {
    const o = make();
    const run = typeLetter(finishRun(startRun(0), 7_250), 'D');
    o.render(run, 999_999, true);
    const ui = o.getUiPoints();
    expect(ui.phase).toBe('ENTER_INITIALS');
    expect(ui.clock).toBe('0:07.25'); // frozen, despite nowMs being far in the future
    expect(ui.initials).toBe('DAA');
    expect(ui.cursor).toBe(1);
  });

  it('BOARD shows the rows and the place line', () => {
    const o = make();
    const run = commitRun(finishRun(startRun(0), 5_000), 42);
    o.render(run, 6_000, true);
    const ui = o.getUiPoints();
    expect(ui.phase).toBe('BOARD');
    expect(ui.rows).toBe(1);
    expect(ui.place).toBe('1ST — NEW RECORD');
  });

  it('⭐ highlights the RIGHT row when another row shares its time AND its initials', () => {
    // FOUND BY LOOKING AT THE REAL FRAME, not by a unit test. Driving the overlay in the browser
    // produced a board with two rows both reading 0:07.25, and the highlight matched on
    // (name, time) — so it lit whichever sorted first. Two runs sharing a time and a set of initials
    // is not contrived: it is the same player repeating a board they have memorised.
    const first = commitRun(finishRun(startRun(0), 7_250), 100);
    expect(first.scores).toHaveLength(1);
    // A second run, identical name AND identical time, committed later.
    const second = commitRun(finishRun(startRun(0), 7_250), 200);
    expect(second.scores).toHaveLength(2);
    // The comparator breaks the tie by `at`, so the incumbent keeps row 0 and this run is row 1.
    expect(second.scores[0].at).toBe(100);
    expect(second.scores[1].at).toBe(200);

    const o = make();
    o.render(second, 0, true);
    expect(o.getUiPoints().mineIndex).toBe(1);

    // And the earlier run, re-rendered, still points at ITS own row rather than the newer one.
    const o2 = make();
    o2.render({ ...first, scores: second.scores }, 0, true);
    expect(o2.getUiPoints().mineIndex).toBe(0);
  });

  it('an empty board still renders rather than throwing', () => {
    // loadScores() degrades to [] on corrupt storage, so BOARD with zero rows is reachable in
    // production and must not be a crash on the title screen.
    const o = make();
    o.render({ ...commitRun(finishRun(startRun(0), 5_000), 1), scores: [] }, 0, true);
    expect(o.getUiPoints().rows).toBe(0);
  });
});
