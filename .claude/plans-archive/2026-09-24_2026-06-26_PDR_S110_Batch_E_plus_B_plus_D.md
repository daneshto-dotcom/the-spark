# PDR — S110 Batch (E + B + D) · Owner playtest round 2
Status: DRAFT — awaiting Council + owner `go` | Tier: **Full** (highest in batch) | PROTOCOL_VERSION: **12 → 13** (P4 only)
Source: owner message S110 (live playtest of S109 Batch A). One batch PDR, 5 priorities, executed in order P1→P5.

> Owner verbatim asks (6): (1) ~2× victory points (750-ish → 1500) because slow structures can't finish before WIN;
> (2) Helga still attacks too far — do her walk + "true melee" attack (it's "ridiculous"); (3) Helga art + Voltkin art;
> (4) primitives "truly random, same speed but random shapes"; (5) codex (G+C) must keep the player avatar ("cruiser")
> visible — it disappears behind the popup mid-screen; (6) run BOTH Batch D and Batch B. Owner declined the clarifying
> question cards twice → proceeding on the stated defaults below; easy to redirect at the go-gate.

---

## P1 — Victory points 786 → 1500  (Micro · low risk · no wire bump)

**OBJECTIVE** Double-ish the match length so slow/complex structures can actually be finished before WIN.

**SCOPE** `src/constants.ts` only (+ test expectations if any assert the literals).
- `PHASE_1_WIN_SCORE` 786 → **1500** (constants.ts:304).
- `SCORE_TIER_STEP` 262 → **500** (constants.ts:391) — keeps the LOCKED exact-thirds invariant (1500 = 3×500; tier pulses at 500/1000, WIN at 1500, still 2 pulses before WIN).
- Auto-scaling (no edit): `HUNTER_TRIGGER_SCORE = floor(WIN × HUNTER_TRIGGER_FRACTION)` → floor(1500×0.75)=1125; `LEADER_DECAY_THRESHOLD = FRACTION × WIN` recomputes. Confirmed both are derived, not literal.

**TESTING** `scoring.test.ts` uses `PHASE_1_WIN_SCORE`/`SCORE_TIER_STEP` symbolically → stays green by construction; run full vitest to confirm no test hardcodes 786/262. Add/confirm an invariant `PHASE_1_WIN_SCORE === 3 * SCORE_TIER_STEP`.

**WIRE/DETERMINISM** None. Both peers compile the same constant; score is host-authoritative + synced. No PROTOCOL bump (constants are not wire format; e2e `__TEST_WIN_SCORE__` seam intact).

**ROLLBACK** Revert the two constants.

---

## P2 — Uniform spark speed (Micro · low risk · no wire bump)

**OBJECTIVE** Owner: "same speed but random shapes." STATE-DISCOVERY found shapes are ALREADY uniform-random (`rngPick`, spawner.ts:333) and ALREADY reseeded per-match with a fresh `Math.random()` base seed (main.ts:364-366) — so "truly random" is already satisfied. The remaining variance the owner sees is SPEED (random 5–20). Fix = make initial speed constant.

**SCOPE** `src/constants.ts`: `SPARK_INITIAL_VELOCITY_MIN` and `_MAX` (308-309) both → **12** (midpoint of today's 5–20; keeps overall pace). Shape selection untouched (already random). `rngRange(min,max)` with min==max returns the constant deterministically.

**TESTING** vitest spawner/replay suite green (determinism unaffected — same RNG draws, narrower range). Manual: all fresh sparks drift at one speed; shapes still vary.

**WIRE/DETERMINISM** None. Host-only spawner; client mirrors via snapshot.

**ROLLBACK** Restore 5 / 20.

**OQ (defaulted):** speed value 12 — flag for owner playtest (raise/lower on feel).

---

## P3 — Codex keeps the player avatar ("cruiser") visible (Micro · render-only · no wire bump)

**OBJECTIVE** Owner: when G+C opens the codex, "the cruiser" (player avatar) disappears behind the popup mid-screen; he should stay visible always.

**SCOPE (to finalize in DO)** `src/render/codexOverlay.ts` (+ possibly `main.ts` avatar layer). The codex container re-parents topmost (codexOverlay.ts:165) and its full-screen backdrop occludes the avatar that renders in the game scene below. Fix options to pick in DO after tracing the avatar render layer: (a) re-parent / draw the player avatar sprite ABOVE the codex backdrop while the codex is visible; (b) leave a transparent "window" in the backdrop; (c) mirror the avatar into the codex container. Lowest-risk = (a)/(c): composite the avatar on top so it's always visible. Render-only; touches NO sim state.

**TESTING** No new sim test (render-layer). Manual/preview: open codex in a live solo match, confirm avatar visible mid-screen and tracks. tsc 0, vitest unchanged-green.

**WIRE/DETERMINISM** None — pure render/compositing.

**ROLLBACK** Revert the overlay z-order change.

---

## P4 — Batch B: Helga full walk-to-target + melee (Full · HIGH risk · **PROTOCOL_VERSION 12 → 13**)

**OBJECTIVE** Convert Helga from a stationary whole-screen instant-hitter into a melee chaser: acquire nearest enemy → WALK (deterministic Verlet arrive) → slap ONCE on arrival → chase if it flees → return home when none remain. Kills the "ridiculous" cross-map slap.

**SCOPE / APPROACH** Per the detailed design in `.claude/plans/2026-06-26_PLAN_S108_Batch_B_Helga_Walk.md` (already Council-scoped at S108). Summary:
1. `defender.ts`: add `prevPos: Vec2` + `walkTargetPos: Vec2|null`; new `DefenderState 'WALK'`; `DefenderConfig.moveSpeed`/`maxAccel` (princess only; turret moveSpeed=0 → shared substrate byte-identical).
2. `defenderLifecycle.ts`: anchor-pin ONLY when IDLE/home; FSM IDLE→(acquire)→WALK→(dist ≤ `PRINCESS_MELEE_RANGE`²)→WINDUP→FIRE (single hit, as today)→RECOVER→WALK(chase) or IDLE+walk-home.
3. New `stepDefenderWalk(d,target,maxAccel)` mirroring `stepCreatureVerlet` integration (same dtSub, maxAccel clamp, Math ordering → replay byte-equivalent). Reuse `findNearestEnemyCreatureFrom` (creatureAI.ts:303) unchanged.
4. `PRINCESS_SLAP_RANGE` becomes ACQUISITION radius (she sees far); new small `PRINCESS_MELEE_RANGE` (~36px) is the strike range. Reconcile with the S109 interim 380.
5. Render: `princessRenderer.ts` gate/remove `drawSlapReach` (always-adjacent now); add WALK leg-cycle to `helgaPose.ts`. Sync new fields over the additive defenders[] snapshot.

**OWNER OQs (defaulted, redirectable):** (1) wide ACQUISITION + small STRIKE = **yes**; (2) after kill = **walk back to hub anchor**; (3) walk speed = **undercut chewer (catchable)**; (4) motion = **author in code** (helgaPose WALK leg-cycle) for this pass — richer art handled by P5.

**TESTING** `princessHelga.test.ts` (WALK before FIRE; FIRE once per arrival; replay determinism) + defenderLifecycle FSM tests + helgaPose WALK pose + save.replay byte-equivalence (turret unchanged) + the PROTOCOL_VERSION 13 wire round-trip. Est ~200–320 LOC.

**WIRE/DETERMINISM (CRITICAL)** PROTOCOL_VERSION **12 → 13**: a new SERIALIZED `'WALK'` literal + `walkTargetPos` ride defenders[]; a stale v12 peer would mis-render. New integrated pos/prevPos MUST advance with the SAME dtSub/maxAccel/Math ordering as `stepCreatureVerlet` (IEEE-754 ordering = replay byte-equivalence). No wall-clock, no RNG. Bot/human symmetry via shared DefenderConfig + host FSM. Balance: she now has travel time + is out-runnable — a REAL gameplay change → owner playtest flag.

**ROLLBACK** Revert defender substrate + version to 12 (turret path is byte-identical, so revert is clean).

---

## P5 — Batch D: wire Voltkin + Helga art (Full · Medium risk · no wire bump)

**OBJECTIVE** Replace the procedural cyan-spindle Voltkin + the placeholder Helga sprite with the 3 owner-confirmed ORIGINAL keepers (verified on-model + non-franchise: `voltkin_idle_A`, `voltkin_zap_A`, `helga_B`), cleanly matted (no square box), via the existing OFFLINE asset pipeline. Game stays 2D; NO new runtime dependency.

**SCOPE / APPROACH** Per `.claude/plans/2026-06-26_PLAN_S108_Batch_D_Voltkin_Helga_Art.md`. Defaulted OQ answers:
1. Render target = sprite **ATLAS** (the tested `voltkinFrames.currentAnimCell` path; crisper/smaller).
2. Design = LOCKED yellow "Static Gremlin" (the keepers).
3. Generator = imagen-ultra stills (the keepers); veo motion deferred.
4. Swap scope = **in-world creature only** (intro cinematic untouched this pass).
5. Bundle = **lazy-load outside the main bundle** (never bundle the art; avoids the check-bundle-size cap entirely).
- First pass = matte the 3 keeper stills → minimal atlas (Voltkin idle + zap; Helga single pose) → revive the 2D playback path (swap `drawVoltkin` Graphics → atlas-cell `Sprite`; keep the lightning-cloud death FX). Re-skin Helga's `characterSprite` (princessHelga.ts:107) → matted helga_B. Richer per-pose animation = a later pass.
- Pipeline reuses `scripts/matte-voltkin-intro.py` precedent + the recoverable `scripts/build-voltkin-atlas.py` (git `30d04e8^`). OFFLINE build step only — imagen/matte NEVER a runtime call.

**TESTING** `voltkinFrames`/`currentAnimCell` tests stay green (pure synced-state fn). Atlas manifest load test. tsc 0. `npm run build` — confirm the lazy-loaded atlas does NOT enter the entry chunk (entry stays < cap). Preview: Voltkin + Helga render as the new art, no box, determinism unchanged.

**WIRE/DETERMINISM** NONE — visual asset swap; `currentAnimCell` keys on the SAME synced fields (state, ticksInState, killCount, worldTick, isMoving). No PROTOCOL bump.

**ROLLBACK** Restore `drawVoltkin` Graphics path + placeholder Helga sprite; remove the atlas asset.

---

## BATCH-LEVEL RISKS & SEQUENCING
- **Token budget honesty:** P4 (≈300 LOC + v12→13) and P5 (art pipeline) are each substantial — originally separate sessions. Execute pain-first P1→P5; if budget hits ORANGE (750K) I finish the in-flight priority cleanly and `/handoff` the remainder. P1–P4 (the 3 fixes + the "ridiculous" Helga fix) are the guaranteed-land set.
- **P4 determinism** is the load-bearing risk — the Verlet integrator must be byte-identical to `stepCreatureVerlet`; covered by save.replay byte-equivalence tests before commit.
- **P5 bundle** — lazy-load keeps it off the entry chunk; if it still trips the cap, raise the charter (do not get stuck debugging — memory `bundle-cap-raise-dont-debug`).
- **A.0 STATE-DISCOVERY done:** win-score coupling (exact-thirds), spawner already-random + reseed-wired, codex z-order, defender substrate, art keepers all empirically verified above this draft (not assumed).

## CHECK (per priority)
RALPH:PATROL each diff + GROK-ANALYST on raw diffs (Full tier → Triumvirate incl. GEMINI-AUDITOR for P4/P5). tsc 0 + full vitest green + build-size check + (P4) PROTOCOL_VERSION 13 round-trip + save.replay byte-equivalence before each commit. Each priority = its own revertible commit + deploy verify.

---

## COUNCIL R1 — BATTLE LEDGER + PRIME-AUDIT DELTA (S110)
Grok-4.20-reasoning (Disruptor) + Gemini-2.5-pro (Auditor), 1 round + Opus PRIME-AUDIT. Quality-gate PASS (Grok 5 challenges + tool challenge; Gemini quality scorecard + creative advocacy).

| # | Finding (source) | PRIME-AUDIT verdict vs code | Resolution |
|---|------------------|------------------------------|------------|
| 1 | **P2 "RNG mutation breaks every replay" (Grok, Crit-9)** | **REFUTED.** `rngRange=min+(max-min)*rng()` (rng.ts:35) still draws once when min==max; shape is drawn FIRST (spawner.ts:333). Equalizing constants ≠ deleting the call. | ADOPT discipline: set both constants =12, **KEEP the rngRange call** so the draw count is unchanged. Determinism-safe. |
| 2 | **P4 "integrator-mirror is fragile FP; use fixed-point / client-extrapolation" (Grok, High-8)** | **REJECTED.** The whole sim already relies on float Verlet (stepCreatureVerlet) + IEEE-754 determinism; client runs NO authoritative physics (S108 PRIME-AUDIT, main.ts:1055). Fixed-point / client-extrapolation = a NOVEL untested netcode model inconsistent with the codebase — the actually-risky path. | Mirror stepCreatureVerlet EXACTLY (same dtSub/clamp/Math order). Reject the rewrite. |
| 3 | **P4 walk speed: "must catch its target, not undercut" (Grok, High-8 kiting)** | **VALID.** A melee unit slower than its prey is pointless; the "too-strong" nerf must come from RANGE + travel time, not from being slow. | **REVISE OQ default:** walk maxAccel ≈ chewer's (~120) so she catches ground attackers (loses to faster Voltkin). Bound the ACQUISITION radius (not whole-screen) to limit kiting. Playtest knob. |
| 4 | **P4 v12→13 bump genuinely required? (Grok)** | **CONFIRMED required** — new serialized 'WALK' literal + walkTargetPos ride defenders[]; a stale v12 peer mis-parses. (uint8-instead-of-string dodge REJECTED — adding any new serialized value needs a bump regardless.) | Bump to 13. Keep string literal (consistent w/ existing defender serialization). |
| 5 | **P5 "lazy-load → non-deterministic fetch + offline breakage" (Grok, Med-6)** | **Determinism concern REFUTED** (atlas is a RENDER asset, decoupled from sim; load timing can't desync). Offline-robustness concern PARTIAL-VALID. | KEEP lazy-load (render-decoupled; the existing codex/cutscene pattern, same-origin). ADD graceful fallback: render the current procedural rig until the atlas loads (never invisible). |
| 6 | **P5 "offline imagen must be seed-pinned or art varies in replays" (Grok)** | **REJECTED** — based on a misread; art is generated OFFLINE ONCE into a committed static atlas; zero runtime generation. | No action. |
| 7 | **P5/P4 quality disconnect: static Helga sprite "slides" while her new WALK brain runs — use Veo walk-cycle (Gemini, quality 3/5)** | **VALID + aligns with owner pref** ([[feedback-real-video-over-procedural-animation]] — owner rejected procedural "PowerPoint spin"). BUT recorded risk: veo/imagen reference-conditioning non-functional in this auth (Batch D plan). | First pass = static high-art sprites (big upgrade over cyan spindle, low risk). **SURFACE the slide to owner**; log a **carry-forward**: proper Helga walk-cycle (Veo loop / multi-pose) once conditioning is sorted. Do NOT silently ship the disconnect. |
| 8 | **P4 too big for one priority — split (Gemini, efficiency 3/5)** | VALID de-risk. | ADOPT spirit: execute P4 in TWO verifiable commits — (4a) substrate + WALK + bump; (4b) chase/return AI. |

**Out-of-scope (logged, not adopted this batch):** uint8 FSM / dirty-defender snapshot / unify stepEntity (all touch tested wire/format paths — scope discipline); replay-checksum on score+defender-histogram (nice determinism guard, future hardening).

**CONFIDENCE: HIGH.** No SPLIT items. Net change from draft: P2 keep-the-draw discipline; P4 walk-speed up + bounded acquisition; P5 graceful fallback + Helga-slide flagged as carry-forward; P4 two-commit split.

## CARRY-FORWARD (logged — not silently dropped)
- **Helga walk-cycle animation** (Veo image-to-video loop or multi-pose imagen on helga_B) once veo/imagen reference-conditioning is functional in this auth — first-pass P5 ships a static sprite that slides while walking (Gemini quality flag #7).
