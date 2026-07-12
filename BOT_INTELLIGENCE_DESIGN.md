# BOT INTELLIGENCE — Tiered Game Knowledge Design

**Status:** DESIGN (S123 P4 — owner-requested research; NO gameplay code shipped). Implementation gets its own PDR after owner review (the TOWER_DEFENSE_DESIGN.md flow).
**Owner vision (S123, verbatim-condensed):** *"Bots of different levels should 'know' the game at different levels too — not only faster sparks / faster grabs / better connections: the harder the bot, the more it should seek different tower-defense or godly structures. The smarter they are, the more they should look for who is winning so they can raid him, and the smarter they play — delete their own constructions if it will create a certain combination."*

---

## 1. What exists today (the substrate this builds ON, not around)

**The bot stack** (S87, worker-safe since S123 P1):
- `botBrain.ts` — PURE goal selection: `chooseGoal` priority ladder (FLEE → CLEAN → RAINBOW → SEVER → POTATO → SHRINK → BUILD → REST), `chooseBuildPos` (home anchor + frontier growth), all `(world, inputs, rng) → decision`, no mutation, exhaustively unit-testable.
- `botController.ts` — FSM (IDLE/TO_SPARK/HAUL/ERRAND) + steering; every act is a plain `GameAction` through `dispatch()` → bots obey the same gates as remote humans (bench, reach, territory, charges). Stuck-guard + per-tick re-validation.
- `botConfig.ts` — per-difficulty knob table (NOOB/MID/HARD/IMBA): speeds, think cadence, jitter, capability flags (`canSever`, `usesPotato`, `usesShrink`, `smartPlacement`…). **This file is already the "what does this tier know" registry — the design extends it, no new architecture.**

