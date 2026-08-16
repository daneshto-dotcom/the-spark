## S145 (2026-08-16) — the playtest was right and the pipeline was green: a full bank was a hard deadlock

4 of 4 priorities shipped, live, deploy 4/4. The owner reported "the playtest didnt work" while 0 commits were
unpushed, the live hash was byte-identical to a local build and there were zero console errors. Measured twice in a
real browser: the castle bank fills in ~46 s and its composition then FREEZES for 11,449 further ticks — every build
tile "NEED n MORE" forever, zero towers ever built. Two shipped features each solved the other's problem and had
never been wired together. Four self-caught defects, two found by the e2e rather than by reasoning.

- #the-workaround-in-the-test-was-a-description-of-the-bug — click-to-build.spec.ts seeds the bank and its own comment says why: "a full bank of the wrong mix satisfies nothing". That sentence IS the defect. The suite was green and the shipped game was unplayable, because the workaround that made the test viable also made it blind. When a test comment explains why the real path is not testable, read it as a bug report.

- #two-features-that-solve-each-other-and-have-never-been-introduced — the S141 order queue was the remedy for the S144 build grid deadlock, and grep showed ZERO references between them. Neither was broken alone. The defect lived in the gap, which is exactly where no unit test looks.

- #the-council-was-confidently-wrong-about-my-own-codebase-twice — GEMINI staked its strongest challenge on "you cannot satisfy an 8-shape bill from a 7-slot bank" (bank u porch = 11, and voltkin@8 is literally why it exists) and on "host-only mutation = desync" (this is snapshot-authoritative, not lockstep). Both were reasoned from my prompt rather than the code. Verify every cited mechanism before adopting a REJECT.

- #groks-strictly-dominating-fix-did-not-fix-it — "drop stale cargo and re-seek" repairs staleness, but the bank is still FULL so the correct shape cannot be deposited either. A simpler fix is only dominant if it actually closes the loop; check it against the measured mechanism, not against elegance.

- #my-loop-guard-went-false-after-the-first-iteration — bankIsFull stops being true the moment you free one slot, so "free room while the bank is full" freed exactly one. The tower stalled two shapes short: a quieter copy of the very deadlock I was fixing. The guard has to be the POSTCONDITION you want (room for the whole bill), never the state you are leaving.

- #vitest-does-not-typecheck-so-my-tests-passed-on-a-type-that-does-not-exist — SparkType.Pentagon is undefined; eight assertions ran green against undefined cargo. tsc caught it, the test run never would have. Run tsc before believing a new test file.

- #the-fallthrough-that-kept-an-idle-player-earning-spent-the-slots-an-active-player-had-just-freed — B4 nearest-of-any is correct for an unattended player and a leak for a directed one. A rule ruled for one regime should be suspended in the regime it was never ruled about, not deleted.

- #the-owner-said-it-didnt-work-and-the-deploy-was-perfect — 0 unpushed, live hash byte-identical, verify-deploy 4/4, 0 console errors. Everything the pipeline could check was green; the game was simply unwinnable. Check the GAME, not the delivery, when a playtest fails.

## S144 (2026-08-14) — the castle "blob" became a TD build grid: click a tower, drag it, place it

3 of 3 priorities shipped, live, deploy 4/4. The owner's playtest complaint was not that the castle panel was
ugly — it contained ZERO towers. Click-to-build now stamps a recipe's REAL geometry from banked shapes and lets
the existing matcher ignite it, all six recipes, verified igniting AND surviving revalidation. Four self-caught
defects, two of them found by the e2e test rather than by reasoning, and one mis-attribution corrected on record.

- #a0-killed-the-headline-priority-and-that-was-the-win - the flip was LOCKED, 13 sessions overdue and playtest-passed; measuring first proved it unsafe. A.0 pays most exactly when the priority looks settled.

- #both-seats-proposed-a-broken-fix-again-third-session-running - Grok a provable no-op, Gemini an anti-cheat regression, and the constraint refuting Gemini was IN THE DOCBLOCK BOTH WERE READING. Price the diagnosis and the prescription apart, every time.

