# SPARK — TOWER DEFENCE BLUEPRINT & MULTI-SESSION ROADMAP

**Status:** ACTIVE PLAN · authored S146 (2026-08-16) from the owner's handwritten notes + two hand-drawn maps
**Supersedes as the forward plan:** `TOWER_DEFENSE_DESIGN.md` (Voltkin-era), the V6-1.x ladder in `BACKLOG.md`
**Decision recorded here:** **ADAPT IN PLACE — do NOT rebuild from scratch.** 3-way Council, unanimous. §3.

---

## 1. THE SOURCE — what the owner wrote and drew

Transcribed verbatim where legible, so the plan can always be checked against the original rather than
against my paraphrase of it.

### 1.1 The notes

- *"90 sec to gather & build. End of 90 sec 'build' stage you have 'fight' stage."*
- *"End of build stage gatherers enter castle (hide inside) and the castle's weapon system gets
  activated — castle attacks any enemy units that attack it."*
- *"In fight stage all towers you've built come to live and start fighting enemies and their zones
  based on their specs and commands. Commands = attack/defence preferences and unit choice based on
  the unique build of each tower."*
- *"Reach 1500 points OR destroy enemy castle."*
- *"The idea is build complex towers while using smart adaptable & dynamic tactics to win the game in
  an everchanging environment."*
- *"Fight Stage is also 90 sec (for now)."*
- *"Each castle will be unique color/style/race with unique weapon systems. At first each player's
  castle has same strength/HP/Defence/stats."*
- Modes flow chart: **1)** Multiplayer → 1v1 · 2v2 · 4 Deathmatch (all vs all) · **2)** Single player
  (solo play, try things out) vs bots · **3)** vs Bots · **4)** Codex

### 1.2 The maps — CORRECTED TWICE after owner feedback

⚠ **I misread the drawings twice and the owner corrected me both times.** Recorded as corrections
rather than quietly fixed, because the second one changes what gets built.

**Correction 1 — the castles are not on a ring.** My first reading was "castles on a ring around the
centre, which is what we already ship". Wrong. Each castle sits at the **OUTER EXTREMITY OF ITS OWN
ZONE**. The zone is **primary**; the castle position is **derived from the zone**. That is the inverse
of the shipped model, where a castle position is derived from a seat index on a polar ring with no
zone partition underneath at all.

**Correction 2 — they are two different maps, not two variants of one.** Owner, verbatim: *"in the
2 player map - 1v1 you see it kinda looks like a soccer field where the castle is where the goal
would be and in 4 player map it looks differently - it is split both vertically and horizontally so
each player has a different zone 12-3 oclock 3-6 oclock 6-9 oclock and 9-12 oclock"*.

| Map | Players | Partition | Castle sits |
|---|---|---|---|
| **Four-player board** | 4 (FFA / deathmatch) | split **both** vertically and horizontally → four clock quadrants: 12–3, 3–6, 6–9, 9–12 | at each quadrant's **outer corner** |
| **1v1 board** | 2 | **one vertical split** into two halves — a football pitch | in the **goalmouth**, mid-left and mid-right edge |

On the 1v1 board the quarry is the **centre circle** and the single border is the **halfway line**.
On the four-player board there are four border arms radiating from the quarry.

### 1.3 Later clarifications (same session, chat)

- **Each player can only build in HIS OWN ZONE.**
- **A wall in that player's colour is erected on the borders he shares with other players' zones.**
- **The walls come DOWN during the fight stage.**

That last one is the cleanest expression of the whole design: **build phase = sealed and safe, fight
phase = borders open.** It also makes the zone partition load-bearing three separate ways — build
legality, a physical barrier, and a phase-toggled object.

---

## 2. WHAT THE GAME BECOMES (target state, in one paragraph)

Four players (or 2, or 2v2) each own a quadrant of the field with their castle at its far corner and
a shared spark quarry at the centre. For 90 seconds you gather and build, sealed behind coloured
walls, spending a limitless per-shape castle inventory on towers from a bottom footer band. Then the
walls drop, your gatherers run inside the castle, the castle's own guns come online, and for 90
seconds every tower you built fights according to the attack/defence orders you gave it. Repeat. You
win by reaching 1500 points or by destroying an enemy castle.

