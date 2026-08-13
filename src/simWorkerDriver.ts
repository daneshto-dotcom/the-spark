/**
 * SPARK — S122 P1 (B2 phase d): the MAIN-thread driver for the sim Worker.
 *
 * Owns the Worker lifecycle + the request/response batch discipline (Council L2: main never
 * posts TICK_BATCH N+1 before BATCH_RESULT N — bounds queueing, keeps 1 batch ≈ 1 frame, and
 * preserves the godly matcher's once-per-frame cadence cap). Frames that arrive while a
 * batch is in flight ACCUMULATE their tick count (capped — a hiccup burst is dropped as
 * time-dilation rather than replayed as a catch-up storm).
 *
 * The driver is transport-agnostic: main.ts applies results to the mirror world, forwards
 * snapshot-bearing batches to remote peers, and performs the godly side effects.
 */

import type { GameAction } from './state/world.ts';
import type { ControlState } from './input/controlsCore.ts';
import type { Vec2 } from './types.ts';
import type { WorkerBatchResultMsg, WorkerInitMsg } from './state/workerSim.ts';

/** A hiccup longer than this many pending fixed steps is dropped (time dilation). */
const MAX_CARRIED_TICKS = 10;

/**
 * S143 P1 — THE BATCH WATCHDOG DEADLINE.
 *
 * `failed` was previously set ONLY by an explicit error event: `onerror`, or an `INIT_FAILED`
 * message. A worker that stops responding WITHOUT throwing — an infinite loop inside a reducer,
 * a lost `BATCH_RESULT` — left `inFlight` latched true forever, so `pump` early-returned on
 * every subsequent frame while `failed` stayed FALSE and `isReady` stayed TRUE. main.ts then
 * went on treating the mirror as authoritative: the game freezes solid, permanently, and
 * nothing anywhere reports it. The existing fallback-to-direct-sim repair could never fire,
 * because the only thing that arms it is the flag this hang cannot set.
 *
 * That is survivable while the worker is opt-in behind `?worker=1`. It is not survivable as the
 * default, which is why this ships BEFORE the flip rather than with it.
 *
 * ⚠ DELIBERATELY VERY GENEROUS. A batch is at most `MAX_CARRIED_TICKS` (10) fixed steps, which
 * even the 2-core SwiftShader CI runner completes in well under a second (S127 measured whole
 * bots FRAMES at ~11/s there). 10 s is ~3 orders of magnitude above the real cost, so this can
 * only ever trip on a genuine hang — never on a slow machine. A watchdog that false-positives
 * would be strictly worse than none, since it would drop players out of the worker path for
 * being on modest hardware, which is the exact population the worker exists to help.
 *
 * Background tabs are NOT a false-positive source: `pump` is driven by the render ticker, so
 * the clock is only ever read on a frame we were actually given, and `onmessage` still delivers
 * `BATCH_RESULT` in a throttled tab — so a backgrounded tab returns with `inFlight` already
 * cleared rather than with a stale deadline.
 */
export const WORKER_BATCH_DEADLINE_MS = 10_000;

/**
 * Pure decision half of the watchdog, so the rule is testable without a real `Worker`
 * (there is none in vitest). Returns true iff an in-flight batch has outlived the deadline.
 *
 * Written as `>` rather than `>=` so a deadline of 0 in a test still requires elapsed time,
 * and guarded on `inFlight` so a driver sitting idle can never trip it.
 */
export function batchDeadlineExceeded(
  inFlight: boolean,
  inFlightSinceMs: number,
  nowMs: number,
  deadlineMs: number = WORKER_BATCH_DEADLINE_MS,
): boolean {
  if (!inFlight) return false;
  return nowMs - inFlightSinceMs > deadlineMs;
}

