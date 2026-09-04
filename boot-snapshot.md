# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-04 | Session: S162 | Commit: `dc404fb` | **PROTOCOL 40**

State at close: `tsc` 0 · **3627/3627** unit tests / 231 files · `e2e:gating` exit 0, 62 passed ·
bundle **779.8 / 900 KiB** (headroom 120.2) · `verify-deploy` **PASS 4/4** at `e3ba437` with
RELAY SHIPPED · MCV **47 assertions, hard_fail=0** · Rule 22 runtime audit clean.

> ⭐ **THE LIVE MULTIPLAYER OUTAGE IS FIXED AND THE RELAY WORKS FOR THE FIRST TIME EVER.**
> Measured in a real browser against production: `host:1 srflx:1 **relay:1**`, zero ICE errors.
> Every session from S157 to S161 shipped `relay: 0`. The cause was three GitHub secrets pasted
> as JS object-literal fragments off metered.ca's dashboard (`urls: "turn:…"`), which made
> `new RTCPeerConnection` THROW at construction — killing same-LAN play too.
>
> ⚠ **A 5-LANE AUDIT THEN FOUND THREE MORE BUGS INSIDE THAT FIX**, plus two in the same day's P2/P4
> and three in S161. All fixed in `e3ba437`. Read `post_audit_s162` in session-state before
> trusting any S162 claim — several of my own were wrong and are corrected there.

## Next Steps

1. ⚠ **OWNER ACTION — re-paste the three TURN secrets clean** (bare value; no key name, no quotes,
   no comma). The game repairs the wrapped form at runtime so multiplayer WORKS today, but the
   intent should be explicit. See `TURN_SETUP.md` § "The shape of the values". The credential has
   also been public in the deployed bundle since 06:10Z 2026-09-03 (inherent to browser TURN) —
   rotate at metered.ca if its usage graph looks abused.

2. ⛔ **LANE2-F4 (MED) — a host whose own uplink dies can CROWN ITSELF.** After
   `PEER_DROP_FORFEIT_TICKS` (20 s) it becomes the sole contender and fires `WIN_TRIGGER`, while
   its peers — seeing host loss — run the migration ladder and keep playing: two live outcomes for
   one match. The margin over the 15 s client reconnect grace is thin. Needs a design decision;
   the likely rule is "no self-crown while a migration window is open".

3. **OWNER RULING NEEDED — abandonment.** A 1v1 whose opponent simply disconnects still does not
   end, because no castle fell. S162 deliberately did NOT invent a forfeit rule inside a bug fix.

