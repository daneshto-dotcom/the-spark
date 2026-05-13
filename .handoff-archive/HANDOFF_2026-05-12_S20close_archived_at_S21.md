# SPARK — Handoff S20 → S21
**Generated:** 2026-05-12 (post-S20 close)
**Branch:** master | **Last commit:** `c4ae96f` S20 P3 (silhouette extraction)
**Working dir:** `C:\Users\onesh\OneDrive\Desktop\The Spark`
**Live URL:** **https://spark-online.space/** (HTTPS via Let's Encrypt cert exp 2026-08-10 auto-renew)

═══════════════════════════════════════════════════════════
## QUICK SUMMARY

SPARK S20 closed with 3 priorities shipped (all Standard tier, all Council-deliberated). **P0 1v1 CONNECT BLOCKER continuation** (commit `ed090fd`): A.0 of `node_modules/@trystero-p2p/core/dist/types.d.mts` surfaced 3 API gaps in our v4 wrapper (no JoinRoomCallbacks, no rtcConfig, type-lie cast). v5 closes all three in one ship + adds diagnostic `[net]`-tagged logging at every layer + 1Hz ICE-state poll via `room.getPeers()` for the 30-second pre-peer-join window. Outcome classifier ready for user retest (GREEN/YELLOW/RED with concrete next moves per branch). **P1 world.ts → sparkLifecycle + authGate** (commit `5050150`): A.0-level-2 surfaced FSM cases already delegated to gameMode.ts (S16 P0); PIVOTED to extracting SPAWN/DESPAWN/PICKUP/DROP/TICK_ENERGY case bodies + de-duplicating the 3-site inline 1v1 auth gate into a shared `requireActivePlayer` helper. world.ts 311 → 275 LOC (≤280 charter ✓, first time since S15 P2). **P3 bondVisualRenderer silhouette extraction** (commit `c4ae96f`): Council R1 PIVOTED scope from 12-per-file fragmentation to 3-archetype grouping (axisAligned/midpointOrnaments/parametricPaths) + shared.ts + barrel index.ts. bondVisualRenderer.ts 536 → 73 LOC (≤500 charter ✓, -86%). Tests 377 → 401 (+24). Bundle 394.74 → 397.65 KB (+2.91 KB net, all from P0 NetTransport additions; P1+P3 byte-flat as pure refactors).

═══════════════════════════════════════════════════════════
## CURRENT STATE
- Build: passing (779 modules, 397.65 KB main bundle)
- Tests: 401/401 passing (was 377 pre-S20)
- Typecheck: exit 0 (P0 FIXED v4 type lie)
- Deployment: LIVE at https://spark-online.space/ (GH Actions deploy run 25756416032 success 48s for P0; P1+P3 pure refactors no deploy needed but pushed)
- Git: master, synced with origin/master (commit `c4ae96f`)

═══════════════════════════════════════════════════════════
## SESSION COST
- Grok: 3 calls (~$0.03) — Council R1 DISRUPTOR for P0, P1, P3
- Gemini: 3 calls (~$0.06) — Council R1 AUDITOR for P0, P1, P3 (all gemini-2.5-pro)
- Total API: ~$0.09
- Real context at close: 362,627 / 1,000,000 (36.26% GREEN)
- Statusline cost-tracker dead at session start (warning logged); cost via direct MCP-call accounting

═══════════════════════════════════════════════════════════
## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: 3/3 complete | 362K/1M (36.26% GREEN)
- P0 1v1 CONNECT BLOCKER continuation (Standard) — completed — commit `ed090fd` — Council R1 + PRIME-AUDIT + PRIME-AUDIT-2 (HELLO_PROTO revised to observability-only)
- P1 world.ts → sparkLifecycle + authGate (Standard) — completed — commit `5050150` — A.0-level-2 PIVOT, Council R1, +15 tests
- P3 bondVisualRenderer silhouette extraction (Standard) — completed — commit `c4ae96f` — Council R1 PIVOT 12→3 archetype files, +0 tests (existing 59 hold byte-for-byte)

