# PDR S84 — Batch: Pooped-Cruiser Pickup Gate + Rainbow Flyover Event
**Tier:** Standard (10-30K) · **Council:** 3-way, 1 round (Trident Strike → synthesis) · **Date:** 2026-06-10
**Unlock:** user-explicit ("Make it happen! be creative technical and and thorough! then push it so i can check it out today") · **signals_fired:** none ("gate" keyword ruled gameplay homonym — change strictly tightens host-side intent validation; time_boxed noted, not applied)

## 1. OBJECTIVE
P1: While a player's cruiser is poop-debuffed, cursor clicks must no longer grab free sparks at full mouse speed — pickup requires the slow-chasing avatar to have physically arrived at the spark ("until spark doesnt get to them he shouldnt be able to grab them").
P2: When anyone clicks the rainbow (global color switch), every peer sees a dumb-looking crooked-tooth rainbow character arc left→right across the screen yelling a stupid voice line, while the whole background pulses colorful/trippy bright light for the event window.

## 2. SCOPE
P1 (~5K): src/constants.ts (POOP_PICKUP_ARRIVAL_RADIUS=36), src/state/sparkLifecycle.ts (gate in applyPickupSpark), diagnostics rejectReasons.pickupPoopedTooFar, unit tests (sparkLifecycle.test.ts).
P2 (~20K): src/state/worldTypes.ts|world.ts (World.rainbowSwitchTick?: number + RETURN_TO_TITLE clear), src/state/rainbowLifecycle.ts (set switchTick in applyTriggerRainbow), src/state/save.ts (additive-optional serialize/rehydrate — poopedUntilTick S82 precedent, NO schema bump), src/render/audioManager.ts (field-keyed one-shot yell w/ freshness window 60 ticks + reset alongside audio cursor), src/render/rainbowFlyoverRenderer.ts (NEW: pure flyoverPose() + backdrop wash stage-index-0 + translucent wash/beams in aboveFogLayer + character sprite, procedural-Graphics fallback), src/main.ts (construct/sync/__SPARK__ getter), src/constants.ts (RAINBOW_FLYOVER_DURATION_TICKS=240, RAINBOW_YELL_FRESH_TICKS=60), assets: Imagen4→matte→public/godly/rainbow-flyover/rainbow-flyover.png + Chirp3-HD TTS→ffmpeg pitch-warp→public/audio/rainbow-yell.ogg (zero bundle), tests (rainbowLifecycle, save round-trip, audioManager, flyoverPose, e2e rainbow.spec extension).

## 3. APPROACH (post-Council synthesis)
- P1 gate: pure function of synced fields (player.poopedUntilTick, avatarPos, spark.pos) → optimistic client prediction stays consistent; silent reject + diagnostics counter (race-reject precedent). Host-authoritative; zero wire change.
- P2 sync: **rainbowSwitchTick synced field** (NOT a one-shot GameEffect). A.0 probe proved NetSnapshot samples world.effects live at 10Hz emit while effectsRenderer wipes per frame → rare one-shot effects lose ~5/6 cross-wire. Field rides every snapshot: reliable, mid-join coherent (late joiner sees remaining window), restart semantics (second switch overwrites tick), save/load resumes window, RETURN_TO_TITLE clears.
- P2 audio: audioManager keys off the field (newly-seen switchTick + within 60-tick freshness → playOneShot once; latch resets with audio-cursor reset). Replay-safe without the lossy effects channel.
- P2 visuals: tick-driven only (age = world.tick − switchTick; effectsRenderer.ts:87 idiom); pure Graphics, NO custom GLSL (S29 P0 lesson); peak alpha ≤0.30, smooth ~0.4Hz hue cycle, sin(t·π) envelope, no strobe (photosensitivity).

## 4. RISKS
- Client avatarPos staleness at gate boundary (10Hz mirror) → rare boundary mispredict, self-heals ≤100ms (accepted; same class as all host-validated actions).
- Imagen matte on white bg: rainbow body is chromatic (safe); tooth/eyes white but enclosed → border-connected key protects (S83-proven). Verify with probes.
- Bundle: renderer ≤2.5KiB JS (charter 550KiB, current 544.9).
- Yell asset decode fail → playOneShot logs + silent (existing tolerance); PNG fail → procedural fallback rainbow.
- LOCKED §13.15/§13.19 untouched; protocol v7 untouched (additive-optional field only).

