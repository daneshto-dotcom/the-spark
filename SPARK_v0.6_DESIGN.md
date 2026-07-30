# SPARK v0.6 — Design Direction & 25-Session Roadmap

**Status:** Working document. Supersedes `SPARK_Blueprint.md` v0.5.1 wherever the two disagree.
**Scope:** S126 → S150. 6-player FFA duel.
**Not yet committed to the repo.**

---

## THE DESIGN — one paragraph

> You have a **castle** built from trophies you earned, assembled by hand in a calm postgame cosmos. It produces **workers** who gather on your directives into a **capped bank**. You spend **energy** on your economy and **build with your hands** from the bank — sculpting, carving, transmuting structure into autonomous agents. Your spark is a **hero**, not a laborer. You win on **score**; you can lose your castle. Investing in your castle makes you a **target**, and losing costs you access to your best pieces for a while.

The game does not change genre. It stays a six-player free-for-all race to build the most complex geometry, on one shared canvas, with the same primitives, combos, godly recipes, hazards and towers that ship today. **No waves. No co-op as the main mode. No tower-defense reskin.**

What changes is **where the player's hands go**. Today they haul. After the pivot they command, decide, and sculpt.

---

## 1 · WHY THE REBUILD

| Measure | Value |
|---|---|
| Uninterrupted optimal play to reach the 1500 win score | **346 s** |
| Haul cycles that requires, back to back | **58** |
| Win score raised across sessions patching one problem | **30×** |
| Autonomous actors that produce rather than destroy | **0** |

At `SCORE_INCOME_PER_COMPLEXITY_PER_SEC = 0.05` and `PHASE_1_WIN_SCORE = 1500`, a player placing one primitive every six seconds needs ~346 seconds of *continuous, uninterrupted, optimal* placement to win — assuming no hunter, no potato, no poop slow, no contested pickup, no sever, and no time spent watching anything.

**Consequence: every second not spent placing a primitive is economically punished.** There is no room in the economy for idle time, watching, or talking to the person next to you. The win score climbing 50 → 150 → 210 → 630 → 786 → 1500 was six attempts to patch a single unresolved problem with the only lever available.

### Four root causes

1. **Arcade input, strategy duration.** Mouse-as-effector works for three-minute rounds with instant restart. Spark asks for it across ten-minute matches with strategy-game depth, then offers decisions the player has no hands left to make.
2. **You can't choose your input.** Uniform-random spark types + carry-1 + contested pickup means the RNG picks your build. A godly recipe becomes a two-minute lottery ticket rather than a plan — exactly why payoffs feel rare against the effort.
3. **Automation is decoration.** Chewers, drones, turrets, Helga, Voltkin and the hunter all destroy or defend. None produce. Production is 100% manual, forever. In every game in the reference class it is the other way round.
4. **The game is unlearnable.** No HUD, fog of war, and no sever preview each remove a feedback channel. Stacked, they break the action → outcome → improvement loop entirely. That is the precise signature of "you play twice and stop."

### The evidence that pointed the way out

Players build a large structure, then **delete parts of it down to exactly the connections a recipe needs** — knowingly trading points for drones. That emerged with nobody designing it, and it is a complete fun-loop: a real tradeoff, sculptural rather than logistical, expressing knowledge, with a compounding payoff.

It is gated behind five minutes of hauling, because you need a large structure before you can carve one. **The best thing in the game sits behind the worst thing in the game.** The pivot's first job is to move it to minute one.

---

## 2 · CORE LOOP — workers haul, you build

### The economy

- Your **castle produces worker sparks** — the same coloured sparks already on screen.
- Each worker hauls **exactly one primitive per trip**. The locked carry-1 rule survives; it moves from the player's hand to the worker's.
- Workers shuttle continuously: spawner → grab → castle → deposit → repeat. **They do not die permanently.**
- Pickup is **first-come, first-served**. No worker-vs-worker contest, so competition lives in economy rather than reflex.
- **Directives** are the input-choice mechanism — "collect only squares" replaces any hand-of-three UI. It's an order you give, not a menu you operate.
- Directive-filtered workers skip non-matching primitives, so **specialisation costs throughput**. That tradeoff falls out of the mechanic for free — *do not "fix" it when it shows up in a playtest looking like a bug.*
- Primitives deposit into a **castle bank capped around 8–10**.

### Why the bank cap matters more than it looks

A capped bank means you must spend to keep collecting. Workers stall at the ceiling, so there is continuous pressure to commit. That is precisely the function carry-1 was performing — preventing hoarding, throttling pace without a cooldown, forcing a build-vs-raid tradeoff.

v0.5.1 reasoned about that function correctly and implemented it at the wrong altitude: a dexterity constraint on the hand rather than a strategic constraint on the economy. **The bank cap is carry-1, promoted to where it always belonged.**

