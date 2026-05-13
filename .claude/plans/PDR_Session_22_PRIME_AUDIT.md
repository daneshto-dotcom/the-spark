# PRIME-AUDIT — S22 PDR Batch (post-R2)

**Date:** 2026-05-13 | **Auditor:** Claude (adversarial self-review) | **Cost:** ~2K tokens
**Sources:** PDR `.claude/plans/PDR_Session_22.md` + Battle Ledger `.claude/plans/PDR_Session_22_Council_BattleLedger.md`
**Rule:** CLAUDE.md §PRIME-AUDIT — ask what was rubber-stamped, what was claim-addressed-not-actually-fixed, where consensus masked independent disagreement, what edge cases remain undercaught, whether synthesis is materially better than R1 or just longer.

---

## §1 — Findings (5 deltas)

### Δ1 — Silhouette-pattern fix for R11 is UNVERIFIED at planning time
**Severity:** MEDIUM
**Source:** Battle Ledger row 6
**Claim audited:** "Use existing `src/render/effects/silhouettes/` infrastructure to register a TV_FRAME pattern; predicate matches by silhouette-component IDs."
**Audit finding:** I have NOT read `silhouettes/shared.ts` to confirm the API supports the recipe-matching use case. The existing silhouette infra was built for **bond-shape rendering** (S17 P3 Phase-2 Tier-1), not for **pattern detection against player structures**. There's a real chance the API is rendering-only and doesn't expose component-pattern queries.
**Fix:** Add a P3 pre-flight step: read `silhouettes/shared.ts` + any existing silhouette pattern files BEFORE writing `voltkin.ts`. If the infra does NOT expose a query API for "does this set of primitives match this silhouette pattern":
- **Plan A (preferred):** extend `silhouettes/shared.ts` with a `matchesSilhouette(primitiveIds, pattern) → boolean` pure helper.
- **Plan B (fallback):** revert to Grok's primitive-tag approach — add `Primitive.silhouetteRole?: 'TV_FRAME' | 'LIGHTNING_BOLT'` field that player assigns via UI (e.g. RMB-hold to tag). Discoverable via existing controls patterns.
- **Plan C (last resort):** v1 ships rect-bbox heuristic per original PDR; carry-forward to S23 polish pass.
**Disposition:** REQUIRE the read in P3 pre-flight, document the fallback branch in PDR §4.

### Δ2 — Cinematic serialization not specified for simultaneous triggers
**Severity:** MEDIUM
**Source:** PDR §4 P3 design
**Edge case audited:** Both players trigger their own godly within the same ~RTT window. Two GODLY_TRIGGER msgs arrive at host within ms. Both validate (each player has their own cooldown). Both attempt to play cinematic. `world.activeCinematicPlayerId` is a single slot — second one **silently overwrites the first** → first player's cinematic is interrupted mid-play on the renderer side.
**Fix:** Add a queue: `world.pendingCinematics: GodlyTriggerEvent[]`. Host processes one at a time, sets `activeCinematicPlayerId`, broadcasts. On `onComplete` (wall-clock cinematicMs + sustainedEffectMs elapsed), shift next queued event, broadcast next GODLY_TRIGGER. Net delay for second player: ~12s. Acceptable — feels like "your opponent's cinematic is still resolving."
**Disposition:** Document in PDR §4 + add 1 test (`world.test.ts` extension): two GODLY_TRIGGER actions in sequence → second queued, fires after first completes.

### Δ3 — Disconnect during cinematic — undefined behavior
**Severity:** LOW-MEDIUM
**Source:** PDR §5 risks (not enumerated)
**Edge case audited:** Peer drops during 4s cinematic. `connectionLostOverlay` fires per existing S15 P2 logic. But the cinematic continues playing under the overlay, audio still plays, eventually `onComplete` fires and runs SEVER_BOND on a structure in a connection-lost world. Visible: layered overlays + ghost audio.
**Fix:** When `connectionLostOverlay.setVisible(true)` is called, also call `cutsceneOverlay.abort()` which kills video element, stops audio, clears `activeCinematicPlayerId`, drops the pending queue (no more godlies in a dead session).
**Disposition:** Add R22 to PDR §5 + 1 test (`lobbyScreen.test.ts` extension or `cutsceneOverlay.test.ts`): connectionLostOverlay-shown → cutsceneOverlay aborts cleanly.

### Δ4 — Battle Ledger row 4 (cooldown) authority calculation needs correction
**Severity:** LOW (procedural)
**Source:** Battle Ledger row 4
**Claim audited:** I marked the cooldown decision as "Risk (Grok 1.75) → SYNTHESIS." But: tick-based authoritative state vs wall-clock is a determinism / save-replay concern, which falls under **Implementation feasibility (Claude 1.75 domain)**. The competing claims are: Grok's authoritative-state risk (1.75) vs Claude's deterministic-sim impl (1.75). Two 1.75-weighted opinions = Solomon split, not domain-override.
**Fix:** Re-record row 4 as "Solomon split — both 1.75 domains active. SYNTHESIS retained (tick auth + wall-clock display) — addresses both concerns." Procedural correction; outcome unchanged.
**Disposition:** Amend Battle Ledger §Resolution column for row 4.