═══════════════════════════════════════════════════════════
## REFLEXION ENTRIES (S20)
- S20 P0 #a0-of-library-types-finds-three-api-gaps-in-one-pass
- S20 P0 #observability-before-third-shot-fix-when-second-shot-missed
- S20 P0 #prime-audit-2-finds-app-layer-protocol-already-version-checked
- S20 P0 #joinroom-typed-as-string-channel-eliminates-typesystem-fight
- S20 P1 #a0-level-2-pivot-after-pdr-lock-saves-bogus-extraction
- S20 P1 #shared-helper-extraction-when-three-call-sites-duplicate-same-predicate
- S20 P1 #council-r1-pivots-cleanly-when-the-pivot-fits-original-intent
- S20 P3 #council-shrinks-over-fragmentation-12-files-to-3-archetypes
- S20 P3 #vite-tree-shakes-restructured-modules-to-byte-identical-bundle
- S20 P3 #dag-safety-by-moving-fallback-to-shared-not-dispatcher

═══════════════════════════════════════════════════════════
## CHANGED FILES (S20 cumulative)
```
.claude/plans-archive/2026-05-12_PDR_Session_20_COMPLETED.md     | NEW (renamed from plans/)
.claude/plans-archive/2026-05-12_PDR_Session_20_Council_P0_BattleLedger.md | NEW
.claude/plans-archive/2026-05-12_PDR_Session_20_Council_P1_BattleLedger.md | NEW
.claude/plans-archive/2026-05-12_PDR_Session_20_Council_P3_BattleLedger.md | NEW
.claude/session-state.json                  |  S19 → S20 rotation + 3 priority entries
LOCKED_DECISIONS.md                         |  +106 (§13.1 v5 amendment + §7 module tree)
src/main.ts                                 |  +10 (NetTransport.onError → lobbyScreen.setErrorMessage host + client)
src/net/transport.ts                        |  +234 -1 (P0: callbacks + rtcConfig + diagnostics + type fix + classifyJoinError + NET_PROTOCOL_VERSION)
src/net/transport.test.ts                   |  NEW 69 LOC (9 tests)
src/render/lobbyScreen.ts                   |  +14 (P0: setErrorMessage red-fill method)
src/render/bondVisualRenderer.ts            |  -463 (P3: 536 → 73 LOC dispatcher-only slim)
src/render/effects/silhouettes/shared.ts    |  NEW 184 LOC (P3: BondVisualParams + helpers + drawDefaultLine)
src/render/effects/silhouettes/axisAligned.ts | NEW 209 LOC (P3: 7 shapes — filament/cable/bracket/diamond/wheel/lattice/capsule)
src/render/effects/silhouettes/midpointOrnaments.ts | NEW 94 LOC (P3: 3 shapes — star/orbital/warped)
src/render/effects/silhouettes/parametricPaths.ts   | NEW 62 LOC (P3: 2 shapes — vortex/whip)
src/render/effects/silhouettes/index.ts     |  NEW 11 LOC (P3: barrel re-export)
src/state/world.ts                          |  -36 (P1: 311 → 275, dispatch cases collapse to delegates)
src/state/authGate.ts                       |  NEW 36 LOC (P1: requireActivePlayer shared 1v1 gate)
src/state/sparkLifecycle.ts                 |  NEW 124 LOC (P1: 5 helpers extracted)
src/state/sparkLifecycle.test.ts            |  NEW 228 LOC (P1: 15 tests)
reflexion_log.md                            |  +10 S20 entries; S11+S12 blocks pruned
boot-snapshot.md                            |  regenerated for S20
HANDOFF_2026-05-12.md                       |  rewritten (S19 → .handoff-archive/_S19_postS20.md)
```

═══════════════════════════════════════════════════════════
## OPEN ISSUES / CARRY-FORWARD (S21+)

**TOP PRIORITY S21 P0 — 1v1 CONNECT user retest (gated):**
P0 deploy success at https://spark-online.space/ (commit `ed090fd`). User + brother retest pending. F12 Console output classifies the outcome:
- **GREEN:** peer connects + "Begin Match" appears → mark resolved, advance to NET feel tuning
- **YELLOW:** still stuck; `[net]` logs name the failure layer (e.g. `iceConnectionState: 'failed'` → symmetric NAT; `onJoinError: 'handshake-timeout'` → signaling; `[net] ice-poll: 30s elapsed, peerSet still empty` → no peer found) → S21 P0.1 amendment evidence-gated
- **RED:** still stuck AND no `[net]` console output → wrapper hooks not firing OR Trystero internals don't trigger them → pivot to A/B downgrade `npm install trystero@0.20.0` per the RED-path carry-forward in `.claude/plans-archive/2026-05-12_PDR_Session_20_Council_P0_BattleLedger.md` §PRIME-AUDIT delta self-question 4