### The rule that protects the fun

> **Automate the labor. Never automate the authorship.**

Workers never build. A worker that collects squares and assembles Helga means *you did not build Helga* — you filled in a form and a script did the interesting part. Workers automate hauling, which playtests proved is not fun. Sculpting stays entirely with the player, because playtests proved that **is**.

Immediate payoff: with material available from minute one, the carve-down-to-a-recipe tactic is available from minute one too.

### Your spark becomes a hero

The player avatar stays and changes job — sculpts, raids, defends, grabs the potato, cleans splats, handles emergencies. It no longer hauls. Keeps the tactile drag-to-connect feel for the moments worth feeling, keeps every hazard meaningful, stops the mouse becoming a menu pointer.

Workers carry vision, so fog finally does something useful — your economy is your scouting network. A worker killed while loaded **drops its primitive**, which is what makes intercepting one feel good.

---

## 3 · COMMAND — the mouse issues orders instead of doing work

The problem was never the mouse. Every great strategy game is mouse-dominant. The problem is that in Spark the mouse **is** the effector — your avatar is literally the cursor position, and proximity and speed determine outcomes. In StarCraft the mouse is a command interface: you click, an agent acts. Hand speed converts into decisions per minute rather than physical work per minute.

### Targeting priority

Towers do not auto-retarget. **You click a tower and choose its targeting priority**, exactly as in Bloons TD.

| Priority | Targets | Existing content it reads |
|---|---|---|
| Offensive structures | Enemy spawners and emitters | Pentagram, lightning hub |
| Defensive structures | Enemy turrets and defenders | Laser turret, Helga |
| Fortress | The enemy castle itself | New — castle entity |
| Highest income | Whatever generates most points | Filament nodes, complexity clusters |
| Workers | Enemy economy | New — worker agents |

This requires a **structure taxonomy** that doesn't exist yet — offensive / defensive / fortress / income. It is already latent in shipped content; every recipe slots in without redesign.

### Keyboard

The keyboard becomes a **command layer**: select, order, ability hotkeys, mode switch. It does **not** become a second puppet. Driving Helga with WASD while the mouse drives your spark means controlling two real-time avatars on two independent effector channels, which no successful game does — the ones that flirt with it do so because the awkwardness is the joke.

---

## 4 · CURRENCY — two of them, and the second already exists

Purchasable upgrades — more workers, faster workers, faster respawn — create the central tension of every replayable strategy game: **spend on economy (compounds) or spend on power (matters now)?**

But **the win condition cannot be the currency.** If VP both wins and buys, spending moves you away from winning: early game spending is obviously right, late game obviously wrong, and there's a crossover where the maths flips. Once players find it, optimal play is a fixed script — and it reintroduces the exact "every second not optimising is punished" anxiety the pivot exists to remove.

| Currency | Earned from | Spent on | Wins? |
|---|---|---|---|
| **Score / VP** | Structure complexity, objectives, kills | Nothing — never spendable | Yes |
| **Energy** | Economy throughput, castle, functional bonds | Workers, upgrades, buildings, directives | No |

`player.energy` already accrues +5/sec via `TICK_ENERGY` in the physics loop, rides the wire in the protocol allowlist, and renders as a gauge on the right edge. The blueprint specified sinks; disruption ended up gated by build-count instead, so **energy has accumulated forever and been spent on nothing for a year.** A fully plumbed, networked, serialised, rendered second currency waiting for a job.

---

## 5 · THE CASTLE AND THE COSMOS

### The cosmos

Trophies live in **their own space** — a separate tab where every leftover structure you have ever won floats freely, with ambient music and no clock. This is where you assemble your fortress, and where you can pull it apart and try a different arrangement for the pleasure of it.

This is Spark's **third space**, and it is where the "beer and conversation" register actually lives. That register was never going to fit inside a competitive real-time match — those are supposed to be tense. Trying to make one mode be both relaxing and competitive is what made the current build feel wrong. **It is two modes.**

Postgame is also the strongest retention moment available: fresh trophy in hand, emotions still up, immediate reason to play again.

### Assembly

Assembly reuses **Spark's own bond mechanics** — you connect trophies the same way you connect primitives in a match, without a clock or an opponent. Freeform expression, structurally valid by construction, and it teaches the core interaction in the calmest possible setting. A bespoke editor would be more work and would teach nothing.

### Stakes — two rules

1. **Tier sets the power budget; trophies set the shape.** Two players at the same tier have the same power and radically different composition. Your library is a **loadout**, not a power level — which kills rich-get-richer before it starts.
2. **The library is permanent; the tier moves.** You never lose a trophy you earned. Results move your tier, which is the budget you can field.

**Permanent trophy loss is rejected.** It punishes the players who engage most with the best feature, makes hoarding optimal (a collection nobody dares field is a museum, not a meta), and loss aversion runs ~2:1 so symmetric risk reads as net negative. It is also the tonal opposite of the relaxed game this redesign exists to produce.

