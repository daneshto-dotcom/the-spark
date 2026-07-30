/**
 * SPARK — v0.6 economy probe: PRE-LOAD BOOTSTRAP (V6-0.1, S128).
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM probeHarness.ts
 * ---------------------------------------------------
 * `SPAWN_RATE_PER_SECOND` in constants.ts is captured **once at module init**
 * (`readTestSpawnRate() ?? 0.1875`). So a `?spawn=` override has to be written to
 * `window.__TEST_SPAWN_RATE_PER_SECOND__` BEFORE constants.ts evaluates. That means this
 * module must be the FIRST import in main.ts — it is imported for its side effect only.
 *
 * The seam itself is the one Playwright already uses via `addInitScript` (constants.ts:78-107),
 * and its own docblock records the determinism argument: λ scales the interarrival, **not the
 * RNG draw order**, so replay byte-identity holds for a fixed seed. Overriding λ is therefore
 * determinism-safe by design rather than by our assertion.
 *
 * FRAGILITY, STATED OUT LOUD: this depends on ES-module import ORDER. If someone reorders
 * main.ts's imports, the override silently stops taking effect. That is exactly why
 * probeHarness.ts's overlay reports the **observed** `SPAWN_RATE_PER_SECOND` rather than the
 * requested one — a failed override is visible, never assumed (Council R2, GROK stale-override
 * warning + GEMINI auto-reset).
 *
 * DEV-ONLY. Vite statically replaces `import.meta.env.DEV` with `false` in a production build,
 * so the whole body dead-code-eliminates and this module becomes empty. Repo idiom, with the
 * zero-cost guarantee documented at `src/game/invariants.ts:17`.
 *
 * V6-RISK(B3): this file is the instrument that settles the faucet ruling. See
 * `SPARK_v0.6_DESIGN.md` §2 (B3) and the CARRY-FORWARD LEDGER in BACKLOG.md.
 */

if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('probe') === '1') {
    const raw = params.get('spawn');
    if (raw !== null) {
      const v = Number(raw);
      if (Number.isFinite(v) && v > 0) {
        (window as { __TEST_SPAWN_RATE_PER_SECOND__?: number })
          .__TEST_SPAWN_RATE_PER_SECOND__ = v;
      } else {
        // Loud, not silent: a malformed override must never read as "no override".
        console.warn(`[probe] ignoring malformed ?spawn=${raw} (need a finite number > 0)`);
      }
    }
  }
}

export {};