---

## 3. THE DECISION: ADAPT, NOT REWRITE

The owner asked directly whether to rebuild from scratch — *"if we start changing things so
fundamentally maybe it will be easy to start from scratch so not to make a million bugs along the way
and then fix them"*. Put to a 3-way Council with the measured evidence below.

**GROK-PLAN: ADAPT. GEMINI-AUDITOR: ADAPT. Claude: ADAPT. Unanimous.**

### 3.1 What a rewrite forfeits

Not the game — the **invisible infrastructure underneath it**, all of it currently green and live:

| Asset | Cost to re-earn |
|---|---|
| Host-authoritative snapshot sim + WebRTC transport | months; it is the hard part of any multiplayer game |
| `stateHash` determinism apparatus + `FIELD_COVERAGE` forcing function | earned over ~10 sessions of desync hunting |
| Host migration with signed claims, allocator rebuild | S122–S125, several sessions, subtle |
| 2,425 unit tests / 157 files · 39 e2e · verified 4/4 deploy | the entire safety net for the pivot itself |
| Sim-worker path, fog of war, bots (4 tiers), codex, art pipeline | orthogonal to the pivot and all reusable |

Gemini's phrasing is the one to keep: *you would spend 90% of the time rewriting netcode and 10% on
the tower-defence pivot.*

### 3.2 The honest case FOR a rewrite (stated fairly, then answered)

The pivot changes assumptions on three axes at once — **time** (continuous → phased), **space**
(polar ring → partitioned quadrants), **entity behaviour** (static castles → armed and destructible;
perpetual gatherers → retreating gatherers). Adapting means fighting the architecture on all three
fronts simultaneously, and risks a Frankenstein codebase carrying dead continuous-economy assumptions.

**Why it loses anyway:** the three axes are *additive*, not contradictory. Nothing in the shipped sim
forbids a phase clock, a zone partition, or castle HP — those are absences, not obstacles. The
codebase has no competing implementation of any of them to unwind. Every measured conflict in §4 is
"X does not exist" or "X is derived differently", and exactly one is a genuine replacement
(`castleAnchor`).

### 3.3 The owner's real fear, addressed

*"a million bugs along the way"* is a fair fear and the correct answer is not "trust me" — it is
**sequencing**, and the 2,425 tests are precisely the thing that makes a bug loud instead of silent.
Both Council seats independently picked the same first move for the same reason. See §6.

---

## 4. CURRENT-STATE AUDIT — what is already built

Verified on disk this session, not recalled from documentation.

### 4.1 EXISTS AND FITS — reuse as-is

| System | Where | Fit |
|---|---|---|
| **Win at 1500 points** | `PHASE_1_WIN_SCORE = 1500` | the notes' exact number, already shipped |
| **Central spawn/quarry disc** | `SPAWNER_CENTER_*`, 1920×1080 field | already dead-centre, as drawn |
| **Towers** | `state/defenders/*` — per-kind FSM (IDLE/WINDUP/FIRE/RECOVER), 3 kinds, HP, targeting | the tower substrate is done |
| **Buildable recipes + click-to-build** | 6 recipes, `blueprintBuild.ts`, ignition on topology change, codex | the build substrate is done |
| **Enemy units** | `state/creatures/*` — chewers that eat structures, goblins, voltkin, drones; spawners, steering, HP, damage | the "things that attack you" substrate is done |
| **Economy** | gatherers, limitless per-type castle inventory (S146), order queue | done, and just modernised |
| **Per-gatherer preference** | `Gatherer.preferredType`, serialized + hashed; `pickGathererTarget` already prefers it at any distance | the owner's "PREFERENCE: TRIANGLE" menu is a UI over a shipped field |
| **Build refusal seam** | `placePrimitive.ts:125`, `placeFromFree.ts:173`, `blueprintLegality.stampRefusalAt` | "build only in your zone" swaps a predicate at 3 existing sites |
| **Damage pipeline** | `state/damage.ts` + creature/defender HP | castle HP plugs into it |
| **Multiplayer, bots, fog, migration, worker** | `net/*`, `bots/*` | untouched by the pivot |

### 4.2 EXISTS BUT CONFLICTS — must be replaced