Instead:
- **Bounty** — a rich castle is visibly worth more to destroy, so investing costs **attention**, not property. Leader-targeting solves itself.
- **Dormancy** — trophies in a lost castle return unusable for a match or two.

> Stake attention and access, never the artifact.

### Castle damage and repair

Losing your castle is a second loss condition alongside the score race, so every match has two goals: defend and expand your home, and don't lose the race.

**Castle damage is repairable mid-match** — you rebuild what was destroyed by attaching connectors, if you can find or build the required shapes. That gives the bank and your workers a defensive purpose, turns a beating into a comeback, and stops castle damage being a death spiral.

### Trophies are blueprints

A trophy is a saved connected subgraph. A blueprint is a shape workers know how to build. **They are the same data structure.** So a trophy is simultaneously a socket in your castle and a shape you can field. Late game, you sketch a blueprint ghost and workers fill it in — authorship stays yours because you drew it and you earned it.

Capture is nearly free: `componentOf` already extracts connected subgraphs, `save.ts` already serialises primitives and bonds, and `POSTGAME` is already a real game state doing nothing.

---

## 6 · THE ENDGAME — how a match becomes a trophy

Fully specified in v0.5 §III.7 / §XII.8 and **never built** — the shipped game has a 2-second `WIN_DWELL_TICKS` and a text banner.

### Sequence — 28 seconds, six beats. Every duration is a music cue point.

| Beat | Time | What happens |
|---|---|---|
| Freeze | 0:00–0:02 | Input detaches, physics pauses, the score race stops. Held breath. |
| Fog lift | 0:02–0:05 | Fog and memory-fog dissolve together. Whole canvas visible for the first and only time. |
| Migration | 0:05–0:08 | All structures lift and drift to centre, retaining shape, colour, topology. |
| Procession | 0:08–0:23 | Five beats of ~3s. Players dissolve in ascending rank — 6th, 5th, 4th, 3rd, 2nd. Each mints that player's fragment, which flies toward their cosmos. |
| Trophy | 0:23–0:26 | The winner's structure dissolves too, but **halts** — the surviving subgraph is the trophy. |
| Flight | 0:26–0:28 | Sound effect, and the trophy poofs out of the world into the cosmos. |

The procession beat is **parameterised** — 3s per player, so 15s at six seats and proportionally shorter for fewer. **If the music wants a different length, this is the single number to move.**

### Which piece survives

The **most-recently-built contiguous region** of the winner's structure — grown greedily backward through `createdTick` while staying connected. That rule already exists in v0.5 and it is the right one: opening technique converges because everyone learns the same plays, but late-game expansion is where players diverge. The trophy records what made *this* match yours.

### Everybody leaves with something

The original spec gave a trophy only to first place. At six players that is **one trophy per six matches** — far too slow to feed a collection meta, and it hits new players hardest: few trophies, weak castle, keep losing.

So **every player mints a fragment, sized by finishing position.** The winner's is the largest by a clear margin; sixth place keeps something small.

This *improves* the cinematic — the procession now visibly mints six trophies in ascending order of size rather than erasing five players to spotlight one.

---

## 7 · THE NONET PROBLEM

Today `resolveSudoku` multiplies the winner's score by `NONET_WINNER_MULT` and **divides everyone else's** by `NONET_LOSER_MULT` — a relative swing of roughly **4×** — then `scoreProgress` is recomputed to the new maximum.

That breaks the endgame. The cinematic's promise is *the most complex structure survives, because that's how you won.* A player who wins on a score multiplier can hold the least complex structure on the canvas — so the ceremony dissolves the biggest builds and crowns the smallest. **The trophy would be a lie, and it is the object the entire meta is built from.**

### The fix: double the structure, not the score

The NONET winner's **built structure is physically duplicated on the canvas.** Score follows from complexity, so doubling what you built doubles what you earn — and the winner genuinely does hold the most complex structure, which makes the cinematic honest again. Far better spectacle than a number changing.

> **⚠ Important consequence:** doubling structure doubles your **income rate**, not your banked score. Under `score += 0.05 × complexity` per second, a NONET win doubles points-per-second *from that moment on* — a powerful comeback engine rather than an instant win. Almost certainly better than the current 4× swing, but a real behavioural change. Confirm you want it.

### What it needs

- **A placement algorithm.** Mirrored across the structure's centroid is the natural answer, but it must respect collisions, territory bubbles, the spawner-zone build ban and canvas bounds, and be deterministic for replay.
- **A decision on the loser penalty.** The ÷2 has no physical equivalent. Cleanest is to drop it — the winner's doubling is swing enough.
- **A balance dial.** Doubling favours whoever already built most, in absolute terms. Options: a cap on duplicated primitives, or biasing NONET triggers toward trailing players. The hunter already catches up at 75%, so this may need nothing — but watch it.

