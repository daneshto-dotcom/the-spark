# S195 PROGRESS — s195/net-mp (T20)

NEXT STEP: DONE — final report below; merge owner integrates (seams listed). Nothing in flight.

## FINAL REPORT (S195 T20 · s195/net-mp) — 2026-10-05
- **tip**: see `git log -1` (this commit); merge of `ccr-26eaab43-fa9mg3` = 03a4ca3a, clean (no conflicts; it moved smoke.spec's
  LOCAL_PROTO_V 67→68 and protocol.ts — not mine).
- **Gates (merged tree, exit codes in .tmp-gates/)**: `npm run typecheck` **0** (tc-final) · `npx vitest run --maxWorkers=2`
  **1** (vitest-full: 583 files passed / 1 failed / 5 skipped; 8854 tests passed / 1 failed / 12 skipped) — the one red is
  `src/state/endgameAudit.test.ts:325` **`Test timed out in 20000ms`** while `npm run build` ran beside it; re-run alone →
  **0**, 18/18 (vt-endgame; the test itself takes ~15 s of its 20 s cap). Verdict: timeout-only under load, not my file
  (src/state, from the merge) — BENIGN, recorded. `npm run build` **0**: entry **1186.7 KiB** (cap 1250, headroom 63.3) vs the
  integration branch rebuilt here **1186.3 KiB** → **+0.4 KiB** (the B-13 branch + one import; the DEV relay override folds
  away). `src/ci.e2eLanes.test.ts` 20/20 (vt-lanes3). e2e ran on **Chromium 1194** (the container build).
- **Bump verdict: NO.** Nothing on the wire changed: `rejoinAttemptInFlight` is a render/policy decision on local episode
  state; the TURN text is a runbook; the relay override is DEV-only. Two builds that shake hands compute the same world.
