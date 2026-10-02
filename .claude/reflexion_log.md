## S193 (2026-10-02) - 7 deploys live and verified 4/4 (#17-#23, PROTOCOL 56→62): units-ai, zombies + every-blast falloff, CI health + relays, endgame pants, visuals-2, an 8-branch train (magic, bots, autobuild, visuals-4/5, carry-fwd, endstats, weld) and the owner's live playtest fixes; teams, visuals-3, mres-card carried.

- P0 #s193-property-test-the-split: an owner ruling phrased 'for every blast' had to be enumerated mechanically (a census keyed on BOMB_EXPLODE found every producer); the auditor's 60-layout property test through runHostTick proved the 312 split sums exactly and spares his side — arithmetic tests alone would not have.

- P1 #s193-pin-measured-numbers: the units-ai re-audit found the fix removed most of the measured cost (−37.6 % → −6.6 %) — a border bug had masqueraded as the intended intercept; a printed measurement is not a test, so the bound was tightened to assert it.

- P2 #s193-merge-owner-applies-seam-lists: weld landed after three branches changed shared signatures under it; the re-auditor's exact seam list let the branch fix its own merge in one round instead of the merge owner hand-resolving 7 conflicts.

- P3 #s193-required-arg-ripples: magic made the damage class a REQUIRED argument; every later branch needed a seam round for it — announce a required parameter to every open branch the moment it lands.

- P4 #s193-owner-reason-is-a-requirement: the endgame trickle stopped bursts, but only the audit's peak-live measurement (945 pants, 176 KB snapshot) showed it did not stop the LAG he named as the reason; a cap sized from the measured snapshot closed it.

- P5 #s193-stats-fold-one-seam: two branches answering 'who did this' (KillCredit, BLAST-2) were reconciled by picking ONE seam early and briefing the second to build an adapter; the fold cost one round, not a redesign.

- P7 #s193-ci-email-is-the-run-not-the-job: the owner's failure emails named RUNS; the one failing gating job was a 150 s test budget below the CI critical path — the T1 fix worked all along. Read the job, not the email.

- P8 #s193-measure-the-owners-question: 'is it points, strength or what?' — enumerating the target pipeline answered it exactly (leader + hash + seat order, never distance); the fix's side effect (bots walling their own porch) was found only by the auditor's bot runs.

- SESSION #s193-meta: ≤8 worktrees, ≤3 concurrent auditors, one-branch-at-a-time merges with full vitest between, ONE fresh-server e2e per deploy; the only e2e reds were environment, proven by the fresh run; detach long gate chains (the 600 s tool cap killed one) and commit logs only after verify-deploy.

## S192 (2026-10-01) - 20 worktree branches and 30+ agents with one independent audit at a time; 11 deploys live and verified 4/4 (#6-#16: perf, addons 53, carry 54, tune 55, nagas song, 4-player lobby fix, owner 56, voltkin, audio, net, visual pilot); the owner's playtest list, teams, magic and endgame built on 7 carried branches.

- P0 #s192-audit-one-at-a-time-lands-more: One independent audit at a time plus light re-audits of fix rounds landed 11 deploys with no spend-limit hit; every FIX FIRST was a real defect in a green branch.

- P1 #s192-read-the-bump-checklist: My 52->53 bump missed 3 of protocol.ts's six sites; a sibling's gates caught it pre-push. Now a bump.py edits all six and fails closed.

- P2 #s192-trial-merge-inside-the-audit: Branches cut before carry/tune landed needed merge chores; auditing a trial merge against CURRENT master made every merge predictable.

- P3 #s192-own-wrong-call-pitch-masters: I let a branch edit Pitch Masters claiming it shared the 4-player bug; the owner corrected it. A domain-sharing project is a separate repo: exclude src/arcade everywhere.

- P4 #s192-green-hides-high: net was green on every gate and e2e while a late duplicated beacon could depose a live host; only the adversarial audit found it.

- P6 #s192-cp1252-in-session-state: My Python open() without encoding wrote '§' as cp1252 into session-state; always pass encoding='utf-8'.

- P8 #s192-quarantine-hid-the-bug: The 4-player spec was red in ~40 CI runs under @quarantine-flaky; it was the owner's exact bug.

- P9 #s192-asset-swap-cheap-deploy: An asset-only swap verified by ffprobe + gates shipped as its own deploy with no audit spend.

- P10 #s192-new-path-must-reuse-old-predicate: The Voltkin re-summon duplicated ignition's walk without its S48 isolation test; share ONE predicate.

- P11 #s192-caps-need-priorities: A voice cap without priority silently ate once-per-match voices; exempt latched sounds.

- P12 #s192-guard-green-over-new-path: The cover-fade guard stayed green while the new fx path skipped the fade; guards must count new call sites.