---

## 8 · RESOLVED QUESTIONS

**#50 — Should energy and score reward different building styles?**
Yes. **Score comes from magic bonds** (the artistry, the named combos, the recipes). **Energy comes from functional bonds** (the connective tissue). Gives the two currencies genuinely different incentives, so "eco build" and "score build" become distinct strategies. And it retires the S86 complaint that 24 of 36 combos are placeholders: they become **the economy substrate** — without designing 24 bespoke mechanics.

**#51 — Does first-come-first-served let worker count snowball?**
Less than it looks: **the bank cap already governs it.** Past a certain worker count you stall at the ceiling — extra workers only help if you're spending fast enough to keep draining the bank. Economy scaling is bounded by build rate, not worker count. Two secondary governors already exist: spawn rate scales with build events, and a distant castle pays a longer round trip.

**#68 — Does the trophy meta require a backend?**
Only partly. **Local storage is sufficient** for the trophy library, castle assembly, the cosmos, and single-device play. **A server is required** only for tier matchmaking, cross-device continuity, anti-tamper, and leaderboards. Stance: design the profile as a **serialisable blob that is server-ready from day one**, store it locally to begin with. The backend becomes a storage swap, not a rewrite. No decision needed now.

**#69 — Build the meta local-only and vs-bots first?**
Yes, as an *implementation order* rather than a scope cut. Nothing is dropped; the sequencing avoids writing auth before the loop is known to be good.

**#72 — Where does the match's rhythm come from, without waves?**
Spark already has four rhythm sources, simply not orchestrated and mostly not legible:
- **Bank fill/spend** — a natural 20–40s micro-pulse, new with the pivot
- **Score tiers** — `SCORE_TIER_STEP = 500` pulses at 500 and 1000 with the win at 1500. Already a three-act structure nobody can feel.
- **The hunter** — triggers at 75% of the win score. Already a designed late-game climax.
- **Hazards and NONET** — bomb, potato, rainbow, seagull, sudoku freeze already provide irregular interruptions.

The fix is not to invent rhythm. It's to make the existing beats **legible and consequential** — the same work as Track 0 learnability. Add castle-under-attack as the climax and the arc closes with no waves.

**#86 — What is the wire and bundle constraint, in plain terms?**
Two ceilings.
- **The wire.** The host sends the *entire game world* as JSON, 10×/second, with no compression of what changed. ~3 KB today. Add six players' worth of workers (~30 agents) and it roughly doubles. Survivable on WebRTC, but it scales linearly with every autonomous entity. *Delta encoding* = sending only what changed. An optimisation now; past a certain worker count, a prerequisite.
- **The bundle.** 640 KiB against a self-imposed 750 KiB **hard gate that fails the build**. ~110 KiB of headroom for this entire roadmap. A breach silently blocked a deploy once already, in S100.

---

## 9 · STILL OPEN

- **Fortress assembly — freeform or constrained?** Freeform gives expression; purely freeform risks looking incoherent. Reusing in-game bond mechanics is the proposed middle path; playtest decides.
- **Upgrade cost curve.** Flat, escalating, or capped determines the entire early-vs-late arc. Pure tuning, but load-bearing.
- **Elimination.** Castle destroyed = you lose, but does the player leave, or keep playing at a deficit? Early elimination + eight minutes of spectating is a known FFA killer; repair partly mitigates it.
- **Whether the player still needs a hero unit at all** once the command layer is real. Currently assumed yes.
- **NONET doubling and the leader.** May need a cap, trigger-bias toward trailing players, or nothing.
- **How tier is computed and where it lives** before a backend exists.
- **What happens to a castle when its owner is benched or eaten.** The bench gate assumes a player with no persistent world object. Now they have one.
- **Bot resource starvation (§7 Q6).** Wait vs. re-rank when the needed spark type hasn't spawned — should scale with difficulty tier. Needs settling before the Phase A bot PDR.
- **Free-spark density after the spawner shrink.** See §14 — the cap likely drops with the radius, but the number is a playtest dial.

---

## 10 · CROSS-CUTTING (not sessions — they touch all of them)

- **Host migration.** Castles, workers, banks, directives, upgrade state and targeting priorities must survive a handover. Migration is production-live as of S124/S125; every new world entity has to enter it deliberately.
- **Save/load and replay.** Every new entity needs the clear-rehydrate-advance-nextId pattern plus byte-identical replay coverage. The TD build shipped a real bug here — a persistent creature rehydrating with `despawnAtTick=0` and deleting itself instantly. Workers have the same shape of risk.
- **Bots must learn the new economy.** `botBrain` assumes a hauling avatar. After the pivot, bots need to manage workers, set directives and buy upgrades, or vs-bots playtests give a false balance reading — which matters because vs-bots is the primary mode and the S135 gate runs there.
- **Disconnect and rejoin.** A rejoining player now has a castle, a worker population and a bank to restore, not just a cursor.

