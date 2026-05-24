# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-24 | Session: S44 (BUG-CRITICAL-2 SHIPPED + user-smoke PASS for pairing; 3 new symptoms surfaced; BUG-CRITICAL-3 PDR drafted for S45)

## Next Steps

1. **🔴 PRIORITY #1 — BUG-CRITICAL-3 execution.** PDR at `.claude/plans/IN-PROGRESS_S45_BUG-CRITICAL-3_client-interaction-and-remote-visibility.md`. Three symptoms surfaced by user S44 2-peer smoke:
   - **Sym A:** Joiner (P1/blue) cannot interact with primitives. Likely root cause in `controls.ts` dispatchFn routing OR `sparkLifecycle.ts` over-aggressive shared-resource silent-reject (Council R2 S42 lesson). State-Discovery first: check whether P2's INTENT messages reach host's `[net]` console.
   - **Sym B:** Joiner doesn't render host's avatar/spark ("invisible force"). Root cause CONFIRMED at static-parse: `main.ts:228 new AvatarRenderer(app, P1)` — SINGLE avatar instance parameterized for local player only. Fix: iterate world.players in render path OR per-player avatar instances.
   - **Sym C:** Per-player color identity for carried state / constructions. Needs user-product clarification (3+ interpretations possible) before coding. Could be: carry-state tint, primitive ownership tint, creature ownership tint, or all of the above.
2. **🟡 Tier choice:** PDR recommends Option B (Standard, ~25-30K, Sym A+B with deferred C). Options A (~15K Sym A only) and C (~40-50K full + protoVersion bump) also viable. Council R1 mandatory at Standard/Full tier.
3. vite/vitest CVE major bump (carry from S37; ~20K dedicated session)
4. main.ts hypertrophy refactor (carry S37+S39; Standard batch ~30-40K with Council; especially relevant now that we know AvatarRenderer wiring needs touching)
5. chateau-guardian CI audit (cross-project carry S41)
6. Mid-session degraded-strategy explicit teardown-restart (S44-NEW Council architectural follow-on; only if user reports mid-session disconnects)

## Blockers

- **🟡 Sym C semantic** ambiguity — need user product input on "constructions colored by who made them" intent before Option C scope can lock. Options A and B do not require this clarification.
- All other priorities are ungated.

## Pending Backlog

- vite/vitest CVE major bump (regression risk → dedicated session)
- main.ts hypertrophy refactor (multi-priority Standard batch)
- Continue-UI product decision on `loadFromLocalStorage`
- Per-symbol triage of 42 knip-flagged unused exports
- PRIME-AUDIT Δ7 (S36 deferred): voltkin-zap.png recompression if user notices style drift
- S38 audit Pass-3 candidates
- chateau-guardian CI audit (cross-project leverage)
- Node.js 20 deprecation in deploy.yml (auto-forced 2026-06-02)
- Client-side prediction rubber-banding UX polish
- NEW S44: Mid-session degraded-strategy teardown-restart (Council R2 follow-on)
- NEW S44: NIP-78 functional probe (HTTP-only currently via `npm run probe-relays`)
- NEW S44: Custom-relay URL field for tournaments (Grok G-NEW-3 deferred)

## Recent Reflexion (last 2 sessions)

### 2026-05-24 — Session 44 (BUG-CRITICAL-2 FIX SHIPPED + USER-SMOKE PASS for pairing; 3 NEW symptoms surfaced; BUG-CRITICAL-3 PDR drafted for S45; commit 6f412f3 + handoff dfd7f50)

