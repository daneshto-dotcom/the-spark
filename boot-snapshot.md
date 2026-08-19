# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-19 | Session: S147 | Branch: master | Commit: af932ea | PROTOCOL_VERSION: **24**

**S147 shipped the first two build sessions of the tower-defence roadmap, both LIVE and deploy-verified 4/4.**
**P1 THE MATCH CLOCK gave the sim a deterministic BUILD/FIGHT heartbeat (protocol 22->23). P2 capped the game**
**at FOUR players and adapted the dashboard (23->24). P3 (S148 zones) is fully planned but NOT started -**
**deferred at 58% YELLOW context rather than stop mid-way through a hashed-geometry migration.**

## Next Steps

1. **START S148 (P3 carry-forward) - ZONES, CASTLE ANCHORS, BUILD LEGALITY, ECONOMY RE-TUNE.**
   Read `.claude/plans-archive/2026-08-19_SCOPE_AMENDMENT_S147_R41_4PLAYER_CAP_IN-PROGRESS.md` FIRST -
   it holds the full A.0 (E1-E12), the HOW-only Council verdicts and the verified geometry, so this
   session starts at implementation with zero re-discovery.
   - New `src/state/zones.ts`: zoneOf(pos, layout), zoneOwner(seat, layout), zoneCastleAnchor(seat, layout).
   - PITCH_2P: one vertical split at x=960; goalmouth castles at (120,540) and (1800,540).
   - QUADRANTS_4P: splits at x=960/y=540, clock order per R2; corner castles at
     (130,130) (1790,130) (1790,950) (130,950) - all VERIFIED to fit KEEP_W=74 / KEEP_H=58, no clipping.
   - The QUARRY (960,540 r=125) belongs to NO zone (blueprint Q6). Evaluate it FIRST by SQUARED distance
     (no Math.sqrt), then partition with consistent strict inequalities so no pixel is claimed twice.
     Do NOT integerize positions - they are hashed floats already identical on both peers.
   - `layout` becomes a hashed World field. Protocol bump 24->25: castleAnchor is shared host+client
     geometry and protocol.ts already records it as "A SHARED CONSTANT BOTH PEERS COMPUTE FROM".
   - **BUILD LEGALITY IS SIX CALL SITES, NOT THREE** (A.0 E1 - the headline finding):
     placePrimitive.ts:39, placeFromFree.ts:55, blueprintLegality.ts:35, PLUS bots/botBrain.ts:24,
     input/controls.ts:58, input/dragPreview.ts:31. Miss the last three and the drag ghost shows
     "legal" exactly where the host refuses. ONE canonical canBuildAt(pos, seat, layout) imported by all
     six - both Council seats independently made this their highest-value change.
   - castleAnchor has THIRTEEN non-test consumers spanning sim AND render (castlePanel x3,
     gathererRenderer x2, castleBank, gameMode x2, gathererLifecycle x2, main.ts keepCenter).
   - **RE-TUNE THE ECONOMY IN THE SAME SESSION**: the haul grows 420px -> ~1100px (~2.6x). MEASURE.
     Favourable: gatherer-dependent e2e specs inject bank contents directly rather than waiting on
     hauls, so they will not silently time out.
   - Exit gate: both layouts total+correct at borders and dead centre; anchors inside their own zone;
     cross-zone build refused at all SIX sites (host AND preview AND bots agree); host/worker/promoted
     successor agree bit-for-bit on anchors; a first tower affordable in one 90s BUILD on both boards.
2. Then S149: border WALLS + gatherer SHELTER together. Owner ruled R46 at the S147 review gate - the
   wall object stays in S149, coupled to the shelter rule, both being phase-toggled movement mechanics.
3. Then S150 castle HP/guns/elimination -> S151 towers+orders -> S152 fix/scrap -> S153 projectiles+
   goblins -> S154 roster -> S155 footer -> S156 modes -> S157+ balance.
4. Carry-forwards: CF1 (worker click-to-build, opt-in only, zero live blast radius), CF-S147-b (promote
   the 5-site protocol-bump checklist to LOCKED_DECISIONS - the drift has recurred FIVE times),
   CF-S147-c (delete the six acknowledged hazard rows when HAZARD_SPAWN_ENABLED flips back on),
   CF-S147-e (lobby colour/race picker - substrate exists, needs no sim change).

## Blockers

