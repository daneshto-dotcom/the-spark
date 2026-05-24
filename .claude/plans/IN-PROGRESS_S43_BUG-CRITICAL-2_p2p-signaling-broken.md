# S43→S44 BUG-CRITICAL-2 — P2P Signaling Broken (Trystero/Nostr relay degradation)

**Status:** APPROVED — Option C (Full tier) LOCKED · Author: Claude S43, amended Claude S44
**Symptom:** User reports Player 2 stuck at "Connecting", Player 1 stuck at "Waiting for Player 2..." — `transport.onPeerJoin` never fires.
**Constitutional posture:** Scope Amendment to S43 (URGENCY protocol triggered + Rule 21 §A.0 State-Discovery completed).
**Blueprint contract at stake:** `SPARK_Blueprint.md:3` ("A Real-Time Multiplayer Game") + line 6 ("Phase-2 Tier-0 1v1 Trystero/Nostr networked SHIPPED").

---

## SCOPE AMENDMENT — S44 (2026-05-24, post-S43-handoff)

**User directive (verbatim, S44 turn 2):** "fix all bugs! make sure 1v1 wors as intended! real time red spark vs blue spark! no turn based crap. make sure both playrs can connect and play as intended! be thorough!"

**Interpretation:** URGENCY signal + "be thorough" + "fix all bugs" → Option C (Full tier, multi-strategy) per S43 PDR.

**Gate:** User-explicit `go` = direct authorization. Same-turn flag-write + execution permitted (CLAUDE.md PDR gate). `pdr_approved: true` + `deliberation_completed: true` (after Council R1+R2) + `unlock_source: user` written to session-state.json at both top-level and per-priority entries.

**Council:** MANDATORY 3-way (Claude+Grok+Gemini), 2 rounds + quality gate (Full tier).

**State-Discovery extension (S44, beyond S43):**
- `@trystero-p2p/torrent@0.25.0` ✅ confirmed on npm (published 2026-05-23 by `dmotz`, original Trystero author, MIT, ESM, depends on `@trystero-p2p/core@0.25.0`)
- `@trystero-p2p/nostr@0.25.0` ✅ confirmed (same publisher/date, depends on `@noble/secp256k1@^3.1.0` + `@trystero-p2p/core@0.25.0`)
- `@trystero-p2p/mqtt@0.25.0` ✅ confirmed (same publisher/date)
- `trystero@0.24.0` umbrella transitively installs `@trystero-p2p/nostr@0.24.0` — adding 0.25.0 directly creates version skew that Council must adjudicate (KEEP umbrella + mix? OR migrate fully to 0.25.0 explicit imports?)
- **Risk surfaced:** packages are 1 day old (published 2026-05-23, today 2026-05-24) → zero production miles, no community-reported issues, no time for npm warning-flag accumulation.

**Deferred to Council R1:** version-skew vs full-migration decision; MQTT inclusion necessity; multi-strategy peerId reconciliation design.

---

## STATE-DISCOVERY (Rule 21 §A.0) — COMPLETED

Empirical probes via dual-NetTransport in dev:

| Relay | Status | Evidence |
|---|---|---|
| wss://relay.damus.io | ❌ rate-limited | "you are noting too much" (continuous warnings during 12s probe) |
| wss://nostr.wine | ❌ paid-only | "restricted: sign up at https://nostr.wine to write events" |
| wss://relay.nostr.band | ❌ unreachable | curl timeout after 5s |
| wss://nos.lol | ⚠️ HTTPS-OK, WSS unverified | 200 OK in curl probe |
| wss://relay.mostr.pub | ⚠️ HTTPS-OK, WSS unverified | 200 OK |
| wss://purplerelay.com | ⚠️ HTTPS-OK, WSS unverified | 302 in curl probe |