| Conflict | Detail |
|---|---|
| **`castleAnchor` is a polar ring** | every keep on a circle of r=420, evenly spaced by seat index, no partition underneath. Must become **zone-derived**. ⚠ Keep-to-spawn distance goes 420 → ~1100px (a corner), i.e. **~2.6× the haul** — an economy-balance change, not a cosmetic one. ⚠ Gatherer spawn positions derived from it are **hashed host-authoritative state**. |
| **Territory is radius-influence, not a partition** | `territory.ts` computes per-player influence radii. Zones are a hard partition. The refusal *call sites* survive; the *predicate* is replaced. |

### 4.3 DOES NOT EXIST — build from scratch

1. **BUILD/FIGHT phase cycle.** `gameState` is `TITLE|LOBBY|PLAYING|WIN|POSTGAME` — no sub-phase, no match clock.
2. **Castle HP.** Castles are indestructible scenery. *"Destroy enemy castle" has no substrate whatsoever.*
3. **Castle weapon system.**
4. **Gatherer retreat / hiding inside the castle.**
5. **Zone partition + zone ownership.**
6. **Border walls that raise and drop with the phase.**
7. **Per-tower attack/defence commands.**
8. **Team/mode structure** (1v1 / 2v2 / 4-FFA).

**Score: 8 new systems on top of ~40k lines of working, tested, live infrastructure.** That is a
large but ordinary amount of building — and it is the *game* layer, which is the layer that is
supposed to change.

---

## 5. DETERMINISM RISK RANKING

The pivot's real danger is not "bugs" generically — it is **desync**, because this is a
snapshot-authoritative sim policed by a state hash. Ranked by Council:

| # | System | Risk | Why |
|---|---|---|---|
| 1 | **90 s phase clock** | **CRITICAL** | if the timer is wall-clock rather than tick-based, the host enters FIGHT while a peer is still in BUILD; the peer submits a build command the host rejects, and the hash diverges instantly. **The clock must be tick-derived and carried in the snapshot.** |
| 2 | **`castleAnchor` replacement + zones** | **HIGH** | gatherer spawn positions are hashed state derived from it, and host migration rebuilds allocators from a *mirror*. New placement must be bit-identical across host, worker and a promoted successor. |
| 3 | **Gatherer retreat** | MED-HIGH | moving live physics entities into a "stowed" state on an exact tick; a bounding box active on host but not on a peer desyncs. |
| 4 | **Border walls** | MED | phase-toggled collision geometry — same class as #3, on a bigger object. |
| 5 | **Castle weapons** | MED | projectile spawning at a phase edge must draw from a synchronized RNG stream. |
| 6 | **Per-tower commands** | LOW | the intent/snapshot path already carries order queues and blueprints; this is one more payload. |
| 7 | **Castle HP + destruction** | VERY LOW | the damage pipeline exists; this is a data-model addition. |
| 8 | **Team/mode structure** | LOWEST | lobby + targeting flags; does not touch tick execution. |

---

## 6. OWNER RULINGS — R1 THROUGH R30

### REVIEW ROUND 1

Given while reading the blueprint. These are settled.

| # | Ruling |
|---|---|
| R1 | **4-player is ALL VS ALL** — every player may attack every other. Tower behaviour comes from each tower's own **specs** + the **commands** the player gives it (attack/defence preference + unit choice). |
| R2 | **No 3-player map.** Three players use the 4-player board with one quadrant simply empty. |
| R3 | **Stages repeat forever.** Points accrue **during the FIGHT stage ONLY** — there is no point tick during BUILD. |
| R4 | When the walls drop, enemies fight and **towers come alive doing whatever their skill is**. ⚠ *"need to rework some towers to be more coherent"* — a real work item, scope TBD. |
| R5 | **Walls cannot be attacked while they are up.** Invulnerable for the whole build stage. |
| R6 | **A gatherer can never be caught outside** — they are built to come in **exactly 1 s before the walls drop**, regardless of speed upgrade. Exact mechanism to be defined later. |

### RULINGS — REVIEW ROUND 2 (the fight economy)