- SESSION #s192-worktrees-keep-the-merge-owner-light: 20 worktree branches, 30+ agents, 11 deploys within ~80% context: the merge owner only routed, merged, bumped and gated.

## S191 (2026-10-01) - seven worktree agents + a Council + independent audits on the owner-approved batch; the org spend limit hit twice (weekly 98 %) mid-run; deploy #5 live and verified 4/4 (weld at its last audited-green commit + net minus the re-audit-red FIX-3 + the Pitch Masters merge, PROTOCOL 52); weld round 5/6, carry, perf, addons, owner, endstats and tune carried to S192 with every audit finding digested.

- P8 #s191-ship-the-audited-prefix-not-the-red-tip: when a branch's newest round audits red and the budget is gone, merge its last audited-green commit (weld c7436a2) instead of shipping the tip or holding everything; the red round carries forward intact on its branch.

- P0 #s191-the-merge-owners-own-fix-shape-needs-an-audit-too: FIX-3 was a shape the merge owner chose and forwarded as "adopted"; the re-audit showed it re-opened NETFR-3 in the most common real drop order (starvation before Trystero removes the peers). A merge owner's design call is still a change that owes an independent check.

- P10 #s191-fetch-before-push: another session pushed 38 commits (Pitch Masters) to master while this one was paused; the push was rejected. Fetch, list the remote-only commits, merge, re-run every gate including e2e, then push — never force.

- SESSION #s191-audit-fanout-is-the-spend: three multi-lens audits with two verifiers per finding at once burned ~2-4 M subagent tokens each and hit the org limit twice; run one audit at a time and verify only MED/HIGH findings.

## S190 (2026-09-25) - the S189 batch dispatched on 12 parallel worktree agents + 20 independent audits; deploy #3 (C9 footer arrow, Ra art, canon) and deploy #4 (wrath, swarm, render, units, perf, draft-atk; PROTOCOL 51) live and verified 4/4; weld + net carried to deploy #5; the org spend limit hit three times and cost one step per branch each time.

- P2 #s190-a-fix-for-a-guard-can-break-the-gesture-under-it: the S188 draft-panel click guard also swallowed the right-click put-back of a held tower — a regression hiding inside a correct fix. Every guard that swallows input must enumerate the gestures under it, not only the one it was written for.

- P5 #s190-render-state-that-outlives-sim-state-needs-the-sims-proof: the Pharaoh finale tail assumed PLAYING was the sim's landing gate; the real gate was hostTick's FIGHT block. A renderer that remembers past the sim must key on the sim's own evidence (his absence, the mass-clear epoch), never on a proxy.

- P3 #s190-a-merge-resolution-that-compiles-can-drop-an-argument: wrath's draftOverlay conflict had exactly one resolution that compiled — and it silently dropped the seat's picks (an optional parameter). tsc cannot see a missing optional argument; only a test through the real panel with nothing injected can.

- P4 #s190-a-red-by-design-tripwire-is-a-chain-not-a-line: the canon registry test failed on its FIRST expect; fixing that exposed nine more behind it. Count the whole chain before calling a canon fix "one row".

- P6 #s190-two-independent-confirmations-before-a-big-change: draft-atk's own phase 1 and its triage confirmed the dead ATK/PEN picks separately before a line changed across 12 strike sites — the cheapest insurance on a wide change.

- P7 #s190-a-test-at-rest-hides-a-velocity-bug: all four sonar tests used a victim standing still, so an additive shove looked right; a walking unit slid INTO the Kraken. Test physics with the motion the game actually has.

- P9 #s190-removing-a-zindex-changes-who-gets-the-click: deleting the draft panel's zIndex fixed C1 and silently let passive overlays above it pass clicks through to hidden draft tiles. A z-order change is an input change.

- SESSION #s190-commit-every-step-is-what-makes-a-spend-limit-cheap: the org spend limit killed every in-flight agent THREE times; each time the loss was one step per branch, because every brief said commit after every step and every workflow journals per agent. Parallelism is only as safe as its smallest unit of saved progress.

## S189 (2026-09-24) - deploy #2 shipped and verified 4/4; the owner's ten playtest corrections + every S188 carry-forward planned into a Council-reviewed six-worktree PDR; execution carried to a fresh account at 96% of the weekly quota.

- S189 - P1 #s189-a-failing-check-is-a-finding-about-the-check-first #verify-deploy #load-vs-defect: two reds this session were the MEASUREMENT, not the code. S188's three @visual e2e failures were machine load (69/69 on a quiet run in the candidate's own worktree), and verify-deploy's LIVE failure after the push was a stale dist/ in the main checkout, which had not built this session (4/4 after a rebuild). Both were re-run under the right conditions instead of waived or chased as bugs.