---

## 11 · STANDING GATES

| Gate | Status | Needed by |
|---|---|---|
| **Deploy path** | ✅ **RESOLVED — GitHub Actions auto-deploy.** Every push to `master` ships. The manual `npm run deploy` / gh-pages path is retired; remove it so only one mechanism is live. | Before S126 |
| **Bot intelligence §7** | ✅ **RESOLVED — see below.** Q6 remains open with direction. | Before S135 |
| **Sim-worker default-on** | ✅ **RESOLVED — PASSED.** Owner playtested `?worker=1` on mobile: smooth, not janky. Flip the default and drop the flag gate in S129. *(Evidence was a phone browser, which is a fair weak-device proxy; if a weak laptop later shows problems, that configuration is what went untested.)* | S129 |

**Platform ruling (2026-07-30): PC only.** The same playtest confirmed the game is not *playable* on mobile even though the sim runs fine — a finger-driven avatar occludes a large fraction of the screen and the interface reads worse than on desktop. **Revisit after the pivot ships, not before:** the v0.6 command model is substantially more touch-compatible than a cursor-body, since tapping to issue orders to an autonomous economy is a natural touch interaction. Mobile may become viable as a side effect rather than a project.

### Bot intelligence — owner rulings

**Q1 — Difficulty ladder (owner-revised; supersedes the §3 matrix).** Four tiers, each strictly additive:

| Tier | Plays |
|---|---|
| **NOOB** | Basic combos |
| **MID** | Combos + towers |
| **HARD** | Combos + towers + raiding + godlies |
| **IMBA** | All of the above + strategy and tactical thinking (sacrifice, and further improvements) |

Note this shifts the original ladder down a step — godlies move from IMBA to HARD, and NOOB becomes a real tier rather than a degraded MID.

**Q2 — Raid targeting (owner-revised; supersedes the 1-raider cap).** HARD and IMBA bots **all** raid, and pick the smartest target: the score leader, *or* the nearest enemy whose score sits closest above their own. NOOB and MID raid randomly.

> This replaces the Council's one-concurrent-raider cap. The cap existed to stop uncapped `argmax` dogpiling the leader, which makes sandbagging in 2nd place the optimal human strategy. **The owner's rule largely dissolves that risk by construction:** "nearest enemy with the closest score above me" is a *laddered* target selection — each bot punches one rung up rather than everyone converging on first place — and the lower tiers raiding randomly distributes pressure further. Worth watching in playtest, but it is not the degenerate case the cap was guarding against.

**Q3 — Bond-sever only. Confirmed, and it is a design feature, not a limitation.** There is no "delete a primitive" verb. Removal happens by severing bonds, and `severSplit` may cascade — *which is exactly why you must build smart, so you can delete some pieces without losing the rest.* That constraint is the sculpting skill the whole pivot is built to protect. A literal delete verb would also read as the AI cheating.

**Q4 — Yes.** IMBA chases Voltkin with a fail-timer; falls back to Helga if the build isn't half-done in the window.

**Q5 — Ship order approved.** Phase A (knowledge + combos) → B (TD structures + raid) → C (lightning hub + Helga + sacrifice + personality tells).

**Q6 — OPEN, with direction.** When the arena hasn't spawned the spark type a bot's blueprint needs: wait, or switch to something buildable? Owner ruling is that it should **scale with tier** — adaptability and reaction speed are part of what separates a NOOB from an IMBA, exactly as with humans. Needs further consideration before the Phase A PDR. Working default: NOOB waits, IMBA re-ranks instantly, MID and HARD in between.

**Q7 — Yes.** IMBA checks its own blast radius and stands back; HARD occasionally clips itself. Comedy plus a real skill gap.

### Existing backlog, reconciled

**G2 family traits retires for free.** It asked for rule-based traits so all 24 placeholder combos do *something*. The energy split does exactly that. **G1b MOTION** (Wheel/Star rotation, Capsule trails) stays deferred on its existing rationale — pure visual rotation with no mechanical verb. It may earn one under the taxonomy work; if not, it stays parked.

---

## 12 · EXTERNAL PRODUCTION

### Music — 2 pieces

| Piece | Length | Form | Needed by |
|---|---|---|---|
| **Cosmos ambient** | 3–5 min | Seamless loop, no hard downbeat, sits under unhurried browsing | S142 |
| **Victory cue** | 28 s | One-shot to the six beats: 2s held breath · 3s reveal · 3s gathering · 15s procession in five clear pulses · 3s climax · 2s resolve | S141 |

The procession's five pulses want to be **audibly countable** — one per player dissolving.

### Sound effects — 4 new