None blocking S148. R46 resolved the only owner-gated question at the review gate.

## Traps (still live)

- **Date.now() in sim code IS the desync** - everything is tick-derived. 90s = 5400 ticks @ 60Hz.
- Never Math.random() in sim code - seeded mulberry32 only.
- FIELD_COVERAGE is a forcing function: it NAMES an omitted World field at compile time. Never route around it.
  It is the ONLY tsc-forced site of the NINE a hashed World scalar needs; the other eight are silent.
- **vitest does NOT typecheck** - run tsc before believing a new spec. It caught 3 errors in a new file this session.
- hostTick.differential.test.ts is live-vs-FROZEN-TRANSCRIPTION, NOT host-vs-worker. It is pinned to
  matchPhase=FIGHT and a phase edge inside a scenario breaks all 8. PHASE_DURATION_TICKS must stay > 800.
- The REAL host-vs-worker gate is workerSim.differential.test.ts (300 frames, netSnapshot JSON + wide hash).
- **A protocol bump is FIVE sites**, not two: the const, the narrative changelog, the HelloMsg.protoVersion
  type literal (a tsc tripwire), protocol.test.ts pinned assertion AND its title, and LOCAL_PROTO_V in e2e.
- **The repo has MIXED line endings** - several test files are natively CRLF. Use single-line ASCII-only
  anchors for programmatic patching, and always write python with newline set to empty string, or you
  silently convert LF->CRLF (which PASSES CI and fails only locally).
- Heredocs into `python -` mangle em-dashes and break on long payloads - split into smaller chunks.
- file_lacks MCV bindings fail on your OWN comments: assert the CODE SHAPE, not the bare word.
- MCV grep_count takes `pattern` (a REGEX) + `op` + `value` - NOT `needle`/`count`.
- Two priorities editing the same file in one session invalidate each other verification bindings -
  earlier priorities should pin the DURABLE artefact, not the current value.
- **PLAYER_COLORS stays at SIX** (a race roster, R45). NEVER shrink it to the seat cap.
- Big Workflow fan-outs die on the spend limit (3 sessions running). Hand-run probes were cheaper AND better.
- e2e rainbow.spec flakes under full-suite load and passes in isolation - do not bisect a single failure.
- A green suite is NOT evidence for render work: the phase-banner pulse bug was only visible in a real frame.
- The in-app Browser pane cannot verify SPARK: an undisplayed pane does not composite, so rAF is paused and
  the Pixi ticker never advances. Use Playwright for screenshots.

## Pending Backlog

(BACKLOG.md is superseded as the forward plan by SPARK_TD_BLUEPRINT.md + SPARK_TD_SESSION_SPECS.md
 plus the S147 scope amendment in .claude/plans-archive/.)

## Recent Reflexion (last 2 sessions)

## S147 (2026-08-19) — the tower-defence roadmap starts; A.0 predicted the big break, and the owner stopped me deleting a design axis

Shipped 2/2 code priorities, both live and deploy-verified 4/4. P1 THE MATCH CLOCK gave the sim a
deterministic BUILD/FIGHT heartbeat (PROTOCOL 22->23); P2 capped the game at FOUR players and made the
dashboard tell the truth about it (23->24). P3 (S148 zones) was deliberately NOT started at 58% YELLOW
rather than stop half-way through a hashed-geometry migration. The state-discovery pass paid for itself
twice over: it predicted the exact eight-scenario determinism break before a line was written, and it
caught that the spec's own Step 0 instruction would have done the OPPOSITE of what the ruling intended.

- #a0-predicted-the-exact-break-and-that-is-the-whole-value — A.0 delta D3 predicted that gating tickScoring to FIGHT would break ALL EIGHT hostTick.differential scenarios, because that harness is live-vs-FROZEN-transcription (which scores unconditionally), not the host-vs-worker gate the spec called it. The build then broke exactly those eight and nothing else. The value was not the fix — it was that a wall of red in the determinism gate arrived as a KNOWN, pre-reasoned event instead of a desync panic. Read what a test harness actually IS before trusting the name a plan gives it.

