# SPARK — CASTLE RACES & UNIQUE TOWERS: EXECUTION SPEC

**Status:** OWNER-RULED 2026-09-02 · **PARTIALLY IMPLEMENTED** · corrected S162 (2026-09-03)

> ⚠ **THIS FILE SAID "NOT IMPLEMENTED" FOR A DAY AFTER THREE OF ITS WAVES HAD SHIPPED.** Corrected in
> S162 by the documentation-drift lane S161 dispatched and never ran. Landed since it was written:
>
> | | |
> |---|---|
> | **W1-A** — the race token + wire | SHIPPED S160 (PROTOCOL 38 → 39) |
> | **W1-B** — the castle becomes its race | SHIPPED S161 P1 — six atlases in `public/art/castles/`, three states each |
> | **The selection UI** (W1-A item 5, the owner's P2) | SHIPPED S161 P5/P6 — `src/render/racePicker.ts` + `CLAIM_RACE`. §14 B3's *"cannot be a client intent"* was answered by making it a top-level `NetMessage` rather than an intent |
> | **B2** — seat elimination | SHIPPED S161 P2 — `src/state/elimination.ts`; see §14 B2 below |
> | **W1-C / W1-D** | still unbuilt — these remain the live plan |
>
> Read every "does not exist" and "not implemented" below against that table before acting on it.
**Authored:** from a live owner brainstorm, against a full audit of `src/`, the roadmaps and the handoff record
**Supersedes:** the `CASTLE_BUILD_SPACE_DESIGN.md` § ADDENDUM race table (2026-08-27) — **that table's colours were wrong** (see §5.1)
**Baseline (MEASURED 2026-09-02, not inherited):** `PROTOCOL_VERSION 38` · vitest **3353/3353 across 212 files** · typecheck clean · bundle cap 900 KiB
⚠ `node_modules/` may be absent on a fresh checkout — **run `npm ci` first** or both `typecheck` and `vitest` fail spuriously.
⚠ The handoff said 3244/204. It was wrong by 109 tests and 8 files. §10 trap 5 warned about exactly this; it caught its own author.

---

## 0. HOW TO USE THIS FILE

⭐ **THE EXECUTION WRAPPER IS `.claude/plans/2026-09-02_PDR_RACES_W1_PREAPPROVED.md`** — an
OWNER-PRE-APPROVED PDR. Design is closed, the Council is done, three review agents have already run.
**Do not re-council the design and do not re-derive the site lists.** Verifying line numbers against
your local checkout is welcome; re-deliberating is not.

This is a **spec, not a proposal**. Every ruling in §1 came from the owner directly and is not to be
re-litigated. Everything in §5 is a MEASURED statement about the current code with a `file:line`
you can check. Everything in §6–§8 is the execution ladder, in dependency order.

**Ground rules, inherited from `SPARK_TD_SESSION_SPECS.md` §0 and still binding:**
1. One session = one objective = one exit gate. Anything else becomes a carry-forward.
2. No `Math.random()` anywhere in sim code — seeded RNG only.
3. A protocol bump costs SIX edits (`LOCKED_DECISIONS.md` § S150). Do all six or the gate reddens.
4. Do not guess an owner ruling. §11 lists what is still open — **ask**.

**Before writing code, read:** `state/blueprints.ts` docblock (the import-side-effect trap),
`state/goblinKinds.ts` docblock (why shared recipe data lives in leaf modules),
`LOCKED_DECISIONS.md` § S150 (the bump checklist), and §10 of this file (the traps).

---

## 1. OWNER RULINGS — R93 THROUGH R126

Ruling numbers continue from R92, the highest on record at authoring time.
**R101–R106 govern the TECH DRAFT and live in §9**, next to the mechanics they constrain.

| # | Ruling |
|---|---|
| **R93** | **THE RACE ROSTER IS SIX, KEYED TO THE SIX PLAYER COLOURS.** Crimson = vampires · Cyan = nagas · Yellow = mummies · Green = zombies · Orange = orcs · Magenta = demons. ⚠ Ghosts and ice giants were displaced when the owner assigned nagas and orcs; **R114 later deleted them outright.** |
| **R94** | **R88 NARROWED — STATS IDENTICAL, DELIVERY DIFFERS.** Every castle starts at `CASTLE_MAX_HP = 1500` with identical DEF / ATK / range / cadence. Owner: *"it won't be fair if one castle is seven hundred, especially in the beginning."* Races differ in **how the attack looks and travels**, not in what it does. |
| **R95** | **THE TOWER ROSTER IS ADDITIVE.** Owner: *"there's already the current global towers that everyone can build, but we're adding race towers too which are unique to the player's race."* Every race builds all 7 existing towers. Race towers are EXTRA, and visible only to their owner. |
| **R96** | **CASTLE UPGRADES ARE BOUGHT WITH VICTORY POINTS. ⚠ THIS AMENDS R29.** R29 said *"shapes may later be spent to raise them"*; the owner's 2026-09-02 wording is *"if you use your victory point to upgrade that."* Victory points win, following the gatherer precedent (`GATHERER_PRICE` / `GATHERER_SPEED_UPGRADE_PRICE` are paid the same way). Recorded as an amendment, not a silent drift. |
| **R97** | **THE TWO-LAYER UPGRADE MODEL.** Layer 1 = a universal ladder (HP 1500 → ~5000, plus DEF / ATK / range), **identical prices, steps and caps for every race**. Layer 2 = a race branch, unique per race. ⛔ **A race upgrade may modify behaviours and race-specific units — NEVER a Layer 1 axis.** See §3. |
| **R98** | **WAVE SIZING: ONE SIGNATURE TOWER PER RACE FIRST.** Owner: *"I do accept starting with one unique tower per race (in the beginning)."* Six towers, not thirty. The full per-tier grid is Wave 3. |
| **R99** | **ZOMBIES AND MUMMIES MUST NOT CONVERGE.** Both are shambling undead. Zombies = NUMBERS (cheap, fast, disposable — the hound is a pack animal). Mummies = DURABILITY AND DECAY (slow, tanky, curse/debuff). Same stat ceiling, opposite feel. |
| **R100** | **WHITE IS NOT AVAILABLE AS A PLAYER COLOUR.** `0xe6e6f0` (near-white) means UNOWNED — it is what free shapes are painted. A white castle would read as neutral rubble. `SPARK_COLORS[Dot] = 0xffffff` is the primitive-type LEGEND palette and does not tint anything on the board (`LOCKED_DECISIONS.md:329`). |
| **R107** | **THE CASTLE EMITS ITS RACE UNIT FREE, ON A TIMER** (~30 s, a dial). ⚠ The owner **reversed himself mid-answer** and this is the later, final version: he first said the castle must be FED like the goblin tower, then *"you know what? maybe we'll do the opposite… your castle always generates spawn, and the tower can [make more]."* Recorded as a reversal so the earlier reading is not resurrected from the transcript. |
| **R108** | **THE RACE TOWER IS TIER 3 AND IT IS FED, goblin-tower style.** A new tier BELOW the current floor — *"we don't have tier three. we start from tier four."* It produces **the same unit the castle emits**, on demand, by being fed. Owner: *"that's easy to implement"* — and it is, because `goblinTowerFeed.ts` is the working precedent. |
| **R109** | **ONE FEED SHAPE PER RACE, TAKEN FROM THE PRIMITIVE COLOUR LEGEND.** Owner: *"we already have on the bottom left all the primitives with their colors, so just take from that."* Matching `SPARK_COLORS` to `PLAYER_COLORS` by hue gives the map in §2. ⚠ **Orange→Dot is forced by elimination**, not by hue — there is no orange primitive, and Dot (white) is the only shape left. |
| **R110** | **A RACE IS EXCLUSIVE — ONE PLAYER PER RACE PER MATCH.** First to choose locks it. Owner's reason, and it is the right one: *"the only way to differentiate them is the colors… it'll be hard to know who's who."* Revisit only if players ever get a second identity marker. |
| **R111** | **THE GENERAL DRAFT TRACK WALKS THE FOUR STAT AXES**, in this order: wave 5 = ATK · wave 10 = DEF · wave 15 = HP (of spawned units) · wave 20 = PEN. Magnitude settled by R118. |
| **R112** | **BUILD ONLY WAVE 5 FIRST.** The race perks for waves 10/15/20 are deliberately deferred: *"let's first do level five, and then as we go… Claude can ask me, okay what is for the next tier."* **This is a named trigger, not an oversight** — ask once wave 5 ships. |
| **R113** | **BUFFS RENDER BESIDE THE PLAYER NAME**, one icon per drafted wave, stacking left to right — *"player one, this is the buff he got for this, this is the buff he got for level ten."* Each buff needs its own generated icon. |
| **R114** | **GHOSTS AND ICE GIANTS ARE OUT** — not parked. *"There's no more ghost and ice giants."* A 7th/8th colour is possible someday (*"we might add thirty colors, who cares"*) but is explicitly NOT now. |
| **R116** | **THE SIX RACE UNITS ARE NAMED** — see §2. Vampires: bats · Nagas: **porpoising piranhas** · Mummies: **Egyptian scarab beetles**, brightly coloured · Zombies: the hound · Orcs: an **orc warband** grunt with twin axes · Demons: **soul eaters**, dementor-like spirits. |
| **R117** | ⛔ **ASYMMETRIC UNIT STATS AND CADENCES WERE CONSIDERED AND REJECTED — by the owner, on the spot.** He floated a big slow troll (*"twice bigger looking… two times stronger… but he spawns only once per turn"*) balanced against three of a smaller unit, then killed it himself: *"actually that's too complicated because we said there's gonna be a tiered building on each one that will also build those."* **All six race units share ONE stat line and ONE cadence.** He is right, and the reason is exact: the tier-3 tower makes the same unit on demand, so a per-unit spawn-rate balance would be trivially bypassed by building more towers. |
| **R119** | **THE TIER-3 TOWER IS THREE OF THE RACE'S OWN SHAPE, CLOSED IN A TRIANGLE.** Owner: *"each race's tower will be built of his own shapes… three circles interconnected in a triangle, and it will build the zombie hound tower."* So the recipe shape and the FEED shape are the same primitive — the tower is visibly made of what it eats. Each node degree exactly 2, the `pentagram` ring pattern at n=3. ⚠ See §7 for the one recipe collision this creates. |
| **R120** | **THE CASTLE PRODUCES IN BOTH PHASES, AND THE UNITS SHELTER.** Owner: *"every thirty seconds it produces, and they hide inside the [castle], and then they get released during fight stage. And it keeps producing during fight until fight is done, and then they go back."* ⭐ **Both halves of this cycle ALREADY SHIP** — `GathererState 'SHELTERED'` (S149 P2) and `recallArmies` (S154 P4, owner A3). This is a third rider on two proven mechanisms, not new tech. |
| **R121** | **A SUBMERGED NAGA CANNOT BE TARGETED — a stated exception to R117.** Owner: *"maybe not. that's a cool thing to add… so it won't really affect [melee] because when units bite each other they're all during fight mode. Only whether can they be hit by towers when they move."* ⚠ **This IS a real advantage** and R117 says units are equal — so it is recorded as THE ONE exception, and it is bounded by its own cost: a naga is submerged only while MOVING (~40% of transit) and must SURFACE to attack, so it cannot deal damage while immune. See §7.3. |
| **R122** | **THE TIER-3 TOWERS GET THEIR OWN DRAWN ART**, one per race, appropriate to that race. Not just the three coloured primitives. **+6 to the art manifest.** |
| **R123** | **RACE UNITS LIVE UNTIL KILLED. NO TIMER, NO PER-PLAYER CAP.** Owner: *"they don't need an expire timer, that's stupid — just live until killed."* Survivors **always** return home and shelter, exactly as goblins and chewers do today. **The governor is FIGHT ATTRITION, not a ceiling** — owner: *"what stops an army growing forever? the enemies having also armies growing forever. so they kill each other."* The `persistent: true` model, same as `GOBLIN_MELEE_CONFIG`. |
| **R124** | **THE CAP LIVES ON THE TOWER, NOT THE PLAYER.** A tier-3 tower holds ~10 of its race's unit, on the goblin-tower precedent — *"then they'll make people build multiple of those."* The **castle** emitter is uncapped and keeps producing regardless. `[CLAUDE — overridable]` 10, matching `GOBLIN` exactly rather than inventing a second number. |
| **R125** | **THE RACE UNIT STAT LINE IS 1 / 1 / 1 / 1** — 1 HP, 1 DEF, 1 ATK, 1 PEN, identical for all six races (R117). Owner: *"it should be really simple… even weaker than a pencil chewer… it's only three connectors worth."* **Verified against the live roster in §9C — the numbers do what he intended.** |
| **R126** | **WAVES 10/15/20 SHIP THE GENERAL OPTION ONLY, until the race perks are decided.** Owner: *"we can do placeholders… have them already produce the general one and a placeholder [race] which is nothing."* ⚠ Built as a **single-option draft**, not a two-option draft with a dead button — see §9.5. |
| **R118** | **A DRAFT OPTION GRANTS +1 POINT ON ITS AXIS.** The owner proposed *"instead of ten percent we'll do twenty percent"* — and on DEF and PEN he is **exactly right**: the ladder is `1 + 0.2n`, so +1 point IS +20%, with no rounding anywhere. On HP and ATK a percentage is a category error (they are integer counts, not scales), and +1 point is the smallest step that exists. Full derivation in §9.8. |
| **R127** | ⭐ **A DESTROYED CASTLE ELIMINATES ITS PLAYER, WHO STAYS AS A SPECTATOR UNTIL ONE REMAINS.** Owner, 2026-09-02, ruling on B2: *"when a castle is destroyed a player cant gather anymore primitives so yes he is out! but he should stay as spectator until there is one player left!"* Three parts, and the FIRST is the mechanism the other two follow from: **losing the castle severs the economy** — no more gathering, so no more primitives, so nothing can be built. The seat is out. The match CONTINUES for everyone else and ends on last-one-standing. ⛔ **This SUPERSEDES the shipped behaviour**, where the first castle to reach 0 HP ends the match for EVERYONE and awards victory to `survivors[0]` — first in Map iteration order, i.e. arbitrary among three survivors in a 4-player FFA. ⚠ It also makes every 4-player scenario in this spec reachable for the first time (§9B case 1, §9.5, §9.6 all assume surviving seats). Scope: a new eliminated state on `Player`, the gatherer/build gates, a disposal policy for the fallen seat's spawners / defenders / creatures / gatherers / bank, a spectator camera, and placings (1st-4th) — R10/R20 already ask for the ranking. |
| **R115** | **VAMPIRE CHEWERS LOOK VAMPIRIC** — red teeth and/or blood dripping where they walk. The chewer renderer must therefore know its owner's race. Render-only (race already rides on `Player`), and **scoped to vampires only** — this is not a licence to re-skin every shared unit per race. |

### Standing rulings this spec depends on (do not re-derive)

- **R45** (`constants.ts:59-72`) — `PLAYER_COLORS` stays at 6 while `MAX_PLAYERS` is 4, because *"we'll make each color a class/race and give players an option to choose... during pregame lobby stage be able to chose your color."* `PLAYER_COLORS[seat]` is **only ever a default**; the authority is `Player.color`.
- **R88** — all castle races share one stat line (as narrowed by R94).
- **R29** — the castle is NEUTRAL and generates no points; it has HP / DEF / ATK (currency amended by R96).
- **R41** — `MAX_PLAYERS = 4`, `MAX_BOTS = 3`.
- **R66** — the footer chip number is the SHAPE count (`blueprintCost`), not the bond count. Do not re-bucket.

---

## 2. THE RACE ROSTER — LOCKED

| Colour | Hex | Race | Race unit | Feed shape (R109) | Art status |
|---|---|---|---|---|---|
| Crimson | `0xff3b6b` | **Vampires** | **Bat** | **Triangle** `#FF3B3B` | ✅ `castle-vampires-atlas.png` + anim (S161 P1) |
| Cyan | `0x3bd7ff` | **Nagas** | **Piranha** — porpoises in and out of the ground | **Square** `#3B5BFF` | ✅ `castle-nagas-atlas.png` + anim (S161 P1) |
| Yellow | `0xffe23b` | **Mummies** | **Scarab beetle** — Egyptian, brightly coloured | **Line** `#FFE066` | ✅ `castle-mummies-atlas.png` + anim (S161 P1) |
| Green | `0x44ff5e` | **Zombies** | **Zombie hound** | **Circle** `#3BFF7A` | ✅ `castle-zombies-atlas.png` + anim (S161 P1) |
| Orange | `0xff8c1a` | **Orcs** | **Warband grunt** — twin axes, goblin-shaped role | **Dot** `#FFFFFF` | ✅ `castle-orcs-atlas.png` + anim (S161 P1) |
| Magenta | `0xd73bff` | **Demons** | **Soul eater** — dementor-like drifting spirit | **Spiral** `#A23BFF` | ✅ `castle-demons-atlas.png` + anim (S161 P1) |

⛔ **All six units share ONE stat line and ONE spawn cadence (R117).** Their DIFFERENCE is entirely in
look and movement — which is where the naga's porpoising and the soul eater's drift do real work.

**Each race has ONE unit.** The castle emits it free on a timer (R107); the race tower is fed that
race's shape to make more of it (R108). Same unit from both sources.

Default seat assignment (`buildMatchRoster`, `net/lobbyRoster.ts:126`) hands out
`PLAYER_COLORS[denseSeat]`, so today it only ever reaches seats 0–3. **The selection screen (W1-A)
makes all six reachable** — that is what it is for. `PLAYER_COLORS[seat]` stays a default only (R45).

### The orc / goblin overlap — RESOLVED, recorded so it is not re-opened

Goblins are a **global** unit: every race builds the goblin tower and feeds it shapes to get six
goblin kinds (`state/goblinKinds.ts` `GOBLIN_FEED_MAP`). Ruling: **goblins are mercenaries anyone
hires; orcs are a separate, heavier warband.** The orc race tower and passive spawn are orc-specific —
no goblins. ⛔ Do NOT rename the global goblin tower to something race-neutral: `GodlyId` is a
serialized literal, all six `CreatureType` goblin literals are serialized, and six sprite atlases are
already on disk under `public/godly/goblin-*`. A rename is a protocol bump for zero gameplay gain.

### What each race gets, across all waves

1. **A castle** — per-race art, replacing the placeholder battlemented box in
   `render/gathererRenderer.ts` `drawKeep()`.
2. **Three castle states** — attacking / damaged / destroyed. Three, not one.
3. **A free passive spawn** (R107) — the castle emits the race's unit on a ~30 s timer, no feeding.
   This is the single highest-value mechanical differentiator and it is ONE unit per race.
4. **A distinct attack delivery** — see R94 and §3.2.
5. **One tier-3 tower** (R108) — fed the race's shape, makes more of the same unit. Then one per
   tier (Wave 3).
6. **A race upgrade branch** (§3.3).
7. **Per-race gatherer silhouettes** — render-only, zero wire cost, cheapest identity win available.
8. **Race-flavoured shared units where the owner names one** — currently vampires only, whose chewers
   get red teeth / blood trails (R115). Scoped deliberately; not a per-race re-skin of everything.

---

## 3. THE BALANCE ARCHITECTURE — the load-bearing part of this whole document

### 3.1 The constraint

Every castle starts at `CASTLE_MAX_HP = 1500` (`constants.ts:1504`) with the same DEF / ATK / range /
cadence. Nothing anywhere may key a castle stat off `raceId`. This is R88 as narrowed by R94, and it
is the reason the owner accepted races at all: *"it won't be fair if one castle is seven hundred."*

### 3.2 ⚠ ATTACK SHAPE IS A BALANCE LEVER EVEN AT IDENTICAL NUMBERS

A cone that clips three goblins is strictly better than a bolt that hits one, at the same damage
constant. So R94's "delivery differs" is split by wave, deliberately:

- **Wave 1 — cosmetic only.** Same targeting (nearest enemy creature in range), same numbers,
  different **VFX and animation**. A vampire castle drinks; a mummy castle exhales dust; an orc
  castle hurls. Zero balance risk, full flavour payoff.
- **Balance wave — real geometry.** Chain / cone / AoE / arc-lob, tuned against **measurement**, per
  the standing project lesson that unplaytested tuning ships wrong
  (`SCORE_INCOME_PER_COMPLEXITY_PER_SEC` went 0.15 → 0.05 for exactly that reason).

⛔ Do not let a Wave 1 "cosmetic" change quietly alter target acquisition, damage, range or cadence.
If the VFX needs a different hit test, it is not cosmetic and it belongs in the balance wave.

### 3.3 The two-layer upgrade model (R97)

**Layer 1 — THE UNIVERSAL LADDER. Identical for all six races.**

| Axis | From | Toward | Notes |
|---|---|---|---|
| Castle HP | 1500 | ~5000 (owner's figure, a dial) | |
| Castle DEF | base | capped | feeds the `state/stats.ts` fifths ladder |
| Castle ATK | base | capped | |
| Castle range | base | capped | |

Same prices, same step sizes, same caps, for everyone. **Nothing in Layer 1 is race-aware.**
Follow the gatherer shape exactly: a price constant, a max-level constant, one level per axis per
seat, and the "a disabled control must say why" contract (`GATHERER_SPEED_UPGRADE_PRICE = 50`,
`GATHERER_MAX_SPEED_LEVEL = 5`, `render/castlePanel.ts`).

**Layer 2 — THE RACE BRANCH. Unique per race.**

Zombies buy hound spawn rate. Vampires buy lifesteal on the castle's attack. Nagas buy something
aquatic/constricting. Mummies buy decay aura strength. Orcs buy warband size. Demons buy something
infernal. *(The specific branch contents are §11-open — ask the owner.)*

> ⛔ **THE RULE THAT MAKES THIS SAFE: a race upgrade may modify behaviours and race-specific units,
> and may NEVER modify HP, DEF, ATK or range.**
>
> The moment zombies can buy +HP that vampires cannot, the ceilings diverge and R88 is dead. This is
> the single constraint most likely to be violated by a well-meaning "just one small bonus" edit, so
> it gets a test of its own: **assert that no `raceId` reaches any Layer 1 stat computation.**

### 3.4 ⭐ THE CURRENCY TENSION IS DELIBERATE — name it, do not "fix" it

Victory points (R96) are also the **win condition** — the match ends at 1500 points. So every point
spent on castle HP is a point not spent on winning. Upgrading is a real trade: turtle harder, or race
to 1500. **This is the intended loop, not a bug.** If a future session finds "upgrading feels like it
costs you the game", that is the mechanic working. Re-tune the prices, do not sever the link.

---

## 4. THE ONE-TOKEN IDENTITY MODEL

**Race is primary. Colour is derived.**

```ts
// src/state/races.ts — NEW leaf module. Side-effect-free, Pixi-free, World-free.
export type RaceId = 'vampires' | 'nagas' | 'mummies' | 'zombies' | 'orcs' | 'demons';
export const ALL_RACES: readonly RaceId[] = [...];
export const RACE_COLORS: Readonly<Record<RaceId, number>> = { ... };  // exhaustive, tsc-forced
```

**Why race-primary and not a `race` field beside `color`:** mapping an exact hex back to a race is
fragile, and a second field indexing the same identity is precisely the pattern this codebase already
rejects in writing (see the `Player.castleHp` docblock: *"a seat-keyed map would be a second index of
something the players map already keys"*). One token. `Player.color` becomes
`RACE_COLORS[player.raceId]`.

**Why a NEW leaf module and not an addition to `constants.ts`:** so that reducers, renderers and the
lobby can all import it without dragging a registration side effect across the codebase. This is the
`state/goblinKinds.ts` precedent, and that file's docblock explains what happens when it is ignored
(the `?worker=1` bots match never left TITLE, 198 polls throwing at boot, and *nothing about the file
that caused it looked wrong*).

**`Record<RaceId, …>` everywhere, never an array literal of ids.** A `Record` is
exhaustiveness-checked by tsc; an array is not. See §10 trap 1 for what that has already cost.

---

## 5. CURRENT-STATE AUDIT — measured, with citations

### 5.1 ⚠ THE EXISTING RACE TABLE IS WRONG AND MUST BE CORRECTED IN PLACE

`CASTLE_BUILD_SPACE_DESIGN.md` § ADDENDUM (2026-08-27) names white / green / red / blue / purple /
yellow. **The game has no white and no blue.** The palette (`constants.ts:50-57`) is Crimson, Cyan,
Yellow, Green, Orange, Magenta. The addendum also left orange unmapped and yellow unnamed.

**Action for the executing session:** replace that table with §2 of this file, in place, with a note
saying it was corrected and why. Do not delete the addendum — its "what each race gets" list and the
R88 quote are still good.

### 5.2 EXISTS AND FITS — reuse as-is

| Asset | Where | Why it fits |
|---|---|---|
| Colour-is-not-seat seam | `constants.ts:59-72`, `net/lobbyRoster.ts` | R45 already declares `PLAYER_COLORS[seat]` a default and `Player.color` the authority. **The seam is already cut.** |
| Recipe registry | `state/godlyRecipes/index.ts` | `registerRecipe` → `Map<GodlyId, GodlyRecipe>`, three kinds (`cinematic` / `spawner` / `defender`). New towers are purely additive. |
| Footer band | `render/footerBandModel.ts` | Buckets on `blueprintCost`, so a new TIER chip appears with no edit. ⚠ **Derived from `ALL_BLUEPRINT_IDS`** via `castleStructuresModel` (`castlePanel.ts:291`), NOT from the recipe registry — a new TOWER still needs the hand-written array edit (trap 1). |
| Castle panel | `render/castlePanel.ts` | Built around a `PanelControl` **descriptor list** precisely so structures get their own upgrade rows later — its docblock quotes the owner saying so. Also already enforces *"a disabled control must say why"*, so "NEED 250" comes free. |
| Stat ladder | `state/stats.ts` | Three families (units / towers / connectors), HP-DEF-ATK-PEN as **integer fifths** — exact, no floats reach the damage path. Per-race numbers plug straight in when the balance wave allows them. |
| Bot setup overlay | `render/botSetupOverlay.ts` | Title-screen overlay, **no new `GameState`**, click-to-cycle rows. This is the exact pattern to copy for race select. |
| Per-seat state on `Player` | `game/player.ts` (`castleHp`, `raidPoints`) | Established precedent with the reasoning written down. `raceId` and upgrade levels belong here. |

### 5.3 DOES NOT EXIST — build from scratch

| Missing | Consequence |
|---|---|
| Any race concept in code | `grep -rn "raceId\|RaceId" src` = **0 hits** |
| A character/race selection phase | Solo & bots go title → `BotSetupOverlay` → START, seat 0 hardcoded crimson. Multiplayer goes lobby → seat rack → host Begin. **Neither offers a choice.** |
| Race claim arbitration | Two peers can both want green. The host is already the seat authority (`reconcileLobbySeats`); it must become the race authority the same way. |
| Castle upgrades | Layer 1 and Layer 2 both. Nothing exists. |
| Castle art beyond a placeholder | `drawKeep()` is a tinted box with four merlons, and its own comment says *"The owner's race work will replace this with real per-race damaged/destroyed art."* |
| A passive castle spawn | Spawners today are structure-recipe-driven only. |
| Race filtering on the build menu | `ALL_BLUEPRINT_IDS` is a flat list with no owner concept. |

### 5.4 THE WIRE COST — the real cost centre, not the towers

- **`PROTOCOL_VERSION` is 38.** A bump = SIX edits (`LOCKED_DECISIONS.md` § S150): the const; the
  narrative changelog block; the compact `HelloMsg` list *in chronological order at its neighbours'
  indentation*; the `protoVersion` type literal (a tsc tripwire); `protocol.test.ts`'s pinned
  expectation **and its test title**, plus `LOCAL_PROTO_V` in `e2e/smoke.spec.ts`; and the session
  label. `src/net/protocolVersionSync.test.ts` is the gate that actually fails.
- **Every new tower's `GodlyId` is a serialized literal** — `Spawner.recipeId` and `Defender.recipeId`
  both ride the wire. So **each batch of new towers is its own bump.** ⭐ This is the argument for
  landing all six signature towers in ONE batch rather than dribbling them.
- **`Player.raceId` and the upgrade levels can ride the SAME bump.** Both are per-seat, both belong on
  `Player`. Land them together and pay one bump instead of two.
- **`Player` fields are NOT hashed.** `FIELD_COVERAGE` marks `players: 'acknowledged'`
  (`state/stateHashFull.ts:167`) — main-thread divergence from authority is by design there
  (client prediction). So a `Player` field costs the interface + `makeIdlePlayer` + any Player
  reconstruction (`fsmDrop`) + `SerializedPlayer` + serialize + deserialize — **not** the ten-site
  bill quoted for a required hashed *World* field. Follow the `raidPoints` docblock, which records
  exactly this ("SERIALIZED BUT NOT HASHED").
- **`RosterEntry` gains `raceId`** (`net/protocol.ts:805`). Additive-optional in shape, but bump
  anyway: the S150 checklist is explicit that *"a field a stale peer can silently DROP is more
  dangerous than one it cannot parse."*

---

## 6. WAVE 1 — IDENTITY EXISTS

**Goal:** six races are real, selectable, visually distinct, and mechanically distinct in exactly one
way (the passive spawn). No new towers. The game is fully playable at the end of this wave.

### W1-A · THE RACE FIELD AND THE SELECTION SCREEN — one session · PROTOCOL 38 → 39

**Objective.** A player chooses a race before a match, that choice reaches every peer, and the board
paints in the chosen colour.

**Work.**
1. **`src/state/races.ts`** (NEW leaf module) — `RaceId`, `ALL_RACES`, `RACE_COLORS` as an exhaustive
   `Record`. Side-effect-free. Nothing imports a recipe module.
2. **`Player.raceId`** — required on the interface, defaulted in `makeIdlePlayer`, additive-optional
   in `SerializedPlayer` (absent ⇒ the race for that seat's default colour, so every pre-existing save
   loads). Carry it through the Player reconstruction path.
3. **`RosterEntry.raceId`** — additive-optional on the wire; `START_GAME_SIGNAL` carries it.
   `StartGameAction.roster` gains it beside `color`.
4. **Host arbitration.** The host owns race claims exactly as it owns seats. A `CLAIM_RACE` client
   intent (added to `CLIENT_INTENT_TYPES`), host-authoritative, rejected if taken; the resolved
   assignment broadcasts in `LOBBY_PRESENCE`. **A player who never chooses gets the race for their
   assigned seat colour** — so solo and bots keep working with zero UI.
5. **Selection UI, three surfaces:**
   - **Solo / vs-bots:** a race row in `BotSetupOverlay` (click-to-cycle, same idiom as the
     difficulty cycler), plus a row for each bot.
   - **Multiplayer lobby:** the seat rack becomes clickable — click your own seat to cycle race;
     taken races render locked.
   - Show the race **name and its castle silhouette**, not just a colour swatch.
6. **Colour derivation.** Everywhere that reads `PLAYER_COLORS[seat]` as an identity (not as a default)
   now reads `RACE_COLORS[player.raceId]`. Audit every call site — there are ~15.
7. **Bots pick races too.** `botSetupOverlay` cycler + whatever `botBrain` needs to know its own race.

**Tests.**
- Unit: `RACE_COLORS` is exhaustive over `RaceId` and its six values are exactly `PLAYER_COLORS`
  (a tripwire — if someone retunes the palette, this reddens).
- Unit: two peers cannot hold the same race; the second claim is refused by the host.
- Unit: a roster with no `raceId` (a stale peer / an old save) resolves every seat to its default
  colour's race and **no seat ends up undefined**.
- Wire: a joiner adopts the host's race assignment; every castle paints the same colour on both peers.
  *(Follow `net/layoutWire.test.ts` — written for exactly this class of gap, because `netSnapshot`
  deriving from `snapshot()` via `Omit` had been READ rather than PROVEN.)*
- E2E: pick a race in the lobby on two browsers, Begin, and assert both boards agree.

**Exit gate.** All six races are selectable in all three surfaces; orange and magenta are reachable
for the first time; a race choice survives the wire, a save/load, and a host migration; the full
suite is green; the six bump sites are edited and `protocolVersionSync.test.ts` passes.

### W1-B · THE CASTLE BECOMES ITS RACE — one session · no protocol bump

**Objective.** You can tell whose castle it is from across the board.

**Work.**
1. Replace `drawKeep()`'s placeholder box with per-race castle art, keyed on `raceId`.
2. **Three states**: intact / damaged / destroyed. The existing HP bar (which only appears once
   damaged) stays — it is the mechanic's legibility and is derived from `player.castleHp`, already on
   the wire.
3. Per-race **gatherer silhouettes** in `render/gathererRenderer.ts` — render-only, no wire cost.
4. Per-race castle **attack VFX** — cosmetic only, per §3.2. Same targeting, same numbers.

**⚠ Asset reality.** Only zombies have art (`assets-source/zombie-castle/`), and even that is missing
its attack clip (CF-S153-c, failed twice on veo backpressure). **Five races and one attack clip need
generating.** Use the `assets-source/<pack>/` parallel-session workflow described in
`assets-source/README.md`; it is an authorized exception to the solo-session rule. Ship a
race-tinted procedural placeholder for any race whose art is not ready — do NOT block the wave.

**Tests.** Render: each race draws a distinguishable castle at each of the three states.
⭐ **Look at a real frame.** The S147 lesson: a green suite is not evidence for render work — a FIGHT
banner shipped permanently oversized because nothing decayed its scale, and no test in the repo could
have seen it. Capture both a damaged and an undamaged castle through Playwright and look.

**Exit gate.** Six castles, three states each, visually distinct in a captured frame.

### W1-C · THE CASTLE PRODUCES, AND ITS ARMY SHELTERS — one session · PROTOCOL 40 → 41

> ⚠ **S162 correction: this said `39 → 40`, and 40 IS ALREADY SPENT** — S161 P2 took it for seat
> elimination (`src/net/protocol.ts`: `PROTOCOL_VERSION = 40`). A session executing the old line
> verbatim would have written 40 over 40, changing nothing, while `protocol.test.ts`'s
> `expect(PROTOCOL_VERSION).toBe(40)` still passed and the version-sync chain looked unbroken — a
> **silently skipped bump**, which is exactly the failure `protocol.ts` says that test exists to
> catch. Re-read §15.5's bump-site table against the tree before trusting its numbers either.

**Objective.** The one mechanical difference in Wave 1: your castle makes your race's unit, and that
army obeys the phase rhythm the rest of the game already obeys.

**⭐ THE WHOLE CYCLE IS A THIRD RIDER ON TWO SHIPPED MECHANISMS. Read them before writing anything.**

| The owner's words (R120) | What already exists |
|---|---|
| *"every thirty seconds it produces"* | `spawners/spawnerLifecycle.ts` — tick-deterministic cadence. ⚠ **No RNG at all** in that path (its docblock `:15-17` says so); the spec's "seeded RNG" was wrong |
| *"they hide inside the castle"* during BUILD | `GathererState 'SHELTERED'` (S149 P2) — ⚠ **a GATHERER state. `CreatureState` has no equivalent** — see §14 blocker 8 |
| *"they get released during fight stage"* | the same phase edge that un-shelters gatherers |
| *"it keeps producing during fight"* | cadence simply is not phase-gated off |
| *"then they go back"* | **`recallArmies` (`hostTick.ts:177`)** — S154 P4, owner A3. ⚠ It **TELEPORTS** at the BUILD edge (`:184-193`, `:321`); the *walk* is a separate mechanism, `ARMY_RETREAT_LEAD_TICKS = 180` (`constants.ts:1488`, used at `creatureAI.ts:654-661`) — and it fires ONLY for `targetsStructures` units |

⚠ `retreat.test.ts` records the principle that governs the recall, and it must govern this too:
**it is a DEADLINE, not a head start.** The creature fan-out is gated on `matchPhase === 'FIGHT'`, so
the instant the phase flips units freeze where they stand. The assertion that matters is the
invariant — *at BUILD, no creature is in enemy ground* — not the animation.

**Work.** A per-seat emitter on the castle anchor, cadence keyed on nothing but `world.tick`. Units
produced during BUILD are born SHELTERED. The FIGHT edge releases them; the BUILD edge recalls and
re-shelters the survivors.

⚠ **Identical cadence and identical unit stats across all six races** (R117). The *unit* differs; its
numbers do not.

**Tests.** Differential: host and `?worker=1` mirror agree bit-for-bit across a full BUILD→FIGHT→BUILD
cycle with production and recall both firing. Unit: cadence derives from `world.tick`, never
wall-clock. Unit: a destroyed castle stops emitting. Invariant: **at BUILD, no race unit stands in
enemy ground** — the `retreat.test.ts` assertion, extended to the new family.

**Exit gate.** Six races each emit their own unit; the shelter/release/recall cycle holds across three
consecutive waves; hashes identical host-vs-worker; a full match plays.

### W1-D · CASTLE UPGRADES, LAYER 1 — one session · rides W1-C's bump if sequenced together

**Objective.** Victory points buy castle stats, identically for every race (R96, R97).

**Work.** Per-seat upgrade levels on `Player` (the `raidPoints` precedent — serialized, not hashed).
Price and max-level constants per axis, copying `GATHERER_SPEED_UPGRADE_PRICE` /
`GATHERER_MAX_SPEED_LEVEL` in shape. Upgrade rows in `castlePanel.ts` via the existing `PanelControl`
descriptor list. Every disabled row states its blocker.

**Tests.** Unit: an upgrade debits `scoreByPlayer` and raises the stat; an unaffordable one is refused
and the panel says why; the cap holds. ⭐ **A tripwire test asserting no `raceId` reaches any Layer 1
computation** (§3.3).

**Exit gate.** All four Layer 1 axes buyable, capped, priced, race-blind, and round-tripped through
save + wire.

---

## 7. WAVE 2 — SIX RACE TOWERS, ALL AT A NEW TIER 3 (R98 · R108)

**One tower per race. One protocol bump for all six.** Do not dribble them — each `GodlyId` is a
serialized literal, so six separate landings cost six bumps.

**Per tower, the full bill (from the goblin tower, which is the worked example):**

1. A `GodlyId` literal (`state/godlyRecipes/types.ts`) — **serialized**.
2. A recipe module + predicate + `registerRecipe` at its tail.
3. A `Blueprint` entry in `state/blueprints.ts` **`BLUEPRINTS`** — *and* in **`ALL_BLUEPRINT_IDS`**
   (see §10 trap 1).
4. A defender or spawner config + a stat line in `state/stats.ts`.
5. **Codex copy** in `render/codexPresentation.ts` `CODEX_COPY` (see §10 trap 2).
6. Art.
7. Tests: the blueprint stamps, ignites, and survives re-validation; the bill matches the predicate.

**Race filtering (R95).** A race tower is visible and buildable only by its owner. This means
`castleStructuresModel` and the `ALL_BLUEPRINT_IDS` consumers take a race parameter, and the footer
band inherits the filter for free (it derives from `castleStructuresModel`).

**Test this explicitly, both directions:** a vampire cannot build the orc tower, *and* every race can
still build all seven global towers. The second half is the regression that proves additive-not-
replacing actually held.

### ⭐ ALL SIX ARE TIER 3, AND TIER 3 DOES NOT EXIST YET (R108)

The signature tower is **a new tier below the current floor**. Today the footer runs 4·5·6·7·8; this
adds a **3** chip on its left. Because the footer is derived from `blueprintCost`
(`render/footerBandModel.ts`), **the chip appears on its own** — no hardcoded list to edit. That is
the design paying off.

**All six race towers are the SAME shape and the SAME mechanic**, differing only in what they emit:

- **3 shapes, 3 bonds — a CLOSED TRIANGLE of the race's own feed shape (R119).** Zombies: three
  Circles in a ring. Vampires: three Triangles. Every node degree exactly 2. This is the `pentagram`
  ring pattern at n=3, and `blueprints.ts` already writes ring edges explicitly for exactly this
  reason. ⚠ Under R66 the footer chip is the SHAPE count, so this reads as "3" — note the bond count
  is also 3 here (a ring, not a chain), which is the first recipe where those two numbers agree.
- **The tower is made of what it eats.** Recipe shape == feed shape, per race. That is a genuinely
  good piece of design: the player never has to memorise a mapping, because the tower shows it.
- **Fed, goblin-tower style** — put in the race's shape, get one of the race's units. Reuse
  `state/goblinTowerFeed.ts`; do not write a second feed path.
- **Unlike the goblin tower, it accepts exactly ONE shape** — its race's. The goblin tower maps all
  six shapes to six outputs; this maps one shape to one output.
- **The unit must be weak.** Owner: *"obviously it has to be a pretty weak unit for all of them
  because if it's only three connectors."*

This collapses "six bespoke towers" into **one tower pattern instantiated six times.** It is by far
the cheapest version of Wave 2 and it is the owner's own design.

### ⚠ PREDICATE HYGIENE — THE VAMPIRE TOWER AND THE PENTAGRAM SHARE A FAMILY

**Not a design collision — the owner is right that a 3-ring and a 5-ring are plainly different
towers.** It is a two-line implementation note, recorded because it is the kind of thing that ships
green and wrong.

`pentagram` is a closed ring of 5 Triangles at degree exactly 2; the vampire tower is a closed ring of
3 Triangles at degree exactly 2. Same primitive, same topology, separated by `n`. Every other race
tower is unambiguous: mummies a Line ring (the laser turret is a Line HUB), nagas a Square ring
(Voltkin is a CHAIN), orcs a Dot ring (the lightning hub is a Dot HUB), demons a Spiral ring (no
Spiral-hub recipe exists), zombies a Circle ring (goblin and stink towers are HUB stars).

So: **both predicates assert an EXACT node count**, and **one test builds each and proves the other
does not ignite.** Cheap, and it forecloses the failure mode the goblin tower already demonstrated —
a fully working tower that appeared as the wrong thing, with every test green.

### 7.3 ⚠ THE SUBMERGED NAGA IS AN ENGINEERING SURFACE, NOT A RENDER TOGGLE (R121)

A piranha under the ground cannot be targeted. That is one sentence of design and a real amount of
code, because **every acquisition path in the game has to learn the word "untargetable"**:

- `findNearestEnemyCreatureFrom` and every defender's target acquisition;
- the castle guns;
- creature-vs-creature AI;
- ⭐ **and the case that will be missed: a defender that has ALREADY COMMITTED to a naga which then
  submerges mid-windup.** `Defender` carries `targetCreatureId` across ticks. Dropping the target is
  correct; silently firing into a submerged unit is the bug, and it will not show up in any test that
  only checks acquisition.

**Why this is allowed to break R117, and what bounds it.** It IS a real advantage — a naga army
crossing open ground eats roughly 40% less tower fire. It survives as the sole exception because it
carries its own cost, stated by the owner: **a naga is submerged only while MOVING and must surface to
attack.** It cannot deal damage while it is immune. That is a trade, not a free buff.

⚠ **Measure it in the balance pass.** Submerged fraction is a live dial (the owner's estimate is ~40%
under, ~60% over). If nagas dominate, that number is the knob — not the mechanic.

### ⚠ A 3-SHAPE TOWER MOVES THE OPENING ECONOMY — say so before it surprises someone

`zoneEconomy.test.ts` measures a full 5400-tick BUILD with one un-upgraded gatherer: 8–9 shapes
banked, and the cheapest tower today is the 4-shape stink tower. **A 3-shape tower is cheaper than
anything that has ever existed in this game**, so every race will open with it, every match, from
wave 1.

That is probably what the owner wants — immediate race identity — but it is a real shift in the
opening, and it makes the race tower the new tutorial build rather than the stink tower. **Re-run
`zoneEconomy.test.ts` after it lands** and report what the opening actually looks like.

**Exit gate.** Six race towers at tier 3, each buildable only by its race, each fed by exactly its
race's shape, each emitting that race's unit; the footer grows a 3 chip with no hardcoded edit; all
seven global towers still buildable by everyone; one bump, six sites, green.

---

## 8. WAVE 3 — THE GRID, TIER BY TIER

The full ambition: one unique tower per race per tier, tiers 4–8. **That is 30 towers.** At the
measured rate — the goblin tower alone consumed most of a session — this is 15–30 sessions. It is a
programme, not a session.

**Land it one TIER at a time, all six races together.** Each tier = one batch = one protocol bump =
one art pass = one balance pass. The game stays playable and coherent after every batch.

Current tiers, for reference (bucketed on `blueprintCost` = shape count, per R66):

| Tier | Global towers today |
|---|---|
| 4 | STINK TOWER *(alone)* |
| 5 | PENTAGRAM · **GOBLIN TOWER** |
| 6 | LIGHTNING HUB |
| 7 | LASER TURRET · PRINCESS HELGA |
| 8 | VOLTKIN |

Suggested order: **tier 4 first** (cheapest, seen earliest, most playtested), then 5, 6, 7, 8.

**Do not start Wave 3 before Wave 2 has been played.** The owner will learn more from one vampire
tower in a real match than from a thirty-tower spec.

---

## 9. THE TECH DRAFT — a choice every 5 waves (R101–R106)

**Owner, 2026-09-02:** *"every 5 rounds there is an upgrade offered to each player that has one race
unique option and one general... then another upgrade after 10th round fight. then again at 15. etc."*

⭐ **This delivers more race identity per unit of work than Wave 3 does, and it is cheaper by two
orders of magnitude.** Four of the six race perks are ONE-CONSTANT changes. Every perk buffs content
that already ships, so **the whole system works before a single race tower exists** — it is
implementable inside Wave 1. Sequence it accordingly.

### 9.1 The rulings

| # | Ruling |
|---|---|
| **R101** | **THE TECH DRAFT.** At the end of every 5th wave's FIGHT — waves **5, 10, 15, 20, …**, recurring with no ceiling — each player is offered **TWO options** and picks **one**: a **general** upgrade (identical for every race) and a **race-unique** one. |
| **R102** | **THE SIX RACE PERKS**, as the owner specified them — see §9.3. |
| **R103** | **SUB-DRONES ARE ONE GENERATION.** A naga carpet drone's children do **not** themselves split. Stated because the code must enforce it, not because it was ever in doubt. |
| **R104** | **NO OVERLAP BETWEEN THE TWO PROGRESSION SYSTEMS.** Castle upgrades (R96/R97) modify **the castle**. The tech draft modifies **the army and the towers**. Neither may touch the other's numbers. Two systems that can both move the same value make balance unarguable. |
| **R105** | **A ZOMBIE REVIVES AT 1 HP FLAT, not at 10% of max.** The owner said 10%; the arithmetic does not exist — see §9.4. 1 HP is the same fantasy ("it gets back up, barely"), is an integer, and works for every unit. |
| **R106** | **THE DRAFT NEVER BLOCKS THE SIM.** A player who does not choose before the BUILD phase ends is auto-assigned the **general** option. See §9.5. |

### 9.2 ⚠ THE INTERVAL IS RULED AT 5 — the one thing to MEASURE, not to re-argue

⚠ **CORRECTED BY AUDIT — THE PHASES ARE NOT THE SAME LENGTH.** S149 split them:
`PHASE_DURATION_TICKS = 5400` is **BUILD only (90 s)**; `FIGHT_PHASE_TICKS = 2700` is **45 s**
(`constants.ts:389-391`, `phaseDurationTicks()` at `:401`). So **one wave = 8100 ticks = 135 s**, not
180. The first draft lands **~11.25 min** in, the second at ~22.5. Whether a real match reaches wave 5
is still unknown — the balance pass has not run, and the win threshold is 1500 points.

**Do not change the number.** Ship it at 5 as a NAMED CONSTANT (`TECH_DRAFT_WAVE_INTERVAL = 5`) and
report, in the balance pass, how many drafts a real match actually fires. If the answer is zero, that
is a tuning input for the owner — not a licence to redesign the feature.

### 9.3 The perk table (R102)

| Race | Race-unique perk | Touches | Cost |
|---|---|---|---|
| **Vampires** | Pencil chewers spawn **50% quicker** | `SPAWN_INTERVAL_TICKS` (pentagram) | one constant |
| **Mummies** | Stink tower and stink bags get **+50% radius** | `STINK_TOWER_ATTACK_RANGE` + bag radius | one constant |
| **Nagas** | **Carpet drones** — a lightning drone's suicide spawns **2 smaller drones** that fly further out and explode. Visually identical at **50% scale**, **25% of the parent's stats**. | `droneLifecycle.ts` + a new spawn-on-death path | **real work** |
| **Orcs** | Each goblin tower allows **15** spawned goblins instead of 10 | the goblin population cap | one constant |
| **Zombies** | Each dead spawned unit **comes back to life once** at 1 HP (R105) | the creature death path | **real work** |
| **Demons** | Voltkin becomes **DEMONIC VOLTKIN** — **×2 ATK**, and its lightning renders **red and black** | `VOLTKIN` atk + the arc-flash palette | one constant + a palette |

**The general track (R111)** is one option per draft, identical for every race, walking the four stat
axes in order:

| Wave | General option |
|---|---|
| 5 | **ATTACK** up, for all spawned units |
| 10 | **DEFENCE** up |
| 15 | **HP** up |
| 20 | **PENETRATION** up |

**Magnitude: +1 POINT on the axis (R118).** On DEF and PEN that is *exactly* the owner's 20%, because
the ladder steps by 0.2 per point. On HP and ATK a "percentage" is a category error — they are integer
counts, and +1 is the smallest step that exists. Full reasoning in §9.8.

**The race track past wave 5 is deliberately unwritten (R112).** Build wave 5, then ask.

⛔ **AND WAVES 10/15/20 MUST NOT SHIP A DEAD BUTTON (R126).** The owner asked for the general option
live with a race "placeholder which is nothing" — but a two-option draft where one option does nothing
is not a choice, it is a broken screen every player learns to ignore. Build it as a **single-option
draft**: at a wave with no race perk defined, present the general option alone and grant it. The code
path already exists — R106 auto-assigns the general on no-choice — so this is a UI state, not a second
mechanism. When the race perks are decided, the second option simply appears.

⭐ **Every perk buffs a GLOBAL tower** — pentagram, stink tower, lightning hub, goblin tower, Voltkin.
That is what makes the system shippable early. **The deliberate consequence: each race is pulled
toward a build.** The mummy plays stink-heavy, the orc plays goblin-swarm, the demon rushes Voltkin.
This narrows strategy per race and widens it across races, which is the RTS idiom the project is
drawing from. Recorded as intent so a later session does not "fix" it.

**Ship the four one-constant perks as one batch.** Nagas and zombies get their own priorities.

### 9.4 ⛔ WHY 10% OF MAX HP DOES NOT EXIST IN THIS GAME (the reason for R105)

`CHEWER_HP = 1`. Goblins are **also 1** — S151 P2 took them 6 → 1 (*"the goblin stops being the
backbone, and becomes chewer-fragile"*). 10% of 1 is 0.1.

`damageEntity` **throws** on a non-integer amount, by design: the whole stat system is expressed in
integer FIFTHS (`state/stats.ts`) precisely so no float ever reaches the damage path, because the host
and the `?worker=1` mirror must agree bit-for-bit. So "10% of max HP" either truncates to **0** (the
unit revives dead) or rounds to **1** (a *full* resurrection, since max is 1). Voltkin at 8 HP gives
0.8, which is not an integer either.

**1 HP flat. Not a percentage. Not a rounding rule.**

### 9.5 The mechanics — decided, and overridable

Four calls made here rather than left open, each marked `[CLAUDE — overridable]` in the repo's own
convention (`SPARK_TD_SESSION_SPECS.md` Q3 is the precedent).

- **WHEN it fires** `[owner-ruled]` — at the **BUILD edge** following wave 5/10/15's FIGHT. Never
  mid-fight: you choose during the sealed, calm build stage, which is also where the walls are up.
- **VISIBILITY** `[owner-ruled, R113]` — **public, beside the player's NAME on the leaderboard row**,
  one icon per drafted wave, stacking left to right so the whole history reads at a glance. Each buff
  needs a generated icon — **an art dependency, not just a layout.**
- **NO-CHOICE** `[owner-ruled, R106]` — a player
  who has not chosen when BUILD ends is auto-assigned the **general** option. The sim must never wait
  on a human: an AFK seat, a dropped peer mid-migration, or a bot with no handler would otherwise
  stall every other player's match.
- **BOTS CHOOSE TOO** `[owner-ruled]` — a bot picks its race option by default. A bot that
  never drafts falls permanently behind and makes VS-BOTS progressively meaningless.
- **STACKING** `[owner-ruled]` — perks are **cumulative and permanent for the match**. Wave
  10's pick does not replace wave 5's. With a recurring interval and no ceiling, this is the only
  reading that makes late waves matter.

### 9.6 Wire and determinism

- **`waveNumber` ALREADY EXISTS AND IS ALREADY HASHED** (`worldTypes.ts:583`, `stateHashFull.ts:134`),
  serialized, and displayed next to the timer — S157 B8 built it. It increments on entry into BUILD
  (`hostTick.ts:302`). **No new counter is needed.** ⚠ Read its docblock first: it explains why the
  wave number is STORED and cannot be derived from `tick / phase length` (`applyStartGame` does not
  reset `world.tick`, so a second match in the same page session would compute garbage).
- **The chosen perks are hashed sim state.** They change damage, spawn rates and populations, so two
  peers holding different perk sets diverge within a tick. A per-seat perk set on `Player` (the
  `raidPoints` precedent) is serialized; the perks themselves must contribute to the wide hash.
- **A `CHOOSE_TECH` client intent**, added to `CLIENT_INTENT_TYPES`, host-authoritative. **Protocol
  bump** — a stale peer would reject the message outright and its seat could never draft while
  another seat could.
- **The zombie revive needs a serialized `hasRevived` flag on `Creature`** so a unit cannot revive
  forever. That is an additive wire field on a family that serializes at full fidelity — bump.
- ⚠ **The revive must not fire inside `pendingCreatureDeaths`.** That set is a one-tick deferral,
  explicitly never serialized and never hashed (`'acknowledged'` in `FIELD_COVERAGE`): `runHostTick`
  opens it before the creature loop and sweeps it immediately after. A resurrection hooked into the
  wrong side of that sweep is exactly how host and worker diverge. Prove parity with a differential
  test across a full BUILD→FIGHT→BUILD cycle with revives firing.
- ⚠ **The chewer caps are OFF** — `CHEWER_MAX_GLOBAL / PER_SPAWNER / PER_VICTIM` are all `10_000`
  sentinels (S157 B8b, owner: *"no cap — a tower never stops emitting"*). The vampire perk is
  therefore **+50% on an uncapped emitter**. Not a blocker; it is the one perk whose population curve
  must be measured rather than assumed.
- ⚠ **The orc cap is documented as LOAD-BEARING, not cosmetic** (`constants.ts:1312`):
  `GOBLIN_MELEE_CONFIG.persistent = true`, so goblins never age out. Raising 10 → 15 is fine; removing
  the ceiling is not.

### 9.7 Tests

- Unit: the draft fires at the **correct wave edge and no other** — driven through the real
  `hostTick` wave edge, not by calling the trigger directly. ⚠ **Pin the exact number first (§14
  blocker 13): `waveNumber` increments on ENTRY INTO BUILD, so "the BUILD edge after wave 5's FIGHT"
  is `waveNumber === 6`.** §9.5 and this bullet contradicted each other in the original draft.
- Unit: a perk set round-trips through save/load and through the wire; a joiner mid-match sees every
  seat's perks.
- Unit: the no-choice deadline auto-assigns the general option and the phase advances **on time**
  (this is the R106 test — it proves the sim never waits).
- Unit: a naga sub-drone does **not** split (R103), and a zombie revives exactly **once** (R105).
- Differential: host vs `?worker=1` mirror agree bit-for-bit across a cycle with a revive, a carpet
  drone detonation and a demonic Voltkin zap all firing.
- Tripwire: **no tech perk modifies a castle stat** (R104), mirroring the R97 tripwire in §3.3.

### 9.8 ✅ RESOLVED — THE DRAFT GRANTS +1 POINT, AND ON TWO AXES THAT IS EXACTLY 20%

The owner's fix — *"instead of ten percent we'll do twenty percent"* — is **exactly right for the two
axes that are percentages, and a category error on the other two.** Both halves matter.

**DEF and PEN ARE percentages, and 20% is the system's own native step.** The ladder is `1 + 0.2n`
(`state/stats.ts`), pinned twice by the owner as *1.4, not 1.44*. So:

> **+1 DEF point = ×1.2 effective HP = exactly +20%.**
> **+1 PEN point = ×1.2 damage dealt = exactly +20%.**

No rounding, no fifths problem, nothing to invent. The owner reached the system's real granularity by
intuition.

**HP and ATK are NOT percentages — they are integer counts** on a flat 1..12 ladder. "20% of 1 HP" is
1.2 and does not exist, exactly as 10% did not. The smallest step that exists is **+1 point**.

**THE RULE (R118): every general draft option grants +1 POINT on its named axis.**

| Wave | Axis | What +1 point actually does |
|---|---|---|
| 5 | **ATK** | +1 attack point. On a 1-ATK chewer that is +100%; on an 8-HP-scale unit it is proportionally smaller |
| 10 | **DEF** | ×1.2 effective HP — **exactly the owner's 20%** |
| 15 | **HP** | +1 hit point |
| 20 | **PEN** | ×1.2 damage — **exactly the owner's 20%** |

**Why +100% on a 1-point unit is acceptable, and may even be desirable.** The buff is *relatively*
larger for weak units and smaller for strong ones, so the roster COMPRESSES rather than spreading.
A draft that helps a chewer more than a Voltkin is a stabilising force, not a runaway.

⚠ **If it does feel too coarse in play, the fix is to RAISE BASE UNIT HP AND ATK** — giving room for
finer relative steps — **never to introduce a fractional buff.** `damageEntity` throws on a
non-integer amount by design, and a rounded float would diverge the host from the `?worker=1` mirror
invisibly until a desync surfaced somewhere unrelated. That is the defect the fifths system exists to
prevent. This is a balance-pass item, not a licence.

---

## 9C. THE RACE UNIT STAT LINE, VERIFIED AGAINST THE LIVE ROSTER (R125)

`1 HP · 1 DEF · 1 ATK · 1 PEN`, identical for all six races. Worked through `state/stats.ts` — every
figure below is in FIFTHS and exact.

| Unit | HP | DEF | **Effective HP** | ATK | PEN | **Damage dealt** |
|---|---|---|---|---|---|---|
| **Race unit (R125)** | 1 | 1 | **6** | 1 | 1 | **6** |
| Pencil chewer | 1 | 0 | 5 | 1 | 2 | 7 |
| Goblin melee | 1 | 2 | 7 | 2 | 1 | 12 |
| Goblin archer | 1 | 1 | 6 | 2 | 2 | 14 |
| Goblin shield | 2 | 3 | 16 | 1 | 0 | 5 |
| Goblin hound | 1 | 0 | 5 | 3 | 2 | 21 |

**The owner's intent holds, and the reading is sharper than "weaker than a chewer".**

- ⭐ **Offensively it is the FLOOR of the entire roster** — 6 fifths, below the chewer's 7 and less
  than a third of the goblin hound's 21. Exactly right for a free unit off a 3-shape tower.
- ⭐ **Defensively it dies in ONE HIT to literally everything on the board**, chewers included
  (7 ≥ 6). There is no attacker in the game it survives.
- It one-shots a chewer (6 ≥ 5) and another race unit (6 ≥ 6), and it does NOT one-shot a goblin melee
  (6 < 7) or a shield (6 < 16). A coherent bottom rung.
- ⚠ The single nuance: `DEF 1` makes it nominally *tougher* than a chewer (6 vs 5), which reads
  against "even weaker". **In practice that point buys nothing** — everything one-shots it at either
  value — so `1/1/1/1` and `1/0/1/1` are behaviourally identical today. Keeping the owner's `1/1/1/1`;
  flagged only so nobody later "corrects" it as a typo.

---

## 9B. POPULATION — THE DESIGN IS RIGHT, AND IT STILL NEEDS A SENTINEL

**The owner's argument is sound and should not be softened.** Fight attrition genuinely is the
governor: units die in FIGHT, they do not respawn, you rebuild. Every opponent's army grows too. This
is how the shipped goblin economy already behaves and it works.

⭐ **AND THE OWNER HAS ALREADY RULED THIS EXACT QUESTION ONCE — the answer is the precedent, not a
new argument.** S157 B8b, on chewers: *"no cap — a tower never stops emitting."* What actually
shipped is `CHEWER_MAX_GLOBAL / PER_SPAWNER / PER_VICTIM = 10_000`, commented **"owner: no cap —
sentinel backstop only."** A number so far past play that it is never felt, and finite so a bug cannot
melt a match. **Do exactly that here.** It is not a gameplay cap and must never be tuned as one.

**Three cases where "they kill each other" does not hold**, none of them a design flaw — they are why
the sentinel exists:

1. **An eliminated or turtling opponent.** In a 4-player match with two seats down, the survivors'
   armies grow against nothing.
2. **A passive stalemate.** Units are FIGHT-gated and recall home; two defensive players can accrue
   for many waves with near-zero attrition.
3. ⛔ **The binding limit is the WIRE, not the board.** Every creature serializes into `NetSnapshot`
   at 10 Hz and contributes to the hash, and every one costs Verlet integration each tick. The
   codebase states the principle directly at the gatherer-queue cap: *"an unbounded array is an
   unbounded wire payload and an unbounded hash input."* A runaway here degrades the netcode before
   it ever unbalances the match.

**The arithmetic, so it is sized rather than guessed.** At a 30 s cadence and a **135 s wave** (§9.2,
corrected), a castle emits **4.5 units per wave** — ~90 per seat over 20 waves, ~360 across a
4-player board, on top of goblins and chewers. Not alarming, but it IS the balance-pass number to
watch, and the cadence is the dial.

⚠ **AND RACE UNITS WILL SHARE THE GOBLIN GLOBAL CEILING UNLESS SOMEBODY DECIDES OTHERWISE.**
`underGoblinCaps` (`creatureLifecycle.ts:257-270`) counts *every* spawner-sourced non-chewer
non-drone creature against `GOBLIN_MAX_GLOBAL = 200` — its docblock advertises that as a feature
(*"a new fed unit type inherits the correct ceiling automatically"*). So R124's per-tower 10 comes
free from `GOBLIN_MAX_PER_SPAWNER`, but the **200 global is now shared between two unrelated
economies**: a seat fielding 150 hounds starves its own goblin tower. Castle-emitted units
(`sourceSpawnerId === null`) skip that loop entirely, so R123's uncapped castle is satisfied and the
§9B sentinel has nothing enforcing it. **Decide both explicitly.**

---

# 14. ⛔ AUDIT FINDINGS — READ THIS SECTION BEFORE WRITING ANY CODE

Three review agents audited this spec against the live codebase on 2026-09-02: one verified ~80 code
claims, one hunted unfinished pathways, one produced the W1-A site list in §15. **Everything below is
a defect in the plan, not in the code.** Each was measured, each is cited, and each would have cost a
session or a rebuild.

## 14.1 THE FIVE THAT KILL A PHASE

### B1 — ⛔ THE CASTLE EMITTER IS BLOCKED BY A SHIPPED GATE. W1-C IS DEAD ON ARRIVAL AS WRITTEN.

`applySpawnCreature` (`src/state/creatures/creatureLifecycle.ts:147-156`) returns the world
**unchanged** — no error, no log — if a live creature already exists with the same
`(ownerPlayerId, type)` and `sourceSpawnerId === null`. Only `voltkin` is exempt. The docblock says
the gate is deliberate: it protects the free starter goblins.

So a castle emitter dispatching `SPAWN_CREATURE{type:'zombieHound', sourceSpawnerId: null}` mints
**exactly one unit per seat for the whole match**, then silently no-ops forever. R107, R120 and every
number in §9B assume otherwise.

**The obvious guess (`sourceSpawnerId: null`) is the broken one, and it looks correct on an empty
fixture** — trap 6 verbatim. The alternative, a sentinel `SpawnerId` for the castle, breaks
`ownHomePos` (`creatureAI.ts`, spawner lookup first), `underGoblinCaps` and `recipeStillSatisfied`.
**Decide this before W1-C, and write the decision at the gate.**

### B2 — ✅ RESOLVED. SEAT ELIMINATION SHIPPED IN S161 P2 (owner ruling R127).

> ⚠ **THIS SECTION READ "SEAT ELIMINATION DOES NOT EXIST" FOR A DAY AFTER IT SHIPPED**, and cited a
> line range (`gameState.ts:76-88`) that no longer held the behaviour it described. Rewritten S162.

Owner R127, 2026-09-02: *"when a castle is destroyed a player cant gather anymore primitives so yes
he is out! but he should stay as spectator until there is one player left!"*

What is now in the tree:

- `src/state/elimination.ts` — `isEliminated` (the single `castleHp <= 0` predicate), `livingSeats`,
  `markFallenSeats` (the write-once `eliminatedAtTick` stamp that gives placings their order),
  `matchPlacings`, and `ELIMINATION_INTENT_POLICY`, which forces an explicit allow/deny for every
  client intent rather than letting a dead seat default back into the match.
- `src/game/player.ts` — `eliminatedAtTick?: number`.
- `src/state/gameState.ts` — last-one-standing: the match ends when ONE seat is left, and the winner
  is that seat rather than `survivors[0]`, which was `Map` insertion order deciding a match outcome.

⛔ **So §9B case 1, §9.5's no-choice rule and §9.6 are REACHABLE board states now.** Anything in this
spec that was deferred because "two seats down" could not happen should be re-read.

**Still open, deliberately:**

- **CF-S161-a is RULED (owner, S162): a fallen seat's board KEEPS FIGHTING.** Its towers, creatures
  and spawners are not swept and go on acting until razed — including deciding a match between two
  living players. Its castle gun is silent only because the castle is destroyed, not because the seat
  is out, so all four actor kinds are coherent.
- **Abandonment is NOT elimination, and has no rule.** S162 stopped a long-absent peer's intact castle
  from blocking the last-one-standing win (`PEER_DROP_FORFEIT_TICKS`), but a 1v1 whose opponent merely
  disconnects still does not end, because no castle fell. That needs an owner ruling.

### B3 — ⛔ `CLAIM_RACE` CANNOT BE A CLIENT INTENT. THE LOBBY HAS NO INTENT PATH.

W1-A step 4 prescribes a route that is closed at the moment it is needed. Three independent reasons:

- `hostHandlers.ts:306` — the INTENT branch requires `session.hostSync !== null`; null until the match starts.
- `hostHandlers.ts:336-341` — every INTENT is stamped from `session.hostSeats.get(peerId)` and
  **dropped fail-closed** when absent. `session.ts:39`: *"Empty on the client and before Begin."*
- In LOBBY, `world.players` holds only seat 0, so a reducer would have no player to write to.

**Use the `LOBBY_READY` precedent instead** (`protocol.ts:906-909`, handled at
`hostHandlers.ts:389-393`): a top-level `NetMessage` kind, keyed by transport `peerId`, handled
outside the INTENT path. Full site list in §15.4e.

Second half: the spec says the resolution *"broadcasts in `LOBBY_PRESENCE`"* — but that beacon is
only emitted from `transport.onPeerChange` (join/leave). **A race claim is neither.** The handler must
call the broadcast itself.

### B4 — ⛔ THE RAINBOW SHUFFLE COLLIDES WITH RACE-DERIVED COLOUR.

`applyTriggerRainbow` (`src/state/rainbowLifecycle.ts:129-135`) permutes every player's `color` and
every primitive's `placerColor`/`ownerColor` through a derangement. `player.ts:20-25` documents
`color` as mutable *for that reason*.

Two mutually exclusive outcomes, and the spec picked neither:
- Shuffle colour only → a vampire seat paints cyan while its castle art (keyed on `raceId`) stays
  crimson, destroying R110's entire stated rationale.
- Shuffle `raceId` too → seats swap races mid-match, invalidating built race towers and moving
  drafted perks to the wrong player.

**RULING TO WRITE: shuffle `color`, never `raceId`.** `color` is "what this seat looks like right
now"; `raceId` is "who this seat is". ⛔ **Therefore `Player.color` is NOT deleted** — §4's
"colour is derived" means *derived at construction*, not a getter.

⚠ And it has a third consequence the spec missed entirely: **every recipe resolves its owner by
matching `p.color === anchorPrim.placerColor`** (`pentagram.ts:141-149`, mirrored in
`lightningHub.ts` / `goblinTower.ts`). The six new race towers each need an owner resolver, and §7's
per-tower bill does not list one.

### B5 — ⛔ THE TECH PERKS MUST BE HASHED, AND `Player` IS THE ONE FAMILY THE ORACLE EXCLUDES.

§9.6 says the perks *"must contribute to the wide hash"* (correct — they change damage and spawn
rates). §5.4 says `Player` fields are **not** hashed (also correct —
`stateHashFull.ts:167`, `players: 'acknowledged'`, whose docblock explains it must stay that way or
client prediction reads as desync).

**These contradict, and `FIELD_COVERAGE` is keyed on `keyof World`, not `keyof Player`** — so putting
`techPerks` on `Player` compiles clean, escapes the wide oracle, and the tsc tripwire never fires.
The same argument applies to `raceId`, which selects the emitted `CreatureType`.

**Weigh both options explicitly and record the choice**: hash the whole `players` family (breaks the
oracle by its own docblock) versus a new hashed `World` field (contradicts §4's one-token principle
and costs the full ten-site bill). Do **not** default to "follow the `raidPoints` precedent" —
`raidPoints` is a currency nothing simulates from; perks are a sim input.

## 14.2 THE FOUR THAT SILENTLY HALF-LAND

### B6 — `buildMatchRoster` DISCARDS EVERYTHING BUT `peerId`.

`lobbyRoster.ts:121-132` compacts to dense seats and assigns `color: PLAYER_COLORS[denseSeat]`. Its
docblock already accepts *"a one-time colour change at match start"* for an unfilled hole. **With
races that is a RACE change** — a player who locked vampires in the lobby begins as nagas. Adding
`raceId` to `RosterEntry` but leaving line 129 untouched means the field is simply never populated on
the authoritative Begin roster, **and every lobby-side test still passes.**

### B7 — `applyStartGame`'s IDEMPOTENT ARM DROPS THE HOST'S OWN RACE.

`gameMode.ts:245-252` skips a player that already exists — and **seat 0 always already exists**, built
by `makeWorld` (`world.ts:462`). Without an `else` branch that stamps the race onto the existing
player, the host's chosen race is discarded at Begin while every joiner sees it correctly. A
one-sided, host-only, never-red colour desync. Exact code in §15.7b.

### B8 — THERE IS NO `SHELTERED` STATE FOR CREATURES, AND `recallArmies` ALREADY REFUSED TO ADD ONE.

R120 claims both halves ship. Only the gatherer half does. `CreatureState` is
`'SPAWNING' | 'SEEKING' | 'ATTACKING' | 'DESPAWNING'` (`creature.ts:185`), and `recallArmies`'
docblock (`hostTick.ts:169-174`) is a **standing ruling against this exact addition**: a new state
*"would be a hard wire parse break (the 'SHELTERED' 25→26 class) AND would render as the idle
animation row, because `goblinRenderer` maps every state that is not ATTACKING or SEEKING to 'idle'
— so a retreating goblin would slide across the board standing still."*

Sheltering creatures therefore needs a wire literal, a renderer decision, and answers the spec never
asks: is a sheltered unit targetable? does it hold the population cap? does it Verlet-integrate?

### B9 — `runSpawnerIgnition` IS A HARDCODED CHAIN, AND §7's TOWER BILL OMITS IT.

`godlyMatcherCore.ts:142-171` is three hardcoded `if (igniteOneSpawnerRecipe(...)) return;` calls. Its
own comment records this failure once already: *"⭐ S152 P2 — THE GOBLIN TOWER NEVER IGNITED… ⚠ A
REGISTERED RECIPE IS NOT A LIVE RECIPE."*

Follow §7's seven-item bill exactly and you get six race towers that build, stamp, pass
`blueprints.test.ts`, appear in the footer, tear down correctly — **and never become spawners**, so
`applyFeedTower` can never find them. **Add `runSpawnerIgnition` and a `recipeStillSatisfied` case
(`spawnerLifecycle.ts:109-131`) to the bill.** Without the latter, the `default:` arm keeps a tower
alive off a single surviving primitive, forever, with no error.

## 14.3 THE FIVE SMALLER TRAPS

| # | Finding |
|---|---|
| B10 | **`FEED_TOWER` hardcodes `goblinTower` twice** — `goblinTowerFeed.ts:98` (Gate 1) and `structurePanel.ts:190`. The panel row is always **six** buttons captioned from `GOBLIN_FEED_MAP`, under a documented contract. A one-shape race tower needs a decision: one button, or six with five disabled? Widening only one side gives either an unreachable tower or six lit buttons that all silently refuse. |
| B11 | **The 3-ring validator family is unchosen.** The repo has two, and S158 B2b deliberately migrated the star recipes OFF the component-walk one: `isPentagramComponent` (`pentagram.ts:57-77`) kills the tower if one friendly shape bonds to any node; `isStarAt` (`starShape.ts`) fixed exactly that but **does not apply to a ring** (no hub). §7 currently locks in the fragile variant by naming pentagram. **A ring needs a third validator.** |
| B12 | **The ring's geometry constant is unchosen.** Reusing `RING_R = 40` at n=3 gives side ≈ **69 px**, breaking `blueprints.ts:44-45`'s stated invariant (*"≤ `AUTO_BOND_RADIUS` (60)"*) — stampable but un-buildable by hand. Sizing by side instead gives the smallest footprint in the game and loosens `stampRefusalAt`'s clearance ring. Pick one and write the arithmetic at the constant. |
| B13 | **The draft's wave trigger is off by one, and the spec contradicts itself.** `waveNumber` increments on ENTRY INTO BUILD (`hostTick.ts:302`). §9.5's *"the BUILD edge following wave 5's FIGHT"* is `waveNumber === 6`; §9.7's test forbade 6. Also unstated: where the PENDING offer lives — R106's deadline needs a per-seat pending-offer record, serialized (a joiner mid-BUILD must see it) and hashed (auto-assignment must fire on the same tick for everyone). |
| B14 | **Bots enumerate `ALL_BLUEPRINT_IDS` with no race and no seat filter.** `botBrain.ts:157-159` sorts it at module level — no world, no seat. §7's "the footer inherits the filter for free" covers the two RENDER consumers and misses the only non-render one. **Tier 3 makes race towers the cheapest builds in the game**, so every bot of every race picks the same one by alphabetical tie-break, spends its bank on the wrong primitive and queues the wrong shape. Bots also have no `CHOOSE_TECH` verb. ⚠ There is **no `src/bots/botTowers.ts`** — only its test; the logic is in `botBrain.ts`. |

## 14.4 SMALLER CORRECTIONS ALREADY APPLIED ABOVE

Wave length 180 s → **135 s**; castle output 6/wave → **4.5/wave**; goblin tower tier 4 → **tier 5**;
the footer derives from `ALL_BLUEPRINT_IDS` not the registry; the four-sites warning lives in
`primitive.ts` / `defender.ts` / `save.ts`, not `blueprints.ts`; `spawnerLifecycle` has **no RNG**;
`recallArmies` **teleports** (the walk is `ARMY_RETREAT_LEAD_TICKS`, and fires only for
`targetsStructures` units — so **R123's "survivors return exactly as chewers do" is factually wrong:
chewers do not walk home**); the test baseline is **3353/212**; `codexCopyFor`'s fallback is at `:116`
and `CODEX_COPY` is itself `Record<string, …>` so the proposed tsc fix needs the record retyped too;
`buildMatchRoster`'s palette line is `:129`; `layoutWire.test.ts` is under `src/state/`;
`pentagram` is already 5 shapes / 5 bonds so the 3-ring is **not** the first where the counts agree.

⚠ **`assets-source/zombie-castle/` contains a HOUND, not a castle** (`clips/zombie-hound/{idle,walk}.mp4`).
**Six castles need generating, not five.** The manifest count is unchanged at 57 only because the
castle row was already 18.

## 14.5 THE RACE UNIT'S ARCHETYPE IS UNSPECIFIED, AND IT DECIDES FIVE BEHAVIOURS

R125 gives four stat numbers. The creature fan-out branches on **config flags**, not stats:

- `hostTick.ts:778-782` — `targetsStructures` picks the goblin branch (shape targeting, units-first, castle march).
- `hostTick.ts:899-961` — the fall-through is `isChewer = sourceSpawnerId !== null`. ⛔ **A castle unit with `sourceSpawnerId === null` lands in the VOLTKIN arm and will eat its own owner's bonds** (`enemyOnly = false`).
- `hostTick.ts:845` — `isRetreatWindow` has exactly one caller, inside the `targetsStructures` branch. **A non-`targetsStructures` race unit gets no walk home at all.**
- `hostTick.ts:971-1011` — `selfExplode` routes two different detonation paths.
- `creatureLifecycle.ts:228-231` — the cap bucket is `type === 'chewer' ? underChewerCaps : underGoblinCaps`.

**Copy `GOBLIN_MELEE_CONFIG` and you inherit `targetsStructures: true`** — which is what makes retreat,
standoff spread and shape-targeting work. Copy the chewer and you get a unit that never walks home and
eats friendly connectors. **Choose deliberately and write the reason at the config.**


---

# 15. W1-A — THE EXACT IMPLEMENTATION. COPY THIS.

Researched against the live tree so the executing session does not re-derive it. **Scope: the race
token, its default, serialization, the wire, and the colour audit. NOT the selection UI** (that is
W1-A item 5, and it depends on §14 B3's transport decision).

⚠ **Run `npm ci` first** — `node_modules/` may be absent, and both `typecheck` and `vitest` fail
spuriously without it.

## 15.1 `src/state/races.ts` — NEW FILE, SHIP THIS VERBATIM

```ts
/**
 * SPARK — W1-A — the RACE ROSTER, in a module with NO SIDE EFFECTS.
 *
 * ## ⛔ WHY THIS IS ITS OWN FILE, AND IT IS NOT ORGANISATIONAL TIDINESS
 *
 * `state/goblinKinds.ts` was carved out of `godlyRecipes/goblinTower.ts` after that module's
 * tail-call to `registerRecipe` fired for essentially the whole codebase — because `world.ts`
 * reaches the reducer that wanted the map. Its header records the measured consequence: the
 * `?worker=1` bots match never left TITLE, with 198 polls throwing during boot, and *nothing about
 * the file that caused it looked wrong*.
 *
 * The race table has strictly WIDER reach than that map did — reducers, the serializer, the lobby
 * and every renderer that paints an owner colour all need it. Same trap, bigger blast radius.
 *
 * ⭐ RACE IS PRIMARY. COLOUR IS DERIVED — at construction, not by a getter. `Player.color` SURVIVES,
 * because `rainbowLifecycle.applyTriggerRainbow` rewrites it in place for eight seconds and must not
 * rewrite the race. `color` is "what this seat looks like right now"; `raceId` is "who this seat is".
 *
 * ⚠ `Record<RaceId, …>` EVERYWHERE, NEVER AN ARRAY LITERAL OF IDS — a Record is
 * exhaustiveness-checked by tsc; an array is not (the `ALL_BLUEPRINT_IDS` trap).
 *
 * Pixi-free, DOM-free, World-free, and it registers nothing.
 */

import { SparkType } from '../constants.ts';

/** The six races (SPARK_RACES_SPEC.md §2, LOCKED). */
export type RaceId = 'vampires' | 'nagas' | 'mummies' | 'zombies' | 'orcs' | 'demons';

/**
 * ⚠ ORDER IS LOAD-BEARING. Index i is the race whose colour is `PLAYER_COLORS[i]`, i.e. the race a
 * seat gets when nobody chooses. Reordering silently reassigns every default.
 */
export const ALL_RACES: readonly RaceId[] = [
  'vampires', // crimson
  'nagas',    // cyan
  'mummies',  // yellow
  'zombies',  // green
  'orcs',     // orange
  'demons',   // magenta
];

/**
 * ⭐ RACE → IDENTITY COLOUR. These six values ARE `PLAYER_COLORS`, in order — duplicated as literals
 * rather than imported and indexed, deliberately. `races.test.ts` asserts the equality as a
 * TRIPWIRE: a palette retune reddens that test and forces a decision about the races, instead of
 * silently redefining six of them.
 */
export const RACE_COLORS: Readonly<Record<RaceId, number>> = {
  vampires: 0xff3b6b,
  nagas: 0x3bd7ff,
  mummies: 0xffe23b,
  zombies: 0x44ff5e,
  orcs: 0xff8c1a,
  demons: 0xd73bff,
};

/**
 * ⭐ RACE → FEED SHAPE (R109). The shape this race's tier-3 tower is fed, and — per R119 — the shape
 * the tower is BUILT from.
 *
 * ⛔ NOT `GOBLIN_FEED_MAP` AND MUST NOT BE CONFLATED WITH IT. That map is
 * `Record<SparkType, CreatureType>` and runs the other direction: the goblin tower is global and
 * decides its output at feed time. This is one race, one shape, one unit.
 */
export const RACE_FEED_SHAPE: Readonly<Record<RaceId, SparkType>> = {
  vampires: SparkType.Triangle,
  nagas: SparkType.Square,
  mummies: SparkType.Line,
  zombies: SparkType.Circle,
  orcs: SparkType.Dot,
  demons: SparkType.Spiral,
};

/**
 * ⭐ THE DEFAULT, AND THE ONLY ONE. A seat that never chose gets the race for its seat colour —
 * R45's *"PLAYER_COLORS[seat] is only ever a DEFAULT assignment"*, restated in race terms. This is
 * what keeps solo, vs-bots, a stale peer's roster and every pre-existing save working with ZERO UI.
 *
 * ⛔ DERIVED FROM THE SEAT, NEVER FROM THE HEX. A colour→race reverse lookup breaks the moment the
 * rainbow shuffle remaps `player.color` (§14 B4).
 *
 * Modulo, not a bounds check: total today and total if either constant moves.
 */
export function defaultRaceForSeat(seat: number): RaceId {
  const n = ALL_RACES.length;
  return ALL_RACES[((Math.trunc(seat) % n) + n) % n]!;
}

/** Narrowing guard for a value off the wire or off disk. Fail-closed. */
export function isRaceId(v: unknown): v is RaceId {
  return typeof v === 'string' && (ALL_RACES as readonly string[]).includes(v);
}
```

## 15.2 `Player.raceId` — `src/game/player.ts`

**Interface** — insert after `castleHp` (`:57`), before `raidProgress` (`:63`):
`raceId: RaceId;` — required, mutable (host arbitration may reassign before Begin), documented as
serialized-but-not-hashed following `raidPoints`.

**`makeIdlePlayer` (`:134`)** — add a fourth parameter **with a seat default**, which is what keeps
all ~95 test fixtures compiling:
```ts
raceId: RaceId = defaultRaceForSeat(id),
```
and `raceId,` in the returned literal.

**⛔ BOTH CARRY-FSM RECONSTRUCTIONS.** The exported names are **`pickup` (`:160`)** and **`drop`
(`:199`)** — not `fsmPickup`/`fsmDrop`. Both rebuild the player wholesale; add `raceId: player.raceId,`
beside `castleHp: player.castleHp,` in each. tsc catches an omission here because the field is
required — but the comment goes in anyway, as the third entry in a documented pattern.

**Other construction sites:** `grep -rn "makeIdlePlayer" src/` → 106 hits / 51 files. Only three are
production, and **two need no edit** (`world.ts:462` seat 0 → vampires/crimson; `gameMode.ts:260`
legacy 1v1 seat 1 → nagas/cyan — both behaviour-identical). The third is §15.7.

## 15.3 Serialization — `src/state/save.ts`

| Site | Line | Change |
|---|---|---|
| `SerializedPlayer` | after `castleHp?` (`:441`) | `raceId?: RaceId;` — additive-optional, emitted only when non-default |
| deserialize (`applySnapshotCore`) | after `castleHp:` (`:1595`) | `raceId: isRaceId(p.raceId) ? p.raceId : defaultRaceForSeat(p.id),` |
| serialize (`serializePlayer`) | after the `castleHp` line (`:1763`) | `...(p.raceId !== defaultRaceForSeat(p.id) ? { raceId: p.raceId } : {}),` |

⛔ **`isRaceId` first.** This value crosses a trust boundary as a bare string; an unvalidated
assignment puts a non-race into `RACE_COLORS[...]` and paints `undefined`.
⛔ **Never a hardcoded fallback.** `applySnapshotCore` runs on **every NetSnapshot apply**, so a wrong
default resets every player's race on every client frame — the S151 P2 bond-deserializer defect.
⭐ `netSnapshot` derives from `snapshot()` by destructure-and-drop (`:1078-1090`), so **the field
reaches the wire with no further edit.**

## 15.4 The wire — `src/net/protocol.ts`

- **`RosterEntry` (`:805`)** — add `readonly raceId?: RaceId;` after `ready`.
- **`isValidRoster` (`:1199-1222`)** — one line after the `ready` check:
  `if (r.raceId !== undefined && !isRaceId(r.raceId)) return false;`
  ⭐ This single edit covers **both** `START_GAME_SIGNAL` and `LOBBY_PRESENCE` — they share the
  validator by design (`:853`).
- **`StartGameMsg` / `LobbyPresenceMsg`** — **no interface change**; both already carry
  `readonly RosterEntry[]`. Update `LobbyPresenceMsg`'s "PURELY COSMETIC" docblock (`:846-854`): the
  beacon is now the carrier for claim resolution, though the graceful-degradation argument survives.
- **`CLAIM_RACE`** — ⛔ **NOT an intent (§14 B3).** Follow `LobbyReadyMsg` (`:906-909`): new
  `ClaimRaceMsg` kind, added to the `NetMessage` union (`:911-921`), a `parseNetMessage` arm rejecting
  unless `isRaceId`, a `session.lobbyRaces: Map<string, RaceId>` (init `session.ts:152`, clear `:207`),
  and a handler beside `hostHandlers.ts:389` that arbitrates and calls the presence broadcast itself.

## 15.5 The six bump sites — 38 → 39

| # | File:line | Edit |
|---|---|---|
| 1 | `protocol.ts:454` | `PROTOCOL_VERSION = 39 as const` |
| 2 | `protocol.ts:~452` | new narrative block in `bumped 38->39:` form (gated by regex `/bumped\s+(\d+)\s*->\s*(\d+)/g`) |
| 3 | `protocol.ts:~626` | compact `HelloMsg` list entry, chronological, at 3-space `   * ` indentation |
| 4 | `protocol.ts:659` | `readonly protoVersion: 39;` — the tsc tripwire |
| 5a | `protocol.test.ts:75` **and `:93`** | the pin **and its title** |
| 5b | `e2e/smoke.spec.ts:90` | `LOCAL_PROTO_V = 39`. ⛔ Do **not** touch `:91` — `NEWER_PEER_V` must stay derived |
| 6 | narrative + `LOCKED_DECISIONS.md` | **the SESSION label.** `W1-A` is a SPEC id. Write `W1-A (S<n>)` so nobody reconstructs a session named "W1-A" |

**The bump argument to write:** both fields are additive-optional in shape, and *that is why they
bump* — S150's *"a field a stale peer can silently DROP is more dangerous than one it cannot parse"*,
the `Primitive.origin` 26→27 class. A v38 joiner drops the key, falls back to its own
`defaultRaceForSeat`, and paints every castle a different colour from the host for the whole match
with nothing red on either side.

## 15.6 `src/net/lobbyRoster.ts`

`reconcileLobbySeats` — **no change** (a seat is assigned, a race is claimed; keep the authorities
separate). `buildLobbyRoster` (`:97`) and `buildMatchRoster` (`:121`) each take two new defaulted
parameters (`raceByPeer`, `selfRace`) and derive `color: RACE_COLORS[raceId]`. An empty map reproduces
the pre-W1-A roster **byte for byte**.

⛔ **`buildMatchRoster` line 129 is §14 B6** — the race must follow the **peer**, not the dense seat.
`PLAYER_COLORS` becomes unused in this file; drop the import (knip is at zero here).

Call sites: `quickmatchGate.ts:77`, `hostHandlers.ts:443`. ⚠ **Read `rosterWithReady` in
`quickmatchGate.ts` before editing** — if it rebuilds entries rather than spreading them, the race is
dropped at Begin **in quickmatch rooms only**.

## 15.7 START_GAME — `src/state/gameMode.ts`

**(a) `StartGameAction.roster` (`:49`)** — add `readonly raceId?: RaceId;` to the structural entry
type. Optional here, required on `Player`: absence means "this caller did not choose", and keeps ~10
test dispatch sites compiling.

**(b) `applyStartGame` (`:236-253`)** — resolve once, and **add the `else` arm (§14 B7):**
```ts
const raceId = entry.raceId ?? defaultRaceForSeat(entry.seat);
if (!world.players.has(pid)) {
  const p = makeIdlePlayer(pid, entry.color, radialSpawnPos(entry.seat, total), raceId);
  ...
} else {
  // ⛔ seat 0 ALWAYS already exists (makeWorld). Without this the host's own chosen race is
  // discarded at Begin while every joiner sees it — a one-sided, never-red colour desync.
  const existing = world.players.get(pid)!;
  existing.raceId = raceId;
  existing.color = entry.color;
}
```

**(c) ⛔ TWO `.map` PROJECTIONS THAT SILENTLY DROP THE FIELD** — tsc will not complain, because the
target type has it optional. **These are the single likeliest place for this feature to half-land:**
- `hostHandlers.ts:507` — `roster.map((e) => ({ seat: e.seat, color: e.color }))`
- `clientHandlers.ts:360` — same shape

Both need `, raceId: e.raceId`.

## 15.8 The `PLAYER_COLORS` audit — 4 real edits, not 15

96 grep hits; 23 non-test code sites. The seam R45 cut in advance means colour identity already
funnels through `Player.color` and `RosterEntry.color`, so there are **exactly four** places to change
— **a1–a4, all in `lobbyRoster.ts` (`:103`, `:104`, `:126`, `:129`)**.

**Deferred to the UI item:** `botSetupOverlay.ts:196` (bot swatch) and `main.ts:1121` (vs-bots roster)
— correct defaults today, must become race-derived when the cyclers land.

**Leave alone — these are the design working:** `creatureAI.ts:111` and `goblinRenderer.ts:294` and
`creatureLift.ts:83-90` all read `owner?.color` FIRST and fall back to the palette only when the owner
is absent. ⭐ `creatureAI.ts:92-95` already states the rule: *"read the owner's LIVE colour (single
source of truth), NOT the static palette."* Also leave: `rainbowLifecycle.ts:77` (§14 B4),
`gathererRenderer.ts:91` (a hue-cycling animation), `ui.ts:715` (pool **sizing**), and all of
`titleScreen.ts` / `lobbyScreen.ts` (chrome, no seats).

⚠ **One site needs reading before classifying:** `gathererRenderer.ts:94` `seatColor()`. If any caller
paints an **owned** gatherer or keep it is a real edit; if it only feeds `keepRainbowTint` it is not.

**Five stale comments to correct:** `constants.ts:59-72` (R45 — the future arrived; point at
`races.ts`), `protocol.ts:218` and `:536` (same pointer), `lobbyGeometry.ts:23` and
`lobbyStateMachine.ts:317` (*"seat i → PLAYER_COLORS[i]"* — now only the default),
`seatRack.ts:7`. ⚠ Also stale and unrelated: `ui.ts:712-714` still says 7 seats / 6 cap (R41 made it
4/4).

## 15.9 Tests

**New:** `src/state/races.test.ts` (exhaustiveness, the `RACE_COLORS === PLAYER_COLORS` tripwire,
`defaultRaceForSeat` totality, `isRaceId` rejection) · `src/net/raceWire.test.ts` (modelled on
`src/state/layoutWire.test.ts`, which exists because the wire path had been *read* not *proven*) ·
`src/net/raceClaim.test.ts` (arbitration via a pure helper, folded like `reconcileLobbySeats`).

**Extend:** `game/player.test.ts` (pickup/drop preserve `raceId`) · `state/save.test.ts` (round-trip,
**byte-identity when all-default**, absent→default, garbage→default) · `net/lobbyRoster.test.ts`
(⭐ **a claimed race survives dense compaction**) · `net/protocol.test.ts` (the pin + validator cases).

**Do not touch:** `net/protocolVersionSync.test.ts` — it is the gate and must be left free to fail.
`state/benchGate.test.ts:52-55` asserts set-equality against `CLIENT_INTENT_TYPES` and will redden by
itself if the intent route is taken without a `BENCH_INTENT_POLICY` row.


---

## 10. THE TRAPS — every one of these has already cost this project a session

1. **⛔ `ALL_BLUEPRINT_IDS` IS HAND-WRITTEN AND HAS ALREADY SPRUNG.** S151 P3 added `goblinTower` to
   the `BLUEPRINTS` record — so `blueprintFor` resolved it, it ignited, it tore down correctly, and
   **every test passed** — while the seven-entry array still had six. The tower was fully implemented
   and *never appeared in the build panel*. A `Record<GodlyId, …>` is exhaustiveness-checked by tsc;
   an array literal of the same ids is not. **30 new towers is 30 chances to repeat this.** Consider
   deriving the list from the record as the first act of Wave 2.
2. **⛔ `codexCopyFor` HAS A SILENT FALLBACK.** `render/codexPresentation.ts:115` takes a `string` and
   returns `{ name: ID.toUpperCase(), power: '', recipe: '???' }` for anything unmapped. A new tower
   with no codex entry renders **"???"** and nothing fails. Add the entry with the tower, or tighten
   the signature to `GodlyId` so tsc catches it.
3. **⛔ NEVER IMPORT A RECIPE MODULE FROM SHARED DATA.** Every recipe module calls `registerRecipe` at
   its tail, and `world.ts` reaches the blueprint reducer — so a value import populates the registry
   for essentially the whole codebase. It has broken the project twice: in S144 it silently rewired
   `recipeStillSatisfied`; in S151 P3 the `?worker=1` bots match never left TITLE with 198 polls
   throwing at boot. **Neither symptom points at the file that caused it.** Shared data goes in a
   side-effect-free leaf module — `state/goblinKinds.ts` is the pattern, `state/races.ts` must follow it.
4. **⛔ A GREEN SUITE IS NOT EVIDENCE FOR RENDER WORK.** The FIGHT banner shipped permanently
   oversized because `onPhaseEdge` set scale 1.6 and nothing decayed it. Unreachable by any test in
   the repo. **Capture a frame and look at it.** This wave is mostly render work.
5. **⛔ A HANDOFF NUMBER IS A CLAIM, NOT A MEASUREMENT.** The S158 handoff said 3244/3244; re-measure
   at boot before trusting it.
6. **⛔ "MY FIXTURE IS NOT THEIR BOARD."** S158 measured the drone tower producing; the owner said
   flatly it was not — both probes used an isolated hub on an empty board, and on a real board one
   bonded shape deleted the tower within half a second. Test race towers **on a populated board**.
7. **⛔ THE FOUR-SITES WARNING — AND IT IS NOT IN `blueprints.ts`.** The audit found this
   misattributed. The four-sites warnings live in **`src/game/primitive.ts:54`**,
   **`src/state/defenders/defender.ts:164`** and **`src/state/save.ts:529`**. `blueprints.ts`
   documents two *different* traps (bill-drift and import side effects). Read the right file.
8. **⛔ THE FOOTER PORCH CONSTRAINT.** `render/footerBand.ts:7-24` documents, and its test asserts,
   that chips are centred because the `QUADRANTS_4P` seat-2/seat-3 castle porches sit at x=1790 and
   x=130 *inside* the footer band. Anything added to the footer must clear them and carry its own
   porch assertion.
9. **⛔ DO NOT RE-BUCKET THE FOOTER ON BONDS.** R66 settled it: the chip number is the SHAPE count.
   Re-bucketing would move every chip players have already learned.

---

## 11. STILL GENUINELY OPEN — ASK, DO NOT GUESS

Most of the original list was closed by the owner on 2026-09-02. What remains, ranked by when it bites.

### ⚠ NEEDED BEFORE THE WAVE THAT USES IT

1. **The race-unit stat line itself.** R117 says all six share ONE stat line — but nobody has said
   what it is. HP, ATK, DEF and PEN points, on the `state/stats.ts` ladders. A first pass can be
   proposed against the existing roster (`CHEWER_HP = 1`, goblins at 1, `VOLTKIN_HP = 8`) and the
   owner rules on it; it is a number, not a mechanic, so it does not block starting.
2. **Race perks for waves 10, 15, 20.** Eighteen perks — three more per race. The general track is
   already settled (DEF → HP → PEN). Deliberately deferred by R112 with a named trigger: **ask once
   wave 5 ships.** Not a gap.

### 🕓 LATE — the owner has explicitly said "one of the last phases"

5. **The six race castle-upgrade branches (Layer 2).** Owner: *"don't worry about them right now."*
6. **Layer 1 upgrade numbers.** HP starts at 1500; the ceiling, the step costs, and the DEF/ATK/range
   caps are all unset. Owner: *"this will be, like, the last step."*
7. **Whether castle attack shapes genuinely diverge.** They must LOOK different (R94) and the owner is
   already sketching them — *"maybe the mummy one shoots a ball of mummy wrap, maybe the naga one
   shoots lightnings"* — but whether the hit geometry itself differs (cone / chain / arc) stays with
   the balance pass. §3.2.
8. **A 7th/8th colour.** Possible someday, explicitly not now (R114).

### ✅ CLOSED on 2026-09-02 — do not re-ask

Race roster · additive-not-replacing · race exclusivity · the tier and mechanic of the signature tower ·
the feed-shape map · castle emits vs. tower feeds · the general track order · draft visibility ·
the no-choice default · bots drafting · perk stacking · the vampire perk · ghosts and ice giants.

---

## 12. DEPENDENCY ORDER

```
W1-A race field + selection ──► W1-B castle art ──► W1-C passive spawn ──► W1-D upgrades L1
      │                                                    │
      │                                                    └── the one mechanical difference
      └── everything downstream needs raceId on the wire

W1-A ──► W1-E THE TECH DRAFT (§9) ──┐   needs ONLY raceId; every perk buffs content that
         4 cheap perks + the shell  │   already ships, so it does NOT wait for W2 towers
                                    │
W1 complete ──► W2 six signature towers ──► [PLAYTEST] ──► W3 the grid, tier by tier
                                                  │
                                                  └── Layer 2 race upgrades, the naga + zombie
                                                      perks, and real attack geometry land here,
                                                      on measurement
```

Every arrow is a hard dependency. **W1-A is first and almost alone** — every later surface reads
`raceId`. The playtest gate before W3 is not optional: it is the whole reason for R98's wave sizing.

⭐ **The tech draft is the highest identity-per-effort item in this document.** It needs `raceId` and
nothing else, and four of its six perks are single constants. If the schedule slips, build it before
the signature towers, not after.

---

## 13. THE ONE-PARAGRAPH SUMMARY

Six races, one per player colour, chosen in a real selection screen that makes all six playable. Every
castle starts identical at 1500 HP and stays stat-identical forever; races differ in how they look,
what their castle passively spawns, which unique towers they can build, which upgrade branch they can
buy into, and — every fifth wave — which of two offered perks they draft. Victory points buy castle
upgrades on a universal ladder every race shares, plus a race-only branch that may never touch a
shared stat axis; and because victory points are also the win condition, upgrading is a genuine trade
against winning. The tech draft is separate, free, and touches only the army and the towers, never the
castle. Ship identity and the draft first, then one signature tower per race, then the full per-tier
grid only after the owner has actually played it.
