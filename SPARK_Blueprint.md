# SPARK

### A Real-Time Multiplayer Game of Geometric Emergence

**Game Design Blueprint — Version 0.6**
*2026-07-30 · Status: v0.5.1 shipped and playtested. v0.6 is the **economy pivot** — a redesign of how material reaches the player, driven by a diagnosis that the v0.5 loop is structurally unfun. Live at https://spark-online.space/*

**Companion documents:** [SPARK_v0.6_DESIGN.md](SPARK_v0.6_DESIGN.md) carries the diagnosis, the reasoning and the V6-0.1→V6-4.3 roadmap. [BACKLOG.md](BACKLOG.md) carries the canonical slot labels, ordering and the carry-forward ledger.

**This document is the specification and it governs any RULE.** (Corrected in S128: the v0.6 drafts had this document defer to the design doc while the design doc claimed precedence only over this document's *predecessor* — a circular chain in which neither was authoritative. The design doc is authoritative on *rationale*, this one on *rules*.)

> **⛔ Two blockers gate the entire economy pivot** — the material faucet and the interaction between
> directives, the bank cap and the carve-down tactic. Both need an owner ruling before §VII.3/§VII.4
> are implemented. See `SPARK_v0.6_DESIGN.md` §2 (B3, B4) and §VII.4 below.

---

## 0 · Document Status

This is the canonical specification for SPARK. Decisions marked **LOCKED** are invariant — they are load-bearing and tuning them will collapse adjacent systems. **OPEN** decisions are deliberately unresolved. **REVOKED** decisions were locked in v0.5.1 and are explicitly withdrawn here, with the evidence that withdrew them.

### v0.6 Changes (Pivot)

v0.6 does **not** change the genre. SPARK remains a six-player free-for-all race to build the most complex geometry on one shared canvas, with the same primitives, combos, godly recipes, hazards and towers. There are no waves. There is no co-op main mode. It is not a tower-defense reskin.

**What changes is where the player's hands go.** In v0.5 they hauled. In v0.6 they command, decide, and sculpt.

Seven substantive changes:

1. **Workers haul; the player builds.** A castle produces worker sparks that collect primitives autonomously on player directives and deposit them into a capped bank. The player builds from the bank. (§ VII)
2. **Carry-1 is relocated, not removed.** The rule moves from the player's hand to the worker's, and its strategic function moves to the bank cap. (§ III.3)
3. **Two currencies.** Score wins the game and is never spent; Energy buys workers and upgrades and never wins. (§ VIII)
4. **The player spark becomes a hero.** It sculpts, raids and defends. It no longer hauls. (§ VI.6)
5. **A command layer.** Per-tower targeting priority and keyboard commands. The mouse issues orders instead of doing work. (§ XII)
6. **The endgame ceremony ships.** The v0.5 victory cinematic, specified and never built, becomes the hinge between a match and the meta. (§ XIII)
7. **A persistent meta.** Trophies, the cosmos, castle assembly, tier-as-budget. Winning compounds. (§ XIV)

### Why v0.5.1 needed replacing

The v0.5 loop was measured, not guessed. At `SCORE_INCOME_PER_COMPLEXITY_PER_SEC = 0.05` and `PHASE_1_WIN_SCORE = 1500`, a player placing one primitive every six seconds needs **~346 seconds of continuous, uninterrupted, optimal placement** to win — roughly 58 haul cycles back to back, assuming no hunter, no hazard, no contested pickup and no sever.

The consequence is structural: **every second not spent placing a primitive is economically punished.** There is no room in the economy for idle time, watching, or conversation. The win score climbing 50 → 150 → 210 → 630 → 786 → 1500 across sessions was six attempts to patch one problem with the only lever available.

Full diagnosis in `SPARK_v0.6_DESIGN.md § 1`.

---

## I · Vision

A real-time, six-player canvas of geometric emergence.

You command a glowing castle on a black field. It sends out sparks that gather geometric ingredients from a contested central zone and carry them home. You take what they bring and build — bonding primitives into structures, discovering combinations, carving finished shapes down into the exact geometry that brings a creature to life.

The aesthetic is minimalist — soft glow on black, beautiful gradients of multi-player ownership, fragile structures rotating and snapping into being, hidden bases revealed only by scouting.

The lineage is *Powder Toy* meets *Townscaper* meets *Auralux*, with an RTS economy underneath and a layer of *StarCraft* fog over the top.

**The feel is deliberate.** Your hands make decisions, not deliveries.

---

## II · Core Loop

1. **Direct.** Tell your workers what to collect. Switch as your plan changes.
2. **Accumulate.** Workers shuttle to the spawner and back, filling your bank. The bank is capped — it fills whether you are watching or not, and it stalls when full.
3. **Build.** Draw from the bank and place. Bond primitives into structures. Discover combinations.
4. **Sculpt.** Carve structures down. Sever bonds deliberately to leave exactly the geometry a recipe needs. Trade score for capability.
5. **Spend.** Convert energy into economy — more workers, faster workers, faster respawn.
6. **Command.** Set tower targeting. Raid. Harass enemy workers. Defend your castle.
7. **Win** on score — or lose by having your castle destroyed.

The loop has two clocks running at once. **The economy runs on its own**, whether or not you touch it. **You run on yours** — and every decision you make is a decision, not a delivery.

That asymmetry is the entire point of v0.6. It is what makes room for planning, for watching, and for a game you can play while talking to the person next to you.

---

## III · Locked Game Rules

### III.1 — Player Count [LOCKED]

**Up to 6 players per canvas**, free-for-all. Networked play caps at 6; VS-BOTS may seat 1 human plus up to 6 bots.

### III.2 — Win Conditions [LOCKED — amended v0.6]

Two ways to end a match:

- **Score.** First player to reach `PHASE_1_WIN_SCORE` wins. Score accrues from standing structure complexity.
- **Castle destruction.** A player whose castle is destroyed loses. (§ XIV.5)

Score remains the primary path. Castle destruction gives every match a second axis — defend and expand your home *and* don't lose the race — and gives raiding a decisive target rather than an attritional one.

### III.3 — Carry Limit [LOCKED — RELOCATED in v0.6]

**A worker carries exactly 1 primitive at any time.** Never more.

v0.5 attached this rule to the *player's hand*. The reasoning was sound — it prevents hoarding, keeps the spawner contestable, makes travel meaningful, throttles build pace without a cooldown, and creates the build-vs-raid trade-off. **All of that reasoning survives. The altitude was wrong.**

Implemented as a dexterity constraint, carry-1 made the player a conveyor belt and cost ~6 seconds of manual labour per primitive. Relocated to the worker, it costs the player nothing and still throttles the economy exactly as intended.

**The strategic half of the rule now lives in the bank cap (§ VII.4).** Do not tune either in isolation — they are one mechanism in two places.

### III.4 — Vision (Fog of War) [LOCKED — amended v0.6]

The canvas is fogged. Players see:

- A **personal vision radius** around their spark (`R_PERSONAL`)
- A **vision radius around each of their own primitives** — permanent beacons (`R_BEACON`)
- **Vision around each of their own workers** — new in v0.6
- The **spawner zone**, always visible to all players

Everything else renders as solid black (never observed) or dimmed memory-fog (previously seen, last observed state).

**v0.6 note:** workers carrying vision means **your economy is your scouting network.** Fog stops being purely an information tax on the player and starts being something your economy produces for free. This resolves a long-standing tension where scouting cost build time in a game that punished every non-building second.

### III.5 — HUD [REVOKED in v0.6 — was "No HUD"]

v0.5.1 locked *no leaderboard, no score display, no minimap*, on the theory that information scarcity is strategic depth.

**Playtest falsified it.** Combined with fog (§ III.4) and no sever preview (§ IX.5), the player had no way to attribute an outcome to a decision. Action → outcome → improvement was broken in three places at once. A game you cannot get better at has no reason for a third session, and the field report was precisely that: *"you play twice and that's it."*

**v0.6 ships legible state:** score and standing visible during play, tier pulses made felt, leader identifiable, and clear feedback when something of yours is severed, destroyed or stolen — including by whom.

Fog (§ III.4) is **retained** — concealment of *position* is load-bearing for the geographic trade-off. What is revoked is concealment of *your own outcomes*.

### III.6 — No Chat [LOCKED]

All inter-player interaction is geometric and positional. No text, no voice, no emotes.

### III.7 — The Endgame Ceremony [LOCKED — specified v0.5, built v0.6]

When a match ends, a 28-second ceremony plays, and it is the hinge between the match and the meta. Full specification in § XIII.

---

## IV · The Six Sparks [LOCKED — unchanged]

The atoms of the game.

| # | Type | Shape | Behaviour |
|---|------|-------|-----------|
| 1 | **Dot** | Small filled circle | High mobility. Lightweight connector. Cheap. |
| 2 | **Line** | Thin glowing rod | Straight extensions. Directional. |
| 3 | **Triangle** | Equilateral | Rigid. Structural stability. Anti-rotation. |
| 4 | **Square** | Filled square | Flat surfaces, grids, lattices. |
| 5 | **Circle** | Hollow ring | Curves, loops, rotation. |
| 6 | **Spiral** | Tight spiral | Dynamic, chaotic growth. Modifies adjacent combos. |

**Colour encodes ownership only.** Free sparks in the spawner zone are colourless off-white; type is read from geometry alone. On placement, a primitive permanently inherits the placing player's colour. Canonical palette in `LOCKED_DECISIONS § 5`.

**v0.6 note:** a spark being *carried by a worker* is colourless in transit and takes the owner's colour on placement, exactly as before. Ownership is established by the act of building, not the act of collecting.

---

## V · Combination System

### V.1 — Order Symmetry [LOCKED]

The 8 one-way magic pairs are **order-symmetric** — connecting the same two shapes makes the same magic in either order. One intentional directional dual is retained: **Triangle → Circle = Wheel** versus **Circle → Triangle = Star**.

### V.2 — The Table [LOCKED SCOPE: 36 ordered pairs]

All 6×6 = 36 ordered pairs are defined. 14 distinct magic names across 22 magic ordered entries, plus 14 functional entries.

### V.3 — Magic vs Functional [AMENDED v0.6 — see § VIII]

v0.5 treated functional combos as connective tissue with no purpose, and the "24 placeholders do nothing" complaint ran for many sessions. **v0.6 gives them a job**: functional bonds generate **Energy**, magic bonds generate **Score**. Every combo in the table now feeds one of the two economies.

This retires the G2 "family traits" backlog item — every pair does something, without designing bespoke mechanics for each.

> **⚠ Count corrected in S128.** The functional set is **14 of the 36 ordered entries** (8 of 21
> unordered shape-pairs), not 24: `grep -c "isMagical: true" src/combos.ts` = 14 forward, +8 mirrored
> = 22 magic ordered entries, leaving 14 functional. §V.2 above already said 14 while this section
> said 24 — 144 lines apart in the same document. **The Energy substrate is therefore 42% smaller
> than the pivot advertised**, which bounds how much economy those bonds can carry.

### V.4 — Combo Discovery

Discovery is celebrated in-match (toast + counter) and recorded in the Codex across matches. Undiscovered combos render as silhouettes.

---

## VI · Build Mechanic

### VI.1 — Controls [AMENDED v0.6]

| Input | Action |
|-------|--------|
| Mouse movement | Hero spark follows cursor (smoothed) |
| Left-click + drag | **Place** — draw a primitive from the bank and position it |
| Right-click + drag | **Connect** — bond the placed primitive into a structure |
| Right-click on a bond | **Sever** (costs a charge on enemy structures; free on your own) |
| Click a tower | Open its **targeting priority** (§ XII.2) |
| Keyboard | **Command layer** — select, order, abilities, mode switch (§ XII.3) |

**"Mouse-only" is REVOKED.** v0.5.1 locked pure mouse input. That is correct for a three-minute arcade game and wrong for a ten-minute strategy game — see § XII.1 for the reasoning.

### VI.2 — Bond Creation [LOCKED]

A bond is a spring constraint with a rest length set at creation, a stiffness from the combo type, and a break threshold from accumulated stress. Bonds render as gradient lines coloured by the ownership of their endpoints.

### VI.3 — Structure Immobility [LOCKED]

Once placed, primitives do not move except under bond physics within their own structure. Structures cannot be picked up, dragged or relocated. The canvas geography is stable. (Suspended during the endgame ceremony — § XIII.)

### VI.4 — Colour Inheritance [LOCKED]

Each primitive permanently retains the colour of the player who placed it. Multi-player structures are visibly multi-toned. The visual ownership map *is* the strategic ownership map, within the unfogged area.

### VI.5 — Sculpting [LOCKED — elevated to a first-class rule in v0.6]

**There is no verb that deletes a placed primitive.** Removal happens only by severing bonds, and a sever may cascade — `severSplit` deletes the smaller resulting component.

This is a **design feature, not a limitation.** It means you must build structures deliberately enough that you can remove some pieces without losing the rest. Sculpting is a real skill with a real failure mode.

It is also the origin of the tactic that v0.6 exists to protect: **build large, then carve down to exactly the connections a recipe needs** — knowingly trading score for capability. That behaviour emerged in playtest with nobody designing it, and it is the clearest evidence available of what SPARK is actually about.

> **The pivot's first job is to make sculpting available from minute one instead of minute five.** In v0.5 you needed a large structure before you could carve one, which put the best thing in the game behind the worst thing in the game.

### VI.6 — The Hero Spark [NEW in v0.6]

The player's avatar remains in the world and changes job. It **sculpts, raids, defends, grabs the potato, cleans splats, and handles emergencies.** It does not haul.

This preserves the tactile drag-to-connect feel for the moments worth feeling, keeps every existing hazard interaction meaningful, and stops the mouse becoming a pure menu pointer.

**OPEN:** whether the hero is still needed once the command layer (§ XII) is mature. Currently assumed yes.

---

## VII · The Economy [NEW in v0.6]

### VII.1 — The Castle

Each player begins the match with a **castle** — a persistent, owned world entity with a position, hit points, and a worker-emit cadence.

The castle is assembled out-of-match from the player's trophies (§ XIV). It is the player's identity object, the thing they defend, and the visible display of their history. It is not a blank start — **from V6-3.4 ("Field your fortress") onward.** A placeholder keep ships with the castle entity at V6-1.2 and is replaced there, so a placeholder is the reality for 14 of the 25 slots. (`grep -rni castle src e2e --include=*.ts` = 0 hits today.)

### VII.2 — Workers [LOCKED]

The castle emits **worker sparks** in the owner's colour on a timer.

- Each worker hauls **exactly one primitive per trip** (§ III.3).
- Workers shuttle continuously: spawner → grab → castle → deposit → repeat.
- **Workers do not die permanently.** A killed worker respawns from the castle on the respawn timer. The cost of losing one is tempo, not attrition.
- Workers are **attackable**. A worker killed while loaded **drops its primitive**.
- Workers carry vision (§ III.4).

Workers **never build.** See § VII.5.

### VII.3 — Directives [LOCKED]

The player issues a **collect directive** to their workers — for example, *squares only*. This is the input-choice mechanism, and it replaces v0.5's uniform-random gate.

**Directive-filtered workers skip non-matching primitives**, so a specialised economy is slower than a generalist one. **Specialisation costs throughput.** That trade-off falls out of the mechanic without being designed, and it means directive-switching timing is a real skill.

> Do not "fix" this when it appears in a playtest looking like a bug.

Because the player can now steer what they receive, **godly recipes become plans instead of lotteries** — the single largest change to whether SPARK reads as strategic.

### VII.4 — The Bank [LOCKED]

Deposited primitives accumulate in a **capped bank** on the castle. Cap is ~8–10 (OPEN, § XVI).

> **⛔ PROVISIONAL — the cap is BLOCKED on an owner ruling (B4), and it must never be tuned apart from
> this table.** Every godly recipe is an **exact, isolated component** — the predicate fails if the
> component holds anything else:
>
> | Recipe | Component size | Source |
> |---|---|---|
> | Pentagram | **5** Triangles, closed 5-cycle, nothing else in the component | `godlyRecipes/pentagram.ts:4-6` |
> | Lightning hub | **6** — 1 Dot hub of degree 5 + 5 Circles | `lightningHub.ts:3-6` |
> | Princess Helga | **7** — Triangle hub + 3 Spiral + 3 Circle | `princessHelga.ts:4` |
> | Voltkin | **8** — linear Square×4 → Triangle×4, no filler | `voltkin.ts:4` |
> | Laser turret | **8** — 1 Line + 7 Spiral leaves | `laserTurret.ts` |
>
> A cap of 8–10 is **≥ every recipe**, and scoring has **no per-component term**
> (`scoring.ts:216-235`), so six isolated 5-rings score exactly what one 30-prim structure does.
> Combined with a hard type filter this makes "assemble the exact recipe directly, first try"
> rational — **which deletes the carve-down tactic §VI.5 identifies as the best thing in the game.**
> Carving was never economically motivated; it was *forced* by random types + carry-1.
> Recommended pre-probe starting point: **cap 4** (below pentagram's 5) with a **biasing** rather than
> filtering directive. Settle from the V6-0.1 probe, not on paper.

At the cap, workers **stall**. So the player must spend to keep collecting, and there is continuous pressure to commit.

**This is where carry-1's strategic function now lives** (§ III.3). Bank cap and worker count are one mechanism: it also means economy scaling is bounded by *build rate*, not worker count — extra workers only help if you are draining the bank fast enough to use them. That is the primary anti-snowball governor on first-come-first-served collection (§ X.3).

### VII.5 — The Authorship Rule [LOCKED — the load-bearing rule of v0.6]

> ### Automate the labor. Never automate the authorship.

**Workers automate hauling.** Playtests proved hauling is not fun.

**Workers never build.** Playtests proved building — specifically sculpting — *is* fun.

A worker that collects squares and assembles a Helga means the player did not build a Helga; they filled in a form and a script did the interesting part. The cinematic would fire and mean nothing.

Every future automation proposal is measured against this rule. The single exception is § XIV.7 blueprints, where the player draws the plan and workers execute it — authorship stays with the player because they drew it and earned the right to build it.

### VII.6 — Upgrades

Energy (§ VIII) is spent on the economy:

- **More workers**
- **Faster workers** (movement speed)
- **Faster respawn** (worker cycle time)

This creates the central tension of every replayable strategy game: **spend on economy, which compounds, or spend on power, which matters now.** Build order becomes a real skill.

**Cost curve is OPEN** (§ XVI) — flat, escalating or capped determines the whole early-vs-late arc.

---

## VIII · Currency [REWRITTEN in v0.6]

### VIII.1 — Two Currencies [LOCKED]

| Currency | Earned from | Spent on | Wins? |
|---|---|---|---|
| **Score** | Magic bonds, structure complexity, objectives, kills | Nothing — **never spendable** | **Yes** |
| **Energy** | Functional bonds, castle, economy throughput | Workers, upgrades, buildings, directives | **No** |

### VIII.2 — Why They Must Be Separate [LOCKED]

If victory points both win the game and buy upgrades, spending moves you away from winning. Early game, spending is obviously correct; late game, obviously wrong; and there is a **crossover point where the maths flips.** Once players find it, optimal play is a fixed script — and worse, it reimports the "every second not optimising is punished" anxiety that v0.6 exists to remove.

**The win condition is not a currency.** This is not a tuning preference; it is structural.

### VIII.3 — The Split Does Double Duty

Score from **magic** bonds, energy from **functional** bonds, means the two currencies reward genuinely different building styles — an "eco build" and a "score build" become distinct strategies rather than the same structure counted twice.

It also gives the **14** functional combos a purpose for the first time (§ V.3 — the "24" figure was wrong; see the note there).

### VIII.4 — Energy Already Exists

`player.energy` accrues at exactly **5.0/sec** (`ENERGY_PER_SECOND_FLAT`, dispatched unconditionally per player per tick at `physicsLoop.ts:107-109`), rides the wire in the protocol allowlist (`protocol.ts:463`) as a mandatory `SerializedPlayer` field, and renders as a thin right-edge gauge (`ui.ts:32-35,204-238`).

> **⚠ S128 corrections, all of which make the case stronger.** Energy has **ZERO READS**, not merely
> zero sinks: grep for `ENERGY_MAX|energy -=|spendEnergy|canAfford|ENERGY_COST` across `src/` returns
> nothing, and its only two consumers are the gauge renderer and the serializer ⇒ the consumption side
> is **pure greenfield**. It has been idle **82 days** (introduced in `bc89a53`, 2026-05-09), not "a
> year". Disruption was never *meant* to be the sink — the v0.5.1 blueprint itself specified
> build-count gating; the genuinely specified-but-unbuilt sinks were **self-sever cost** and **strong
> attraction drag**. And the gauge **clamps at `ENERGY_GAUGE_FULL = 100`** (`ui.ts:36,214`), so it pins
> full at t≈20 s and stays there for 94–97% of a match — **raise the cap or new sinks are invisible.**
> Finally, `FUNCTIONAL_BOND_COMPLEXITY` currently earns score, and removing it reverts an
> owner-driven S84 P4 decision recorded verbatim at `constants.ts:227-231`; surface that before
> implementing the split.

---

## IX · Disruption & Conflict

### IX.1 — Earning [LOCKED]

1 disruption charge per 5 build actions, capped at 2 stored.

### IX.2 — Action Types [LOCKED]

**Sever** cuts a bond; the smaller resulting component is deleted. **Inject Spiral** adds a chaos primitive. **Steal** detaches a primitive into your possession. Targeting requires the target to be visible.

### IX.3 — Sever Topology [LOCKED]

The component with fewer primitives is deleted. Tiebreaker: the side built last is deleted — the foundation survives. A cut isolating a long thin connector chain deletes the chain.

### IX.4 — Worker Harassment [NEW in v0.6]

**Workers are a legal target class** for hazards, creatures, towers and raids. A loaded worker drops its primitive when killed.

This is where competition lives in v0.6. v0.5's competition was mouse speed at the spawner; v0.6 moves it to **map control and economic pressure**, which is the correct altitude and is what the existing hazard roster already supports.

Because workers respawn, harassment is a **tempo weapon**, not an elimination one.

### IX.5 — Sever Preview [OPEN — was LOCKED "no preview"]

v0.5.1 locked *no predicted outcome before committing a sever*, to preserve a topology-reading skill ceiling.

Under review as part of the learnability revocation (§ III.5). The skill-ceiling argument is real; the problem is that it was the third of three simultaneous feedback removals. **Re-ratify or revoke on evidence**, narrowly — a post-hoc explanation of what a cut did may deliver the learning without giving away the prediction.

### IX.6 — Defensive Combos [LOCKED]

A Diamond (Tri→Tri) or Lattice (Sq→Sq) costs an attacking player their entire disruption budget to hostile-sever. Physics, creature and bomb severs bypass this — anti-sabotage is not hazard-immunity.

---

## X · Spawner & Resource Flow

### X.1 — Confined Central Spawner [LOCKED — resized v0.6]

Sparks generate at canvas centre and are confined within an invisible circular boundary, bouncing softly off it. **There is exactly one place to collect primitives.**

**`SPAWNER_RADIUS` 250 → 188 (−25%) in v0.6.** Six castle keeps need canvas real estate and the canvas is fixed at 1920×1080; the centre is where that space comes from.

> **Radius is linear; area is not.** The zone loses **~43% of its area**, not 25% (π·250² = 196,350 →
> π·188² = 111,036). Arithmetic verified exact in S128.
>
> **⚠ But `FREE_SPARK_SOFT_CAP = 50` is currently NON-BINDING and effectively dead code.** The real
> control is the faucet: `SPAWN_RATE_PER_SECOND = 0.1875` × `FREE_SPARK_TTL_TICKS = 600` (10 s) ⇒ a
> steady-state pool of **~1.9 sparks arena-wide** by Little's Law (probe-measured mean 2.2, peak 8
> over 600 s). So re-derive the cap **after** the faucet ruling (B3); at that point 28 is the
> constant-density value, not 30. `spatial.ts:3-4` already assumed "≤30 free sparks at 6P steady
> state" while the cap sat at 50.
>
> **Six further constants move 62 px inward with the radius** — `botBrain.ts:275`/`:257`,
> `gameMode.ts:109`, `creatureVerlet.ts:62`, `botSpawnerSeed.ts:48`/`:62` — **`SPAWNER_RADIUS` is also
> a fog source** (`vision.ts:59`), so the always-visible region shrinks 43% and undercuts the very
> rationale §X.5's build-ban rests on; and **four sites hardcode 250** and go stale silently
> (`e2e/bomb.spec.ts:41`, `e2e/nplayer.spec.ts:197`, `src/state/world.test.ts:191`,
> `e2e/smoke.spec.ts:483-484`). There is **no lock tripwire** on any of them:
> `constants.lock.test.ts` contains exactly one assertion, on `MEMORY_FOG_COLOR`.

### X.2 — Spawn Trigger [LOCKED]

Per-tick base rate. Type distribution is **uniform random with no rarity tiers** — steering happens through directives (§ VII.3), not through the spawn table.

> **⚠ Corrected in S128: the "bonus on player build events" was NEVER IMPLEMENTED.** `ratePerSecond` is
> `readonly` (`spawner.ts:67`), assigned once at `:74`, and read only by `sampleInterarrival` (`:353`);
> grep for `buildBonus|onBuild|SPAWN_ON_BUILD|BUILD_SPAWN` returns zero hits. It was specified in v0.5
> and cited ever since as a shipped anti-snowball governor, which it is not. `SPAWN_RATE_PER_SECOND =
> 0.1875` globally, one `Spawner` per world, pure Poisson — see §VII.4 and `SPARK_v0.6_DESIGN.md` §2 (B3).

### X.3 — Collection is First-Come, First-Served [LOCKED — new in v0.6]

Workers do not contest each other. Whichever worker reaches an eligible primitive first takes it.

Direct worker-vs-worker contest would reintroduce a micro race one level down — the same disease in a smaller font. FCFS keeps competition in the economy: **more workers, faster workers, a closer castle.**

Snowball governors: the bank cap bounds economy scaling by build rate (§ VII.4) and a distant castle pays a longer round trip. ⚠ **The "spawn rate scales with build events" governor does not exist** (§X.2), and at the shipped faucet the bank cap **cannot bind** while castle distance is a cliff rather than a gradient (B3) ⇒ **first-come-first-served currently has no working governor.** Re-opened as OPEN.

### X.4 — Sparks in Transit [LOCKED — amended v0.6]

v0.5 made carried sparks invulnerable, to avoid over-punishing travel. **v0.6 reverses this for workers**: a loaded worker can be killed and drops its primitive.

The reasoning changed with the pivot. In v0.5 the carrier was the *player*, and punishing transit punished the player's own labour. In v0.6 the carrier is an *automated agent*, transit costs the player nothing, and interception is the pressure valve that keeps an automated economy contestable.

### X.5 — No Building Inside the Spawner Zone [LOCKED]

`PLACE_PRIMITIVE` is rejected inside the spawner radius; the carry is preserved and the preview shows a no-build glyph. The zone is the one always-visible region, and building there would defeat fog-based concealment and clog the contested collection space.

---

## XI · Map & Geography

### XI.1 — Canvas [LOCKED]

1920 × 1080, black. Spawner zone at centre (§ X.1).

### XI.2 — The Geographic Trade-Off [LOCKED — amended v0.6]

| Castle position | Economy | Exposure | Concealment |
|---|---|---|---|
| **Near spawner** | Fastest worker cycles | Maximum traffic | Always discovered |
| **Mid-canvas** | Moderate | Moderate | Discovered if scouted |
| **Far corner** | Slowest cycles | Low | Hidden until scouted |

The trade-off survives the pivot intact, and gets *better*: in v0.5 "build close" saved the player's own time and effort, so the choice was partly about stamina. In v0.6 it is purely about **economy versus safety** — a strategic decision rather than an endurance one.

### XI.3 — Spatial Budget [NEW in v0.6]

Six castles are new persistent world objects competing for canvas with structures, territory bubbles and the spawner zone.

Verify at six seats, do not assume:

- Castles must not overlap the spawner zone, and six must fit around it without crowding the corners — the geographic trade-off needs real distance to trade.
- `isInsideEnemyTerritory` bubbles scale with complexity (`60 + 12·log₂(complexity+1)`). Six castles plus bubbles could make legal build space scarce late-match.
- The smaller spawner ring frees slightly more legal canvas — a small free win.

### XI.4 — Structure Vulnerability [LOCKED]

Your structures are vulnerable while you are away from them. In v0.6 you are away far more often, because your hands are on decisions rather than deliveries — which makes towers, defenders and targeting priority (§ XII.2) load-bearing rather than optional.

---

## XII · The Command Layer [NEW in v0.6]

### XII.1 — Effector versus Commander [LOCKED]

The problem with v0.5 input was never the mouse. Every great strategy game is mouse-dominant — StarCraft, Age of Empires, Civilization, Factorio.

The distinction is what the mouse *is*:

- **Commander.** You click; an agent acts. Hand speed converts into **decisions** per minute.
- **Effector.** Your avatar *is* the cursor; proximity and speed determine outcomes directly. Hand speed converts into **physical work** per minute.

Mouse-as-effector works beautifully — in Osu!, agar.io, Fruit Ninja. That genre's contract is *2–5 minute rounds, instant restart, shallow depth, pure reflex expression.*

**v0.5 used an arcade input model with a strategy game's session length and depth.** Ten-minute matches, 36 combos, recipes, topology, territory, fog, economy — and no hands left to engage with any of it.

v0.6 makes the mouse a commander.

### XII.2 — Targeting Priority [LOCKED]

**⚠ Correction (S128): towers DO auto-retarget today.** A `Defender` auto-acquires the nearest enemy **creature** on every IDLE tick (`findNearestEnemyCreatureFrom`, `defenderLifecycle.ts:159-185`), retries after `DEFENDER_REACQUIRE_TICKS = 12`, clears its target on RECOVER→IDLE and re-acquires from WINDUP. There is no priority field on `Defender` and **creatures are its only legal target class**. v0.6 therefore *replaces* an existing auto-acquire rather than adding policy to an inert tower.

Under v0.6 the player clicks a tower and sets its priority — the Bloons TD interaction, with SPARK's categories:

| Priority | Targets |
|---|---|
| Offensive structures | Enemy spawners and emitters (pentagram, lightning hub) |
| Defensive structures | Enemy turrets and defenders (laser turret, Helga) |
| Fortress | The enemy castle |
| Highest income | Whatever generates most points |
| Workers | Enemy economy |

Requires a **structure taxonomy** — offensive / defensive / fortress / income — which is already latent in shipped content; every existing recipe slots in without redesign.

Deterministic tie-break on lowest id. Host-authoritative. Priority state rides the wire.

> **⚠ Two S128 findings this section depends on.**
> **(1) Three of the five priorities have no damageable target.** `DEFENDER_HP = 1_000_000_000` is an
> explicit sentinel ("defenders die by recipe-break, not damage (v1)", `constants.ts:989`);
> `CreatureSpawner` has no `hp` field; the only damage function in the game is `damageCreature`
> (`creatureLifecycle.ts:243`); and `CONNECTOR_HP` is implemented as the *attacker's* `chewProgress`
> counter (`constants.ts:919-920`), which is not HP. **A "structure HP + `damageEntity` dispatcher"
> must precede this work, or this work must follow §XIV.5 castle HP.**
> **(2) "Highest income" has no backing data.** `computeComplexity` aggregates strictly per
> `PlayerId` (`scoring.ts:206-237`); a "filament node" is a *bond* classified by `isFilamentCombo`,
> not an entity with an income figure. Budget a per-component income scan on the host hot path, or
> drop the row.

### XII.3 — Keyboard [LOCKED]

The keyboard is a **command layer**: select, order, ability hotkeys, mode switch between build and command.

**It is not a second puppet.** Driving a defender with WASD while the mouse drives the hero means controlling two real-time avatars on two independent effector channels. No successful game does this; the ones that flirt with it (Brothers, Overcooked) do so *because* the awkwardness is the joke. Games that genuinely combine WASD and mouse — shooters, MOBAs — always drive **one** body on two axes.

---

## XIII · The Endgame Ceremony [NEW in v0.6 — specified in v0.5, never built]

When a match ends, gameplay halts and a **28-second ceremony** plays. Every duration below is a music cue point.

| Beat | Time | Behaviour |
|---|---|---|
| **Freeze** | 0:00–0:02 | Input detaches, physics pauses, score accrual stops. Held breath. |
| **Fog lift** | 0:02–0:05 | Fog and memory-fog dissolve together. The entire canvas is visible for the first and only time in the round. |
| **Migration** | 0:05–0:08 | All structures lift and drift to centre, retaining shape, colour and topology. |
| **Procession** | 0:08–0:23 | Five beats of ~3s. Players dissolve in ascending rank — 6th, 5th, 4th, 3rd, 2nd. Each dissolution **mints that player's fragment**, which flies toward their cosmos. |
| **Trophy** | 0:23–0:26 | The winner's structure dissolves too, but **halts**. The surviving subgraph is the trophy. |
| **Flight** | 0:26–0:28 | Sound effect; the trophy leaves the world for the cosmos. |

**The procession beat is parameterised** at ~3s per player — 15s at six seats, proportionally shorter for fewer. This is the single number to move if the music wants a different length.

### XIII.1 — Trophy Selection [LOCKED]

The trophy is the **most-recently-built contiguous region** of the winner's structure — grown greedily backward through `createdTick` while maintaining connectivity.

Opening technique converges across players because everyone learns the same plays. Late-game expansion is where players diverge. **The trophy therefore records what made this match yours**, not a generic opening.

### XIII.2 — Everyone Leaves With Something [LOCKED — amended v0.6]

v0.5 gave a trophy only to first place. At six players that is **one trophy per six matches** — far too slow to feed a collection meta, and it hits new players hardest: few trophies, weak castle, keep losing.

**Every player mints a fragment, sized by finishing position.** The winner's is larger by a clear margin; sixth place keeps something small.

This improves the ceremony rather than diluting it — the procession now visibly mints six trophies in ascending order of size, instead of erasing five players to spotlight one.

### XIII.3 — Ceremony State Ruleset [LOCKED]

Input disabled · structure immobility suspended · spark physics suspended · disruption inert · fog fully lifted · spawner deactivated · in-match UI faded out.

---

## XIV · The Meta [NEW in v0.6]

### XIV.1 — The Cosmos [LOCKED]

Trophies live in **their own space** — a separate view where every structure the player has ever won floats freely, with ambient music and no clock. This is where castles are assembled, taken apart, and rearranged.

This is SPARK's **third space**, and it is where a relaxed register actually belongs. That register was never going to fit inside a competitive real-time match — those are supposed to be tense. Attempting to make one mode be both relaxing and competitive is the root of what made v0.5 feel wrong. **It is two modes.**

Postgame is also the strongest retention moment available: fresh trophy in hand, emotions still up, immediate reason to play again.

### XIV.2 — Assembly [LOCKED]

Castle assembly **reuses SPARK's own bond mechanics.** The player connects trophies exactly as they connect primitives in a match, without a clock or an opponent.

Freeform in expression, structurally valid by construction, and it teaches the core interaction in the calmest possible setting. A bespoke editor would be more work and teach nothing.

**OPEN:** how much constraint assembly needs to keep results coherent (§ XVI).

### XIV.3 — Tier as Budget [LOCKED]

> **Tier sets the power budget. Trophies set the shape.**

Two players at the same tier have the **same power** and **radically different composition.** The library is a loadout, not a power level.

This is the anti-snowball guarantee. Persistent-power metas fail when winners get *stronger*; they succeed when winners get *different*.

### XIV.4 — Stakes [LOCKED]

> **Stake attention and access. Never the artifact.**

- **The library is permanent.** No trophy earned is ever lost.
- **The tier moves** with results. It is the budget you can field.
- **Bounty** — a rich castle is visibly worth more to destroy. Investing costs you *attention*, not property, and leader-targeting solves itself.
- **Dormancy** — trophies in a lost castle return unusable for a match or two.

**Permanent trophy loss is REJECTED.** It punishes the players who engage most with the best feature; it makes hoarding optimal, and a collection nobody dares field is a museum rather than a meta; loss aversion runs roughly 2:1 so symmetric risk reads as net negative; and it is tonally opposite to the game v0.6 exists to produce.

### XIV.5 — Castle Damage and Repair [LOCKED]

The castle has hit points and can be destroyed, which is the second loss condition (§ III.2).

**Damage is repairable mid-match.** The player rebuilds what was destroyed by attaching connectors, if they can find or build the required shapes.

Repair gives the bank and the workers a defensive purpose, turns a beating into a comeback opportunity, and prevents castle damage from becoming a death spiral.

**OPEN:** whether castle destruction eliminates the player or leaves them playing at a deficit. Early elimination followed by eight minutes of spectating is a known FFA failure; repair partly mitigates it.

### XIV.6 — Persistence [LOCKED]

The player profile — library, castle composition, tier — is a **serialisable blob designed server-ready from day one**, stored locally to begin with.

Local storage suffices for the library, assembly, the cosmos and single-device play. A server is required only for tier matchmaking, cross-device continuity, anti-tamper and leaderboards. **The backend therefore becomes a storage swap, not a rewrite**, and the decision can be deferred until the loop is proven.

### XIV.7 — Trophies Are Blueprints [LOCKED]

A trophy is a saved connected subgraph. A blueprint is a shape workers know how to build. **They are the same data structure.**

A trophy is therefore simultaneously a socket in your castle and a shape you can field. Late-game, the player sketches a blueprint ghost and workers fill it in.

This is the sole exception to the authorship rule (§ VII.5), and it holds because **the player drew the plan and earned the right to build it.**

---

## XV · Technical Architecture

### XV.1 — Stack [LOCKED]

TypeScript 5 strict · Vite · PixiJS v8 · Vitest · Trystero/Nostr WebRTC. Full rationale in `LOCKED_DECISIONS § 1`.

### XV.2 — Authority Model [LOCKED]

Host runs the full simulation; clients render lerp-interpolated snapshots and send INTENT envelopes upstream. Clients never simulate. Per-direction sequence numbers reject out-of-order snapshots; `parseNetMessage` validates the peer wire boundary.

### XV.3 — Determinism [LOCKED]

Seeded RNG (mulberry32), fixed 60 Hz physics with sub-stepping, tick-based cadence everywhere — **never wall-clock, never `Math.random` in reducers.** Stateless `mix32` hashing for jitter that must consume no RNG stream. Deterministic tie-breaks on lowest id. Replay tests assert byte-identical snapshots across two identically-seeded runs.

**Every v0.6 entity — castles, workers, banks, directives, upgrade state, targeting priorities — obeys this without exception.**

### XV.4 — The Wire [CONSTRAINT]

The host emits a **full-world JSON snapshot with no delta encoding.**

> **⚠ Measured in S128; the earlier "~3 KB" was a stale aside in `save.ts:419`, never a measurement.**
> **0.45 KB empty → 6.7–8.5 KB in a live 2-peer duel → 38.5 KB at six seats with a full board**
> (the repo's own S122 TD measure was 49,684 B). Per-entity: prim+bond 269.8 B, free spark 153.9 B,
> trimmed creature 106.6 B, a gatherer ~112–218 B ⇒ **+30 gatherers is +17%, not +100%.**
>
> Two further corrections. **10 Hz is a cap, not a delivered rate:** the send is frame-driven and the
> repo measured it collapsing to **2.2 Hz** under a TD-heavy sim — below what the 150 ms render-delay
> buffer needs (`constants.ts:484`). And **the host sends the full payload once per active transport
> strategy** (`transport.ts:547-565`; `iceConfig.ts:69-73` enables both `nostr` and `torrent`, with
> peer dedup on *receive* only), so upstream is multiplied, not shared.
>
> **Measure real six-seat upstream before Phase 1 commits.** Delta encoding is Phase-1-adjacent, not
> V6-4.2 cleanup. Also note the 16 KiB wire guard's "worst case" fixture
> (`save.replay.test.ts:715,776`) contains **zero free sparks**, so it under-tests by 2.35–3×.

### XV.5 — The Bundle [CONSTRAINT]

Main entry ≤ **750 KiB raw**, mechanically enforced by `scripts/check-bundle-size.mjs` as the last step of `npm run build`. Currently **640.8 KiB** — **109.2 KiB of headroom for the entire v0.6 roadmap.**

> **⚠ The gate under-measures real download (S128).** It measures the **entry chunk alone** by explicit
> design. `dist/assets/simWorker-*.js` is a further **120.1 KiB** outside the gate, so initial JS
> actually fetched is **758.1 KiB — already 8.1 KiB above the charter number** before v0.6 adds a line.
> Two perverse consequences: a slot can *lower* the gated number while download is unchanged, and every
> new sim line is paid twice on download but once on the gate. Observed growth is ~2.6 KiB/session
> (570.9 KiB at S100 → 640.8 at S127), and Phase 3's three new scenes are ~40–60 KiB — survivable
> **only** if lazily code-split. Report BOTH numbers every slot.

A breach **fails the build and blocks the deploy.** This is not a soft budget; mislabelling it as one is what kept a finished feature off production for a full session in S100.

Heavy or optional UI stays lazily code-split. Large art and audio go to `public/`, never the bundle. **The cosmos background should be procedural** rather than an asset for exactly this reason.

### XV.6 — Cross-Cutting Obligations [LOCKED]

Every new world entity must be deliberately wired in. The four headline obligations are host
migration, save/load/replay with byte-identical coverage, teardown parity at **every** site, and
disconnect/rejoin.

> **⚠ The real surface is 17 sites, not 4 (S128 audit).** Derived from `creatureSpawners` (S100) and
> `defenders` (S103); defenders touched 12 of the 17. `clear-rehydrate-advance-nextId` is uniform
> across 9 entity families in `applySnapshotCore` (`save.ts:857-1018`), so the template is unambiguous:
>
> `worldTypes.ts` World field + `nextXId` · `types.ts` branded id + `asXId` · `world.ts:318-322` init ·
> `world.ts` dispatch cases → new `state/x/xLifecycle.ts` · `save.ts` `SerializedX` + optional snapshot
> field · `save.ts:715-719` emit **sorted by id** · `save.ts:1008-1018` clear-rehydrate-advance-nextId
> **plus a post-load re-phase for any timer** (`loadRephaseDefenders`) · `save.ts:792-814` mirror-trim
> for host-only fields · **five** clear/teardown sites (`world.ts:449`/`:451`, `gameState.ts:127`/`:129`,
> `gameMode.ts:198-202`, `gameMode.ts:339-343`, `godlyActions.ts:75-80`) · `protocol.ts:101` version bump
> + `:146` changelog · `protocol.ts:538-558` `KNOWN_GAME_ACTION_TYPES_RECORD` and `:573-592`
> `CLIENT_INTENT_TYPES_RECORD` · `migrationClaim.ts:147-164` + `main.ts:2009-2018` ·
> `workerSim.ts:251-280` structuralSignature · `stateHash.ts:46-48` `HashableWorld` ·
> `benchGate.ts:50-69` `BENCH_INTENT_POLICY`.
>
> **`benchGate` is a hard forcing function:** `benchGate.test.ts` asserts set-equality with
> `CLIENT_INTENT_TYPES` in **both** directions, so every new v0.6 intent (bank draw, gatherer order,
> directive, tower priority) fails the suite until an explicit allow/deny — which is exactly where
> §XVI's "what happens to a benched player's castle" must land. Budget it as planned work, not a red test.
>
> **Two more traps.** `stateHash.ts:45-48` `HashableWorld` covers only
> tick/primitives/bonds/freeSparks/scoreProgress/scoreByPlayer — **creatures, spawners, defenders,
> bombs, hunters, potatoes, rainbows, seagulls and poops are ALL absent**, so the silent-desync oracle
> is blind to any new entity by default. And the `despawnAtTick = 0` rehydration bug is **still live
> and unguarded in three paths** (host save/load of a Voltkin, migration takeover of any creature,
> worker-sim fallback repair) because all three `CREATURE_CONFIGS` are now `persistent:false` while
> `save.ts` emits `despawnAtTick` only for chewers and defaults it to 0 — it is a present hazard, not
> an anecdote.

### XV.7 — Deploy [LOCKED — v0.6]

**GitHub Actions auto-deploy.** Every push to `master` ships to production. The manual `npm run deploy` / gh-pages path is **retired** — two live deploy mechanisms is how a finished feature sat un-deployed for a week.

### XV.8 — Platform [LOCKED — v0.6]

**SPARK is a PC game.** Mobile is not a target.

Playtest confirms the simulation runs smoothly on mobile hardware, but the game is not *playable* there: a finger-driven avatar occludes a large fraction of the screen and the interface reads worse than on desktop.

**Reconsider after the pivot ships**, not before. The v0.6 command model is substantially more touch-compatible than v0.5's cursor-avatar — tapping to issue orders to an autonomous economy is a natural touch interaction in a way that dragging a cursor-body is not. Mobile may become viable as a side effect rather than a project.

---

## XVI · Open Questions

**Economy**
0. **⛔ The material faucet** — `SPAWN_RATE_PER_SECOND = 0.1875` with a 10 s TTL yields a standing pool of ~1.9 sparks arena-wide, so the bank cap cannot bind and a type-filtered directive starves. **Owner ruling required before §VII.3/§VII.4 ship** (B3). Must be ruled jointly with match length, since score is quadratic in time.
1. **Bank cap** exact value (~8–10) — **⛔ now gated on B4**; 8–10 is ≥ every godly recipe size, which would delete the carve-down tactic. See §VII.4.
2. **Upgrade cost curve** — flat, escalating, or capped. Determines the entire early-vs-late arc.
3. **`FREE_SPARK_SOFT_CAP`** after the spawner shrink (~28–30 to hold density constant).
4. **`R_PERSONAL`** — eye-tuned against the old zone size. Re-judge on playtest; do not pre-emptively change.

**Meta**
5. **Assembly constraint** — how much structure freeform assembly needs to stay coherent.
6. **Elimination** — does castle destruction remove the player, or leave them at a deficit?
7. **Tier computation** and where it lives before a backend exists.
8. **Benched or eaten castle owners** — the bench gate assumes a player with no persistent world object.

**Combat**
9. **NONET doubling and the leader** — doubling favours whoever built most. May need a cap, trigger-bias toward trailing players, or nothing given the hunter already catches up at 75%.
10. **Sever preview** (§ IX.5) — re-ratify or narrowly revoke.
11. **Whether the hero unit is still needed** once the command layer matures.

**Bots**
12. **Resource starvation** — wait vs. re-rank when the needed spark type hasn't spawned. Should scale with difficulty tier.

---

## XVII · Anti-Bloat Charter [AMENDED v0.6]

Still in force:

- **No NEW module over 500 lines.** Refactor or split. ⚠ **Amended honestly in S128: 16 production modules already exceed 500 lines** — `main.ts` 2519, `save.ts` 1658, `audioManager.ts` 1525, `constants.ts` 1070, `controls.ts` 900, `protocol.ts` 746, `placePrimitive.ts` 699, `hostTick.ts` 637, `world.ts` 628, `gameMode.ts` 553 and others. They are **grandfathered with a scheduled split**, because v0.6 adds five new entities × the 17 registration sites (§XV.6) concentrated in exactly those files. Leaving the rule stated absolutely made it false rather than binding.
- **No frame-rate compromise.** 60 fps minimum. A feature that drops frames is the wrong feature.
- **No structure dragging during PLAYING.** Ever. (Ceremony suspends this.)
- **No external dependencies** beyond the engine and math.
- **No pay-to-win, ever.** The six sparks, the combos, the disruption mechanics and the win conditions are permanently equal across all players. Cosmetic-only monetisation if any. **Non-negotiable.**
- **No feature added** unless required by the spec or solving a real problem found in playtesting.
- **If a feature isn't used in playtesting, cut it.**

**Amended by v0.6:**

- ~~No tutorial — discovery is the tutorial.~~ **A 60–90 second guided introduction ships, shown on a machine's first-ever session only.** Never in a competitive round, never repeated. Every new player reported not knowing what to do; discovery was not teaching, it was gatekeeping. *It fixes comprehension, not fun — do not let a successful tutorial convince anyone the core loop is fixed.*
- ~~No accounts, no progression, no unlocks.~~ **The trophy meta is core to v0.6**, not a bolt-on. It remains cosmetic-and-composition only — never a power advantage (§ XIV.3).
- ~~No HUD, no in-game stats.~~ **Revoked** (§ III.5). A game that cannot be read cannot be learned.
- ~~No audio.~~ Long since shipped.

---

## XVIII · Glossary

- **Spark** — a floating geometric primitive; also a worker unit; also the player's hero avatar. Context disambiguates.
- **Primitive** — a spark placed into a structure.
- **Bond** — a spring constraint connecting two primitives.
- **Structure** — a connected component of primitives. Immobile once built.
- **Combo** — an ordered pair of spark types and its outcome.
- **Castle** — a player's persistent home entity, assembled from trophies. Produces workers, holds the bank, can be destroyed.
- **Worker** — an autonomous spark emitted by a castle. Hauls one primitive per trip. Respawns.
- **Directive** — a collect order given to workers, filtering which primitive types they take.
- **Bank** — the castle's capped store of deposited primitives. The player builds from it.
- **Hero** — the player's own avatar. Sculpts, raids, defends. Does not haul.
- **Sculpting** — deliberately severing bonds to carve a structure down to a target geometry.
- **Trophy** — a connected subgraph preserved from a finished match. Also a blueprint.
- **Endgame Ceremony** — the 28-second sequence between a match ending and the meta (§III.7, §XIII). The canonical name; "victory cinematic" and "victory ceremony" are the same thing.
- **Cosmos** — the out-of-match space where trophies float and castles are assembled.
- **Tier** — a player's power budget, moved by results. Distinct from the permanent library.
- **Bounty** — the visible value of destroying a rich castle.
- **Dormancy** — the temporary unavailability of trophies from a lost castle.
- **Topology** — a structure's connectivity pattern; the property that defends against severs.
- **Magic-14** — the 14 named magic combos.
- **Spawner zone** — the confined central region where sparks generate. Always visible to all.

---

## End of Blueprint v0.6

**Status:** Specification. Implementation roadmap in [SPARK_v0.6_DESIGN.md](SPARK_v0.6_DESIGN.md) § 13, sessions S126–S150.
**Supersedes:** v0.5.1 — seven substantive changes, see § 0.
**Revoked from v0.5.1:** no-HUD (§ III.5), mouse-only (§ VI.1), carry-1-as-player-constraint (§ III.3, relocated), no-tutorial (§ XVII), no-progression (§ XVII).
**Authority:** this document > `LOCKED_DECISIONS.md` > session-level tuning. Where `SPARK_v0.6_DESIGN.md` and this document disagree on a **rule**, THIS document governs; the design doc governs **rationale** and carries the roadmap. `BACKLOG.md` carries slot labels, ordering and the carry-forward ledger.

*"Geometry is the language. The castle is the home. The unseen is still the game."*
