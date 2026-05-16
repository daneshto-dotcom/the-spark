# S31 P0 Batch — PRIME-AUDIT Delta

**Date:** 2026-05-16
**Author:** Claude (Opus 4.7 1M MAX, self-adversarial pass)
**Stage:** Post-Council synthesis, pre-user-presentation
**Mandate (Rule 20):** Surface what Council rubber-stamped, claim-addressed-not-fixed, where consensus masked independent disagreement, edge cases undercaught, where synthesis is materially better than R1 or just longer.

## Delta 1 — Q1 Spawn Timing OVERRIDE

**Council R1 verdict:** Both Grok and Gemini ruled Option B (spawn at fade-START, tick 270, "emerge through fade").

**PRIME-AUDIT challenge:**
1. **Math the Council didn't compute precisely.** With B, creature spawns at tick 270 (4500ms). `bg.alpha` is 1.0 at tick 270 (fade hasn't started yet — fade KICKS OFF at tick 270 via `cutsceneOverlay.fade()` call inside completeTimer). Fade runs 270-288 (300ms = 18 ticks). SPAWNING animation runs ticks 270-329 (60 ticks). For the first 18 ticks of SPAWNING (270-287), creature is rendered behind a still-fading-from-1.0-down-to-0.0 overlay.
2. **First-tick visibility under B:** tick 270, bg.alpha=1.0, creature alpha=1.0. Creature is 100% occluded by the overlay it spawns under.
3. **Mid-fade visibility:** tick 279, bg.alpha~0.5, creature visible at 50% opacity. Still partially obscured.
4. **Visibility math:** average creature alpha during ticks 270-287 ≈ 0.5 (linear fade midpoint). Average occlusion of pulse animation during first-third of SPAWNING ≈ 50%.
5. **Council's "drama" argument** — Gemini cited "tightly coupling cinematic climax with creature arrival." But the climax is already the cinematic mp4 playing for 4 seconds. The post-mp4 sustainedEffectMs window (500ms) + fade (300ms) is NOT climax — it's the audio voice cue + sustained brand stamp, with fade signaling "cinematic is yielding gameplay." The right "arrival" beat is the moment overlay clears, not 800ms before it.
6. **User's exact bug** in S30 reflexion: "user reported live-site regressions (static voltkin instead of mp4 + no movement/laser)." Root cause was "overlay timing covers creature lifetime" — the EXACT fix target IS to make the post-overlay creature visible. Sacrificing 30% of the entry pulse to "emerge through fade" defeats the purpose of the fix.
7. **Gemini's "disjointed pause" objection** — re-read carefully. Their assumption is Option A = "fade ends, then THEN creature spawns" with a gap. But A as specified spawns AT exact fade-end (tick 288, bg.alpha=0). No gap exists. Their concern is based on a misreading of the spec.

**Verdict:** OVERRIDE Council. Adopt **Option A** (`fireAtTick = world.tick + cinematicMsToTicks(cinematicMs + sustainedEffectMs + FADE_MS)`).

**Counter-counter-argument considered:** what if Option A reads as "abrupt"? After 4800ms of cinematic build-up, creature pops into view at full alpha. Could feel jarring.
**Mitigation if playtest exposes:** Grok's alpha-pierce idea (creature spawns at 288, alpha tweens 0→1 over 8-12 ticks via creatureRenderer.sync) becomes a 1-LOC change at that point. Defer.

## Delta 2 — Q3 Shake Trigger OVERRIDE

**Council R1 verdict:** Both ruled explicit `SCREEN_SHAKE { tick: number }` NetMessage.

**PRIME-AUDIT challenge:**
1. **YAGNI accounting.** Implicit detection requires:
   - Client-side scan of `world.effects` for `ARC_FLASH && tick === world.tick` after applyNetSnapshot → ~5 LOC.
   - Already-implemented machinery: filtered effect serialization (P0-3 Q2 path).
2. Explicit message requires:
   - New protocol type definition in `src/net/protocol.ts` (`SCREEN_SHAKE_MSG`).
   - `NetTransport.send` call in host shake path (main.ts:636-638).
   - Receive branch in client handler (main.ts:292-302).
   - Dispatch hook on receive.
   - Tests for the message round-trip + protocol compatibility.
   - ~25-30 LOC + permanent protocol surface widening.
3. **Forward-compat justification ("Anvil might want shake without ARC_FLASH")** is hypothetical. Anvil hasn't been designed. When (if) it ships, refactoring 5 LOC of implicit detection to either (a) explicit message or (b) implicit-on-Anvil-attack-effect is trivial.
4. **Architectural-purity argument from Gemini** ("host as single source of truth"): host IS still the single source of truth in the implicit path. Host emits ARC_FLASH; client receives mirror; client triggers shake locally on observation. No re-derivation of game logic — only visual response to an authoritative effect.
5. **Brittleness argument from Gemini** ("if ARC_FLASH ever added without shake, or shake desired without ARC_FLASH, implicit fails"): true, but until either scenario materializes, this is preemptive complexity.

**Verdict:** OVERRIDE Council. Adopt **implicit detection** (5 LOC in main.ts client-side path).

## Delta 3 — Grok Q4 "unsafe" claim PARTIAL OVERRIDE (kept as caution)

**Council R1 verdict:** Grok HIGH — unsafe to delete cinematicTimer; cites duplicate creature IDs, skipped spawns, resetIfPostgame during 300ms window. Gemini certified safe-with-E-01.

