<!-- STATUS: COMPLETED — V6-0.1 shipped in S128 (commits e69c65d..e2aebdf). Archived at S129 handoff. -->
═══════════════════════════════════════════════════════════
    PRODUCTION DESIGN REPORT — S128 Batch: v0.6 doc reconciliation + economy probe harness
    TIER: Full (>30K, batch tier = highest-complexity priority)
    STATUS: v2 POST-COUNCIL — 2 rounds, 3-way, quality gate PASS. Presented for approval.
            Read the COUNCIL AMENDMENTS section at the bottom; it overrides the body
            wherever the two disagree.
═══════════════════════════════════════════════════════════

OBJECTIVE

  Land the owner's committed v0.6 pivot onto master as an internally consistent,
  empirically corrected spec set (P1), and build the dev-only probe harness that
  settles the two economy rulings gating Phase 1 before seven Full-tier sessions of
  protocol/reducer surgery are spent on an unvalidated premise (P2).

  Owner rulings 2026-07-30 (this session): doc reconciliation clears first · roadmap
  relabels to V6-x.y · B3/B4 settled by probe-then-playtest.

CURRENT STATE

  - The pivot exists on `origin/claude/spark-game-state-analysis-a3ot8i` (tip 54831a4,
    3 commits, docs only). It is NOT on master and NOT deployed.
  - The branch forks at 433793a (S125 close, 2026-07-19) and never saw S126 or S127.
    `git diff --stat 433793a master` on the two shared docs = BACKLOG +201, LOCKED +229.
    A naive merge conflicts on BACKLOG.md and drops LOCKED §DEPLOY-PATH (S126 owner
    ruling) and all of §15 SOAK-CALIBRATION (S127).
  - The A.0 state-discovery sweep (this session, 10 agents, 558 tool calls, persisted at
    .claude/plans/2026-07-30_S128_v06_PIVOT_A0_STATE_DISCOVERY_AUDIT.md) confirmed the
    diagnosis empirically and produced 7 blockers / 31 doc corrections / 23 risks.
    Six criticals were re-verified by hand this session (faucet, recipe sizes, combo
    count, NONET multipliers, defender auto-reacquire, bundle-gate scope).
  - Roadmap session numbers S126–S150 collide with real history: S126 = CI E2E revival,
    S127 = soak-lane viability, both CLOSED; S128 is next.
  - master: tsc 0 · vitest 1914/1914 · bundle 640.8/750 KiB · PROTOCOL_VERSION 15 · live.
  - Working tree clean apart from the pre-existing .claude/session-state.json edit.

SCOPE (2 priorities, 9 changes)
──────────────────────────────────────────────────────────

P1 — v0.6 doc reconciliation + roadmap relabel  [Full · docs only · no deploy]

1. Land the branch content on master WITHOUT force-pushing the remote (modify)
   Rebase-equivalent by content, not by history: create the v0.6 doc state on top of
   current master so S126/S127 record survives. Do NOT `git merge` the branch and do
   NOT resolve BACKLOG.md as "theirs".
   Post-land verification gates (all must pass before commit):
     grep -c 'DEPLOY-PATH' LOCKED_DECISIONS.md        >= 1
     grep -c 'SOAK-CALIBRATION' LOCKED_DECISIONS.md   >= 1
     grep -n '^# STATUS S126' BACKLOG.md              non-empty
     grep -n '^# STATUS S127' BACKLOG.md              non-empty
     grep -n 'Actions remain dead' BACKLOG.md         only with [SUPERSEDED S126]
   The remote branch is left intact as provenance; it is marked superseded in the
   commit message. Deleting it is a separate owner-gated cleanup.