| # | Ruling |
|---|---|
| R7 | ⭐ **TOWERS TICK POINTS during the FIGHT stage.** This is the scoring engine, and it answers the R3 problem: score is no longer earned by building, it is earned by *owning live towers while fighting*. Destroying an enemy tower is therefore TWO blows — it removes a defender AND cuts their income. "Who is winning" and "who should I attack" collapse into the same question. |
| R8 | **"Unit choice" = TARGET PREFERENCE, per tower.** Click a built tower and set who it goes for first: a specific player (1/2/3/4), or strongest / weakest, etc. Every tower carries its own preference; defensive towers too. Gatherers already have the equivalent (`preferredType`, shipped + serialized). **NOT unit production.** |
| R9 | **Towers may strike into enemy zones if in RANGE**, per each tower's own function and specs — e.g. a laser tower near a border can hit enemy towers. Creates the core placement tension: **near the border = more reach but likelier targeted; ringing your castle = safe but reaches nothing.** |
| R10 | **All-vs-all is LAST ONE STANDING.** Others place 2nd / 3rd / last as they fall. An eliminated player may **spectate**. |
| R11 | **2v2 uses the QUADRANT board** for now; revisit after playtest. |
| R12 | **Gatherers are SAFE inside the castle** — garrison semantics, explicitly like Warcraft / Empire Earth. Shapes gathered but not yet spent simply wait in inventory for the next build stage. |
| R13 | **Towers PERSIST across cycles**, with an attrition economy: **FIX** (one click; if inventory holds the exact shapes the structure lost, it repairs automatically using them) and **SCRAP** (tear down, surviving parts return to inventory for reuse). |
| R14 | **CUT FOR NOW: potato bomb, regular bomb, poop bird (seagull), rainbow.** Simplification; restoration decided later. **Claude recommendation, pending owner nod: DISABLE (cadence → 0), do not delete** — restoring then costs one line instead of an archaeology session. |
| R15 | **Tower roster work:** the laser tower should be offensive as well as defensive, likely others too; and **add simple towers built around the archer goblin and the melee goblin** to widen the buildable selection. |

### RULINGS — REVIEW ROUND 3 (income, army, attrition)

| # | Ruling |
|---|---|
| R16 | **Points scale on TOWER COMPLEXITY**, and a damaged structure earns less **based on remaining CONNECTORS**. Explicitly: *"we keep current point per tick function"*. |
| R17 | ⭐ **PLAIN STRUCTURES AND WALLS GENERATE POINTS.** The pivot would otherwise orphan freeform shape-connecting — *"simple intershape connectors are impossible and dont do anything"*. So during BUILD a player may raise simple structures/walls from loose shapes that do nothing but **generate points and act as targets / shields for other structures**. |
| R18 | **GOBLIN TOWERS PRODUCE UNITS.** A simple ~4-connector tower; feed it shapes from inventory and it makes **1 goblin per shape**, letting leftover inventory become an army. Intended tactical split: *"some players will rather loose more points this round to build better towers next round and some will want to create moving armies to blitz"*. |
| R19 | **FIX and SCRAP are BUILD-stage only.** |
| R20 | **1500 points = INSTANT WIN** (for now). Remaining places are then ordered by score. |
| R21 | **SCRAP returns only the shapes still standing.** Destroyed ones are gone. |
| R22 | **The quarry does NOT produce during FIGHT** — build stage only. May change later. |
| R23 | Confirmed: the four hazards are **switched OFF, not deleted**. |

### RULINGS — REVIEW ROUND 4 (the army, and the castle)

| # | Ruling |
|---|---|
| R24 | **THE SHAPE YOU FEED DECIDES THE GOBLIN.** One simple tower produces up to **six** types — **swordsman · archer · shield goblin · goblin hound · suicide goblin · goblin bat rider**. Your inventory mix literally constrains your army composition. |
| R25 | **Goblins are the WEAKEST creature class**, differentiated by stat spread rather than power: shield goblin = very low attack / very high HP (still under Voltkin or HELGA); goblin hound = very fast, low defence, decent attack; goblin bat = fast, low attack, decent defence. |
| R26 | **Feed the goblin tower during BUILD *and* during FIGHT — the queue all comes out when the next fight starts.** UI: click the tower and the goblin options each show the shape they need. |
| R27 | **Creatures PERSIST across rounds unless destroyed** — but this does not override per-unit lifetimes. Owner's example: a Voltkin attacks ~20 s, then is killed or despawns, and **unless its tower is destroyed it respawns next wave under the same conditions**. So for timed units the SPAWNER is the persistent thing; produced goblins persist as units. |
| R28 | **Anti-coast LEADER SCORE-DECAY is switched OFF** (retained, not deleted). |
| R29 | **The castle is NEUTRAL: it generates NO points.** It has **HP / defence / attack**, and shapes may later be spent to raise them. Full spec deferred. |
| R30 | ⚠ **A full unit + player STAT REBALANCE is required** for the new game state. Its own session, after the mechanics land. |