**The game already owns a machine-readable knowledge base** (this is the core insight — bots don't need "AI", they need *access* to the book the game already reads):
- **Combo table** (`combos.ts`): 36 entries, 14 magic names, exact `(carried, target) → outcome` — a perfect lookup for "what should I fuse".
- **Recipe predicates** (`state/godlyRecipes/*`): pure `(world, bondPos) → match|null` functions for pentagram (chewer spawner), lightningHub (drone spawner), laserTurret + HELGA (defenders), Voltkin (cinematic godly). Each spawner/defender also has `stillValid`/`isPentagramComponent`-style **shape validators — free plan-completion checkers.**
- **Scoring** (`state/scoring.ts`): `scoreByPlayer` per seat + income keystones (Filaments pay capped neighbor bonuses) — "who is winning" and "which of his prims pay him" are both O(1)/O(n) reads.
- **Topology** (`componentOf`, `severSplit`) and geometry seeds (`botSpawnerSeed.ts` — exact pentagram/hub ring math already written for the host-seeded rings).

**Rules facts that shape the design (verified in code):**
- **Self-sever costs 0 charges** (LOCKED §13.11 amended S52; `severBond.ts:65-69`) → *sacrifice plays are already legal and FREE under existing verbs.* No new verb needed for bond-level sacrifice.
- There is NO player verb to delete a placed primitive — "delete my construction" = sever its bonds (the split may cascade-delete prims per `severSplit`). A literal `RECLAIM_PRIMITIVE` verb would be a new rule (owner call, §7 Q3).
- S104 Council M9 rejected "teach the bot a scripted pentagram builder" — **as a fix for turret-target seeding**, solved by host-seeded rings with zero bot-RNG draws. The objective here is different (intelligence as a *feature*), and the M9 determinism concern is handled in §6.

---

## 2. Design overview — three layers, one new mechanism

```
KNOWLEDGE BOOK (tier-gated data)      →  what this bot is ALLOWED to know
GOAL LAYER (chooseGoal ladder + NEW)  →  RAID / BLUEPRINT / SACRIFICE goals
PLAN EXECUTOR (the one new mechanism) →  multi-step blueprint building
```

Everything stays: pure brain, dispatch-only actuation, mulberry32 determinism, worker-safe modules, FSM controller. The ONLY genuinely new machinery is the **blueprint executor** (§4). RAID and SACRIFICE are new *goals* reusing existing verbs.

## 3. Layer 1 — the tier-gated KNOWLEDGE BOOK

`botConfig.ts` gains a `knowledge` block per difficulty — data, not code:

```ts
interface BotKnowledge {
  /** Combo pairs this tier deliberately assembles (subset of the 36-entry table). */
  readonly combos: 'none' | 'basic-magic' | 'full';
  /** Structure blueprints this tier actively pursues (ids into the blueprint registry). */
  readonly blueprints: ReadonlyArray<'pentagram' | 'lightningHub' | 'laserTurret' | 'helga'>;
  /** Reads scoreByPlayer to find the leader (enables RAID targeting). */
  readonly readsScoreboard: boolean;
  /** Will sever OWN bonds when a better shape results (enables SACRIFICE). */
  readonly sacrifices: boolean;
}
```

| Tier | combos | blueprints | scoreboard | sacrifice | Personality result |
|---|---|---|---|---|---|
| NOOB | none | — | no | no | today's bumbling cousin, unchanged |
| MID | basic-magic (Filament/Cable) | — | no | no | starts *fusing on purpose* — visible intent |
| HARD | full | pentagram, laserTurret | **yes** | no | builds a swarm + a turret, raids the leader |
| IMBA | full | + lightningHub, helga | yes | **yes** | end-boss: full book, sacrifice re-shaping |

Two immediate, cheap upgrades fall out of the book **before** any blueprint work:
- **Combo-aware spark selection** — `pickTargetSpark` today ignores spark TYPE entirely. A knowledge-gated bot picks the spark whose type completes a known combo against its frontier prim (`lookupCombo(carried, target)`), instead of the nearest-any. One function, huge visible IQ jump.
- **Combo-aware placement** — `chooseBuildPos` targets the own-prim whose type forms a magic pair with the carried spark (the host re-pick within `AUTO_BOND_RADIUS` already forms the bond — the mechanism exists; the bot just never *aims* with it).

## 4. Layer 2 — the BLUEPRINT executor (the new mechanism)

A blueprint = data: relative slot geometry + required spark types + the recipe's own validator as the completion check.

```ts
interface Blueprint {
  readonly id: 'pentagram' | 'lightningHub' | 'laserTurret' | 'helga';
  /** Slot positions relative to an origin (from botSpawnerSeed.ts's exact ring math). */
  readonly slots: ReadonlyArray<{ readonly dx: number; readonly dy: number; readonly sparkType: SparkType }>;
  /** The game's OWN shape validator — plan completion = the recipe predicate firing. */
  readonly isComplete: (world: World, anchorPrimId: PrimitiveId) => boolean;
}
```

**Executor = a fourth FSM family in the controller** (alongside TO_SPARK/HAUL/ERRAND):
`PLAN_PICK` (choose blueprint + legal origin via `isLegalBuildPos` sweep) → for each unfilled slot: `TO_SPARK` (a spark of the slot's TYPE — the §3 selector) → `HAUL` to the slot (existing HAUL, targetPos = slot) → repeat → completion is detected by the **game itself** (the matcher registers the spawner/defender on BOND_FORMED — the bot doesn't even need to check; `isComplete` only gates plan abandonment).

Why this is small: TO_SPARK and HAUL already exist and already validate per-tick; the executor is bookkeeping (which slot next) + a plan-abandonment rule (slot blocked / origin overrun / STUCK_TICKS per slot — reuse the existing stuck guard). The geometry is copy-adapted from `botSpawnerSeed.ts` which already encodes exact legal pentagram/hub rings.

**Ambition arbitration:** BLUEPRINT enters the `chooseGoal` ladder between SEVER and BUILD, rng-gated per tier (`blueprintChance`), and only when no plan is active. One active plan max; plan state lives in the controller (FSM state, serialization-free — consistent with S123 Council (A): plans are re-decided, never checkpointed).

**Plan robustness (Council S123 P4 — GROK dithering critique CONFIRMED, adopted):** the per-slot stuck-guard alone under-handles a CONTESTED field (human steals a slot, chewers eat the ring). Three rules kill the failure modes:
- **Global plan TTL + progress rate:** abandon when `ticksSincePlanStart > PLAN_TTL` OR no slot completed in `PLAN_PROGRESS_WINDOW` — the plan-level complement to the per-slot guard.
- **Re-plan cooldown:** after any abandonment, BLUEPRINT goals are ineligible for `PLAN_COOLDOWN_TICKS` (the bot goes back to bread-and-butter building) — prevents the abandon→identical-replan dither loop; origins draw jitter from the bot's own rng, so a retry never repeats the exact contested spot.
- **CLEAR_SLOT fallback (GEMINI, adopted):** a slot obstructed by foreign geometry gets one sever/clean attempt (existing verbs) before the slot counts as blocked — the bot defends its construction site instead of looking blind. Fiercely territorial > silently stupid.

**Why not the "utility scorer instead of an executor" alternative (GROK R1) — REJECTED, logged:** a greedy per-placement utility scorer only *finishes accidents* ("almost-complete geometries" scanning): a 5-slot pentagram has ~zero marginal utility until 4 slots exist, so a greedy rule never INITIATES one — and deliberate initiation is exactly the owner's ask. The desire-vector *framing* is adopted as PLAN_PICK weights (`desire: {pentagram: 0.9, …}` per tier), the executor stays.

## 5. Layer 3 — RAID (leader-awareness) and SACRIFICE

**RAID** — for `readsScoreboard` tiers, a new goal above generic SEVER:
1. `leader = argmax(scoreByPlayer)` excluding self (tie-break: players-Map insertion order — deterministic, same rule `scoring.ts:60` already uses).
2. Target menu vs the leader, in order of damage-per-trip: (a) his spawner connectors (already implemented — `nearestEnemySpawnerBond` — just filtered to leader-owned); (b) his **income keystones** (Filament hubs — scoring exposes exactly which prims pay him; severing a keystone bond zeroes the capped bonus); (c) potato-plant on his structure (IMBA, existing ERRAND); (d) SHRINK when he's territory-rich.
3. `raidChance` knob per tier; the existing FLEE > CLEAN priorities stay above it (survival first).

**Raid cap — the "jealousy cap" (BOTH Council seats converged; adopted):** uncapped `argmax` dogpiles the leader → blue-shell meta (the optimal human strategy becomes sandbagging 2nd place — GROK's kingmaking + GEMINI's oppression critiques, CONFIRMED). Rule: **exactly ONE designated raider at a time**, chosen by a pure deterministic function every bot computes identically from world state alone — *the lowest-seat scoreboard-reading bot that is not itself the leader* raids; everyone else plays their normal game. No shared state, no negotiation, lockstep-safe. (Owner may loosen at IMBA-only lobbies — Q2.)
**Optional flavor (GEMINI, owner call):** a "fear penalty" — a raider that loses its own structures to the leader's counterplay de-prioritizes raiding for a window (retreat-and-rebuild reads as respect).

Today's bots attack the *nearest* enemy — the change is a targeting FILTER + a priority bump, not new actuation. In 3+-seat bots matches this reads exactly like the owner's ask: the pack turns on whoever runs away with the game — one wolf at a time.

**SACRIFICE** — for `sacrifices` tiers (IMBA):
- **Thrash-proof v1 rule (Council synthesis — GROK's sever/re-bond oscillation critique CONFIRMED, fixed structurally):** a bot may sacrifice ONLY while `Carrying` a spark whose combo against the freed prim out-prices the existing bond (`lookupCombo(carried, target).isMagical && !old.isMagical`, or it completes an active blueprint slot). The replacement is **literally in hand** when the old bond breaks — there is no window to re-evaluate and revert, so the greedy-loop thrash Grok constructed is unreachable *by sequencing*, not by a cooldown knob. Sever (own = 0 charges, §1) → immediate place → the better bond forms via the host re-pick.
- No look-ahead search in v1; depth-2 sacrifice (break two, rebuild three) is a later dial, owner-gated.

## 6. Constitution: determinism, perf, worker, tests

- **Determinism:** all new decisions are pure `(world, cfg, rng)` draws in FIXED order inside think ticks; blueprint slot order is static data; leader tie-break = Map insertion order. Adding rng draws CHANGES per-seed bot behavior vs S87 — that re-baselines `botGameplay.test.ts` expectations (a per-feature re-baseline, same as any bot behavior change; no cross-version replay contract exists for bots). The S104 M9 concern (bot-RNG draw-order surgery breaking the seeded rings) does not recur: host seeding draws ZERO bot rng and stays untouched.
- **Perf:** everything new runs on think ticks (every 6–48 ticks, staggered by seat), not per-tick. Costs: leader scan O(players); keystone targeting reuses scoring's per-prim data shapes; blueprint slot pick O(slots)=5–6; sacrifice scan O(own frontier bonds), IMBA-only. The per-tick path (steer/arrive) is untouched.
- **Worker-safety:** all additions live in `botBrain/botConfig/botController` + a new pure `botBlueprints.ts` — the same DOM-free import surface P1 just proved worker-clean. The differential HARD gate (S123 P1's bots scenario) automatically extends: any worker-vs-direct divergence in the new logic throws a frame index.
- **Tests:** brain stays pure → unit-test every new decision on synthetic worlds (the S87 pattern); one blueprint-completion integration test per blueprint (seed spark supply deterministically, assert the spawner/defender REGISTERS — the game's matcher is the oracle); differential bots gate re-run; a vs-bots e2e asserting a HARD bot registers a pentagram within N ticks.

## 7. Owner decisions needed (before the implementation PDR)

1. **Q1 — Difficulty feel:** does the §3 matrix match your intent (MID = combos only; HARD = +TD structures +raid; IMBA = everything +sacrifice)? Any re-shuffle (e.g. raid at MID)?
2. **Q2 — Raid pressure:** design adopts the 1-concurrent-raider cap (Council-converged; §5). Confirm — or loosen (all-pile-on) for IMBA-only lobbies?
3. **Q3 — Sacrifice depth:** bond-level sacrifice (sever own bond, free, exists today) is v1. Do you ALSO want a true "delete my primitive" verb (`RECLAIM_PRIMITIVE`)? That's a new GAME RULE (humans would get it too — balance surface). *Council recommendation (GEMINI): bond-sever-only — a literal delete reads as AI cheating; severed debris on the board is strategically interesting and proves the bot plays by human rules.*
4. **Q4 — Godly cinematics:** should IMBA deliberately chase VOLTKIN (cinematic godly, match-warping)? *Council recommendation (GEMINI): yes, with a fail-timer — if the build isn't half-done within a window, fall back to HELGA.*
5. **Q5 — Phasing approval:** ship order below OK?
6. **Q6 — Resource starvation (GEMINI add):** when the blueprint needs a spark TYPE the arena hasn't spawned, policy = idle-and-wait vs dynamically switch to a blueprint buildable from available sparks? (Design default: switch — the desire vector re-ranks against availability at PLAN_PICK.)
7. **Q7 — Collateral awareness (GEMINI add):** should IMBA check its own blast/shrink radius before raid verbs (knows to stand back) while HARD occasionally clips itself (comedy + skill separation)? (Design default: yes, exactly that split.)

## 8. Phasing (each phase independently shippable + testable)

| Phase | Content | Size | Value |
|---|---|---|---|
| **A** | Knowledge book + combo-aware spark pick/placement + RAID (leader filter + keystone targeting + 1-raider cap) | Standard (~15-20K) | biggest IQ-per-token; zero new FSM |
| **B** | Blueprint executor (+ TTL/progress/cooldown/CLEAR_SLOT robustness) + pentagram + laserTurret for HARD/IMBA | Full (~30K) | the owner's "seek TD structures" |
| **C** | lightningHub + helga blueprints + SACRIFICE v1 + **personality tells** (see below) (+ Q3/Q4/Q6/Q7 outcomes) | Standard (~15-20K) | end-boss IMBA |

**Personality tells (GEMINI creative pass — cheap, existing verbs only, they SELL the intelligence):**
- *The thinking hover* — before a sacrifice, the bot hovers dead-still over the bond ~1.2s. Humans learn the tell: "it's calculating."
- *The stare* — on entering RAID, face the leader, hold 0.5s, then move. The raid reads as personal.
- *The victory beat* — on the matcher registering the bot's spawner/defender, a quick avatar flourish (spin/bounce). Pride, for free.
- (Deferred, taste-risk: "spiteful denial" — hauling a spark the human needs just to dump it. Funny at IMBA, possibly rage-bait. Owner call if ever.)

---

## 9. Council consideration (S123 P4 — RECORD)

**Seats:** GROK-DISRUPTOR (grok-4.20-reasoning) + GEMINI-AUDITOR (gemini-3.1-pro-preview), R1 parallel → Claude R2 synthesis. **Gemini scorecard:** Vision-Fidelity 5/5 · Feasibility 4.5/5 · Fun-Impact 4/5 · Completeness 4/5.

| Finding | Source | Verdict | Landing |
|---|---|---|---|
| Executor dithering in contested fields (per-slot guard insufficient) | Grok | **CONFIRMED** | §4 robustness: TTL + progress rate + re-plan cooldown |
| Interruption handling / obstructed slots | Gemini | **CONFIRMED** | §4 CLEAR_SLOT fallback |
| Raid dogpile → blue-shell/kingmaking degeneracy | Both | **CONFIRMED** | §5 deterministic 1-raider cap |
| Sacrifice greedy-loop thrash | Grok | **CONFIRMED** | §5 in-hand-only rule (structural fix, no cooldown state) |
| "Kill the executor, greedy utility scorer suffices" | Grok | **REJECTED** | greedy never INITIATES a 5-slot ring (zero marginal utility until ~4 slots); initiation IS the ask. Desire-vector framing adopted as PLAN_PICK weights |
| "Bots share one mulberry32 stream → identical dithering" | Grok | **REFUTED** | per-seat streams (`matchSeed ^ seat*0xb07b07`, botManager.ts:28) + staggered think offsets |
| Replay join-order breaks leader tie-break determinism | Grok | **REFUTED** | vs-bots roster is fixed at START_GAME; players-Map order is roster order; networked bots don't exist |
| BOND_FORMED timing desync risk | Grok | **REFUTED** | matcher runs inside the differential-gated tick pipeline; executor polls world state on think ticks, no async reaction |
| Personality tells (hover/stare/victory beat) | Gemini | **ADOPTED** | Phase C |
| Q6 starvation + Q7 collateral + Q3/Q4 rulings | Gemini | **ADOPTED** | §7 |
