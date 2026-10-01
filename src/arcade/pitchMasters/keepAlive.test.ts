/**
 * PITCH MASTERS (arcade) — keep-alive, driven with a fake window: real animation frames, the worker's
 * ticks and the clock are all stepped by hand. The browser harness covers the real page (hidden host tab).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { installKeepAlive } from './keepAlive.ts';

type Tick = () => void;

/** A fake page: `raf()` delivers one real animation frame, `tick()` one worker tick, `now` is the clock. */
class FakePage {
  now = 0;
  visibility: 'visible' | 'hidden' = 'visible';
  frames = 0;
  background: boolean[] = [];
  private rafs: FrameRequestCallback[] = [];
  private workerTick: Tick | null = null;
  private readonly listeners: (() => void)[] = [];
  private frameMs = 16;

  constructor(active: () => boolean) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const page = this;
    const win = {
      requestAnimationFrame: (cb: FrameRequestCallback): number => {
        this.rafs.push(cb);
        return this.rafs.length;
      },
      cancelAnimationFrame: (): void => undefined,
    } as unknown as Window & typeof globalThis;
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', {
      get visibilityState() {
        return page.visibility;
      },
      addEventListener: (_type: string, fn: () => void) => this.listeners.push(fn),
    });
    vi.stubGlobal('Worker', class {
      onmessage: ((e: unknown) => void) | null = null;
      constructor() {
        page.workerTick = () => this.onmessage?.({});
      }
      postMessage(): void {}
    });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:keepalive' });
    vi.spyOn(performance, 'now').mockImplementation(() => this.now);
    installKeepAlive(active, (bg) => this.background.push(bg));
    // The game: every frame asks for the next one and takes frameMs of main-thread time.
    const loop = (): void => {
      this.frames++;
      this.now += this.frameMs;
      window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
  }

  /** The next real frames take this long. */
  setFrameMs(ms: number): void {
    this.frameMs = ms;
  }

  /** One real animation frame (Chrome paints the tab). */
  raf(): void {
    const cbs = this.rafs;
    this.rafs = [];
    for (const cb of cbs) cb(this.now);
  }

  /** `ms` of idle time, then one worker tick. */
  tick(ms = 16): void {
    this.now += ms;
    this.workerTick?.();
  }

  setVisibility(v: 'visible' | 'hidden'): void {
    this.visibility = v;
    for (const fn of this.listeners) fn();
  }

  get workerFrames(): number {
    return window.__pmWorkerFrames ?? 0;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('keep-alive', () => {
  it('a slow VISIBLE page keeps its own pace: long frames (a 20 s match load too) are never called starved', () => {
    const p = new FakePage(() => true);
    for (const ms of [1500, 1500, 20_000, 400, 1200]) {
      p.setFrameMs(ms);
      p.raf(); // one real frame, `ms` long
      p.tick(); // the worker ticks right after it
      p.tick();
    }
    expect(p.frames).toBe(5); // real frames only
    expect(p.workerFrames).toBe(0); // no extra frame run back to back behind a long one
    expect(p.background).toEqual([]); // and the partner is never told "switched to another tab"
  });

  it('a HIDDEN tab in a match: the worker drives the frames, the partner is told, and back on show', () => {
    const p = new FakePage(() => true);
    p.raf();
    p.setVisibility('hidden');
    expect(p.background).toEqual([true]);
    for (let i = 0; i < 30; i++) p.tick(); // no real frames while hidden
    expect(p.frames).toBe(31);
    expect(p.workerFrames).toBe(30);
    p.setVisibility('visible');
    p.raf();
    expect(p.background).toEqual([true, false]);
  });

  it('a hidden tab outside a match (vs the AI, the menu) pauses, as it always did', () => {
    const p = new FakePage(() => false);
    p.raf();
    p.setVisibility('hidden');
    for (let i = 0; i < 30; i++) p.tick();
    expect(p.frames).toBe(1);
    expect(p.workerFrames).toBe(0);
  });

  it('back on its real frames (painted again at 60 Hz): the worker lets go within 1.5 s', () => {
    const p = new FakePage(() => true);
    p.raf();
    for (let i = 0; i < 40; i++) p.tick(16); // throttled: the worker carries it
    const driven = p.workerFrames;
    expect(driven).toBeGreaterThan(20);
    p.setFrameMs(10);
    for (let i = 0; i < 180; i++) { // 3 s of real 60 Hz frames, a worker tick 6 ms after each
      p.raf();
      p.tick(6);
    }
    expect(p.workerFrames).toBe(driven); // gaps of 6 ms are no gap: not one extra frame
    expect(p.background).toEqual([]);
  });

  it('a visible but STARVED page (no real frame 250 ms after the last one ended) is driven by the worker; the partner is told only after 2 s', () => {
    const p = new FakePage(() => true);
    p.raf();
    p.tick(200);
    expect(p.workerFrames).toBe(0); // a 200 ms gap is still a slow page
    p.tick(100); // 300 ms since the last real frame ended
    expect(p.workerFrames).toBe(1);
    expect(p.background).toEqual([]); // driven, but not "in the background" yet
    while (p.background.length === 0 && p.workerFrames < 100) p.tick(100);
    expect(p.background).toEqual([true]); // 2 s without a real frame: the partner is told
    p.raf(); // Chrome paints it again
    expect(p.background).toEqual([true, false]);
  });

  it('a throttled VISIBLE tab (one real frame a second, measured in a real Chrome behind another tab) runs at full pace, the partner is not bothered', () => {
    const p = new FakePage(() => true);
    p.raf();
    for (let sec = 0; sec < 5; sec++) {
      for (let i = 0; i < 60; i++) p.tick(16); // the worker's ticks during that second
      p.raf(); // Chrome's one frame a second
    }
    expect(p.workerFrames).toBeGreaterThan(5 * 55); // ~58 driven frames a second: no fresh 250 ms hole after each real frame
    expect(p.background).toEqual([]);
  });
});