### RULINGS — REVIEW ROUND 5 (command, incentive, projectiles, footer)

| # | Ruling |
|---|---|
| R31 | ⭐ **THE TOWER TAKES THE ORDERS, NOT THE GOBLINS.** You select the goblin tower that spawned a brood and set *its* attack preference; its goblins inherit it. **This is what makes multiple goblin towers worth building** — otherwise one tower would do and there would be no reason for a second. |
| R32 | **Each goblin tower also spawns 1 RANDOM goblin per round**, on top of anything you feed it. A second, passive incentive to own more towers. ⚠ **DETERMINISM:** "random" must be drawn from the seeded host RNG stream (the `mulberry32` precedent in `spawner.ts`), never `Math.random()` — a client-side draw would desync instantly. |
| R33 | **Suicide goblin = a contact bomber.** Explosive vest, detonates on contact with any target (the C&C *Generals* Terrorist as the mechanical reference). Roughly **half the blast radius** of the existing suicide-drone tower, so it stays the weaker option. *Art note: it reads as a goblin bomber — the mechanic is the reference, not the real-world styling.* |
| R34 | **Surviving goblins return INTO their tower** at the end of a fight and wait there for the next round. |
| R35 | ⭐ **BUILD THE TRAVELLING-PROJECTILE SYSTEM NOW**, as reusable infrastructure rather than one unit's feature — the owner has *"a lot more ranged units/towers in mind"*. SPARK has no shipped precedent: every attack today is instant-hit. |
| R36 | **The footer band is indexed by CONNECTOR COUNT, not a flat list of towers.** It shows just the numbers in the world's current range (4, 5, 6, 7 …); clicking a number opens the build menu for towers of that complexity. Keeps the bar clean instead of messy from the start. |

### RULINGS — REVIEW ROUND 6 (line of fire)

| # | Ruling |
|---|---|
| R37 | ⭐ **PROJECTILES ARE BLOCKED BY WHATEVER IS IN FRONT OF THEM.** SPARK is 2D with no height axis, so there is no shooting *over* anything: a projectile hits the **first thing in its path**, damages it, and **disappears**. The next shot then repeats against whatever is now in front. Enemy fire therefore has to **chew through your fence connectors and structures** before it can reach what is behind them. ⭐ **This is what makes R17 pay off twice** — plain shape-walls stop being merely point generators and become **ARMOUR**, and where you put a tower relative to your own walls becomes a real decision. |

| R38 | **FRIENDLY STRUCTURES ARE TRANSPARENT TO YOUR OWN FIRE.** A projectile is blocked only by **ENEMY** entities. Your own walls and towers can never shadow your own guns, so a defensive ring is pure upside and nobody can accidentally blind themselves. It also **simplifies the collision test** — it only ever considers enemy entities. |
| R40 | **TOWER ORDERS CAN BE CHANGED DURING THE FIGHT.** Re-targeting is a COMMAND, not a build, so "building stops" does not cover it. This is what makes the fight stage something you PLAY rather than watch, and it is symmetric with R26 (feeding the goblin tower mid-fight). |
| R39 | **GROUND UNITS ARE BLOCKED BY STRUCTURES** — a goblin or chewer must **chew through or go around**, unlike a projectile which simply stops. So a wall is a real barrier to armies as well as armour against fire. |

⚠ **THIS CORRECTS MY Q5 ANSWER, WHICH CONFLATED TWO DIFFERENT KINDS OF WALL.** There are two:
* **PHASE BORDER WALLS** — the coloured zone dividers. They exist only during BUILD and are down
  before the first shot, so they genuinely never meet a projectile. That half of Q5 stands.
