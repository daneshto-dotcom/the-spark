# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-12 (post-Session-15) | Session: 15 of 10+ — S14 § XV charter extraction + Phase-2 1v1 networked play (Trystero/Nostr)

## Next Steps
S16 is pre-scoped post-S15-playtest. User flagged two CRITICAL gaps after viewing the lobby screen (screenshot captured):
1. **BLOCKER — Lobby JOIN pane has no usable input field.** The keyboard-buffer hack in [lobbyScreen.ts](src/render/lobbyScreen.ts) is invisible to the user (no caret, no click-to-focus, no HTML input). Friend on the other machine cannot enter the host's code → cross-network play impossible until fixed.
2. **BLOCKER — Cross-network play impossible: dev server is localhost only.** `localhost:31183` is loopback-only. Friend cannot load the app. Need either (a) deploy to a public URL (GitHub Pages recommended), or (b) tunnel localhost via ngrok (same-day test path only).

**S16 recommended batch (Standard tier, in execution order):**

- **P0 (Micro) — Charter extraction (S15 carry-forward).** Move S15 new dispatch handlers (START_GAME, END_TURN, RETURN_TO_TITLE, UPDATE_AVATAR_POS) + addScore helper from `world.ts` (357 LOC) to new `src/state/gameMode.ts`. ~80 LOC moved → world.ts back to ~280. Same mechanical pattern as S14 P2.0 / S15 P1. 291/291 regression preserved.

- **P1 (Micro) — Lobby JOIN UX fix.** Replace the invisible Pixi-text mock with an HTML `<input type="text">` overlay (CSS-positioned over the JOIN pane rect). 6-char maxLength, uppercase auto-transform, cyan border, native focus + caret + paste. Click JOIN pane → `input.focus()`. Connect button enables when 6 valid chars. Clear "Click here, then enter the code your friend shared" hint so affordance is unmissable. ~80 LOC + 3-5 input-validation tests.