- #cadence-zero-would-have-meant-maximum-frequency — Both the blueprint (R14) and the session spec said to switch the four hazards off by setting "cadence to zero". Measuring the mechanism showed that would have shipped the OPPOSITE: the cadence is a spark COUNTDOWN (MIN + floor(rng()*(MAX-MIN+1))), so zero fires on the very next spark. The owner-approved spec was WRONG about its own implementation while being right about its intent. Implement the INTENT, verified against the mechanism — and gating at the dispatch site turned out to be cheaper too, because it leaves every RNG stream byte-identical.

- #the-council-rejected-me-on-a-premise-i-could-refute-and-i-took-the-fix-anyway — GEMINI-AUDITOR returned REJECT on a specific desync: the host freezes for NONET while a worker does not, so re-stamping the deadline from the current tick drifts. The premise was empirically FALSE — workerSim.ts:485 implements the same freeze and world.sudoku is hashed, so both freeze symmetrically. But the recommended fix (+= instead of = tick +) was still strictly better, so I adopted it on better grounds than it was argued, and hardened it further (a WHILE loop with the guard hoisted, which Gemini did not propose and which is what actually preserves phase parity across a long freeze). Audit the reasoning, not the verdict: a wrong argument can still point at a real improvement, and a REJECT is not a veto.

- #counting-council-verdicts-would-have-shipped-two-defects — R1 came back 1 ADOPT-WITH-CHANGES vs 1 REJECT. Tallying verdicts would have led either to a 9th differential scenario that CANNOT pass (both seats spotted the harness problem; only Gemini gave the correct remedy) or to rewriting a data model the design names for a requirement no ruling asks for (Grok C4, rejected). The two seats agreed from opposite directions and only one supplied a usable fix. Battle Ledgers must record the REASONING per challenge, because that is the part that decides.

- #the-owner-scoped-the-council-mid-session-and-it-was-the-right-call — Mid-execution the owner ruled: Council is here to help decide HOW, never to change the game design. That instantly resolved Grok C4 (replace the named phaseEndsAtTick field) as out of bounds regardless of its merits, and it matched where the evidence already pointed. Externally sourced advice drifts toward redesign because redesign is the easiest thing to have an opinion about; the owner's scope rule is the cheapest defence against it. Record it as constitutional for the session, not as a passing remark.

- #my-own-anti-vacuity-check-caught-my-own-useless-test — I wrote an e2e asserting no hazards spawn in 2.5 s. At the shipped 0.15 sparks/s rate with cadences measured in SPARKS, the first hazard is ~50-120 s away even ENABLED — so the test was guaranteed to pass regardless of the flag. The only reason it did not ship green-and-worthless is that I had added an anti-vacuity assertion (sparks > 0), which failed honestly. Every negative test needs a positive control proving the thing it watches for was actually POSSIBLE. Rewritten as a real control: 12 sparks/s + 2-spark cadence with the flag withheld, asserting the ID allocators never advanced (so nothing was minted-then-reaped).

- #retained-not-deleted-has-to-mean-still-tested — R28 said the leader decay is "switched OFF (retained, not deleted)". Gating the call site alone satisfied the letter of that and quietly broke three S107 tests, whose only green paths would have been deletion or weakening into asserting nothing. Extracting applyLeaderDecay as an export let the tests drive the mechanic directly, so the arithmetic stays verified for the balance session that is expected to re-enable it. "Retained" means reachable and still proven, not merely still present in the file.

- #i-converted-thirteen-files-to-crlf-and-it-would-have-passed-ci — My python patch writes flipped 13 files LF->CRLF (Windows text-mode newline translation against an LF tree with core.autocrlf=true). Git normalizes on commit, so the diffs looked tiny and CI would have been GREEN while a source-text assertion failed on the developer machine — the worst direction for a defect to point. Write with newline=''. And my first line-ending audit was itself junk: grep -c $'\r' degenerated to an empty match and reported every line. Verify byte facts with a byte count.

- #grep-count-uses-pattern-not-needle — Two of 53 MCV bindings hard-failed with "assertion missing field 'pattern'": grep_count takes {path, pattern (a REGEX), op, value}, while file_contains/file_lacks take {path, needle}. My memory said "the key is needle, there is no pattern key" — true per-type, wrong as a generalisation. A third binding was logically wrong rather than malformed: file_lacks "PHASE_CHANGED" failed because the file legitimately MENTIONS the token in the comment explaining why no such effect is emitted. Running the verifier is not optional; it found 3 real defects.