- **#user-smoke-confirmed-bug-critical-2-pairing-restored-AND-exposed-deeper-bugs:** Multi-strategy fix worked exactly as designed — peers paired, snapshot sync flowing. BUT smoke surfaced 3 NEW symptoms (joiner cannot interact, no remote-avatar render, color identity). **Lesson: fixing a lower layer unmasks bugs in higher layers that depend on it. 8-session-overdue smoke wasn't hiding ONE bug, it was hiding a STACK. Pattern: when fixing a foundational bug, pre-draft state-discovery checklist for layer N+1.**
- **#council-r2-architectural-pivot-from-race-winner-to-multi-broadcast:** Council C4 race resolution was structurally race-prone. PRIME-AUDIT Δ2 alternative: keep ALL strategies active simultaneously, broadcast on every strategy, app-layer dedup via NETSNAPSHOT seq + INTENT timestamp + HELLO idempotency. Obsoletes race AND mid-session zombie in one design pivot. **Lesson: PRIME-AUDIT should ask "is there an architecture that makes this race condition not exist?" before accepting race-resolution refinement.**
- **#trystero-0-25-api-breaking-change-makeaction-shape-and-event-properties:** 0.24→0.25 makeAction returns object not 3-tuple; onPeerJoin/onPeerLeave are property assignments not methods. Type-driven refactoring caught the breaks immediately. **Lesson: run `tsc -b --noEmit` BEFORE testing when migrating across minor versions.**
- **#runtime-verifiability-via-preview-eval-beats-deploy-and-pray:** Used `preview_eval` in dev browser to dynamic-import NetTransport + call .connect + read getDiagnostics — confirmed nostr 7/7 + torrent 3/3 sockets attached BEFORE deploy. **Lesson: HTTP-protocol probes are insufficient for WSS endpoints; in-browser runtime probe is the right shape.**
- **#vite-inlines-dynamic-imports-when-flag-statically-true-no-lazy-chunk:** Vite inlined torrent dynamic-import into main bundle because the flag was statically derivable true. **Lesson: if lazy-load is critical for bundle budget, gate with non-static value (e.g. `import.meta.env.VITE_*`).**
- **#bundle-shibboleth-must-distinguish-upstream-defaults-from-our-config:** L4b shibboleth `damus.io:1` was upstream-package `defaultRelayUrls` fallback — overridden at runtime by our relayConfig. **Lesson: pair bundle-grep NEGATIVE shibboleths with runtime `import` probe of the config constant.**
- **#user-urgency-3-exclamations-authorized-full-tier-without-explicit-option-c-naming:** "fix all bugs! be thorough!" with 6 exclamation marks treated as `go` for most thorough option, with verbatim words preserved in Scope Amendment for auditability. **Lesson: URGENCY signals are ALSO `go` signals; anchor amendment in verbatim words.**
- **SESSION:** 10 files +1335/-287 LOC, commit 6f412f3, deploy run 26367307504 SUCCESS, 4-layer 10/10 PASS. ~80K tokens, ~$0.12 API spend. CLOSED on user 2-peer smoke (S35-P11 carry also closed simultaneously).

### 2026-05-24 — Session 43 (BUG-CRITICAL-2: P2P signaling broken — Trystero/Nostr relay decay diagnosed; PDR draft only)

- **#public-nostr-relay-ecosystem-is-decaying:** 3 of 6 production relays unusable (damus rate-limit, wine paid, band unreachable). **Lesson: free public infrastructure decays; needs redundancy budget + scheduled re-verification + per-relay observability.**
- **#trystero-0-24-torrent-mqtt-are-deprecation-stubs:** trystero@0.24 subpath exports are empty `export {}` stubs; real impls at `@trystero-p2p/*@0.25.0`. **Lesson: audit libraries at minor-version bumps for "stub remained, behavior moved" patterns.**
- **#user-demanded-state-discovery-before-asking-them-to-test:** **Lesson: any bug-PDR close-out MUST include reproduction transcript AND fix-verification transcript — user-retest becomes confirmation, not discovery.**
- **#s35-p11-7-sessions-overdue-cost-real-money:** **Lesson: USER-ACTION priorities deferred >2 sessions = urgent; >3 = blocker; codify into handoff skill auto-flagging.**
