# PDR — S53: Protocol-Mismatch UX Diagnostic + RMB ConnectDrag Dead-Code Cleanup

**Session:** S53
**Date:** 2026-05-26
**Tier:** Standard (3-way Council R1 + PRIME-AUDIT mandatory)
**Status:** REVISED post-Council R1 — pending user `go`
**Source priorities:** S52 CHECK Triumvirate carry-forward stack (HIGH + MED)

---

## A.0 STATE-DISCOVERY GATE (CONSTITUTIONAL Rule 21)

External-state claims empirically probed before locking:

| Claim | Probe | Result |
|---|---|---|
| CI E2E + Deploy GREEN at last source HEAD | `gh run list --workflow=...` | SUCCESS at `f4b516d` (4m41s E2E, 51s Deploy) ✓ |
| `PROTOCOL_VERSION = 3` exported from `src/net/protocol.ts` | `Read protocol.ts:32` | confirmed (literal `3 as const`) ✓ |
| HELLO with bad protoVersion returns null (silent) | `Read protocol.ts:193-198` | confirmed (`if (obj.protoVersion !== PROTOCOL_VERSION) return null`) ✓ |
| `lobbyScreen.setErrorMessage(text)` exists | `Read lobbyScreen.ts:572-577` | confirmed (renders red text over status line) ✓ |
| RMB ConnectDrag unreachable post-S52 P1 | trace LMB-up dispatches PLACE_FROM_FREE atomic; no controls.ts site dispatches PICKUP_SPARK | confirmed — player.kind never reaches `'Carrying'` via local input ✓ |
| `controls.test.ts` test file | `ls src/input/` | does NOT exist — no controls-specific tests to update ✓ |
| `pickPrimitive()` wrapper call sites | grep `controls.ts:266, 289` | both inside ConnectDrag branches → dead after removal ✓ |
| existing `onLobbyError` callback pattern in main.ts | `Grep main.ts:302-305` | confirmed (`(errMsg) => lobbyScreen.setErrorMessage(errMsg)`) ✓ |
| `structureRenderer.ts:175` ConnectDrag-render branch | `Grep structureRenderer.ts:175` | confirmed (`if (controls.kind !== 'ConnectDrag') return;`) ✓ |

A.0 PASS. No state-vs-claim DELTAs.

---

## OBJECTIVE

Close the S52 CHECK Triumvirate carry-forward stack:

1. **P1 (HIGH)** Surface explicit "Protocol mismatch — please refresh" UX when an old-build peer (protoVersion ≠ 3) sends HELLO. Current behavior: silent null-reject + console warn; user-visible symptom is the generic "Connection lost" overlay or a frozen lobby (depending on timing).

2. **P2 (MED)** Remove the unreachable RMB ConnectDrag code path that S52 P1's atomic PLACE_FROM_FREE deprecated. Preserves RMB-down SEVER_BOND (which S52 P2 just amended) — the only remaining RMB behavior.

3. **P0** Verify CI green at HEAD (already executed in pre-flight).

Optional **P3** (Scope Amendment): fix LOCKED §13.11 documentation drift — the PRIME-AUDIT B body text (lines 689-695) still describes pre-S52 cycle-no-consume semantics despite the S52 P2 amendment.

---

## SCOPE

### P0 — CI verification (DONE, 0 LOC)

- E2E (2-browser harness) at `f4b516d`: SUCCESS (4m41s, run 26460853980)
- Deploy to GitHub Pages at `f4b516d`: SUCCESS (51s, run 26460853974)
- Commits since (`e529c4e`, `dc1f57a`, `bc273ed`) are doc/state-only → no CI rerun needed
- Result: GREEN

### P1 — Protocol-mismatch UX diagnostic + per-peer latch (~50 LOC add, post-Council R1 BLOCKER)