- #a-reviewer-asserted-it-had-searched-and-had-not - Grok stated no comment treated those fields as ephemeral; the comment was in the interface it was reasoning about. It also named 12 symbols, 0 of which exist. Grep-verify every cited symbol before triage.

- #i-had-to-refute-my-own-pdr - I claimed hash-oracle divergence; the runtime oracle cannot see spawners at all. PRIME-AUDIT your own severity claims, not only the reviewers'.

- #the-owner-was-doing-a-chore-ci-already-performed - 'CI cannot verify a protocol bump' was false for an unknown number of sessions; both tests pass in CI in 5.6s. Before writing a manual step into a handoff, check whether something already covers it.

- #fully-red-was-half-green-in-both-environments - the quarantine lane was ~50% passing locally AND in CI. A remembered failure string had become a settled fact nobody re-measured.

- #the-instrument-was-hiding-its-own-diagnosis - waitForWorld swallowed every poll error, so a dead page and a slow one produced identical messages. Two competing causal stories survived in-repo for sessions because of one bare catch.

- #the-gating-lane-was-red-on-clean-master-and-nothing-reported-it - e2e.yml has no push trigger. Dispatch it at boot; green-on-your-last-PR is not evidence that master is green now.

- #the-generalised-method-found-a-second-bug-the-specific-fix-would-have-missed - comparing mutable fields against serializer output found a 65-session-old debuff hole. Fix the class, not the instance.

- #cap-the-fan-out-third-consecutive-session - 7 agents died on the spend limit with ZERO recoverable results; 3 tight probes landed 3/3. Read the highest-risk area by hand FIRST.

- #untagged - 

- #untagged - 

- #untagged - 

- #the-call-site-said-structural-the-callee-guard-said-event-driven - Gemini's C2 claimed bypassing the bonding functions would leave stamped shapes inert. I verified it by reading the CALL SITE - runGodlyMatcherCore calls runSpawnerIgnition and runDefenderIgnition unconditionally, before any effects scan - and concluded 'structural scan, only voltkin is affected'. Wrong. Both callees OPEN with their own hasTopologyChange sweep and early-return without one. It was 6 of 6, not 1 of 6, and without the emit the whole feature would have shipped dead with no error anywhere. An unconditional call proves nothing about whether the callee runs.

- #my-pure-geometry-module-silently-rewired-the-whole-codebase - I imported recipe modules into blueprints.ts for their constants and documented the side-effect registration as a deliberate BENEFIT. The real blast radius was the entire repo: world.ts imports the blueprint reducer, so every module got all six recipes registered, which made recipeStillSatisfied's documented unregistered-recipe fallback unreachable and broke a shipped test. I reasoned about the hazard, talked myself into it, and was wrong about its scope. Mirror-plus-cross-check-test was the right answer.

- #the-strongest-challenge-came-from-the-seat-that-voted-adopt - Grok voted REJECT with 5 challenges; 4 were disproportionate (frozen geometry would delete the documented self-healing contract AND make towers immune to creature chewing) and Gemini overruled all 4. But Gemini - which voted ADOPT-WITH-CHANGES - supplied the one critical defect. A REJECT vote is not a proxy for finding real bugs. Read the challenges, not votes.

- #the-blob-was-not-ugly-the-towers-were-simply-absent - The owner said the castle panel 'is a blob' and should 'actually prebuild towers or godlies'. I could have spent the priority restyling. The A.0 probe found the real defect: castlePanel.ts contained ZERO references to any tower or recipe and imported nothing from godlyRecipes/ or codex*. Its six buttons are PRIMITIVES, which reads as ugly recipes. Nothing needed prettifying; the content was missing. Read what the surface actually contains before interpreting an aesthetic complaint as an aesthetic problem.

- #the-render-caught-two-things-thirteen-green-assertions-could-not - 13/13 layout assertions passed and both remaining defects were invisible to them. Screenshotting the real panel showed voltkin's 8-chain rendering as invisible specks at tile scale, and surfaced a gameplay fact no unit test would model: a 7/7 FULL bank of randomly-hauled shapes satisfies NO recipe, and a full bank blocks further deliveries. castlePanel.ts already warned 'Look at the render' from a prior session's overflow bug. Obeying it paid twice.