**PRIME-AUDIT investigation against actual code:**
- **"Duplicate creature IDs":** `pendingCreatureSpawn` (main.ts:508-521) is single-slot with dev-mode console.warn on overwrite. Only ONE creature spawn fires per cinematic. ✗ Grok unsubstantiated.
- **"Skipped spawns":** Same single-slot guarantee. ✗
- **"runGodlyMatcher resumes early":** main.ts:418 gates on `world.activeCinematicPlayerId !== null`. During 300ms gap, owner non-null, matcher paused. ✗
- **"lastCinematicOwner stale":** main.ts:455-457 compares to current owner; stays equal during gap, watcher early-returns. ✗
- **"Reconnection snapshot apply during 300ms":** connection-lost calls `cutsceneOverlay.abort() + dispatch(GODLY_ABORT)`. GODLY_ABORT clears `activeCinematicPlayerId` immediately, closing the gap. Confirmed: world.ts GODLY_ABORT reducer drops the owner field. ✗

**Verdict:** Grok's specific failure modes do not materialize. Adopt Gemini's safe verdict. **But** retain Gemini's E-01 invariant test as defense-in-depth — codify the no-window state so any future regression is caught.

## Delta 4 — Synthesis quality check

**Question:** Is this synthesis materially better than R1, or just longer?

**Audit:**
- Grok R1 surfaced 5 challenges, 1 BLOCKER (Q2), 2 HIGH, 1 MEDIUM. PRIME-AUDIT adopted 2 (Q2 + tooling-quality), rejected 3 with specific code-evidence rebuttals. **Material additions: counter-investigation of Grok's Q4 + Q1 claims.**
- Gemini R1 surfaced 3 findings (E-01, Q-01, T-01) + 4 forked rulings. PRIME-AUDIT adopted ALL 3 findings, rejected 2 of 4 rulings (Q1, Q3) with stricter math reasoning. **Material additions: precise tick math under B that Gemini didn't compute; YAGNI accounting for Q3.**
- New from PRIME-AUDIT: explicit visibility math for Option A vs B (50% pulse occlusion average); YAGNI LOC accounting for implicit vs explicit shake; code-evidence rebuttals of Grok Q4.

**Verdict:** Materially better. Two key Council decisions (Q1, Q3) are overridden with arithmetic and YAGNI rationale; Gemini's flagged work-items are kept; Grok's tooling concern partially adopted (1 test, not full ReplayDriver). Synthesis adds correctness, not length.

## Delta 5 — Edge cases undercaught

Council didn't surface:
1. **FADE_MS export from cutsceneOverlay.ts.** This is the file-private constant (`const FADE_MS = 300;` line 28). P0-1 fix requires it in main.ts. Solution: export. Trivial but missed by both.
2. **Pre-S31 save format compat.** P0-3 adds `effects` field. Old saves (pre-S31 localStorage) won't have it. `applySnapshotCore` must default `world.effects.length = 0` on missing field. Already noted in PDR; verify both serialize and deserialize paths.
3. **Client-side teardown via `onReturnFromConnectionLost`.** main.ts:313-316 dispatches RETURN_TO_TITLE locally on client. With P0-2 reducer fix, client creatures/cinematic state cleared. ✓ No leak.
4. **Server-side teardown via `onBackToTitle` in lobby.** main.ts:309-312 dispatches `teardownNet + world.gameState = 'TITLE'` (note: NOT dispatch(RETURN_TO_TITLE) — direct field assignment). This BYPASSES the new reducer cleanup. **HOLE.** Fix: change line 311 from `world.gameState = 'TITLE'` to `dispatch(world, { type: 'RETURN_TO_TITLE' })` to route through reducer.
5. **Title→Lobby→Back from lobby pre-game.** No active cinematic at this stage; no state to clear. ✓ Safe.

**Verdict:** Add fix #4 to P0-2 scope. **PDR amended** to include `main.ts:311` change.

## Delta 6 — What was rubber-stamped that should have been challenged?

Council's universal adoption of P0-3 effect filtering didn't probe:
- **Are all 3 filter kinds actually emitted same-tick-as-render?** Read code: ARC_FLASH emitted in creatureAttack.ts at attack-fire tick. BOND_FORMED emitted in placePrimitive.ts. BOND_SEVERED emitted in world.ts SEVER_BOND. All three are emitted DURING reducer ticks, not in render. effectsRenderer.sync() drains at end of render. So `effect.tick === world.tick` is true only for one render frame. Snapshot emission at 10Hz (every 6 physics ticks) may MISS effects emitted between snapshots. **Mitigation:** snapshot serializes ALL effects in world.effects (not filtered by tick === world.tick), since effectsRenderer drains them right after render. Client receives effects as a batch; client renderer processes them via its own age tracking (Q-01 ADOPTED — uses effect.tick not internal counter).

**Verdict:** Confirmed correct. Snapshot serializes the full current-frame effects list (which includes any tick within the last frame, up to drain time).

## Final PRIME-AUDIT amendments to PDR

1. P0-1 = Option A (not B). [OVERRIDE Council]
2. P0-3 shake = implicit detection (not explicit NetMessage). [OVERRIDE Council]
3. P0-2 scope amended: `main.ts:311` `world.gameState = 'TITLE'` → `dispatch(world, { type: 'RETURN_TO_TITLE' })`. [NEW — Delta 5 #4]
4. Effect age computation: client uses `currentTick - effect.tick`, not internal counter. [ADOPT Gemini Q-01]
5. Test for 18-tick window: assert ZERO overlap under Option A. [ADOPT E-01 reformulated]
6. Peer-disconnect mid-cinematic test mandatory. [ADOPT T-01]
7. One teardown integration test (not full ReplayDriver). [PARTIAL ADOPT Grok #4]