**src/net/transport.ts** (+~30 LOC)
- New public callback: `public onProtocolMismatch: ((peerVersion: unknown) => void) | null = null;` (signature accepts `unknown` because mismatch can include missing/wrong-type protoVersion per Gemini #4)
- New private field: `private protocolMismatchPeers: Set<string> = new Set();` (per-peer latch addressing CONVERGENT BLOCKER Grok #4 + Gemini #2)
- New private emitter: `private emitProtocolMismatch(peerId: string, v: unknown): void { this.protocolMismatchPeers.add(peerId); console.warn('[net] protocol mismatch peer=' + peerId + ' v=' + String(v) + ' local=v' + PROTOCOL_VERSION); if (this.onProtocolMismatch !== null) this.onProtocolMismatch(v); }`
- In `onMessage` handler, after `JSON.parse`:
  - **First check**: if `protocolMismatchPeers.has(ctx.peerId)` → `this.rejectedCount++; return;` (drop all subsequent messages from banned peer)
  - **Inline type-guard** (Gemini #5 PARTIAL): `const isHelloLike = (o: unknown): o is { kind: 'HELLO'; protoVersion: unknown } => o !== null && typeof o === 'object' && (o as { kind?: unknown }).kind === 'HELLO';`
  - If `isHelloLike(parsed) && parsed.protoVersion !== PROTOCOL_VERSION` (loosened predicate per Gemini #4 — missing/wrong-type counts as mismatch) → `emitProtocolMismatch(ctx.peerId, parsed.protoVersion); return;` (early-return per Gemini #3 — don't fall through to parseNetMessage)
- Cleanup: in `disconnect()` clear `protocolMismatchPeers.clear()`
- Import: `import { parseNetMessage, PROTOCOL_VERSION, type NetMessage } from './protocol.ts';` (PROTOCOL_VERSION currently not imported)

**src/main.ts** (+~5 LOC)
- Inside the existing `netTransport` wire-up block (near `onLobbyError`), add:
  ```ts
  netTransport.onProtocolMismatch = (peerVersion) => {
    lobbyScreen.setErrorMessage(
      `Protocol mismatch — your version is out of date (peer v${String(peerVersion)}, you v${PROTOCOL_VERSION}). Please refresh.`,
    );
  };
  ```
- Import PROTOCOL_VERSION from protocol.ts

**src/net/transport.test.ts** (+~20 LOC, ~5 new tests)
- Test 1: HELLO with protoVersion=2 → onProtocolMismatch fires with `2`, peerId added to ban set
- Test 2: HELLO with protoVersion=3 (matching) → onProtocolMismatch NOT fired
- Test 3: HELLO with missing protoVersion → onProtocolMismatch fires with `undefined` (loosened predicate)
- Test 4: AFTER mismatch detected, subsequent INTENT from same peerId → silently dropped, rejectedCount++ (CONVERGENT BLOCKER fix)
- Test 5: non-HELLO message → onProtocolMismatch NOT fired

### P2 — RMB ConnectDrag dead-code removal (~80 LOC net removal)

**src/input/controls.ts** (-60 LOC)
- Remove `ConnectDrag` variant from `ControlState` union (lines 105-110)
- Simplify RMB-down branch (lines 258-278): drop the `if (player?.kind === 'Carrying') { ConnectDrag init }` branch entirely. SEVER_BOND path becomes the unconditional RMB-down behavior (still gated by `pickBond() !== null`).
- Remove `onMove` ConnectDrag branch (lines 285-291)
- Remove `onUp` ConnectDrag branch (lines 399-422)
- Remove `private pickPrimitive()` wrapper (lines 510-512) — only callers were inside ConnectDrag handlers
- Rewrite header docstring (lines 4-15) to reflect post-S52 model:
  ```
  *   LMB-down: AttractDrag if cursor over free spark (force toward cursor)
  *   LMB-up: atomic PLACE_FROM_FREE — spark becomes Primitive at cursor,
  *           auto-bonds to nearest in-range primitive (rejected silently if
  *           in spawner zone / enemy territory / out of reach).
  *   RMB-down on bond → SEVER_BOND (1 disruption charge in 1v1, cross-color only).
  *   Q key (1v1 PLAYING): SHRINK_TERRITORY disruption (1 charge).
  ```
- Drop ConnectDrag from `onLostCapture` comment (line 426)

**src/render/structureRenderer.ts** (-~10 LOC)
- Remove `if (controls.kind !== 'ConnectDrag') return;` line 175 and the subsequent ConnectDrag-targeting render block (whichever lines render the highlight on the would-be bond target during drag)

**src/state/placeFromFree.ts** (comment updates, ~0 net LOC)
- Lines 42, 116: drop "ConnectDrag RMB path" references

**src/net/protocol.ts** (comment update, ~0 net LOC)
- Line 28: drop "legacy handlers preserved for the RMB ConnectDrag path" clause. PICKUP_SPARK + PLACE_PRIMITIVE remain in the allowlist (`KNOWN_GAME_ACTION_TYPES_RECORD` lines 141-143) because `placeFromFree.ts:fsmPickup` dispatches PICKUP_SPARK internally during atomic execution.

**src/main.ts** (line 334 HUD text rewrite)
- Current: `'LMB drag spark out of zone → carry · RMB drag onto a primitive → bond · ~ stats · C cinematics'`
- New: `'LMB drag spark → place · RMB on bond → sever · Q shrink territory · ~ stats · C cinematics'`

### P3 — LOCKED §13.11 doc-amendment fix (OPTIONAL, ~10 LOC, USER DECIDE)

**LOCKED_DECISIONS.md** (lines 689-708)
- Add S52 P2 amendment block with strikethrough-style annotation preserving historical text
- Body to clarify: every hostile sever now costs 1 charge regardless of cycle topology; self-sever (placerColor match) is the only 0-cost path
- Test-coverage line already reflects rename ("cycle-consume — S52 P2 amendment renamed from cycle-no-consume" at line 703)

---

## APPROACH

**P1 pre-check pattern**: detect protocol mismatch BEFORE `parseNetMessage` rejects to null. Avoids changing parseNetMessage signature (which would ripple into 9+ test files + protocol.test.ts). Tight predicate (`typeof v === 'number' && v !== PROTOCOL_VERSION`) avoids false-positive UX on generic malformed HELLO. UI message is set-not-toggle so duplicate-callback fires (e.g. retransmits across multiple transport strategies) are idempotent.

**P2 static elimination**: walk the dead chain from `ConnectDrag` union variant outward. TypeScript type-narrowing will surface dead branches at compile-time after the variant is removed. SEVER_BOND preserved by keeping the `else`-branch logic (post-simplification: `else if (e.button === 2) { pickBond + SEVER_BOND }`). HUD text rewrite is the only user-visible change beyond the absence of an unreachable code path.

---

## RISKS

**P1**
- **R1** Missing/wrong-type protoVersion → loosened predicate (Gemini #4 ADOPT) treats as mismatch and fires callback with `undefined`/non-number. UI string-coerces. **SAFE**.
- **R2** HELLO with matching version but corrupt other fields → predicate doesn't fire, parseNetMessage rejects on `playerId`/`color`. **SAFE**.
- **R3** Multi-strategy fan-out — same v2-peer HELLO arrives via Nostr + Torrent → first delivery sets peer ban + callback fires; second delivery dropped at the ban-set check (idempotent). **SAFE post-revision**.
- **R4** ~~v2 peer can still send INTENT(PICKUP_SPARK) after failed HELLO~~ — **RESOLVED post-Council R1**: per-peer protocolMismatchPeers latch drops ALL subsequent messages from a peer once any HELLO mismatch is detected. INTENT/NETSNAPSHOT/GODLY_TRIGGER all blocked at transport boundary, rejectedCount++. **NEW R4b**: latch is per-peerId, so a peer leaving and rejoining with a new peerId starts fresh — naturally correct since the new HELLO re-checks. **SAFE**.

**P2**
- **R5** Hidden test references to ConnectDrag — grep verified zero outside controls.ts source. structureRenderer.test.ts + hotkeys.test.ts (Grok #3 hallucinated references) do NOT exist. **SAFE**.

- **R6** placeFromFree.ts:fsmPickup dispatches PICKUP_SPARK internally → player.kind=Carrying momentarily WITHIN atomic execution. Frame-scoped, never exposed to input handlers between physics + render frames. **SAFE** (atomic guarantee).
- **R7** ~~v2-peer mid-deploy injection~~ — RESOLVED via R4 latch (same fix covers both).
- **R8** HUD text mentions Q (S49 Sym F) — controls.ts:437-446 confirms Q-key bound. **SAFE**.
- **R9** Missing controls.test.ts foundation (Gemini #1 BLOCKER softened to PARTIAL): no direct unit-test of input handlers. Mitigation: existing world.test.ts + placeFromFree.test.ts exercise the dispatch path via reducer calls. Post-P2 grep `ConnectDrag` across `src/**` must return zero hits (PR gate). Full controls.test.ts suite → S54 carry. **ACCEPTABLE**.

**P3 (optional)**
- **R10** Doc-only edit; zero runtime risk. Match existing strikethrough convention in §13.x amendment history.

---

## TESTING

**Baseline**: `npm test -- --run` (S52 close: **815/815 passing**, bundle **499.60 KB / 500 KB charter — 0.40 KB headroom**)

**P1 validation**:
- 3 new unit tests in transport.test.ts (callback fires only on number-protoVersion-mismatch HELLO)
- tsc clean

**P2 validation**:
- Existing 815 tests remain green
- Bundle size delta: target -1 to -3 KB (RMB ConnectDrag drop is meaningful LOC) — buys back the 0.40 KB headroom
- tsc clean
- `grep ConnectDrag src/**` post-removal must show 0 hits (assert no stragglers)

**Post-handoff manual smoke (deferred to user — gated)**:
- 2-peer cross-network: confirm (a) old-build → new-build sees "Protocol mismatch" red text; (b) LMB drag/place still smooth (regression); (c) RMB on bond severs (1 charge in 1v1)

---

## ROLLBACK

Per-priority single-commit revert. P1 + P2 land separately (different concerns), each `git revert <SHA>` recoverable. State-autocommit chain preserves intermediate boundaries.

---

## LOC ESTIMATE

| Priority | Add | Remove | Files | Notes |
|---|---|---|---|---|
| P0 | 0 | 0 | 0 | verification only |
| P1 | +50 | 0 | 3 | transport.ts (+30 — latch + type-guard + early-return), main.ts (+5), transport.test.ts (+15, ~5 tests) |
| P2 | +0 | -80 | 5 | controls.ts, structureRenderer.ts, placeFromFree.ts, protocol.ts, main.ts |
| P3 (opt) | +15 | -5 | 1 | LOCKED_DECISIONS.md |
| **Total** | **+50 (+65 w/ P3)** | **-80 (-85 w/ P3)** | **~6** | net -30 to -35 LOC |

Expected token spend: ~22-30K (Standard tier batch with Council R1 + CHECK Triumvirate).

---

## COUNCIL R1 DELIBERATION CHALLENGES (≥3 required, ≥1 tool, ≥1 quality)

1. **(QUALITY)** Should `onProtocolMismatch` ALSO fire on missing-protoVersion HELLOs (treating absence as "ancient peer")? Current draft requires `typeof v === 'number'`. Tight scope = no false-positives but misses very-old peers; loose scope = noisy. **RECOMMEND tight**.

2. **(TOOL/SCOPE)** Should the UI message text include the peer's reported version number? Current draft yes (`(peer v${peerVersion}, you v${PROTOCOL_VERSION})`). Helps debugging during mid-deploy windows. Could leak info but P2P signaling = no realistic adversarial concern.

3. **(SCOPE)** Should P3 LOCKED §13.11 doc-amendment bundle with the P1+P2 commit, ship as a separate commit, or defer to S54? Doc churn vs. closeout completeness tension.

4. **(CORRECTNESS)** Is the R4/R7 v2-peer-INTENT-bypassing-failed-HELLO gap a BLOCKER for P2 dead-code removal, or acceptable as a documented S54 carry-forward? Current draft DEFERS. Council weigh: keep RMB ConnectDrag as a fallback for stuck-Carrying joiners vs. remove + add S54 gate.

5. **(QUALITY/TESTING)** Should controls.ts header rewrite explicitly mention Q-key (S49 Sym F SHRINK_TERRITORY)? Currently does. Aligned with main.ts:334 HUD text rewrite.

6. **(SCOPE)** Bundle-size target after P2: actual delta hard to predict without measuring. If P2 yields >2 KB headroom, suggests S52's 499.60 KB ceiling pressure was tighter than expected. Worth noting in handoff but not gating.

---

## SESSION-STATE GATE FIELDS (per CLAUDE.md PDR GATE)

On user `go`:
- Top-level: `pdr_approved=true`, `deliberation_completed=true`, `unlock_source=user`
- Per-priority (P1, P2): same three fields placed under each entry per Genesis S35 reflexion #4 hook semantic discovery

---

**END PDR DRAFT.** Awaiting Council R1 + PRIME-AUDIT before presenting to user for explicit `go`.