- #one-pass-and-one-fail-is-not-attribution - A bomb.spec placement test failed, passed without my changes, and failed again with them. I wrote 'confirmed: it IS my regression' on that evidence and started bisecting. It was the repo's known hand-drag placement flake: the same failure then appeared in rainbow.spec, both went green on rerun, and the final gating lane was 39/39. For a timing-sensitive test, one pass plus one fail is noise, not a verdict - and I had already been handed a bisect result that pointed at a file whose diff was provably inert.

- #my-own-safety-cleanup-made-the-feature-i-was-building-impossible - I disarmed the held tower whenever the panel closed, reasoning that a ghost must not outlive its panel. But EVERY click outside the panel closes it - including the placing click and an illegal-spot click. So the 'keep it in hand on an illegal click' rule I had just written for better UX could never fire, and a misjudged drop silently cost the player their selection. A defensive cleanup that sounded obviously right silently deleted a feature; the e2e test caught it, reasoning had not.

- #the-getter-lied-and-the-lie-looked-exactly-like-the-bug - getUiPoints() hardcoded armed:null in its closed-panel early-return. Once carrying could outlive the panel, that made the harness report an empty-handed player while a ghost was visibly following the cursor - and the false report was indistinguishable from the real behaviour bug I had just fixed, so I nearly 'fixed' working behaviour twice. An instrument's early-return branches need the same care as its main path.

## S143 (2026-08-13) — the three flip gates closed; a 3-week "intermittent" CI red was an unsatisfiable assertion

3 of 3 priorities shipped, deployed 4/4, CI-verified with two consecutive green gating runs. The sim-worker flip
is still deliberately NOT taken, but every measured blocker is closed and the flip is now a one-constant change.
Four self-corrections this session, three of them caught by instruments I had just written.

- #three-sessions-called-it-throughput-and-it-was-an-unsatisfiable-assertion - the gating red was on record as "CI throughput OR a real stall, unresolved". Both wrong: `primitives.length > sampleA` is a strict-increase test on a counter that FALLS (razing + deliberate MID severs), and one attempt sampled 33 then failed at 32. No timeout, retry or faster runner could ever have passed it. Before blaming an environment, check whether the assertion can be satisfied AT ALL.

- #the-error-message-is-why-it-stayed-unresolved-for-three-sessions - one message covered dead-page, unmet-predicate and out-of-runway, so nobody could choose between hypotheses. The highest-value fix was not the oracle but making the failure SAY which of the three it is — including saying outright when a signal must NOT be read as a product failure.

- #my-own-new-diagnostic-confidently-asserted-a-product-failure-that-did-not-exist - I built the growth oracle on `nextPrimitiveId`, which is host-only and FROZEN on a worker mirror. It printed "INSTRUMENT OK, PREDICATE GENUINELY UNMET: a real product failure" while the game built normally. Caught only by dumping state and seeing cursor 33 against a live primitive with id 38. An assertive diagnostic is not a correct one — I had written the very warning it violated one function above.

- #the-guard-asked-about-a-url-spelling-not-the-state-it-guarded - probeHarness refused to arm on `get('worker') === '1'`. Not a parse bug: it needed "is the worker active?". The two agree today and are OPPOSITE once the default flips, so the harness would arm exactly when it must not. A guard phrased against the spelling of an input silently stops tracking the state it guards when the default moves.

- #the-second-path-was-correct-only-by-accident - two host INTENT apply paths existed and only one was worker-aware. No test could distinguish them because BOTH are correct today (a promoted host has a null driver); the divergence only becomes a bug in a regime that does not exist yet. Behavioural tests cannot see this class — it is a property of the call graph.

- #the-only-thing-that-arms-the-fallback-was-the-flag-a-hang-cannot-set - the driver set `failed` solely from explicit error events, so a worker hanging WITHOUT throwing froze the game permanently while the direct-sim fallback could never fire. A recovery path is only real if the failure it recovers from can actually reach it.