**Candidate replacements probed:**
| Relay | Status |
|---|---|
| wss://nostr.mom | ✅ 200 OK |
| wss://offchain.pub | ✅ 200 OK |
| wss://nostr-pub.wellorder.net | ✅ 200 OK |
| wss://relay.primal.net | ✅ 200 OK |
| wss://eden.nostr.land | ❌ paid-only ("Pay on nostr.land for access") |
| wss://relay.snort.social | ❌ timeout |
| wss://relay.nostr.bg | ❌ DNS fail |
| wss://nostr.fmt.wiz.biz | ❌ timeout |

**Trystero 0.24.0 internal state (CRITICAL finding):**
- `trystero/torrent` and `trystero/mqtt` subpath exports are **deprecation stubs only** — runtime code is `deprecate_default("torrent", "@trystero-p2p/torrent")` then `export {}`. No `joinRoom`. Real implementations live in separate `@trystero-p2p/{torrent,mqtt,…}@0.25.0` packages (not installed; published 2026-05-23).
- Only `trystero/nostr` is functional in 0.24.0 — re-exports `@trystero-p2p/nostr@0.24.0` (transitively installed).

**S42 commit `6e3bfaf` did NOT touch any of: transport.ts / iceConfig.ts / lobbyScreen.ts join wiring / sync.ts.** Only protocol.ts allowlist (removed END_TURN). This bug is **pre-existing relay-decay**, surfaced now because the 2-peer smoke (S35-P11 carry, 7 sessions overdue) was finally attempted.

---

## OBJECTIVE
Restore working 2-peer 1v1 pairing on the live URL by replacing decayed/paid Nostr relays with a fresh working set, with defensive resilience against future relay decay.

## SCOPE — Three options for user decision

### Option A — MICRO (relay rotation only) — ~1 file, ~10 lines
- Edit `src/net/iceConfig.ts` NOSTR_RELAYS:
  - DROP: `relay.damus.io` (rate-limited), `nostr.wine` (paid), `relay.nostr.band` (unreachable)
  - KEEP: `nos.lol`, `relay.mostr.pub`, `purplerelay.com`
  - ADD: `nostr.mom`, `offchain.pub`, `nostr-pub.wellorder.net`, `relay.primal.net`
  - Final list: 7 relays (3 kept + 4 fresh)
- Add brief comment with date + rationale for rotation.
- Deploy + 4-layer verification.
- **Cost:** ~5K tokens. Council waived (Micro opt-out).
- **Risk:** 4 fresh relays unverified for Trystero NIP-78 compatibility; could replicate same failure with different relays.

### Option B — STANDARD (rotation + observability + fallback strategy) — ~3 files, ~80 lines
- Everything in Option A, plus:
- Add `transport.ts` relay-health telemetry — log per-relay accept/reject/connect-success counters on disconnect.
- Surface relay-failure summary in the lobby diagnostics strip (extends existing S39 P1 strip).
- Add a small `RELAY_HEALTH.md` runbook documenting "how to test relays" + the rotation date + criteria for next rotation.
- 1-round Council deliberation (Grok + Gemini parallel).
- Deploy + 4-layer verification.
- **Cost:** ~15-20K tokens.
- **Risk:** Same WSS-functionality risk as A; observability mitigates by surfacing the next failure faster.

### Option C — FULL (migrate to @trystero-p2p + add multi-strategy fallback) — ~6 files, ~250 lines
- Everything in Option B, plus:
- `npm install @trystero-p2p/torrent@0.25.0 @trystero-p2p/mqtt@0.25.0` (separate packages with real impls)
- Extend `transport.ts` to race Nostr + BitTorrent strategies, use first-to-pair
- Pin Trystero ecosystem versions (replace `trystero ^0.24.0` with explicit `@trystero-p2p/nostr 0.24.0` + new packages)
- 2-round Council deliberation (Grok + Gemini parallel; R2 quality gate).
- Deploy + 4-layer verification + 2-peer smoke before close.
- **Cost:** ~35-45K tokens.
- **Risk:** Higher integration surface; npm install introduces 2 new dep trees; cross-strategy peerId reconciliation needs careful design.