- #the-spend-limit-ate-seven-of-eight-probes-and-hand-work-was-better-anyway — The 8-probe A.0 Workflow lost 7 probes plus synthesis to the individual spend limit — the third session running (S140, S141, now S147). One result was salvageable from journal.jsonl. Re-running the seven by hand with targeted greps cost far less, was fully self-verified, and produced the session's two highest-consequence findings (D1 cadence inversion, D3 frozen harness). For forensic probes on a codebase I can read directly, hand-work beats fan-out; save the fan-out for genuinely parallel breadth.

- #two-jobs-in-one-function-made-a-test-regress-for-a-non-bug — tickScoring both accrues income AND re-derives scoreProgress = max(scoreByPlayer). Gating the whole call to FIGHT therefore also gated the derivation, which regressed hunter.spec.ts — it writes scoreByPlayer directly and leaned on tickScoring to notice. Production was never affected (addScore/spendScore each recompute scoreProgress at their own call sites), so the right fix was in the spec, with the reasoning written down so a future session does not "fix" the sim from that line. When gating a function, enumerate everything it does, not just the thing you are gating.

- #the-owner-stopped-me-deleting-a-design-axis — I found PLAYER_COLORS had 7 entries against a new 4-player cap, called it a trap, and proposed cutting the palette to 4. The owner corrected me: each colour is a future CLASS/RACE picked in the pre-game lobby, so six colours with a four-player cap is CORRECT. My 'fix' would have deleted a design axis and had to be undone later. A surplus is not always dead code - before shrinking a collection to match a cap, ask what the collection MEANS. Gemini had flagged 'decouple seat count from palette size' as hygiene; the owner confirmed it was design. The right work was decoupling, and it turned out the sim was already choice-ready.

- #a-readonly-tuple-is-a-forcing-function — Retiring the 7th palette entry could have shipped four silent undefined colours. It could not, because PLAYER_COLORS is declared `as const` - a readonly TUPLE, not number[] - so tsc named every index-6 read (botSetupOverlay x3, titleScreen x1). The same change against a plain array would have compiled clean and broken at runtime. Worth remembering when authoring a palette or lookup table: `as const` buys compiler enforcement for free.

- #the-dashboard-was-lying-in-a-hardcoded-string — The lobby status read 'press Begin Match (up to 6)' as a LITERAL while MAX_PLAYERS became 4, so the UI advertised a seat count the host would refuse. The seat COUNT beside it was derived; only the cap in the prose was not. Interpolating fixed it. Any user-facing sentence containing a number that also exists as a constant is a latent lie - and a test asserting the literal will happily lock the lie in place, which is exactly what had happened.

- #re-pin-derived-not-re-literalled — 14 assertions broke on the cap change. The tempting fix is s/6/4/. The right fix was deriving each from MAX_PLAYERS - an occ(n) helper for rack occupancy, Array.from for seat ranges, fair = SHIPPED / MAX_PLAYERS for the probe - because a literal is what rotted in the first place. The probe test even documented its own literal as 'the plausible hand-typed rounding', which silently stopped being true the moment the cap moved. Re-literalling would have set the same trap for the next cap change.

- #a-canary-test-earned-its-keep — nplayerSeating.test.ts pins the exact palette hexes with a docblock explaining that e2e duplicates them and must be swept in the SAME commit. It fired, and it was right: e2e/nplayer.spec.ts carried its own copy of the array including the retired silver. Without that canary the e2e copy would have drifted silently. When you must duplicate a constant across a bundling boundary, the canary is the cheap half of the deal - and it only works because someone wrote down WHY it exists.

- #my-own-verification-bindings-invalidated-each-other — P1's verification[] asserted PROTOCOL_VERSION = 23. P2 then legitimately bumped it to 24 in the same session, and the MCV verifier hard-failed on P1 - not on a defect, but on history. Bindings assert CURRENT file state, so two priorities editing the same file in one session can invalidate each other. Fix: earlier priorities should pin the DURABLE artefact (its changelog entry) and leave the current-value assertion to whichever priority last moved it.

- #file_lacks-fails-on-your-own-comment-twice — Second time this session: a file_lacks binding failed because the file legitimately MENTIONS the token in a comment explaining its absence - PHASE_CHANGED in P1, 0xc0c8d0 in P2. A file_lacks needle must be the CODE SHAPE, not the word: `type: 'PHASE_CHANGED'` and `, 0xc0c8d0]` rather than the bare identifier. Writing a good comment about a removal will break a lazy binding about that removal.

