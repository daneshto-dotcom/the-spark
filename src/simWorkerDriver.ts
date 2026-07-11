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

export class SimWorkerDriver {
  private readonly worker: Worker;
  private pendingIntents: GameAction[] = [];
  private inFlight = false;
  private batchSeq = 0;
  private carriedTicks = 0;
  private latest: WorkerBatchResultMsg | null = null;
  private ready = false;
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
    if (!this.ready || this.failed || this.inFlight) return;
    if (this.carriedTicks === 0 && this.pendingIntents.length === 0) return;
    const intents = this.pendingIntents;
    this.pendingIntents = [];
    this.batchSeq++;
    this.inFlight = true;
    this.worker.postMessage({
      type: 'TICK_BATCH',
      batchSeq: this.batchSeq,
      ticks: this.carriedTicks,
      control: { state: control.state, cursor: { x: control.cursor.x, y: control.cursor.y } },
      alivePeerIds: alivePeerIds !== null ? [...alivePeerIds] : null,
      intents,
      nowMs: performance.now(),
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