---

## CHALLENGES (3 minimum — applies regardless of tier)

1. **WSS-functionality vs HTTPS-reachability.** Curl probes confirm HTTP 200/302 but Trystero needs NIP-78 ephemeral-event write+subscribe. Fresh relays may pass curl yet reject Trystero writes. MITIGATION: Council R1 should request a NIP-78-specific probe before locking the relay list, OR accept the risk and rely on Option B/C observability to surface within ~30s of post-deploy.

2. **Browser anti-loopback in same-window probe.** My 25s dual-NetTransport probe with 7 healthy-no-rejection relays still showed 0 peers paired. Two possibilities: (a) Trystero/browser prevents same-window peer pairing (probe method limitation); (b) deeper layer also broken. CANNOT disambiguate without true 2-browser-process test. MITIGATION: 4-layer verification must include the user's real 2-peer smoke (which has been deferred 7 sessions — this fix is the right moment to close that loop).

3. **Relay decay is recurring not one-shot.** Damus/wine/band degradations were silent until exercised. Any rotation we ship today will likely decay again. MITIGATION (B/C only): observability + RELAY_HEALTH.md runbook so future decays are diagnosed in <30s, not 7 sessions.

4. **Source-comment-claimed "§11 LOCKED" vs absent blueprint section.** `transport.ts:4` claims "§ 11 LOCKED (post-S15): Trystero with Nostr-primary strategy" but `SPARK_Blueprint.md` has no §11 — only Phase-2 Tier-0 note in line 6. The S42 reflexion ("PDRs touching §LOCKED systems must cite blueprint lines") doesn't strictly apply, but the spirit does: code-internal "lock" comments are creating false constraint. PROPOSAL: either fold a §XII.6 amendment into Option C, or trim the misleading "§11 LOCKED" comment as a Δ1 PRIME-AUDIT row in Options A/B.

## TESTING

- `npm run typecheck` MUST be CLEAN.
- `npm run test` MUST be 754/754 PASS (no test should regress — relay constants change is config-level).
- Bundle size MUST stay <500 KB cap (relay-list change is sub-1KB).
- Deploy MUST succeed in <60s.
- 4-layer verification (dispatch → watch → curl Last-Modified → bundle grep for new relay names).
- **GATED on user 2-peer smoke** before closing the PDR — relay-list change cannot be validated without real 2-browser-process pairing.

## VERIFICATION GATE
10/10 shibboleths:
- POSITIVE (4): new relay names present in bundle: `nostr.mom`, `offchain.pub`, `nostr-pub.wellorder.net`, `relay.primal.net`
- NEGATIVE (3): dropped relay names absent from bundle: `relay.damus.io`, `nostr.wine`, `relay.nostr.band`
- POSITIVE (3, Options B/C only): new diagnostics field name, runbook file path, version-pin field

## ROLLBACK
- Revert iceConfig.ts to prior commit `6e3bfaf`.
- Re-deploy.
- Time-to-rollback: <2 min.

## RISK
- **Highest in Option C** (multi-strategy code paths × new packages × cross-peer reconciliation).
- **Lowest in Option A** (config-only, trivially reversible).
- **Sweet spot in Option B** (config + observability, no new deps).

---

## RECOMMENDED PATH
**Option B (Standard tier with 1-round Council).** Reasoning:
- Option A's risk (silent re-failure) costs another bug-hunt round trip — the value of observability >> cost of writing it.
- Option C's value (multi-strategy fallback) is real but speculative; Nostr-only path has worked before and may continue to with the right relay set. Risk-of-overengineering is non-trivial.
- Option B is the proven shape: minimum effective change + observability + runbook.

Council R1 will challenge this recommendation, especially around (1) WSS-functionality probe rigor, (2) whether to bundle a §XII.6 blueprint amendment, (3) whether observability should be silent telemetry or user-visible.