### Δ5 — Vignette LOC budget likely under-estimated
**Severity:** LOW
**Source:** Battle Ledger row 11
**Claim audited:** "~30 LOC vignette" for an opponent-side 8s yellow tint.
**Audit finding:** A proper vignette = 4 edge gradient rects OR a single radial-gradient texture + alpha blending. Either approach with proper fade-in/fade-out lifecycle is realistically 40-60 LOC, not 30. Doesn't break §XV but worth correcting.
**Fix:** Re-budget `cinematicVignette.ts` at ≤60 LOC. Or simplify to a flat-color full-screen Container with alpha 0.15 (no gradient) — 15 LOC. Pick flat-color for v1 (cheaper, still legible signal).
**Disposition:** Amend PDR §2 Row 4 amendment — `cinematicVignette.ts` ≤60 LOC OR ≤20 LOC flat-color variant.

---

## §2 — Rubber-stamping check

| Row | Status | Evidence |
|---|---|---|
| 1 (P1 KEEP) | NOT rubber-stamp | §XV serves comprehension; transport.ts has 6 distinct concerns; Grok's YAGNI is general-policy-true but project-policy says extract. |
| 3 (folder KEEP) | NOT rubber-stamp | S21 D2 was user-VETO-locked; Grok's collapse-to-1-file would require re-deliberation of D2; partial concession (drop spatialHashMatcher) is real cost reduction. |
| 16 (Rive REJECT) | NOT rubber-stamp | Dependency_risk signal + side-session-already-shipped + Pixi-Rive plugin maturity unknown. Legitimate REJECT with audit trail. |
| 18 (WebWorker REJECT) | NOT rubber-stamp | Latency math: n<100, O(n²) ≤ 10K ops ≤ 0.5ms @ V8 hot. postMessage overhead = ~0.1ms × 2 = 0.2ms + serialization. Net loss. |
| 19 (purity REJECT) | NOT rubber-stamp | audioManager + effectsRenderer already drain effects = established CQS pattern. |

No rubber-stamping found.

---

## §3 — Consensus-masking-dissent check

Both Grok and Gemini independently flagged R11 (rect-bbox fragility). Different proposed fixes:
- Grok: explicit `GodlyTarget` primitive tag
- Gemini: Imagen silhouette mask

I synthesized to a THIRD path (silhouette-pattern). That's legitimate synthesis IF the third path actually works (see Δ1 verification requirement). If Δ1 verification fails, the fallback is Grok's primitive-tag (Plan B), preserving the consensus that R11 needs fixing.

No silent consensus masking. Both R1 inputs influenced the resolution.

---

## §4 — "Materially better than R1 or just longer" check

R2 net deltas vs R1:
| Change | Magnitude | Material? |
|---|---|---|
| Drop spatialHashMatcher.ts | −1 file, −120 LOC | YES |
| Silhouette-pattern R11 mitigation | −3 risk severity | YES |
| mp4 fallback hardening (playsinline + .catch + test) | +1 test, +15 LOC, −2 risk | YES |
| Vignette + Codex idle-2 reuse (Gemini) | +2 UX features, 0 cost | YES |
| Async cinematic test coverage | +2 tests | YES |
| Imagen sprite sheets DEFERRED | 0 cost, +1 backlog row | YES (preserves scope) |
| WaveNet retake DEFERRED | 0 cost, +1 backlog row | YES |
| Procedural row 4 authority correction | 0 cost | NO (procedural) |

**Verdict:** R2 is materially better. 4 of 8 deltas are net positive cost-reduction or quality-lift. None are pure length-padding.

---

## §5 — Unresolved items to flag at user gate

1. **Δ1 verification step in P3 pre-flight** (silhouette infra capability). If verification fails, choice of fallback (Plan A extend / Plan B primitive-tag / Plan C carry-forward bbox) becomes a user-facing decision.
2. **Δ3 disconnect-during-cinematic abort path** — new test required.
3. **R11 still has residual risk** until silhouette path verified. If verification fails AND Plan B chosen, primitive-tag UX needs design (RMB-hold? button? cooldown-style hint?).

---

## §6 — Final disposition

**PRIME-AUDIT result:** PASS WITH 5 DELTAS.

PDR + Battle Ledger require minor amendments (Δ1-Δ5). No blocking findings. Ready for user gate.

Amendments will be applied inline to the Battle Ledger document; PDR §4 P3 design + §5 risks + §6 testing get the +1 risk (R22) + +2 tests + Δ1 pre-flight step.

**User gate:** APPROVE / VETO / ADJUST row N + Δ choice on R11 fallback (Plan A/B/C if Δ1 verification fails).
