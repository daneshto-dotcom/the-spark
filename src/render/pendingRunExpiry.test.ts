/**
 * SPARK — S183: **THE OFFLINE QUEUE MAY NOT OUTLIVE THE SERVER'S MEMORY OF IT.**
 *
 * ## The defect this file closes
 *
 * The board ranks by AVERAGE and stores sum-and-count (`SPARK_CANON.md` §9), so a run folded twice
 * is a **permanently** wrong number — no later play repairs it. The idempotency key added in S182
 * was supposed to make that impossible. It did not, because the two sides disagreed about time:
 *
 * | side | bound |
 * |---|---|
 * | server, `seen_runs` | pruned after `SEEN_RUN_TTL_MS` (24 h), **unscoped** — any client's POST ages out every client's keys |
 * | client, `PendingRun[]` | bounded by COUNT (`PENDING_CAP` = 200), with **no timestamp at all** |
 *
 * So: a run commits server-side, the 4 s `AbortSignal` fires before the reply lands, the run queues.
 * The player does not play for two days. Another player's POST prunes the key. The next flush
 * re-sends the run, the dedupe SELECT misses, and one game is counted twice forever.
 *
 * ## ⭐ WHY THIS TEST IMPORTS THE WORKER
 *
 * The whole fix is an INEQUALITY between a constant in `src/` and a constant in `server/`. A test
 * that re-typed `24 * 60 * 60 * 1000` would pin itself, not the worker — the S181 rule
 * (*"derive the literal from the constant"*) in its cross-file form. `src/server.worker.test.ts`
 * already imports the worker this way, and `worker.d.ts` carries the declarations.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { SEEN_RUN_TTL_MS } from '../../server/leaderboard/worker.js';
import {
  BOARD_NONET,
  loadPending,
  PENDING_MAX_AGE_MS,
  prunePending,
  savePending,
  type PendingRun,
} from './arcadeScores.ts';

function run(over: Partial<PendingRun> = {}): PendingRun {
  return { name: 'DAN', ms: 60_000, id: 'r1', at: 1_000_000, ...over };
}

describe('S183 — the client retry window is INSIDE the server key window', () => {
  it('⛔ PENDING_MAX_AGE_MS does not exceed the worker\'s SEEN_RUN_TTL_MS', () => {
    expect(PENDING_MAX_AGE_MS).toBeLessThanOrEqual(SEEN_RUN_TTL_MS);
  });

  it('⚠ and keeps real slack for clock skew — the two clocks are different machines', () => {
    // Not a style point: `at` is the player's wall clock, `seen_runs.created` is the server's. A
    // window that merely touched the TTL would be walked past it by a badly-set device clock.
    expect(SEEN_RUN_TTL_MS - PENDING_MAX_AGE_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });

  it('the window is long enough to be useful at all — this is not a disguised "never retry"', () => {
    expect(PENDING_MAX_AGE_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });
});

describe('S183 — prunePending drops exactly what the server would no longer deduplicate', () => {
  const now = 10_000_000;

  it('keeps a run minted just now', () => {
    expect(prunePending([run({ at: now })], now)).toHaveLength(1);
  });

  it('keeps a run one millisecond inside the window', () => {
    expect(prunePending([run({ at: now - PENDING_MAX_AGE_MS + 1 })], now)).toHaveLength(1);
  });

  it('⛔ drops a run exactly AT the window — the boundary belongs to the safe side', () => {
    expect(prunePending([run({ at: now - PENDING_MAX_AGE_MS })], now)).toHaveLength(0);
  });

  it('⛔ drops the two-day-old run that is the whole bug report', () => {
    const twoDays = now - 2 * 24 * 60 * 60 * 1000;
    expect(prunePending([run({ at: twoDays })], now)).toHaveLength(0);
  });

  it('prunes per item, not per batch — one stale run does not bin a live backlog', () => {
    const kept = prunePending(
      [
        run({ id: 'old', at: now - 2 * PENDING_MAX_AGE_MS }),
        run({ id: 'new', at: now - 1000 }),
      ],
      now,
    );
    expect(kept.map((r) => r.id)).toEqual(['new']);
  });

  it('is PURE — it does not mutate the list it is handed', () => {
    const src = [run({ id: 'old', at: 0 }), run({ id: 'new', at: now })];
    const copy = [...src];
    prunePending(src, now);
    expect(src).toEqual(copy);
  });
});

/** The same in-memory `localStorage` stub `arcadeLeaderboard.test.ts` installs. */
function installStorage(): void {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => { map.clear(); },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
}

describe('S183 — the timestamp survives storage, which is the point of storing it', () => {
  beforeEach(installStorage);

  it('round-trips `at` verbatim — a re-stamp on read would defeat the expiry entirely', () => {
    savePending([run({ at: 1_234_567 })], BOARD_NONET);
    expect(loadPending(BOARD_NONET)[0]?.at).toBe(1_234_567);
    // …and again. If the read minted a fresh stamp, the run would be immortal.
    expect(loadPending(BOARD_NONET)[0]?.at).toBe(1_234_567);
  });

  it('⚠ a legacy row with no `at` is stamped, not dropped — the upgrade cannot bin a backlog', () => {
    globalThis.localStorage?.setItem(
      `spark.arcade.${BOARD_NONET}.pending.v1`,
      JSON.stringify([{ name: 'DAN', ms: 60_000, id: 'legacy' }]),
    );
    const [only] = loadPending(BOARD_NONET);
    expect(only?.id).toBe('legacy');
    expect(only?.at).toBeGreaterThan(0);
    // It is fresh, so it survives one more window — the documented cost of the upgrade.
    expect(prunePending([only as PendingRun])).toHaveLength(1);
  });

  it('a garbage `at` is treated as missing rather than as a 1970 run', () => {
    globalThis.localStorage?.setItem(
      `spark.arcade.${BOARD_NONET}.pending.v1`,
      JSON.stringify([{ name: 'DAN', ms: 60_000, id: 'x', at: 'yesterday' }]),
    );
    const [only] = loadPending(BOARD_NONET);
    expect(only?.at).toBeGreaterThan(0);
  });
});
