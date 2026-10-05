/**
 * SPARK — S195 T20: a DEV-ONLY override of the Nostr relay list, so the real-WebRTC e2e specs can run
 * on a machine that cannot reach the public relays (the Claude Code cloud container: its egress proxy
 * does not carry WebSocket upgrades — `npm run probe-relays` 2026-10-05 → 0/6 answered). Paired with
 * `scripts/live-mp/local-nostr-relay.mjs`:
 *
 *   node scripts/live-mp/local-nostr-relay.mjs                # → ws://127.0.0.1:<port>
 *   VITE_TEST_NOSTR_RELAYS=ws://127.0.0.1:<port> npx playwright test e2e/<spec>.spec.ts
 *
 * Vite exposes any `VITE_*` process variable to the DEV server's `import.meta.env`, so the Playwright
 * `webServer` (which inherits the shell's env) hands it to the page with NO spec or config change —
 * CI runs with the variable unset and sees exactly the shipped list.
 *
 * ⛔ THIS NEVER REACHES A PRODUCTION BUNDLE: the read is behind `import.meta.env.DEV`, which Vite folds
 * to `false` in `npm run build`, so the whole branch is dead code there. It also lives in its OWN
 * module on purpose: `ci.deployGate.test.ts` requires every `env.VITE_*` read in `iceConfig.ts` to be
 * passed by `deploy.yml`'s build step (so a production input can never be forgotten by the deploy).
 * A dev-only seam is not a production input and must not widen that contract.
 */

/** Split a comma-separated relay list; `null` when unset or empty. Pure — the unit test drives it. */
export function parseRelayOverride(raw: string | undefined | null): string[] | null {
  if (raw === undefined || raw === null) return null;
  const urls = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^wss?:\/\//i.test(s));
  return urls.length > 0 ? urls : null;
}

/** The Nostr relays to use INSTEAD of `NOSTR_RELAYS`, or null (always null outside a DEV build). */
export function devNostrRelayOverride(): string[] | null {
  if (!import.meta.env.DEV) return null;
  const relays = parseRelayOverride(import.meta.env.VITE_TEST_NOSTR_RELAYS as string | undefined);
  if (relays !== null) console.warn(`[net] DEV — Nostr relays overridden by VITE_TEST_NOSTR_RELAYS: ${relays.join(', ')}`);
  return relays;
}
