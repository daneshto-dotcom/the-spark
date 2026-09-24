# PDR — S125 Batch: Host-migration v2 (zombie auto-rejoin) + F9 INTENT token-bucket

**Session:** S125 · **Tier:** Full (batch highest — protocol-adjacent migration + trust/security surface)
**Owner directive (verbatim):** *"work all carry forward and top recommended priorities that dont require my input in a super thorough batch in the best interests of this project and vision to be best of your abilities producing the highest quality best output possible!"*
**Plan file (this):** `.claude/plans/2026-07-19_PDR_S125_HostMigV2_F9_Batch.md`
**Baseline:** `642e200` (S124 CLOSED) · tsc 0 · vitest 1901/1901 · bundle 639.5/750 KiB

---

## Scope selection (A.0 state-discovery, done this session)

Carry-forward + recommended items filtered by "no owner input required" AND "in the project's interest":

| Item | Verdict | Why |
|---|---|---|
| Worker default-on flip | **EXCLUDE** | Gated on owner weak-device playtest |
| Bot-intelligence Phase A | **EXCLUDE** | Gated on owner `BOT_INTELLIGENCE_DESIGN.md` §7 answers |
| Deploy-path decision | **EXCLUDE** | Owner decision (Actions auto vs manual) |
| Bit-exact bot serialization | **EXCLUDE** | YAGNI (design-tagged: only if replay/spectator ships) — not in project interest to build speculatively |
| G1b MOTION verb | **EXCLUDE** | Council-deferred as low player-value ("visual noise w/o a mechanical verb"); playtest-gated |
| G2 family traits | **EXCLUDE** | Needs owner flavor pick + a LOCKED §6 amendment |
| **F9 INTENT token-bucket** | **INCLUDE (P2)** | "owner-gated" = *sequencing* (before public matchmaking), not an input gate; pure defensive hardening, engineering-only params |
| **Hostmig v2 zombie auto-rejoin** | **INCLUDE (P1)** | "owner-optional", fully buildable; natural technical follow-on to D4; reuses shipped machinery |

---

## P1 — Host-migration v2: zombie auto-rejoin-as-client

### OBJECTIVE
Replace v1's terminal CONNECTION-LOST overlay for a deposed **original** host with an automatic **rejoin-as-client** flow. A thawed/healed zombie host rejoins the ongoing match as a follower under the successor's epoch instead of being kicked to title. Closes LOCKED §13.21's documented "auto-rejoin-as-client = v2" path and HOST_MIGRATION_DESIGN §10 Q1.

### CURRENT STATE (verified, cites)
- `onDeposed: (claim) => demoteToClient(claim.epoch, null)` — [main.ts:770](src/main.ts). The `null` winner routes to the ZOMBIE branch ([main.ts:1240-1247](src/main.ts)) → `zombieDeposed = true`, nulls host latches; the loop ([main.ts:2133-2139](src/main.ts)) latches the terminal overlay.
- **Asymmetry:** the SUCCESSOR-path zombie (a survivor-turned-host later out-seated) ALREADY follows the winner via `demoteToClient(epoch, {peerId, seat})` ([main.ts:2019/2022](src/main.ts)). **Only the original host's `onDeposed` hardcodes terminal.**
- `connectAsClient` ([clientHandlers.ts:113-120](src/net/clientHandlers.ts)) lazily mints a fresh `ClientSync` and registers the client NETSNAPSHOT/INTENT handlers — the exact S82 reconnect machinery ([main.ts:2164-2165](src/main.ts)).
- Anti-grief already fences deposal: the original host is deposed ONLY when `hasPartitionEvidence()` holds ([hostHandlers.ts:350](src/net/hostHandlers.ts)) — i.e. it was genuinely frozen/partitioned, exactly the scenario where rejoin is correct.
- **Admission proven by construction:** `ClientSync.receive` gates on `(msg.epoch ?? 0) < currentEpoch` ([sync.ts:127](src/net/sync.ts)) + `snapshotSeq <= lastSeq` ([sync.ts:128](src/net/sync.ts)). A fresh ClientSync (epoch 0, seq 0) admits the successor's epoch-N (≥1) `MIGRATION_SEQ_JUMP`-based snapshot with no reset handshake. `setEpoch(newEpoch)` is pure hardening (fences the zombie's own residual epoch-0 frames).

