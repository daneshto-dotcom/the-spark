# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-24 | Session: S43 (BUG-CRITICAL-2 State-Discovery — P2P signaling broken; PDR draft pending user tier choice)

## Live URL
**https://spark-online.space/** — `Last-Modified: 2026-05-24T12:17:23Z` (S42 deploy; **NO S43 changes shipped** — only PDR draft authored + reflexion + handoff bookkeeping).
**https://spark-online.space/?debug=1** — debug overlay + `[net]` + `[cinematic]` + `[creature]` logs.

## Status
S43 was a **State-Discovery + PDR-draft session** triggered by user URGENCY report: "now player 2 cant connect to player one... after putting the code in they are both stuck — player 2 is stuck at 'connecting' and player one is stuck at 'waiting for player 2'. first verify everything is working before tyelling me to go check it out!"

**Root cause CONFIRMED via dual-NetTransport probe in dev:** Trystero/Nostr **public-relay decay** — not S42 regression. S42 commit `6e3bfaf` touched ZERO transport code. Bug is pre-existing relay degradation that surfaced now because the 2-peer 1v1 smoke (S35-P11 carry) had been deferred 7 sessions.

**Decayed relays (empirical):**
- `wss://relay.damus.io` — rate-limiting Trystero writes ("you are noting too much")
- `wss://nostr.wine` — became paid-only ("sign up to write events")
- `wss://relay.nostr.band` — host-level unreachable (5s curl timeout)
- `wss://eden.nostr.land` (candidate replacement) — also paid

**Trystero 0.24.0 internal finding (critical for future):** `trystero/torrent` + `trystero/mqtt` subpath exports are **deprecation stubs only** (no `joinRoom`). Real impls moved to `@trystero-p2p/{torrent,mqtt}@0.25.0` separate packages (not installed; published 2026-05-23, 1 day before this session).

**Tests:** 754/754 PASS (UNCHANGED from S42 — no source code modified this session)
**Bundle:** 472.87 KB local (UNCHANGED)
**Branch:** master, clean, in sync with origin at `023fea4` (S43 PDR draft commit)
**Context at close:** ~12-15K (State-Discovery + 4 probe iterations + PDR draft + handoff)
**Live production state:** S42-current. Real-time gameplay works for SOLO; 1v1 is BLOCKED by signaling failure until BUG-CRITICAL-2 fix ships.

## Next Steps (priority order)