export class SimWorkerDriver {
  private readonly worker: Worker;
  private pendingIntents: GameAction[] = [];
  private inFlight = false;
  private batchSeq = 0;
  private carriedTicks = 0;
  private latest: WorkerBatchResultMsg | null = null;
  private ready = false;
  /** `performance.now()` at which the in-flight batch was posted (S143 P1 watchdog). */
  private inFlightSinceMs = 0;
  /** Set when the watchdog — not an error event — is what condemned the worker. Forensics. */
  watchdogTripped = false;
  /** Set on worker error / INIT failure — main falls back to the direct path. */
  failed = false;
  /** Mirror-vs-worker hash mismatches observed (forensics; surfaced on __SPARK__). */
  hashMismatches = 0;

  constructor(init: WorkerInitMsg) {
    this.worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string };
      if (msg === null || typeof msg !== 'object') return;
      if (msg.type === 'READY') {
        this.ready = true;
        return;
      }
      if (msg.type === 'INIT_FAILED') {
        console.error('[simWorkerDriver] worker INIT failed — falling back to direct sim.');
        this.failed = true;
        return;
      }
      if (msg.type === 'BATCH_RESULT') {
        this.inFlight = false;
        this.latest = msg as WorkerBatchResultMsg;
      }
    };
    this.worker.onerror = (e: ErrorEvent) => {
      console.error('[simWorkerDriver] worker error — falling back to direct sim:', e.message);
      this.failed = true;
    };
    this.worker.postMessage(init);
  }

  get isReady(): boolean {
    return this.ready && !this.failed;
  }

  /** Queue a host-local action / pre-stamped remote INTENT for the next batch. */
  postIntent(action: GameAction): void {
    this.pendingIntents.push(action);
  }

  /**
   * Called once per render frame with the frame's drained fixed-step count. Posts a batch
   * when the previous result has returned; otherwise carries the ticks forward (capped).
   */
  pump(
    ticks: number,
    control: { state: ControlState; cursor: Vec2 },
    alivePeerIds: readonly string[] | null,
  ): void {
    this.carriedTicks = Math.min(this.carriedTicks + ticks, MAX_CARRIED_TICKS);
    if (!this.ready || this.failed) return;
    // S143 P1 — watchdog. Same early return as before for a healthy in-flight batch; the only
    // new behaviour is condemning a batch that has outlived the deadline, so the direct-sim
    // fallback main.ts already implements can actually be reached by a non-throwing hang.
    if (this.inFlight) {
      if (batchDeadlineExceeded(this.inFlight, this.inFlightSinceMs, performance.now())) {
        console.error(
          `[simWorkerDriver] batch ${this.batchSeq} exceeded ${WORKER_BATCH_DEADLINE_MS}ms with no ` +
          `BATCH_RESULT — condemning the worker and falling back to direct sim.`,
        );
        this.watchdogTripped = true;
        this.failed = true;
      }
      return;
    }
    if (this.carriedTicks === 0 && this.pendingIntents.length === 0) return;
    const intents = this.pendingIntents;
    this.pendingIntents = [];
    this.batchSeq++;
    this.inFlight = true;
    // S143 P1 — ONE clock read, shared by the worker's `nowMs` and the watchdog's start stamp,
    // so the deadline is measured from exactly the instant the batch was handed over.
    const postedAtMs = performance.now();
    this.inFlightSinceMs = postedAtMs;
    this.worker.postMessage({
      type: 'TICK_BATCH',
      batchSeq: this.batchSeq,
      ticks: this.carriedTicks,
      control: { state: control.state, cursor: { x: control.cursor.x, y: control.cursor.y } },
      alivePeerIds: alivePeerIds !== null ? [...alivePeerIds] : null,
      intents,
      nowMs: postedAtMs,
    });
    this.carriedTicks = 0;
  }

  /** The newest un-consumed batch result, or null. Consuming clears it. */
  takeResult(): WorkerBatchResultMsg | null {
    const r = this.latest;
    this.latest = null;
    return r;
  }

  terminate(): void {
    this.worker.terminate();
  }
}