2. SPARK_v0.6_DESIGN.md (modify) — corrections C1-C13, C16-C18, C22, C26-C31
   Highest-value: strike "Not yet committed to the repo" (C13) · 24→14 functional
   combos (C1) · NONET 4×→5× and "÷2"→"×0.4 / 60% haircut" (C2) · bundle breach
   fails the BUILD and blocks the DEPLOY, not "the session" (C3) · wire ~3 KB→
   6.7-8.5 KB measured / 38.5 KB at six seats, so +30 workers is +17% not +100% (C4)
   · strike "spawn rate scales with build events" — never implemented (C5) · delete
   the four "retire npm run deploy before S126" asks, already shipped in S126, and
   replace with the real owner-gated residual: `gh api -X PUT .../pages -f
   build_type=workflow` → verify live asset hash → THEN optionally delete
   origin/gh-pages (C6) · "towers do not auto-retarget" → they auto-acquire nearest
   enemy creature every fire cycle, DEFENDER_REACQUIRE_TICKS=12 (C7) · energy idle
   82 days not "a year" (C8) · add LEADER_DECAY as the fifth rhythm source and the
   continuous brake the doc misses (C10) · six derived spatial constants + a fog
   source move with SPAWNER_RADIUS, and four sites hardcode 250 (C11).
   ADD the two numbers the spec is missing entirely:
     - SPAWN_RATE_PER_SECOND = 0.1875 and FREE_SPARK_TTL_TICKS = 600 (10 s), with the
       Little's-Law consequence (standing pool ~1.9 sparks arena-wide) stated in §2
       next to the bank-cap claim. This is B3.
     - The godly-recipe component-size table (pentagram 5 · lightningHub 6 · Helga 7
       · Voltkin 8 · laserTurret 8) printed immediately beside the bank-cap number,
       so cap and recipe size can never again be tuned independently. This is B4.
   Rename worker→gatherer throughout (C26) — "worker" already means the Web Worker
   that owns the authoritative World; the collision would land in the protocol, save/
   load, host migration and workerSim.differential.test.ts. Do it before any type exists.

3. SPARK_Blueprint.md (modify) — corrections C1, C3, C7, C12, C14-C17, C23-C27
   Resolve the self-contradiction: §V.2 says 14 functional entries, §V.3 says 24 (C1).
   Fix the authority chain (C13): Blueprint = single spec authority; the design doc is
   rationale + roadmap with no precedence claim. Replace §XV.6's four cross-cutting
   obligations with the literal 17-site registration checklist (C23/R15), including the
   benchGate.ts BENCH_INTENT_POLICY set-equality forcing function. Amend §XVII honestly:
   16 production modules already exceed the 500-line charter (main.ts 2519, save.ts 1658)
   — grandfather them with a scheduled split rather than leave the charter false (R22).
   §VII.1 "It is not a blank start" → true only from V6-3.4 onward (C24).

4. BACKLOG.md (modify) — relabel the roadmap V6-0.1 … V6-4.3 (owner ruling)
   25 items, phase-relative ordering preserved ("V6-2.5 must land before V6-3.1"),
   plus an "executed in session" column filled at each close. Rewrite the ~109 forward
   references (54 DESIGN / 48 BACKLOG / 5 LOCKED / 2 BLUEPRINT). Strike "in Phases 1-2"
   from the cross-cutting clause — it is every session (C17).
   V6-0.1 (this session) re-tiers to Design+small-code and loses its deploy half (C6).

