# PDR — S118: Tier-B strategic batch (B1 host-mig D2 → B3 symbiotic combo → F1b/F2 perf → deploy)

> STATUS: COMPLETED (S118 — all 4 priorities shipped + deployed 2026-07-06)

**Date:** 2026-07-05 · **Tier:** Full (batch aggregate >30K) · **Session:** S118
**Council:** B1 carries S116 3-WAY (Battle Ledger below); NEW-surface focused 3-WAY this session (B3 design + batch sequencing + F1b method)
**Status:** AWAITING USER APPROVAL (owner delegated order + design: *"run top recommended priority batch in order… you should decide in the best interests of this project and vision."*)

═══════════════════════════════════════════════════════════
   PRODUCTION DESIGN REPORT — S118: Tier-B batch
═══════════════════════════════════════════════════════════

## OBJECTIVE
Execute the S116-audit Tier-B fork as one ordered, checkpoint-gated batch that moves SPARK toward
its North Star — a **playable** (reliability) and **deep** (core-mechanic) geometric-builder duel:
1. **B1** — Host-migration D2 (reliability: host death no longer silently ends the match).
2. **B3** — One symbiotic-chaining combo (core depth: build *topology* becomes tactical).
3. **F1b + F2** — Close the deferred half of the audit's F1 perf finding.
4. **Deploy** — Ship B1+B3+F1b/F2 (+ the un-deployed S117 build) live in one meaningful deploy.

**B2 (worker-sim) is DEFERRED to its own session** — see SEQUENCING RATIONALE.

## SCOPE (4 priorities, ordered, checkpoint after each)

### P1 — B1 Host-migration D2  (Tier: Standard; carries the S116 3-way deliberation)
Execute the parked, fully-deliberated PDR `.claude/plans/2026-07-04_PDR_S116_HostMig_D2.md` **verbatim**.
A.0 re-verified @ `bfcadda`: D1 dormant primitives present (`successionWarrant.ts`, HELLO `clientPubkeyB64?`,
`hostIdentity.ts`), `succession.ts` absent, **no `epoch` in protocol.ts**, PROTOCOL_VERSION 14 — the PDR's
CURRENT-STATE block still holds; S117 did not touch `src/net/`. Instrument-only (console forensics, zero
takeover, zero UI). 8 changes / 8 files + `src/net/succession.ts` (new) + ~35 tests. All fields additive-
optional → PROTOCOL_VERSION stays 14. Full detail + Battle Ledger + PRIME-AUDIT: the parked PDR.

### P2 — B3 "Keystone Anchor" symbiotic combo  (Tier: Micro; replay-safe by construction)
**Design (owner-delegated, my pick — Council-checked below):** an **Anchor** bond confers its territorial
rigidity to **magic bonds directly bonded to its endpoint primitives** (sharing the Dot or Square prim).
"Branch your magic structures off an Anchor and they resist enemy engulf-sag too" → **build order / topology
becomes tactical**, the exact North Star ("connecting shape A to shape B IS the game").
- **Mechanism:** extend the proven `applyAnchorStabilize` pattern (anchorStabilize.ts). After the anchor's
  own floor pass, for each un-fouled Anchor bond, scan its two endpoint prims' `.bonds`; any *magic*
  neighbor bond (both endpoints un-fouled) gets its `stiffnessMultiplier` floored to a new
  `KEYSTONE_STIFFNESS_FLOOR` (≤ ANCHOR floor; dial TBD, start = ANCHOR_STIFFNESS_FLOOR).
- **Replay-safe BY CONSTRUCTION:** operates only on ephemeral per-tick `stiffnessMultiplier` (save.ts skips
  it — §10.2-exempt, territory.ts:9-14); per-bond idempotent `max()` → bond-iteration-order-irrelevant (no
  cross-bond float accumulation); host-only (inside stepPhysics). **Zero wire/save bytes; PROTOCOL_VERSION
  held 14; save.replay byte-identical by construction.**
