# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-24 | Session: S45 (BUG-CRITICAL-3 SHIPPED autonomous-mode Full tier — Sym A joiner-interaction + Sym B multi-avatar + Sym C(a) carry-spark tint; user 2-peer smoke pending)

## Next Steps

1. **🔴 USER ACTION — 2-peer smoke for BUG-CRITICAL-3.** Open https://spark-online.space/?debug=1 in TWO browser windows (different processes ideally; or two separate Chrome profiles). Host creates room, joiner enters code. Verify:
   - **(Sym A)** Joiner can pick up sparks + place primitives by LMB-drag + RMB-drag. Pre-S45 joiner could only watch.
   - **(Sym B)** BOTH avatars visible on BOTH screens (red glowing dot for host, blue for joiner). Pre-S45 joiner saw "invisible force" pulling primitives. Joiner's own avatar tracks own cursor lag-free; remote avatar tracks at ~100ms RTT (10Hz update cadence).
   - **(Sym C(a))** When a player carries a spark, the carried spark visibly tints to that player's color (red for host, blue for joiner). Pre-S45 all carried sparks were neutral white.
   - **(C10 ADOPT-LITE)** While LMB-dragging a spark, your own avatar's pulse boost is more pronounced — local visual cue that "intent was sent." Optional polish; functional even without notice.