- #the-repo-has-mixed-line-endings-and-my-audit-was-wrong — After P1 I concluded 'the working tree is LF'. Wrong - it is MIXED: nplayerSeating.test.ts, probeHarness.test.ts and e2e/nplayer.spec.ts are natively CRLF and I never touched them. That is why multi-line python anchors kept failing with count=0 while single-line ones worked. Correct habit: single-line, ASCII-only anchors for programmatic patching, since they are agnostic to both line endings and em-dash mangling through a heredoc.

## S146 (2026-08-16) — the owner pivoted the game mid-session; two of my confident readings were wrong

Shipped 2/2 code priorities (loose-spark repulsion deleted; the castle inventory became a limitless per-type tally,
PROTOCOL 21->22), live and deploy-verified 4/4. The owner then redefined SPARK as a classical tower defence via
handwritten notes and two hand-drawn maps, and the session became a design + planning session: 40 rulings across six
review rounds, a 3-way Council on rewrite-vs-adapt (unanimous ADAPT), and an 11-session build spec written for
autonomous execution. The audit of my own plan found more than the plan did.

- #the-council-told-me-to-delete-the-bots-supply-chain — BOTH external seats independently recommended retiring PULL_FROM_BANK as dead weight under a limitless inventory. botBrain.ts:161 + botController.ts:190 make PULL the ENTIRE bot supply chain (gatherer -> bank -> porch -> place); retiring it leaves every bot opponent unable to build, in every mode. Neither seat reads the codebase. Grep the consumers of anything a reviewer calls vestigial BEFORE agreeing.

- #empirical-refutes-plausible-criticals — four confident Council claims about MY codebase, all refuted on disk in minutes: "spatial-grid degeneration" (the grid had no consumer outside the function being deleted), "an exact stack becomes unpickable, 65-80%" (pickSpark is a linear nearest-cursor scan that never touched the grid), "mixed-version host migration corrupts the bank, 1 in 6" (protocol.ts hard-rejects mismatch at HELLO, so the scenario is unreachable), and the PULL one above.

- #the-forcing-function-caught-what-i-forgot — I added nextPulledSparkId to FIELD_COVERAGE as 'hashed' and never added it to the projection. stateHashFull.test.ts failed and NAMED the field. A registry that fails the build on omission is worth more than any amount of care; never route around one.

- #length-is-six-even-when-empty — the e2e helpers read `bank.length` to mean "how much is stored". The inventory became a FIXED 6-entry tally indexed by SparkType, so .length is 6 for an EMPTY castle: every wait-for-stock helper would have passed instantly, forever, measuring nothing, all green. Changing a collection's SHAPE silently reinterprets every length/size read of it.

- #my-own-patch-deleted-the-thing-i-was-documenting — writing the roadmap replaced the span from "## 6. THE ROADMAP" to "## 7. ...", and the owner's 30 rulings lived at "## 6A", BETWEEN those anchors. The document still read as complete and coherent afterwards. Anchor-to-anchor replacement silently eats whatever moved in between; verify a span's CONTENTS, not just its endpoints.

- #an-audit-that-only-checks-rulings-misses-the-notes — audit pass 1 verified all 30 numbered rulings were covered and reported CLEAN, while the CASTLE WEAPON SYSTEM had no session at all. It came from the owner's prose notes, not a numbered ruling, so the audit was structurally blind to it. An audit inherits the blind spots of whatever index it iterates; add a second lens over the ORIGINAL source.

- #the-feature-was-already-shipped — the owner specified an income model (scaled by tower complexity, degrading with remaining connectors, plain structures earning too) as if it were new work. scoring.ts has done exactly that since S76: complexity = #prims + 2x#magicBonds, and it never cared whether the shapes formed a recipe. The "new" requirement reduced to ONE phase guard. Check whether a requested mechanic already exists before scoping it as a build.

- #the-owner-corrected-my-reading-twice-and-both-mattered — I read the hand-drawn map as "castles on a ring, which is what we already ship" (wrong: the ZONE is primary and the castle derives from it, changing haul distance 2.6x) and then as "two variants of one layout" (wrong: a 1v1 pitch and a 4-player quadrant board). Both were confident, lazy pattern-matches onto what the code already did. When a drawing resembles the current system, that resemblance is the thing to distrust.

