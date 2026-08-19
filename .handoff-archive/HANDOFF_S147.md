===============================================================
HANDOFF SUMMARY - SPARK
Generated: 2026-08-19
Session: S147 - the tower-defence roadmap begins: the match clock + the 4-player cap
===============================================================

## PROJECT
- Name: spark v0.1.0
- Working dir: C:/Users/onesh/OneDrive/Desktop/Claude/Founder DNA/Extension Projects/The Spark
- Git branch: master (0 unpushed, remote credential verified healthy)
- Latest commit: af932ea chore(s147): review gate APPROVED + R46 (walls stay in S149) resolves CF-S147-d
- Tech stack: TypeScript / Vite / PIXI.js / WebRTC host-authoritative snapshot sim @ 60Hz fixed tick
- Codebase: 51,004 lines / 193 non-test .ts files; 159 unit spec files + 22 e2e specs
- PROTOCOL_VERSION: **24** (bumped twice this session: 22->23 in P1, 23->24 in P2)

## CURRENT STATE
- Build: PASS - entry assets/index-CkkN5WRI.js 690.7 KiB vs 900 KiB cap (209.3 KiB headroom)
- Tests: 2459/2459 unit - e2e:gating 42/42 - e2e:protocol 2/2 over real WebRTC - tsc 0 errors
- Deployment: LIVE, verify-deploy 4/4 at a23510de (remote/run/verdict/live all agree)
- MCV verifier: hard_fail=0 warn=0 exit 0 (84 bindings across P1+P2)

## SESSION COST
- Model: all-Opus (ALWAYS-STRONGEST - single tier, no routing)
- External Council: Grok 2 calls (grok-4.20-0309-reasoning), Gemini 2 (gemini-3.1-pro-preview)
- One 8-probe Workflow lost 7 probes + synthesis to the spend limit; the hand re-run cost less and
  produced the two highest-value findings of the session
- Context at close: 609,145 / 1,000,000 (60.9% YELLOW)

## THIS SESSION WORK