- **Trophy mint** — short, fires six times during the procession. Pitching it up per rank gives the ceremony a rising line for free.
- **Trophy flight / poof** — the winner's exit into the cosmos.
- **Worker deposit** — fires constantly, so it must be quiet, short and non-fatiguing. The most easily-annoying sound in the game.
- **Bank full** — the stall signal. Must read as "spend me," not as an error.

The existing procedural Web Audio path in `audioManager` can likely cover the last two without new assets.

### Art — 1 that matters, the rest procedural

- **The castle keep** — the one genuinely important asset. A hand-designed core that trophies bond around, tinted per player colour, so a freeform assembly always reads as a fortress rather than a pile. **One asset, six tints.**
- **Worker spark** — likely the existing spark render, tinted and scaled. Probably free.
- **UI iconography** — 5 targeting-priority icons, 3 upgrade icons, 4 taxonomy markers. Vector, drawn in-engine, cheap.
- **The cosmos background** — **procedural** starfield and drift via Canvas/WebGL rather than an asset. The bundle has ~110 KiB of headroom for this entire roadmap; a background image would eat a meaningful share.

### Tooling — nothing new needed

Existing path: seed image → Veo animation → matte via `matte-*.py` → atlas or `.webm`. That produced Voltkin, Helga and the NONET art.

> **Two constraints carried forward:** **Imagen reference-conditioning is non-functional in this auth setup** — consistency comes from Veo generated from a single seed, never repeated Imagen text-gen. And **video animates on its own clock, not `world.tick`** — fine for ambient motion (cosmos, idle states), wrong for anything combat-timed, which must use the atlas path to stay replay-deterministic.

The castle keep is one seed image plus a matte; the cosmos is code.

### Production calendar

| Asset | Needed by | Blocking? |
|---|---|---|
| Victory cue — 28s | S141 | **Yes** — the cinematic is built to its cue points |
| Trophy mint + flight SFX | S141 | **Yes** |
| Cosmos ambient — 3–5 min loop | S142 | **Yes** |
| Castle keep art | S144 | Partly — placeholder ships at S130, replaced here |
| Worker deposit + bank-full SFX | S131 | No — procedural Web Audio likely covers both |
| UI iconography | S136 | No — drawn in-engine |

Everything with a hard dependency lands in Phase 3, around session fifteen. **Comfortable runway to write two pieces of music.**

---

# 13 · ROADMAP — S126 → S150

Sequenced so the core loop is **playable by S135** and everything after lands on a validated base. Each session is one priority batch in the existing pipeline; tiers follow the project's own convention.

> **Standing gate:** every session reports bundle delta against the 750 KiB charter and snapshot bytes against the wire budget. A breach fails the *session*, not the deploy — the S100 lesson.

---

## PHASE 0 — Foundation · S126–S128

*Rewrite the spec, unlock what blocks the pivot, and make playtests readable — every measurement in the next 22 sessions depends on it.*

### S126 — Blueprint v0.6 + locked-decisions unlock pass
**Blueprint half DONE (2026-07-30):** `SPARK_Blueprint.md` rewritten v0.5.1 → v0.6 with five locks revoked (no-HUD, mouse-only, carry-1-as-player-constraint, no-tutorial, no-progression) and carry-1 relocated to the worker. `LOCKED_DECISIONS.md` carries a v0.6 amendment notice flagging §2/§3/§6/§13 as affected.

**Remaining:** walk `LOCKED_DECISIONS.md` section by section and re-ratify or revoke each affected lock against evidence, replacing the header notice with settled rulings. Also **retire the manual `npm run deploy` / gh-pages path** so Actions auto-deploy is the only live mechanism.
*Tier: Design + small code (deploy cleanup) · Wire: none*

### S127 — Learnability I: make the score readable
Score and standing visible during play. Tier pulses at 500/1000 made legible. Leader state readable without scouting. The revocation of III.5 in code.
*Tier: Standard · Wire: none — data is already synced*

### S128 — Learnability II: make failure attributable
When something is severed, destroyed or stolen, the player learns what happened and who did it. Re-ratify III.4 fog and VIII.5 no-preview against evidence. Without this, "is the player bored?" is unmeasurable.
*Tier: Standard · Risk: fog is load-bearing for concealment — narrow the revocation*

---

## PHASE 1 — The economy pivot · S129–S135

*The load-bearing arc. Workers haul, you build. Everything downstream assumes this works.*

### S129 — Worker agent substrate
Narrow `botBrain`'s goal union to a `WorkerGoal` set — COLLECT, DEPOSIT, RETURN. The brain is already pure, seeded and unit-tested on synthetic worlds; this is a narrowing, not a new AI. Behind a flag, solo only.
*Tier: Full · Reuse: botBrain, botController, sim-worker determinism*

