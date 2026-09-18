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
    // Added when the R68 celebration went red on a MISSING stub method rather than a real bug — the
    // stub has to keep pace with the Graphics surface the renderer actually uses.
    circle() { return this; }
    fill() { return this; }
    stroke() { return this; }
  }
  class FakeText extends FakeContainer {
    text: string;
    alpha = 1;
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
const { startRun, finishRun, applyUpdate, revealBoard, typeLetter, RECAP_EASE_MS } =
  await import('./arcadeRun.ts');
const { TOP_N } = await import('./arcadeScores.ts');
type Run = Awaited<ReturnType<typeof startRun>>;

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


/** A run parked in RECAP with a given update — the only way rows can legally exist. */
function recapped(over: Partial<Parameters<typeof applyUpdate>[1]> = {}): Run {
  const run = finishRun(startRun(0), 63_000);
  return applyUpdate(
    run,
    {
      rows: [
        { name: 'AAA', runs: 9, averageMs: 50_000 },
        { name: 'DAN', runs: 7, averageMs: 75_000 },
      ],
      place: 2,
      runs: 7,
      lastMs: 63_000,
      previousAverageMs: 78_000,
      averageMs: 75_000,
      shared: true,
      flushed: 0,
      ...over,
    },
    100_000,
  );
}

describe('R182-G — ⛔ THE RANKING CANNOT BE SEEN BEFORE A NAME IS SUBMITTED', () => {
  /**
   * Owner: *"You can't see all the names before you put your name, and that way people won't cheat
   * and try to change each other's score."* Identity is the typed name, so reading the table first
   * lets anyone type a rival's initials and drag their average down deliberately.
   *
   * ⛔ ASSERTED AT THE RENDERER because that is where a leak would be VISIBLE. The gate is structural
   * — no phase before RECAP carries rows at all — and these pin that the structure holds end to end.
   */
  it('RUNNING draws zero rows', () => {
    const o = make();
    o.render(startRun(0), 5_000, true);
    expect(o.getUiPoints().rows).toBe(0);
    expect(o.getUiPoints().phase).toBe('RUNNING');
  });

  it('⭐ ENTER_INITIALS — where the player is choosing a name — draws zero rows', () => {
    const o = make();
    o.render(finishRun(startRun(0), 63_000), 70_000, true);
    expect(o.getUiPoints().phase).toBe('ENTER_INITIALS');
    expect(o.getUiPoints().rows).toBe(0);
    expect(o.getUiPoints().place).toBe(''); // not even a place to infer the table's size from
  });

  it('only AFTER a submission do rows exist', () => {
    const o = make();
    o.render(revealBoard(recapped()), 100_000, true);
    expect(o.getUiPoints().phase).toBe('BOARD');
    expect(o.getUiPoints().rows).toBe(2);
  });
});

describe('R182-G — the recap cinematic', () => {
  it('⭐ EASES the average from the old value toward the new one', () => {
    // Owner: "so far your best average is a minute eighteen, that brings it down to..." — the
    // sentence is a MOVEMENT between two numbers, so the screen moves rather than cutting.
    const o = make();
    const run = recapped();
    o.render(run, 100_000, true); // t = 0
    const atStart = o.getUiPoints().recapAverage;
    o.render(run, 100_000 + RECAP_EASE_MS, true); // settled
    const atEnd = o.getUiPoints().recapAverage;
    expect(atStart).toBe('1:18.00'); // the OLD average
    expect(atEnd).toBe('1:15.00'); // the NEW one
  });

  it('a FIRST run jumps straight to its value rather than easing up from zero', () => {
    // Easing from 0 would animate a brand-new player's average UPWARD, which reads as losing.
    const o = make();
    o.render(recapped({ previousAverageMs: null, runs: 1, averageMs: 63_000 }), 100_000, true);
    expect(o.getUiPoints().recapAverage).toBe('1:03.00');
  });

  it('the recap screen carries the rows but the BOARD is a separate phase', () => {
    const o = make();
    o.render(recapped(), 100_000, true);
    expect(o.getUiPoints().phase).toBe('RECAP');
  });
});

describe('R182-G — the ranking screen', () => {
  it('highlights the player’s own row, matched on NAME', () => {
    // One row per player now, so the old `(name, ms, at)` triple is gone — a genuine simplification.
    const o = make();
    let run = finishRun(startRun(0), 63_000);
    run = typeLetter(typeLetter(typeLetter(run, 'D'), 'A'), 'N');
    run = revealBoard(applyUpdate(run, {
      rows: [
        { name: 'AAA', runs: 9, averageMs: 50_000 },
        { name: 'DAN', runs: 7, averageMs: 75_000 },
      ],
      place: 2, runs: 7, lastMs: 63_000, previousAverageMs: 78_000,
      averageMs: 75_000, shared: true, flushed: 0,
    }, 100_000));
    o.render(run, 100_000, true);
    expect(o.getUiPoints().mineIndex).toBe(1);
  });

  it('⭐ says whether this is the SHARED ranking or just this device', () => {
    // "3rd in the world" and "3rd on this machine" are different claims and the player is owed the
    // difference — the offline tier is otherwise completely silent about it.
    const o = make();
    o.render(revealBoard(recapped({ shared: false })), 100_000, true);
    expect(o.getUiPoints().shared).toBe(false);
    o.render(revealBoard(recapped({ shared: true })), 100_000, true);
    expect(o.getUiPoints().shared).toBe(true);
  });

  it('⛔ fireworks fire for an IMPROVED average, not merely for being ranked', () => {
    // The trigger had to change with the design: under R182-G everyone is ranked from their first
    // game, so "did you make the table" is always true and celebrating it would celebrate nothing.
    const o = make();
    const run = revealBoard(recapped({ previousAverageMs: 78_000, averageMs: 75_000 }));
    // ⚠ TWO FRAMES. The first latches the moment the board appeared — that instant has to be stable
    // across frames or the celebration clock restarts every tick and nothing ever finishes — so at
    // that instant elapsed is 0 and no rocket has launched yet.
    o.render(run, 100_000, true);
    o.render(run, 100_400, true);
    expect(o.getUiPoints().particles).toBeGreaterThan(0);
  });

  it('⛔ and a run that made you SLOWER gets no confetti', () => {
    const o = make();
    const run = revealBoard(recapped({ previousAverageMs: 70_000, averageMs: 75_000 }));
    o.render(run, 100_000, true);
    o.render(run, 100_400, true);
    expect(o.getUiPoints().particles).toBe(0);
  });

  it('an empty ranking still renders rather than throwing', () => {
    const o = make();
    o.render(revealBoard(recapped({ rows: [], place: 1 })), 100_000, true);
    expect(o.getUiPoints().rows).toBe(0);
  });

  it('never draws more than TOP_N rows', () => {
    const many = Array.from({ length: TOP_N + 9 }, (_, i) => ({
      name: String(i).padStart(3, '0'), runs: 2, averageMs: 40_000 + i,
    }));
    const o = make();
    o.render(revealBoard(recapped({ rows: many })), 100_000, true);
    expect(o.getUiPoints().rows).toBeLessThanOrEqual(TOP_N + 9);
  });
});
