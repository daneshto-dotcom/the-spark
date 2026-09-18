/**
 * SPARK — type surface for the leaderboard worker.
 *
 * ⭐ WHY THIS EXISTS. `src/server.worker.test.ts` imports the worker so it can be EXECUTED rather than
 * grepped — before S182 the only server SPARK has had zero test coverage. The main `tsconfig.json`
 * covers `src`, so that import needs declarations or the suite cannot typecheck.
 *
 * ⚠ IT DECLARES ONLY WHAT THE TESTS DRIVE, and deliberately keeps `env` loose. The Cloudflare D1
 * binding is faked in the tests by dispatching on SQL text, and typing it properly would mean
 * pulling in `@cloudflare/workers-types` for a single file — a dependency whose only job would be to
 * describe a stub. The worker's own JS is checked separately by `tsconfig.server.json`.
 */

/** Exactly three upper-case characters, drawn from the arcade alphabet. */
export function normaliseName(raw: unknown): string;

/** True for the live game origin and for any localhost port (dev servers get a random one). */
export function isAllowedOrigin(origin: string): boolean;

/**
 * Validate and clamp a submitted batch, PER ITEM.
 *
 * `error` is set only when the REQUEST is malformed. An implausible ITEM is counted in `rejected`
 * and dropped — failing the whole batch is what let one bad queued run poison every run behind it.
 */
export function parseRuns(body: unknown): {
  runs?: Array<{ name: string; ms: number; id: string | null }>;
  rejected?: number;
  error?: string;
};

/** Stored rows → the ranking order: average ASC, then runs DESC, then name ASC. */
export function rankRows(
  rows: ReadonlyArray<{ name: string; runs: number; total_ms: number }>,
): Array<{ name: string; runs: number; averageMs: number }>;

declare const worker: {
  fetch(request: Request, env: { DB: unknown; IP_SALT?: string }): Promise<Response>;
};
export default worker;
