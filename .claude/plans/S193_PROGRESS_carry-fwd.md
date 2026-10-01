# FINAL REPORT (s193/carry-fwd)
- Commits: 88e59d2 T11 · 8966ae8 CF-1 · 9b53bc6 CF-2 · 3f4bda4 R-2 · 68dfc71 A3 · 269a330 L2. Merge of master b72e779 = 8497b57, 0 conflicts. Tip = this commit.
- Gates on 8497b57: typecheck 0 · vitest --maxWorkers=3 0 (7464 passed / 11 skipped, 488 files) · build 0, entry 1063.4 KiB / 1250 (+1.5 KiB vs master-only source, measured with vite build + check-bundle-size).
- BUMP: CF-1 only (sim rule: a migrated stale host would still carry through a weld). Everything else is render-only, client-local or test-only, so no bump for those.
- MINE: CF-1, a weld struck by a third seat carries into neither side (rec: accept, because the aId side was arbitrary). T11, the joiner anchors its number at the structure centroid, not the blueprint frame centre (rec: accept). T11, a repair and a break in one structure inside one snapshot gap drop the connector half on the joiner (rec: accept).
- Seams: severWithCarry candidates (teams ally exemption) · damageNumbers.syncStructures · main.ts clientJoinDeps + audio listener block · census taught shapes (new damageConnector sites must fit) · trystero tripwire (new Trystero imports must fit) · departureLatch.test mock now records onPeerChange handlers.
- NOT DONE: e2e (not in brief gates).

# S193 PROGRESS — s193/carry-fwd (LOW carry-forwards)

Branch `s193/carry-fwd` from master 11d86a3 (deploy #18, PROTOCOL 58). Worktree `.claude/worktrees/s193-carry-fwd`.
Not the merge owner: never push, never touch master, never edit PROTOCOL_VERSION.

## Items
1. T11 joiner repair numbers — DONE (no bump: render-only, no wire field)
2. carry CF-1 (Voltkin mixed-weld carry) — DONE (BUMP: sim rule — a stale migrated host would still carry)
3. carry CF-2 (census 'later in same function' false-pass) — DONE (test-only, no bump)
4. net R-2 (hidden tab never samples host absence) — DONE (client-local, no bump)
5. audio A3 (iOS 'interrupted') — DONE (render-only, no bump)
6. lobby4 L2 (dynamic-import tripwire hole) — DONE (test-only, no bump)

## Log
- worktree created at 11d86a3, npm install exit 0.
- item 1 DONE: damageNumbers derives one green per structure on a peer (shape rises + bank falls, excluding a structure that lost a connector this frame or had a host-recorded break); host record keys gain `b:`. Test repairHealNumberJoiner.test.ts (5) via HostSync→ClientSync→applyNetSnapshot. Mutants: no derivation RED 2/5, no sever check RED 1/5, no `b:` keys RED 3/9.
- item 2 DONE: severWithCarry — a struck mixed weld has no carry candidates (canon §2 sentence added). connectorCarryWeld.test.ts (3, REACH via applyVoltkinChain); mutant (drop `|| mixedWeld`) RED 2/7. src/state + canon 3635 pass.
- item 3 DONE: census parses each call's true path (4 taught shapes; anything else = not carried). All 9 real sites still carried. Synthetic fixtures incl. the dispatchReducer two-arm false pass; mutant (old rest-of-function window) RED 1/4.
- item 4 DONE: clientHandlers onPeerChange('leave') -> deps.onPeerLeft; main.ts records hostAbsentSeenFor via pure hostAbsentOnLeave (same conditions as the frame sampler). departureLatch.test.ts +4 (REACH via connectAsClient + fake transport, no frame; negative other-peer leave; pure table; main.ts wiring guard). Mutant (leave never forwarded) RED 1/15. tc 0, src/net 690 pass.
- item 5 DONE: contextNeedsResume (suspended|interrupted) used by resumeIfSuspended + ensureSfxBus; new resumeAudioOnGesture wired in main.ts on every pointerdown/keydown/touchend (not once) + visibilitychange→visible. audioInterrupted.test.ts (7). Mutants: suspended-only RED 5/7, once:true RED 1/7. src/render 2057 pass.
- item 6 DONE: trysteroPolyfill.test.ts +4: every `joinRoom` token / imported-alias use / string key / other Trystero import form classified (allowed: Trystero import specifier, call, typeof, `mod.joinRoom as JoinFn` + `alias as JoinFn` in transport); dynamic Trystero imports pinned to transport torrent+mqtt, each handing joinRoom only to startStrategy; 7 hole fixtures + positive control. Real-tree mutant (destructured dynamic import + call appended to quickmatch.ts): new tests RED 2/11 while all 7 S192 tests stayed GREEN (the hole, proven).
- gates done; report at top. DONE, awaiting merge owner.
