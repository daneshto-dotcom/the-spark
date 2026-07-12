/**
 * SPARK — S122 P1 (B2 phase d): the sim Worker entrypoint.
 *
 * A thin postMessage shell around state/workerSim.ts (the tested batch core). Imports ONLY
 * the sim-side module graph (state/, physics/, game/, input/controlsCore) — no Pixi, no
 * DOM, no transport. Vite bundles this as its own module-worker chunk
 * (`new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' })`).
 *
 * Protocol: INIT (bit-exact save adoption) → READY → TICK_BATCH ⇄ BATCH_RESULT
 * (request/response — main never posts batch N+1 before result N). The positions
 * Float64Array is TRANSFERRED (zero-copy) back to main each batch.
 */

// S123 P1 — VS-BOTS worker support. The static import is DELIBERATE and safe HERE (and
// only here): simWorker.ts is its own Vite worker chunk, so the S87 "bots are a lazy
// chunk" entry-bundle charter is untouched. workerSim.ts (imported by main.ts) may only
// type-import BotManager; this entry injects the concrete class via the factory seam.
import { BotManager } from './bots/botManager.ts';
import {
  applyTickBatch,
  makeWorkerSim,
  type WorkerInboundMsg,
  type WorkerSim,
} from './state/workerSim.ts';

// DedicatedWorkerGlobalScope surface without requiring the "webworker" TS lib.
const ctx = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

let sim: WorkerSim | null = null;

ctx.onmessage = (e: MessageEvent): void => {
  const msg = e.data as WorkerInboundMsg;
  if (msg === null || typeof msg !== 'object') return;
  if (msg.type === 'INIT') {
    try {
      sim = makeWorkerSim(msg, (difficulties, matchSeed) => new BotManager(difficulties, matchSeed));
      ctx.postMessage({ type: 'READY', tick: sim.world.tick });
    } catch (err) {
      console.error('[simWorker] INIT failed:', err instanceof Error ? err.message : String(err));
      ctx.postMessage({ type: 'INIT_FAILED', error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (msg.type === 'TICK_BATCH') {
    if (sim === null) return; // INIT failed / not yet arrived — main's READY gate prevents this
    const result = applyTickBatch(sim, msg);
    ctx.postMessage(result, [result.positions.buffer]);
  }
};
