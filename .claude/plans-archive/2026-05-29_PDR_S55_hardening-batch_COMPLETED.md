# PDR — S55 Hardening Batch (test/infra coverage for S52–S54 netcode)

- **Session:** S55
- **Date:** 2026-05-29
- **Tier:** Standard (10–30K) — 1-round 3-way Council + Battle Ledger. **Escalation clause:** if R1 surfaces a convergent BLOCKER or fails to converge, escalate to Full (R2 + quality gate). Borderline estimate (~28–32K) justifies the clause; precedent = S54 (2-priority Standard 1-round, comparable surgical scope).
- **Approval:** USER pre-approved full batch autonomously ("work top recommended priority batch autonomously i pre-approve your full batch and work"). Gate: `pdr_approved` + `deliberation_completed` + `unlock_source=user`.
- **Agent roles:** ZERO (orchestrate) → Council (PLAN) → PDCA (execute) → RALPH:PATROL + Triumvirate (CHECK).

---

## 1. OBJECTIVE

Harden the S52–S54 netcode that has shipped but remains under-verified, with **zero forward-design dependencies** (no game-design decisions required). Three priorities, all targeting test/infra robustness:

- **P1 (#5) — Sym F E2E flake fix.** Eliminate the spark-starvation race in `smoke.spec.ts` Sym F (territorial hard-block) that has flaked in S53 + S54 (failed-then-passed-on-retry). Restores trust in the CI signal. **Test-only.**
- **P2 (#3) — PROTOCOL_VERSION mismatch FULL 2-bundle E2E.** Add the cross-browser end-to-end test that validates the S54-activated HELLO → protocol-mismatch → UX + drop-latch system over a real wire. Directly retires the S54 PRIME-AUDIT honesty caveat ("zero observable behavior today"). Requires a small DEV-only send-side seam + a read accessor.
- **P3 (#4) — controls.test.ts foundation suite.** Greenfield unit coverage for the post-S53-P2 input decision logic (Q-key SHRINK_TERRITORY guard, RMB-down SEVER_BOND pick, LMB-up PLACE_FROM_FREE gates) via behavior-preserving pure-helper extraction.

**Non-goals (explicitly deferred — too risky for unattended overnight):** main.ts 888-LOC trim (refactor regression risk), vitest 4.x major bump (toolchain risk), 48k Opus mp3 re-encode (needs user). Stretch-only if P1–P3 finish with ample budget: `__TEST_RNG_SEED__` seam (clean, low-risk).

---

## 2. STATE-DISCOVERY (A.0 — empirically verified this session)

All claims below were verified via Read/Grep against live source (not handoff assertions):

| # | Claim | Verifier | Result |
|---|-------|----------|--------|
| A | Vitest runs in **node** env (no DOM) | `vite.config.ts` `test:` has no `environment`; `node_modules/{jsdom,happy-dom}` absent; constants.ts uses `typeof window==='undefined'` guards | **CONFIRMED node-only** → #4 MUST use pure-helper extraction, cannot instantiate `Controls` or dispatch DOM events |
| B | `__TEST_*__` seam idiom exists | `constants.ts:86-92,186-191,358-364` — `readTestX()` reads `window.__TEST_X__` at module-eval, `window`-guarded, falls through to prod default | **CONFIRMED** — mirror for #3 send-side override |
| C | Sym F flake = spark-starvation race | `smoke.spec.ts:281-282` — two `dragSparkTo` calls with **no availability-wait + no null-check**; `dragSparkTo` (helpers.ts:235) returns `null` silently when no Free spark is in the 200px pick-zone | **CONFIRMED** root cause |
| D | `buildHello` stamps local `PROTOCOL_VERSION`; receiver compares via `detectProtocolMismatch` | `protocol.ts:41,68-70,139-146`; `transport.ts:225-258` `handleRawMessage` runs detect→latch→fanout | **CONFIRMED** — send-side override on ONE peer is sufficient + realistic |
| E | `__SPARK__` exposes `netTransport.getDiagnostics()` + `lobbyScreen` | `main.ts:345-352` (DEV-only); `transport.ts:584` getDiagnostics; helpers already read `__SPARK__.lobbyScreen.getRoomCode()` | **CONFIRMED** — assertion surface available; `getDiagnostics().rejected++` on mismatch (transport.ts:256) |
| F | No read accessor for lobby status/error text | `lobbyScreen.ts:573` `setErrorMessage` writes `statusText` but no getter; only `getRoomCode`/`getDebugState` exist | **CONFIRMED** — #3 adds a 3-line DEV `getStatusText()` |
| G | No existing `controls.test.ts` | Glob `**/*.test.ts` | **CONFIRMED greenfield** |
| H | HELLO emitted by BOTH peers on join | `hostHandlers.ts:102-110` `wireHelloOnJoin` via `onPeerChange('join')`; called for host (:147) + joiner (clientHandlers) | **CONFIRMED** — host receives joiner's HELLO post-connect, in LOBBY phase |

---

## 3. SCOPE (files)

**P1 (#5) — test-only:**
- `e2e/helpers.ts` — NEW `placeFreeSparkAndConfirm(page, x, y)` robust helper (waits for in-zone Free spark → drags → waits for primitive-count increment).
- `e2e/smoke.spec.ts` — Sym F describe block: replace the 3 bare `dragSparkTo` calls with the robust helper.

**P2 (#3) — production seam + accessor + E2E:**
- `src/net/protocol.ts` — NEW `readTestProtoVersionOverride()` (window-guarded, mirrors constants idiom) + `buildHello` stamps `override ?? PROTOCOL_VERSION` (contained `as 3` cast preserving the production wire-contract type; DEV/test-only deviation).
- `src/render/lobbyScreen.ts` — NEW `getStatusText(): string` DEV/test read accessor.
- `e2e/smoke.spec.ts` — NEW describe block "Protocol mismatch — stale-peer HELLO".
- `src/net/protocol.test.ts` — (optional) assert `buildHello` stamps `PROTOCOL_VERSION` when no override present (regression guard for the production path).

**P3 (#4) — pure-helper extraction + new suite:**
- `src/input/controls.ts` — extract behavior-preserving pure predicates: `decideKeyShrink(...)` (Q-key guard), `decideReleasePlacement(...)` (LMB-up reach/zone/territory gates), export existing `distToSegment` + `computeStiffnessTier`. Handlers delegate to the extracted fns (zero behavior change).
- `src/input/controls.test.ts` — NEW foundation suite (~22–28 cases).

---

## 4. APPROACH (per priority)

### P1 (#5) — Sym F flake fix
Root cause (A.0-C): the 2nd/3rd `dragSparkTo` in Sym F fire without confirming a Free spark is in the pick-zone or that the placement landed; a momentary spark-starvation → `null` drag → fewer than 3 prims → the `>=3 blue prims` wait times out → flake.

Fix — add a deterministic helper:
```ts
export async function placeFreeSparkAndConfirm(page, targetX, targetY): Promise<number> {
  await waitForWorld(page, (w) => w.freeSparks.some((s) =>
    s.state.kind === 'Free' &&
    (s.pos.x - CANVAS_WIDTH/2)**2 + (s.pos.y - CANVAS_HEIGHT/2)**2 < 200*200),
    'a Free spark is available in the spawner zone', 15_000);
  const before = (await readWorldState(page)).primitives.length;
  const id = await dragSparkTo(page, targetX, targetY);
  if (id === null) throw new Error('dragSparkTo returned null despite availability wait');
  await waitForWorld(page, (w) => w.primitives.length >= before + 1,
    `placement landed near (${targetX},${targetY})`, 15_000);
  return id;
}
```
Sym F's 3 placements use this; the existing per-placement assertions stay. **No production code, no bundle impact** (e2e/ excluded from vite build, vite.config.ts:31).

### P2 (#3) — protocol-mismatch FULL 2-bundle E2E
Seam (send-side only, so the receiver's `PROTOCOL_VERSION` literal stays `3`):
```ts
// protocol.ts
function readTestProtoVersionOverride(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_PROTO_VERSION_OVERRIDE__?: number }).__TEST_PROTO_VERSION_OVERRIDE__;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
export function buildHello(playerId, color): HelloMsg {
  const proto = readTestProtoVersionOverride() ?? PROTOCOL_VERSION;
  return { kind: 'HELLO', playerId, color, protoVersion: proto as 3 }; // see DEV-seam comment
}
```
Accessor: `lobbyScreen.getStatusText(): string { return this.statusText.text ?? ''; }`.

E2E flow: joiner context gets `addInitScript({content:'window.__TEST_PROTO_VERSION_OVERRIDE__=2'})`; host gets none. Host hosts, joiner joins, peers connect (`peerCount>=1`). Host receives joiner's HELLO(v2) → `detectProtocolMismatch` (2≠3) → `emitProtocolMismatch` → `onProtocolMismatch` → `formatProtocolMismatchMessage` → `onLobbyError` → `setErrorMessage`. Assertions on HOST:
- `__SPARK__.netTransport.getDiagnostics().rejected >= 1` (HELLO dropped via mismatch branch).
- `__SPARK__.lobbyScreen.getStatusText()` contains `"Protocol mismatch"` AND `"v2"` AND `"v3"` AND `"older"` (proves the full format chain ran with correct values).
- Joiner side stays clean (joiner's PROTOCOL_VERSION=3, sees host's HELLO(3) as a match) — assert joiner `getStatusText()` does NOT contain "Protocol mismatch" (proves the override is send-side-only + context-isolated).

### P3 (#4) — controls.test.ts foundation
Extract (behavior-preserving) + test:
- `decideKeyShrink({ keyName, focusedTag, gameMode, gameState, disruptionCharges })` → boolean. Mirrors `onKeyDown` guards (controls.ts:417-426). `onKeyDown` becomes: read primitives → `if (decideKeyShrink(...)) dispatch(SHRINK_TERRITORY)`.
- `decideReleasePlacement({ isClient, sparkPos, cursor, maxReleaseReach, inZone, inTerritory })` → `{ reachable; commit }`. Captures the S45 client-bypass + S9 reach + S49 territory gate (controls.ts:316-333). Handler computes `inZone`/`inTerritory` (Pixi/world-coupled) then calls the pure fn for the gate composition.
- Export `distToSegment` (controls.ts:615) + `computeStiffnessTier` (controls.ts:638) for direct testing.
- Test existing `stepAttractLerp` (already exported).

Coverage targets: Q-key (q/Q accepted; wrong key; INPUT/TEXTAREA focus block; non-1v1; non-PLAYING; 0 charges; ≥1 charge passes), release gates (host reach pass/fail; client always-reachable bypass; in-zone block; territory block; client zone/territory bypass), distToSegment (endpoint, midpoint, degenerate zero-length, beyond-t-clamp), computeStiffnessTier (anchor→MID; combo lookup), stepAttractLerp (t=rate interpolation + prevPos write).

---

## 5. RISK ANALYSIS

| Risk | Severity | Mitigation |
|------|----------|------------|
| #3 seam leaks into production wire (peer announces wrong version in prod) | HIGH if real | `window`-guard + override only via `addInitScript` (test harness); prod `window.__TEST_*__` undefined → stamps `PROTOCOL_VERSION`. Identical safety model to 3 existing shipped seams. Unit test asserts prod path stamps 3. |
| #3 `as 3` cast hides a type error | LOW | Cast is localized to one line w/ explicit comment; the value is `number` at runtime by design; receiver tolerates any value (detect handles unknown). Council to weigh cast vs. relaxing `HelloMsg.protoVersion` to `number`. |
| #3 new E2E itself flakes | MED | Mismatch fires on HELLO exchange (post-connect, pre-Begin-Match) — does NOT depend on spark-spawn timing (the Sym F flake source). Built on P1's stabilized harness. Only needs `peerCount>=1` which the baseline already achieves reliably. |
| #4 extraction changes behavior | MED | Pure-extraction is behavior-preserving by construction; handlers delegate. Full existing unit suite (842) + tsc must stay green; E2E Sym tests exercise the live handlers end-to-end as integration backstop. |
| #4 over-scoping (refactor creep) | LOW | Extract ONLY the 2 predicates + 2 exports named above; no FSM/structure changes. |
| Council/MCP unavailable overnight | LOW | Per protocol: Gemini err→2-way; both err→solo + logged warning. Proceed regardless. |
| Grok CHECK hallucination (3 consecutive sessions) | MED | Fact-check rule: verify EVERY cited file:line via Read/Grep before adopting any BLOCKER/HIGH. Weight Grok findings as hypotheses. |

---

## 6. TESTING

- **P1:** `npm run e2e` Sym F passes ≥3 consecutive local runs (was flaky 1-in-N). No new unit tests.
- **P2:** new E2E describe passes; `npm run test` protocol.test.ts regression (prod path stamps 3); `tsc -b --noEmit` clean (validates the `as 3` contract).
- **P3:** `npm run test` — new controls.test.ts green; full suite 842 → ~865–870 (no regressions); `tsc` clean.
- **Build:** `npm run build` — bundle stays < 500 KB charter (P3 extraction is net-neutral; P1/P2 e2e is bundle-excluded; P2 prod additions ~12 LOC).
- **CHECK:** RALPH:PATROL + Triumvirate (Grok-ANALYST + Gemini-AUDITOR), fact-checked.
- **End-of-session audit** (Rule 22) before /handoff.

---

## 7. ROLLBACK

Each priority is an independent commit. Revert is per-commit `git revert <sha>`. P1/P3 are isolated (test-only / additive suite + behavior-preserving extraction). P2's production delta is 2 tiny additive functions + 1 accessor — revert restores `buildHello` to the pure `PROTOCOL_VERSION` stamp. No schema/migration/deploy-config changes; no DB; no infra. GH Pages auto-deploys from master — a revert redeploys cleanly.

---

## 8. ESTIMATE / SEQUENCING

- **Order:** P1 (#5, test-only, stabilizes harness) → P2 (#3, builds on stabilized harness) → P3 (#4, independent unit work last).
- **LOC:** P1 ~+30 test; P2 ~+15 prod / ~+70 test; P3 ~+30 prod-refactor / ~+160 test.
- **Tokens:** ~28–32K total (P1 ~6K, P2 ~12K, P3 ~14K).
- **Bundle:** +≤0.4 KB (P2 prod additions only; P1/P3 bundle-neutral).
- **Per-priority completion protocol:** commit+push → session-state (status, check_completed, check_method, real_context_tokens, checkpoint_commit) → print ZERO line → reflexion entry → next.