- #a-sum-cannot-see-a-per-family-hole - the guard that existed specifically to stop the wide compare being decorative added TEN family sizes and compared >0, satisfied by any one. Measured: defenders 0 for all 300 frames while it sat green on poops. An aggregate assertion proves something about the aggregate and nothing about any member.

- #my-own-new-guard-caught-my-own-first-version-of-it - the first per-family table read the FINAL frame and failed on rainbows: 0, but only because a rainbow spawns and despawns mid-run, so it WAS compared on every frame it existed. Final-frame reads under-report every transient family. The guard was right and my use of it was wrong — the good failure mode.

- #the-fix-for-an-unforced-site-was-itself-unforced - I added gathererOrders to structuralSignature citing its own docblock about UNFORCED sites, then mutation-tested it: deleting BOTH terms left the entire suite green. My fix for a decorative site was decorative. Mutation-test the guard, never just the code.

- #i-invalidated-my-own-test-run-by-editing-source-during-it - a gating run reported 4 failures; I had edited src/ WHILE it executed against a live vite dev server, including a window where a function was referenced before it existed. The clean rerun was 36/36. I nearly attributed 3 phantom regressions to my own correct changes. Never edit sources while their suite runs, and treat an unexplained multi-failure jump as suspect first.

- SESSION #verify-the-probe-before-you-act-on-it - the A.0 probes were excellent and still wrong in places: one reported "seeds none of the families since S135" which measurement refuted (the real gap was exactly two). Every load-bearing claim was grep-verified before use, and 14/14 symbols cited in new comments were confirmed on disk. Probes are evidence to check, not conclusions to adopt.

## S142 (2026-08-13) — A.0 killed the headline priority; the owner's 2-browser chore was never necessary

3 of 3 priorities shipped. The session set out to flip the sim worker default-on (LOCKED for S129, 13 sessions
overdue, playtest already passed) and measuring first proved the flip unsafe — so the flip was DEFERRED and the
safety work shipped instead. Separately: both real-WebRTC protocol-mismatch tests were found PASSING IN CI, so
the standing "only the owner can verify a bump" ritual was false and is now a dedicated gating lane.

- #a0-killed-the-headline-priority-and-that-was-the-win - the flip was LOCKED, 13 sessions overdue and playtest-passed; measuring first proved it unsafe. A.0 pays most exactly when the priority looks settled.

- #both-seats-proposed-a-broken-fix-again-third-session-running - Grok a provable no-op, Gemini an anti-cheat regression, and the constraint refuting Gemini was IN THE DOCBLOCK BOTH WERE READING. Price the diagnosis and the prescription apart, every time.

- #a-reviewer-asserted-it-had-searched-and-had-not - Grok stated no comment treated those fields as ephemeral; the comment was in the interface it was reasoning about. It also named 12 symbols, 0 of which exist. Grep-verify every cited symbol before triage.

- #i-had-to-refute-my-own-pdr - I claimed hash-oracle divergence; the runtime oracle cannot see spawners at all. PRIME-AUDIT your own severity claims, not only the reviewers'.

- #the-owner-was-doing-a-chore-ci-already-performed - 'CI cannot verify a protocol bump' was false for an unknown number of sessions; both tests pass in CI in 5.6s. Before writing a manual step into a handoff, check whether something already covers it.

- #fully-red-was-half-green-in-both-environments - the quarantine lane was ~50% passing locally AND in CI. A remembered failure string had become a settled fact nobody re-measured.

- #the-instrument-was-hiding-its-own-diagnosis - waitForWorld swallowed every poll error, so a dead page and a slow one produced identical messages. Two competing causal stories survived in-repo for sessions because of one bare catch.

- #the-gating-lane-was-red-on-clean-master-and-nothing-reported-it - e2e.yml has no push trigger. Dispatch it at boot; green-on-your-last-PR is not evidence that master is green now.

- #the-generalised-method-found-a-second-bug-the-specific-fix-would-have-missed - comparing mutable fields against serializer output found a 65-session-old debuff hole. Fix the class, not the instance.

- #cap-the-fan-out-third-consecutive-session - 7 agents died on the spend limit with ZERO recoverable results; 3 tight probes landed 3/3. Read the highest-risk area by hand FIRST.