2. **🟡 If smoke passes:** archive BUG-CRITICAL-3 PDR to `.claude/plans-archive/`, add a follow-up PDR for Sym C(b/c) "primitive/creature tinted by creator" (schema-change session — requires protoVersion bump + back-compat snapshot handling — explicitly deferred from S45 per regression-compounding rule).
3. **🟡 If smoke surfaces NEW symptoms (layer N+2 per S44 stack-of-bugs lesson):** draft BUG-CRITICAL-4 PDR with state-discovery checklist; expect at least one more bug layer to surface now that interaction + render are working.
4. vite/vitest CVE major bump (carry from S37 + S45; 4 MODERATE dev-only CVEs; requires vite 5→6 + vitest 1→3; ~20K dedicated session).
5. main.ts hypertrophy refactor (carry S37+S39+S44; Standard batch ~30-40K with Council).
6. Server-side reach validation for PICKUP_SPARK (NEW S45 PRIME-AUDIT Δ4 carry — joiner currently has "telekinesis" because host accepts any free-spark pickup intent regardless of where joiner's cursor was; pre-prod acceptable but future PDR needed before any anti-cheat work).

## Blockers

- USER 2-peer smoke gating BUG-CRITICAL-3 close. All other priorities ungated.

## Pending Backlog

- Sym C(b/c) primitive/creature creator-tint (schema-change PDR; protoVersion bump + back-compat)
- vite/vitest CVE major bump (carry from S37 + S45)
- main.ts hypertrophy refactor (multi-priority Standard batch)
- Continue-UI product decision on `loadFromLocalStorage`
- Per-symbol triage of 42 knip-flagged unused exports (carry S38)
- chateau-guardian CI audit (cross-project carry S41)
- Node.js 20 deprecation in deploy.yml (auto-forced 2026-06-02)
- Client-side prediction rubber-banding UX polish (post-BUG-CRITICAL-3 playtest)
- S44-NEW: Mid-session degraded-strategy teardown-restart (Council R2 follow-on)
- S44-NEW: NIP-78 functional probe (HTTP-only currently via `npm run probe-relays`)
- S44-NEW: Custom-relay URL field for tournaments
- NEW S45: Server-side spark-reach validation (PRIME-AUDIT Δ4 carry — joiner-telekinesis acceptable pre-prod)
- NEW S45: Playwright/Puppeteer 2-browser E2E harness (Council R2 C5 Gemini-mandated, deferred for cost — ~25-40K dedicated session)

## Recent Reflexion (last 2 sessions)

### 2026-05-24 — Session 45 (BUG-CRITICAL-3 SHIPPED autonomous-mode Full tier; Sym A + Sym B + Sym C(a); commit bf5090c + deploy 26370843779)

- **#state-discovery-pre-empted-a-schema-bump-by-discovering-existing-wiring:** Sym B's UPDATE_AVATAR_POS infrastructure was already plumbed end-to-end (Player.avatarPos + action + reducer + snapshot serialization + net protocol whitelist + tests) but ZERO production dispatch sites. Fix collapsed from "schema bump + protoVersion + back-compat" to "wire the dispatch + iterate render", a one-third scope reduction. **Lesson: before scoping a "new feature," grep for FOO_FIELD/FOO_ACTION first — dead-wired features from prior partial-ship work are free 30% scope reductions.**

- **#council-r2-c3-hybrid-sourcing-unanimous-instant-resolve-pattern:** Council R1 challenge #3 (own-player avatar source) had all 3 voices independently converge on hybrid (local=cursor, remote=avatarPos). Gemini called rendering own avatar at network-lagged position "a cardinal sin of game feel." **Lesson: unanimous R1 convergence = INSTANT-RESOLVE signal; skip R2 synthesis for that decision. Reserves R2 quality budget for actual disagreements.**

- **#prime-audit-delta-4-expansion-caught-deeper-coupling:** Sym A scoped as single 1-line gate bypass; PRIME-AUDIT discovered it actually required THREE coupled changes (controls.ts gate bypass + sparkLifecycle.ts pickup-snap + gameMode.ts carry-coupling) because joiner's same-tick PICKUP+PLACE has no UPDATE_AVATAR_POS between them. **Lesson: PRIME-AUDIT's role is "what coupling does the proposed fix imply that the PDR didn't surface?" Multiplayer state corrections often have multi-file ripples. Add 30% PDR-scope multiplier for net-state changes.**

- **#remote-carrier-gating-on-spark-snap-preserved-754-test-suite:** Unconditional snap of spark.pos = player.avatarPos in applyPickupSpark broke existing tests because they create sparks at arbitrary positions without setting avatarPos. Gated to remote-carrier-only (`world.gameMode === '1v1' && action.playerId !== world.localPlayerId`); solo + host-own-pickups preserve pre-S45 behavior byte-identical. **Lesson: when adding a behavioral change to a shared reducer, gate on the mode that needs it (fewest tests broken = narrowest contract change).**

- **#avatarrenderer-attractdrag-pulse-boost-zero-new-mechanism:** Battle Ledger C10 ADOPT-LITE: reuse existing `controls.state.kind === 'AttractDrag'` as a local-only visual cue (double pulse depth during drag) to bridge perceptual lag. 3 lines, no new code paths. **Lesson: before designing a new UI feedback channel, scan existing FSM states first — local input state often has all the signals needed.**

- **SESSION:** 10 files +507/-175 LOC, commit bf5090c, deploy run 26370843779 SUCCESS, 4-layer 10/10 PASS. Bundle 488.16/500 KB (+1.25 KB, 11.84 KB headroom). 757/757 tests (+3). ~120-150K tokens, ~$0.06 API spend (1 Grok + 1 Gemini). CLOSE GATED on user 2-peer smoke (Sym A interaction + Sym B avatar visibility + Sym C(a) carry-tint).

### 2026-05-24 — Session 44 (BUG-CRITICAL-2 FIX SHIPPED + USER-SMOKE PASS for pairing; 3 NEW symptoms surfaced; BUG-CRITICAL-3 PDR drafted for S45; commit 6f412f3 + handoff dfd7f50)

- **#user-smoke-confirmed-bug-critical-2-pairing-restored-AND-exposed-deeper-bugs:** Multi-strategy fix worked exactly as designed — peers paired, snapshot sync flowing. BUT smoke surfaced 3 NEW symptoms (joiner cannot interact, no remote-avatar render, color identity). **Lesson: fixing a lower layer unmasks bugs in higher layers that depend on it. 8-session-overdue smoke wasn't hiding ONE bug, it was hiding a STACK. Pattern: when fixing a foundational bug, pre-draft state-discovery checklist for layer N+1.**

- **#council-r2-architectural-pivot-from-race-winner-to-multi-broadcast:** Council C4 race resolution was structurally race-prone. PRIME-AUDIT Δ2 alternative: keep ALL strategies active simultaneously, broadcast on every strategy, app-layer dedup via NETSNAPSHOT seq + INTENT timestamp + HELLO idempotency. **Lesson: PRIME-AUDIT should ask "is there an architecture that makes this race condition not exist?" before accepting race-resolution refinement.**

- **#trystero-0-25-api-breaking-change-makeaction-shape-and-event-properties:** 0.24→0.25 makeAction returns object not 3-tuple; onPeerJoin/onPeerLeave are property assignments not methods. Type-driven refactoring caught the breaks immediately. **Lesson: run `tsc -b --noEmit` BEFORE testing when migrating across minor versions.**

- **#runtime-verifiability-via-preview-eval-beats-deploy-and-pray:** Used `preview_eval` in dev browser to dynamic-import NetTransport + call .connect + read getDiagnostics — confirmed nostr 7/7 + torrent 3/3 sockets attached BEFORE deploy. **Lesson: HTTP-protocol probes are insufficient for WSS endpoints; in-browser runtime probe is the right shape.**

- **#vite-inlines-dynamic-imports-when-flag-statically-true-no-lazy-chunk:** Vite inlined torrent dynamic-import into main bundle because the flag was statically derivable true. **Lesson: if lazy-load is critical for bundle budget, gate with non-static value (e.g. `import.meta.env.VITE_*`).**

- **#bundle-shibboleth-must-distinguish-upstream-defaults-from-our-config:** L4b shibboleth `damus.io:1` was upstream-package `defaultRelayUrls` fallback — overridden at runtime by our relayConfig. **Lesson: pair bundle-grep NEGATIVE shibboleths with runtime `import` probe of the config constant.**

- **#user-urgency-3-exclamations-authorized-full-tier-without-explicit-option-c-naming:** "fix all bugs! be thorough!" with 6 exclamation marks treated as `go` for most thorough option, with verbatim words preserved in Scope Amendment for auditability. **Lesson: URGENCY signals are ALSO `go` signals; anchor amendment in verbatim words.**

- **SESSION:** 10 files +1335/-287 LOC, commit 6f412f3, deploy run 26367307504 SUCCESS, 4-layer 10/10 PASS. ~80K tokens, ~$0.12 API spend. CLOSED on user 2-peer smoke (S35-P11 carry also closed simultaneously).
