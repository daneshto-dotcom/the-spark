## S195 (2026-10-06) - ten deploys live and verified 4/4 (S195-#1..#10, PROTOCOL 66→70): the four S194 carries, ci-perf, the owner's 11-tree cloud train, graphics tiers, teams, team tiles (dormant), network A+B codec (27x less bandwidth per joiner).

- #s195-limit-resume: three agents died together on a spend limit mid-step; every one resumed exactly from the top of its progress file because each saved every <=5 min — the save cadence is what made the limit cost minutes, not the session.

- #s195-audit-catches-guard-holes: the ci-perf audit found a test guard that a magic comment line could defeat on ANY step — a green guard is only as good as the mutation that tries to fool it; mutate the guard, not just the code.

- #s195-pin-what-was-delivered: a priority binding pinned 'PROTOCOL_VERSION = 67' and went red when later work correctly moved it to 68 — bind the permanent record of what a priority delivered (its changelog line), never a value the plan expects to change.

- #s195-cloud-parallel-train: an 11-tree cloud run landed on ONE integration branch with per-tree audits; the desktop merge owner re-ran the full e2e lanes it could not (its 4 'environment' reds were green here) and landed it as one deploy — a parallel session is safe when it integrates on its own branch and the desktop owns the final verdict.

- #s195-fix-rounds-add-defects: net-delta needed two fix rounds — round 1 fixed F1-F4 and the re-audit found a NEW security MED (non-host delta-base eviction: 'accepted' meant parsed, not authorized) and a half-fixed rejoin; re-audit every fix round, never trust 'fixed' from the author.

- A0 #s195-A0-carries-land-first: landing the four S194 carries one at a time (rules+bump 67, visuals-6, ui r3, mp) before any new tree gave every S195 tree a current base; the integrator agent shipped four verified deploys while the merge owner talked to the owner.

- T21 #s195-T21-ci-was-test-bugs: the 'CI-only' fog/hunter reds were a test reading the whole stage while title embers drifted it (fog) and a 95 s economy wait on a slow runner (hunter) — measure the runner before blaming it; the music 'flake' was a real product bug.

- T24 #s195-T24-toggle-must-reach-the-cost: the old graphics checkbox applied live but only removed two filters; the frame cost was re-stroking ~500 bond lines every frame. A quality setting must be measured against the real cost centre (MINIMAL cut weak-PC frame time ~42%).

- T12 #s195-T12-layout-map-not-reseat: moving board position into world.layout (seat = identity, zone map = position) made every existing f(seat, layout) reader follow the new team shapes with no call-site edits and kept FFA byte-identical.

- N19 #s195-N19-owner-gate-flag: the tiles audit caught a visible change the owner had not approved; it shipped OFF behind a one-line flag with Desktop screenshots instead of being reverted or shipped.

- NET #s195-NET-byte-identity-oracle: delta snapshots were proven by rebuilding the exact legacy wire string over a lossy simulated link (14,707/14,707 frames) — reconstruct-and-compare at the transport boundary beats reasoning about a codec.

- N20 #s195-N20-research-states-the-clash: the character-art research named where it conflicts with earlier owner rulings (S96/S108) and asked for an explicit yes instead of quietly building around them.

- CLOUD #s195-CLOUD-integration-branch: see cloud-parallel-train; the desktop re-ran the e2e the cloud box could not and its four 'environment' reds were green here.

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