- S189 - PLAN #s189-read-the-code-before-the-fanout #quota #handoff-as-deliverable: one hand-read of main.ts answered the handoff's first question before any agent ran. A protocol mismatch cannot produce CONNECTION LOST, because the overlay needs PLAYING and a mismatched HELLO never gets there. When the owner called quota at 96%, stopping 14 in-flight read-only agents cost nothing: none had finished, and their scripts were saved into the repo for the next account to re-run as written.

- S189 - META #s189-a-write-and-a-commit-in-one-call-can-commit-the-old-file #session-state #race: S189's session-state was written and committed in the same Bash call three times, and all three commits hold S188's content. A hook's read-modify-rename (the .tmp.counter files) landed between the write and the git add, so the review card and the ledger then read S188 as the live session. Verify a state file in a SEPARATE call before committing or trusting it. And on a day two sessions closed, a ledger PASS that only matches the date is not evidence that this session did the step.

## S188 (2026-09-24) - the racials went live: all twelve level-0/5 mechanics, the 16 cards and the castle upgrade buttons, built on six parallel worktrees and merged by the main session; deploy #1 live and verified 4/4; plus the ecosystem-wide BOOT-READ GATE the owner ordered. Deploy #2 parked on a candidate branch behind 3 unclearable e2e reds.

- S188 - P0 #s188-printing-a-boot-list-is-not-reading-it #boot #enforcement #owner-frustration: pre-flight had PRINTED every boot file for months and nothing checked any was opened; S188 skimmed the traces through tail|cut and never opened S187's recorded research, then started re-deriving specs that were on disk. A rule the model must remember fails exactly when it matters, so it became a gate: boot reads are required, marked only by the Read tool, and Edit/Write/Agent/Workflow are denied until done. The build also exposed two latent defects the old advice hid: pre-flight's trace slug never matched a spaced project name (it pointed SPARK at another project's file), and an IN-PROGRESS plan in .claude/plans/ that pre-flight never scans. Grok caught a lost-update race in the first design (parallel Reads rewriting one JSON); per-read marker files remove it.

- S188 - P1 #s188-a-second-option-turns-a-latent-bug-live #draft #validation: applyDraftChoice had pushed ANY pick since S187 - harmless while the panel could only send the offered general, live the moment a racial option exists. Found by asking what the reducer ASSUMED about its input once the input's range widened (S187's own lesson, one layer up). And two S187 tests encoded the latent bug as expected behaviour - one chose ATK at the HP draft and passed only because nothing refused it. A test that passes because of a bug is a pin on the bug; re-pin it to the intent, never delete it.

- S188 - P2 #s188-the-tile-a-click-goes-through #ui-layering: the cards branch was right against its brief and the panel still let a click reach the board, because controls.ts listens on the raw canvas and knows nothing about Pixi overlays. The fill-count tripwire paired each plate with draftHitTest, a predicate only the overlay itself consults, so the guard was green over the leak (S182 lesson 2 again). Every opaque surface needs a predicate the INPUT layer asks, not one the surface asks itself.

- S188 - P3 #s188-new-buttons-expose-old-bugs #wire: the castle upgrades had been built since S187 with no button, and three latent bugs lived there unseen - castleHp above 2500 never crossed the wire, an HP buy moved only the ceiling, and bought stats survived a rematch. A feature nobody can press is a feature nobody has tested; wiring the UI is when the sim finally gets exercised.

- S188 - P4 #s188-a-boss-skill-that-never-fired #measure: rage halved the attack cycle and left the fire tick past its end, so since S168 an enraged Warlord landed NOTHING. It was found only because the frenzy test measured damage dealt instead of asserting the flag was set. Assert the OUTCOME the owner would see, never the flag that should cause it.

- S188 - P5 #s188-spawn-during-iteration #determinism: three mechanics make creatures from events inside the strike batch, and a JS Map visits entries added mid-loop, so a newborn would act on its birth tick - deterministic on host AND worker, so no hash oracle would ever catch it. The Council prime-audit named it before any code existed; the substrate queue made the right thing the easy thing for three branches at once.

- S188 - P6 #s188-cross-branch-defect-has-no-owner #merge: racial-a made damageConnector's attacker REQUIRED while racial-c called it with three arguments; each was green against master and only the merge failed. Then a census test failed on a trailing comment my own conflict resolution introduced. Typecheck plus the full suite after EVERY merge is what surfaced both.

- S188 - P7 #s188-save-every-step-paid #resilience: the org spend limit killed every agent at once, twice. Because the owner asked for wip commits every step, nothing was lost: salvage commits captured in-flight files and each agent resumed from its own transcript. Long parallel runs need commit-as-you-go as a standing brief rule, not an emergency message.

- S188 - SESSION #s188-do-not-ship-a-red-you-cannot-clear #deploy: the deploy-2 tree went 3/69 red on @visual sprite tests that were green an hour earlier, and the re-run could not start. Probably load - but a red you cannot clear is not shipped onto a build the owner is playing; the merges were parked on a candidate branch and master reset to the verified live commit.