5. BACKLOG.md (modify) — carry-forward ledger, so nothing is silently dropped
   Per INTEGRITY-WARNING PROTOCOL. Two sets that the branch's roadmap replacement
   would otherwise delete:
     (a) The 4 S127 CI carry-forwards: permanent soak window/threshold shape (needs the
         Mon 2026-08-03 07:00 UTC cron sample — do NOT decide on n=3), worker-isolate
         ceiling 10MB→~3MB (BLOCKED on readWorkerFloorMB stabilization at
         worker-heap.spec.ts:182), Playwright deviceScaleFactor lever, e2e/** outside
         tsconfig coverage. Parked, not dropped, with the blocking reason on each.
     (b) The 23 audit risks R1-R23 bound to the V6 slot that must clear them —
         notably R1 (stateHash.ts HashableWorld omits every entity family, so the
         desync oracle is blind to gatherers in the same slot that flips worker
         default-on), R6 (no damageable target exists: DEFENDER_HP is a 1e9 sentinel,
         CreatureSpawner has no hp field — 3 of 5 targeting priorities are dead UI),
         R7 (V6-1.5 is mis-tiered Standard→Full; deleting CarryingPlayer silently
         changes shipped bomb/rainbow/potato/poop/hunter rules), R9 (six castles cannot
         inherit SPAWNER_RADIUS+40: territory bubbles first touch at complexity 21.6
         after the shrink vs 134.6 today), R10 (the r=188 flip hard-fails
         collision.pile.test.ts at 2.89px vs a 1.5px assertion), R11 (the 16 KiB wire
         guard's "worst case" fixture contains zero free sparks), R13 (entry 640.8 KiB
         + simWorker 120.1 KiB = 758.1 KiB, already 8.1 KiB over the charter on real
         download while the gate measures only the entry chunk), R14 (deploy.yml's
         paths filter excludes scripts/** so a charter raise would not ship the bundle
         it authorises), R17 (centroid-mirror is the identity on a 9-in-a-row, the most
         likely nonet shape, and there is no primitive-vs-primitive collision system).

6. LOCKED_DECISIONS.md (modify) — finish the unlock pass the branch deferred
   Replace the v0.6 AMENDMENT NOTICE header with settled, evidence-cited rulings.
   Extend the affected-sections table from §2/§3/§6/§13 to also cover §5/§7/§8/§10/§11.
   Specifically required (C15, C14, and the audit's §11 finding):
     - §3 body still locks "Energy | +5.0/sec flat passive (Phase 1 stub)" byte-identical
       to master while the header says §3 is "rewritten by Blueprint §VIII". Rewrite the
       body; a doc cannot both lock flat-passive energy and point at its replacement.
     - §2 still records "R_personal | 300 px [PHASE 2] | Placeholder"; real value is 75
       (S58 300→150, S63 150→75). Re-check R_beacon/fade/memory-fog, same stale marking.
     - §11's Carry-1 row (`IdlePlayer|CarryingPlayer + runtime guard`) is NOT revoked.
       V6-1.3 and V6-1.5 cannot be implemented without changing it. Revoke or re-ratify
       explicitly — this is the one lock the roadmap silently violates.
   Add a v0.6 §DEPLOY-PATH addendum recording that the retirement already shipped in
   162b40f0 and naming the surviving owner-gated residual (Pages build_type flip).

7. README.md (modify) — carry the branch's v0.6 description, corrected for C1/C6.

P2 — Dev-only economy probe harness  [Standard-sized code · SHIPS A DEPLOY]

8. Probe harness behind a URL flag (create + modify)
   Purpose: answer B3 (what spawn rate makes the economy work), B4 (does sculpting
   carry the game when material is free — i.e. the S135/V6-1.7 boredom question), and
   B5 (real match length at high throughput), using seams that already ship.
   Design constraints, all load-bearing:
     - Gated on a URL param, DEFAULT OFF. Modelled on the existing `?worker=1` gate at
       main.ts:399-400 — the one gameplay-flag precedent in the repo.
     - Free material via the EXISTING PICKUP_SPARK action path. No new reducer, no new
       action type, therefore no protocol bump and no KNOWN_GAME_ACTION_TYPES change.
     - Spawn-rate override via the EXISTING window.__TEST_SPAWN_RATE_PER_SECOND__ seam
       (constants.ts:101-107), whose own comment confirms init-script ordering.
     - Host-only, solo-only. Refuses to arm in a networked match, so the wire, bench
       gate and host-migration surfaces are untouched.
     - NO castle, NO bank, NO directives, NO gatherer entity. Those are V6-1.x.
   Deliverable to the owner: the harness live on spark-online.space plus a short
   playtest script naming exactly what to judge (does carving down to a recipe still
   feel like the best thing in the game when material is free?).

9. Instrumentation for the three questions (create)
   Dev-overlay counters only, no wire, no save: standing free-spark count, seconds
   between player build actions, sculpt/sever events per match, elapsed time to win.
   These are the numeric proxies R21 says the V6-1.7 gate needs and currently lacks —
   authored here so the gate has pre-agreed pass bands rather than a vibe check.

NO CHANGES TO

  - No force-push, rebase or deletion of origin/claude/spark-game-state-analysis-a3ot8i.
    It stays as provenance. Deleting it is separately owner-gated.
  - No origin/gh-pages deletion and no `gh api -X PUT .../pages` flip. Owner-gated,
    correct order is flip → verify live → then optionally delete (LOCKED §DEPLOY-PATH).
  - No gameplay constants changed. SPAWNER_RADIUS stays 250, FREE_SPARK_SOFT_CAP stays
    50, PHASE_1_WIN_SCORE stays 1500, SPAWN_RATE_PER_SECOND stays 0.1875. The harness
    OVERRIDES at runtime behind a flag; it does not retune the shipped game. The r=188
    shrink is V6-1.2 and is blocked on R10 anyway.
  - No PROTOCOL_VERSION bump. No new action or intent types. No NetSnapshot field.
  - No castle, gatherer, bank, directive or targeting-priority entity. No stateHash /
    HashableWorld change. All of that is Phase 1+ and each needs its own PDR.
  - No src/ change beyond the flag-gated harness and its dev overlay.
  - No CI/e2e/playwright config change. The 4 S127 carry-forwards are parked, not worked.
  - No BRAIN/ writes. No cross-project (SYNC-BRAIN Tier 0-1 not triggered — no shared
    integration point touched).

RISK ASSESSMENT

  1. Landing docs destroys S126/S127 record (the B2 failure mode). HIGH impact.
     Mitigation: content-rebase onto master, never `merge --theirs`; the five grep gates
     in change 1 run before commit and are authored as verification[] bindings.
  2. P2 touches src/ ⇒ pushing master IS a production deploy (LOCKED §DEPLOY-PATH).
     Mitigation: full gate before push — tsc 0, vitest 1914+/1914+, `npm run build`
     (which runs check-bundle-size.mjs), e2e gating lane, plus manual verification that
     the flag OFF path is byte-identical in behaviour. Commit P1 (docs only, outside the
     deploy paths filter ⇒ no deploy) and P2 separately so a doc-only revert is trivial.
  3. Harness leaks into the deterministic sim ⇒ breaks replay/determinism, the repo's
     single most protected invariant. Mitigation: DIFFERENTIAL_TEST_REQUIRED true —
     run workerSim.differential.test.ts and the replay suite with the flag OFF and prove
     byte-identical snapshots + hashWorldState; harness code must not consume the RNG
     stream (use mix32 per constants.ts:885's "NO 6th RNG stream" mandate, precedent
     rainbowLifecycle.ts:115).
  4. Bundle pressure from the overlay. Mitigation: measure delta in the same commit;
     lazily code-split if it moves the entry chunk materially. Report against BOTH the
     gated entry number and the real entry+worker download total (R13).
  5. Renumbering 109 references introduces cross-reference rot (the C25 failure class).
     Mitigation: close-of-session grep of every `§ [IVXL]+\.?\d*` and `V6-\d\.\d` token
     against the actual heading list; zero orphans is an exit criterion.
  6. Correcting 31 items in four large docs risks a partial pass that leaves the set
     MORE inconsistent than before. Mitigation: each correction carries its evidence
     anchor; a C-by-C checklist is verified by re-grep before close, and any correction
     deliberately not landed is logged as a carry-forward rather than dropped.
  7. Doc-only sessions historically under-verify. Mitigation: BACKLOG.md is diff-bound
     under MCV and needs an ABSOLUTE-path verification[] binding on a **completed**
     priority — this fired in S125, S126 and mid-S127. Author bindings at priority close,
     not at session close.

TESTING PLAN

  P1 (docs):
    - The five grep gates in change 1, run and pasted as evidence.
    - C-checklist re-grep: every corrected string absent, every replacement present.
    - Cross-reference sweep: no orphan `§`/`V6-` token; no roadmap item without a phase.
    - `git diff --stat master` reviewed file-by-file before commit; confirm zero files
      inside the deploy paths filter ⇒ confirm no deploy run fires (gh run list).
  P2 (code):
    - npx tsc --noEmit and npm run typecheck → 0 errors.
    - npm run test → 1914/1914 or better, no new skips.
    - DIFFERENTIAL: workerSim.differential.test.ts + save.replay.test.ts with flag OFF,
      asserting byte-identical netSnapshot and hashWorldState vs pre-change baseline.
    - npx playwright test <new spec> --list first (2 s module eval — the S127 lesson;
      e2e/** is NOT type-checked, tsconfig include is ["src"]).
    - e2e gating lane green (dispatch, not schedule — a timeout concludes `cancelled`,
      not `failure`, per the S126 trap).
    - npm run build → bundle delta reported vs 640.8 KiB gated / 758.1 KiB real download.
    - Manual: flag OFF ⇒ title→match→win path unchanged; flag ON in a networked match ⇒
      refuses to arm.
  CHECK phase: Triumvirate (RALPH:PATROL + GROK-ANALYST + GEMINI-AUDITOR) — Full tier.
  Rule 22 end-of-session runtime audit before /handoff (P2 ships runtime config).

TOOL TRIAGE

  Visual output needed?      No — spec text and a dev overlay drawn in-engine. No
                             Imagen/Veo asset is due until V6-3.4 (castle keep).
  Research/external data?    Yes, bounded — `gh run list` / deployments API to confirm
                             no deploy fires on P1 and that the P2 deploy succeeded.
                             No WebSearch: every fact needed is in-repo and was probed.
  Artifact delivery needed?  No — deliverables are repo docs plus a live URL. No
                             Drive/PPTX/PDF/DOCX.

DIFFERENTIAL_TEST_REQUIRED: true
  Not auto-true by the letter of the rule (scope touches no ~/.claude/lib/, hooks/,
  router.sh, LLM-prompt code or session-state schema). Set true deliberately: P2 adds
  code inside the deterministic tick sim, where the project's own invariant is
  byte-identical replay across identically-seeded runs. The repo already owns the right
  instrument (workerSim.differential.test.ts, 399 lines) and a flag-OFF byte-compare is
  the cheapest possible proof the harness is inert in production.

HOT_PATH_REFACTOR: true
  Same reasoning — physicsLoop/controls are the game's hot path. No practical escalation
  (Full tier is already at Council R1+, and this batch runs 2 rounds), but recorded so
  the CHECK phase treats P2 as hot-path rather than additive.

ESTIMATED TOKENS: ~48K (P1 ~34K docs · P2 ~14K code+tests)
MODEL: strongest pinned (claude-fable-5 — S171 ALWAYS-STRONGEST)
       NOTE: this session booted as claude-opus-5 against a claude-opus-4-8 pin —
       6th consecutive drifted boot, flagged by pre-flight as a boot-blocker. Raised
       to the owner separately; it does not block this PDR's content.

═══════════════════════════════════════════════════════════
    COUNCIL AMENDMENTS — 2 rounds, 3-way, quality gate PASS
    These OVERRIDE the body above wherever they disagree.
═══════════════════════════════════════════════════════════

A1. P2 BECOMES DEV-BUILD-ONLY, NOT A PRODUCTION FLAG. [Gemini R1, both R2]
    Gate the harness on `import.meta.env.DEV`, which is this repo's own documented
    zero-cost idiom — `invariants.ts:17` "All checks are gated by import.meta.env.DEV
    at call sites — zero cost", with four live call sites (main.ts:884, :1804,
    botSetupOverlay.ts:133, lobbyScreen.ts:591). Owner playtests on localhost, which
    the PC-only platform ruling makes acceptable.
    CONSEQUENCE, and it is large: P2 no longer touches the deployed artifact. Combined
    with P1 being docs-only (outside the deploy paths filter), THE ENTIRE SESSION SHIPS
    ZERO PRODUCTION CHANGE AND FIRES NO DEPLOY. PDR risks 2 (accidental prod deploy)
    and 4 (bundle pressure) are structurally eliminated rather than mitigated.
    Guard placement resolved between the legs: the throw-if-not-dev guard lives INSIDE
    the harness module, so it is stripped in production (satisfying Gemini's "no prod
    bytes") while not relying on the bundler alone (satisfying Grok's hardening).
    DECISIVE VERIFICATION, not an argument: after `npm run build`, grep the production
    bundle for a harness sentinel string — it MUST be absent. Runtime-verifiable per
    Rule 20, not static-parsed.

A2. THE HARNESS AS DRAFTED CANNOT DECIDE B4 — REDESIGNED. [Grok R1 + Gemini R1, independent convergence]
    Free material plus carry-1 forces the player to play the OLD way, so the original
    design could only illustrate B3 starvation. Replaced by an A/B of two regimes with
    a live in-match switch (NOT a rebuild — Gemini's R2 point that git-checkout
    comparison destroys the sensory A/B is correct, and a dev-only toggle is free):
      REGIME OLD: carry-1 + uniform-random types (today's game).
      REGIME NEW: exact-type N-slot inventory (a mock bank) — no castle, no gatherer
                  entity, no directives entity. Just the player-facing consequence.
    N is a LIVE DIAL (4 / 8 / 12 / unlimited), per Gemini's R2 confound that a fixed 8
    slots might be too few to permit building large and would manufacture a
    "confirmed" reading. This converts a binary test into a THRESHOLD MEASUREMENT:
    find the slot count at which carving stops happening. Strictly more informative.

A3. THE EVIDENCE IS ASYMMETRIC, AND THAT IS WRITTEN INTO THE EXIT CRITERIA. [Gemini R2 confound]
    The owner has read the pivot and knows the hypothesis, so a Hawthorne/affordance
    effect is unavoidable: an inventory UI prompts optimal play, which is exactly the
    behaviour that would mask natural build-large-then-carve.
    Therefore: FALSIFICATION IS STRONG EVIDENCE, CONFIRMATION IS WEAK. If the owner
    still voluntarily builds large and carves down with an 8-slot exact-type inventory,
    B4 is genuinely dead and directives+bank are safe. If they assemble recipes
    directly, that is SUGGESTIVE ONLY and must be corroborated by behaviour rather than
    self-report — measured sculpt/sever events and structure size at recipe trigger,
    with the two regimes played in randomised order. A weak "confirmed" reading does
    NOT by itself authorise redesigning directives; it authorises a second probe.

A4. RISK ENFORCEMENT — three carriers. [Supervisor, adjudicated to by Gemini R2; Grok converged after attacking it]
    Gemini's CI-grep gate is rejected: it needs a session identifier injected into CI
    (which this repo does not have) and would red the build for work not yet due.
      (a) Each risk lands on the ROADMAP ROW for the slot that must clear it, so that
          slot's PDR author sees it at scoping time.
      (b) For the ~8 risks with a precise code anchor, a `// V6-RISK(Rn):` comment at
          that exact line.
      (c) Enforcement rides the repo's EXISTING machine-checked verification[] bindings
          that already hard-fail a session close — and per Grok's one concrete addition,
          those bindings must REFERENCE THE LEDGER explicitly, closing the
          "diffuse accountability" gap.

A5. B5 SETTLED FROM THE SAME HARNESS, WITH HYGIENE. [Supervisor; Grok objected; Gemini improved]
    The repo has fourteen `__TEST_*` window seams including `__TEST_WIN_SCORE__`,
    `__TEST_HUNTER_TRIGGER_SCORE__`, `__TEST_TERRITORY_BASE_RADIUS__` and
    `__TEST_SPAWN_RATE_PER_SECOND__`. Because score is quadratic in time
    (score(T) = 0.0125·T², so match length ∝ 1/√throughput — 3× flow wins in ~200 s,
    the 5× the upgrade tree targets wins in ~155 s), sweeping win score against
    throughput settles B5 with no new code.
    Grok's stale-override warning is legitimate and Gemini's fix is better than mine:
    the harness AUTO-RESETS every `__TEST_*` seam on match init unless an explicit lock
    flag is passed, AND the overlay displays every active override. Both, not either —
    auto-reset prevents the error, display catches the locked case.
    Grok's "use a dedicated probe instead" is DECLINED: these seams are the repo's
    sanctioned mechanism, read once from `window` at module load, and a dev-only
    consumer is a use rather than an abuse.

A6. B6 — PRE-PIVOT TAG NOW, OPTION CHOICE TO THE OWNER. [Gemini R1 called it the top omission; hardened under Grok R2 pressure]
    Implementing a reversibility TOGGLE now presupposes option (B) additive-only,
    because option (A) tag-and-branch needs no code at all. So implementing now would
    pre-build an unchosen design.
    What this session DOES do, because it is option-independent and free: tag
    `v0.5.2-pre-pivot` at the current master SHA, giving a named permanent revert point
    whichever option wins. The option choice becomes a HARD PRECONDITION on V6-1.1,
    with both costed in the spec. Grok's "the owner will rationally pick the
    minimum-LOC path and force a migration later" is a fair worry and is answered by
    costing the paths explicitly rather than by pre-committing code.

A7. RENAME — SINGLE VOCABULARY, ROUTED TO THE OWNER. [both legs converged against the Supervisor's R1 compromise]
    Both reviewers independently held that a SPLIT vocabulary (docs say "worker", code
    says `Gatherer`) is worse than either pure choice, because the next engineer greps
    "worker" and misses the code identifier. That kills the R1 compromise.
    The forcing constraint neither leg used, which Gemini then conceded to: the code
    identifier CANNOT be `Worker` — the codebase already has a Web Worker owning the
    authoritative World, plus `workerSim.ts` and `workerSim.differential.test.ts`. So
    "leave the code as Worker" is unavailable, and the only coherent single vocabulary
    is `gatherer` in BOTH docs and code. Because "worker sparks" is the owner's own
    word in their own document, this is routed to them as a one-line confirmation
    rather than taken as the Supervisor's call.

A8. PREMISE-DEPENDENT PASSAGES ARE WRITTEN LAST AND MARKED PROVISIONAL. [Grok sequencing challenge, partially sustained]
    30 of 31 corrections are facts about the CURRENTLY SHIPPED system and are true
    regardless of whether the pivot survives. Only the bank-cap / directive / faucet
    passages depend on the untested premise. Those are (i) written LAST in the session,
    so a same-day playtest can fill them in, and (ii) explicitly marked PROVISIONAL —
    PRE-PROBE with the probe named as the resolver. Grok's "this is selling a future
    state as settled" is answered by the marking; its "defer all doc corrections" is
    DECLINED, because B2's 429-line record-loss risk grows with every session the
    branch stays unmerged, which cuts the opposite way.

BATTLE LEDGER
  Challenges raised: Grok 3 + 5 probes, Gemini 4 + 1 omission. Tool challenge and
  quality challenge present on both legs, as mandated.
  REFUTED EMPIRICALLY (3, all Grok, all conceded in R2):
    · "no new action type / no protocol bump does not survive" — SPAWN_SPARK is an
      existing reducer case taking a fully-formed spark object (5 shipped test call
      sites), PICKUP_SPARK likewise, both already in the protocol allowlist
      (protocol.ts:453/:455). Nothing new is needed. And the differential compare runs
      flag-OFF, where no override exists to be visible.
    · "already 8.1 KiB over the charter" — conflation. Gated entry chunk is
      640.8/750 KiB, compliant, 109.2 KiB headroom. 758.1 KiB is entry+worker real
      download, a separate finding about what the gate does not measure.
    · "leaves the desync oracle blind to gatherers as the worker default flips" — no
      gatherer exists in this PDR and the flip is slot V6-1.1. Logged there.
  ADOPTED (7): A1 dev-only · A2 A/B regimes with a slot dial · A3 asymmetric evidence
    · A4(c) verification[] must cite the ledger · A5 auto-reset + override display
    · A6 pre-pivot tag · A7 single vocabulary.
  DECLINED WITH REASON (3): full toggle implementation now (pre-builds an unchosen
    option) · B5 via a separate dedicated probe (the seams are the sanctioned
    mechanism) · defer all doc corrections (inverts B2's time pressure).
  DISSENT ON RECORD: Grok's final verdict is REVISE-or-reject and it still wants the
    B6 toggle implemented this session. Not adopted, reason above. Gemini's quality
    gate returned PASS — "did not merely absorb objections; used codebase realities to
    break ties and leveraged native repo mechanics."

PRIME-AUDIT (Rule 20)
  · Rubber-stamped? The three owner rulings were taken as given, correctly — they are
    owner rulings. But the sequencing ruling was partially challenged by both legs and
    is now qualified by A8 rather than accepted whole.
  · Claim-addressed-not-fixed? "31 corrections" is uneven: most are one-line factual
    replacements, but §XV.6 → the 17-site registration checklist and the
    LOCKED §3 energy-body rewrite are structural. Scoped as such, not as one-liners.
  · Consensus masking disagreement? Yes, and surfaced: Grok did not reach ADOPT. Two
    of its six mandatory revisions are declined on the record above.
  · Runtime-verifiability / boot-then-smoke: the original PDR would have been
    static-parse-only. Now: `npm run dev` and drive the harness through both regimes;
    `npm run build` then grep the production bundle for the harness sentinel (must be
    ABSENT); flag-OFF differential byte-compare of snapshot + world hash. All three are
    runtime checks.
  · Materially better than R1? Yes — the session went from shipping a production flag
    to shipping nothing to production; the B4 test went from an illustration to a
    threshold measurement with its own epistemics stated; and a free permanent revert
    point was added.
  · Mtime cutoff: N/A, no leak or regression claim in scope.

REVISED ESTIMATE: ~52K (P1 ~34K · P2 ~18K, up from 14K for the A/B regime + slot dial)

═══════════════════════════════════════════════════════════
    GATE: Awaiting approval to proceed
═══════════════════════════════════════════════════════════