### P1 - THE MATCH CLOCK (4e586ee, live, protocol 22->23)
90s BUILD -> 90s FIGHT, repeating, from the owner notes. Two hashed wire-carried World fields
(matchPhase, phaseEndsAtTick) threaded through all NINE sites a hashed scalar needs - only the
FIELD_COVERAGE row is tsc-forced, so the other eight were worked as an explicit checklist.
- Tick-derived, zero wall-clock (the blueprint #1 CRITICAL desync risk). Two load-bearing details:
  phaseEndsAtTick += DURATION (never = tick + DURATION) so boundaries never drift when an evaluation
  is skipped - and they ARE, because the NONET freeze advances world.tick while bypassing the host
  tick; and a WHILE loop with the PLAYING guard hoisted out, so a freeze longer than a whole phase
  flips once per boundary crossed and phase PARITY holds.
- Scoring FIGHT-only (R3/R7/R16): one conjunct at the single production call site - the income engine
  already scaled with complexity, so the economy needed GATING not rewriting. The spawner-kill BOUNTY
  is gated too: a flagged addition beyond the spec, because otherwise "score is 0 in BUILD" would
  have been true only by coincidence.
- R28 leader decay off behind LEADER_DECAY_ENABLED and EXTRACTED to applyLeaderDecay, so "retained,
  not deleted" means the arithmetic is still under test rather than merely still present.
- Step 0: four cut hazards OFF (R14/R23) at the four DISPATCH sites behind HAZARD_SPAWN_ENABLED.
- HUD: pure formatPhaseBanner + a render-side phase-edge diff. NO PHASE_CHANGED sim effect: a
  transient effect would be LOST to a joiner and to a post-migration client.
- +34 tests: full BUILD->FIGHT->BUILD host-vs-worker, and migration across a phase edge on the REAL
  netSnapshot path (not the disk path - the S134 lesson that one path can stay green while the other
  is broken).

### P2 - FOUR PLAYERS + AN HONEST DASHBOARD (a23510d, live, protocol 23->24)
- MAX_PLAYERS 6->4, MAX_BOTS 6->3, lobby rack 2x3->2x2, bot setup 1..3.
- The PRECONDITION for zones, not a cosmetic cap: QUADRANTS_4P has exactly four zones, so at a cap of
  6 zoneOwner(seat) has no total answer. Both Council seats confirmed cap-before-zones as mandatory.
- R45 (OWNER CORRECTION mid-build): the palette is a RACE/CLASS ROSTER, not a seat-count proxy. I had
  proposed cutting PLAYER_COLORS to 4 to match; that would have deleted a design axis and had to be
  undone later. Work became DECOUPLING: KEEP_RING_SEATS was PLAYER_COLORS.length - the one place
  palette SIZE drove MECHANICS - and is now pinned; the bots-only 7th Silver retired to a non-seat
  BOT_ACCENT_COLOR. PLAYER_COLORS deliberately STAYS at six.
- Measured and favourable: the sim is ALREADY colour-choice-ready. Every consumer reads player.color,
  which already rides the wire as RosterEntry.color, so the future lobby picker needs NO sim change.
- A REAL user-facing bug fixed under R42: the lobby status hardcoded "(up to 6)" while the cap became
  4, so the dashboard advertised a seat count the host would refuse. Now interpolated from MAX_PLAYERS.
- 14 assertions re-pinned, every one DERIVED from MAX_PLAYERS rather than re-literalled, because a
  literal is what rotted. The palette canary now asserts >= MAX_PLAYERS (equality would have forced
  the palette to shrink and destroyed R45) and it forced the duplicated e2e literal to be swept in the
  same commit. NEW rack-capacity guard against the S140 silent-overflow lesson.
- tsc did real work: PLAYER_COLORS is a readonly TUPLE, so retiring the 7th entry NAMED all four
  production index-6 reads instead of leaving undefined colours to appear at runtime.

## OPEN ISSUES
- CF1 (inherited): under ?worker=1 click-to-build spends shapes and builds nothing. Opt-in only
  (WORKER_DEFAULT_ON=false), ZERO live blast radius. S146 refuted its leading theory; needs a runtime probe.
- CF-S147-b: the authoritative 5-site protocol-bump checklist still lives only in a test comment and a
  JSDoc. The drift has now recurred FIVE times. Promote it to LOCKED_DECISIONS.md.
- CF-S147-c (low): six hazard families in workerSim.differential are ACKNOWLEDGED-as-unreachable rather
  than seeded, because Step 0 gates hazard dispatch. Console-logged every run so the gap cannot go
  quiet. DELETE those six reasons when HAZARD_SPAWN_ENABLED flips back on.
- e2e rainbow.spec flakes under full-suite load; passes in isolation. Known load-timing class.
- No defects outstanding from P1 or P2 - both live and deploy-verified.

## BLOCKED ON
- Nothing. R46 resolved the only owner-gated question (walls stay in S149) at the review gate.

## NEXT STEPS (priority order)
IMMEDIATE
1. S148 (P3 carry-forward): zones + zone-derived castle anchors + own-zone build legality at all SIX
   sites + the measured economy re-tune. Protocol 24->25. Read the archived scope amendment FIRST -
   the full A.0, Council verdicts and verified geometry are banked there. boot-snapshot.md has the
   step-by-step. THE HEADLINE: build legality is SIX call sites, not the three the spec named.
SHORT-TERM
2. S149: border walls + gatherer shelter together (R46).
3. S150: castle HP / guns / elimination / placings - where both win conditions become real.
MEDIUM-TERM
4. S151 towers+orders -> S152 fix/scrap -> S153 projectiles+goblins -> S154 roster -> S155 footer.
LONG-TERM
5. S156 modes & teams -> S157+ the measured balance pass (R30).
6. CF-S147-e: the lobby colour/race picker (R45). CF-S147-b: promote the bump checklist.

## CHANGED FILES
src/state/scoring.ts                               |  55 +-
 src/state/stateHashFull.test.ts                    |   8 +
 src/state/stateHashFull.ts                         |  12 +
 src/state/workerSim.differential.test.ts           |  73 +-
 src/state/workerSim.ts                             |   8 +
 src/state/world.ts                                 |   8 +-
 src/state/worldTypes.ts                            |  48 ++
 45 files changed, 2630 insertions(+), 307 deletions(-)
(45 files, +2630 / -307 across the whole session)

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 (FULL tier) | Priorities: 2/3 complete | 609K/1M (60.9% YELLOW)
P1 THE MATCH CLOCK          - completed - 4e586ee - 48 MCV bindings
P2 4-PLAYER CAP + DASHBOARD - completed - a23510d - 36 MCV bindings
P3 S148 ZONES               - pending, deliberately deferred at YELLOW, fully pre-planned - N/A
Council: 1 round per priority, HOW-only per the owner directive. Both seats converged on the canonical
canBuildAt shape for S148. REJECTED on measured evidence: Grok dual-validator wire path, Grok
representation change (phaseStartedAtTick/phaseDurationTicks), Gemini integerize-positions, Gemini
e2e-economy-multiplier. Gemini returned REJECT on a premise the probe refuted (workerSim.ts:485 DOES
implement the NONET freeze), but its recommended fix was adopted anyway on better grounds.

## REFLEXION ENTRIES (this session)
19 entries appended to .claude/reflexion_log.md, then pruned 67 -> 35 to respect the 50-entry cap
(S143 + S144 blocks aged out; they survive in archived handoffs). Headline learnings:
- #a0-predicted-the-exact-break-and-that-is-the-whole-value
- #cadence-zero-would-have-meant-maximum-frequency (the approved spec was wrong about its own impl)
- #the-owner-stopped-me-deleting-a-design-axis (R45)
- #counting-council-verdicts-would-have-shipped-two-defects
- #my-own-anti-vacuity-check-caught-my-own-useless-test
- #i-converted-thirteen-files-to-crlf-and-it-would-have-passed-ci
- #a-readonly-tuple-is-a-forcing-function
- #re-pin-derived-not-re-literalled
- #my-own-verification-bindings-invalidated-each-other
- #the-repo-has-mixed-line-endings-and-my-audit-was-wrong

## CARRY-FORWARD PRIORITIES
1. P3 / S148 - zones, zone-derived anchors, six-site build legality, measured economy re-tune.
   NOT completed: deferred at 58% YELLOW rather than stop half-way through a hashed-geometry migration
   (castleAnchor has 13 consumers across sim AND render, is hashed host-authoritative state gatherer
   spawns derive from, and is rebuilt from a mirror at host migration). PDR: FULLY DRAFTED, A.0
   complete (E1-E12), Council run. Needs execution only, no re-planning.
   Source of truth: .claude/plans-archive/2026-08-19_SCOPE_AMENDMENT_S147_R41_4PLAYER_CAP_IN-PROGRESS.md

===============================================================
