# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-29 | Session: S54

## Next Steps
1. **USER 2-peer cross-network smoke** on https://spark-online.space/?debug=1 — 5-10 min with a friend across networks. Verifies S52 (atomic PLACE_FROM_FREE + dragLock) + S53 (simplified RMB) + S54 (HELLO handshake doesn't regress connect). ~11 sessions overdue (S35-P11 + S49-S54 carry). BLOCKED on user having a friend available.
2. **Phase-2 next mechanic** (design call — user picks): D Inject Spiral / E Steal / A Fog of war / G Mega-combos / Anvil 2nd creature. This is the main forward-progress item; needs a user design decision.
3. **PROTOCOL_VERSION mismatch FULL E2E test** — now that S54 wired HELLO emission, a 2-bundle Playwright test (load v-current in one tab + a stubbed-older-protoVersion HELLO in the other) can finally assert the lobby shows the mismatch text + the drop latch. Was un-buildable pre-S54 (no producer).
4. **M3 — controls.test.ts foundation suite** (deferred S53 CHECK CARRY + S54): covers post-S53 P2 simplified RMB-down + LMB-up + Q-key onKeyDown paths.
5. **Sym F E2E flake fix** (smoke.spec.ts:256) — spun off as a task chip this session (failed-then-passed-on-retry in S53 AND S54; likely a joiner-places-3-prims spark-starvation race in test setup). Test-only fix, no game logic.

## Blockers
- **USER 2-peer smoke** — gated on the user having a friend across networks for a live test. Cannot be executed autonomously. ~11 sessions overdue.

## Pending Backlog
- [ ] Phase-2 next mechanic (design call: D / E / A / G / Anvil)
- [ ] PROTOCOL_VERSION mismatch FULL 2-bundle E2E test (now buildable post-S54 HELLO wiring)
- [ ] M3 controls.test.ts foundation suite (S53/S54 CHECK CARRY)
- [ ] Sym F territorial-block E2E flake fix (smoke.spec.ts:256) — spawned as task this session
- [ ] Targeted-send transport API for >2-player Phase-3 (S54 Council #7 DEFER — broadcast==targeted only for 1v1)
- [ ] main.ts 888-LOC hypertrophy trim (S52 carry)
- [ ] vitest 4.x major bump audit (S50 carry)
- [ ] Sym E rendering helper (S50 P5 carry)
- [ ] 48k Opus mp3 re-encode (S51 user choice)
- [ ] __TEST_RNG_SEED__ deterministic seam (S51 Council Δ1)
- [ ] ATTRACT_DRAG_POS host visibility of joiner drag at 10Hz (S52 Council Δ6)
- [ ] Phase-3 net (Colyseus / Geckos.io) for >2-player scalability (long-term)

## Recent Reflexion (last 2 sessions)

### 2026-05-29 — Session 54 (HELLO emission activates dormant S53 protocol-mismatch system + CHECK-CARRY G3/M4/M5)
- **#hello-emission-activates-dormant-s53-system**: wired the missing producer (buildHello + wireHelloOnJoin on both host/joiner via onPeerChange('join')). A "tested but never invoked" feature is a recurring trap — grep the SEND side, not just the parse side.
- **#wire-hello-at-join-not-connect**: send() broadcasts to connected peers, so emit on peer-join (peerCount>0), not connect (peerCount=0). Lobby-phase timing guarantees HELLO precedes snapshot/intent traffic — no readiness flag needed.
- **#both-sides-hello-required-overrule-grok-host-only**: host-side latch needs the joiner's HELLO to close the v2-bypass desync gap; a domain-expert vote on a false premise is overruled with the artifact, not conceded on weight.
- **#handlerawmessage-receive-seam-makes-latch-testable**: extracting the inbound closure to a public method made the latch path unit-testable without a live Trystero room (8 integration tests).
- **#grok-check-hallucination-pattern-recurs**: 4/4 Grok CHECK findings false on verification (3rd consecutive Grok phase). The fact-check rule saved 4 wasted fixes — weight Grok CHECK findings as hypotheses-to-verify.
- **#prime-audit-hello-arms-future-skew-only**: zero observable behavior today (pre-S54 peers emit no HELLO); first trigger is an S54+ peer meeting a future protoVersion-bumped peer. Forward-looking insurance, not a present-bug fix.

### 2026-05-27 — Session 53 (PROTOCOL mismatch UX latch + RMB ConnectDrag removal + §13.11 amendment)
- **#protocol-mismatch-ux-latch-shipped-as-dormant**: S53 built the latch/UX but discovered at close NO code sent HELLO → dormant. S54 closed this.
- **#per-peer-protocolmismatchpeers-latch-pattern**: Set<peerId> at transport boundary drops all subsequent messages from a mismatched peer; idempotent emit; cleared on disconnect + onPeerLeave.
- **#council-and-check-grok-hallucinations-pattern**: 4 Grok hallucinations of non-existent files/classes across R1+CHECK → always verify cited paths via Read/Grep before adopting.