### APPROACH (reuse-first, no new wire)
1. Introduce a `demoteAndRejoinAsClient(newEpoch, successor: {peerId, seat})` that composes the EXISTING teardown core + the EXISTING reconnect path:
   - Run the demote-core teardown (isHost=false, hostSync=null, hostSeats.clear(), terminate sim worker if any, `myClaim=null`, `migrationClaimedEpoch=-1`, `currentEpoch=newEpoch`).
   - Latch onto the successor: `hostPeerId = hostVerifiedPeerId = successor.peerId`, `latchedClaimSeat = successor.seat`.
   - `session.netTransport?.disconnect()` then `connectAsClient(clientJoinDeps, session.roomCode)` (mirrors [main.ts:2164-2165](src/main.ts)) → fresh transport + fresh ClientSync + client handlers.
   - `session.clientSync?.setEpoch(newEpoch)` (hardening; admission already holds).
2. Replace the terminal `zombieDeposed` latch with a **transient** `zombieRejoining` state: show the RECONNECTING overlay variant ("REJOINING…"), cleared when the first successor snapshot applies (`clientSync.lastAcceptedAt()` advances). Then the deposed host is a normal client; its seat self-heals via the successor's `BENCH_OFFLINE_PLAYER` rolling re-stamp on its next dispatched intent (same-page ⇒ same Trystero selfId, LOCKED §13.7).
3. Wire `onDeposed: (claim, fromPeerId) => demoteAndRejoinAsClient(claim.epoch, {peerId: fromPeerId, seat: claim.seat})` — `fromPeerId` is already supplied ([hostHandlers.ts:358](src/net/hostHandlers.ts)).
4. **Fail-safe:** if `session.roomCode === null` (never true for a warranted host, but total), fall back to the v1 terminal overlay.
5. Worker-mode zombie rejoins in DIRECT client mode (a mirror needs no worker; the isolate is already terminated in the core). Documented.
6. **No PROTOCOL_VERSION bump** — the claim already carries epoch+seat, snapshots already carry epoch; the change is local to the deposed host. (Council to confirm.)

### RISKS / EDGE CASES (for Council)
- **Split-brain:** the thawing zombie must stop broadcasting epoch-0 snapshots BEFORE rejoin — the core nulls `hostSync` synchronously (verify no async gap).
- **Transport re-entry race:** `disconnect()` → `connectAsClient` interaction with the S82 reconnect-cycle timers (`reconnectUntilMs`, `migrationCase`); must not double-fire.
- **Overlay flicker:** don't flash terminal then rejoin; single clean transition.
- **Deposal-then-successor-also-dies:** rejoiner is now a plain client → it participates in the normal ladder if the successor dies (no special-casing needed — verify).
- **Reset lifecycle:** `zombieRejoining` clears at match boundary alongside the S124 P1 resets ([main.ts:1525-1530](src/main.ts)).

### TESTING
- **Unit** (`hostmigV2.test.ts`, new): demote-and-rejoin transition (host teardown asserted + client posture + `setEpoch(newEpoch)` called + latches set to successor); `zombieRejoining` cleared on first accepted snapshot; fail-safe→terminal when roomCode null.
- **e2e** (extend `hostmigration.spec.ts`): kill host → successor takes over → original host "thaws" → auto-rejoins as client, follows successor world (PLAYING @ epoch N), overlay clears. `@quarantine-flaky` (real WebRTC, reconnect.spec precedent).

### ROLLBACK
Pure additive-flow behind the demote wiring; revert `onDeposed` to `demoteToClient(epoch, null)` + restore `zombieDeposed` terminal latch → exact v1. Single-commit revert.

---

## P2 — F9: per-peer INTENT token-bucket (trust hardening)

### OBJECTIVE
Bound a modified client's ability to flood the authoritative host `dispatch` (CPU-burn DoS). Closes AUDIT_S116 **F9** — the last unthrottled INTENT path — before public matchmaking. Grok's #3 highest-leverage trust item.

