# SPARK — Build Backlog

**Spec:** [SPARK_Blueprint.md](SPARK_Blueprint.md) v0.5.1 · **Locked:** [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md) · **Live:** https://spark-online.space
**This file = the forward plan.** The ROADMAP below is the source of truth for what each session works on. Session history (newest first) follows after it; the authoritative per-session narrative is the handoff series in `.handoff-archive/`.

---

# CURRENT QUEUE — S108 PLAYTEST-FEEDBACK BATCHES (regression-first, front of the line)

> S108 was a PLAN-ONLY session (seat weekly-limit). Owner playtested live S107 and reported 6 points; we scoped all 6
> against the code (6-investigator Opus workflow), deliberated (2 Council rounds + PRIME-AUDIT), and split them into 4
> batches by risk. **NO code shipped S108** — execution continues next session (possibly a different Claude seat).
> Full handoff: `HANDOFF_S108.md`. The owner's 6 points + their refinements are captured in the plan files below.

| Batch | Covers (owner points) | PDR / Plan file | Wire | Risk | Status |
|---|---|---|---|---|---|
| **A** (NEXT — safe) | #5 codex-trap · #6 shape 10s-despawn (no clamp — fling is a tactic) · #1 poop model (disable structures / slow creatures+Helga / carried-spark 50% slow / idle-pool immune / foul placed prims) · #3 Helga anti-laser INTERIM (cut range + remove beam) | `.claude/plans/2026-06-26_PDR_S108_Batch_A.md` (READY, deliberated; NOT yet unlocked) | none (v12) | Low/Std | **PDR ready — execute next session** |
| **B** | #3 FULL — Helga WALKS to target + slaps once on arrival, chases not loops | `.claude/plans/2026-06-26_PLAN_S108_Batch_B_Helga_Walk.md` | **12→13** | HIGH | needs PDR + Council |
| **C** | #4 — "5 circles + dot" building → suicide lightning drones → self-destruct after 3 | `.claude/plans/2026-06-26_PLAN_S108_Batch_C_Lightning_Drone_Building.md` | **12→13** | HIGH | needs PDR + Council + 9 owner design Qs |
| **D** | #2 — Voltkin (+ Helga) better-quality 2D art, clean matte, NO 3D | `.claude/plans/2026-06-26_PLAN_S108_Batch_D_Voltkin_Helga_Art.md` | none | Med | needs art SPIKE + owner eyeball |

**Sequencing:** A (safe, no-bump) → B (Helga walk) → C (new building) → D (art). Each of B/C/D gets its own PDR +
3-way Council before any code. The Tier-1 G-series + Tier-3 host-migration ROADMAP below resumes after the S108 queue.

**KEY DELIBERATION RESULT (do not re-litigate):** the SPARK client runs NO authoritative physics/FSM (main.ts:1055 —
it renders host-synced positions). So host-only sim changes whose WIRE FORMAT is unchanged need NO PROTOCOL_VERSION
bump (Council's "mandatory bump" was refuted against the netcode; verified: createdTick, fouledPrimitives,
poopyUntilTick all already on the wire). A bump is needed only when a NEW serialized field/literal is added (Batches B + C).

---

# ROADMAP — rewritten S86 (2026-06-12) on user mandate

> User (S86, verbatim): *"organize our priority backlog to see what we actually need to do in order to IMPROVE on the game … like for example developing the geometric connections between the primitives, some of them dont do anything like dot to square or line to circle … the whole point is being a geometric builder game and we have least focused on that … rather than random stuff you have added to backlog which will or will not improve our gameplay."*

## North star

SPARK is a **geometric builder duel**. The build system — what happens when you connect primitive A to primitive B — IS the game. Hazards, fog, netcode, and lobbies exist to serve that loop, not the other way round.

## The honest gap (S86 code audit — measured, not vibes)

The user's complaint is structurally correct. State of `src/combos.ts` (36 ordered pairs across 6 primitives):

| Fact | Evidence |
|---|---|
| **24 of 36 combos are literal placeholders** | `description: 'Functional placeholder — generic bond'` — Dot→Square, Line→Circle, Dot→Dot, Square→Triangle, Square→Line, most Spiral pairs… all identical generic bonds |
| ~~**The magic 12 are visuals + physics stiffness ONLY**~~ — **S89–S90 UPDATE: 4 behaviors now shipped** | Vortex pull (S89 P6), Filament income trickle (S90 P1), Diamond/Lattice anti-sabotage resist (S90 P2) are implemented mechanics. Remaining magic descriptions (Wheel/Star rotation, Whip/Warped/Orbital/Capsule) are still visuals-only — see G1b MOTION (open). |
| **`areaMultiplier` is dead data** | defined per combo, consumed by zero production code |
| ~~**`isMagical` is dead outside combos.ts**~~ — **S88 CORRECTION: FALSE** | `isMagical` IS read in production in `scoring.ts` `computeComplexity`: a magic bond earns `MAGIC_BONUS = +2.0` (uncapped) vs a functional bond's `+0.25` (capped) — an **8× premium, live since S76**, with passing tests (`scoring.test.ts`). The original row mis-stated the code. The real magic gap is **behaviors (G1b)**, not scoring. |
| **Discovery exists only as the title-screen Codex** | nothing in-match celebrates or even mentions discovering a new combo |

## TIER 1 — CORE GAME: make the geometry matter (USER-MANDATED, S86)

Session-sized cuts, in recommended order:

- **G1 — Magic combos MATTER mechanically.**
  - ~~*G1a:* wire `isMagical` into scoring (+0.75 vs +0.25)~~ — **DROPPED (S88 PRIME-AUDIT).** Magic bonds ALREADY out-earn functional **+2.0 vs +0.25** (8×, uncapped, since S76 — `scoring.ts` `computeComplexity`); the proposed +0.75 would have been a **−62% nerf**. If magic should feel *even* stronger, the lever is tuning `MAGIC_BONUS` upward (touches `LOCKED_DECISIONS §6` + `constants.lock.test.ts`), playtest-gated — not a blind edit.
  - *G1b (the real meat, ~1 session per archetype):* implement combo BEHAVIORS so the magic combos stop being paint. Every behavior is a pure function of synced state (determinism + 1v1 mirror), host-only.
    - **ECONOMY** — ~~Vortex pulls free sparks toward it~~ **SHIPPED S89 P6** (`f425167`, host-only anchor-pull) · ~~Filament income trickle~~ **SHIPPED S90 P1** (`a448fd6`, +`FILAMENT_INCOME_COMPLEXITY` 0.6 on top of the magic premium + income-node cue; #1 playtest knob).
    - **DEFENSE** — ~~Lattice/Diamond resist enemy sabotage~~ **SHIPPED S90 P2** (`f8adc57`, hostile player-sever costs the full `MAX_DISRUPTION_CHARGES`=2 budget; physics/creature/bomb still break it — anti-sabotage ≠ hazard-immunity).
    - **MOTION (OPEN)** — Wheel/Star slow structure rotation; Capsule glow-trail. **S90 Council DEFERRED**: both reviewers rated *pure* rotation low player-value ("visual noise" without a mechanical verb) — revisit when it earns one. Impl note (research-confirmed feasible): direct rigid pose-write clone of `vortex.ts`, midpoint pivot, drift-free `baseAngle+tick·const` sin/cos precomputed at module load, component dedupe.
- **G2 — Fill or fold the 24 placeholders.** Design decision first (user picks flavor): rule-based FAMILY traits so EVERY pair does *something* (e.g. Dot-pairs = cheap/weak filler, Square-pairs = sturdy/slow, Spiral-pairs = chaotic wobble) + promote 2–4 placeholder pairs to new named magic combos — starting with the two the user called out by name: **Dot→Square** and **Line→Circle**. Families + a few promotions, NOT 24 bespoke mechanics. **PROMO SHIPPED S91 P1 (Phase 1, visual-only):** **Anchor** (Dot→Square) + **Spindle** (Line→Circle) promoted to magic — distinct stroke-only silhouettes + discovery toast + the 8× magic income premium; Option A win-score rebalance (`PHASE_1_WIN_SCORE` 210→630, `SCORE_TIER_STEP` 70→210, exact-3× tier cadence preserved) offsets the jump (canonical combo build held ~152→157s; pure-blob ~3× longer, accepted v1 trade-off). Behaviors (Anchor anti-drift / Spindle tangential pull) DEFERRED to a Phase-2 PDR. **TRAITS still DEFERRED (gated):** it needs a `LOCKED_DECISIONS §6` lock-amendment (functional combos are locked as MID/1.0×/generic) + watch the S49 territorial `stiffnessMultiplier` stacking (a LOW family in enemy territory → ~0.06 effective, may feel floppy). Only `stiffnessTier` is a live mechanical axis; `areaMultiplier` is dead.
- **G3 — Discovery loop.** ~~*G3a:* in-match "NEW COMBO — Filament!" toast + per-match discovered counter~~ — **SHIPPED S88** (magic-12 toast + "Combos N/12" HUD; deterministic synced-tick render, additive-optional wire, no protocol bump). *G3b (next):* Codex marks used combos; undiscovered render as silhouettes.
- **G4 — Build-feel juice** (carry-overs that genuinely serve the core loop): bond-formation juice burst (S84 Gemini candidate) · pooped-reject feedback cue · in-world leader crown. One polish session after G1a/G3a.

## TIER 2 — Playtest loop (USER-driven)

- **Round 7** on spark-online.space: verify all four S86 fixes (black fog · no hazard-ring lines · eaten/pooped players truly locked out · OS cursor gone — the spark IS the pointer, faint ghost ring only while slowed/eaten) + judge the rounds-5/6 leftovers still pending eyes (yell audibility, big flyover, bond ownership patterns, hazard rings, lobby animations, match length 210, seat-stable leaderboard).
- **NEW (S87) — VS BOTS + Multiplayer/Quick Match playtest:** (a) VS Bots feel across NOOB/MID/HARD/IMBA — do the bots read as *playing* (cruise, collect, haul, build bonded structures, sever, flee the hunter) and is the difficulty curve right? Tuning knobs all in `src/bots/botConfig.ts`. (b) Quick Match with a friend on two machines: does discovery pair you, does the all-ready gate start when both click READY, does the smallest-code convergence avoid split lobbies? (c) Confirm the "Multiplayer" rename + the friends Host/Join lobby still works byte-identically.
- **Non-builder-win mechanism** (USER field report S84, unreproduced in vitro): instrumentation is live — if it recurs, screenshot the console (the WIN line dumps per-seat score+complexity). *S87 live-preview note: confirmed in vitro that bot builds attribute to their OWN seats and the human seat stays 0 with no input — no mis-attribution in bots mode.*

## TIER 3 — Resilience & infra (CLAUDE/COUNCIL-suggested — honest labels, plain language; only after Tier-1 ships or on explicit user ask)

- **Host migration** ([HOST_MIGRATION_DESIGN.md](HOST_MIGRATION_DESIGN.md), design adopted S85). **Plain English:** in multiplayer one player's browser (the "host") runs the real game; everyone else mirrors it. Today, **if the host closes their tab or drops, the match dies for everyone**. This work makes a surviving player's browser take over automatically so the match continues. Four session-sized steps (D1 identity plumbing → D2 detection → D3 takeover → D4 hardening). Real value — but it only matters for matches that are already fun; hence Tier 3.
- **S73 dense-compaction colour-shift at Begin** (sparse in-game seat palette) — CLAUDE-suggested polish.
- **Periodic-scoreboard knob** (if real-time scores distort FFA play) — CLAUDE-suggested, playtest-gated.

## TIER 4 — User-deferred (touch ONLY on explicit ask)

- **VFX lightning-overlay library** — user said defer; procedural ARC_FLASH stays.

## Session protocol going forward

1. **Regression reports jump the queue** (S86 pattern: fix what the playtest broke, same session).
2. Otherwise **every session leads with the top unfinished Tier-1 item**.
3. Tier-3 infra and new polish ship only AFTER the session's Tier-1 item, or on explicit user ask.
4. **New Claude/Council ideas do NOT enter Tiers 1–3 directly** — they land in PARKED and graduate only with user sign-off.
5. This ROADMAP section is updated at every session close; completed items move to the session history.

## PARKED (Claude/Council ideas awaiting user sign-off)

- 10 Hz client-mirror pose-stepping smoothing (S84 advisory — judge in 1v1 playtest first).

---

# SESSION HISTORY (newest first)

> **History gap S92–S99:** the per-session narrative for S92–S99 lives in the `.handoff-archive/` handoff series (this section was not maintained between S91 and S100). S92–S99 deploys all SUCCEEDED (verified via `gh run list --workflow=deploy.yml`).

## Session 101 — SHIP S100: unblock the failed TD deploy + verify live [COMPLETED 2026-06-24]

**Recovery session.** The prior session's UI got stuck after the S100 TD build workflow finished; the owner reported "I built two pentagrams in multiplayer and it didn't work — are you sure you pushed it and it works in all versions?" **Root cause: S100 was built, committed, and pushed to git — but the GitHub Pages DEPLOY FAILED on the bundle-size HARD gate** (`check-bundle-size.mjs` exits 1 at 570.9 KiB > 560 charter; it runs as the last step of `npm run build`, the exact command `deploy.yml` runs). So `spark-online.space` stayed on the S99 build with **no tower-defense at all** — the pentagram couldn't fire because the feature wasn't on the server. The S100 E2E gating lane had also failed (stale `aboveFogLayer` contract 8→10). The S100 session notes mislabeled the bundle breach a "soft budget, no hard CI gate" — that error is what let a non-deploying build be marked "done."

- **Fix (`6169c2b`):** bundle charter **560→750 KiB** (`check-bundle-size.mjs` `CAP_KIB` + `LOCKED_DECISIONS.md` clause in lockstep; owner directive — the cap is self-imposed, gzip transfer is ~185 KiB, and a deploy-blocking failure mode is far costlier than the few KiB it guarded) · E2E `aboveFogLayer` contract **8→10** (`e2e/fog.spec.ts` — S100 added the spawnerZone + chewer renderers) · added an **early-warning band** to `check-bundle-size.mjs` (shouts at <60 KiB headroom on every build, BEFORE it can block a deploy).
- **Shipped live:** manually triggered the deploy (`workflow_dispatch` — the fix's paths don't match the deploy filter); deploy run SUCCESS; `spark-online.space` now serves the S100 bundle (hash-verified). **Tower-defense is live for the first time.**
- **Verified S100 end-to-end** (4-agent adversarial workflow, all verdicts WORKS/high): buildability (NEW `pentagramBuildability.test.ts`, 7 tests — a real hand-built pentagram DOES ignite at circumradius ~32–51; auto-bond merge/redundancy does not break degree-2 in the buildable band), ignition + 2-player replication, chewer lifecycle + counterplay, render + run-loop. Gates: `npm run build` exit 0 (entry 570.9 KiB, 179 KiB headroom); vitest **1584/1584**; gating E2E green.
- **Carry-forward:** TD pentagram is **spacing-sensitive + unguided** (LOW UX gap) — no in-game hint when a near-pentagon doesn't ignite; consider a closing-edge ghost-preview or a "shape almost complete" affordance, or relax the predicate to "contains a 5-cycle, ignore extra chords" if playtest shows frequent over-bonding. Code-split TD render layer is now optional (real headroom exists). PDR: `.claude/plans/2026-06-24_PDR_S101_DEPLOY_FIX.md`.

## Session 100 — Tower-Defense Phase 1a+1b: pentagram spawner → chewer swarm [COMPLETED 2026-06-24, shipped live S101]

**First tower-defense vertical slice, built as a GENERALIZATION of the Voltkin creature substrate** (14-agent map+design+adversarial-review workflow, then a 7-layer sequential build + verification stage; 38 new tests). Build a closed pentagram (exactly 5 triangles, each bond-degree 2) → it comes alive as a spawn-zone (aura + tiny VP) → emits a pencil-drawn "chewer" every 15s → chewers hop to nearest ENEMY connector + chew 5×/5s to sever it → spawner is destroyable (break the shape → income+swarm stop) → chewers are potato-killable. Deterministic (mix32, no RNG/wall-clock), host-authoritative, multiplayer-safe (`creatureSpawners` additive-optional on the wire, host-only chewer fields stripped; `PROTOCOL_VERSION` 9→10). Generalizes `CreatureType`/`CREATURE_CONFIGS` via `if(!config.persistent){…}` so Voltkin stays byte-identical (replay-determinism guard proves it). Commits `52d822a` (feat) + `e07ea81`/`bf96a14` (close). **NOTE: this session committed clean but did NOT go live — see S101 for the deploy fix.** PDR: `.claude/plans/2026-06-24_PDR_S100_TD_PHASE1A.md`; design: `TOWER_DEFENSE_DESIGN.md`.

## Session 91 — G2-PROMO Phase 1: Dot→Square (Anchor) + Line→Circle (Spindle) promoted to magic [COMPLETED 2026-06-16]

**User said `go` on the recovered G2-PROMO PDR (the S90-resume killed the design workflow at the finish line; the full PDR + READY audit were recovered intact from the workflow journal — zero loss). Full tier, audit verdict READY (0 CRIT/HIGH; 1 MED + 3 LOW folded into the PDR DELTA). Phase 1 = VISUAL-ONLY promotion (no behaviors): 2 `combos.ts` rows (isMagical, `fx.anchor`/`fx.spindle`, MID/1.0×, order-dependent forward keys only), 2 stroke-only STATIC silhouettes (`drawAnchor` = shaft+stock+flukes; `drawSpindle` = shaft+2 bows), dispatch + barrel wired. The 8× magic income premium + NEW-COMBO toast + "Combos N/14" HUD all auto-follow from `isMagical` (zero scoring/wire/save code — `schemaVersion` 1 / `PROTOCOL_VERSION` 8 unchanged; `discoveredCombos` serializes key-strings by value, fully additive). Option A win-score rebalance: `PHASE_1_WIN_SCORE` 210→630, `SCORE_TIER_STEP` 70→210 (exact-3× invariant green; canonical combo build held 152.7→157.5s; pure-blob ~3× longer, accepted v1). `LOCKED_DECISIONS §6` amended Magic-12→14 + win-score note. EXECUTION DISCOVERY (not in PDR): the 3× `SCORE_TIER_STEP` jump blew the 20000-tick guard on 5 tier-pulse tests (session10 ×3 / session13 ×2) — at complexity 13 the 2-band target needs ~38.8k ticks; bumped the guards to 120000 (intent-preserving). Adversarial CHECK ran inline (the CHECK workflow's 3 agents died on an org spend-limit, NOT on findings): Balance re-derived CLEAN, Desync/wire-save CLEAN (host-only scoring + by-value key serialization), Test-net CLEAN + doc-drift swept (12→14 across combos.test / comboDiscovery / worldTypes / world / gameMode / ui / bondCommit / silhouettes comments). tsc 0 · vitest 1423→1433 · bundle 547.0→548.3 KiB < 550. PROMO behaviors + G2-TRAITS + MOTION + DEFENSE-v2 all remain DEFERRED (logged). PDR: `.claude/plans/2026-06-16_PDR_S91_G2_PROMO_Anchor_Spindle.md`.**

## Session 90 — G1b combo behaviors: ECONOMY Filament + DEFENSE Diamond/Lattice [COMPLETED 2026-06-16]

**User: "before i test play lets get more work done, lets work G1b continuation + G2." 6-reader State-Discovery workflow + Full-tier 2-round Council (Grok-4.20 + Gemini-2.5-pro). Council SPLIT on scope; user declined to narrow → shipped Council Option 1 (highest value-per-risk, no governance/balance gate): P1 ECONOMY Filament income trickle (`a448fd6`, +0.6 complexity on top of the magic premium + income-node cue) · P2 DEFENSE Diamond/Lattice anti-sabotage (`f8adc57`, hostile player-sever costs the full 2-charge budget; physics/creature/bomb still break it). Both pure host-only fns, ZERO new wire/save (PROTOCOL_VERSION stays 8, schemaVersion stays 1). MOTION + all G2 DEFERRED with logged carry-forward (see G1b/G2 above). Ultracode final adversarial audit (6 refute-first dims + per-finding verification): VERDICT SHIP — both correctness-critical dims CLEAN, AUDIT-1 (no indestructible Diamond) + AUDIT-4 (gate/decrement agree by construction) positively confirmed; 5 surviving findings all doc/hygiene/test-net (BACKLOG drift fixed here; `save.replay.test.ts` extended to exercise scoring — `7797b01`; stray `build-out.txt` removed). tsc 0 · vitest 1407 → 1423 · bundle 547.0 KiB < 550 · E2E 2-browser GREEN on tip.**

## Session 89 — 5 playtest regression fixes + G1b Vortex (first magic-combo behavior) [COMPLETED 2026-06-16]

**User playtested spark-online.space, reported 5 regression/feel issues + "run those 5 fixes then go straight into G1b." Full-tier 2-round Council. 7 commits: P1 lobby READY overlap + per-seat tick (`de2f05d`) · P2 version-badge overprint (`9eeac55`) · P3 poop-foul auto-expiry 30s + cue (`4df76b1`) · P4 hunter +25% (`43b4c0c`) · P5 client-mirror render-delay snapshot buffer — joiner smoothness (`de1d1fd`) · P6 G1b Vortex anchor-pull (`f425167`) · P7 ultracode 8-reviewer audit + creature-interp narrowing (`6432391`). vitest → 1407, bundle 546.7 KiB. P5 E2E GREEN (de1d1fd). NOTE: the P6 commit's own E2E flaked RED; the P7 polish commit's E2E is GREEN (tip verified).**

## Session 88 — G3a in-match combo discovery toast + per-match counter [COMPLETED 2026-06-15]

**Standard Council UNANIMOUS. Shipped the magic-12 in-match "NEW COMBO!" toast + "Combos N/12" HUD (deterministic synced-tick render, additive-optional wire, no protocol bump). PRIME-AUDIT DROPPED G1a (magic scoring was already +2.0/8× since S76 — the proposed +0.75 would have been a nerf). Roadmap audit-error correction (the `isMagical`-dead claim was false). Tests → ~1385.**

## Session 87 — USER-QUEUED mode batch: VS BOTS + Multiplayer rename + Quick Match [COMPLETED 2026-06-12]

**User queued a mode batch AHEAD of the Tier-1 roadmap ("this is before continuing other priorities from backlog … i am preapproving this session batch and autonomous run") + pre-approved autonomous run. Full tier, Council R1 (Grok 4.20 + Gemini 2.5-pro). 5/5 priorities. Tests 1312 → 1370; bundle index 554.58 vite-kB = 541.6 KiB < 550 (recovered headroom by lazy-loading CodexOverlay). PROTOCOL_VERSION 7 → 8.**

- **P1 mode restructure (139ea4b)** — title "1v1 (2 Player)" → **"Multiplayer"** (internal GameMode value `'1v1'` kept — wire/test literal); NEW **VS Bots** button + lazy `BotSetupOverlay` (count 1-6, per-bot NOOB/MID/HARD/IMBA). `GameMode += 'bots'` inherits the FFA rule set via `isNetworked()` (fog/territory/shrink/remote-reach validation bind bots like remote humans) with `isHost=true`, no transport (all 11 isNetworked sites grep-audited null-guarded). `World.botSeats` + additive-optional `WorldSnapshot.botSeats`; 7th PLAYER_COLOR (silver, bots-mode only — MAX_PLAYERS stays 6 for every wire/lobby validator); B{n} nameplates/leaderboard/win banner.
- **P2 bot framework (139ea4b)** — code-split `src/bots/` (botManager + botController FSM + botConfig + botTypes). Bots are ordinary seated players that may ONLY dispatch the same GameActions a remote human can — so the bench/poop/reach/territory gates bind them by construction (the S86 dispatch choke point's first structural dividend). Virtual cursor = avatarPos eased ≤cursorSpeed px/tick (accel + arrive-decel + wobble) via UPDATE_AVATAR_POS; claim at ≤24px (claim-outcome-confirmed), haul rides the S45 coupling, place via the PLACE_PRIMITIVE remote-origin host re-pick. Per-bot seeded mulberry32 (no Math.random/Date.now). Carry-1 crash class made unreachable (brain never proposes BUILD while Carrying + controller self-heals idle-with-spark into HAUL).
- **P3 bot brain (281ddb5)** — pure goal arbitration (flee hunter / clean own splat / claim rainbow / sever / IMBA potato+shrink / BUILD) + home-sector anchor + frontier growth (GROWTH_STEP 48 < AUTO_BOND_RADIUS 60 so the host re-pick chains bonds) with difficulty-tuned aim jitter; smart bots weave redundancy bonds via the SAME human-path picker (componentOf + pickRedundantBondTargets). Behaviors proven through the real dispatch pipeline.
- **P4 Quick Match (7ca9497)** — Multiplayer lobby = friends Host/Join (byte-identical) + NEW **QUICK MATCH**: a lazy `quickmatch.ts` discovery room (`spark-qm-v8`) where seekers gossip host beacons, join the smallest advertised code (deterministic convergence), or self-promote after a jittered window; peerless hosts demote toward smaller codes (split-brain heals); full hosts (6 seated) are skipped. All-ready START GATE: new `LOBBY_READY` client→host kind (the v7→8 bump — a stale peer could never send it and would stall the gate), readiness mirrored via `RosterEntry.ready` on LOBBY_PRESENCE, host auto-Begins when every CURRENTLY-SEATED player + host are ready and ≥2 present (live-seat intersection ⇒ a departed peer can't wedge). Pure core (election + gate) has 21 unit tests.
- **P5 verification + ship** — live preview: title rename + VS Bots overlay + bots building bonded structures & scoring (seat1=12/12, seat2=5/5, seat3=9/9 bonded; human seat 0 = 0, no mis-attribution) + Quick Match button in the lobby; zero console errors. Full vitest 1370/1370, tsc exit 0, bundle under charter, e2e lane.

**Council adopted/overruled (evidence-based):** F1 ADOPT+fixes (per-tick target invalidation, staggered think, cursor easing); F2 OVERRULED→6 bots/7 seats (both REJECTs rested on hallucinated structures — fogVisionMask/score-arrays don't exist; the one real consumer was the ui.ts leaderboard pool); F3 ADOPT (Grok's 10Hz-quantized-bots rejection architecturally false — the human IS the host); F4 ADOPT+fixes incl. CONCEDED→GEMINI PROTOCOL_VERSION bump.

**Carry-forwards:** playtest the new modes (Tier 2, above) · resume **Tier-1 G1a + G3a** (isMagical scoring premium + in-match discovery toast) as the next build session per the unchanged roadmap.

---

**SESSIONS 20–30 — DEPRECATED FROM THIS FILE (S33 P1-14, 2026-05-16):** Entries S20–S30 are intentionally absent. The authoritative session record is the handoff series:
- S20–S22 networking fixes — `.handoff-archive/HANDOFF_2026-05-12_*.md`
- S23 — `.handoff-archive/HANDOFF_2026-05-13_S23close.md`
- S24–S28 Voltkin Phase-2 implementation — `.handoff-archive/HANDOFF_2026-05-14_S{24,25,27,28,29}close.md`
- S29–S30 polish + regression repair — `.handoff-archive/HANDOFF_2026-05-14_S{29,30}close.md`

S30 audit at session close surfaced 24 findings split P0/P1/P2 across S31/S33 (see §Session 31 / §Session 33 below). History below tracks S31 onward only (Council R1 Q3=B unanimous + S33 P1-14 — handoffs preserve the authoritative narrative).

---

## Session 86 — Playtest round-6 REGRESSION batch + ROADMAP rewrite [COMPLETED 2026-06-12]

**User + friend live playtest found 4 regressions; user approved the batch PDR (Standard, Council 1-round Trident Strike: bench gate CONCEDED→GROK central-choke-point, drag-cancel SYNTHESIS claim-outcome-keyed, ghost dot OVERRULED→GEMINI+CLAUDE) + pre-approved the roadmap amendment. 5/5 priorities. Tests 1299 → 1312; bundle 548.3 KiB < 550.**

- **P1 fog black + LOCK (b0f3913)** — S85 P4b restored the dim blue explored tier (0x161b2e) over the S63 USER tuning; round-6 verdict: "the stupid blue fog is back... should be just black." Reverted to 0x000000 and LOCKED: LOCKED_DECISIONS.md §14 (rule: old design notes do not outrank newer user tuning) + `constants.lock.test.ts` CI tripwire — docs alone provably failed once.
- **P2 hazard-ring stray lines (8e328cd)** — S85 ring drew `arc()` with no `moveTo`: canvas-path semantics connect the pen from the world origin to each ringed hazard (the screenshot lines to the potato + pacman). One `moveTo` per dash segment; also kills inter-dash chords.
- **P3 central bench gate + claim-gated drag (4849393)** — eaten players could still collect AND build: `benchedUntilTick` was input-layer-only (no reducer checked it; the catch force-drop made the carried spark Free and the surviving AttractDrag yanked it back to the cursor), and the S84/S85 pooped gates blocked claim/build but never the DRAG (a rejected claim left the spark Free = the gesture kept hauling at full cursor speed). Fixes: NEW `benchGate.ts` BENCH_INTENT_POLICY (explicit allow/deny per CLIENT_INTENT_TYPE, completeness locked by test) enforced at `dispatch()` entry (covers local input + optimistic prediction + remote intents); gesture ENTRY claim-outcome-keyed (rejected claim → no gesture at all; no local radius mirror to desync); benched in-flight gestures die per-substep with defensive drop (also kills the probe-discovered stuck-gesture-after-bench hole). `rejectReasons.actorBenched` + both match-boundary resets now also clear `pickupPoopedTooFar` (leaking since S84).
- **P4 the spark IS the pointer (53b4251)** — OS cursor hidden during PLAYING via Pixi's OWN `cursorStyles.default` (the preview pass caught the naive style-write being clobbered by Pixi's per-interaction cursor management); title/lobby/win keep the native pointer; faint local-only ghost ring at the real mouse ONLY while pooped/benched. LIVE-VERIFIED end-to-end through the real input path: pooped-far grab rejects + no gesture, pooped-arrived grab works, eaten-mid-drag dies same frame, ghost verified at Graphics-object level, fog-black + line-free-ring screenshot, zero console errors.
- **P5 ROADMAP rewrite (this)** — combo-system audit (24/36 placeholders; `isMagical`/`areaMultiplier` dead in production; no in-match discovery), USER-first tiered roadmap with origin labels, host-migration explained in plain language, session protocol locked.

**Carry-forwards:** playtest ROUND 7 (all four S86 fixes + rounds-5/6 leftovers) · recommended next build session: Tier-1 **G1a + G3a**.

---

## Session 82 — user-queued full batch: cruiser-poopy-slow · spawner-save · fog/CVD · netcode infra · lobby delta [COMPLETED 2026-06-10]

**User pre-approved batch + autonomous run. Full tier, Council R1+R2 (Grok+Gemini) CONVERGED, PRIME-AUDIT in PDR. 5/5 priorities, one commit each (f8f35e6 → e364df5). Tests 1188 → 1237; bundle ~542.5KiB < 550.**

- **P1 cruiser-poopy-slow (f8f35e6)** — poop now hits the PLAYER CRUISER (avatar-first bodyblock precedence): 15s slow via the target-chase movement model (`tickCruiserChase` ≤7px/tick, exact-snap convergence) + foul tint. Knobs: `POOP_AVATAR_HIT_RADIUS` 30, `POOP_CRUISER_SLOW_TICKS` 15s, `POOP_CRUISER_MAX_SPEED` 7.
- **P2 spawner-save (afa3ec1)** — `WorldSnapshot.spawner` via `snapshot(world,{spawnerState})` param injection (wire-safe by construction); DEV `__SPARK__.snapshotWorld/restoreWorld`; bit-exact resume test.
- **P3 EYES fog/CVD (0205d83)** — fuzzy fog edge (3-harmonic inward-only wobble baked into the brush; knob `FUZZ_AMP` 0.09); CVD: per-seat `P{n}` avatar nameplates + connection-dot shape (filled vs hollow+X).
- **P4 netcode infra (3e71e5f)** — **crypto host identity**: room code = 30-bit pubkey fingerprint + signed attestation latch — the S79 TOFU race is DEAD (LOCKED §13.20); **in-page auto-reconnect** (15s grace, proven over real WebRTC in e2e/reconnect.spec.ts); **drop-bench** rolling re-stamp for mid-game peer drops; **client-intent allowlist** closes the any-GameAction INTENT hole. NO protocol bump. Host-migration explicitly deferred (world dies with the host page; needs state-handover design — own session).
- **P5 lobby delta (e364df5)** — S69 P2 was already shipped (CARRIED banner corrected); true remainder closed: seatRack.test.ts via pure-helper extraction, dead pane-alphas removed.

**Carry-forwards (logged):** host-migration design session · P3 structure-ownership non-color cue + above-fog hazard identity (S77 Δ5) + MEMORY_FOG_COLOR dim-tier (user-EYES) · P5 D1 living-lobby animations + e2e geometry-getter migration · S73 dense-compaction colour-shift at Begin (sparse in-game seats).

---

## Session 83 — Voltkin full audit + real-animation upgrade [COMPLETED 2026-06-10]

**User-approved PDR v2 ("Approved! work creatively, technically, pedantically, and thoroughly"). Full tier, Council R1+R2 (Grok 4.20 + Gemini 2.5-pro) CONVERGED; adversarial CHECK Triumvirate ran post-ship (Gemini PASS 5/5/5/5; 4 of 5 Grok findings rejected on inline triage with evidence, 1 accepted-downgraded and hardened). 5/5 priorities (24648a8 → P5 close). Tests 1237 → 1247; bundle 544.9KiB < 550 (+2.8KiB); generative spend $3.00 of $10 cap.**

**ROOT CAUSE (A.0 audit):** the generator drew a literal *picture of* a transparency checkerboard behind the character — all 6 sprite frames had 0% real alpha (the in-game renderer applies no keying → checker card) and the intro mp4 had the same pattern (the .88 runtime luma key removed only the WHITE checkers; gray survived = the user-visible squares; belly `#FFEB6B` luma .887 sat ON the threshold → key punched holes in the character).

- **P1 true-alpha sprites (24648a8)** — `scripts/matte-voltkin-frames.py`: measured checker model → achromatic+bright candidate, border-connected labeling (enclosed whites structurally safe), 2px feather + nearest-bg unmix decontamination. 30/30 probes; interior byte-identical; originals in `assets-source/.../pre-s83-checkerboard/`.
- **P2 adversarial Veo probe (3215589)** — walk-cycle clip (the hard case: motion + loop closure + in-place), image-to-video seeded with the cleaned idle frame. Gate PASSED: dHash drift 0–18/64, loop 29..37 closure below consecutive-frame baseline, zero static transitions. The probe clip became the production walk asset.
- **P3 real animation (4e3e257)** — 5 more clips (zap/hurt/victory on MAGENTA so achromatic-white decorations survive the key + provably-safe despill; idle/charge on white). `scripts/build-voltkin-atlas.py` → ONE 2048×1792 atlas (56× 256px cells, quantized, 540KB) + manifest in public/ (zero bundle cost). `voltkinFrames.currentAnimCell` pure mapping: loops on `world.tick` (+per-creature phase), one-shots on `ticksInState`, **zap apex lands exactly on FIRE_TICK=30**, form-swap boundaries identical to legacy → `flashIntensity` unchanged. Legacy 6-frame path retained as instant-first-paint + fallback. **Discovery:** wire `prevPos` rehydrates equal to `pos` on the 1v1 client → the S36 facing flip never worked on the client mirror; renderer-side velocity estimator (15-tick hold) now drives walk/idle AND facing, no wire change. Live-verified on the real loop: frame-exact ATTACKING sequence with a real bond severed underneath (LOCKED §13.15 untouched).
- **P4 intro video fix (662def5)** — `scripts/matte-voltkin-intro.py`: temporal-median plate + 13px morphological opening (protects static lightning-arc cores baked into the plate) + per-frame plate-difference key → checkerboard composited onto black offline, approved content preserved exactly (0.06% survivor verify). `lumaKey.enabled=false` → plain-DOM video path; belly-hole defect eliminated by construction.
- **P5 verification sweep + CHECK hardening** — full e2e lane 37 pass/1 skip (3.7m) incl. fog 6-children; vitest 1247/1247; estimator teleport/backward-clock guards; per-creature loop phase offset (Gemini CHECK observation); CI green on tip.

**Carry-forwards (logged):** VFX lightning-overlay library (user-deferred; procedural ARC_FLASH stays) · host-migration design session · EYES follow-ups (ownership cue, above-fog identity, MEMORY_FOG_COLOR tier) · lobby D1 animations + e2e geometry getters · S73 dense-compaction colour-shift · **playtest round 5**: cruiser-slow feel + fuzzy fog + nameplates + reconnect UX + drop-bench (S82 knobs, untested by user) + NEW: Voltkin animation feel on the live site (walk/idle gait, charge→zap punch, hurt/victory despawns, intro over black).

---

## Session 84 — Pooped pickup gate + rainbow flyover celebration [COMPLETED 2026-06-10]

**User-queued 2-priority batch ahead of backlog work ("Make it happen! be creative technical and and thorough! then push it so i can check it out today"). Standard tier, Council R1 Trident Strike (Grok 4.20 + Gemini 2.5-pro) → synthesis; adversarial CHECK Triumvirate post-ship with FIX-THEN-SHIP remediation. Tests 1247 → 1270; bundle 548.5KiB < 550 (+3.6KiB); generative spend +$0.05 ($3.05 of $10 cap).**

- **P1 pooped pickup gate (3feb7ef)** — playtest-r5 bug: while poop-debuffed the avatar slow-chases the cursor at 7px/tick, but `applyPickupSpark` had no avatar-proximity requirement, so the full-speed CURSOR still grabbed sparks instantly = the debuff never bit for collecting. New gate: `isCruiserDebuffed && distSq(spark, avatar) > POOP_PICKUP_ARRIVAL_RADIUS(36)²` → silent reject + `rejectReasons.pickupPoopedTooFar`. Pure function of synced fields (optimistic + authoritative dispatch agree by construction); zero wire change; 5 unit tests.
- **P2 rainbow flyover (d20c325)** — clicking the rainbow now triggers a celebration on EVERY peer: an Imagen-4-generated dumb crooked-tooth rainbow (mismatched googly eyes, stubby arms; true-alpha matte via `scripts/make-rainbow-flyover-sprite.py`) arcs left→right on a parabolic dome with squash wobble while the whole background pulses 3-band hue-cycling trippy light + 4 rotating beams (peak alpha at the 0.30 photosensitivity cap, ~0.4Hz, no strobe), yelling a Chirp3-HD TTS "Gnyaaaaah! Gniiiiiing! Hyoooouuuu!" pitch-warped 1.3x + vibrato (2.7s/19KB ogg). **Design (Council A.0 probe):** a one-shot GameEffect would reach the 1v1 client ~1/6 of the time (10Hz snapshot samples `world.effects` live; effectsRenderer wipes per frame) → synced `world.rainbowSwitchTick` field instead (additive-optional, no schema bump; overwrite=restart; late joiner sees remaining window; 60-tick yell freshness; cleared on START_GAME/RETURN_TO_TITLE). Pure `flyoverPose()` unit-tested incl. full-240-tick alpha sweep; procedural-Graphics fallback if the PNG fails.
- **CHECK remediation (d3fbae1 + 971c81a)** — RALPH:PATROL caught the d20c325 e2e lane RED: fog.spec `aboveFogLayer` children contract 6→8 (flyover overlay+char) amended with roll-call comment; rainbow.spec self-close poll 10s→30s (CI software-WebGL sim-lag, bomb.spec precedent); alpha docblock drift fixed. Grok re-run (with verbatim hunks) → 1 finding shipped as monotonic `<=` yell-latch guard, 2 rejected on trust-model evidence, 1 advisory (10Hz client pose stepping — playtest judges). Gemini re-run PASS 5/5/5/5. **Process lesson: the first Grok/Gemini CHECK round accidentally got NO diff (prompt ended at "THE COMPLETE DIFF:") — Grok vacuously PASSed, Gemini hallucinated a `packages/` repo. Re-ran with hunks embedded; only the with-hunks verdicts count.**

**AMENDMENT (same session, user-approved): P3 game length + P4 scoring (d1bb0d7) after a real 4p-FFA field report ("a friend that built nothing won; builders' points seemed similar").**
- **P3 (+20% length)**: `PHASE_1_WIN_SCORE` 150→210, `SCORE_TIER_STEP` 50→70 (exact thirds), co-tuned with P4's income change (~+22% duration for connected builders). Hunter trigger auto-scales.
- **P4 (scoring)**: 6 in-vitro probes proved core attribution + win-pick CORRECT (non-builder accrues exactly 0; max-scan attributes the true leader; wire mirror + ENDGAME + reconnect guards all clean) — the field mechanism remains UNREPRODUCED (honest carry-forward). The verified REAL defects fixed: (a) leaderboard rows were color-NAME labels keyed to seats — every rainbow shuffle made them lie; now seat-stable `P{n}` + `*` leader marker (matches nameplates + win banner); (b) functional bonds weighed ZERO (S76 neutrality) so a connected tree earned = scattered prims — now +0.25/bond, counted bonds capped at ⌊1.5×prims⌋ (clique-spam saturates; don't-connect exploit stays dead); (c) WIN-time per-seat {score, complexity} console forensics on every peer. +6 regression tests incl. a DISTRIBUTED-PIPELINE test (host snapshot → ClientSync mirror → client WIN scan). Tests 1270→1276.
- **CHECK round 3 lesson (6ad5f04)**: the flyover's 4th full-canvas fill made CI software-GL render at seconds-per-frame — two timeout bumps failed before measuring WHAT was slow; killing one wash rect fixed CI AND real low-end GPUs; `__TEST_FLYOVER_DURATION_TICKS__` seam added (mirror of `__TEST_WIN_SCORE__`).

**Carry-forwards (logged):** **non-builder-win root mechanism** (unreproduced in vitro; the new scoreboard + WIN console dump are the field instrumentation — collect a console screenshot if it recurs in round 6) · pooped-pickup rejection UX cue (silent reject is the user-requested semantic; add feedback only if playtest wants it) · 10Hz client-mirror pose stepping advisory (flyover + all tick-driven renderers; judge in 1v1 playtest) · bond-formation juice + in-world leader crown (Gemini creative, round-6 candidates) · periodic-scoreboard fallback knob if real-time scores distort FFA play · everything from S83 (playtest round 5 incl. Voltkin feel + S82 knobs, host-migration, EYES follow-ups, lobby D1, VFX lightning library user-deferred).

---

## Session 85 — Playtest round-6 fixes + top-BACKLOG batch (host-migration design · EYES · lobby D1 + geometry getters) [COMPLETED 2026-06-11]

**User-queued 3 playtest bugs + pre-approved BACKLOG batch ("i pre-approve full batch and autonomous run"). Micro tier (user-path deliberation waiver); diagnose-before-fix runtime probes via the preview harness. Tests 1276 → 1299; bundle ~549.0KiB < 550; generative spend $0 (P1 re-mastered the EXISTING source WAV).**

- **P1 rainbow yell SILENT (646e724)** — runtime probes proved the S84 wiring CORRECT (flyover active, ogg fetched 200, prototype-patched `source.start()` fired into a RUNNING context) — the ASSET was silent: volumedetect mean −52.8 dB, the entire 2.67 s under −45 dB (a 2.5 ms click, then nothing). The S84 ffmpeg chain was run ad-hoc and never committed = unauditable. Source TTS WAV was healthy (−16.1 dB). Fix: `scripts/make-rainbow-yell.py` (committed pipeline: asetrate 1.30 + vibrato + alimiter, NO one-pass loudnorm) with a BUILT-IN audibility gate (mean ≥ −30 dB, peak ≥ −6 dB, else delete + exit 1); regenerated ogg = −15.2 dB mean (lightning-crackle family); + `duckMusic(2700ms)` on yell (the one-shot duck pattern the yell alone lacked). In-browser decode probe of the SERVED asset: RMS −15.2 dB.
- **P2 flyover ~10× larger (e201acd)** — `CHAR_SCALE` 0.55→1.75 (visible content ~604×364 px ≈ 31% canvas width at apex; user: "like 20% of the whole screen"), `OFFSCREEN_MARGIN` 220→380 (re-derived from visible-content corner reach), fallback re-anchored to `FALLBACK_NATIVE_SCALE`. Verified live via apex-hold pin screenshot.
- **P3 pooped gate on the BUILD verb (d4a7d8b)** — S84 P1 gated `applyPickupSpark` (LMB-down claim) but every real build runs the atomic LMB-up `PLACE_FROM_FREE`, which had NO gate — the debuff never bit the build loop (S84's own reflexion lesson recursed: the bug lives where the check is MISSING). Same arrival gate added to `applyPlaceFromFree` pre-commit (placementPos within `POOP_PICKUP_ARRIVAL_RADIUS` 36 of avatarPos, else `pickupPoopedTooFar`++); pure fn of synced fields; S52 atomicity intact. 5-case test matrix (S84 parity); live-verified through the real dispatcher.
- **P4a host-migration design (c1498e8)** — `HOST_MIGRATION_DESIGN.md`: the two-problem split (authority vs identity handover). Authority = cold-standby "adopt the mirror" (netSnapshot is full WorldSnapshot minus exactly {rngSeed, nextPrimitiveId, nextBondId, spawner, savedAt} — rebuild allocators, reseed streams, one-time cadence divergence accepted). Identity = succession warrant signed by the original host key at Begin (room code stays the same commitment; epoch counter kills zombie hosts; lowest-surviving-seat = zero-vote election). Detection = peer-left OR 6 s snapshot starvation, THEN the existing 15 s grace. 4-phase landing (D1 plumbing → D4 hardening + protocol v7→8).
- **P4b EYES follow-ups (1f9154e)** — (a) per-owner bond patterning: seat-keyed white overlays (seat0 solid · 1 rungs · 2 beads · 3 chevrons), networked-only, shuffle-safe (color→seat rebuilt per frame); (b) above-fog hazard identity: dashed white pulsing ring on hunter + non-carried potato (luminance+motion cue; drawn INSIDE existing Graphics — fog.spec children contract untouched); (c) `MEMORY_FOG_COLOR` 0x000000→0x161b2e (S59 designed dim tier restored per user-EYES; 1-line revert knob). fog.spec 6/6 post-change.
- **P4c lobby D1 + e2e geometry getters** — D1: seat cards POP IN on join (alpha+scale ease-out 280 ms) and BLINK OUT on leave (alpha dip 350 ms), `seatAnimPose` pure + tested, Ticker.shared cosmetic pass, silent first-baseline (no pop-in storm on room entry). Geometry getters: `titleScreen.getButtonCenters()` + `lobbyScreen.getUiPoints()` (live-container reads) consumed via `helpers.titleButtonCss`/`lobbyUiPoints` across helpers + bomb/hunter/potato/rainbow/lobby-construction specs — the S50 P5 hardcoded-coordinate drift class is dead by construction.

**Carry-forwards (logged):** playtest round 6 NOW INCLUDES: audible yell + big flyover + pooped build-gate + bond patterns + hazard rings + memory dim tier + lobby animations · non-builder-win forensics (S84 instrumentation live) · host-migration D1–D4 implementation phases (design adopted on paper) · pooped-reject UX cue · S73 dense-compaction colour-shift · VFX lightning library (user-deferred).

---

## PRE-S83 BRIEF (historical) — VOLTKIN FULL AUDIT + REAL-ANIMATION UPGRADE [USER-QUEUED 2026-06-10, verbatim intent]

User: Voltkin today is "not a really animated graphic, it's a collection of pictures running one after another with the clipping/cutout (squares) in the background that kinda looks like crap … even the voltkin video has those cutout white squares around instead of blending into the black background." Mandate: **full audit, then a full upgrade to a real moving character**, while KEEPING the in-game mechanics exactly (targets enemy structures, destroys them with electric bolts). User suggests exploring generative platforms (xAI etc.) whose output can be embedded. "Be super methodical, thorough, and creative."

Session plan seeds (validate with A.0, don't trust blindly):
1. **AUDIT first**: render path = `src/render/voltkinFrames.ts` + `creatureRenderer.ts` (frame-flip sprite playback) + `cinematicLumaKey.ts` + `cutsceneOverlay.ts` (intro video); assets at `public/godly/voltkin/` + `assets-source/godly-voltkin/` (SLICE_SPEC.md, sprite history, notes/). The "white squares" = matte/alpha defect — check whether frames carry true alpha or rely on a luma key the in-game sprite path never applies; audit the intro video path separately (user says the video shows the squares too).
2. **Upgrade options to Council**: (a) regenerate frames with TRUE alpha (gcp-vertex MCP imagen_generate/imagen_edit in-session; offline matte pipeline → premultiplied-alpha spritesheet); (b) procedural skeletal/vector animation in Pixi (bones + tweened parts — infinitely smooth, tiny bytes, matches the vector aesthetic; the most "real moving character"); (c) Veo/video with a properly applied runtime luma key; (d) hybrid vector body + generated texture detail.
3. **Constraints**: creature mechanics untouched (`creatureAI/creatureAttack/creatureLifecycle`, LOCKED §13.15); bundle 550KiB charter (~7.5KiB JS headroom — big sheets go to public/ assets, never the bundle); deterministic sim untouched (render-only swap); aboveFogLayer staging + e2e `children.length===6` assert preserved.
4. Tools in-session: gcp-vertex MCP (imagen/veo/tts), xai-grok MCP. History: S22–S28 phase-2 archive plans + `assets-source/godly-voltkin/notes/*`.

---

## Session 34 — S30 audit P2 batch (Phase A) + fresh audit cleanup (Phase B) [COMPLETED 2026-05-16]

**Phase A (S30 audit P2 batch — deferred from S33):** 8 priorities shipped, 9 commits `0df05d1..07b12b9`. P2-18 dropped per false-positive pattern (existing comment documents intentional back-compat). Standard tier Council R1 + PRIME-AUDIT 4 deltas. Tests 588 → 620 (+32). Bundle 467.46 → 468.14 KB (+0.68 KB).

**Phase B (fresh 4-agent audit + cleanup):** 16 findings surfaced; PRIME-AUDIT rejected 3 false-positives (computeCreatureTint div-by-zero guarded by control flow; leanFactor 1e-6 epsilon adequate; atan2(0,0) deterministic). 9 actionable shipped (1 P0 doc, 6 P1, 2 P2). Council R1 + PRIME-AUDIT additional.

---

## Session 33 — S30 audit P1 batch (10 priorities) [COMPLETED 2026-05-16]

P1-7 dropped per PRIME-AUDIT Δ2 false-positive. 9 commits `2f07f3f..45dbf18` + close `99e8b1a`. Standard tier Council R1 + PRIME-AUDIT 2 evidence-based overrides. Tests 576 → 588 (+12). Bundle ~unchanged.

---

## Session 32 — diagnostic-only (no code change) [COMPLETED 2026-05-16]

User-reported "voltkin video + bg music gone" turned out to be browser cache. Empirical headless test in identical bundle confirmed code worked end-to-end. Hard refresh fixed user-side. S32 P1 batch deferred → executed S33.

---

## Session 31 — S30 audit P0 batch (5 user-visible Voltkin bugs) [COMPLETED 2026-05-13]

**Triggered by S30 audit findings (4 parallel agents this session — code-quality / test-determinism / runtime-correctness / docs-drift — surfaced 24 findings). User decision: ship P0 (5 priorities) S31, P1 (10 priorities) S32, P2 (9 priorities) S33. Standard tier, Council R1 (Grok+Gemini) deliberated 2026-05-16 + PRIME-AUDIT (2 overrides Q1+Q3, 1 scope amendment).**

**Pre-execution status:** PDR drafted, Council R1 complete, PRIME-AUDIT logged. Awaiting user `go`. See `.claude/plans/2026-05-16_PDR_Session_31_P0_Audit_Batch.md`.

**5 priorities:**

- **P0-1 — Voltkin spawn-pulse hidden under cinematic overlay.** `main.ts:519` schedules SPAWN_CREATURE at `cinematicMs` (tick 240) but overlay clears at `cinematicMs + sustainedEffectMs + FADE_MS` (tick 288). 48 of 60 SPAWNING animation ticks hidden under opaque overlay. Fix: delay `fireAtTick` by full overlay-clear time. Export `FADE_MS` from `cutsceneOverlay.ts`. Option A (spawn at fade-END, full pulse visible) adopted over Council Q1=B (PRIME-AUDIT override — spawn pulse visibility prioritized over "emerge through fade").

- **P0-2 — Cinematic teardown leaks on RETURN_TO_TITLE / POSTGAME.** Reducer (`gameMode.ts:applyReturnToTitle`) doesn't clear `world.creatures`, `nextCreatureId`, `activeCinematicPlayerId`, `currentCinematicEvent`, `pendingCinematics`, `pendingCreatureSpawn`. Orchestration (`main.ts:teardownNet/resetIfPostgame`) doesn't call `cutsceneOverlay.abort()`, `screenShake.reset()`, `clearTimeout(cinematicTimer)`. Fix: reducer clears 6 fields; main.ts adds PLAYING→TITLE transition watcher; `main.ts:311` changed from direct `world.gameState='TITLE'` to `dispatch(RETURN_TO_TITLE)` (PRIME-AUDIT Δ5 scope amendment).

- **P0-3 — 1v1 client never sees ARC_FLASH lightning or screen-shake.** `save.ts NetSnapshot` omits `world.effects`. Client mirror gets creatures+positions but no visual attack feedback, no audio, no shake. Fix: serialize ARC_FLASH+BOND_FORMED+BOND_SEVERED in NetSnapshot (filter; Council Q2 adopt); client-side implicit ARC_FLASH detection → `screenShake.trigger` (PRIME-AUDIT override of Council Q3=explicit — YAGNI); effect age computed as `currentTick - effect.tick` for replay determinism (Gemini Q-01 adopt).

- **P0-4 — Duplicate cinematic-completion GODLY_COMPLETE dispatch.** `main.ts:523-526 cinematicTimer` fires at 4500ms; `cutsceneOverlay.completeTimer + onComplete` fires at 4800ms. Two dispatches 300ms apart. Reducer idempotent today, latent break-day. Fix: delete `cinematicTimer` entirely; rely on cutsceneOverlay.onComplete. Safety verified via PRIME-AUDIT investigation against Grok's "unsafe" Q4 claim — all cited failure modes refuted.

- **P0-5 — Flip 5 stale STATUS:IN-PROGRESS plan-archive headers.** `.claude/plans-archive/voltkin_phase2_*.md` (5 files) still tagged IN-PROGRESS despite Phase-2 finale at S28. Pre-flight WARN fires every session. Fix: 5 line-3 edits.

**Tests:** ~8-10 new (560 → ~568-570 baseline). E-01 invariant (no-overlap window post-P0-1A), T-01 peer-disconnect mid-cinematic, teardown integration test (Grok #4 partial adopt — full ReplayDriver deferred to S33+).

**Estimate:** ~22K tokens, +70-90 LOC, -15 LOC, bundle +0.5KB max.

**Carry-forward to S32:** P1 batch (audit findings #6-#15).

---

## Session 32 — S30 audit P1 batch (quality + correctness) [SUPERSEDED — deferred + shipped in S33]

**Estimated 10 priorities from S30 audit:**

- **P1-6** Phantom screen-shake on physics-severed bond same tick (gate shake on `world.effects.some(e=>e.kind==='ARC_FLASH'&&e.tick===world.tick)`)
- **P1-7** Belt-and-suspenders video pumping (drop one of `texture.source.autoUpdate=true` or per-tick `source.update()`)
- **P1-8** Two `loadeddata` listeners on same `<video>` element (consolidate)
- **P1-9** Dead `readyState >= 2` fast-path in `mountVideoViaShader` (runs before `video.load()`, branch never taken)
- **P1-10** Duplicated `pseudoRand` mulberry32 in `arcFlash.ts` + `screenShake.ts` (consolidate to shared `src/state/rng.ts`)
- **P1-11** ARC_FLASH seed missing creature.id (actual: `(tick|0) ^ imul(sx,K1) ^ imul(sy,K2)`; two creatures at same int-truncated pos same tick produce identical jitter — safe today, breaks at Anvil)
- **P1-12** Snapshot→simulate→snapshot replay-determinism test (highest-value missing test for catching future Math.random/Date.now creep)
- **P1-13** `characterSprite` field name lies after S30 P0b (now holds video sprite — rename to `videoSprite`)
- **P1-14** BACKLOG.md backfill S20–S30 entries (or mark BACKLOG deprecated in favor of session-state + handoffs)
- **P1-15** 6 stale handoffs at root (byte-identical archives exist) → remove

**Estimate:** Standard tier ~20-25K. 10 surgical fixes, each Micro scope.

**Carry-forward to S33:** P2 batch (audit findings #16-#24).

---

## Session 33 — S30 audit P2 batch (future-tax + cleanup) [SUPERSEDED — deferred + shipped in S34 Phase A]

**Estimated 9 priorities:**

- **P2-16** `ScreenShake.reset()` + `creatureRenderer.destroy()` wired into teardown (largely folded into S31 P0-2; verify carry-over completeness)
- **P2-17** `seekForce` exported in `creatureVerlet.ts` but unused in prod (delete or annotate as test-only)
- **P2-18** Dead `'godly'` variant in `BOND_SEVERED.cause` union (no live emitter post-S27)
- **P2-19** LOCKED_DECISIONS §13.15+ codification of Phase-2 godly/creature system (lifetimes, FIRE_TICK 30, SEEKING_LEAN_MAX_RAD ≈0.262, sustainedEffectMs=500, ARC_FLASH_DURATION_TICKS=24, ScreenShake 6-tick decay ±2px)
- **P2-20** `voltkin-config.ts` (Gemini Q2 carry from S26+S27+S28 — per-type CreatureConfig table; lift hardcoded constants from 6 files); prereq for Anvil ship
- **P2-21** `pendingCreatureSpawn` clear on `START_GAME` (largely folded into S31 P0-2; verify)
- **P2-22** Commented-out code at `cutsceneOverlay.ts:214-218` + handoff S30close `src/render/arcFlash.ts` path typo (actual: `src/render/effects/arcFlash.ts`)
- **P2-23** Stale `.bak` files (`.handoff-archive/HANDOFF_2026-05-09_session3of10.md.bak`, `.claude/session-state.json.bak`)
- **P2-24** Untested S25-S30 code paths (CreatureRenderer.sync 74 LOC, drawArcFlash 120 LOC, cutsceneOverlay cleanup paths) — add jsdom-gated lifecycle tests

**Estimate:** Standard tier ~18-22K. Mostly cleanup + one Standard refactor (P2-20 voltkin-config).

**S34 candidate (post-audit):** Anvil creature using consolidated voltkin-config base (S25-S28 architecture replay applied to second godly).

---

## Session 19 — Audio controls UI + disruptionManager extraction + per-silhouette gradient [COMPLETED] (2026-05-12)

**Triggered by user playtest signal "i can hear the track, the claves and fart however no, also there should be an option to shut of music/sounds and control volume" + "sure html overlay sound good. just needs to work well its not the most important part." Standard tier (P2 drives — anti-bloat extraction). Council R1 fired once on P2; P1 + P3 Micro under PRIME-AUDIT. Three priorities shipped + handoff.**

**P1 — Audio controls UI (Micro, commit `5026282`).** audioManager.ts refactored: master GainNode role preserved as 'M' global pause target; 2 new children musicGain + sfxGain routed to master. Existing playClaveSFX/playFartSFX rerouted to sfxGainNode (was masterGain); playMusic local musicGain promoted to shared module-level node. New public API: setMusicMuted/setSfxMuted/setMusicVolume/setSfxVolume/getAudioSettings/clamp01. localStorage schema 1→5 keys (legacy spark_audio_muted + 4 new audio.musicMuted/audio.sfxMuted/audio.musicVolume/audio.sfxVolume) with try/catch + malformed-value fallback to defaults (music 0.25, sfx 1.0). NEW settingsOverlay.ts (~240 LOC HTMLDivElement: position:fixed top:60 right:24 z-index:1000, 2 channel rows with on/off checkbox + 0..100 range slider, closes on ✕/ESC/outside-click, keydown stopPropagation defense-in-depth). main.ts: ⚙ Pixi Text at (CANVAS_WIDTH-32, 30) eventMode='static' pointertap → overlay.toggle()+initAudio(). LOCKED §13.14 NEW codifies full audio subsystem (graph diagram + 5-key schema + UI surfaces + 'M' gate semantics). Tests 346 → 356 (+12 new -2 dropped: clamp01 pure 4, defaults, music/sfx volume clamp, per-channel mute independence, master preserves per-channel, toggleMute return; dropped 2 localStorage-roundtrip + legacy-key tests since vitest node env lacks window.localStorage — manual playtest verifies persistence). Build 393 KB main bundle (+5 KB). Preview verified: gear icon at (1888,30,alpha=0.55,eventMode=static), overlay opens on pointertap, 4 inputs present, music slider=25 sfx slider=100 both checkboxes=true defaults, input event on music slider value=50 → getAudioSettings().musicVolume=0.5, change event on sfx checkbox unchecked → sfxMuted=true.

**P2 — disruptionManager.ts extraction (Standard, commit `079bdc1`).** Council R1: Grok DISRUPTOR 10 challenges + Gemini AUDITOR 8 findings. CONVERGENT BLOCKER (Grok #4 + Gemini #1): effect ordering must remain SEVER_ERASE (pre-mutation, reads live prims) → mutation → BOND_SEVERED (post-mutation audio marker). Adopted 7 Council items (4 helpers + orchestrator owns charge decrement per Gemini #2); rejected 2 NITs (Grok #1 severPos already pre-captured, Gemini #8 redundant given canSeverBond physics-cause early-return). NEW disruptionManager.ts 151 LOC: `canSeverBond(world, action, primA, primB): boolean` (1v1 gate + hostile auth + charge prereq, no consumption), `computeBaseCharge(world, action, primA, primB): number` (called AFTER severSplit for cycle-no-consume), `computeSeverEraseEffects(world, split, tick): GameEffect[]` (pre-mutation visual erase array), `applySeverTopology(world, bond, split): void` (map mutations + snapPrevPosForUnbonded, no charge, no effects). world.ts SEVER_BOND case 70 LOC → 25 LOC orchestrator preserving original ordering: bond lookup → primA/primB fetch (Grok #2 pre-fetch) → severPos capture → canSeverBond gate → severSplit → cycle-adjusted charge → charge decrement → emit erase effects → applySeverTopology → emit BOND_SEVERED. All S17 §13.11 LOCKED semantics preserved bit-for-bit (cross-player 1 charge, self-sever free, cycle no-consume, physics bypass, hostile-if-either-differs, placerColor immutable auth). Tests 356 → 370 (+14): canSeverBond × 5, computeBaseCharge × 4, computeSeverEraseEffects × 2 (live-prim payload, missing-prim defensive skip), applySeverTopology × 3 (single-bond cleanup, chain cascade, delBonds cascade). All 16+ existing SEVER_BOND regression tests pass unchanged. world.ts 359 → 311 LOC (-48 LOC, -13% — closer to §XV 280 charter, still 11% over; further worldFsm extraction S20 carry-forward). PRIME-AUDIT #5 (severSplit purity) + #6 (missing-endpoint-prim) addressed. Build 393.82 KB bundle (+0.31 KB net from extraction overhead).

**P3 — Per-silhouette gradient (Micro, commit `f293729`).** Phase-2 §VI.4/§X.2 polish completed: 12 magic silhouettes now extend the colorA→colorB gradient rolled out for default-line in S17 P2. Three shared helpers: `midColor(p)` (ornament center colors), `strokeAxisLerp(g, p, ax, ay, bx, by, widthScale?, alphaScale?)` (4-segment A→B straight strokes — filament main / cable parallels / bracket base / wheel diameter / capsule parallels / faint underlays in star/orbital/warped), `strokePathLerp(g, p, steps, point(t), widthScale, alphaScale?, colorSegments=8)` (curved parametric A→B — vortex spiral, whip sine). Endpoint-anchored elements (bracket apex sides, diamond 4 sides, lattice 4 sides, capsule end caps) use respective endpoint's placerColor per §X.2 "reveal contributions". Midpoint ornaments (filament rays, wheel ring/spokes, star, orbital rings, lattice cross-hatch, warped 3-fold ring) use midColor. Tests 370 → 377 (+7): same-color back-compat fx.capsule 4 strokes + fx.diamond 1-stroke fast path; cross-color fx.capsule 10 strokes with caps in respective colors, fx.diamond 4-stroke 2+2 distribution, fx.bracket base lerp + 2 apex sides in endpoint colors, fx.vortex 8 lerped segments R-fade-out + B-fade-in monotonic, fx.whip 8 segments. PRIME-AUDIT #7 (perf 12 silhouettes × ≤8 strokes × 50 bonds ≤4K ops/frame, well inside Pixi v8 batching) + #8 (shared util) both addressed via strokePathLerp factoring (reduced 544 → 536 LOC vs duplicating vortex+whip 8-segment branches). bondVisualRenderer.ts 447 → 536 LOC (7% over 500 charter; S20 carry-forward: extract magic silhouettes into per-shape files under src/render/effects/silhouettes/). Build 394.56 KB main bundle (+0.74 KB net).

**P4 — Scope Amendment urgent BLOCKER fix attempt: pin Nostr relays (Micro, commit `12de8cd`). *DID NOT RESOLVE BLOCKER* — see S20 P0.** Post-handoff playtest BLOCKER: user + brother both stuck at "connecting" in 1v1 lobby across separate networks. A.0 via node_modules inspection: silent npm bump `trystero ^0.20 → ^0.24` since S15 P2 wiring + 0.24's `@trystero-p2p/nostr` module picks 5 random relays from 55 defaults via `shuffle(defaults, strToNum(config.appId))`. Hypothesis: shuffle IS deterministic per appId (both peers land on same 5) but the default list includes many personal / dead / geo-flaky endpoints (basspistol.org, chorus.almostmachines.dev, etc); both peers picked the same dead set → no Nostr signaling → no WebRTC offer delivery → stuck. Fix: pin 6 known-reliable public Nostr relays in `src/net/transport.ts` NOSTR_RELAYS const, pass via `relayConfig.urls` + `redundancy = NOSTR_RELAYS.length` so ALL 6 are used (no sub-sampling): relay.damus.io / nos.lol / relay.mostr.pub / purplerelay.com / relay.nostr.band / nostr.wine. LOCKED §13.1 updated: Trystero pin `^0.20` → `^0.24` + NEW NOTE block codifies the 6-relay set + future-bump audit protocol. Typecheck exit 0. Build 394.74 KB bundle (+0.18 KB net). **Post-deploy retest 2026-05-12 ~18:25 UTC: host still shows "Waiting for Player 2..." with code displayed; client (same code, different browser/network) still shows "Connecting..." indefinitely. Same symptom as pre-P4. Relay pin alone insufficient.** Hypothesis revised: dead relays were ONE possible cause but the actual failure is downstream (peer handshake / WebRTC ICE / Trystero 0.24 API wrapper drift). S20 P0 = continue diagnosis with 5 carry-forward hypotheses (console-error capture, transport.ts API-wrapper audit vs 0.24 Room type, ICE/TURN config for symmetric NAT, A/B test downgrade to trystero@0.20.0, strategy swap to MQTT/torrent).

**Carry-forward for S20+:**
- **Manual playtest on live URL** (after GH Actions deploy lands): ⚙ icon next to ♪ → opens settings panel; music slider live-updates; SFX toggle off → claves silent music continues; ESC/outside-click/✕ close; reload → all 4 settings persist; 'M' global mute preserves per-channel; cross-player bond → gradient visible on magic silhouettes (vortex spiral + capsule end caps especially).
- **bondVisualRenderer.ts extraction** (anti-bloat §XV): 536 LOC, 7% over 500; extract magic silhouettes into per-shape files like S12 #per-kind-split pattern.
- **lobbyScreen.ts extraction** (anti-bloat §XV): 551 LOC, 10% over 500 (S19 A.0 surfaced this; pre-existed S18 close).
- **world.ts further extraction** (anti-bloat §XV): 311 LOC still 11% over 280; worldFsm helpers candidate.
- **P7 bond-hover cost preview** (Council R1 Grok #4 deferred-PARTIAL S18): needs new hit-test infrastructure (bondHover doesn't exist) — scope grew from ~30 LOC to Standard tier.
- **Audio polish (P9 from S18 handoff)**: OGG compression for mobile (10MB mp3 → ~2MB), PannerNode + auto-duck.
- **P2 NET feel tuning** (playtest-gated cross-network with friend).
- **P3 NET enhancements** (Standard, playtest-signal-gated): client prediction + delta NetSnapshot + host migration + live cursor sync.
- **P5 Phase-2 next mechanic** (design-gated, user picks): D Inject Spiral / E Steal / A Fog / G Mega-combos.

---

## Session 18 — Custom-domain push closeout + P8 audio [COMPLETED] (2026-05-12)

**Triggered by user resolving S17 P0 push-gate (Squarespace DNS migration done) + scope-amendment "first do P8 Audio ... and lets implement suno soundtrack that is attached. by the way we need little sounds affects when a new connection is made and a sound effect for when a connection is broken." Standard tier (Council R1 + PRIME-AUDIT). Two priorities shipped + handoff.**

**P0 — S17 push-gate resolution (Micro pre-authorized; commit `f09e452`).** User confirmed Squarespace DNS migration (Squarespace Defaults preset deleted; 5 custom records added: 4 A `@` 185.199.108-111.153 + CNAME `www` daneshto-dotcom.github.io.). `git push origin master` shipped 7-commit S17 queue (fd016c2..f73bc3a). GH Actions deploy run 25741967555 success. `gh api -X PUT repos/.../pages -F cname=spark-online.space` bound custom domain (cname:null → cname:spark-online.space). Let's Encrypt cert auto-issued ~30s later (state=approved, domains=[spark-online.space, www.spark-online.space], exp=2026-08-10). `gh api -F https_enforced=true` flipped HTTPS enforcement. `curl -sI https://spark-online.space/` → HTTP 200 ✓. `<title>SPARK</title>`. github.io fallback now 301-redirects to primary. LOCKED §13.9 amended commit `f09e452`: "S17+, deferred" → "S18 P0 SHIPPED 2026-05-12" + cert metadata + DNS config details + `gh api` commands + fallback URL redirect note. **Live URL: https://spark-online.space/**

**P1 — P8 Audio (Standard, commit `105b276`).** Suno track "Blue Steppe Orbit" (10MB mp3, user-supplied) ships as background music + 2 procedural SFX (clave-tap on bond-form, descending-pitch sweep on player-cause sever). Council R1 (Grok DISRUPTOR 8 challenges + Gemini AUDITOR 10 findings) + PRIME-AUDIT (5 items). 2 BLOCKERs converged: replay double-fire (Grok#2 + Gemini#1) → `lastDrainedTick` cursor; multi-bond stacking (Gemini#4) → 1-BOND_FORMED-per-placement aggregation. 6 SHOULDs adopted: localStorage try/catch (Safari private mode safe), AudioContext init on ANY user gesture + `ctx.resume()` on every play call, exp ramps for fart synth, mute glyph child-add-order layering, music-start covers solo + 1v1 paths, SFX fires for both local+remote bond changes. 4 DEFERRED (OGG compression, PannerNode, cross-tab storage, music loop gap). PRIME-AUDIT + STATE-DISCOVERY GATE A.0: 5 claims verified — bonds.delete only in SEVER_BOND ✓, physics SEVER_BOND zero in prod ✓, 'M' key conflict-free across 4 handlers ✓, effects not in save schema ✓, no NET-protocol type clash ✓.

New: `public/audio/blue-steppe-orbit.mp3`, `src/render/audioManager.ts` (~220 LOC: singleton AudioContext lazy-init on user gesture, master GainNode mute, music via AudioBufferSourceNode loop fetched + decoded once, SFX synth — sine 1200+2400Hz clave 30ms / sawtooth 600→180Hz fart with LPF sweep 280ms, lastDrainedTick cursor, localStorage mute persist with try/catch, exported pure helpers `claveEnvelope` + `fartFreq` for unit tests), `src/render/audioManager.test.ts` (16 new tests). Modified: `src/game/effects.ts` (BOND_FORMED + BOND_SEVERED kinds added to GameEffect union), `src/state/placePrimitive.ts` (snapshot `bonds.size` at top; emit ONE BOND_FORMED at end if `bondsFormedCount > 0`), `src/state/world.ts` SEVER_BOND (capture `severPos` pre-delete; emit BOND_SEVERED at end with `action.cause`), `src/render/effects/lifetime.ts` + `src/render/effectsRenderer.ts` (TS exhaustiveness — audio-only kinds filtered at drain, no-op in draw), `src/main.ts` (import audioManager; lazy init on pointerdown/keydown gesture; 'M' key gated on activeElement not being INPUT/TEXTAREA; `drainAudioEffects` BEFORE `effectsRenderer.sync` since latter wipes `world.effects`; playMusic() on PLAYING transition covers all 3 entry paths; ♪ mute indicator top-right y=30, dims + slashes on mute). Tests 330 → 346 (+16). Typecheck exit 0. Build success (777 modules, 388KB main bundle +3KB from audioManager, `dist/audio/blue-steppe-orbit.mp3` 10MB verified). GH Actions run 25743852262 deploy success. Live: `curl -sI https://spark-online.space/audio/blue-steppe-orbit.mp3` → 200 OK Content-Length=10008775. Preview eval verified BETA badge + ♪ mute indicator both render at (1908, y) alpha=0.55.

**Carry-forward for S19+:**
- Manual playtest verification of audio on live URL (music starts on Begin Match, claves on bond, fart on sever, 'M' mutes, persist across reload)
- P2 NET feel tuning (playtest-gated — was carry-forward from S17 too)
- P3 NET enhancements (client prediction + delta NetSnapshot + host migration + live cursor sync — Standard tier)
- P4 `disruptionManager.ts` extraction (anti-bloat §XV — world.ts 308 → 311 LOC after S18 P1 +3 LOC for BOND_SEVERED emit)
- P5 Phase-2 next mechanic (pick: D Inject Spiral / E Steal / A Fog / G Mega-combos)
- P6 Per-silhouette gradient polish (12 magic silhouettes use colorA primary — Council R1 Grok #4 deferred-PARTIAL)
- P7 Bond-hover cost preview
- P9 (NEW) Audio polish: OGG compression for mobile (Grok#4 DEFERRED), PannerNode + auto-duck (Grok#5), full-screen music-state cue on lobby (idea for design)
- LOCKED §13.14 audio codification (not added this session — can add in S19 closeout if user requests)
- HTTP-80 redirect on spark-online.space still 404 (GH propagation lag observed at S18 close; should auto-resolve in 1-2hr — non-blocking since browsers default HTTPS)

---

## Session 17 — Phase-2 Tier-1 disruption + custom-domain ready-to-ship [COMPLETED] (2026-05-12)

**Triggered by user approval of presented S17 PDR + mid-PDR Scope Amendment #1 BLOCKER report ("I can't join room when playing with friend... it lets you put the code in that my friend generated and then cant click enter"). Standard tier (5 priorities), Council R1 (Grok DISRUPTOR + Gemini AUDITOR) on the Phase-2 work, no Council re-invocation for the Lobby BLOCKER (pre-existing defect in S16 P1 module, no new architectural surface).**

Council R1 outcomes (8 ADOPT / 3 REJECT / 3 PARTIAL): Gemini BLOCKER `placerColor not ownerColor for §X.2 "reveal contributions"` ADOPTED; stroke decomposition (Pixi v8 has no native A→B gradient API) ADOPTED; hostile-if-EITHER-endpoint-placerColor-differs auth rule ADOPTED; §VIII.3 disambiguation (cross-player Sever costs 1 charge; §VIII.4 self-sever free) ADOPTED; save.ts disruptionCharges + buildActions serialization Gemini #2 RESOLVED via A.0 audit (already wired, no schema bump). Grok REJECTED: inter-player bonding bug-not-feature (it IS the §V/§VI.4/§X.2 multi-color mechanism), range-gate on bond pick (no spec authority — fog A is the visibility mechanic), P0 separate-PDR extraction (5 LOC doesn't justify overhead).

PRIME-AUDIT delta caught 5 items Council didn't surface: (A) net protocol intent envelope audit, (B) cycle-bond no-charge-consume, (C) charge dot color = player's color, (D) §VIII.3 amendment precise text, (E) BETA badge text length grew → connectionDot relocation.

**P0' — Lobby Connect bug fix (Scope Amendment #1 BLOCKER, commit `fd016c2`).** Root cause: `src/render/lobbyScreen.ts` set `joinButton.position` / `hostBtn.position` / `codeText.position` using ABSOLUTE canvas coords but they're children of relative-positioned pane Containers — double offset drove Connect button to stage (2090, 940), 170px past CANVAS_WIDTH=1920. S16 P1 tests are pure-helper unit tests (sanitize / validate / map-canvas-to-page) — couldn't catch Pixi Container child-positioning math, so the bug shipped invisible. Fix: 3 absolute-coord position.set calls → pane-relative; extract attemptJoin closure invoked from BOTH joinButton.pointertap AND new inputEl.keydown(Enter) UX fallback; 5 new regression tests via pure-helper exports (getConnectButtonCanvasBounds, getHostButtonCanvasBounds, getHostCodeTextCanvasPos, getHostPaneOrigin, getJoinPaneOrigin) asserting all elements stay in canvas bounds + explicit witness against the buggy x=2090 position. Tests: 307 → 312 (+5).

**P0 — Custom-domain commit prep (Micro, commit `c6f636d` local-only, push GATED).** S16 P2 Scope Amendment #2 carry-forward closed. `vite.config.ts` flips `base: '/the-spark/'` → `'/'`. `public/CNAME` NEW (single line `spark-online.space\n`). Build verified: `dist/index.html` references `/assets/...` (not `/the-spark/assets/...`); `dist/CNAME` contains `spark-online.space`. PUSH GATED on user explicit go after Squarespace DNS (4 A records + www CNAME) + GitHub Settings → Pages → Custom domain = spark-online.space + Enforce HTTPS toggle. LOCKED §13.9 amendment deferred to after-push success.

**P1 — Phase-2 §VIII.3 Sever-as-disruption (Standard, commit `629044a`).** `SEVER_BOND` action gains `{ playerId: PlayerId; cause: 'player' | 'physics' }` discriminator. `cause='player'` routes through 1v1 input gate + hostile-if-EITHER-endpoint-placerColor-differs auth + §VIII.1-2 charge gate (1 charge per destructive hostile sever; cap = MAX_DISRUPTION_CHARGES=2). `cause='physics'` bypass (constraint-solver overstretch isn't a disruption action). PRIME-AUDIT B: cycle-bond sever does NOT consume a charge (severSplit returns empty del per §VIII.4 no-op; bond still removed). Self-sever (both endpoints share actor.placerColor) preserves Phase-1 §VIII.4 zero-cost path. UI: per-player charge dots in `src/render/ui.ts` (drawPlayerCharges helper — 0/1/2 filled player-colored circles next to per-player score readouts; hollow rings when unearned). save.ts audit confirmed disruptionCharges + buildActions already serialized (lines 111-112) — no schema bump needed. Net protocol audit (IntentMsg.action: GameAction) — TS structural typing auto-extends. 16 pre-existing SEVER_BOND dispatch sites migrated (2 production: main.ts physics-cause overstretch, controls.ts player-cause RMB-click; 14 test sites: cause='physics' preserves §VIII.4 topology-focused semantics). 10 new tests covering cross-player consume, 0-charge reject, self-sever free, wrong-turn reject, mixed-ownership auth, cycle-no-consume, charge cap, independent accumulation, save roundtrip, physics-cause bypass. Tests: 312 → 322 (+10). world.ts +18 LOC → 308 (10% over 280 target; S18 carry-forward for disruptionManager.ts extract per Council R1 Grok #8).

**P2 — Phase-2 §VI.4/§X.2 multi-color bond rendering (Standard, commit `91e1e21`).** `BondVisualParams.color: number` → `colorA + colorB`. `drawDefaultLine` decomposes into 4 sub-segments with lerped color when colorA !== colorB (Pixi v8 no native endpoint-gradient stroke API per Council R1 Grok #6 + Gemini #5); single solid stroke fast-path when colorA === colorB (Phase-1 back-compat). 12 magic silhouettes use `colorA` as primary stroke — per-silhouette gradient deferred to S18 polish. `structureRenderer.ts` caller sources from `primitive.placerColor` (immutable per §VI.4 / §X.2 "reveal contributions" per Council R1 Gemini #1 BLOCKER), NOT `ownerColor` (transient, mutates on Phase-2 Steal). Stress-tint (`lerpTint(.., 0xff3030, stress*0.85)`) applied per-endpoint so the bond turns red as it approaches break threshold even when endpoint colors differ. `mixTints` (pre-S17 single-color mid-blend helper) REMOVED — drawBondVisual now consumes per-endpoint colors directly. `lerpColor` pure helper exported (S10 #test-via-pure-helper-export pattern). 8 new tests (lerpColor at t=0/0.5/1, green-cyan channel preservation, same-color back-compat, cross-color 4-segment count, monotonic R/B progression, axis-span boundary). Tests: 322 → 330 (+8). bondVisualRenderer.ts +30 LOC → ~430 (within 500 soft charter).

**P3 — Closeout (this commit).** LOCKED amendments: §13.10 BETA badge text 'BETA' → 'BETA · S17 PHASE-2' + connectionDot relocation to clear longer badge (PRIME-AUDIT E); NEW §13.11 Phase-2 §VIII.3 Sever-as-disruption codification (full auth rule + cycle-no-consume + cause discriminator + charge dots UI + test coverage); NEW §13.12 Phase-2 §VI.4 multi-color bond rendering codification (stroke decomposition + placerColor sourcing + magic-12 deferred); NEW §13.13 §VIII.4 topology preserved notice. §13.9 deferred — primary URL stays `github.io/the-spark/` until P0 user-confirmed push then update to `spark-online.space`. reflexion_log prepended with 5 S17 entries (cap 50 — see file). boot-snapshot regenerated. PDR archived to `.claude/plans-archive/2026-05-12_PDR_Session_17_COMPLETED.md` via git mv. HANDOFF rotated: S16 → `.handoff-archive/HANDOFF_2026-05-12_S16_postS17.md`; new S17 HANDOFF at root.

**Carry-forward for S18+:**
- Custom-domain push if not done in S17 (P0 commit `c6f636d` ready locally)
- disruptionManager.ts extraction from world.ts (anti-bloat §XV; world.ts 308 LOC, 10% over 280 target)
- Per-silhouette gradient upgrade for 12 magic combos (Phase-2 §VI.4 polish — Open Question #7 "rich" version)
- bond-hover cost preview (Council R1 Grok #4 deferred-PARTIAL)
- Phase-2 D (Inject Spiral) — spec-ambiguous propagation, design risk
- Phase-2 E (Steal) — couples with F polish; closes territorial loop
- Phase-2 A (Fog of war) — foundation for visibility-gated raiding (visibility currently full per Council R1 Grok #9 REJECT)
- Phase-2 G (Mega-combos via connector chain) — standalone, no other prereqs
- Audio (Suno didgeridoo trance track upload still pending since S5)
- Cloudflare DNS migration (user preference, optional, post-P0 playtest)

---

## Session 16 — Cross-network playtest blockers (lobby UX + GH Pages deploy) [COMPLETED] (2026-05-12)

**Triggered by user post-S15-playtest review of the lobby screenshot:
2 BLOCKERS surfaced for cross-network 1v1 with friend in different country.
(1) JOIN pane keyboard hack invisible (no caret, no click-to-focus, no
paste) — friend cannot enter the host's code. (2) Dev server is
localhost-only — friend cannot load the page. Standard tier (P2 deploy
drives tier; P0/P1/P3 Micro; P4 closeout).**

User approval: "let run top priority batch so that me and my friend can
play it by the end of the day, and remember we need to add 'beta' to the
game page somewhere in the top of the screen" — triggered Scope Amendment
#1 (BETA badge added to P3; P3 promoted from optional → mandatory). User
clarified Cloudflare DNS migration is acceptable but stayed on Squarespace
DNS for today's playtest speed (Scope Amendment #2 deferred Step 2 swap
to S17 ready-to-ship).

Council R1 (Standard tier, council-of-models): Grok REVISE + Gemini
REVISE/HIGH. 8 ADOPTED / 6 REJECTED / 1 MITIGATION. Key adopt: switched
P2 deploy action from peaceiris/actions-gh-pages@v3 → GitHub-official
actions/upload-pages-artifact@v3 + actions/deploy-pages@v4. Adopted P1
a11y attrs (aria-label, autocomplete, autocapitalize, inputmode,
spellcheck) + Pixi z-index guard (1000) + mobile-keyboard visualViewport
handler. Adopted NEW P2 Step 1.5 favicon/robots/OG meta. Rejected
Cloudflare Pages alternative, Stryker mutation testing, Sentry/analytics/
Lighthouse/privacy, peer-bound dispatch optimization, Pixi/Vite version
bumps. CSP/Trystero risk mitigated by knowledge (GH Pages has no default
CSP; WebRTC bypasses connect-src via RTCPeerConnection).

PRIME-AUDIT delta caught 6 items Council rubber-stamped: deploy-pages@v4
requires permissions/environment/concurrency blocks (added); requires
Pages Source = "GitHub Actions" (different user-step from peaceiris,
documented + enabled via gh API); favicon.svg needs concrete SVG content
(shipped 32x32 concentric crimson + cyan circles); trystero ^0.20→^0.24
API stability refuted by 291/291 green tests; CNAME byte-format safety
note (LF-only); OG image deferred to S17+ no designed share asset.

**P0 — Charter extraction (Micro, commit `b2979fc`).** Mechanical move of
4 dispatch handler bodies (START_GAME, END_TURN, RETURN_TO_TITLE,
UPDATE_AVATAR_POS) + addScore helper from `src/state/world.ts` (357 LOC)
to new `src/state/gameMode.ts` (169 LOC w/ JSDoc). world.ts switch
delegates to imported `applyStartGame` etc. addScore re-exported from
world.ts for back-compat with placePrimitive.ts + session15.test.ts
(zero-touch on those files). world.ts: 357 → 290 LOC (target 280, 3.5%
over — accepted per S15 trip-wire reflexion). requirePlayer stays
(pre-existing, used by placePrimitive.ts). 291/291 green; typecheck
exit 0. Same Micro pattern as S14 P2.0 (placePrimitive extract) and
S15 P1 (redundantBondTargets extract).

**P1 — Lobby JOIN HTML <input> overlay (Micro BLOCKER, commit `5ff7865`).**
Replaced Pixi-text + window.keydown buffer hack in
`src/render/lobbyScreen.ts` (lines 92-103 invisible joinInputText +
joinInputBg; lines 227-243 installKeyHandler) with real
`<input type="text">` positioned via `canvas.getBoundingClientRect()`
over the JOIN pane code area. 11 attrs verified live in browser: type,
maxLength=6, pattern=`[2-9A-HJ-NP-Z]{6}`, placeholder, autocomplete=off,
spellcheck=false, autocapitalize=characters, inputmode=text,
aria-label="Room code", position=fixed, zIndex=1000, textTransform=
uppercase. visualViewport.resize handler (feature-checked, mobile-
keyboard guard). Pure helpers extracted (S10 #test-via-pure-helper-
export pattern): sanitizeRoomCodeValue, isValidRoomCode,
mapCanvasRectToPage, JOIN_INPUT_RECT. Connect button now reads
inputEl.value + visual alpha gate (0.4 disabled, 1.0 enabled).
PRIME-AUDIT init-order bugfix: inputEl creation moved to start of
constructor BEFORE setVisible(false) call (caught via preview
console boot-failure log). Click anywhere on JOIN pane focuses input.
Hint text below: "Click here, type the code from your friend." Drops
joinBuffer + installKeyHandler + uninstallKeyHandler entirely.
16 new tests in `src/render/lobbyScreen.test.ts` (293→307 total).

**P2 — GitHub Pages deploy (Standard BLOCKER, commits `4011862`
+ `9d9d9ee` enabling).** Step 1 + 1.5 SHIPPED:
- `vite.config.ts` base='/the-spark/' for project-page deploy
- `.github/workflows/deploy.yml` using GitHub-official
  actions/upload-pages-artifact@v3 + actions/deploy-pages@v4 (Council R1
  switch from peaceiris@v3; PRIME-AUDIT-required permissions/environment/
  concurrency blocks all included)
- `public/favicon.svg` (32x32 concentric crimson + cyan circles)
- `public/robots.txt` (Allow: /)
- `index.html` OG meta tags (og:title/og:description/og:type) + favicon
  link

LIVE at **https://daneshto-dotcom.github.io/the-spark/** (HTTP 200, HSTS
enforced, no CSP per Council Grok #5 analysis). GH Actions run
25732727978 deployed in 1m4s. PRIME-AUDIT #2 user-step ("Settings →
Pages → Source = GitHub Actions") satisfied via `gh api -X POST
/repos/.../pages -f build_type=workflow` after first deploy 25732612027
failed with "Pages not enabled" error.

Step 2 (spark-online.space swap) DEFERRED to S17 ready-to-ship commit
per Scope Amendment #2: same-session push would deploy assets at
`/assets/` not `/the-spark/assets/`, breaking github.io fallback URL
until user toggles Custom Domain in Pages Settings (async step). User
flow for S17 swap: (a) Squarespace DNS Custom Records add 4 A records
(Host=`@`, values=185.199.108-111.153) + CNAME `www`→
`daneshto-dotcom.github.io.`, (b) `dig +short spark-online.space @8.8.8.8`
confirms resolution, (c) Settings → Pages → Custom domain =
spark-online.space → Enforce HTTPS, (d) push ready-to-ship 3-line commit
(vite.config base='/' + public/CNAME=spark-online.space).

**P3 — Visual polish (Micro mandatory per Amendment #1, commit `9d9d9ee`).**
P3.a BETA badge: persistent Pixi Text "BETA" added directly to app.stage
(NOT inside any TitleScreen/LobbyScreen/HUD container) so visible across
all gameState values. monospace 14px, cyan PLAYER_COLORS[1]=0x3bd7ff,
letterSpacing=4, alpha=0.55, anchor.set(1,0) top-right at (CANVAS_WIDTH-12,
12). P3.b: spawnerRing + legend now captured as variables (previously
inlined without ref); game-loop visibility update toggles them off when
gameState ∈ {TITLE, LOBBY}. Eliminates spawner-ring artifact bleeding
through lobby panes from S15 screenshot.

**P4 — Closeout (this commit).**
- LOCKED §13.1 trystero version drift fix (^0.20 → ^0.24.0)
- LOCKED §13.9 NEW: deployment row (primary URL spark-online.space S17+,
  fallback github.io/the-spark/ shipped, GH Pages deploy pipeline spec,
  one-time Source=GitHub Actions step, no default CSP, HSTS, OG meta)
- LOCKED §13.10 NEW: persistent BETA badge row
- LOCKED §7 module-map: added `src/state/gameMode.ts`,
  `src/state/placePrimitive.ts` (already extracted, was missing from doc),
  `public/` block with favicon.svg + robots.txt
- BACKLOG S16 entry (this entry) above S15
- reflexion_log.md S16 entries (5 new, pruned to ≤50)
- boot-snapshot.md regenerate
- PDR archive: `.claude/plans/2026-05-12_PDR_Session_16.md` →
  `.claude/plans-archive/2026-05-12_PDR_Session_16_COMPLETED.md`
- HANDOFF rotate: S15 → `.handoff-archive/HANDOFF_2026-05-12_S15_postS16.md`;
  new S16 HANDOFF at root with S17 next-steps + Step 2 ready-to-ship spec

**S17 carry-forward** (queued ready-to-ship):
- **Step 2 (spark-online.space swap):** 3-line commit user pushes after
  DNS + Custom Domain toggle. Vite config base='/' + public/CNAME.
- **Cloudflare DNS migration option:** user-preference, nameserver swap
  to ada.ns.cloudflare.com + cole.ns.cloudflare.com (or similar);
  re-add 4 A records + www CNAME in CF UI. 24-48h propagation.
- **Cross-network playtest:** verify Trystero/Nostr WebRTC handshake +
  AttractDrag feel + NetSnapshot tick over real internet hop. May
  inform: client prediction (Grok R1 carry), delta NetSnapshot (Council
  R1 nice-to-have), host-migration stub (Grok R2 carry), live cursor sync.
- **POST-playtest tune:** NET_SNAPSHOT_HZ + NET_INTERPOLATION_MS feel
  constants.

**Known v1 limits unchanged** (LOCKED §13.7): AttractDrag client latency,
no host-migration, tab-hidden host pause, pre-S15 save format break,
no reconnect.

**Phase-2 Tier-1+ deferred** (docs/phase-2-design-options.md):
recommended C (Sever-as-disruption) + F (Multi-color rendering).

**Audio: Suno track upload still pending since S5.**

---

## Session 15 — S14 Charter Extraction + Phase-2 1v1 Networked Play [COMPLETED] (2026-05-12)

**Triggered by user request "present top recommended priority session batch
following full pipeline flow." Standard tier escalated to Full tier mid-session
on user amendment 2 ("not same machine hotseat because my friend is in a
different country") which authorized breaking LOCKED § 1 Phase-2/3 boundary
for Phase-2 networked play.**

User amended scope twice in-session:
1. Original PDR proposed Tier-0 Hotseat + Fog of war (~450 LOC). Council R1
   returned REVISE/REVISE.
2. User playtest of S14 build: "looks a lot better, well done! no need for fog
   of war yet. lets just work on making another player." Hotseat → re-Council
   carry-forward, scope reduced to lobby + hotseat (~330 LOC).
3. User cross-country amendment: "not same machine hotseat because my friend
   is in a different country, so lets make it a lobby host or something."
   Council R1+R2 deliberation (Trystero vs PeerJS resolved by R2 convergence
   on Trystero/Nostr; host-migration deferred to S16 via Gemini's "Connection
   lost" overlay v1). PRIME-AUDIT applied 6 leak-throughs.

User approval gate: "approved! be most technical, pedantic, logical and
thorough!"

**P1 — Charter extraction (Micro, commit `b9c4b20`).** Mechanical extraction
of `pickRedundantBondTargets` + `angularDistance` from controls.ts
(:449-534 pre-S15) to new `src/input/redundantBondTargets.ts`. Zero behavior
change. controls.ts 565 → 479 LOC (under § XV soft charter; closes S14
PRIME-AUDIT carry-forward documented in HANDOFF). redundantBondTargets.ts
at 102 LOC. 252/252 regression preserved. Same Micro pattern as S14 P2.0
(world.ts → placePrimitive.ts).

**P2 — Networked 1v1 MVP (Full tier core, commit `add497f`).** Six new
files + 8 modified + Trystero ^0.20 dep (+~40KB bundle):
- `src/net/transport.ts` (103 LOC): NetTransport wrapping `trystero/nostr`
  joinRoom; Nostr-primary signaling per PRIME-AUDIT #1 (BitTorrent default
  rejected via Grok R1 rate-limit concern); auto-fallback multi-strategy.
- `src/net/protocol.ts` (83 LOC): typed discriminated-union envelopes
  Hello/Intent/NETSNAPSHOT/EndGame; generateRoomCode (32-char no-confusion
  alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`) + parseRoomCode.
- `src/net/sync.ts` (146 LOC): HostSync emits snapshotSeq-numbered NetSnapshot
  every NET_SNAPSHOT_HZ=10 (every 6 physics ticks); ClientSync.receive
  validates seq>lastSeq (out-of-order rejected); interpolateInto lerps
  primitive + freeSpark positions between prev + current over
  NET_INTERPOLATION_MS=100 (linear lerp Council R2 + needsFullApply flag
  PRIME-AUDIT perf avoids per-render Map rebuild).
- `src/net/lerp.ts` (15 LOC): lerp01 clamp utility.
- `src/render/titleScreen.ts` (144 LOC): "SPARK" title + "1 Player" / "1v1
  (2 Player)" buttons.
- `src/render/lobbyScreen.ts` (289 LOC): host pane (generates code +
  "Waiting for Player 2" → "Begin Match") / join pane (text input + Connect)
  / "Connection lost" full-screen overlay / Back to Title.

Schema additions:
- `Player` interface gains `avatarPos: Vec2` (Council R1 Grok BLOCKER #2
  carry-forward).
- `World` gains `gameMode: 'solo' | '1v1'`, `currentPlayerId: PlayerId`,
  `scoreByPlayer: Map<PlayerId, number>`, `isHost: boolean`. GameState
  union extended with `'TITLE' | 'LOBBY'`. New actions: `START_GAME`,
  `END_TURN`, `RETURN_TO_TITLE`, `UPDATE_AVATAR_POS`.
- `PICKUP_SPARK`, `DROP_SPARK`, `PLACE_PRIMITIVE` silently reject when
  `gameMode === '1v1' && action.playerId !== currentPlayerId` (Gemini R1
  BLOCKER input sanitization).
- `addScore(world, playerId, delta)` helper: solo additive (preserves test
  contract — gameState.test.ts L51, session10/session13 SCORE_TIER tests
  directly mutate scoreProgress); 1v1 per-player + scoreProgress =
  max(scoreByPlayer.values()) for WIN gate.
- `WorldSnapshot` extended (additive, optional fields for pre-S15 compat):
  gameMode, currentPlayerId, scoreByPlayer, avatarPos. New exports
  `netSnapshot()` (NetSnapshot = WorldSnapshot - {savedAt, rngSeed,
  nextPrimitiveId, nextBondId} per Council R2 retain-list) +
  `applyNetSnapshot()`.

Input layer:
- `controls.ts` dispatcher injection via `ControlsDispatchFn`; default
  `makeLocalDispatcher` preserves back-compat. Solo / host: local dispatch.
  Client: net-routed via ClientSync.wrapIntent + NetTransport.send.
  Space key handler: END_TURN in 1v1 PLAYING; auto-release on AttractDrag
  (drop to Idle) or ConnectDrag (DROP_SPARK at cursor) per PRIME-AUDIT #4.
  `setPlayerId(1)` for client joiner.

Entry + render pipeline:
- `main.ts`: boots gameState='TITLE'; TitleScreen + LobbyScreen lifecycle
  via callbacks (onHostStart generates code + on(INTENT)→dispatch;
  onJoinAttempt setPlayerId(1) + on(NETSNAPSHOT)→clientSync.receive;
  onBeginMatch dispatches START_GAME(1v1)). Snapshot emission gated on
  host PLAYING every SNAPSHOT_INTERVAL_TICKS=6. Client physics skipped
  (host authoritative); client interpolation runs every render frame.
  Connection-lost overlay shows when 1v1 PLAYING + peerCount=0.
- `ui.ts` (HUD): turn indicator badge (active player color + "SPACE to
  end"), per-player score readouts (RED / BLUE vs 50), connection status
  dot (green=connected, red=disconnected). Energy gauge tracks
  currentPlayerId. WIN banner uses winner's player color.

Spec amendments (LOCKED_DECISIONS.md, P3 closeout):
- § 1 row split: Phase-2 net (Trystero ^0.20) + Phase-3 net (Colyseus
  reserved for scalability).
- § 7 module map: src/net/ block added; gameState FSM TITLE→...→TITLE.
- § 10.2: dispatcher injection note + input-sanitization gate.
- § 10.4: NetSnapshot wire variant note.
- NEW § 13: Phase-2 Networked Play v1 (8 subsections — transport,
  authority, sync, lobby, FSM, per-player scoring, known v1 limits,
  constants).

Council R1+R2 deliberation (Full tier mandatory):
- Grok DISRUPTOR (grok-4.20-0309-reasoning): R1 PeerJS-better; R2
  CONCEDED Trystero (multi-strategy Nostr fallback negates rate-limit
  concern). R2 host-migration mandatory-stub deferred to S16.
- Gemini AUDITOR (gemini-2.5-pro): R1 Trystero better (zero-infra);
  R1 ADOPT-LIST entity-interpolation (lerp), batch SPLIT, formal § 1
  amendment text, NetSnapshot audit. R2 host-migration "Connection
  lost" overlay v1 (adopted).
- PRIME-AUDIT delta (6 catches): Trystero/Nostr explicit import (not
  default BitTorrent); per-direction seq numbers; npm install scope;
  net/ in module-map; AttractDrag latency known-limit doc;
  scoreProgress reset on RETURN_TO_TITLE.

**P3 — Closeout (this commit).** Per-priority commits + push (P1
`b9c4b20`, P2 `add497f`, P3 closeout). session-state per priority
(status, check_completed, check_method verbose per
INTEGRITY-WARNING PROTOCOL, checkpoint_commit). reflexion +5 S15 /
prune 5 S7 to maintain ≤50 cap. boot-snapshot regen. PDR archived to
`.claude/plans-archive/2026-05-12_PDR_Session_15_COMPLETED.md` (full
Battle Ledger R1+R2 + PRIME-AUDIT delta + adopt-list). HANDOFF_2026-05-12
replaced (S14 version archived to `.handoff-archive/HANDOFF_2026-05-12_S14_postS15.md`).
BACKLOG.md S15 entry inserted above S14. LOCKED_DECISIONS amendments
applied per Council adopt-list.

Verification:
- `npx tsc -b --noEmit` exit 0
- `npx vitest run` → 291/291 (252 prior + 39 new across protocol.test
  9, sync.test 16, session15.test 14)
- LOC delta: +~490 added; -120 moved (P1 extract); +~80 doc/comments
- world.ts at 357 LOC over the 280 trip-wire — S16 carry-forward
  (extract dispatch handlers + addScore to gameMode.ts, ~80 LOC moved)
- transport+protocol+sync+lerp = 347 LOC (over the 160 combined
  trip-wire; bandwidth from adding lerp utility + room-code parsing;
  not split — feature-coherent module)

S16 carry-forward block:
- CHARTER (S15 P2 PRIME-AUDIT): world.ts → gameMode.ts extraction
  (~80 LOC moved; brings world.ts to ~280; same Micro pattern as
  S14 P2.0 / S15 P1).
- PLAYTEST-GATED: NET_SNAPSHOT_HZ + NET_INTERPOLATION_MS feel tuning;
  S14 carry-overs (AVATAR_PULSE_*, REDUNDANT_BOND_*); S13 carry-overs
  (cinematics constants).
- NET ENHANCEMENT: client-side AttractDrag prediction + reconciliation
  buffer (~150 LOC, Grok R1 ask); delta-encoded NetSnapshot for
  bandwidth (Council R1 nice-to-have); host-migration stub if playtest
  shows transient-drop annoyance (Grok R2 ask); live cursor-move sync
  for remote avatar (~50 LOC).
- ASSET-GATED: Audio (Suno track upload pending since S5).
- PHASE-2 TIER-1+: Sever-as-disruption / Inject Spiral / Steal /
  Multi-color rendering / Mega-combos per `docs/phase-2-design-options.md`.

---

## Session 14 — Avatar Disambiguation + Multi-Endpoint Redundant Bonding [COMPLETED] (2026-05-12)

**Triggered by post-S13 playtest user report (same session day, follow-up batch).**
Two distinct findings: (a) the "highlighted cruiser" on the left that "is stuck
and is not the main cruiser" — diagnosed as a placed Dot primitive in player
color (0xff3b6b crimson) which visually collides with the avatar (also a
crimson dot at the cursor); (b) "if I put a new shape near existing structure
and end points, it only connects to the nearest endpoint. however it needs to
connect to all nearest endpoints… building backup lines so that your structure
doesn't get deleted from raiding." Standard-tier batch, Council R1 ON, user
pre-approved "top priority recommended batch following full pipeline flow."

**P1 — Avatar disambiguation (Micro, commit `0ccb3fe`).** Anti-phase outer/inner
alpha pulse via `performance.now()` so the avatar visibly "breathes" relative
to a static Dot primitive in the same color. Constants: `AVATAR_PULSE_HZ=1.2`
(sub-heartbeat, well under PEAT's 3 Hz threshold), `AVATAR_PULSE_DEPTH=0.20`
(±20% outer, ±10% anti-phase inner). Pure `computeAvatarAlphas(t, baseOuter,
baseInner, hz, depth)` exported for unit-testability (S10
#test-via-pure-helper-export pattern). 7 unit tests covering t=0 base,
quarter-period (+1), three-quarter-period (-1 with inner clamp), wide-t
boundedness, extreme-depth clamp on both outer and inner, period closure.
Council R1: Grok #6 chevron alternative REJECTED — chevron only fires under
motion; user complaint was about indistinguishability at rest.

**P2.0 — Mechanical extraction `placePrimitive → src/state/placePrimitive.ts`
(Micro, commit `9bb784e`).** Zero behavior change. world.ts drops 587→228 LOC
(closes S13 PRIME-AUDIT carry-forward; now under 500-LOC § XV soft charter).
placePrimitive.ts at 382 LOC pre-P2.1 (also within charter; sized to absorb
P2.1's ~80 LOC). Moved verbatim: 304-LOC placePrimitive function + 17-LOC
makeBond helper. `PlacePrimitiveAction` type defined + exported in
placePrimitive.ts; world.ts composes GameAction with it (JSON shape
unchanged — Phase 3 dispatchOverNetwork seam intact). `requirePlayer()`
promoted to export in world.ts (shared throw-on-missing semantics). Council
R1: Grok #7 + Gemini § 7.1 both independently flagged "refactor first,
feature second" (adopted — my original PDR said "safer post-feature," Council
inverted it).

**P2.1 — Multi-endpoint redundant bonding (Standard core, commit `ab40447`).**
New placements with a primary target create up to `REDUNDANT_BOND_K=3` total
bonds into the primary's connected component, subject to ≥25° angular spread
filter (5π/36 rad). Redundancy bonds emit `BOND_COMMIT` but DO NOT contribute
to `scoreProgress` (Council G5/G8 ADOPTED — keeps `PHASE_1_WIN_SCORE=50`,
frames redundancy as defense not score-velocity). Algorithm: distance-sorted
greedy angular-spread picker, capped at `REDUNDANT_BOND_MAX_CANDIDATES=16` for
O(N) cost bound. New `pickRedundantBondTargets()` exported pure function;
`angularDistance()` wrapped-arc helper also exported. `PlacePrimitiveAction`
gains optional `extraBondTargetIds`; placePrimitive.ts validates each in DEV
(self-id / primary-id / duplicate / missing / not-in-component all skipped
with console.error) and skips silently in production. 29 new tests across 5
groups: (A) pickRedundantBondTargets pure-function 10 cases including K=0/1
boundary, no in-range cand, K=3 well-spread vs sparse, AUTO_BOND_RADIUS=59-
in/61-out boundary, colinear-degeneracy, MAX_CANDIDATES=17→16 truncation;
(B) angularDistance 5 cases (zero, π/2, π, wrap, modulo); (C) end-to-end
placePrimitive 6 cases including scoreProgress no-contribution for redundancy
+ magic-primary correctness; (D) severSplit interaction 2 cases — cycle
preserves on redundancy sever (the entire point) + non-cycle chain still
amputates; (E) DEV invariant validation 5 cases.

Council R1 disposition (Battle Ledger in archived PDR):
  Grok REVISE — 8 challenges + ports alternative.
    Adopted: G3 (25° spread vs 30°), G4 strain-cascade test, G5/G8 no-score,
    G7 extract-first (shipped as P2.0).
    Rejected: G1 "all-within-radius" literal (defeats raid-resistance via
    colinear redundancy), G2 per-type maxDegree (Phase-2 candidate), G6
    avatar chevron (wrong for static-cursor case), GA ports (Phase 2).
  Gemini REVISE — 6 invariant stresses + 8 edge cases + perf audit.
    All applicable concerns adopted. Test count grew 11 → 29.

**P3 — Closeout.** Per-priority commit + push (S9 rule). BACKLOG S14 entry +
session map update. reflexion log: +5 S14 entries (#council-led-restructuring-
as-prerequisite, #no-score-for-redundancy-clean-frame, #pure-function-
extraction-for-class-method-testability, #verify-council-claim-with-source-
not-narrative, SESSION #prime-audit-as-revision-gate-not-decoration) - prune
to stay ≤50 cap. boot-snapshot regenerated. PDR archived to
`.claude/plans-archive/2026-05-12_PDR_Session_14_COMPLETED.md` with Battle
Ledger + Council adoption tables + PRIME-AUDIT delta. HANDOFF_2026-05-12.md
replaced (S13 root archived to `.handoff-archive/HANDOFF_2026-05-12_S13_postS14.md`).

**Exit gate:** 252/252 tests passing (was 216 from S13, +36 new: 7 avatar +
29 session14). Typecheck clean (`npx tsc -b --noEmit` exit 0). 3 priority
commits (`0ccb3fe` P1, `9bb784e` P2.0, `ab40447` P2.1) + this closeout commit
on master, all pushed.

**Carry-forward to S15+:**
- PLAYTEST-GATED (highest priority for S15): user playtests the post-S14
  build. Verify: (a) avatar visibly distinct from placed Dot primitives
  (pulse at 1.2 Hz reads as "alive"); (b) placing near multiple endpoints
  creates up to 3 bonds visibly (triangulated cell, not single edge);
  (c) raids on triangle-redundancy cell can't amputate via single sever;
  (d) no spurious physics breaks from STRUCTURE_GROW + multi-bond
  triangulation under typical play.
- TUNE if needed: `REDUNDANT_BOND_K` (default 3 — drop to 2 if "too rigid"
  or back to 1 for pre-S14 behavior); `REDUNDANT_BOND_MIN_ANGLE_RAD`
  (default 25°); `AVATAR_PULSE_HZ` (default 1.2 — drop to 0.6 if "too
  anxious"); `AVATAR_PULSE_DEPTH` (default 0.20).
- CHARTER (S14 PRIME-AUDIT): `controls.ts` grew 436 → 565 LOC (+129 from
  pure-function extraction). 13% over § XV charter. Recommended S15 fix:
  extract `pickRedundantBondTargets` + `angularDistance` to
  `src/input/redundantBondTargets.ts`. ~120 LOC moved; brings controls.ts
  back to ~445 LOC. Not blocking; charter is soft.
- ASSET-GATED (still): Audio integration (Suno track pending).
- PHASE-2-GATED (still): Phase 2 implementation per
  `docs/phase-2-design-options.md` user pick (recommended Tier-0 first
  = B.2 Hotseat + A Fog, ~450 LOC).

---

## Session 13 — Playtest Feedback Batch [COMPLETED] (2026-05-12)

**Triggered by post-S12 user playtest.** User reported one bug (merge
inconsistency: placing in the middle of three close-but-separate
structures only merges with one) + three cinematics-visibility gaps:
STRUCTURE_GROW visual flash great but "doesn't actually grow
physically," MERGE_IMPULSE 1.2 px "can't see any difference,"
SCORE_TIER corner pulse "not sure." Standard-tier batch, Council R1 ON
per user "thoroughly… creative technical, coherent" approval. 4 work
priorities + closeout.

**P1+P3 — Merge reach fix + MERGE_IMPULSE tuning (Standard, Council-
revised, commit `8e58cd2`).** Council R1 ran in parallel (Grok DISRUPTOR
+ Gemini AUDITOR both REVISE). Adopted Gemini #1 (short-bond clamp),
Gemini #2 (explicit nearest-pick map), Gemini #3 (cross-ref comments);
rejected Grok #1 (spatial-index claim — verified `spatial.ts` indexes
Sparks only), Grok #3 (constraint amplification — verified `bonds.ts`
strictly dissipative), Grok #4 (off-center dedup — independent
components dedup-safe). Battle Ledger + PRIME-AUDIT in archived PDR.

Code changes: new `MERGE_REACH_RADIUS=100` in constants.ts (separate from
controls.ts-local `AUTO_BOND_RADIUS=60` which stays for primary picking);
controls.ts:onUp passes wider candidate set to placePrimitive; world.ts
merge sweep refactored to two-phase `Map<componentRoot, {cand, distSq,
comp}>` — Phase 1 groups candidates by component picking nearest-to-new-
prim, Phase 2 iterates one merge bond per chosen-nearest cand. Replaces
S9's implicit "first-iterated cand wins." `MERGE_IMPULSE_MAGNITUDE`
1.2→3.0 px (5% strain on 60-px bond, 5× headroom; compression-only since
bonds break on extension per `physics/bonds.ts:58`). New
`MIN_BOND_LENGTH_FOR_IMPULSE=25`: short-bond scale `min(1, rest_length /
MIN)` prevents impulse-teleport-through-new-prim on tight placements.

**P2 — STRUCTURE_GROW outward verlet impulse (Micro, Council-revised,
commit `72caa22`).** Adopted Grok #2's centroid-outward revision (was:
origin-outward, which reads as "recoil from new prim" not "grow"). After
existing STRUCTURE_GROW visual emit (cinematicsEnabled-gated), iterate
primary's pre-existing component primitives (snapshotted from
`componentOf(target).primitiveIds` minus new prim) and apply `prevPos
-= unit(centroid → p) × STRUCTURE_GROW_IMPULSE=0.8`. Centroid = post-bond
component (pre-existing + new prim) so 2-prim structures produce non-zero
outward direction. Bonds resist; net effect = brief outward "puff." Cand
components excluded (they get inward MERGE_IMPULSE instead): visual
signature split on a cross-structure merge is "existing puffs OUT,
absorbed snaps IN." Gated on cinematicsEnabled (paired with the visual
emit) unlike MERGE_IMPULSE's S10 unconditional pattern — single mental
model for the C-keybind toggle.

**P4 — SCORE_TIER center pulse at placement (Standard, Council-revised,
commit `8b5ad3e`).** Adopted Grok #5 partial (single pulse, not dual).
SCORE_TIER effect gains required `pos: Vec2` field; emit-site in world.ts
captures `prim.pos` so the renderer draws AT the new primitive on tier
crossing. Corner-pulse code removed from `scoreTier.ts` entirely. HUD
progress bar still fills continuously as running indicator. Renderer
scale-up: bloom 28→60 (start) / 56→100 (end); ring 18→40 (start) / 68→100
(end); stroke width 2→3; duration 30→48 ticks (~500ms → ~800ms) for
longer foveal-attention coverage. 3 effectsRenderer.test.ts SCORE_TIER
fixtures updated for required pos field.

**P5 — Closeout.** Per-priority commit + push (S9 rule). BACKLOG S13
entry + session map (S13 DONE → S14+ Phase 2 implementation). Reflexion
log: prepend 5 S13 entries + prune oldest S5 detail entries to maintain
≤50 cap. Boot-snapshot regenerated with S13 commit list + post-S13 state
+ § XV charter PRIME-AUDIT carry-forward note. PDR archived to
`.claude/plans-archive/2026-05-12_PDR_Session_13_COMPLETED.md` with
post-execution Battle Ledger + Council adoption table + PRIME-AUDIT
delta. HANDOFF_2026-05-12.md written at root; S12 root archived to
`.handoff-archive/HANDOFF_2026-05-11_S12_postS13.md`.

**Exit gate:** 216/216 tests passing (was 201; +15 new across P1/P2/P3/
P4: 3-structure merge @ 90 px, nearest-pick per component, separate-
components, MERGE_IMPULSE=3.0 verification, short-bond clamp formula,
sentinel constants, STRUCTURE_GROW outward direction validation on 2-
prim and 3-prim chain primaries, cinematicsEnabled gate, cand-component
exclusion, SCORE_TIER.pos co-location, multi-tier crossing pos-tagging).
Typecheck clean (`npx tsc -b --noEmit` exit 0). 3 priority commits
(`8e58cd2` P1+P3, `72caa22` P2, `8b5ad3e` P4) + this closeout commit on
master, all pushed to origin.

**PRIME-AUDIT carry-forward:** `world.ts` grew from 481 LOC (S12 close)
to 587 LOC across S13's three additions in placePrimitive — 17% over the
§ XV 500-LOC soft charter. Recommended S14 fix: extract `placePrimitive`
into its own file (`src/state/placePrimitive.ts`, similar pattern to
S12's per-kind effect-renderer split). Leaves world.ts at ~340 LOC.
Not blocking S14 playtest — charter is soft, breach is 17% (vs S12's
14% before refactor), and the additions are cohesive single-function
growth, not architectural drift.

**Carry-forward to S14+:**
- PLAYTEST-GATED: cinematics constants tuning (ATTRACT_FOLLOW_RATE,
  STRUCTURE_GROW_HOP_TICKS, STRUCTURE_FLASH_TICKS, MERGE_IMPULSE_MAGNITUDE
  at new 3.0, SCORE_TIER_STEP, **NEW** STRUCTURE_GROW_IMPULSE,
  **NEW** MERGE_REACH_RADIUS) + S5-S9 carry-overs (AUTO_BOND_RADIUS,
  MAX_RELEASE_REACH, PHASE_1_WIN_SCORE, strain thresholds). User
  re-playtests post-S13 build to validate the 4 fixes feel right.
- ASSET-GATED (still): Audio integration (Suno track pending).
- PHASE-2-GATED (still): Phase 2 implementation per
  `docs/phase-2-design-options.md` user pick (recommended Tier-0 first =
  B.2 Hotseat + A Fog, ~450 LOC).
- CHARTER (S13 PRIME-AUDIT): `world.ts` placePrimitive extraction
  refactor — small S14 priority if user agrees, else carry to S15+.

---

## Session 12 — effectsRenderer Per-Kind Split [COMPLETED] (2026-05-11)

**Triggered by S11 PRIME-AUDIT carry-forward.** `effectsRenderer.ts` at 569 LOC
breached the § XV soft charter (500-LOC cap); Phase 2 will add more effect
kinds, so refactoring along the per-kind axis NOW prevents the monolith from
growing worse. All three S11-eligible backlog items (cinematics tuning /
audio / Phase 2 implementation) remained user-gated; the renderer refactor
was the only un-gated path. Standard tier, Council R1 ON.

**P1 — Process drift cleanup (Micro).** Pushed `ca6f10c [state-autocommit] S11`
plus a fresh `fc982af` autocommit (state-hook fired again during push) to
`origin/master` (e565d60..fc982af). Working tree tracking clean. No source change.

**P2 — effectsRenderer per-kind split (Standard, Council-revised).** Council
R1 ran in parallel (Grok DISRUPTOR returned VETO with 5 challenges; Gemini
AUDITOR returned REVISE with Q:2/E:4/T:2/C:3 + 3 concerns); synthesized
adoption was 6 of 7 challenges. Rejected #1 (defer to post-Phase 2) on
charter authority — § XV breach is current; per-kind seam is the additive
axis itself. Dead-silhouette audit ran FIRST per Grok #2 (grep combos.ts
visualEffectId vs 13 drawBondCommit cases) — yielded **zero deletions**;
all 12 magic IDs + fx.bond.default actively emitted. 7 new files written
under `src/render/effects/` (lifetime, silhouettes, bondCommit, severErase,
structureGrow, structureMerge, scoreTier) + parent rewrite (569→116 LOC,
class only) + new smoke test (`effectsRenderer.test.ts`, 22 tests covering
lifetime + all 5 per-kind drawers + all 12 magic silhouettes + class
lifecycle). SEVER_ERASE drawer newly extracted from inline parent body
for shape consistency with the other 4 kinds. Risks #4 (Graphics ownership)
+ #5 (world.tick state) — Gemini-flagged — resolved by design: parent owns
Graphics + clears once per sync, drawers receive `(g, effect, age:number)`
as pure-fn params, never read `world.tick` directly. § XV LOC compliance
restored — largest file `silhouettes.ts` at 243 LOC, parent at 116 LOC.
Tests: 201/201 (179 prior + 22 new). Typecheck clean. Battle Ledger
appended to PDR.

**P3 — Closeout.** Per-priority commit + push (S9 rule). BACKLOG S12 entry
+ session map update. Reflexion log: prepend 4 S12 entries + prune 4 oldest
S5/S6 detail entries (50-cap maintained). Boot-snapshot regenerated. PDR
moved to `.claude/plans-archive/2026-05-11_PDR_Session_12_COMPLETED.md`
with post-execution Battle Ledger + PRIME-AUDIT delta. HANDOFF root
replaced (S11 root → `.handoff-archive/`).

**Exit gate:** 201/201 tests, typecheck clean, no file > 500 LOC,
EffectsRenderer public surface unchanged (main.ts imports intact),
2 priority commits (`fc982af` push + `80f52e8` refactor) + closeout
commit on master, all pushed.

**Carry-forward to S13+:**
- PLAYTEST-GATED (still): cinematics constants tuning (ATTRACT_FOLLOW_RATE,
  STRUCTURE_GROW_HOP_TICKS, STRUCTURE_FLASH_TICKS, MERGE_IMPULSE_MAGNITUDE,
  SCORE_TIER_STEP) + carry-overs (AUTO_BOND_RADIUS, MAX_RELEASE_REACH,
  PHASE_1_WIN_SCORE, strain thresholds).
- ASSET-GATED (still): Audio integration (Suno track pending).
- PHASE-2-GATED (still): Phase 2 implementation per
  `docs/phase-2-design-options.md` user pick. Refactored renderer is
  Phase-2-ready — new effect kinds (e.g., STEAL_FLASH, SPIRAL_INFECT,
  VISION_REVEAL) plug in as new files in `src/render/effects/` in the
  same shape as the 5 current kinds.

---

## Session 11 — Buffer: Drift Cleanup + Phase 2 Design Matrix [COMPLETED] (2026-05-11)

**Triggered by S10 handoff carry-forward.** All three S11-eligible backlog items
(cinematics tuning / audio / Phase 2 implementation) are user-gated. Only un-gated
high-leverage work is design-doc prep for the Phase 2 conversation when user signs
off Phase 1. Standard-tier batch, Council R1 ON per user "APPROVED per your best
recommendations" approval. 2 work priorities + closeout.

**P1 — Process drift cleanup (Micro).** Pushed 3 pending state-autocommits
(`f46f56e..60e588a`) to `origin/master`. No source change — pure hook bookkeeping.
Working tree clean tracking origin.

**P2 — Phase 2 design decision matrix (Standard).** Produced
`docs/phase-2-design-options.md` (523 lines, decision-ready matrix). 7 mechanics
covered (6 original from PDR + 1 surfaced by Council R1 against spec § VIII.3:
**Sever-as-disruption**, which Phase 1's self-sever already half-implements). All
7 options have ASCII sketch + fires-when + spec citation + cost (S/M/L anchored
to S1-S10 live LOC) + pros + cons + risks + playtest readiness + verdict +
flag-for-veto. Mermaid prereq DAG: B→{C,D,E}, E→F, A→{C,D,E} dotted, G standalone.
Tier groupings (foundation / disruption suite / render / richness). 7 open
questions, tiered rollout recommendation (S12-S15 sequencing if "ship Phase 2
minimal"). Pattern matches S9 P4's `docs/structure-cinematics-options.md`.
Council R1: Grok DISRUPTOR + Gemini AUDITOR both REVISE; all adopted Council
changes synthesized (per-option risks, playtest-readiness, rationale paragraph,
cost-anchor grounding, Mermaid graph). Battle Ledger appended to PDR.

**P3 — Closeout.** Per-priority commit + push. BACKLOG S11 entry + session map.
Reflexion log: prepend S11 (4 entries) + prune 4 oldest S5 entries to maintain
50-cap. Boot-snapshot regenerated. PDR archived to
`.claude/plans-archive/2026-05-11_PDR_Session_11_COMPLETED.md`.
HANDOFF_2026-05-11.md root replaced; S10 root → `.handoff-archive/`.

**Exit gate:** 179/179 tests still pass (no source change), typecheck clean,
2 priority commits (`60e588a` push + `2329dcf` P2) + 1 closeout commit on master,
all pushed to origin.

**PRIME-AUDIT carry-forward:** `effectsRenderer.ts` at 569 LOC exceeds 500-LOC
soft charter (`§ XV`). Refactor candidate for S12+ when Phase 2 adds more effect
kinds — split per-kind drawers into separate files.

---

## Session 10 — Tuning + Cinematics Implementation [COMPLETED] (2026-05-11)

**Triggered by S9 handoff carry-forward.** User playtested post-S9 build:
P1 (release teleport) and P2 (cross-structure merge) confirmed working;
P3 (scoring) implicitly accepted. New tuning callout on AttractDrag feel
("stupid magnet slowly swinging"). User picked cinematics options B + C +
D-lite from `docs/structure-cinematics-options.md` with explicit answers
to all 4 open questions (outward-from-new-prim, real-verlet-impulse,
every-15, include-debug-toggle). Standard-tier batch — Council waived per
S7/S8/S9 precedent; PRIME-AUDIT per priority. 5 implementation priorities
+ closeout; ~480 LOC across constants.ts, controls.ts, world.ts,
effects.ts, structure.ts, effectsRenderer.ts, main.ts + 14 new tests.

**P1 — AttractDrag follow tuning (Micro).** Replaced S5-era impulse-on-
prevPos (k = ATTRACT_STRENGTH / dist pushed against prevPos under verlet
damping 0.998 = damped pendulum) with position-lerp:
`spark.pos += (cursor - spark.pos) * ATTRACT_FOLLOW_RATE; spark.prevPos
= oldPos`. At 8 substeps/frame × rate 0.06, ~38% gap-closure per frame.
Pure position math — no force/dt coupling, no overshoot. Side effect
(intentional): at LMB-up spark is within ~5px of cursor, so S9's
MAX_RELEASE_REACH=120 gate fires only on real flicks. Extracted as pure
helper `stepAttractLerp` for unit testing. ATTRACT_STRENGTH removed.
5 new tests. Closes "stupid magnet slowly swinging" user report.

**P2 — Cinematic B: STRUCTURE_GROW outward pulse (Micro).** New effect
kind carrying precomputed BFS hop maps (`Map<PrimitiveId, hop>` +
`Map<BondId, hop>` + maxHop) from `bfsHopMap(seed, prims, bonds)` in
`structure.ts`. Emitted at end of `placePrimitive` for the new prim's
post-merge component. Renderer's `drawStructureGrow` iterates hop maps,
flashing each primitive when wavefront arrives at `hop ×
STRUCTURE_GROW_HOP_TICKS=4`, sine envelope over STRUCTURE_FLASH_TICKS=18.
Bonds highlight on the later endpoint's hop. Live primitive positions
looked up from world per frame (severed-mid-effect skipped). Anchor
placements emit `{origin: 0}` minimum-event. effectsRenderer refactored
to per-kind `effectLifetime()` helper + draw signature `(effect, age,
lifetime, world)`. 3 new tests. session5.test.ts 1 test updated.

**P3 — Cinematic C: STRUCTURE_MERGE with real verlet impulse (Micro).**
Per merge bond inside the sweep loop: (1) apply verlet impulse — for each
prim in `candComp.primitiveIds`, push prevPos AWAY from new prim by
MERGE_IMPULSE_MAGNITUDE=1.2px along unit (cand→prim). Next-step velocity
= (pos - prevPos) propels TOWARD new prim. Magnitude conservative — 2%
strain at LOW-tier worst case, well under 2.0× break threshold. (2) Emit
STRUCTURE_MERGE with `unionPrimIds = [...mergedComponents,
...candComp.primitiveIds]` snapshotted BEFORE the candidate is added.
Renderer's `drawStructureMerge` flashes union after MERGE_LEAD_IN_TICKS=4
delay — synchronized "snap" vs STRUCTURE_GROW's BFS-timed "wave."
3 new tests.

**P4 — Cinematic D-lite: SCORE_TIER corner pulse every-15 (Micro).**
`placePrimitive` snapshots `oldScore` at entry; after all increments,
emits one `SCORE_TIER` per crossed multiple of SCORE_TIER_STEP=15 via
`for (t = oldTier+1; t <= newTier; t++)` loop. Renderer's
`drawScoreTier` draws bloom + leading ring at (PROGRESS_X+40,
CANVAS_HEIGHT-60) — co-located with HUD progress bar. Renderer-only,
sine envelope over SCORE_TIER_DURATION_TICKS=30 (~500ms). At threshold
50, expect 3 tier events before WIN (15, 30, 45). 3 new tests.

**P5 — Cinematics debug toggle (Micro).** World gains
`cinematicsEnabled: boolean = true` (not persisted in save.ts —
debug-only). 3 emission sites gated on this flag. P3 verlet impulse
stays UNCONDITIONAL — user picked physics-over-visual, so physics half
is a designed mechanic. BOND_COMMIT and SEVER_ERASE remain unconditional
(bond-level combat feedback). main.ts `C`/`c` keydown handler flips
toggle. Legend hint gains "C cinematics" suffix. 4 new tests.

**P6 — Closeout.** Per-priority commit + push (S9 rule). BACKLOG +
reflexion (≤50 cap maintained, 7 S10 entries + S4 detail prune + 1 S5
entry prune) + boot-snapshot + PDR archive + handoff + push.

**Exit gate:** 179/179 tests (was 161 + 18 net new in session10.test.ts
+ 1 P2-impact rewrite in session5.test.ts), typecheck clean, browser
HMR clean across all S10 commits (vite logs show 13+ page reloads zero
errors). 5 priority commits (3f599b5, 479fb5a, 2d3e4e7, 79c0e0c,
02e5308) + 1 closeout commit on master, all pushed.

---

## Session 9 — Playtest Bug Fixes + Cinematics Brainstorm [COMPLETED] (2026-05-11)

**Triggered by post-S8 user playtest.** Four observations + four process directives.
Three playtest-confirmed bugs closed; cinematics brainstorm doc landed for S10 pick.
**No physics tuning** — AUTO_BOND_RADIUS / ATTRACT_STRENGTH / strain thresholds
stay deferred for post-S9 playtest.

**P1 — Release teleport fix (Micro).** Removed S7 P1's snap-to-cursor at LMB-up
(`spark.pos/prevPos = cursor`). Replaced with reachability gate: if
`dist(spark.pos, cursor) > MAX_RELEASE_REACH=120` at release, the place is
rejected — spark stays Free where physics put it. When reachable + outside
zone, PICKUP+PLACE proceeds at `spark.pos`, and `pickPrimitiveInRange`
measures from `spark.pos`. Bond-length-bounded invariant preserved via
spark-physics range, not via cursor snap. Closes the user-reported "you can
literally have it teleport to the end point" bug. 3 tests in session7.test.ts
rewritten to match.

**P2 — Cross-structure auto-merge (Micro).** PLACE_PRIMITIVE action gains
optional `mergeCandidateIds: ReadonlyArray<PrimitiveId>`. After primary bond,
`placePrimitive` sweeps candidates and adds one bond per *other* connected
component (dedup via `mergedComponents: Set<PrimitiveId>` seeded from
primary's `componentOf`, per-candidate alreadyMerged early-exit). Each merge
bond emits BOND_COMMIT. `controls.ts` onUp now gathers all primitives within
AUTO_BOND_RADIUS=60 of spark.pos via new `allPrimitivesInRange` helper and
passes them as candidates. Closes the user report that distinct structures
never interconnect despite proximity. 5 new tests in session9.test.ts.

**P3 — Complexity-weighted scoring (Micro).** Replaces flat
`primitives.size / 30` with `world.scoreProgress` accumulator. Magic combos
contribute SCORE_MAGIC_BOND=3, Functional placeholders SCORE_FUNCTIONAL_BOND=1,
anchors SCORE_ANCHOR=1. WIN at PHASE_1_WIN_SCORE=50. P2 merge bonds also
weighted. `gameState.tickGameState` uses scoreProgress; `softReset` zeros it;
`ui.HUD.drawProgress` reads it; `save.WorldSnapshot` persists optionally
(?? 0 fallback for pre-S9 saves). Closes user report that all combinations
score equally. gameState.test.ts + 5 new P3 tests in session9.test.ts.

**P4 — Cinematics options brainstorm (design doc only).** Created
`docs/structure-cinematics-options.md` (~280 lines): 5 options A-E with ASCII
sketches, fires-when, intensity scaling, implementation cost (S/M), pros/cons,
verdicts. Recommendation for S10: B (structure-wide pulse along bonds from
new primitive) + C (merge-wave for P2 cross-structure events) + D-lite
(corner pulse every 10 score). 4 open questions for user pick before S10:
pulse direction, merge-wave force (visual vs physics), tier frequency,
skip-cinematic debug toggle. No code changes.

**P5 — Closeout.** Per-priority commit + push (new rule from S9 boot: push
at every commit, not deferred to handoff). Updated BACKLOG.md, prepended
reflexion_log.md S9 block (9 entries), regenerated boot-snapshot.md, archived
PDR to plans-archive/, wrote HANDOFF_2026-05-11.md at root replacing S8
version (S8 archived to .handoff-archive/HANDOFF_2026-05-11_S8.md).

**Exit gate:** 161/161 tests (was 151 + 10 new across session7/session9/
gameState), typecheck clean, browser HMR'd cleanly between priorities (no
console errors, world.scoreProgress exposed at 0 on fresh init). 4 priority
commits + 1 closeout commit on master, all pushed.

---

## Session 8 — Bond-Visual Polish + PRIME-AUDIT Delta Closure [COMPLETED] (2026-05-11)

**Triggered by S7 PRIME-AUDIT delta + close re-read of `bondVisualRenderer.ts`.**
S7 PRIME-AUDIT flagged whip wave static + lattice cross-hatch fading at
small bond lengths; close re-read against the wheel/vortex/orbital pattern
surfaced a sister defect (drawWarped also static despite the name) and
one creative-coherent add (filament starburst should shimmer with energy).
**No physics tuning** — AUTO_BOND_RADIUS / ATTRACT_STRENGTH / strain
thresholds are playtest-gated per the S7 carry-forward and stayed
deferred.

**P1 — Whip wave drift (Micro).** Added `driftPhase = p.tick * 0.022`
inside the wave's sin term so the wave propagates A→B at one wavelength
every ~2.4s. Closes whip half of S7 PRIME-AUDIT delta.

**P2 — Lattice cross-hatch contrast (Micro).** Replaced `width: 1,
alpha: 0.5` constants with `crossWidth = Math.max(1.2, p.width * 0.55)`
and `crossAlpha = p.alpha * 0.65`. HIGH-tier cross-hatch jumps from
1.0px to 1.65px vs outline 2.4px — visible 70% weight (was 42%). Closes
lattice half of S7 PRIME-AUDIT delta.

**P3 — Warped 3-fold rotation + breathing (Micro, sister fix).** Added
`rotPhase = p.tick * 0.008` inside `sin(a*3 + rotPhase)` (full turn
~13s) and `breatheAmp = 0.3 + sin(tick*0.025)*0.08` (0.22–0.38 extent,
period ~4.2s) replacing the static 0.3 multiplier. At tick=0 breatheAmp
reads 0.3 — backward-compat with prior visual baseline.

**P4 — Filament starburst shimmer (Micro, creative add).** Ray alpha
modulates `0.40–0.70` of `p.alpha` over ~2.6s via `sin(p.tick * 0.04)`.
Main bond stroke unchanged. GraphicsMock extended to capture
`[width, color, alpha]` so alpha-only animations show up in serialize-
comparison tests; verified safe across the existing 35 S7 tests.

**P5 — Static-equality test consolidation (Micro).** Replaced the
singleton `non-animated fx.cable is identical` test with `it.each` over
the 6 silhouettes that must NOT introduce tick dependence (cable,
bracket, diamond, star, lattice, capsule). Guards the OPPOSITE regression
class — a future refactor accidentally wiring `p.tick` into a structural
silhouette.

After S8 the 12 magic silhouettes formally split: **6 ANIMATED** (wheel,
vortex, orbital — pre-existing; whip, warped, filament — added in S8) +
**6 STATIC** (cable, bracket, diamond, star, lattice, capsule). The split
matches combo tier semantics: LOW-tier unstable + HIGH-tier energetic
animate; MID-tier structural stay frame-stable. Each silhouette now has
a paired regression test (animated → tick-diff; static → tick-equality).

**P6 — Process closeout.**

**Exit gate:** 151/151 tests (was 142 + 9 net new), typecheck clean,
browser-verified at 60px bond length (pixel-hash diff at tick=0 vs
tick=120 for whip/warped/filament; identical hash for lattice — static-
silhouette signature confirmed). 5 priority commits + 1 closeout commit
on master.

---

## Session 7 — Connection-Range Gate + Per-Combo Persistent Bond Visuals [COMPLETED] (2026-05-09)

**Triggered by post-S6 user playtest.** Two issues surfaced in real play:
(a) bonds spanning the canvas (user: "you can connect from any part of the
map, which doesn't make sense"); (b) all bonds rendering as the same line
even though the 36 combos differ in stiffness/area/effectId (user: "every
shape you connect to the structure it changes the structure shape
mathematically right? ... for now it just makes a line, which is not bad
for session 6 but still not really any interesting").

**P1 — Connection-range gate (Micro).** Root cause was cursor↔spark-pos
divergence in AttractDrag: `pickPrimitiveInRange` measured from cursor while
placement used the lagged `spark.pos`. Bond length = dist(spark→cursor) +
60, unbounded. Fixed by snapping `spark.pos = cursor` at LMB-up before
PICKUP/PLACE so all three (placement, in-zone test, auto-bond range) share
cursor as source-of-truth. Bond length ≤ AUTO_BOND_RADIUS=60 by
construction. Side effect (intentional UX): cursor-into-zone now cancels
the place. 3 new vitest tests in `session7.test.ts`.

**P2 — Per-combo persistent bond visuals (Standard).** New module
`bondVisualRenderer.ts` (~290 LOC, under 500 charter). 12 magic combos
render their named silhouette stretched/anchored between bond endpoints
(filament, cable, bracket, diamond, wheel, star, orbital, lattice,
capsule, vortex, whip, warped); the 24 functional combos keep the default
straight line. Animation tied to `world.tick` (pauses with physics) for
wheel rotation, vortex phase, orbital pulse. Stress-tint + width still
applied at the structureRenderer layer — silhouettes inherit the lerped
color, near-break red-overlay pulse remains an additive top layer. 35 new
vitest tests covering dispatch + degenerate-bond fallback + animation
differentiation. Browser-verified at 110px and 60px bond lengths.

**P3 — BACKLOG.md hygiene** (this entry + S6 retro-entry). **P4 — handoff +
dev server up for next-day playtest.**

**Exit gate:** 142/142 tests, typecheck clean, browser-verified grid of all
12 magic combos. Per-priority commits (4d82b8b, 83140e0).

---

## Session 6 — Polish Pass + Git + Carry-Forwards [COMPLETED] (2026-05-09)

**P0 — Git initialization.** Project ran 5 sessions without a git repo;
initial commit (`bc89a53`) captured the full post-S5 state. Subsequent
session-6 commits per priority on top.

**P1 — Bond stiffness tier defensive refactor (S3 carry-forward).** Static
trace disproved the "tier=MID for Dot→Line" hypothesis from the original
handoff (the actual code path keeps the spark in `freeSparks` after
PICKUP_SPARK, so the lookup succeeded). Defensive refactor applied anyway:
`computeStiffnessTier` now takes `SparkType` directly, captured BEFORE
`PICKUP_SPARK` dispatch — code-clarity win even if the bug wasn't real.

**P2 — Effects-list hard count cap (S3 carry-forward).** New constant
`MAX_ACTIVE_EFFECTS=64`. Belt-and-braces over the existing lifetime ageing.

**P3 — 12 per-combo placeholder silhouettes (S3 carry-forward).** Plumbed
`visualEffectId` through PLACE_PRIMITIVE → BOND_COMMIT effect; renderer
switches per id to draw distinct ephemeral flair (filament starburst,
cable parallels, bracket triangle, diamond, wheel, star, orbital, lattice,
capsule, vortex, whip, warped + default ring for the 24 functional). All
silhouettes are ephemeral one-shot pops at the bond-commit moment —
became persistent in S7 P2.

**P4 — Browser verification + screenshots.** 13-effect probe grid via
`__SPARK__.world` mutation (Pixi pauses ticking when Claude Preview tab is
hidden, so static state-mutation + manual render is the way).

**Exit gate:** 104/104 tests, typecheck clean, 4 commits on master.

---

## Session 5 — Playability Pass [TOP PRIORITY] (2026-05-09)

**Why first:** Session 4 made the game spec-correct (distinct shapes, colorless free, player-color placed, no-build zone) but a hands-on attempt revealed the game is still unplayable due to physics tuning + input fidelity issues. None of these are spec-locked numbers — they're playability defaults that S1-S3 picked without playtest data.

**P1 — In-zone spark physics too fast.** With 10+ free sparks the zone becomes a chaotic blur. Sparks should drift slowly so the player can actually grab them.
- Likely fix: lower `SPARK_INITIAL_VELOCITY_MIN/MAX` (currently 20–80) to ~5–20
- Increase per-substep damping or add a global slow-down on free sparks inside the zone
- Possibly clamp max speed to a "drifting" cap (~30 px/sec)
- Verify the soft-cap of 50 still feels right at the new pace; may need to drop to 20–25

**P2 — Spawn rate too aggressive.** Currently 1.5/sec — players get any shape they want immediately. Should be ~10× slower so getting the right type becomes a strategic bet.
- `SPAWN_RATE_PER_SECOND` from 1.5 → ~0.15
- Re-validate the soft-cap math (at 0.15/sec a population of 50 takes ~5 min to fill, which is fine)
- Check that the stress test still works under the slower spawn

**P3 — Cursor↔spark misalignment.** Cursor and the spark/avatar are not aligned, feels weird.
- Likely root cause: `Controls.updateCursor()` scales by `canvas.width / rect.width` but Pixi's `autoDensity + resolution` doubles the internal canvas. The mouse-coord scaling is probably double-counting DPR.
- Verify against [controls.ts:187-193](src/input/controls.ts:187) — the `sx`/`sy` formula
- Test: cursor at top-left should put avatar at canvas (0,0), not (0,0)/2 or (0,0)*2

**P4 — LMB/RMB drag unreliable.** Sometimes pointer events don't fire / drag doesn't engage.
- Likely cause: `pointerdown` listener may be losing pointer capture; `pointerup` outside the canvas isn't handled (only `pointerleave`)
- Fix candidates: `setPointerCapture` on pointerdown; listen on `window` for `pointerup` instead of canvas; use `passive: false` if scroll is competing
- Also verify right-click context-menu is actually suppressed in all browsers (Chrome/Edge/Safari)

**Exit gate:** User can sit down, build a 10-primitive structure without frustration. Sparks drift slowly, new shapes are scarce-feeling, cursor visibly tracks the avatar pixel-perfect, every drag attempt commits.

---

---

## Session map

| Sess | Theme | Goal | Exit gate |
|---|---|---|---|
| **0** | Plan + scaffold | (DONE) Locked decisions + Vite/Pixi project booting | typecheck clean, dev server starts |
| **1** | Physics foundation | (DONE) Verlet + spawner + spark rendering | 6 spark types bouncing in spawner, 60s no NaN, dev stats overlay green |
| **2** | Core interaction | (DONE) Mouse + Carry-1 FSM + first bond | Grab spark, drag back, bond commits, structure renders |
| **3** | Game logic | (DONE) 36-combo lookup + structure + self-sever (BFS) + energy stub | Build 5-spark structure with 3 combos, sever splits correctly |
| **4** | Game state loop | (DONE) Win condition + state machine + save/load (WorldSnapshot) | SETUP→PLAYING→WIN→POSTGAME with JSON save |
| **5** | Playability pass | (DONE 2026-05-09) Drift speed, spawn rate, cursor alignment, drag reliability, single-action place | 50 sparks drifting cleanly; auto-bond on release-outside-zone within 60 px |
| **6** | Polish + git + carry-forwards | (DONE 2026-05-09) git init + bond-tier defensive refactor + effects-list cap + 12 ephemeral combo silhouettes | 4 commits on master, 104/104 tests, browser-verified probe grid |
| **7** | Connection-range gate + per-combo persistent bond visuals | (DONE 2026-05-09) snap-to-cursor + bondVisualRenderer for 12 magic combos | 142/142 tests, browser-verified 12-combo grid at 60px and 110px |
| **8** | Bond-visual polish + PRIME-AUDIT delta closure | (DONE 2026-05-11) whip drift + lattice contrast + warped rotation + filament shimmer + animated/static regression-test pair | 151/151 tests, browser-verified all 4 visual fixes via pixel-hash diff |
| **9** | Playtest bug fixes + cinematics brainstorm | (DONE 2026-05-11) release teleport fix + cross-structure auto-merge + complexity-weighted scoring + cinematics options doc | 161/161 tests, browser HMR clean across priorities, 3 bugs closed |
| **10** | Tuning + cinematics implementation | (DONE 2026-05-11) AttractDrag follow-lerp tuning + STRUCTURE_GROW outward pulse + STRUCTURE_MERGE verlet impulse + SCORE_TIER every-15 corner pulse + C-key debug toggle | 179/179 tests, browser HMR clean, all 4 cinematics + tuning callout closed |
| **11** | Buffer: drift cleanup + Phase 2 design matrix | (DONE 2026-05-11) Push state-autocommits + `docs/phase-2-design-options.md` (7 mechanics × full template, Mermaid prereq DAG, tiered rollout recommendation, Council R1 deliberated) | 179/179 tests, Phase 2 conversation has decision-ready artifact when user signs off Phase 1 |
| **12** | effectsRenderer per-kind split (§ XV charter compliance) | (DONE 2026-05-11) Dead-silhouette audit (zero deletions) + 7 new files under `src/render/effects/` + parent rewrite (569→116 LOC) + new smoke test, Council R1 (Grok VETO + Gemini REVISE) adopted 6 of 7 | 201/201 tests (179 + 22 new), typecheck clean, no file >500 LOC, Phase-2-ready seam |
| **13** | Playtest feedback batch — merge bug fix + cinematics tuning | (DONE 2026-05-12) MERGE_REACH_RADIUS=100 + nearest-pick map (multi-structure merge), STRUCTURE_GROW centroid-outward impulse, MERGE_IMPULSE 1.2→3.0 + short-bond clamp, SCORE_TIER center pulse at placement. Council R1 (Grok DISRUPTOR + Gemini AUDITOR both REVISE) adopted 6 of 10 findings | 216/216 tests (201 + 15 new), typecheck clean, all 4 playtest items closed |
| **14+** | **Audio / Phase 2 implementation** [NEXT] | User re-playtest post-S13 build; then: Audio (when Suno track lands); Phase 2 implementation per `docs/phase-2-design-options.md` user pick (recommended Tier-0 first = B.2 Hotseat + A Fog); placePrimitive extraction (S13 PRIME-AUDIT carry-forward); any post-playtest re-tuning | User picks from Phase 2 matrix + "ship Phase 2" |

If Session 12 closes all gates early → Phase 2 implementation begins (foundation tier: B.2 hotseat + A fog of war).

---

## Session 1 — Physics foundation (THE GATING SESSION)

**Why this is first:** Per Grok Round 3 audit, the Verlet+spring solver gates every other system. Bugs here cascade. Land it stable before adding any interaction.

**Priorities:**
1. `src/physics/verlet.ts` — position-based integrator (60 Hz, 8 substeps, damping 0.998)
2. `src/physics/bonds.ts` — Hooke-style constraint relaxation (NOT force) with stiffness 0.2/0.5/0.8 + position-correction clamp 0.5×rest_length
3. `src/physics/collision.ts` — soft pairwise positional resolution (free sparks within zone)
4. `src/physics/spatial.ts` — cell-grid spatial hash for neighbor queries (Phase 1 ~50 entities, scales to 400)
5. `src/game/spawner.ts` — confined 250-px zone, 1.5/sec Poisson spawn, elastic boundary bounce
6. `src/game/spark.ts` — entity with `state: Free | Carried | Bonded` discriminated union
7. `src/render/renderer.ts` — Pixi v8 `Application` boot; ParticleContainer for free sparks
8. `src/render/statsOverlay.ts` — toggle `~`: FPS, physicsMs, renderMs, sparkCount

**Tests** (start lightweight in Vitest):
- `verlet.test.ts` — deterministic 300-tick run, snapshot final positions, assert no NaN
- `spawner.test.ts` — seeded 500-tick run, all sparks remain in zone

**Exit gate:** Run `npm run dev`. See 6 type-distinct sparks (one of each) bouncing in spawner zone for 60+ seconds. No NaN, no explosions. Stats overlay shows physics ≤ 5.5 ms, render ≤ 7.0 ms, FPS = 60.

---

## Session 2 — Core interaction

**Priorities:**
1. `src/input/controls.ts` — mouse listeners; drag-state FSM
2. `src/game/player.ts` — Carry-1 enforced via discriminated union `IdlePlayer | CarryingPlayer` + runtime guard on every transition
3. `src/game/primitive.ts` — placed spark with `readonly pos` post-`commit()`; stores `placerColor`, `createdTick`, `bonds: Set<BondId>` from day 1 (per LOCKED_DECISIONS § 10.1)
4. `src/state/world.ts` — single `dispatch(action: GameAction)` seam (per LOCKED_DECISIONS § 10.2)
5. Drag-attract: hold LMB on free spark in zone → spark accelerates toward cursor; release inside zone keeps it free, outside zone locks as carried
6. Drag-connect: hold RMB while carrying, drag to existing primitive in your structure → bond commits via `dispatch({type: 'PLACE_PRIMITIVE', ...})`
7. First bond proves out the constraint solver under user load

**Tests:**
- `player.test.ts` — Carry-1 FSM: pickup-then-pickup throws, drop after carry returns to idle, type-level guard prevents double-carry

**Exit gate:** grab a Dot from spawner, drag outside zone, grab another Dot, RMB-drag to first → see bond render and tug elastically when sparks move. No double-carry possible.

---

## Session 3 — Game logic

**Priorities:**
1. Wire `src/combos.ts` `lookupCombo()` into bond commit — apply `stiffnessTier`, `areaMultiplier`, render `visualEffectId` placeholder
2. Verify all 36 combos resolve (test all entries via `comboSystem.test.ts`)
3. `src/game/structure.ts` — connected-component tracking via Union-Find OR adjacency-driven BFS
4. **Self-sever** — double-RMB on a bond → BFS split → smaller side deletes (§ VIII.4); tiebreaker = max `createdTick` on each side
5. Edge cases (per spec): single-primitive side always loses; cut on connector chain → bridge deletes
6. Energy: flat `+5/sec` accumulating in `Player.energy`; render small peripheral gauge (no number, just bar fill)

**Tests:**
- `comboSystem.test.ts` — `test.each` for all 36 ordered pairs; assert `isMagical` count = 12
- `sever.test.ts` — 8 hand-crafted graphs (chain, tree, cycle, balanced split, single-primitive limb, anchor isolation); assert exact deleted set per tiebreaker rule

**Exit gate:** Build a 5-spark structure with ≥3 distinct combos (e.g., Dot→Line→Triangle→Triangle→Circle). Sever a bond → smaller side erases visibly. Energy gauge ticks up.

---

## Session 4 — Game state loop

**Priorities:**
1. `src/state/gameState.ts` — FSM: `SETUP → COUNTDOWN → PLAYING → WIN → POSTGAME`
2. Win condition: `claimedArea / canvasArea ≥ 0.51` per primitive's `areaMultiplier`. **Phase 1 placeholder for solo:** trigger WIN at 30 placed primitives (constant `PHASE_1_WIN_PRIMITIVE_COUNT`).
3. WIN state: gameplay halts, simple "WIN" text overlay (per spec § XIII Phase 1: "placeholder cinematic")
4. POSTGAME: snapshot saved via `src/state/save.ts` → `WorldSnapshot` JSON to localStorage with timestamp
5. Reset/restart on click → SETUP

**Tests:**
- `gameState.test.ts` — FSM transitions; can't enter PLAYING from POSTGAME without SETUP
- `save.test.ts` — round-trip serialize/deserialize a 30-primitive `WorldSnapshot`

**Exit gate:** Full SETUP → PLAYING → WIN → POSTGAME loop. Save file generated. Reload restores state.

---

## Session 5 — Smoothness pass

**Goals:** every Phase 1 done-gate (LOCKED_DECISIONS § 8) closes.

**Priorities:**
1. Stress runs (3 × 10 min) — log any explosions / NaN / softlocks → fix
2. Frame-budget verification — physics ≤ 5.5 ms, render ≤ 7.0 ms; if over, optimize per LOCKED_DECISIONS § 10.7
3. Verify all 6 invariants (LOCKED_DECISIONS § 11) have type-level + runtime enforcement
4. Edge-case fuzz: rapid clicks, edge-of-canvas builds, sever-during-bond-commit, carry-during-sever
5. Visual feedback tightening: bond commit pop, sever erase, energy gauge animation
6. If a Pixi-side issue: ParticleContainer for free sparks, single Graphics per Structure (per LOCKED_DECISIONS § 10.7)

**Exit gate:** all 3 Phase-1 done gates pass. Project ready for hands-on user playtest.

---

## Session 8 — User playtest tuning [NEXT]

User drives. Claude assists with quick iteration on whatever feels off in
the post-S7 build (snap-to-cursor placement + per-combo persistent bond
visuals).

**Likely tuning targets (gated on user input):**
- `AUTO_BOND_RADIUS` (60) — tighten or relax based on play feel
- `ATTRACT_STRENGTH` (60_000) — likewise
- Strain auto-sever thresholds (LOCKED_DECISIONS § 11.4 STRAIN_BREAK_BY_TIER)
- Bond visual polish — whip wave drift, lattice cross-hatch contrast at small bond lengths, star size

**Exit gate:** user explicitly says "yes, this works, ship Phase 2."

If issues remain → continues into Sessions 9-10.

---

## Sessions 9-10 — Buffer

Reserved for:
- Tuning/iteration on user feedback
- Audio integration (when user uploads Suno didgeridoo trance track + small connection SFX)
- Phase 2 design (fog of war, local-MP, full disruption: Inject Spiral + Steal)
- Phase 2 multi-color/structure work
- Mega-combo connector chains

---

## Cross-cutting rules

- **Each session ends with**: typecheck clean, tests green, git commit (or commit-equivalent), session-state.json updated.
- **Every commit** must respect § XV anti-bloat charter — no module > 500 LOC, no unrequested features, no audio (until user uploads track).
- **No vision changes.** All deviations from spec § XIII Phase 1 deliverables flagged in this doc as Phase 2+ scope.
- **Council usage**: targeted only — Grok for execution decisions, Gemini for math validation. NOT for creative redesign.
- **LOCKED_DECISIONS is sacred.** If a number must change during Phase 1, log as Open Items v2 — don't sneak.

---

## NOT in Phase 1 (per spec § XIII + LOCKED_DECISIONS)

- ❌ Networking (Phase 3)
- ❌ Multiplayer / opponents (Phase 2 local-MP first)
- ❌ Fog of war (Phase 2)
- ❌ Disruption beyond self-sever (Phase 2: Inject Spiral, Steal)
- ❌ Multi-color structures via Steal (Phase 2)
- ❌ Mega-combos / connector chains (Phase 2)
- ❌ Tutorial, menus (charter § XV)
- ❌ **Audio** — deferred until user uploads Suno didgeridoo track
- ❌ Full victory cinematic with migration/collapse (Phase 3)
- ❌ Accounts / persistence beyond local snapshot (Phase 4)

---

## Phase 1 done = working base

All 3 done-gates pass + full game loop exists + save/load works. Then Phase 2 design begins.