* **PLAYER-BUILT WALLS AND STRUCTURES** — raised from loose shapes (R17). These **stand through the
  FIGHT and absolutely do block projectiles.** My answer missed them entirely by treating "wall" as
  one thing.

### ⭐ A.0 FINDING — THE INCOME MODEL R16/R17 DESCRIBES IS **ALREADY SHIPPED**

Verified on disk, not assumed. `state/scoring.ts` `tickScoring` has accrued per-tick income since
S76 P3:

```
scoreByPlayer[p] += SCORE_INCOME_PER_COMPLEXITY_PER_SEC (0.05) x complexity(p) / PHYSICS_HZ
complexity(p)    = #primitives + 2 x #magicBonds  (+ FILAMENT_INCOME_COMPLEXITY per Filament)
```

Point by point against the rulings:

| Ruling | Already true? |
|---|---|
| R16 income scales with complexity | ✅ literally the same word and the same formula |
| R16 damaged structure earns less, by remaining connectors | ✅ severed bonds lower complexity, so income falls continuously |
| R17 plain structures generate points | ✅ `computeComplexity` counts ALL primitives + bonds; it has never cared whether they form a recipe |

**So the scoring work is not "build an income engine" — it is "GATE the shipped one to the FIGHT
stage".** That is a phase check at one call site, not a new subsystem. It also removes the last doubt
about ADAPT-vs-REWRITE: the freeform building system the pivot looked like it would orphan turns out
to be the thing that powers the economy.

⚠ **ONE CONFLICT TO RULE ON.** S107 added an **anti-coast LEADER SCORE-DECAY** — the leader's score
gently decays as a rubber-band. Under the new design, scoring already stops for half of every cycle,
so decay may now double-punish the leader. Keep, retune, or remove — see open questions.

---

⚠ **R7 RESOLVES THE R3 PROBLEM.** The earlier note here flagged that R3 (no scoring during BUILD) left
the shipped scoring engine — which pays for PLACEMENTS — producing zero points per match. R7 replaces
that engine outright: points come from live towers ticking during FIGHT. The 1500-point win condition
now has something driving it. **What is NOT yet ruled is the RATE** (flat per tower, or scaled by build
cost) and whether a damaged tower earns less — see the open questions.

---

---

## 6B. THE ROADMAP — SESSION BY SESSION

Ordered by **determinism risk**, not by feature appeal. Every session ends shippable and playable;
none leaves the game broken. That sequencing IS the answer to *"a million bugs along the way"*.

Each entry states its **exit gate** — the thing that must be true before the next session starts.

---

### S147 · THE MATCH CLOCK  ⭐ build this first, and almost alone

Both Council seats picked this independently: *if temporal state is unstable, nothing built on top of
it can be trusted.*

- **Step 0 (subtractive warm-up):** switch OFF potato bomb, regular bomb, poop bird, rainbow — cadence
  to zero, **code retained** (R14/R23). Purely subtractive, and it removes four moving parts the clock
  would otherwise have to be proven against.
- `MatchPhase = 'BUILD' | 'FIGHT'` + `phaseEndsAtTick` on `World`, serialized, hashed, and registered
  in `FIELD_COVERAGE` (the forcing function will fail the build if I forget the projection — it
  already caught exactly that mistake this session).
- **Tick-derived only. Never `Date.now()`.** 90 s = 5400 ticks @ 60 Hz.
- Gate `tickScoring` to FIGHT (**R3 / R7 / R16**). This is a phase check at ONE call site — the income
  engine itself is already correct (see the A.0 finding): it already scales with complexity and already
  falls as connectors are severed.
- ✅ **R17 needs NO work and is recorded here so it is not mistaken for a gap.** "Plain structures and
  walls generate points" is already true — `computeComplexity` counts every primitive and bond and has
  never cared whether they form a recipe, and freeform building already ships. S148 then confines it to
  your own zone. The only open piece is whether such structures should physically BLOCK movement, which
  is folded into S149's wall work.
- Switch off the anti-coast leader decay (R28).
- HUD: phase name + countdown.
- Nothing else changes behaviour — towers stay always-on, no walls, no zones.

