# Boot Snapshot (auto-generated at S35 close)
Generated: 2026-05-17 | Session closed: S35 (P0 1v1 join bootstrap deadlock fix — 1 priority, 2 commits) | Last commit: 7879223

## Live URL
**https://spark-online.space/** (HTTPS, GH Pages auto-deploy on push to master)
**https://spark-online.space/?debug=1** (debug overlay + `[net]` + `[cinematic] video.*` + `[creature] state` logs)

## Status
S35 P0 shipped. 1 LOC fix in main.ts onJoinAttempt unblocks 1v1 join handshake — bug since S15 commit add497f (~20 sessions). **Awaiting user 2-peer manual smoke (cross-network) BEFORE next priority.**

**Tests:** 627/627 (+2: positive joiner-bootstrap end-to-end + pre-fix repro semantics; both in sync.test.ts new describe block)
**Bundle:** 468.15 KB (+0.01 KB; 31.85 KB headroom on 500 KB hard cap)
**Branch:** master, clean, in sync with origin (aa082f3..7879223, +autocommit 58961bf)
**Context at close:** ~212K / 1M (21.3% GREEN)

## Next Steps
1. **USER GATE: 2-peer manual smoke** — open `https://spark-online.space/` on two devices (or your machine + brother's). **Hard refresh (Ctrl+Shift+R) both.** Host creates room → joiner enters code → host clicks Begin Match → both peers MUST transition to PLAYING simultaneously. Report "smoke passed" or paste F12 `[net]` logs from both peers if not.
2. **Anvil creature** — voltkin-config.ts CreatureConfig table (S34 P2-20) is the prereq base. See LOCKED §13.15 Anvil migration checklist + open design Q (FSM reuse vs new CHARGING state).
3. **1v1 brother retest** of S31 P0-3 NetSnapshot effects mirror + S33 P1-11 creatureId additivity — NOW UNBLOCKED by S35 P0 fix. Expect this to surface additional latent bugs in S20/S22/S31/S33 layers (untested cross-network since S15).
4. **CF-1 (S35 follow-up):** Tighten main.ts:201 dispatchFn gate to additionally require `gameState === 'PLAYING'` — eliminates harmless LOBBY-INTENT chatter post-S35-P0-fix. Micro priority.
5. **CF-2 (S35 follow-up):** transport.ts:144 wire deserialize uses direct `JSON.parse(data) as NetMessage` without invoking protocol.ts:99 `parseNetMessage` validator. Try/catch handles crashes but admits malformed kinds. Micro hardening.
6. **Bond UX:** RMB-drag multi-target for polygon frames (S23 P2 carry).

## Blockers
**User gate (#1 above) blocks next priority.** Production HTTP 200 ✓; deploy carries the fix. Single-session validation impossible (Trystero P2P requires 2 separate browsers).

## Pending Backlog (excerpt)
- [ ] Anvil creature (apply voltkin-config + new attack handler) — voltkin-config base READY
- [ ] CF-1: main.ts:201 dispatchFn gate tighten (NEW S35)
- [ ] CF-2: transport.ts parseNetMessage wire validator integration (NEW S35)
- [ ] Bond UX: RMB-drag multi-target for polygon frames (S23 P2 carry)
- [ ] P3 NET enhancements (client prediction + delta NetSnapshot + host migration + live cursor)
- [ ] P5 Phase-2 next mechanic (D Inject Spiral / E Steal / A Fog / G Mega-combos)
- [ ] P7 Bond-hover cost preview
- [ ] P9 OGG compression (10MB → ~2MB)
- [ ] PannerNode + auto-duck audio polish
- [ ] Host save-load with live creatures edge case (Gemini G3 documentational; low priority)
- [ ] CutsceneOverlay.abort integration test (S34 P2-24 stretch deferred)

## Manual Smoke (CHECK live — if running it again)
Two devices on `https://spark-online.space/?debug=1` (solo or 1v1). **Hard refresh first.** Build SQ4-TR4 chain. Expected:
- Lobby join handshake: joiner transitions LOBBY→PLAYING when host clicks Begin Match (S35 P0 fix)
- Voltkin cinematic phase: mp4 + voice + bg fade + SPAWNING pulse fully visible (S31 P0-1)
- Lightning attacks with cyan jagged bolts; jitter pattern varies per creature (S33 P1-11)
- Screen shake on each fire-tick — ARC_FLASH-gated (S33 P1-6)
- TITLE-transition cleanup intact (S34 P2-16)
- 1v1 client mirrors host's ARC_FLASH + shake (S31 P0-3) — NEEDS RETEST POST-S35-FIX

## Recent Reflexion (S35 highlights)

- **#integration-blind-spot-since-S15-because-unit-tests-bypass-main-ts-inline-gates**: 1v1 join deadlock at main.ts:765 client-interpolation gate persisted 20 sessions because vitest unit tests exercise ClientSync directly — bypassing the inline render-loop gate. "1v1 brother retest pending" carry items across S31/S32/S33/S34 were the symptom: cross-network 2-peer playtest was IMPOSSIBLE because joiner never left LOBBY. Mitigation: explicit playtest gate in PDR execution order. Long-term: extract main.ts gate logic to pure helpers OR Playwright integration test for LOBBY→PLAYING.

- **#asymmetric-host-joiner-setup-needs-symmetry-check**: Host gets world.gameMode='1v1' via reducer dispatch (applyStartGame); joiner is supposed to mirror via NETSNAPSHOT apply, BUT apply path is gated on gameMode='1v1' — Catch-22. Pattern carry-forward: any world.* field host sets via reducer must be checked for joiner-side parity in onJoinAttempt. Fields that GATE the snapshot-apply path can NEVER be bootstrapped from the snapshot.

- **#prime-audit-all-gates-sweep-before-state-mutation-in-entry-point-handler**: PRIME-AUDIT swept all 11 `gameMode === '1v1'` references repo-wide before adding the 1-LOC fix. Took ~3 min, gave high-confidence safety. Pattern: any handler-side world-field mutation triggers a grep-all-gates audit BEFORE landing.

- **#bootstrap-gate-catch-22-pattern-codified**: Any pattern `if (world.X === V) { ... mutates world.X to V ... }` is a deadlock unless world.X is set to V somewhere else first. Audit checklist: (1) is gate condition the output of the gated mutation? (2) is there an INDEPENDENT path to set the gate-condition?

- **#user-driven-playtest-as-final-validation-gate**: When fix targets integration boundary unreachable by unit tests (cross-network, DOM-gated, hardware-gated), PDR must name human-loop validation as explicit step BEFORE next priority. 2-stage close: "fix landed pending smoke" → "fully validated after user playtest."