### S130 — Castle entity + worker production + spawner shrink
A castle world entity with position, ownership and a worker-emit cadence. Tick-deterministic, host-authoritative, modelled on the existing spawner-record pattern. Workers respawn from the castle on a timer — never permanent death.

**Also: `SPAWNER_RADIUS` 250 → 188 (−25%).** Six castle keeps need real estate, and the canvas is fixed at 1920×1080. Shrinking the central zone is where that space comes from. See §14 for the two constants that must move with it.
*Tier: Full · Wire: protocol bump · Reuse: creatureSpawner lifecycle*

### S131 — The bank
Capped deposit store on the castle, 8–10 slots. Deposit on worker arrival, stall at the cap. Then the build-from-bank input flow: the player draws from the bank instead of a carried spark.
*Tier: Full · Note: this is where carry-1 formally relocates*

### S132 — Directives
Per-castle collect filter — "squares only" — applied as a predicate on `pickTargetSpark`. Directive UI on the castle. Filtered workers skip non-matching primitives, so specialisation costs throughput by construction.
*Tier: Standard · Wire: directive state syncs*

### S133 — The hero unit
Player spark stops hauling. Retains sculpting, raiding, defending, potato grabs, splat cleaning. Every existing hazard interaction stays intact.
*Tier: Standard · Risk: the hazard roster assumes a hauling avatar in places*

### S134 — Energy gets sinks
Split the currencies. Score from magic bonds, energy from functional bonds. Energy buys extra workers, worker speed and respawn time. The gauge that has been decorating the screen for a year starts meaning something.
*Tier: Full · Reuse: player.energy, TICK_ENERGY, the existing gauge*

### S135 — Vs-bots integration + the boredom gate
Full loop playable against bots. Balance pass on worker count, cycle time, bank cap and upgrade costs.
*Tier: Full*

> **⛔ HARD GATE — S135.** The acceptance criterion is **"is the player bored?"**, not "does it work." Removing the hauling does not make placement fun — it *reveals* whether placement was ever fun. If sculpting does not carry the game here, Phases 2–4 are **re-planned, not continued.**

---

## PHASE 2 — Command and conflict · S136–S140

*Give the freed hands something to decide, and give the castle something to survive.*

### S136 — Structure taxonomy + targeting priority
Classify every recipe as offensive / defensive / fortress / income — already latent in shipped content, so it's recipe metadata plus a classifier. Then: click a tower, choose its priority. Bloons TD's interaction, Spark's categories. Deterministic tie-break on lowest id, host-authoritative, priority state on the wire.
*Tier: Full · Wire: protocol bump · Reuse: findNearestBondTarget family*

### S137 — Worker vulnerability + harassment
Workers become attackable; a loaded worker drops its primitive on death. Existing hazards and creatures gain workers as a legal target class. This is where competition lands after leaving the spawner.
*Tier: Full · Balance: respawn cost is the pressure valve*

### S138 — The command layer
Keyboard as commands, not a second puppet: select, order, ability hotkeys, mode switch between build and command. Explicitly not WASD puppeteering.
*Tier: Standard · Risk: mouse-only is a revoked lock — check every input path*

### S139 — Castle HP, damage and repair
The castle takes damage and can be destroyed. Damage is **repairable mid-match** by attaching connectors, if you can find or build the required shapes — giving the bank a defensive purpose and turning a beating into a comeback rather than a death spiral.
*Tier: Full · Reuse: the unified HP/damage model from S102*

### S140 — NONET rework: double the structure
Replace the score multiplier with physical duplication of the winner's structure: deterministic centroid-mirror placement respecting collisions, territory bubbles, the spawner build-ban and canvas bounds. Drop the loser ÷2. Makes the win path coherent with the cinematic S141 depends on.
*Tier: Full · **Must land before S141** · Risk: placement determinism*

---

## PHASE 3 — The compounding meta · S141–S147

*Make winning matter. This is the answer to "and then what."*

### S141 — Victory cinematic + trophy mint
The full 28-second sequence — freeze, fog lift, migration, five-beat procession, trophy formation, flight. Every player mints a fragment sized by placement. Extract via `componentOf`, serialise with the `save.ts` primitive/bond pattern, persist to a server-ready profile blob stored locally. Implements the v0.5 trophy-selection algorithm, unbuilt since it was specified.
*Tier: Full · Needs: victory cue + 2 SFX · Note: profile format is server-ready from day one*

### S142 — The cosmos
A separate space where every trophy floats freely. Ambient music, no clock, no opponent. The scene, the drift, the audio bed and the browsing interaction.
*Tier: Full · Risk: new scene = bundle pressure; measure early*

### S143 — Fortress assembly
Assemble your castle from trophies using Spark's own bond mechanics, without a clock. Structurally valid by construction, freeform in expression, teaches the core interaction in the calmest possible setting. Rearranging is intended to be a pleasure in itself.
*Tier: Full · Open: how much constraint assembly needs*

