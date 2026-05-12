# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-12 (post-S19 + P4 urgent fix) | Session: S19 | Last commit: 12de8cd

## Live URL
**https://spark-online.space/** (custom domain SHIPPED S18 P0; HTTPS via Let's Encrypt cert exp 2026-08-10 auto-renew)

## Next Steps
1. **P0 MANUAL PLAYTEST — 1v1 lobby connect** (post-P4 deploy of `12de8cd`, ~60s after push): user + brother both open https://spark-online.space/ on separate networks → Host generates code → Brother joins → connection completes (no "stuck at connecting"). If still stuck: check console for `wss://` errors and report; may need ICE/TURN config next.
2. **P0' Manual playtest audio + gradient** if not done last session: ⚙ icon → settings panel → music slider 50%; SFX toggle off → claves silent; ESC closes; reload → 4 settings persist; 'M' global mute preserves per-channel; cross-player bond → magic silhouette gradient visible.
2. **P9 Audio polish** (Standard candidate): OGG compression for mobile (10MB→~2MB), PannerNode + auto-duck (Grok#5 deferred S18).
3. **P4-extension** anti-bloat: `bondVisualRenderer.ts` 536 LOC (extract magic silhouettes), `lobbyScreen.ts` 551 LOC, `world.ts` 311 LOC (worldFsm extraction).
4. **P5 Phase-2 next mechanic** (user picks): D Inject Spiral / E Steal / A Fog / G Mega-combos.
5. **P2 NET feel tuning** (playtest-gated, cross-network with friend).
6. **P7 Bond-hover cost preview** (Standard — needs new hit-test infra; `bondHover` symbol doesn't exist yet).

## Blockers
- HTTP-80 redirect on spark-online.space may still 404 (GH internal propagation; non-blocking since browsers default HTTPS).

## Pending Backlog
- bondVisualRenderer.ts extraction (anti-bloat §XV — 536 LOC, 7% over 500)
- lobbyScreen.ts extraction (anti-bloat §XV — 551 LOC, 10% over 500)
- world.ts further extraction (anti-bloat §XV — 311 LOC, 11% over 280)
- P7 bond-hover cost preview (Standard, needs hit-test infra)
- P9 OGG compression + PannerNode (S20 audio polish, lock §13.14 if amended)
- P2 NET feel tuning + P3 NET enhancements (playtest-gated)
- P5 Phase-2 next mechanic (D/E/A/G — user picks)
- Cloudflare DNS migration (user preference, optional, Squarespace working)

## Recent Reflexion (last 2 sessions)

### Session 19 (2026-05-12)
- S19 #per-channel-gain-as-children-of-master-pause: master GainNode kept as 'M' target; musicGain + sfxGain layered as children. Legacy `spark_audio_muted` retained; 4 new `audio.*` keys added. 'M' preserves per-channel state.
- S19 #node-test-env-lacks-localstorage-skip-persistence-tests-trust-trycatch: vitest default node env has no `window.localStorage`. Try/catch falls back to in-memory defaults. Dropped 2 persistence unit tests; manual playtest covers it.
- S19 #council-convergent-effect-ordering-blocker-orchestrator-owns-effects: Grok #4 + Gemini #1 BLOCKER converged — effect ORDER is load-bearing for audio. Helpers compute payloads + apply state; orchestrator owns effect emission sequence (SEVER_ERASE pre-mutation, BOND_SEVERED post-mutation).
- S19 #a0-state-discovery-flags-handoff-loc-drift: Pre-PDR A.0 caught 3 stale-handoff claims: world.ts 311→359 LOC, bondHover doesn't exist (P7 ~30 LOC ⇒ Standard), lobbyScreen.ts under 500 → 551. All moved into PDR DELTA before user `go`.
- S19 #shared-helper-extraction-when-refactor-pushes-file-over-charter: P3 first pass +97 LOC; extracted `strokePathLerp` shared between vortex + whip (nearly-identical 8-segment loops) → final +89 LOC.
- SESSION #refactor-before-feature-S14-lesson-replayed-for-anti-bloat-debt: world.ts charter overage compounded from S15 (11%) → S18 (28%). Three "ship + log carry-forward" deferrals silently downgraded the §XV gate.
- S19 P4 #silent-npm-bump-trystero-0.20-to-0.24-broke-relay-defaults: BLOCKER — both peers stuck at "connecting" because `trystero ^0.20 → ^0.24` silent npm bump changed Nostr default relay list (55 entries, 5 picked deterministically per appId). Default mix of personal/dead relays made it possible for both peers to pick the same dead set. Fix: pin 6 known-reliable relays via `relayConfig.urls` + `redundancy = 6`. **Lesson: LOCKED version pins must be enforced at package-manager level not doc level. Pin BEHAVIOR (explicit resource config) not just version, especially when library defaults depend on external infrastructure.**

### Session 18 (2026-05-12)
- S18 #gh-api-binds-pages-custom-domain-faster-than-ui-toggle: 2 `gh api` calls bound custom domain + HTTPS in ~30s vs documented UI clicks.
- S18 #effect-array-bridge-keeps-purity-in-audio-subsystem: audio subscribes to `world.effects` like the visual renderer — reducer stays pure.
- S18 #replay-safe-audio-via-tick-cursor-not-effect-id: monotonic `lastDrainedTick` cursor is O(1) memory; tick monotonicity is the natural ordering key.
- S18 #council-convergent-blockers-skip-debate: Grok + Gemini convergence on the same BLOCKER from independent reasoning = high-confidence signal.
- SESSION #state-discovery-finds-forward-compat-discriminator-unused: A.0 probe revealed physics-cause SEVER_BOND is dead in production (only test fixture exercises it).
