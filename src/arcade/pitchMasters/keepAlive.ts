/**
 * PITCH MASTERS (arcade) — keeps an online match running while its tab is in the background.
 *
 * Source of truth: the Pitch Masters repo, `web/spark/src/arcade/pitchMasters/` (PM-S2 online2).
 *
 * The Godot web build runs its main loop on `requestAnimationFrame` (Emscripten's RAF timing, which calls
 * the global `requestAnimationFrame` each frame). A background tab (hidden, minimised or covered window)
 * gets no animation frames, so the HOST's simulation froze whenever the host switched tabs, and with it
 * the whole match. Page timers are no help: a background tab's setTimeout/setInterval are clamped to once a
 * second (later once a minute).
 *
 * Fix: every animation-frame request goes through one queue. A real animation frame flushes it, exactly as
 * before. A tiny Web Worker (worker timers are not throttled) ticks every 16 ms, one tick in flight at most;
 * when `active()` says a match is on and the tab is hidden (or no real frame has come for STARVED_MS after
 * the last one ended: Chrome throttles or stopped painting it), the queue is flushed on the worker tick
 * instead, so Godot keeps simulating (and sending snapshots) at up to ~60 Hz. A visible page, however slow,
 * runs on its real frames only (a long frame is not a gap). Outside a match a background tab still pauses,
 * as it always did (a game vs the AI should wait for you).
 * Measured in a real Chrome (2026-09-29, a second tab activated over the host over CDP on this machine): the
 * host tab kept `visibilityState === 'visible'` but got about ONE animation frame per second. With the old
 * 1 s threshold that never counted as starved and the match crawled; STARVED_MS 250 drives it at full pace.
 *
 * `onBackground(bool)` fires when the tab goes to the background (hidden, or no real frame for BACKGROUND_MS)
 * and back: the partner is told "switched to another tab".
 * `window.__pmFrames` / `__pmWorkerFrames` count flushed frames, `__pmWorkerTicks` the worker ticks the page
 * got (the harness reads them).
 */

type Cb = FrameRequestCallback;

declare global {
  interface Window {
    __pmFrames?: number;
    __pmWorkerFrames?: number;
    __pmWorkerTicks?: number;
  }
}

/**
 * No real frame for this long AFTER the last one ended, while one is wanted = the page is starved (a tab
 * Chrome throttles without reporting it hidden, covered / minimised windows): the worker drives the frames.
 * Measured from the end of a frame, so a visible page that is merely SLOW (a weak laptop, a software-rendered
 * test browser: 100-500 ms frames, each followed at once by the next) keeps its own pace; the worker only
 * fills real gaps (the S2 harness once saw 30 s message lag when worker frames ran back to back behind slow
 * real ones).
 */
const STARVED_MS = 250;
/**
 * Once the worker is carrying the page (it flushed a frame within DRIVEN_HOLD_MS), a gap of DRIVEN_GAP_MS is
 * enough: a throttled tab's one real frame a second must not open a fresh 250 ms hole every second (measured
 * in a real Chrome: 21 fps covered vs 48 visible with the hole). A page that is really painted again runs on
 * its real frames within DRIVEN_HOLD_MS (its gaps after a frame stay under a vsync, well below DRIVEN_GAP_MS).
 */
const DRIVEN_GAP_MS = 40;
const DRIVEN_HOLD_MS = 1500;
/** No real frame for this long (or hidden): the tab is in the background, the partner is told. */
const BACKGROUND_MS = 2000;
/**
 * The worker ticks every 16 ms but keeps at most ONE tick in flight: it posts only after the page answered
 * the previous one. A page slower than 60 Hz therefore never builds a backlog of ticks in front of its
 * WebRTC messages.
 */
const WORKER_SRC = `let armed = true; onmessage = () => { armed = true; }; setInterval(() => { if (armed) { armed = false; postMessage(0); } }, 16);`;

export function installKeepAlive(active: () => boolean, onBackground: (bg: boolean) => void = () => undefined): void {
  const realRAF = window.requestAnimationFrame.bind(window);
  let queue = new Map<number, Cb>();
  let nextId = 1;
  let pumpPending = false;
  let lastReal = performance.now();
  let lastDriven = -Infinity;
  let background = false;
  window.__pmFrames = 0;
  window.__pmWorkerFrames = 0;
  window.__pmWorkerTicks = 0;

  const setBackground = (bg: boolean): void => {
    if (bg === background) return;
    background = bg;
    onBackground(bg);
  };

  const flush = (ts: number, fromWorker: boolean): void => {
    if (queue.size === 0) return;
    const run = queue;
    queue = new Map();
    window.__pmFrames = (window.__pmFrames ?? 0) + 1;
    if (fromWorker) window.__pmWorkerFrames = (window.__pmWorkerFrames ?? 0) + 1;
    for (const cb of run.values()) {
      try {
        cb(ts);
      } catch (e) {
        console.error('[keepalive] frame callback failed', e);
      }
    }
  };

  const pump = (): void => {
    if (pumpPending) return;
    pumpPending = true;
    realRAF((ts) => {
      pumpPending = false;
      lastReal = performance.now();
      if (document.visibilityState !== 'hidden') setBackground(false);
      flush(ts, false);
      // Starvation is the gap AFTER a real frame, not its length: one long frame (a synchronous match load,
      // seconds on a weak laptop) must not make the next worker tick call the page starved, flash
      // "switched to another tab" at the partner and run an extra frame back to back.
      lastReal = performance.now();
    });
  };

  try {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = () => {
      try {
        window.__pmWorkerTicks = (window.__pmWorkerTicks ?? 0) + 1;
        const now = performance.now();
        // Only a frame someone is waiting for can be starved (the bridge-only page never asks for one).
        const waiting = queue.size > 0;
        const hidden = document.visibilityState === 'hidden';
        const gap = now - lastReal;
        const driven = now - lastDriven < DRIVEN_HOLD_MS;
        const starved = waiting && (hidden || gap > (driven ? DRIVEN_GAP_MS : STARVED_MS));
        setBackground(hidden || (waiting && gap > BACKGROUND_MS));
        if (starved && active()) {
          flush(now, true);
          lastDriven = performance.now();
        }
      } finally {
        worker.postMessage(0); // re-arm: the next tick comes only after this one is done
      }
    };
  } catch (e) {
    console.warn('[keepalive] no worker: a background tab will pause the game', e);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') setBackground(true);
    else pump();
  });

  window.requestAnimationFrame = (cb: Cb): number => {
    const id = nextId++;
    queue.set(id, cb);
    pump();
    return id;
  };
  window.cancelAnimationFrame = (id: number): void => {
    queue.delete(id);
  };
}