### S144 — Field your fortress
The assembled castle becomes your match start state, replacing the S130 placeholder. This is where the cold start dies and identity arrives.
*Tier: Full · Wire: castle composition syncs at match start*

### S145 — Tier as budget
Tier sets the power budget; trophies set the shape. Same tier means same power, different composition. Library permanent, tier moves with results.
*Tier: Standard · Rule: the anti-snowball guarantee*

### S146 — Bounty and dormancy
A rich castle is visibly worth more to destroy, so investment costs attention rather than property — and leader-targeting solves itself. Trophies in a lost castle return dormant for a match or two.
*Tier: Standard · Rule: stake attention and access, never the artifact*

### S147 — Trophies as blueprints
A trophy and a buildable shape are the same data structure. Sketch a blueprint ghost in-match and workers fill it in — the answer to manual placement becoming labour again at scale, with authorship intact because you drew it and earned it.
*Tier: Full · Note: the one place workers touch building, and only from your plan*

---

## PHASE 4 — Onboarding, scale, close · S148–S150

*Make it survivable for a stranger and shippable at six players.*

### S148 — First-run introduction
A 60–90 **second** guided intro shown on a machine's **first ever session only** — never in a competitive round, never repeated. Fixes comprehension, not fun; do not let it convince anyone the core is fixed.
*Tier: Standard · Trigger: first run per device*

### S149 — Wire and bundle
Delta encoding if the measured snapshot at six players with full worker counts exceeds budget. Bundle reconciliation against the 750 KiB charter, with a Council-gated raise if the roadmap's real cost demands it.
*Tier: Full · Gate: measured, not estimated*

### S150 — Balance and v0.6 close
Full six-player playtest. Tune upgrade costs, bank cap, worker cadence, castle HP, tier budgets. Close the spec, archive the roadmap, decide whether the backend is now worth building.
*Tier: Full · Exit: v0.6 shipped and playtested at six seats*

---

## AT A GLANCE

| Phase | Sessions | Delivers | Risk |
|---|---|---|---|
| **0 · Foundation** | S126–128 | Spec rewrite, unlock pass, learnability | Low — mostly revocation |
| **1 · Economy pivot** | S129–135 | Workers, castle, bank, directives, energy | **Highest** — everything depends on it |
| **2 · Command** | S136–140 | Targeting, harassment, castle HP, NONET rework | Medium — protocol churn |
| **3 · Meta** | S141–147 | Cinematic, trophies, cosmos, assembly, tier, blueprints | Medium — new scene, bundle pressure |
| **4 · Close** | S148–150 | Onboarding, wire, balance | Low — mostly measurement |

Three things run alongside and are not sessions: your friend's extra godly combo lands wherever it lands and costs nothing here; the four cross-cutting concerns are handled continuously rather than batched; and every session reports bundle and wire deltas as a standing gate.

---

---

## 14 · SPATIAL BUDGET — making room for six castles

The canvas is fixed at `CANVAS_WIDTH = 1920 × CANVAS_HEIGHT = 1080`. Six castle keeps are new persistent world objects that need real estate, and the only place to take it from is the centre.

**`SPAWNER_RADIUS` 250 → 188 (−25%).** Owner call, lands in S130 alongside the castle entity.

### Two constants must move with it

Radius is linear; **area is not**. At r=250 the zone is ~196,000 px²; at r=188 it is ~111,000 px² — a **43% loss of area**, not 25%.

- **`FREE_SPARK_SOFT_CAP = 50`** — unchanged, this raises free-spark density by roughly **77%**. The zone becomes a visibly denser churn, and worker pickup gets easier (more targets per unit of travel) while readability gets worse. **Recommend dropping the cap in step**, to ~28–30, to hold density roughly constant. Playtest dial.
- **`R_PERSONAL = 75`** — the personal vision radius was tuned by eye against the old zone size across two sessions (300 → 150 → 75). It is not mathematically bound to `SPAWNER_RADIUS`, but the *feel* of "standing in the zone and seeing it" was calibrated against 250. Re-judge on playtest; do not pre-emptively change it.

### Knock-ons to verify, not assume

- **Castle placement** must not overlap the zone, and six of them must fit around it without crowding the corners — the geographic trade-off (fast cycles near the centre vs. concealment far out) depends on there being real distance to trade.
- **`isInsideEnemyTerritory`** bubbles scale with complexity (`60 + 12·log₂(complexity+1)`). Six castles plus their territory bubbles in a smaller effective play area could make legal build space scarce late-match. Measure at six seats.
- The **spawner build-ban** (§IX.5) rejects placement inside the ring. A smaller ring means more of the canvas is legal — a small, free win for the castle layout.

---

*SPARK v0.6 · Design direction · Supersedes Blueprint v0.5.1*