**Exit gate:** a differential test cycling BUILD→FIGHT→BUILD with identical state hashes host-vs-worker,
plus a host migration across a phase edge. Score is 0 during BUILD and rising during FIGHT.

---

### S148 · ZONES, CASTLE ANCHORS, BUILD LEGALITY

- `zoneOf(pos, layout)` / `zoneOwner(seat, layout)` as pure functions, with
  `layout ∈ { PITCH_2P, QUADRANTS_4P }`. **Both from the start** — they are different maps for
  different player counts (§1.2), not a constant to flip.
- `castleAnchor` → derived from the zone extremity: goalmouth on the pitch, outer corner on the
  quadrant board. ⚠ This is hashed state that host migration rebuilds from a mirror, so it must be
  bit-identical across host / worker / promoted successor.
- Build legality "own zone only", swapped in at the three EXISTING refusal sites
  (`placePrimitive.ts:125`, `placeFromFree.ts:173`, `blueprintLegality.stampRefusalAt`).
- ⚠ **Re-tune the economy in THIS session.** The haul grows ~2.6×; a 90 s build stage must still be
  fundable. This is the item Council flagged as unsettled by evidence.

**Exit gate:** a 4-player and a 2-player match both fund a first tower inside one build stage.

---

### S149 · BORDER WALLS + GATHERER SHELTER

- Player-coloured walls on interior zone borders. Up during BUILD and **invulnerable** (R5); down
  during FIGHT.
- Gatherers return home and shelter inside, garrison-style (R12), arriving **exactly 1 s before the
  drop regardless of speed upgrade** (R6) — so one can never be caught out.
- The quarry stops producing during FIGHT (R22).

**Exit gate:** no gatherer is ever outside at a wall-drop, at any speed-upgrade level.

---

### S150 · THE CASTLE BECOMES REAL — HP, GUNS, ELIMINATION, PLACINGS

