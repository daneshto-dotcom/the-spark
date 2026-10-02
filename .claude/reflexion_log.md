## S194 (2026-10-02) - 6 deploys live and verified 4/4 (#1-#6, PROTOCOL 62→66): mres-card, intentStamp SEVER_BOND security fix + visuals-3, bots-tune, fixes + ui r1/r2, teams + entropy, coherence + weld-rebuild + rage + matchboard; ui r3, rules, visuals-6, mp, team-music carried to S195.

- #s194-integrator-agent: moving merges, gates and deploys to one integrator agent kept the merge owner's context light and shipped 3 deploys while the worktrees were still running.

- #s194-every-fix-round-adds-a-defect: 9 of 10 audits found a real defect in an all-green branch: T15's hold wiped on joiners via tick step-back, T11's cap not a total after a fall, T9's pants sweep drawn as deaths, T10's Pharaoh double LOST, T4's defender sparkle missing in FIGHT, T1's census holes. The audit is the product.

- #s194-crlf-in-audits: a Python rewrite flipped save.ts to CRLF (+3248 lines); an audit must compare git diff --stat size against the real change.

- #s194-permission-refusal-not-laundered: the integrator was refused a merge by the permission system; the owner's approval relayed by the merge owner was correctly NOT treated as consent by the subagent. Ask the owner, and have the merge owner act.

- #s194-owner-names-the-mechanism: the welded-tower 'rebuild' was exactly the owner's diagnosis (the pool refill read by the art as a new build); start a bug brief from his words.

- #s194-dev-server-watched-worktrees: the main checkout's vite watched and dep-scanned .claude/worktrees/** and timed e2e out; fixed in vite.config.

- #s194-measure-before-deciding: the pants cap: measured 250/500/1000 live pants, then chose 360 total; no guessed caps.

- P1 #s194-T2-auto-extracted: s193/visuals-racial (visuals-3) combined re-bench + independent audit CLEAN; merged with gates green; shipped deploy #2 6ae616da alongside the intentStamp SEVER_BOND security fix; verify-deploy 4/4

- P2 #s194-T3-auto-extracted: s193/mres-card audited by a non-author agent; merged with gates green; shipped deploy #1 2fe065fb with BUMP 63 + vite worktree-ignore fix; verify-deploy 4/4

- P5 #s194-T6-auto-extracted: s194/entropy: owner picked an option in chat; built; independent audit CLEAN; merged with full gates; shipped deploy #5 b2c9a478 (BUMP 65); verify-deploy 4/4

- P6 #s194-T7-auto-extracted: s194/bots-tune audited by a non-author agent; merged with gates green; shipped deploy #3 814f1871; verify-deploy 4/4

- P7 #s194-T8-auto-extracted: s194/fixes audited; merged with full gates; shipped deploy #4 d69475f6 (BUMP 64); verify-deploy 4/4; CI e2e reds on #4/#5 carried to S195 as a finding

- P13 #s194-T14-auto-extracted: s194/team-music: Desktop/SPARK_Team_Music_Prompts.html built from the owner's real prompts; no src, nothing to deploy; branch preserved, folds into S195 T12; checkpoint = live deploy #6 e9855ba9

- P15 #s194-T16-auto-extracted: s194/rage (R194-31) audit CLEAN; merged; BUMP 65->66 rode deploy #6 e9855ba9 (six sites + canon s6); verify-deploy 4/4

- P16 #s194-T17-auto-extracted: s194/mp live-MP harness check run; branch kept unmerged as an optional harness (carried, preserved); live deploy at check = #6 e9855ba9

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

