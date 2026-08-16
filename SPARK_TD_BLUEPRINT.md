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

## 6. THE ROADMAP

One session per stage unless noted. Every stage ends shippable and playable — no stage leaves the
game broken, which is the specific defence against *"a million bugs along the way"*.

### ⭐ S147 — THE MATCH CLOCK (build first, and alone)

Both Council seats picked this independently, for the same reason: **if temporal state is unstable,
spatial state does not matter.**

- `MatchPhase = 'BUILD' | 'FIGHT'` + `phaseEndsAtTick`, both in `World`, both serialized + hashed,
  both registered in `FIELD_COVERAGE`.
- Derived from `world.tick` ONLY. Never `Date.now()`. 90 s = 5400 ticks at 60 Hz.
- HUD: phase name + countdown.
- Nothing else changes behaviour yet — towers still always-on, no walls. **The whole session is
  proving the sim can cycle phases deterministically, including across a host migration.**
- **Exit gate:** a differential test cycling BUILD→FIGHT→BUILD with identical hashes host-vs-worker,
  plus a migration across a phase edge.

### S148 — ZONES + CASTLE ANCHORS + BUILD LEGALITY

- Zone partition as a **per-map-layout** pure function, not one hardcoded shape: `zoneOf(pos, layout)`
  and `zoneOwner(seat, layout)`, with `layout ∈ { PITCH_2P, QUADRANTS_4P }`. The 1v1 pitch is a
  single vertical split; the 4-player board is the cross. Both must exist from the start — they are
  different maps for different player counts, not a constant to flip between.
- `castleAnchor` → derived from the zone extremity per layout: goalmouth on the pitch, outer corner
  on the quadrant board.
- Build legality: "own zone only", swapped in at the three existing refusal sites.
- ⚠ **Re-tune the economy in this session, not later.** The 2.6× haul distance will otherwise make the
  90 s build phase unfundable. Gemini flagged this as the thing the evidence does not settle.

### S149 — BORDER WALLS + GATHERER RETREAT

- Walls on interior zone borders, in the owner's colour, raised in BUILD and dropped in FIGHT.
- Gatherers path home and stow inside the castle at the BUILD→FIGHT edge; released at FIGHT→BUILD.

### S150 — CASTLE HP + THE SECOND WIN CONDITION

- Castle becomes a damageable entity on the shipped damage pipeline.
- Win = 1500 points **OR** an enemy castle destroyed. Closes the core loop — **this is the session the
  game first becomes the game in the notes.**

### S151 — CASTLE WEAPON SYSTEM

- Castle guns arm at the BUILD→FIGHT edge and engage attackers.
- Per-castle style/race hooks stubbed; stats identical across players at first, per the notes.

### S152 — TOWERS COME ALIVE + THE FOOTER BAND

- Towers dormant in BUILD, active in FIGHT.
- Per-tower **commands**: attack/defence preference + unit choice.
- **The footer build band** (all towers along the bottom, enabled by inventory) — deferred from S146
  and specified here against the real loop instead of the old one.
- The **gatherer PREFERENCE menu** (click a gatherer → `PREFERENCE: CLOSEST → TRIANGLE → …`), which is
  a UI over the already-serialized `preferredType`.

### S153 — MODES & TEAMS

1v1 · 2v2 · 4-player deathmatch · solo-vs-bots · codex.

### S154+ — BALANCE, ART, DEPTH

Per-race castle weapons, tower command depth, the everchanging-environment goal from the notes.

---

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