- **Hard-blip root cause (item 1) — MEASURED, NOT THE TTL LOCK**: spec RED here 41.5 / 28.4 / 53.3 s (CI 37047025269: 37.5 s).
  Two traced runs (RTCPeerConnection tracer on both pages + the local relay's message trace, .tmp-gates/hardblip-trace.log,
  relay-trace.log): the single attempt's handshake COMPLETED — no `after exchanging SDP`, no answering/offerAnswered reset,
  no second handshake. Budget: joiner loss detection 1.4–4.6 s (`pc.close()` fires no local connectionstatechange; the
  datachannel close event does) · 1 s first retry · leave→connect handoff 2.7–5 s (transport.ts `pendingLeaves`) · ≤5.3 s to
  the other side's next announce · **5–10 s per signalling hop of page-side processing** (relay delivered in ms) · ICE +
  Trystero handshake 2–8 s. A FRESH join here is 15–25 s vs the 6.3 s the docblocks quote. T8's TTL suspect: NOT reproduced
  (remains S192's desktop explanation for the 23–33 s cluster). No transport.ts hunk is owed by this evidence; the
  player-facing half is B-13. Spec stays quarantined (`e2e/reconnect-hard-blip.spec.ts` header records all of this).
- **B-13 (item 2) BUILT**: `planConnectionFrame` keeps `'reconnecting'` past the grace while `rejoinAttemptInFlight`
  (derived from `reconnectUntilMs`/`nextRetryMs` — no main.ts field), countdown = give-up remainder; terminal only at
  `RECONNECT_GIVE_UP_MS`. Host + migration paths unchanged. connectionFrame.test: 2 re-pins + 8 B-13 cases (loss →
  RECONNECTING; in flight past grace → RECONNECTING; success at 25 s → cleared; give-up → TERMINAL; host / migration /
  no-room-code negatives; the derivation frame-exact). Overlay heading text unchanged (owner: "keep RECONNECTING…");
  rule documented at `setReconnecting`.
  ⚠ MINE: "demonstrably in progress" = an attempt fired and not yet superseded (`RECONNECT_RETRY_MS`) or given up; there is
  no per-attempt failure signal in the plan, so a client reads RECONNECTING up to 3 min. Recommend: accept; lever =
  `RECONNECT_GIVE_UP_MS`. ⚠ MINE: past the grace the countdown shows the give-up remainder (jumps 0 → ~165 s at 15 s).
- **TURN re-paste (item 3)**: `TURN_SETUP.md` § "⭐ 2026-10-05 (S195 T20) — THE RE-PASTE" — exact unwrapped
  `VITE_TURN_URLS` = `turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp`,
  username/credential as placeholders; `iceConfig.test.ts` "S195 T20" reads that row from the runbook: parses with NO note,
  4 urls, every url browser-valid; the wrapped live shape still unwraps (noted). Owner action; agents paste nothing.
- **Per-spec verdicts (item 4/5)** — all run HERE over the local relay (`VITE_TEST_NOSTR_RELAYS`), Chromium 1194, 4 cores shared:
  · **Sym F** = STALE HARNESS (ported): waited `freeSparks >= 8` (no free-spark opening since S192) + bare quarry `dragSparkTo`
    on the host (porch source since S136) under the 60 s cap → red 1.1 min every run. Ported like Sym A/C/G (pullFromBank +
    asserted pick). Ported run with a 240 s budget still red here ×2 (Sym A — already ported, green on the desktop — is
    also red here at 4.1 min: the box cannot form + build in time) → **port verified only by construction; NOT RUNNABLE
    HERE for a verdict on the port**. Its `TWO_PEER_BUILD_BUDGET_MS` is HELD BACK (see seams).
  · **Sym I** = STALE HARNESS (ported): win bar 3 vs STARTING_VICTORY_POINTS 100 → instant WIN (the S192 nplayer finding),
    `freeSparks >= 8`, quarry anchors that never fed the win; now bar 1e6, injected scoreByPlayer + scoreProgress, WIN|POSTGAME.
    Red here at the 60 s cap with the HOST still in LOBBY (no peer in 60 s) → budget, NOT RUNNABLE HERE for a verdict.
  · **hostmigration:29** = TIME BUDGET: 240 s here and on CI (4.1 min both); the CI log shows `MIGRATION TAKEOVER complete`,
    `MIGRATION accepted — re-latched host` BEFORE the cap. Tests :130/:216 (same 3-mesh, 360/300 s) PASSED on CI at 5.0/4.5
    min. Recommend `test.setTimeout(300_000)` on :29 — needs the quarantine cap +60 s (e2e.yml, ci-perf) → seam.
  · **exit-match:173** = TIME BUDGET / FLAKE CLASS: CI red ×2 at the 60 s cap with `no RTCPeerConnection yet`, PASSED retry #2
    at 59 s; here red at 60 s. Not STUN.
  · **join-stall:85/109** = TIME BUDGET: CI :109 red ×3 at `Test timeout of 60000ms` while retry #2's console already carried
    the JOIN STALLED line; :85 PASSED at 58.6 s. Here both red at the 60 s cap. `Binding request timed out` appears in EVERY
    test's browser log incl. passing ones (+ `global.stun.twilio.com -105`, IPv6 sendto) → NOISE, not the cause.
  · **nplayer late-4th** = TIME BUDGET: `Test timeout of 330000ms exceeded` ×2 on CI (no assertion failed). Not run here
    (4 pages on this box cannot finish; 2 pages take 40–60 s to connect).
  → **Item 5 decision: CI-slowness, NOT CI-network.** A TURN/relay-only path would not help (the pairs connect; the clock
    runs out). The lobby grep stays as is (the tests belong gating); **e2e.yml untouched**, `ci.e2eLanes` green.
- **Seams for the merge owner / T21 (ci-perf owns e2e.yml)**: (a) e2e-lobby: the four 2-peer tests need a 120 s budget
  (`test.setTimeout(LOBBY_2PEER_BUDGET_MS)` in join-stall ×2, exit-match MP, S46 Baseline) ⇒ lane needs 3 × (330 + 4 × 120) =
  2430 s ⇒ `PW_GLOBAL_TIMEOUT_MIN 29 → 41`, `timeout-minutes 37 → 49`, and `ci.e2eLanes` DEFAULT_TEST_TIMEOUT_MS re-pinned to
  read the constant; (b) e2e-quarantine: Sym F + Sym I at TWO_PEER_BUILD_BUDGET_MS (+360 s) and hostmigration:29 at 300 s
  (+60 s) ⇒ sum 3120 s ⇒ `PW_GLOBAL_TIMEOUT_MIN 46 → 52`, `timeout-minutes 54 → 60`, then the two timeout lines in smoke.spec
  (the spots are marked "S195 T20 — NO TWO_PEER_BUILD_BUDGET_MS timeout here YET"). I did NOT land either half-way: the
  lane pin re-derives the caps from the specs and would have gone red.
  (c) No transport.ts hunk owed. (d) `src/net/devRelayOverride.ts` + `scripts/live-mp/local-nostr-relay.mjs` are the
  cloud harness — documented in both; safe in prod by `import.meta.env.DEV`.
- **NOT DONE (environment)**: public relays unreachable — `npm run probe-relays` 0/6 `Received network error or non-101
  status code` (proxy carries no WebSocket upgrade; README "Not supported"); torrent trackers `Establishing a tunnel via
  proxy server failed` / gateway 403; STUN UDP blocked (gathering never completes; mDNS host candidates only). Worked
  around with the local relay for signalling; the box's speed (not the network) is what keeps the multi-page specs red here.


## Log
- merged ccr-26eaab43-fa9mg3 (1c5ce299) clean.
- ENVIRONMENT: `npm run probe-relays` → 0/6 relays answer a WebSocket handshake ("Received network error or
  non-101 status code") — /root/.ccr/README.md: WebSocket upgrades are NOT supported through the agent proxy.
  Every real-relay spec is therefore unrunnable here as shipped. Exit code 0 (the probe reports, never gates) —
  .tmp-gates/probe-relays.{log,exit}.
- ba543ca6 TURN re-paste (TURN_SETUP.md § "2026-10-05 (S195 T20) — THE RE-PASTE") + iceConfig.test "S195 T20" (reads the row from the runbook) +
  local relay harness: scripts/live-mp/local-nostr-relay.mjs (NIP-01 subset over `ws`, RELAY_TRACE=<file> traces signalling),
  src/net/devRelayOverride.ts (VITE_TEST_NOSTR_RELAYS, `import.meta.env.DEV` only; own module so ci.deployGate's
  "every env.VITE_* in iceConfig.ts is passed by deploy.yml" contract is not widened). With it the real-WebRTC specs RUN here.
- 34a5692e B-13: planConnectionFrame keeps 'reconnecting' past the grace while `rejoinAttemptInFlight` (derived from
  reconnectUntilMs/nextRetryMs — no main.ts change); terminal only at RECONNECT_GIVE_UP_MS. connectionFrame.test re-pinned
  (2 assertions) + 8 new B-13 cases. ⚠ MINE: "failed" = superseded by the loop or the give-up.
- HARD BLIP measured HERE (local relay, Chromium 1194, 4-core box shared by trees): recovered 41.5 / 28.4 / 53.3 s. Two
  traced runs (RTCPeerConnection tracer on both pages + relay trace): the FIRST and only attempt's handshake completed —
  no `after exchanging SDP` error, no offerAnswered/answering reset, no second handshake. Time went to: joiner loss
  detection 1.4–4.6 s (pc.close() fires NO local event; the datachannel close event does) · 1 s first-retry delay ·
  leave→connect handoff 2.7–5 s (transport.ts pendingLeaves) · waiting for the next announce ≤5.3 s · then each
  signalling hop (offer, answer, candidates) took 5–10 s to be PROCESSED by the receiving page (relay delivered in ms) ·
  ICE + Trystero handshake 2–8 s. The pre-blip FRESH join on this box took ~15–25 s vs 6.3 s on the desktop, so the
  box is ~3× slower; CI run 37047025269 measured attempt 5.07 s → recovered 37.5 s. T8's TTL-lock suspect is NOT what
  these traces show; it remains the S192 desktop explanation for the 23–33 s cluster.
- CI lobby reds (run 37047025269, job 110970878012, read via GitHub MCP): join-stall:109 = `Test timeout of 60000ms
  exceeded` ×3 while retry #2's console already carried the JOIN STALLED line; join-stall:85 PASSED at 58.6 s;
  exit-match:173 red ×2 at the 60 s cap with `no RTCPeerConnection yet` at 10 s, PASSED on retry #2 at 59 s;
  nplayer:140 `Test timeout of 330000ms exceeded` ×2. `Binding request timed out` appears in EVERY test's browser log,
  passing ones included (plus `Failed to resolve global.stun.twilio.com -105`, IPv6 sendto ERR_ADDRESS_UNREACHABLE) → NOISE.
  VERDICT: CI time budget (a 2-peer join takes 40–60 s on the runner), NOT STUN. A relay-only path would not help.
