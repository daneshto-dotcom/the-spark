# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-27 | Session: S53

## Next Steps
1. **USER 2-peer cross-network smoke** on https://spark-online.space/?debug=1 — verifies S52 P1 atomic PLACE_FROM_FREE + dragLock + S52 P2 raid charge 1-per-sever + S52 P3 duckMusic tab-blur survival + S53 P2 simplified RMB (sever-only). 5-10 min with friend across networks. S35-P11 + S49+S50+S51+S52 carry (10+ sessions overdue).
2. **Wire HELLO emission at peer-join time** (S53 P1 LATENT FEATURE ACTIVATION — HIGH PRIORITY): NEW `transport.send({kind:'HELLO', playerId, color, protoVersion: PROTOCOL_VERSION})` call at peer-join time on BOTH host (hostHandlers.ts after `transport.connect` or on first peerJoin) and joiner (clientHandlers.ts post-connect). Activates the dormant `detectProtocolMismatch` + `protocolMismatchPeers` latch + `onProtocolMismatch` UX shipped in S53 P1. ~10-20 LOC. Wiring is the LAST step to make the protocol-mismatch UX user-visible — infrastructure is complete + 13 unit tests already prove the latch + helper work.
3. **Phase-2 next mechanic** (design call — user picks): D Inject Spiral / E Steal / A Fog of war / G Mega-combos / Anvil 2nd creature.
4. **CHECK CARRY-S54 cluster** (LOW, ~30-50 LOC total):
   - G3: sanitize verbatim peerVersion in `formatProtocolMismatchMessage` (string-coerce non-primitive to avoid `v[object Object]`)
   - M4: replace `parsed as Record<string, unknown>` unsafe cast in `detectProtocolMismatch` with a proper type-guard function
   - M5: revise "Your friend's version is older" → neutral "The other player's version is older" (matchmaking-future-proof)
   - M3: controls.test.ts foundation suite (covers post-S53 P2 simplified RMB-down path + LMB-up + Q-key onKeyDown)
5. **PROTOCOL_VERSION mismatch FULL E2E test** post-HELLO-wiring (#2 above): add Playwright test that loads v2 bundle in one tab + v3 bundle in other tab, asserts the lobby strip shows "Protocol mismatch" red text + dropped-message counter.
6. **Anti-bloat / infra carry stack**: main.ts 888-LOC trim (S52 carry); vitest 4.x bump (S50 carry); Sym E rendering helper (S50 P5 carry); 48k Opus re-encode (S51 user-choice); `__TEST_RNG_SEED__` seam (S51 Council Δ1); host-side `ATTRACT_DRAG_POS` wire message (S52 Council Δ6 DEFER).

## Blockers
- **USER 2-peer smoke** still gated on user having a friend across networks for live test.
- S53 P1 protocol-mismatch UX is DORMANT until HELLO emission is wired (next-step #2 above). Infrastructure correct + tested, but no user-visible behavior until producer call site is added.

## Pending Backlog
- [ ] Phase-2 next mechanic (design call)
- [ ] HELLO emission at peer-join (S53 P1 activation)
- [ ] CHECK CARRY-S54 LOW cluster (G3/M3/M4/M5)
- [ ] main.ts hypertrophy refactor (888 → ~700 LOC target)
- [ ] vitest 4.x major bump audit
- [ ] Sym E rendering helper (S50 P5 carry)
- [ ] 48k Opus mp3 re-encode (S51 user choice)
- [ ] __TEST_RNG_SEED__ deterministic seam (S51 Council Δ1)
- [ ] ATTRACT_DRAG_POS host visibility of joiner drag (S52 Council Δ6)

## Recent Reflexion (last 2 sessions)

### 2026-05-27 — Session 53
- S53 #protocol-mismatch-ux-latch-shipped-as-dormant-infrastructure: detectProtocolMismatch + protocolMismatchPeers + onProtocolMismatch correctly wired and tested but currently NEVER fires — no production code sends HELLO. PRIME-AUDIT ΔI discovery post-ship. Next session: wire transport.send({kind:'HELLO',...}) at peer-join time.
- S53 #per-peer-protocolmismatchpeers-latch-pattern: Set<peerId> at transport boundary drops ALL subsequent messages from a mismatched peer (closes v2-INTENT-bypass gap). Cleared on disconnect() + onPeerLeave (defensive). Pattern reusable for any per-peer wire-level ban.
- S53 #rmb-connectdrag-removal-confirms-dead-via-grep-and-typescript-narrowing: -80 LOC across controls.ts (variant + handlers + pickPrimitive) + structureRenderer.ts (drawPreview + 4 dead helpers). tsc-guided removal + grep-zero PR gate.
- S53 #locked-13-11-strikethrough-amendment-convention-codified: ~~strikethrough~~ + "HISTORICAL (date-range)" + "Sxx Py AMENDMENT" block + implementation pointers. Reusable spec-amendment shape.
- S53 #council-r1-and-check-grok-hallucinations-pattern-documented: 4 Grok hallucinations across R1+CHECK (non-existent files structureRenderer.test.ts/hotkeys.test.ts + GameHost/GameClient classes). PRIME-AUDIT must verify cited file paths via Read/Grep before adopting.
- S53 #onpeerleave-latch-cleanup-defensive-hygiene-not-functional-bug: Gemini CHECK M2 ADOPT, ~5 LOC. Bounded-growth defensive pattern for per-peer state.
- SESSION #s53-shipped-3-priorities-plus-check-fix: 5 commits bde5e41..ecffc46, unit 828/828, bundle 498.51 KB +1.49 KB headroom, API spend ~$0.12.

### 2026-05-26 — Session 52
- S52 #atomic-place-from-free-vs-two-action-burst-fixes-stuck-carrying: atomic PLACE_FROM_FREE collapses legacy LMB-up PICKUP+PLACE 2-intent burst. Validation FIRST then atomic commit. Closes joiner stuck-Carrying bug.
- S52 #dragLock-skips-snapshot-interpolation-for-local-cursor-spark-fixes-jitter: interpolatePositions opts out of lerp for AttractDrag/pendingPlaceFromFree sparkId.
- S52 #cycle-no-consume-removal-strategic-balance-amendment: user-authorized §13.11 amendment, every hostile sever costs 1 charge.
- S52 #duck-music-webaudio-setTargetAtTime-survives-suspend: Web Audio automation queue is ctx-time relative, survives tab-blur suspend.
- S52 #check-triumvirate-convergent-blocker-on-atomicity-defensive-reorder: fallible-first / mutations-last reducer ordering pattern.
- SESSION #s52-shipped-3-priorities-4-commits-815-of-815-green-deploy-success-e2e-success.