⚠ **SECOND AUDIT MISS, FOUND AND FIXED.** The castle WEAPON SYSTEM had no session at all. It comes
from the notes (*"the castles weapon system gets activated — castle attacks any enemy units that
attack it"*) rather than from a numbered ruling, and my first audit only checked R-numbered rulings —
so it verified 30 rulings and still missed a headline feature. Folded in here, where it belongs:
the castle stops being scenery and becomes an entity in one session.

- Castle becomes a damageable entity on the shipped damage pipeline. **Neutral: generates no
  points** (R29).
- **Castle weapon system**: arms at the BUILD→FIGHT edge, stands down at FIGHT→BUILD, and defends
  against anything attacking it. Per-castle style/race hooks stubbed; stats identical across players
  at first, exactly as the notes specify.
- Destroying a castle eliminates that player; **last one standing wins** (R10); 1500 points is an
  **instant win** (R20); remaining places ordered by score; eliminated players may spectate.

**Exit gate:** both win conditions fire correctly, and a 4-player match produces a full 1st–4th ranking.
**This is the session the game first becomes the game in the notes.**

---

### S151 · TOWERS COME ALIVE + TARGET PREFERENCE

- Towers dormant in BUILD, live in FIGHT (R4).
- Per-tower **target preference**: a specific player, or strongest / weakest (**R1 / R8**) — reusing
  the intent/snapshot path that already carries order queues. All-vs-all means any player is a legal
  target.
- Range may cross zone borders once walls are down (R9), which is what makes placement a real decision.

**Exit gate:** a border-adjacent tower demonstrably strikes into a neighbouring zone; a castle-ringed
one demonstrably cannot.

---

### S152 · FIX + SCRAP (the attrition economy — R13)

- **FIX**: build-stage only (R19); one click; consumes exactly the shapes the structure lost.
- **SCRAP**: returns only the shapes still standing (R21); destroyed ones are gone.

**Exit gate:** fix-then-scrap round-trips conserve inventory exactly, with no shape duplication.

---

### S153 · THE GOBLIN TOWER + SIX GOBLINS (R18)

- A simple ~4-connector tower. **Feed a shape → get the goblin that shape maps to** (R24):
  swordsman · archer · shield · hound · suicide · bat rider.
- Feed during BUILD *or* FIGHT; **the whole queue emerges at the next fight start** (R26).
- Six distinct stat spreads, all weakest-class (R25); the suicide goblin is a contact bomber at
  roughly half the drone tower's blast radius (R33).
- **Each tower also spawns 1 RANDOM goblin per round** from the SEEDED host stream (R32).
- **Orders live on the TOWER, not the goblins** (R31) — which is the whole reason to own several.
- Survivors **return into their tower** between rounds (R34).
- Panel UI: goblin options, each showing the shape it costs.

⭐ **BUILD THE TRAVELLING-PROJECTILE SYSTEM FIRST, INSIDE THIS SESSION** (R35). Every attack in SPARK
today is instant-hit, so this is the one genuinely new piece of tech in the whole roadmap — and it is
INFRASTRUCTURE, not the archer's private feature: more ranged towers and units are planned, and the
laser rework in S154 will want it too. Determinism-critical (spawn tick, velocity and lifetime are all
hashed state), so it gets its own differential test before a single goblin uses it.

**Exit gate:** a projectile fires, travels, hits and expires identically host-vs-worker; all six
goblins spawn, obey their stat spread, take their tower's orders, and persist across a cycle per R27.

---

### S154 · TOWER ROSTER REWORK

- Laser tower becomes offensive as well as defensive; other towers reviewed for coherence (R15).
- Retire or rework anything that no longer makes sense in a phased tower defence.

---

### S155 · THE FOOTER BAND + GATHERER PREFERENCE MENU

Deferred from S146 deliberately, and specified here against the real loop instead of the old one.

- Bottom footer band **indexed by CONNECTOR COUNT** (R36): the bar shows only the numbers in the
  world's current range — 4, 5, 6, 7 … — and clicking one opens the build menu for towers of that
  complexity, each enabled the moment the castle inventory covers its recipe. This is what keeps the
  bar readable instead of a wall of towers from the first second.
- Castle panel = inventory only.
- Click a gatherer → `PREFERENCE: CLOSEST → TRIANGLE → SPIRAL → …` (a UI over the already-shipped,
  already-serialized `preferredType`).

---

### S156 · MODES & TEAMS

1v1 on the pitch · 2v2 on quadrants (R11) · 4-way deathmatch · single player · vs bots · codex.
Three players use the quadrant board with one zone empty (R2).

---

### S157+ · THE BALANCE PASS

The full unit + player stat rethink (R30), castle HP/defence/attack upgrades (R29), per-race castle
weapon systems, and the art the new roster needs.

## 7. WHAT THIS PLAN DELIBERATELY DOES NOT DECIDE

Flagged rather than guessed, because guessing owner rulings is how this project has burned sessions before.

1. **Is there a 3-player map**, or does 3 play the quadrant board with one zone empty?
2. **Do phases repeat indefinitely, or is there a fixed number of rounds?** The notes say the cycle
   repeats and that 1500 points ends it; they do not say whether there is a round limit.
3. **What happens to a tower built in your zone when the walls drop — can it be attacked in place, or
   do units cross to it?** Assumed: units cross.
4. **Does the score keep accruing during FIGHT, or only during BUILD?**
5. **2v2 layout** — the quadrant board with teammates in adjacent quadrants, or the pitch with two
   players per half?
6. **Is the quarry shared by everyone in the centre?** Assumed yes, as drawn (and on the pitch it is
   literally the centre circle).
7. **Can the walls be attacked while up**, or are they invulnerable until the fight stage drops them?
8. **What happens to a gatherer caught outside** when the walls drop — killed, or does it run home?

---

## 8. CARRY-FORWARD FROM S146 (not dropped)

- **CF1 — `?worker=1` click-to-build spends shapes and builds nothing.** PRE-EXISTING S144, opt-in
  only (`WORKER_DEFAULT_ON = false`), zero live blast radius. S146 **refuted** its leading theory:
  `workerSim.ts:218` sets `world.isHost = true`, `netSnapshot` does carry `defenders`, and
  `applySnapshotCore` rehydrates them unconditionally. Needs a runtime probe. **Must be closed before
  the worker flip, not before this roadmap.**
- CF3 — sweep for other specs whose seeding hides a real-path failure.
- Owner-gated leftovers now **superseded** by this plan: `CASTLE_BANK_CAP` (deleted — inventory is
  limitless), the R7 design library, energy-vs-score.