### CURRENT STATE (verified, cites)
Host validates INTENT *type* (`isClientIntentAllowed`) + *seat* (`stampOrReject`), plus a pre-verify flood guard — but **no rate limit** on dispatch frequency. Two host choke points: original host [hostHandlers.ts:292-322](src/net/hostHandlers.ts) and successor [main.ts:2034-2048](src/main.ts).

### APPROACH
- New **pure** module `src/net/intentRateLimiter.ts`: `IntentRateLimiter` with per-peer token bucket. `tryConsume(peerId, nowMs): boolean` (refill = elapsed·rate capped at capacity, consume 1, false if <1); `forget(peerId)` on leave; `reset()` at match boundary.
- Constants (`constants.ts`): `INTENT_BUCKET_CAPACITY` (proposed **60**) + `INTENT_BUCKET_REFILL_PER_SEC` (proposed **30**). Legit peak ≈ ≤20/s (avatar-pos already 10Hz-throttled [main.ts:1276](src/main.ts) + human-paced gameplay actions), so ~2s burst headroom while a flood (thousands/s) is dropped after the burst. Tunable; playtest can retune.
- Wire at the TOP of BOTH host INTENT handlers (cheapest rejection, before allowlist/stamp): `if (!limiter.tryConsume(peerId, performance.now())) { world.diagnostics.intentThrottled++; return; }`.
- New diagnostic counter `intentThrottled` (distinct from `raceRejects`) for observability/tests/forensics.
- Prune buckets on peer `leave` (onPeerChange) + at match reset.
- **Not simulation state** — host-only transport guard; wall-clock `performance.now()` is correct (a dropped INTENT is identical to a network drop; determinism unaffected). No wire change → **no PROTOCOL_VERSION bump**.

### RISKS / EDGE CASES (for Council)
- Capacity must clear the worst LEGIT burst (drag gestures + avatar-pos) — 60/30 leaves wide headroom; Council to sanity-check.
- Both host paths must share the limiter *instance/logic* (successor inherits).
- Memory: per-peer bucket pruned on leave.

### TESTING
- **Unit** (`intentRateLimiter.test.ts`): refill/consume/cap math; burst-then-throttle; refill-over-time recovery; per-peer isolation; `forget`/`reset`.
- **Integration:** a one-peer flood drops after the burst (`intentThrottled` climbs); a legit-paced stream fully passes.

### ROLLBACK
Delete the two guard lines + the module; no wire/state change. Trivial revert.

---

## GATES (both priorities)
tsc 0 · vitest green (+ new units) · bundle < 750 KiB · e2e hostmigration green · Rule-22 runtime audit.

## DELIBERATION — Full-tier 3-way Council (R1 + R2) + PRIME-AUDIT

**Seats:** Claude (Supervisor) · GROK-DISRUPTOR `grok-4.20-0309-reasoning` · GEMINI-AUDITOR `gemini-3.1-pro-preview`.

### R1 findings → code-verified triage
| # | Finding (seat, sev) | Verdict | Resolution |
|---|---|---|---|
| 1 | Transport disconnect→reconnect race / stale ClientSync handler (Grok CRIT, Gemini HIGH) | **OVERSTATED — refuted by precedent** | Identical synchronous pattern to the SHIPPED S82 auto-reconnect (main.ts:2164-2165, reconnect.spec.ts). Old transport is a HOST transport whose handlers self-gate on `isHost`/`hostSync` (now false/null) → inert; no NETSNAPSHOT path on it. `connectAsClient` registers handlers synchronously before `connect()`. **HARDENING ADOPTED:** explicit `session.clientSync = null` in teardown ⇒ provably fresh ClientSync. |
| 2 | ClientSync buffer contamination on reuse (Gemini MED) | **FALSE PREMISE for this path** | The ORIGINAL host never had a ClientSync (only `connectAsClient` mints one; the host path never runs it). Fresh mint = empty buffer. Belt-and-suspenders `clientSync=null` adopted anyway. |
| 3 | Successor-also-dies → ex-host "permanently demoted, can't re-ladder" (Grok HIGH) | **REFUTED by code** | Original host = **seat 0**, which `beginMatch` excludes from the warrant (`if e.seat===0 continue`); `computeClaimDelayMs` returns null for mySeat∉warrant (main.ts:1918-1926) ⇒ it provably CANNOT and SHOULD NOT re-claim. As a plain client holding `session.warrant` (survives demotion) it FOLLOWS the epoch+2 claim via the existing re-latch path. Not stuck. |
| 4 | Cascade traps UI in `zombieRejoining` (Gemini LOW) | **VALID — adopted** | Drop the terminal-style latch entirely for this path; after rejoin the ex-host is a plain client and the existing D4/S82 overlay state-machine (reconnecting→migrating→terminal) owns all subsequent display incl. cascade. + explicit cascade e2e. |
| 5 | Duplicated teardown core (Grok MED, quality) | **VALID — adopted** | Unify: `demoteToClient(newEpoch, winner\|null, { reestablishTransport })`. false = existing follow-winner (ClientSync kept); true = original-host rejoin (null clientSync + disconnect + connectAsClient + setEpoch). ONE core. |
| 6 | P2 priority-inversion — burst drops non-idempotent actions (Gemini MED) | **PARTIAL adopt** | Single bucket raised to **capacity 90 / refill 40/s** — worst legit unfreeze burst ≈ 30 pos (avatar-pos is 10Hz SENDER-throttled) + a few actions « 90, so a real placement is never starved. Log dropped intent TYPE (`intentThrottled`). Two-bucket QoS split documented as the v2 telemetry lever. |
| 7 | Test-adequacy vacuum for the races (both) | **VALID — adopted** | Add: cascade integration test (successor dies during rejoin), burst-at-refill-boundary + per-peer isolation + forget/reset unit tests, real-WebRTC rejoin e2e. |

