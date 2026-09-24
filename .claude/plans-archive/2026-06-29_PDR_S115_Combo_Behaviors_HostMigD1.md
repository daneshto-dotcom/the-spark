# PDR — S115 BATCH: Tier-1 combo behaviors (Anchor + Spindle) + Tier-3 host-migration D1

**Date:** 2026-06-29 · **Session:** S115 · **Tier:** Standard (batch; highest-tier rule — D1 is the driver)
**Pipeline:** Session PDCA v2 · **One approval, executed sequentially P1→P2→P3.**
**Deliberation:** 2-way Council (GROK-ANALYST grok-4.20-reasoning + Claude Supervisor; Gemini 429 credits-depleted, S112–S114 precedent) + PRIME-AUDIT.

---

## 0. A.0 STATE-DISCOVERY (empirical probe — done before lock)

| Claim | Verifier | Result |
|---|---|---|
| Anchor (Dot→Square) + Spindle (Line→Circle) are magic but behaviorless | `grep combos.ts` | TRUE — `isMagical:true`, `resultName:'Anchor'`/`'Spindle'`, S91 comment: "no behavior yet … Anchor anti-drift / Spindle pull are a logged Phase-2 PDR". Forward-key only (reverse stays placeholder). |
| Behavior template = host-only Verlet impulse in stepPhysics | Read `vortex.ts` + `physicsLoop.ts:130` | TRUE — `applyVortexPull(world, attractedId)` called once/tick in `stepPhysics`; shifts `prevPos`; sorts anchors by bond id (IEEE-754 determinism); skips fouled/deleted; caps impulse; skips the dragged spark. |
| Combos identified table-coupled | Read `combos.ts:209-252` | TRUE — `lookupCombo(a,b).resultName==='X'`; `isVortexCombo`/`isFilamentCombo`/`isDefensiveCombo` pattern. |
| No scoring/wire change for these behaviors | Read `scoring.ts:105-158` | TRUE — Anchor/Spindle already count as `magicBonds` (8× premium); adding physics does NOT touch scoring or the combo TABLE → `constants.lock.test.ts` (Magic-14) stays green; NO §6 amendment needed (behaviors, not table edits). |
| Client runs no authoritative physics | BACKLOG "KEY DELIBERATION RESULT" + `main.ts:1086` host-gate | TRUE — host-only sim, unchanged wire ⇒ NO `PROTOCOL_VERSION` bump, cannot desync. |
| D1 crypto machinery already exists | Read `hostIdentity.ts` | TRUE — ECDSA P-256, WebCrypto (0 bundle), domain-separated length-prefixed `buildAttestPayload`, `generateHostIdentity`/`verifyHostAttest`. D1 reuses verbatim. |
| D1 scope is pre-designed + dormant | Read `HOST_MIGRATION_DESIGN.md §9 D1` | TRUE — "client identity gen + pubkey in HELLO + warrant build/sign/verify + unit tests. Feature-flagged off." Protocol bump ships in D4, not D1. |
| Bundle headroom | session-state | 609.6 / 750 KiB = ~140 KiB headroom (ample; new code is small + crypto is built-in + tests don't ship). |

---

## 1. OBJECTIVE
Advance the backlog in roadmap order while the owner has not yet playtested — choosing only **non-gated, can't-regress-live** work. Complete the Tier-1 "make the geometry matter" arc by giving the **two combos the user named BY NAME** (Dot→Square, Line→Circle) their real mechanical behaviors (every promoted magic combo will then DO something), then start the next non-gated big item (Tier-3 host-migration) with its dormant, fully-tested foundation.

## 2. SCOPE (3 priorities, independent, one commit + CHECK each)

**P1 — ANCHOR anti-drift (Dot→Square).** New `src/state/anchorStabilize.ts`: `applyAnchorStabilize(world)` — once/physics-tick (host-only, in stepPhysics), collect the dedupe SET of prim ids that are an endpoint of a live, un-fouled Anchor bond; damp each such prim's drift velocity by `ANCHOR_DRIFT_DAMP` (move `prevPos` a fraction toward `pos`). Anchored structures resist being shoved (potato/creature/enemy disruption). New constant `ANCHOR_DRIFT_DAMP` (start 0.4, playtest dial). New `isAnchorCombo` helper (table-coupled). Wire in `physicsLoop.ts` next to `applyVortexPull`. Tests: `anchorStabilize.test.ts`.

**P2 — SPINDLE swirl (Line→Circle) — REDESIGNED per Council (see §6).** New `src/state/spindle.ts`: `applySpindlePull(world, attractedId)` — a 90°-rotated Vortex that imparts a **tangential** impulse to nearby FREE sparks, but **bounded by a tangential-SPEED cap** (NOT a constant impulse): only push a spark whose current tangential-speed component is below `SPINDLE_MAX_TANGENTIAL_SPEED`, clamping so the result never exceeds the cap → provably non-accumulating (no escape velocity). Same anchor-collection + bond-id sort + proximity ramp + skip fouled/carried/dragged as Vortex. New constants `SPINDLE_PULL_RADIUS`, `SPINDLE_PULL_ACCEL`, `SPINDLE_MAX_TANGENTIAL_SPEED`, `SPINDLE_PULL_MIN_DIST` (all playtest dials; speed kept LOW + smooth for readability). New `isSpindleCombo` helper. Tests: `spindle.test.ts` incl. an explicit **bounded-speed / no-escape-velocity** assertion.

**P3 — HOST-MIGRATION D1 (identity plumbing, FEATURE-FLAGGED OFF, no protocol bump).** Per design §9 D1:
- `clientIdentity.ts` (or extend hostIdentity): generate a client's ephemeral ECDSA P-256 identity at boot (reuse `generateHostIdentity` machinery; expose pubkey SPKI b64).
- `successionWarrant.ts`: PURE `buildWarrantPayload(roomCode, epoch, orderedSeats)` (domain `'SPARK-SUCCESSION-WARRANT-v1'`, length-prefixed, injective — mirrors `buildAttestPayload`) + `signWarrant` (host) + `verifyWarrant` (survivor; chains to the original host key the room code commits to).
- HELLO carries the joiner pubkey as an **additive-optional** field (no D1 consumer requires it; absence = legacy peer, no warrant participation).
- Full unit tests; **no MIGRATION_CLAIM / detection / takeover** (those are D2–D4). Nothing is wired into a live decision path → cannot affect a running match.

**OUT OF SCOPE (explicitly):** G1b MOTION (Council-deferred twice; needs an owner-blessed mechanical verb — rule #4) and G2 family traits (needs §6 lock-amendment + owner flavor pick). Surfaced to the owner as the two remaining Tier-1 design decisions — NOT force-built.

## 3. APPROACH / DESIGN NOTES
- All three reuse PROVEN machinery (Vortex template ×2; hostIdentity crypto ×1) → low novel surface.
- P1/P2 are pure host-only fns of synced state → no wire/protocol/scoring change, `PROTOCOL_VERSION` held 14, replay determinism preserved by construction (verified via `save.replay.test.ts`).
- P3 additive-optional + dormant → no protocol bump in D1, no live-path change.
- Order P1→P2→P3 puts the highest-mission Tier-1 work first (fail-safe: if budget hits ORANGE, Tier-1 is already shipped; D1 carries forward).

## 4. RISKS & MITIGATIONS
- **P1 dead/stuck structures (over-damp):** dial `ANCHOR_DRIFT_DAMP` modest (0.4 = keep 60% of drift); a partial damp, not a lock; tunable. Behavior test asserts an anchored structure under an impulse displaces LESS than an un-anchored one (not zero).
- **P1/P2 replay break:** copy Vortex's sort-by-bond-id verbatim; P1 damp is a per-prim idempotent op (order-irrelevant — stronger than Vortex). `save.replay.test.ts` is the gate.
- **P2 escape velocity (Grok REJECT):** killed by the tangential-SPEED cap (bounded by construction). Unit test proves a spark spun for N ticks never exceeds the cap.
- **P3 stale-peer break:** HELLO pubkey purely additive; no consumer requires it in D1; test the absence path. Warrant encoding reuses the injective domain-separated pattern; WebCrypto ECDSA = raw P-1363 sigs (non-malleable, not DER).
- **Bundle:** ~140 KiB headroom; verify `npm run build` under 750.

## 5. TESTING / VERIFICATION (per priority, before each commit)
tsc 0 · full vitest green · `save.replay.test.ts` byte-identity (P1/P2) · new behavior tests (anchor displacement-reduction; spindle bounded-speed) · D1 warrant build/sign/verify + HELLO-absence + tamper-reject tests · `npm run build` under cap · in-browser runtime verify via the preview `__SPARK__` + `app.ticker.update` drive (S113/S114 pattern) for P1/P2 · RALPH:PATROL each priority. **Deploy MANUAL `npm run deploy`** at batch close (Actions dead — account billing lock).

## 6. DELIBERATION — Battle Ledger (2-way) + PRIME-AUDIT delta

**GROK-ANALYST verdict: REJECT-AND-SPLIT.** Findings + Supervisor synthesis:

| # | Grok finding | Supervisor (Opus) ruling | Action |
|---|---|---|---|
| G1 | P1: pre-solver damping fights the constraint solver (stuck/oscillate); damp *after* solver | **OVERRULE w/ evidence** — Vortex applies its impulse BEFORE the substep loop ("verletStepAll then carries+damps"); damping *post*-solver would also damp the constraint's own corrective velocity = MORE dead. Keep Vortex's slot; document why. | ADOPT-WITH-FIX (keep pre-substep) |
| G2 | P1: JS Set iteration non-deterministic → replay break on multi-anchor prims | **PARTIAL-ADOPT** — the damp is a per-prim op depending only on that prim's own pos/prevPos (no cross-prim float sum), so iteration order is result-irrelevant. Still: collect to a Set (dedupe) + document the independence; gate on save.replay. | ADOPT (document + test) |
| G3 | **P2: unbounded angular momentum → escape velocity; jitter at 10Hz** | **ADOPT (kill-shot valid)** — REDESIGN: bound the tangential SPEED (cap the result, not the impulse) → non-accumulating by construction; keep speed LOW+smooth for readability (playtest dial); snapshot-buffer smooths the client mirror. | REDESIGN P2 (overrule the REJECT → ADOPT-WITH-FIX) |
| G4 | P3: HELLO pubkey not additive unless legacy path coded+tested | **ADOPT** — purely additive; no D1 consumer requires it; test absence. | ADOPT-WITH-FIX |
| G5 | P3: warrant malleable (DER vs compact) unless canonicalized | **ADOPT (already satisfied)** — reuse `buildAttestPayload`'s injective length-prefixed domain-separated encoding; WebCrypto ECDSA emits raw (non-DER) sigs. | ADOPT (reuse verbatim) |
| G6 | Bundle tight | **OVERRULE** — 609.6/750 = ~140 KiB headroom is ample; crypto built-in; tests unbundled. Still verify empirically. | Verify only |
| G7 | Split the batch (shallow crypto review / untested swirl) | **OVERRULE the split, ADOPT the spirit** — the 3 priorities are independent (P1/P2: state+physics+combos; P3: net) with per-priority commit+CHECK+tests (equivalent review depth to separate PDRs). Fail-safe ordering. User explicitly requested a full batch + pre-approved autonomous run. | Keep batch; sequential independent gates |

**PRIME-AUDIT (adversarial self-audit):** (a) Rubber-stamp check — P2's REJECT was NOT rubber-stamped; it surfaced a real flaw and the redesign (speed-cap) directly nullifies its rationale, materially better than R1. (b) Runtime-verifiability — P1/P2 get a "boot-then-smoke" in-browser drive (not static parse), proven by the S113/S114 `app.ticker.update` pattern; D1 crypto gets sign→verify→tamper-reject round-trip tests (real WebCrypto, not mock). (c) Consensus-masking — N/A (2-way; Gemini down, logged). (d) Edge cases retained: P1 fouled/deleted-prim skip; P2 carried/dragged/min-dist skip; D1 malformed-input fail-closed (mirrors `verifyHostAttest`). (e) Mtime — N/A (no leak/regression claim). (f) §6/lock — no combo-table or win-score change ⇒ `constants.lock.test.ts` untouched.

## 7. ROLLBACK
Each priority = one revertible commit; P1/P2 are render/sim-only (revert = behavior gone, no migration); P3 is dormant+additive (revert = helpers gone, no peer breakage). No protocol bump anywhere in this batch.

## 8. COMPLETION (per priority): commit+push → session-state (completed + check_completed + check_method + checkpoint_commit + tokens) → `[ZERO]` line → reflexion entry → next. Deploy MANUAL at close; `/handoff`.
