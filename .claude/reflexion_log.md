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

## S141 (2026-08-13) — the Stink Tower + the gatherer order queue + PROTOCOL 19→20

⚠ RECOVERED IN S142: these entries were written to session-state at S141 close but NEVER appended to this log —
the exact silent-loss class STEP 2.8.A exists to prevent. Restored verbatim from git (cb7b891).

- P1 #two-seats-rejected-the-same-thing-and-both-fixes-were-wrong: Both Council seats independently rejected the Stink Tower recipe on the same real ground — a Square dropped among three loose Circles auto-bonds into a match. Unanimity on the FINDING did not transfer to the FIX. Gemini proposed requiring the hub to have no bonds outside the component: a provable NO-OP, because componentOf follows every bond so an outside bond already pushes the size past 4. Grok proposed requiring degree-1 leaves: that REINTRODUCES the documented frequent-silent-no-build both shipped stars loosened their gates to avoid. Two independent reviewers agreeing raises confidence in the problem, not in their remedy — price those separately.

- P1 #the-severe-bug-lived-in-the-interaction-neither-seat-was-shown: D1 and D2 were reviewed as separate decisions and each was survivable alone. Together they were not: the recipe is easy to build by accident, an accidental tower self-removes when the player keeps building, and the shared death hook would have detonated on the player's OWN structure at exactly that moment. Neither seat found it because neither was asked about the pair. When decisions touch the same object, review the CROSS PRODUCT, not the list. The fix — derive destroyed-vs-deconstructed from whether the ANCHOR IS GONE — makes the bad case unrepresentable rather than merely guarded against.

- P1 #a-tsc-forcing-function-can-be-satisfied-without-doing-anything: stateHashFull has a NoUncovered guard that fails the build naming any unclassified field — and it fired correctly for bagsRemaining. But the actual hash PROJECTION is a hand-written string template with no executable link to that union. Adding the name to the union silences tsc while leaving the field UNHASHED, so the determinism oracle goes blind exactly where you thought you had just made it sighted. A forcing function proves someone was ASKED the question, never that they answered it in the place that runs.

- P2 #backlog-named-the-wrong-function-twice-and-the-feature-would-have-no-opped: Both B4's ruling table and the V6-1.4 slot say to put the queue predicate on `pickTargetSpark`. That is the BOT AVATAR's porch-only picker; it takes an rng and is never called for a gatherer. Wiring it there would have silently changed bot cruiser behaviour and left gatherers untouched — the feature would ship, pass review, and DO NOTHING. A spec naming a symbol is a hypothesis; grep the call graph before believing it.

- P2 #the-mechanic-the-ruling-forbids-was-already-shipped: B4 says in bold "DO NOT IMPLEMENT A PREDICATE/FILTER", and V6-1.2 had shipped exactly that as SET_GATHERER_PREFERENCE, with ABSOLUTE priority over distance. Nobody noticed for six sessions because the ruling lived in BACKLOG and the violation lived in code, and no one had cause to read both at once. Before building what a ruling asks for, check whether its explicit prohibition is already running.

- P4 #a-line-citation-drifted-twice-inside-the-session-that-was-fixing-it: Ten places cited main.ts:1706 for the hash call site. A.0 measured the truth as 1766. By the time I went to correct them it was 1793 — moved by MY OWN edits, in the same session. Renumbering would have shipped a fact with a half-life of hours. They are now symbol-anchored. A reference that decays from unrelated work is not documentation, it is a maintenance liability that regenerates its own backlog entry.

- P4 #a-stale-comment-can-be-an-instruction-to-break-production: voltkinFrames.ts stated two PNGs "were deleted in S107 P3". They are git-tracked, ship in dist/, and are loaded by six production modules. A dead-asset cleanup driven by that sentence would have broken live art with tsc AND the bundle gate green (they are string literals, invisible to both) — and public/** is in deploy.yml's paths filter, so the deletion would have deployed itself. The dangerous stale comment is not the one that is merely wrong; it is the one that reads as a licence to act.

- P0 #cap-the-a0-fan-out-or-it-eats-the-session: The A.0 workflow spawned 31 agents and hit the individual spend limit mid-run: 6 of 7 probes landed, every adversarial verification died, 1.85M subagent tokens spent. This is the SECOND consecutive session to lose work this way (S140 lost a 10-agent Council entirely). What saved it was that probe results are journalled per agent, so the six that finished were fully recoverable, and the missing probe was the one area I had already read by hand. Budget the fan-out, and read the highest-risk area yourself first so a partial A.0 still leaves you standing.