**NEW §XV violation S21 P1 — transport.ts (Standard):**
P0 grew transport.ts 124 → 317 LOC (13% over 280 charter). Every LOC serves a concrete purpose (callbacks + rtcConfig + diagnostic logging + ICE poll + classifyJoinError + NET_PROTOCOL_VERSION + protocol-version observation). Options for S21:
- Extract `[net]`-tagged diagnostic logging + ICE-state polling into `src/net/transport-debug.ts` (saves ~80-100 LOC; observability separable from transport)
- Extract `ICE_SERVERS` const + `classifyJoinError` into `src/net/iceConfig.ts` (saves ~50 LOC; config separable from logic)
- Accept charter relaxation for transport.ts to 350 LOC (codify as §XV exception — net-layer essentials don't compress like state)

**Carry-forward S21 P2 — lobbyScreen.ts §XV** (Standard, was P-defer S20):
551 → 565 LOC (P0 +14 for setErrorMessage). 13% over 500 charter. Extract candidates: HTML input overlay (~80 LOC), connection-lost overlay (~30 LOC), pure helper exports (~20 LOC).

**Anti-bloat §XV ledger (S20 close state):**
- world.ts 275 LOC ✓ (under 280)
- bondVisualRenderer.ts 73 LOC ✓ (well under 500)
- audioManager.ts 406 LOC ✓ (under 500)
- transport.ts 317 LOC ⚠ (13% over 280; NEW S21 candidate)
- lobbyScreen.ts 565 LOC ⚠ (13% over 500; existing S21 candidate)

**Other carry-forward:**
- P0' Manual playtest verification (audio overlay + gradient + 1v1) — P0-gated
- P2 NET feel tuning (cross-network, P0-gated)
- P3 NET enhancements: client prediction + delta NetSnapshot + host migration + live cursor sync (Standard, playtest-signal-gated)
- P5 Phase-2 next mechanic (user picks: D/E/A/G)
- P7 Bond-hover cost preview (Standard — needs hit-test infra)
- P9 OGG compression (10 MB MP3 → ~2 MB OGG; ffmpeg availability TBD)
- PannerNode + auto-duck (S18 Grok#5 audio polish)
- HTTP-80 redirect on spark-online.space may 404 (non-blocking; browsers default HTTPS)

═══════════════════════════════════════════════════════════
## SESSION RULES (S20 — LOCKED amendments: §13.1 v5 + §7 module tree)
- §13.1 v5 (S20 P0) NEW: NetTransport now passes joinRoom 3rd-arg JoinRoomCallbacks (onJoinError + onPeerHandshake + handshakeTimeoutMs:30000) + rtcConfig (Google STUN x2 + openrelay.metered.ca free TURN x3: UDP/80 + TCP/443 + UDP/443) + iceTransportPolicy:'all' + trickleIce:true. [net]-tagged console logging at every layer transition + 1Hz `room.getPeers()` ICE-state poll while peerSet empty (max 30s). `makeAction<string>('msg')` proper typed call replacing v4 unknown-cast.
- §7 Module Architecture tree updated S20 P1+P3: sparkLifecycle.ts NEW, authGate.ts NEW, disruptionManager.ts (S19 P2 documented), effects/silhouettes/ subdirectory NEW (shared + 3 archetype files + barrel)
- §XV anti-bloat: world.ts 275 LOC (✓ ≤280); bondVisualRenderer.ts 73 LOC (✓ ≤500); lobbyScreen.ts 565 LOC (S21 P-extract); transport.ts 317 LOC (NEW S21 P-extract)
- Git: master only, push at every commit, identity = daneshto@gmail.com

═══════════════════════════════════════════════════════════
## QUICK COMMANDS
```bash
curl -sI https://spark-online.space/                                    # HTTP 200 ✓
gh run list --limit 1                                                   # latest deploy
npx vitest run                                                          # 401/401
npx tsc -b --noEmit                                                     # exit 0
npm run dev                                                             # port 15842 from .claude/launch.json
```
═══════════════════════════════════════════════════════════
## FULL ARCHIVES
→ This file at root.
→ `.claude/plans-archive/2026-05-12_PDR_Session_20_COMPLETED.md` (S20 PDR)
→ `.claude/plans-archive/2026-05-12_PDR_Session_20_Council_P{0,1,3}_BattleLedger.md` (3 Battle Ledgers)
→ `.handoff-archive/HANDOFF_2026-05-12_S19_postS20.md` (prior S19 handoff)
═══════════════════════════════════════════════════════════
Game playable RIGHT NOW at https://spark-online.space/ with audio controls + per-silhouette gradient. 1v1 fix deployed; user retest is the gate.
═══════════════════════════════════════════════════════════