- **P2 (Standard) — GitHub Pages deploy + custom-domain swap path. User-chosen domain: `spark-online.space`.** Two-step:
  - **Step 1 (initial, S16 P2 ships):** `vite.config.ts` `base: '/the-spark/'`; `.github/workflows/deploy.yml` (push: master → npm ci + npm run build → publishes dist/ to gh-pages via peaceiris/actions-gh-pages@v3 + built-in GITHUB_TOKEN); Settings → Pages → Source: gh-pages / (root); verify `https://daneshto-dotcom.github.io/the-spark/` loads + Trystero WebRTC works (HTTPS default).
  - **Step 2 (~2-line PR, ready to ship alongside Step 1):** `spark-online.space` purchased + WHOIS verified at Squarespace Domains 2026-05-12 (5yr, exp 2029-05-12). Change `base: '/'` + create `public/CNAME` containing `spark-online.space`; Squarespace DNS panel → Custom Records → add 4 A records (Host `@`, values `185.199.108.153 / .109.153 / .110.153 / .111.153`) + optional CNAME `www` → `daneshto-dotcom.github.io`; GitHub Settings → Pages → Custom domain `spark-online.space` + Enforce HTTPS (Let's Encrypt auto-issued ~15 min once DNS resolves).
  - **Why two-step:** validate the deploy + Trystero P2P on github.io first (no DNS wait), then swap to branded domain at user convenience. Both small commits, no rework.

- **P3 (Micro, optional) — Lobby visual polish.** Hide `makeSpawnerRing` + `makeLegend` containers when gameState ∈ {TITLE, LOBBY}. Eliminates spawner-ring artifact bleeding through the lobby panes (visible in user's S15 screenshot).

- **P4 — Closeout** (LOCKED § 13 deploy-URL amendment, BACKLOG, reflexion, boot-snapshot, PDR archive, HANDOFF).

**Same-day playtest path (before P2 deploys):** `npx ngrok http 31183` → temporary public URL → send to friend → validates Trystero WebRTC + lobby flow end-to-end. Free ngrok tier has random URL per session; your laptop + Vite + ngrok must stay running.

**Tune feel constants post-playtest:** `NET_SNAPSHOT_HZ` (10), `NET_INTERPOLATION_MS` (100); S14 carry-overs (AVATAR_PULSE_HZ=1.2, REDUNDANT_BOND_K=3, MIN_ANGLE_RAD=25°); S13 cinematics constants.

**Optional S16+ enhancements (per playtest signal):**
- Client-side AttractDrag prediction + reconciliation buffer (~150 LOC, Grok R1 ask).
- Delta-encoded NetSnapshot for bandwidth (Council R1 nice-to-have).
- Host-migration stub if transient disconnects feel intrusive (Grok R2 ask).
- Live cursor-move sync for remote avatar (~50 LOC; currently avatarPos updates only on commit).

**Known v1 limitations** (LOCKED § 13.7): AttractDrag on P2 lags ~RTT/2; no host-migration; tab-hidden host pauses sim; save format break (pre-S15 → solo defaults applied); no reconnect.

**Phase-2 Tier-1+ deferred:** `docs/phase-2-design-options.md` — recommended next pair C (Sever-as-disruption) + F (Multi-color rendering), ~220 LOC.

**Audio:** Suno track upload pending since S5.

## Blockers
**Two BLOCKERS for cross-network playtest** (both in S16 P1 + P2):
- JOIN pane input field non-functional — friend cannot enter code.
- App not publicly accessible — friend cannot load the page.

Both must land before any real friend-in-different-country playtest. After both deploy, the verification path is: friend opens `https://daneshto-dotcom.github.io/the-spark/` → 1v1 → JOIN → types code from your host screen → Connect → "Begin Match" (you click on host) → both see same world → SPACE to end turn → first to 50 wins.

## Pending Backlog
- [ ] Session 16+ — S15 P2 PRIME-AUDIT carry-forward (world.ts → gameMode.ts extraction); S15 client-side prediction + delta encoding + host-migration stub (per playtest signal); Phase-2 Tier-1+ disruption suite (Sever-as-disruption / Inject Spiral / Steal / Multi-color rendering / Mega-combos per `docs/phase-2-design-options.md`); Audio (Suno track upload); any post-S15-playtest re-tuning of `NET_SNAPSHOT_HZ`, `NET_INTERPOLATION_MS`.

## Git
Branch: `master`. Origin: `https://github.com/daneshto-dotcom/the-spark.git`. All S15 commits pushed.
- (S15 closeout commit at end of P3)
- add497f — S15 P2: networked 1v1 multiplayer MVP (Trystero/Nostr WebRTC, host-authoritative 10Hz NetSnapshot + lerp + per-direction seq, title + lobby, solo preserved)
- b9c4b20 — S15 P1: extract pickRedundantBondTargets + angularDistance from controls.ts to src/input/redundantBondTargets.ts
- 8daafc6 — [state-autocommit] S14
- 1764900 — S14 /handoff: archive copy of root HANDOFF to .handoff-archive/
- 8d08e58 — S14 /handoff: state churn (1 line)
- b8a236f — [state-autocommit] S14
- f430710 — S14: session-state — P3 completed + active_pdr -> archive
- 05c5d72 — S14 P3: closeout — BACKLOG + reflexion + boot snapshot + PDR archive + HANDOFF
- ab40447 — S14 P2.1: multi-endpoint redundant bonding (K=3, 25° spread, no-score)
- 9bb784e — S14 P2.0: extract placePrimitive from world.ts to src/state/placePrimitive.ts
- 0ccb3fe — S14 P1: avatar disambiguation — anti-phase outer/inner alpha pulse

## Recent Reflexion (last 2 sessions)
## 2026-05-12 — Session 15 of 10+ (S14 Charter Extraction + Phase-2 1v1 Networked Play)
- S15 #user-amendment-mid-session-as-2nd-council-cycle: User amended scope twice in-session (original "Hotseat + Fog Tier-0" → "drop fog + add lobby same-machine hotseat" → "friend in different country, networked"). Each amendment fired its own deliberation cycle: R1 on original; R1 amend on hotseat+lobby (carry-forward applied); R1+R2 on networked. **Lesson: user amendments are LEGITIMATE PDR-cycle re-entry points, not papering-over. The pipeline (draft → Council → PRIME-AUDIT → user gate) re-runs cleanly per amendment; carry-forward findings from prior rounds compose with new ones.**
- S15 #locked-decision-amendment-via-user-authority: User authorized breaking LOCKED § 1 ("Phase-3 net: Colyseus or Geckos.io later") for Phase-2 1v1 ("friend in different country"). Amendment documented in same session (LOCKED § 1 row split into Phase-2 net + Phase-3 net + new § 13 Networked Play v1). **Lesson: LOCKED_DECISIONS sections are USER-AUTHORITY-amendable not implementation-frozen. When user authorizes amendment, document it in the same session (don't defer the doc update) so future sessions don't act on stale lock.**
- S15 #council-r2-converges-disagreements-not-restarts: R1 returned REVISE/REVISE with Trystero vs PeerJS as the major disagreement. R2 closed cleanly: Grok conceded Trystero on Gemini's specific counter (multi-strategy fallback + PeerJS-broker-is-only-for-signaling distinction). Host-migration split persisted (Gemini won "Connection lost overlay"; Grok mandatory stub deferred to S16). **Lesson: R2 is a CONVERGENCE round, not a fresh deliberation. Frame R2 prompts as "defend or concede your R1 stance against the other member's counter" — the AI peers act symmetrically (each gets the other's R1) and the disagreement either resolves via concrete data or persists with documented carry-forward.**
- S15 #test-contract-as-implementation-surface: addScore helper initially broke 3 tests (session10 SCORE_TIER, session13 SCORE_TIER, gameState.test.ts indirectly) because they directly mutate `world.scoreProgress` as part of their fixture setup. First fix attempt (reset scoreProgress = scoreByPlayer.get(playerId)) preserved 1v1 semantics but broke solo. Resolution: branch on `gameMode` — solo path stays ADDITIVE (`world.scoreProgress += delta`; test contract preserved); 1v1 path uses max-of-scoreByPlayer (winner attribution semantics). **Lesson: existing test contracts are PART of the implementation surface, not external to it. New features must preserve them (additive new path while keeping old path identical) OR explicitly amend the tests with rationale. Don't treat tests as collateral damage of a refactor.**
- SESSION #trip-wire-as-judgment-signal-not-hard-gate: world.ts at 357 LOC vs 280 trip-wire in PDR. Decision: ship + log carry-forward (S16 extraction), not split. Rationale: ~80 LOC of growth is documentation/comments (new fields + actions are well-documented); splitting would require two more commits to half-finish integration; the work is coherent + complete + tested. **Lesson: trip-wires from the PDR are SIGNALS for "stop and reconsider," not hard gates. When the over-trip is mostly documentation and the integration is at a clean stopping point, ship + log > fragment. When the over-trip is genuine logic creep, split.**

## 2026-05-12 — Session 14 of 10+ (Avatar Disambiguation + Multi-Endpoint Redundant Bonding)
- S14 #council-led-restructuring-as-prerequisite: Both Grok #7 and Gemini § 7.1 independently flagged "refactor first, feature second" for world.ts charter compliance. Restructured P2 → P2.0 (mechanical extract; world.ts 587→228 LOC) + P2.1 (feature in new file). **Lesson: when two Council members independently flag a sequencing issue, that's high-signal AGAINST deferring instinct. Restructure-before-feature.**
- S14 #no-score-for-redundancy-clean-frame: Council G5/G8 challenged the scoring-of-redundancy-bonds + threshold-bump combo. Adopted: zero score for redundancy bonds, keep PHASE_1_WIN_SCORE=50. **Lesson: one concern per feature; one knob per concern. Threshold bumps that compensate for feature additions indicate the feature is doing too much.**
- S14 #pure-function-extraction-for-class-method-testability: `pickRedundantBondTargets` extracted as top-level pure function so 10 unit tests cover the geometric algorithm without Pixi/DOM mock. **Lesson: when a class method has nontrivial geometry/math, extract as a pure function taking a parameter struct. Test surface grows; class method becomes a 5-line wrapper.**
- S14 #verify-council-claim-with-source-not-narrative: Grok G4 used force-domain Σk framing on a Verlet position-domain solver. Verified bonds.ts:58 (extension-only break) + clamp ratio; rejected the framing while adopting the test mitigation. **Lesson: verify which solver model Council is reasoning in before adopting OR rejecting — force-domain vs position-domain produce wildly different safety analyses.**
- SESSION #prime-audit-as-revision-gate-not-decoration: PRIME-AUDIT caught 3 material findings (save/load test, BOND_COMMIT visualEffectId explicit assertion, anchor-place S10 regression check). **Lesson: PRIME-AUDIT is the last revision-gate where "did I miss anything" produces concrete diffs. Empty PRIME-AUDIT = rubber-stamp, not run.**