4. **Correct two comments I wrote that are FALSE** (lane1-#7): `quickmatchGate.ts` and
   `raceClaim.test.ts` both claim a `joinRoom` throw prevented `session.netTransport` being
   assigned. It does not — the assignment precedes `connect()`, and `transport.ts` wraps `joinFn`
   in `try`. The P1 fix is still correct; the stated root cause is not. The true live mechanism was
   the ghost race claim, now fixed.

5. **`TURN_CONFIG_NOTE` has no reachable UI path on the SUCCESS branch** (lane1-#3). Its only
   consumer is the connection-test `.catch()`, which `parseTurnConfig` made unreachable by design.
   So the owner's repaired-paste case warns only to devtools. Surface it in the `.then()` verdict.

6. **The R72 TOWER targeting matrix is declared but DEAD** — `defenderCanTarget` has zero
   production callers (hand-verified). The CREATURE half was wired in S161 with a docblock naming
   this exact defect. Wiring it CHANGES GAMEPLAY (princess/stinkTower become UNITS_ONLY), so it is
   an owner decision, not a silent fix.

7. **W1-C (races) is the live plan** — `SPARK_RACES_SPEC.md`, now corrected: it owes
   **PROTOCOL 40 → 41**, not 39 → 40 (40 was already spent by S161 P2, and executing the old line
   verbatim would have been a SILENTLY skipped bump that `protocol.test.ts` still passed).

8. **The owner's art-direction brief is queued for ~2 sessions out** —
   `RACE_ZONES_AND_BOSS_TOWERS.md` (per-race zone backgrounds + tier-9 boss towers). ⛔ It has ONE
   blocking owner decision: "nine of one shape" ALREADY summons the NONET sudoku trial
   (`hostTick.ts`), so the first boss tower of every match would also trigger sudoku. Four
   resolutions are written out; my recommendation is option 3.

## Blockers

- **OWNER**: re-paste the TURN secrets (hygiene, not urgent — multiplayer works).
- **OWNER RULING**: abandonment/forfeit in 1v1; the NONET collision for boss towers; whether the
  R72 tower targeting matrix should be enforced.
- **ORG SPEND LIMIT was reached** during S162's audit — 9 of 18 agents died on it. If subagents
  still fail at boot, run lanes BY HAND; the project rule is that a hunt returning nothing is not
  a completed hunt.
- **E2E CI has never exercised S161/S162 code** — `e2e.yml` is schedule+PR+dispatch only and last
  ran 2026-08-31. Locally `npm run e2e:gating` passes 62/62 at every commit. A manual run was
  triggered at close (run 33845329713); check its conclusion at boot.

## Pending Backlog

- [ ] **A — PER-RACE ZONE BACKGROUNDS.** Each seat's quarter painted in its race's world instead of
- [ ] **B — TIER-9 BOSS TOWERS, one per race.** Nine of the race's own shape (`RACE_FEED_SHAPE`)
- [ ] ⛔ **BLOCKER FOUND IN S162, NEEDS AN OWNER DECISION FIRST (Q4).** *"Nine of one shape"* is

## Recent Reflexion (last 2 sessions)

## S162 (2026-09-03/04) — the live multiplayer outage was a PASTED JS SNIPPET, and the 5-lane audit then found three more bugs inside the fix for it

- S162 P0 — A WATCHDOG THAT SHARES THE WATCHED CODE’S BLIND SPOT IS NOT A WATCHDOG. turn-wiring-report.mjs existed specifically to catch a silent TURN misconfiguration and printed "RELAY WILL BE SHIPPED" for a build whose ICE config threw — because it asked "is it set" (v.trim()!==''), the same insufficient question as the code. When writing a guard, ask what QUESTION it asks, not whether it exists.

- S162 P0 — READ THE ERROR TEXT LITERALLY. The screenshot quoted 'urls: "turn:..."' and the UI blamed a browser extension. Chrome quotes the WHOLE offending token, so the token itself was a JS object-literal fragment — the root cause was legible in the owner’s first message. The same-LAN failure was the tell: host candidates need no STUN and no TURN, so a failure there means CONSTRUCTION, not routing.

- S162 P0 — DEGRADE, NEVER THROW, ON OPERATOR INPUT. A dead TURN server costs the hostile-NAT pairs; a MALFORMED one costs everybody, because new RTCPeerConnection rejects the whole config synchronously. Config parsed from a human paste must be validated and repaired, and must fall back to the last known-good posture (STUN-only) rather than propagating a value that can throw.

- S162 P1 — A GUARD ON A HANDLE IS NOT A GUARD ON THE INTENT. onPickRace skipped the whole presence rebuild behind `session.netTransport !== null`, so the local repaint — which needs no transport at all — was lost together with the wire send. Split the two: make only the part that genuinely needs the resource conditional.

- S162 P1 — MY OWN TEST CAUGHT MY OWN WRONG ASSUMPTION, AND THE CODE WAS RIGHT. Asserting seat 0 falls back to defaultRaceForSeat exposed that rosterEntryFor deliberately OMITS raceId when unclaimed (the §15.6 byte-identity contract) while always carrying the effective colour. Read the docblock before "fixing" a surprise.

- S162 P2 — AN INHERITED FINDING IS A LEAD, NOT A VERDICT. OF-1 claimed BOTH the lobby taken-set and raceIsFree were wrong. lobbyStateMachine lines 374/393 already default-fill raceId on both paths, so the picker was correct and only the host-side wire authority was not — which also drops the severity from "two crimson castles in normal play" to "reachable only off-UI". Verify the claim before writing the fix it asks for.

- S162 P0 — I OVERWROTE session-state.json’s `priorities` array (6 completed S161 entries) and `reflexion_entries_to_archive` (20 entries) without reading the target first, and only caught it from a -404 line diffstat just before committing. Recovered verbatim from `git show HEAD:.claude/session-state.json`. Look at what you are about to overwrite, especially in an append-only ledger.

- S162 P0 — AN UNQUOTED HEREDOC RAN MY PROSE AS SHELL. Writing these very entries with `<<PYEOF` instead of `<<'PYEOF'` made bash treat every backtick span in the lesson text as a command substitution: three commands failed with "command not found" and their EMPTY output was spliced into the Python source, silently deleting words from two entries. Caught only because the project rule says every non-zero exit is a finding until ruled benign — it was not benign, it was data loss. ⛔ Quote the heredoc unless a variable genuinely needs expanding; if one does, pass it via argv or an env var rather than unquoting the whole document.

- S162 P3 — A CHILD THAT MOUNTS INSIDE A PARENT CONTAINER STILL NEEDS ITS OWN TEARDOWN. Hiding the parent hid the picker visually but left its own visible flag true, so it was already open the next time the parent appeared. "It is inside the container so setVisible takes it down" was true of the pixels and false of the state.

- S162 P4 — PUT THE DECISION WHERE THE KNOWLEDGE ALREADY IS. The tempting fix for OF-2 was a synced offlineSinceTick on Player (four sites plus a protocol bump) to ship the host a fact it already had, for a peer that only needs the CONCLUSION. An optional host-only predicate cost one parameter and left the client path byte-identical, which is also what keeps it determinism-safe.

- S162 P4 — WHEN A FIX COULD INVENT A GAME RULE, STOP AND FILE IT. Deriving fallenCount from contenders instead of living would have ended a 1v1 the moment the opponent blinked. That is abandonment, a design decision rather than a bug fix, so the guard stays and the question goes to the owner.

- S162 P5 — THE HUNT FAILED THE SAME WAY AS S161 AND IT DID NOT MATTER, BECAUSE THE RULE WAS FOLLOWED. Nine verify agents died on a spend limit. S161 recorded 'the sweep produced nothing' and wrote its handoff; S162 hand-verified all nine orphaned findings with greps and confirmed every one. The delegated run is an accelerator, and the fallback is the deliverable.

- S162 P5 — DOC DRIFT IS NOT COSMETIC WHEN THE DOC IS THE PLAN. SPARK_RACES_SPEC.md's W1-C line said 'PROTOCOL 39 -> 40' when 40 was already spent, so a session executing it verbatim would have written 40 over 40 - and protocol.test.ts's expect(...).toBe(40) would still have PASSED, making the skipped bump invisible. A stale number in a spec can defeat the test written to catch that exact mistake.

- S162 P6 — PROVE A GUARD BY BREAKING THE THING IT GUARDS. Adding a `never` arm and seeing tsc stay at 0 proves nothing. Temporarily widening RaceId to seven members and watching tsc fail at exactly the three new lines is the proof - and it also showed WHY the existing Record backstops were not enough: they say 'add a colour', not 'add a motif'.

- S162 P6 — PREFER MAKING A COMMENT TRUE TO MAKING IT ACCURATE. Three docblocks said markFallenSeats was HOST-ONLY and nothing enforced it. Rewriting them to describe the leak was the cheap option; gating on world.isHost cost one line and made the original claim correct, once I had checked that isHost defaults true and the field crosses the wire.

- S162 P5 — SUBAGENTS SHARE MY WORKING TREE. A verifier's scratch test (src/render/zz_refute_tmp.test.ts) was swept into a commit by `git add -A` and then deleted by the agent afterwards. Read git status before committing while agents are live, or stage explicitly.

- S162 P6 — A CI PATHS ALLOWLIST MUST INCLUDE EVERYTHING THE JOB EXECUTES, NOT JUST WHAT IT BUILDS. deploy.yml listed src/ and public/ but not scripts/, while the job itself runs node scripts/turn-wiring-report.mjs and the build ends in node scripts/check-bundle-size.mjs. So the one edit this project is instructed to make under deploy pressure - raising the bundle charter - would have queued no run at all, and the author would have sat waiting on a deploy that never existed.

- S162 P6 — THE CHEAPEST LANE PAID AGAIN. OF-11 was filed as "may have a cross-colour hole, cheap to check". Two greps closed it: the territory hard-block minimum radius (72px) is strictly larger than AUTO_BOND_RADIUS (60px), and constants.ts had already written that argument down in S51. Reading the constant beat reasoning about the mechanic.

- S162 P7 — THE MCV STOP HOOK CAUGHT A CLAIM I HAD JUST WRITTEN MYSELF. Authoring verification[] bindings is not bookkeeping - the act of writing a machine-checkable assertion is what surfaced that README said 3619 tests while the suite had grown to 3622, a drift I introduced DURING the very priority that was fixing drift. Write the binding, then RUN the verifier and require exit 0; prose in check_method proves nothing.

- S162 P7 — A PUSH IS NOT A DEPLOY, AND I WALKED AWAY FROM ONE. I pushed 9703a7a and moved to the next priority without reading its conclusion; the run FAILED. A workflow agent had written a scratch test into my tree between my last typecheck and my commit, git add -A swept it in, and it broke tsc on noUnusedLocals - so a subagent side effect broke a DEPLOY, not just a commit. It self-healed two minutes later, which is exactly why it stayed invisible. Two rules, both already written down and both ignored in the same minute: audit run CONCLUSIONS, and stage explicitly while agents are live.

- S162 POST-AUDIT — THE AUDIT FOUND MORE IN MY SAME-DAY WORK THAN I HAD FOUND IN THE INHERITED WORK. Five lanes over S161+S162 surfaced three defects inside the P0 TURN fix alone - a template-literal `\s` that silently disabled the whitespace class, a bracket strip that corrupted valid IPv6 into a throwing url, and a 'validator' that was a punctuation filter. Fresh code is not safer code; it is merely less examined.

- S162 POST-AUDIT — I WROTE A TEST THAT PINNED A BUG AS INTENDED BEHAVIOUR. The zero-contender branch crowned an ELIMINATED host, and my own case asserted `lastWinnerId` was that host, complete with a confident comment explaining why. A test is only evidence if its EXPECTATION was reasoned about separately from the code; writing both in one motion just records what the code does.

- S162 POST-AUDIT — AN ORACLE COPIED FROM THE IMPLEMENTATION PROVES NOTHING. The ICE invariant test mirrored ICE_URL_RE byte-for-byte and even said 'mirrored here so the test is not the code' - it WAS the code, and five throwing urls passed it. Replaced with a hand-written census of what a browser actually accepts.

- S162 POST-AUDIT — A POINT FIX ON A SHARED PREDICATE LEAVES THE OTHER CALLERS BROKEN. S161 fixed the drone's sever against the OR in isEnemyBond but not the selector both the drone and the chewer share - so the owner's own bug (my creature destroyed my tower) stayed live through the chewer for a whole session. Fix the predicate, or enumerate its callers; never just the one that was reported.

## S160 POST-HANDOFF (2026-09-03) — TURN went live, and provisioning the secret broke a gate that was right to notice

- S160 (caught at the Stop gate, SECOND time) — I BOUND A CLAIM TO boot-snapshot.md, A FILE THE HANDOFF PROTOCOL REGENERATES FROM SCRATCH AT STEP 2.95. It was guaranteed to break at close, and it did. This is the identical lesson S159 P9 learned about BACKLOG.md status text — "never bind a code claim to a document whose whole purpose is to change" — which I had READ and RE-APPENDED to the reflexion log an hour earlier in this same session. Knowing a lesson and applying it are different acts. ⇒ Before writing any binding, ask what REGENERATES the target: ephemeral (boot-snapshot, plans/, status blocks) vs durable (src/, LOCKED_DECISIONS, .handoff-archive). And the failure surfaced a second, bigger miss: the regeneration had silently dropped the corrected drone dial order out of the next session's PRIMARY boot file, so the fix was not just to rebind but to put the substance into carry_forward_s160 where the regeneration will carry it.

- S160 POST-HANDOFF — PROVISIONING A SECRET BROKE A GATE, AND THE GATE WAS RIGHT TO NOTICE. The moment TURN secrets existed, verify-deploy's LIVE carrier began reporting "prod is NOT what you built / Do NOT report this as shipped" for a deploy that was correct: build-time injection changes the bytes, so a secret-less local build can never match production's content hash. A gate that cries wolf teaches the next session to ignore it, which is worse than having no gate. ⇒ When a build starts consuming secrets, audit every check that compares LOCAL output to PRODUCTION output — the check did not change, but what it was capable of proving did.

- S160 POST-HANDOFF — MY OBVIOUS FIX WAS WRONG, AND ONLY MEASURING IT SHOWED WHY. I replaced byte-equality with a code-skeleton comparison (blank every string literal; injection only changes literal VALUES, so the code must match). It reported DIFFERENT. Cause: with empty secrets `HAS_TURN_CONFIGURED` is a build-time constant `false`, so Rollup TREE-SHAKES the relay logging branch out entirely — the live bundle carries whole literals the local one never had. **Secret injection changes which code SURVIVES, not just what the literals say.** The honest landing was a diagnosis that names what it cannot prove, plus a filed carry-forward for the real fix (a build stamp). Shipping the clever version would have produced a confident false positive.

- S160 POST-HANDOFF — I READ A STALE /tmp LOG A SECOND TIME, THE SAME SESSION I WROTE THE REFLEXION ENTRY ABOUT IT. `node --check … && npm run verify-deploy > /tmp/vd3.log` — the syntax check failed, `&&` short-circuited so the gate never ran, and `tail` then printed a PASS from a previous session against commit c90b4443. I caught it only because the commit SHA was S159's. Writing the lesson down did not stop me repeating the mechanism an hour later. ⇒ The habit has to be structural, not remembered: FRESH unique log path every time, and never put a gate behind `&&`.