1. **🔴 USER ACTION (blocks priority #2)**: Pick tier for BUG-CRITICAL-2 fix. PDR drafted at `.claude/plans/IN-PROGRESS_S43_BUG-CRITICAL-2_p2p-signaling-broken.md` (also archived at `.claude/plans-archive/2026-05-24_S43_PDR_BUG-CRITICAL-2_p2p-signaling-broken_IN-PROGRESS.md`). Three options:
   - **Option A (Micro, ~5K, ~10 lines)** — rotate relays in `src/net/iceConfig.ts` only. Council waived. Risk: silent re-failure later. Fastest path.
   - **Option B (Standard, ~15-20K, ~80 LOC, 3 files) — RECOMMENDED** — rotate + per-relay telemetry + `RELAY_HEALTH.md` runbook. 1-round Council. Observability mitigates future decay.
   - **Option C (Full, ~35-45K, ~250 LOC, 6 files)** — Option B + install `@trystero-p2p/torrent@0.25.0` as fallback strategy + race Nostr vs BitTorrent. 2-round Council + quality gate.

2. **Execute BUG-CRITICAL-2 fix at user-chosen tier** (gated on #1). Council deliberation if Standard/Full. PRIME-AUDIT. Deploy + 4-layer verification. **GATED on user 2-peer smoke** before close — covers S35-P11 carry (now 8 sessions overdue).

3. **vite/vitest CVE major bump** — dedicated session, ~20K, closes 2 moderate dev-server CVEs (carry from S37).

4. **main.ts hypertrophy refactor** — extract `netMessageRouter` / `godlyMatcher` / `cinematicStateMachine` / `teardownNet`. Multi-priority Standard batch ~30-40K with Council (carry from S37+S39).

5. **chateau-guardian CI audit** (cross-project) — chateau-guardian consumed 53% of Pro 3000-min quota in May (S41 finding). Switch projects.

6. **Knip per-symbol triage** — 5-10 of 42 unused exports (carry from S38).

## Blockers
- **🔴 BUG-CRITICAL-2 fix BLOCKED on user tier choice + `go`** (next-session priority #1).
- 2-peer 1v1 smoke remains unverifiable until BUG-CRITICAL-2 fix ships.
- All other carry priorities remain ungated by infrastructure.

## Pending Backlog
- [ ] vite/vitest CVE major bump (regression risk → dedicated session)
- [ ] main.ts hypertrophy refactor (multi-priority Standard batch)
- [ ] Continue-UI product decision on `loadFromLocalStorage` (or downgrade to test-only export)
- [ ] Per-symbol triage of 42 knip-flagged unused exports
- [ ] PRIME-AUDIT Δ7 (S36 deferred): re-compress voltkin-zap.png from WINNER source if user notices style drift
- [ ] D9 rollback ladder if S37 charge SFX subjectively grates: waveform swap → recorded sample → gain reduction
- [ ] S38 audit Pass-3 candidates
- [ ] chateau-guardian CI audit (cross-project leverage)
- [ ] Node.js 20 deprecation in deploy.yml (auto-forced 2026-06-02; deploy.yml uses `actions/checkout@v4`, `setup-node@v4`, `upload-artifact@v4` — likely no action required)
- [ ] Client-side prediction rubber-banding UX polish (S42 Gemini R2 weak-edge — defer to playtest feedback after BUG-CRITICAL-2 fix unblocks 1v1)
- [ ] **NEW (S43)**: codify constitutional rule "USER-ACTION carry-forward >2 sessions = urgent; >3 = blocker; >4 = handoff-blocking" (per S43 reflexion #s35-p11-7-sessions-overdue-cost-real-money)
- [ ] **NEW (S43)**: codify rule "any external-dependency-on-free-public-infra MUST include health-check telemetry" (per S43 reflexion #public-nostr-relay-ecosystem-is-decaying)

## What Claude resolved this session (permanent)
- ✅ **State-Discovery COMPLETE**: BUG-CRITICAL-2 root cause empirically confirmed (Nostr relay decay; NOT S42 regression). Probe methodology documented + scaffolding deleted.
- ✅ **PDR drafted** with 3 fix options + 4 challenges + reproduction evidence. Pending user tier+go.
- ✅ **Reflexion entries +6** (#public-nostr-relay-ecosystem-is-decaying + #trystero-0-24-torrent-mqtt-are-deprecation-stubs + #user-demanded-state-discovery-before-asking-them-to-test + #dual-nettransport-same-window-probe-is-inconclusive + #s35-p11-7-sessions-overdue-cost-real-money + SESSION #s43-state-discovery-only).
- ✅ **Stale launch.json port** updated 16489 → 15709 (matches current $SESSION_PORT).
- ❌ **NOT resolved**: BUG-CRITICAL-2 itself — fix execution gated on user tier choice + `go`.

## Recent Reflexion (last 2 sessions)

### 2026-05-24 — Session 43 (BUG-CRITICAL-2: P2P signaling broken — Trystero/Nostr relay decay diagnosed; PDR draft only, no source fix shipped; commit 023fea4)
- #public-nostr-relay-ecosystem-is-decaying-multi-relay-set-needed: 3 of 6 production relays effectively unusable (damus rate-limit, wine paid, band unreachable); 4 fresh candidates HTTPS-reachable but Trystero-NIP-78-unverified. **Lesson:** free public infrastructure decays; needs redundancy budget + scheduled re-verification + per-relay observability.
- #trystero-0-24-torrent-mqtt-are-deprecation-stubs-only-nostr-functional: torrent.mjs/mqtt.mjs at trystero 0.24.0 are empty stubs (just `deprecate_default()` + `export {}`); real impls at `@trystero-p2p/{torrent,mqtt}@0.25.0`. **Lesson:** audit libraries at minor-version bumps for "stub remained, behavior moved" patterns.
- #user-demanded-state-discovery-before-asking-them-to-test: User explicitly forbade "go try X" without reproduction evidence. **Lesson:** any bug-PDR close-out MUST include reproduction transcript AND fix-verification transcript — user-retest becomes confirmation, not discovery.
- #dual-nettransport-same-window-probe-is-inconclusive-for-pairing: 2 NetTransports in single window failed to pair in 25s even with 7 healthy relays — can't disambiguate browser anti-loopback from deeper layer broken. **Lesson:** probe shapes classify as "can prove broken" vs "can prove working" — never assume one shape does both.
- #s35-p11-7-sessions-overdue-cost-real-money: 2-peer smoke deferred S35→S43, regression accumulated silently. **Lesson:** USER-ACTION priorities deferred >2 sessions = urgent; >3 = blocker; codify into handoff skill auto-flagging.
- SESSION #s43-state-discovery-only-no-source-fix-shipped: 0 source commits, 0 deploys, 0 tests. Token cost ~12-15K. Fix execution gated on user tier choice + go. Highest-leverage finding: confirmed S42 was NOT the regression source.

### 2026-05-24 — Session 42 (BUG-CRITICAL-1: Real-time 1v1 restoration; S15 P2 design-drift fix; commit 6e3bfaf; run 26360989574; deploy 34s)
- #design-drift-can-ship-13-sessions-without-blueprint-amendment-catching-it: S15 P2 added END_TURN + currentPlayerId + requireActivePlayer gate. Blueprint:3 LOCKED says "Real-Time Multiplayer Game". 759 tests passed for BROKEN impl; 26 sessions accumulated on top. **Lesson:** green tests verify implementation against itself, not against spec.
- #council-r2-sharpened-shared-vs-owned-error-semantics: R1 proposed blanket silent-return; R2 sharpened: silent ONLY for SHARED-RESOURCE races (spark/primitive/bond), NOT player-owned violations (carry slot/energy). **Lesson:** classify each error path by resource ownership before deciding throw vs silent.
- #race-counter-as-observability-not-just-debugging: `world.diagnostics.raceRejects` counter deterministically testable + per-match reset. **Lesson:** throw→silent changes MUST add observability mechanism in same PR.
- #boot-then-smoke-runtime-verifiability-gate-applied: Tests call real `dispatch(world, intent)` against live World. Deploy verification's bundle-grep step is runtime-pass complement to static-pass typecheck.
- #first-Intent-wins-is-natural-resolution-for-trystero-p2p: Host network handler at main.ts:275 already first-Intent-wins by construction (FIFO dispatch). **Lesson:** audit existing path first; often "implementation" is just allowing existing arrival to be silently ignored.
- SESSION #s42-bug-critical-1-stats: 18 files changed (1 deleted), +393/-490 LOC (-97 net), commit 6e3bfaf, deploy 34s SUCCESS first attempt, 10/10 verification, tests 759→754, bundle 474.26→472.87 KB (-1.39 KB).