- **New file** `src/state/keystoneAnchor.ts` + `keystoneAnchor.test.ts`; wire into stepPhysics AFTER
  `applyAnchorStabilize`, BEFORE the substep solveBonds loop; new constant; combos.ts unchanged (reuses
  `isAnchorCombo` + `lookupCombo().isMagical`).
- **NOT changing:** combo table (36), scoring/income (rigidity, not income — keeps it off the byte-identity-
  sensitive scoring path), PROTOCOL_VERSION, save format, any UI (behavior surfaces in contested territory).

### P3 — F1b territory global-labeling + F2 placement-radius reuse  (Tier: Standard; carries F1 audit deliberation)
- **F1b:** `computePlayerComplexity` (territory.ts:55) calls `componentOf` per-component (territory.ts:86),
  and `componentOf` (structure.ts:21) rebuilds a from-scratch BFS every call — O(P·prims·BFS)/tick on the
  host. Fix: **one per-tick global component-label pass** (single BFS/union-find over `world.primitives`
  via bond adjacency; Sym-D guarantees single-color components) → per-player (primCount, bondCount,
  componentCount) reused by `computeTerritorialInfluence` + `computeTerritorialRadius`. Final expression
  kept **VERBATIM** (`primCount + 0.5·bondCount + 0.1·componentCount`).
- **F2:** `computeTerritorialRadius` recomputed per-enemy (territory.ts:149) + per-player (188) → reuse the
  P3 per-tick complexity/radius cache.
- **Partition-equivalence GATE (the subtle half):** a dedicated `territory.differential.test.ts` (P1-harness
  pattern — N random worlds, bit-exact via `Object.is`/`.toBe()` on per-player complexity, radius, AND the
  full post-`computeTerritorialInfluence` bond `stiffnessMultiplier` map) + all 24 save.replay tests. Ship
  only if bit-exact.

### P4 — Deploy
`npm run deploy` (local build → gh-pages; Actions dead per billing lock) **only after** P1–P3 gates green.
Now player-facing (B1 reliability forensics + B3 depth), so the deploy is meaningful. Post-deploy: verify
`spark-online.space` serves the new bundle hash + 0 console errors.

## SEQUENCING RATIONALE (the owner-delegated call)
- **B1 first:** highest-confidence value (fixes a hard reliability failure — host death currently ends the
  match), and its PDR is already 3-way-deliberated + A.0-re-verified → lowest activation energy, ship-ready.
- **B3 second:** cheapest, self-contained, replay-safe-by-construction proof of the core-depth vision.
- **F1b/F2 third:** audit-deliberated perf cleanup; the P1 differential harness de-risks the partition half.
- **Deploy last:** one meaningful deploy carrying everything (incl. the un-deployed S117 build).
- **B2 (worker-sim) DEFERRED — considered and rejected for THIS batch.** Grok argued B2-before-B1 (worker
  eases migration + F1b). Counter: B1's PDR was deliberated in the *current* (non-worker) architecture and
  is ready NOW; re-sequencing behind a large, undeliberated, higher-risk worker migration would delay the
  reliability fix and force a re-deliberation. B2 deserves a dedicated session; it wraps the sim cleanly
  afterward. **This is the deliberate best-interest trade: ship the ready reliability fix now.**

## DELIBERATION (Full-tier; carried + focused-new)
- **B1:** carries the S116 3-WAY Battle Ledger (W1 PoP fix, W2 warrant@Begin 1-1 split → Supervisor IN with
  ordering-by-construction, W3 epoch overrule with envelope/save code evidence, W4/W5 four Gemini fixes) +
  its PRIME-AUDIT delta. No new decisions — executed verbatim.
- **NEW-surface focused 3-WAY (this session):** (Q1) B1-first vs B2-first sequencing; (Q2) B3 design pick
  (Keystone-rigidity vs income-symbiosis vs other); (Q3) F1b partition-equivalence method/risk. Battle
  Ledger + PRIME-AUDIT appended before execution.