### R2
Both seats reviewed the resolutions: **ALL HOLD, ZERO residual HIGH/CRITICAL, cleared for merge.** (Grok's incidental line/symbol citations treated as directional only — they don't match the actual symbols; Claude's own code reads are authoritative per the S124 #triage-against-exact-arithmetic calibration.)

### PRIME-AUDIT delta
- No CRITICAL survived triage — the 15th consecutive instance of external high-sev findings dying on exact mechanics (transport race = shipped precedent; "permanent demotion" = warrant-excluded seat 0 that correctly follows).
- Runtime-verifiability: the transport hand-off + cascade are validated by REAL-WebRTC e2e, not mock units alone (adopted). Bonus verified: the successor's existing peer-join **claim echo** (main.ts:2052-2053) re-teaches the term to the rejoiner at no cost.
- Carry-forward (unchanged from S124, still v1-accepted): asymmetric-partition rogue-solo-host known-delta (§13.21) — orthogonal to v2 (a deposed host that rejoins does not create it).

**CHECK plan:** Triumvirate on the raw diff after both priorities land.

### CHECK result (raw-diff, post-implementation)
Gates: tsc 0 · vitest **1914/1914** (+13: hostmigV2 3, intentRateLimiter 10) · bundle **640.8/750** KiB (+1.3). CHECK = RALPH (Claude) + GROK-ANALYST; GEMINI-AUDITOR timed out → 2-way per the Gemini-err protocol.
- **RALPH:** every symbol grep-verified; ordering confirmed (latch-to-successor set BEFORE `connectAsClient`, which preserves `hostPeerId`/`hostVerifiedPeerId` per its contract; `fenceRejoinEpoch` reads the fresh sync). CLEAN.
- **GROK-ANALYST HIGH** ("currentEpoch set before rejoin → fresh sync drops before setEpoch") — **REFUTED:** conflates `session.currentEpoch` (main bookkeeping) with the ClientSync's OWN private `currentEpoch` (sync.ts:110/127); `connectAsClient`→`fenceRejoinEpoch` is synchronous (setEpoch precedes any async frame); and a fresh sync admits epoch≥1 regardless (`1 < 0` false). 15th #triage-external-criticals-against-the-exact-arithmetic.
- **GROK-ANALYST MED** ("limiter stale tokens across migration") — **NON-ISSUE:** the limiter runs only on host paths; a demoted ex-host is a client that never consults it; it resets on re-host; the "shared instance" is per-page (two choke points), not cross-peer.
- **PRIME-AUDIT (runtime):** no unrendered placeholders, no hallucinated flags, no non-existent-file refs; the deposed-host rejoin survives a restart because it reuses the shipped S82 reconnect path; overlay owned by the existing state-machine. Zero residual HIGH/CRITICAL.