## 5. TESTING
P1: reject-far / allow-near / allow-after-expiry / allow-not-pooped / counter increment.
P2: switchTick set on trigger + idempotent re-click (first-click-wins already deletes rainbow); second-switch restart; NetSnapshot round-trip carries field (+absent-field back-compat); audio no-throw + freshness guard + single-fire; flyoverPose determinism (t=0 offscreen-L, t=.5 apex, t=1 offscreen-R, t>1 inactive); full vitest + tsc + build charter; e2e: trigger via __TEST_RAINBOW_SPAWN_SPARKS__ seam, assert flyover active via __SPARK__ getter + auto-end; live preview on $SESSION_PORT before push; post-push CI + live-site URL probes.

## 6. BUDGET
Tokens: ~25K execution (GREEN). Generative: ≤$0.60 (Imagen ~$0.10 + TTS ~$0.01 + headroom for 1 re-roll each) of $7.00 remaining cap.

## 7. ROLLBACK
Per-priority commits; assets-source/ keeps pristine generations; revert = git revert + delete public assets (no protocol/locked impact).

## 8. SUCCESS CRITERIA
P1: pooped player cannot grab a distant spark; can grab on avatar arrival; all gates green. P2: rainbow click → flyover + yell + trippy background on BOTH peers incl. the non-clicking one; auto-ends at 240 ticks; deployed live for user playtest today.

## BATTLE LEDGER (R1: Grok 8-item review min-33% non-AGREE ✓, Gemini APPROVE+3 challenges)
| # | Decision | Claude | Grok | Gemini | Authority | Resolution |
|---|----------|--------|------|--------|-----------|------------|
| 1 | P1 mechanism | radius gate | cursor-target self-enforce / queued pickup | silent-reject UX concern | Grok 1.75 | OVERRULED 2.0>1.75 — cursor-target incoherent for click-grab; queue = new state+replay cost; silent reject IS user-requested semantic. UX follow-up logged |
| 2 | P1 code shape | new block | merge into reach path | — | Claude 1.75 | SYNTHESIS — co-located single distSq, distinct diagnostic counter kept |
| 3 | P2 sync channel | effect+latch | "latch breaks contract" (HIGH) | mid-join unspecified | Claude 1.75 | SYNTHESIS via A.0 probe — latch claim refuted (drain idiom IS the contract) BUT probe exposed real 5/6 wire loss → switched to synced field. Materially better than all R1 positions |
| 4 | P2 audio channel | effect drain | — | — | Claude 1.75 | SYNTHESIS — field-keyed freshness-window yell (reliability + replay-safe) |
| 5 | P2 shader/Mesh alt | Graphics | Mesh+filter | perf concern | Claude 1.75 | OVERRULED Grok — S29 GLSL lesson; Graphics = 1 quad + 4 tris, perf concern satisfied by no-filter design |
| 6 | P2 arc determinism | f(elapsed) | mulberry32-seed it | — | Grok 1.75 | OVERRULED 2.0>1.75 — fixed trajectory needs no RNG; both peers compute from synced (tick, switchTick) |
| 7 | Readability/photosensitivity | alpha 0.30 | ADD contrast clamp | flag perf | — | ADOPTED — alpha cap, smooth cycles, no strobe, e2e console sanity |
| 8 | Stacking/mid-join spec | — | — | ADD | Gemini 1.75 | ADOPTED — restart-on-new-tick; late joiner gets remaining window; yell 60-tick freshness |

VETO LOG: none used. GEMINI VERDICT: APPROVE. RISK CONSENSUS unresolved: none (SPLIT: none).

## PRIME-AUDIT DELTA
R1 consensus would have shipped the one-shot-effect design whose cross-wire delivery is ~17% for arbitrary-tick events — caught by empirical probe of save.ts effects closure + effectsRenderer wipe, not by any reviewer's stated reasoning. Grok's HIGH "latch" finding: mechanism claim REJECTED with evidence, adjacent risk CONFIRMED and fixed by design change. Carry-forward logged: pooped-pickup rejection UX cue (playtest-dependent).