## TESTING PLAN
Per priority: tsc 0 · full vitest (1782 baseline + B1 ~35 + B3 + F1b differential) · save.replay byte-
identical · bundle < 750 KiB charter · PROTOCOL_VERSION held 14 · RALPH:PATROL. Checkpoint commit + session-
state (check_completed/check_method/checkpoint_commit) after EACH priority. Deploy smoke after P4.

## TOOL TRIAGE
Visual output? P4 only (post-deploy browser smoke). Research/external? Council MCP (Grok+Gemini) for the
focused new-surface pass. Artifact delivery? No — code+tests in-repo; deploy to gh-pages.

## RISK / STOP DISCIPLINE
Context GREEN (8.6% @ start). Checkpoint after each priority; if context hits **YELLOW (500K)** or B1 proves
gnarlier than its deliberated PDR, **finish + deploy the completed priorities and handoff the rest** — no
half-done networking left dangling. B2, F9, F10, gated Tier-1 remain logged carry-forward.

## ESTIMATED TOKENS: ~55K (B1 ~25K + B3 ~8K + F1b/F2 ~12K + deploy/verify ~10K) | MODEL: Opus 4.8 (owner override active)

## BATTLE LEDGER (focused new-surface 3-WAY, S118)
- **Q1 sequencing:** Grok ADOPT · Gemini ADOPT-WITH-FIX → **ADOPTED.** Instrument-only B1-D2 commits no
  architecture a worker-sim invalidates. Gemini FIX folded: doc-only forward comment in succession.ts
  sketching the future worker postMessage seam (Worker→Main health-ping / Main→Worker successor-calc). No
  scope change to B1.
- **Q2 B3 Keystone:** Grok ADOPT-WITH-FIX (sort prim IDs) · Gemini ADOPT → **ADOPTED.** PRIME-AUDIT REFUTES
  Grok's fix — constant-floor idempotent max() is provably iteration-order-invariant (matches the
  anchorStabilize.ts PRIME-AUDIT precedent); kept constant-floor + documented invariant, differential/
  save.replay proves it. Gemini's "low perceptual salience" logged: keep Keystone (lowest risk, replay-safe
  by construction), owner off-ramp to income-symbiosis offered; VFX telegraph + income-symbiosis = carry-fwd.
- **Q3 F1b gate:** Grok REJECT · Gemini REJECT → **GATE STRENGTHENED (convergent).** (a) differential MUST
  assert the canonical (min-ID-root) primitive→component partition is bit-exact, not just complexity/count;
  (b) audit ALL componentOf callers for component-ID-identity dependence BEFORE F1b — if any depends on
  labeling, preserve it or that path stays on the old call. PRIME-AUDIT: Grok's "root selection changes
  componentCount" REFUTED (count is relabeling-invariant → value byte-identical by construction); the
  stronger gate + caller-audit adopted as defensive rigor per Gemini's downstream-ID-key concern. Ship F1b
  only if bit-exact on value AND canonical partition; else preserve labeling or defer (still ship B1+B3+deploy).

## PRIME-AUDIT DELTA (S118)
- Grok Q2 "sort prim IDs" — REFUTED against the mechanic (constant-floor idempotent max = order-invariant).
- Grok Q3 "root selection → different componentCount" — REFUTED (componentCount is a topological invariant
  under relabeling). Strengthened gate adopted anyway (defensive; Gemini's ID-key concern is the live one).
- Runtime-verifiability: B1 warrant/starvation crosses real WebRTC only in e2e (parked PDR logged the
  headless-throttle downgrade); B3/F1b are pure host-sim (unit-provable); deploy gets a real-browser smoke.
- CARRY-FORWARD (logged, not dropped): B2 worker-sim; B3 VFX telegraph + income-symbiosis (2nd combo);
  F9 INTENT rate-limit; F10 Pixi-leak heap probe; gated Tier-1 (G1b MOTION, G2 family traits).

═══════════════════════════════════════════════════════════
   GATE: Deliberated. Owner pre-authorized "run the batch." Executing.
═══════════════════════════════════════════════════════════
