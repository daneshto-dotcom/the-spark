# SPARK — CASTLE RACES & UNIQUE TOWERS: EXECUTION SPEC

**Status:** OWNER-RULED 2026-09-02 · NOT IMPLEMENTED · ready to execute A→Z
**Authored:** from a live owner brainstorm, against a full audit of `src/`, the roadmaps and the handoff record
**Supersedes:** the `CASTLE_BUILD_SPACE_DESIGN.md` § ADDENDUM race table (2026-08-27) — **that table's colours were wrong** (see §5.1)
**Baseline at authoring:** commit `1e5b261` · `PROTOCOL_VERSION 38` · vitest 3244/3244 across 204 files · bundle 900 KiB cap

---

## 0. HOW TO USE THIS FILE

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

## 1. OWNER RULINGS — R93 THROUGH R115

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
| **R111** | **THE GENERAL DRAFT TRACK WALKS THE FOUR STAT AXES**, in this order: wave 5 = ATK · wave 10 = DEF · wave 15 = HP (of spawned units) · wave 20 = PEN. ⚠ The owner said *"10%"* for each; **percentages do not exist in this stat system** — see §9.8. The ORDER is ruled; the magnitude is not yet expressible. |
| **R112** | **BUILD ONLY WAVE 5 FIRST.** The race perks for waves 10/15/20 are deliberately deferred: *"let's first do level five, and then as we go… Claude can ask me, okay what is for the next tier."* **This is a named trigger, not an oversight** — ask once wave 5 ships. |
| **R113** | **BUFFS RENDER BESIDE THE PLAYER NAME**, one icon per drafted wave, stacking left to right — *"player one, this is the buff he got for this, this is the buff he got for level ten."* Each buff needs its own generated icon. |
| **R114** | **GHOSTS AND ICE GIANTS ARE OUT** — not parked. *"There's no more ghost and ice giants."* A 7th/8th colour is possible someday (*"we might add thirty colors, who cares"*) but is explicitly NOT now. |
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
| Crimson | `0xff3b6b` | **Vampires** | bats | **Triangle** `#FF3B3B` | `goblin-batrider` atlas exists and already reads vampiric |
| Cyan | `0x3bd7ff` | **Nagas** | — | **Square** `#3B5BFF` | none |
| Yellow | `0xffe23b` | **Mummies** | — | **Line** `#FFE066` | none |
| Green | `0x44ff5e` | **Zombies** | **zombie hound** | **Circle** `#3BFF7A` | ✅ `assets-source/zombie-castle/` — idle + walk clips + still. **Attack clip failed twice on veo backpressure (CF-S153-c) and is still missing.** |
| Orange | `0xff8c1a` | **Orcs** | — | **Dot** `#FFFFFF` | none |
| Magenta | `0xd73bff` | **Demons** | — | **Spiral** `#A23BFF` | none |

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
| Footer band | `render/footerBandModel.ts` | **Derived from the registry**, buckets on `blueprintCost`. New towers and new tiers appear on the bar with no edit. |
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

### W1-C · THE PASSIVE CASTLE SPAWN — one session · PROTOCOL 39 → 40

**Objective.** The one mechanical difference in Wave 1: your castle produces your race's unit.

**Work.** A per-seat, tick-deterministic emitter on the castle anchor — same cadence discipline as
`state/spawners/spawnerLifecycle.ts`, seeded RNG only, host-authoritative. Cadence and unit are keyed
on `raceId`. Zombies emit the hound (art exists); the other five need a unit each.

⚠ **Identical cadence and identical unit stats across races in this wave** (R94). The *unit* differs;
its numbers do not. Divergent numbers are the balance wave.

**Tests.** Differential: host and `?worker=1` mirror agree bit-for-bit across a full BUILD→FIGHT→BUILD
cycle with spawns firing. Unit: cadence is derived from `world.tick`, never wall-clock. Unit: a
destroyed castle stops emitting.

**Exit gate.** Six races each emit their own unit; hashes identical host-vs-worker; a full match plays.

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

- **3 shapes, 2 bonds.** Under R66 the footer number is the SHAPE count, so "tier 3" = 3 shapes.
  Geometry: a 1-hub + 2-leaf mini-star of that race's feed shape (§2). Needs a blueprint, but they
  are six instances of one pattern, not six designs.
- **Fed, goblin-tower style** — put in the race's shape, get one of the race's units. Reuse
  `state/goblinTowerFeed.ts`; do not write a second feed path.
- **Unlike the goblin tower, it accepts exactly ONE shape** — its race's. The goblin tower maps all
  six shapes to six outputs; this maps one shape to one output.
- **The unit must be weak.** Owner: *"obviously it has to be a pretty weak unit for all of them
  because if it's only three connectors."*

This collapses "six bespoke towers" into **one tower pattern instantiated six times.** It is by far
the cheapest version of Wave 2 and it is the owner's own design.

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
| 4 | STINK TOWER · GOBLIN TOWER |
| 5 | PENTAGRAM |
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

One wave = BUILD + FIGHT = `2 × PHASE_DURATION_TICKS` = 180 s. So the first draft lands **~15 minutes
in**, the second at 30. Whether a real match reaches wave 5 is unknown — the balance pass (S157+)
has not run, and the win threshold is 1500 points.

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

⛔ The owner said "+10%" for each. **Percentages are not representable in this stat system** — see
§9.8, which is a live blocker with three options for the owner to pick from. The ORDER above is ruled
and can be built against; the magnitude cannot, yet.

**The race track past wave 5 is deliberately unwritten (R112).** Build wave 5, then ask. This is a
named trigger, not a gap.

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

- Unit: the draft fires at waves 5, 10, 15 and **not** at 4, 6, 9 — driven through the real
  `hostTick` wave edge, not by calling the trigger directly.
- Unit: a perk set round-trips through save/load and through the wire; a joiner mid-match sees every
  seat's perks.
- Unit: the no-choice deadline auto-assigns the general option and the phase advances **on time**
  (this is the R106 test — it proves the sim never waits).
- Unit: a naga sub-drone does **not** split (R103), and a zombie revives exactly **once** (R105).
- Differential: host vs `?worker=1` mirror agree bit-for-bit across a cycle with a revive, a carpet
  drone detonation and a demonic Voltkin zap all firing.
- Tripwire: **no tech perk modifies a castle stat** (R104), mirroring the R97 tripwire in §3.3.

### 9.8 ⛔ BLOCKER — "+10%" IS NOT EXPRESSIBLE IN THIS STAT SYSTEM

R111 rules the general track walks ATK → DEF → HP → PEN. The **order is settled**. The **magnitude is
not**, and it cannot be, because this is the same wall §9.4 hit:

- **HP and ATK are integer POINTS** on a flat ladder, design range 1..12 (`state/stats.ts`).
- **DEF and PEN are integer points** indexing the multiplier ladder `1 + 0.2n` — pinned twice by the
  owner as **1.4, not 1.44**, i.e. linear, not compounding.
- Everything is carried in **fifths** so it is exactly integer, because `damageEntity` **throws** on a
  fractional amount and the host must match the `?worker=1` mirror bit-for-bit.

So "+10% attack" on a chewer (`CHEWER_ATK = 1`) is 1.1 — which does not exist. And the smallest legal
step is coarse: **+1 ATK point on a 1-ATK unit is +100%**, and one DEF/PEN point is a flat **+20%**.

**Three ways out. The owner picks; do not choose one silently.**

| Option | What the draft grants | Granularity | Verdict |
|---|---|---|---|
| **A** | **+1 point** on the axis | +100% for a 1-point unit; +20% on DEF/PEN | Honest to the system, zero new machinery — but brutal on 1-HP units |
| **B** | **Widen the ladder** — re-express units in fifths so a "point" is 5× finer, then +10% becomes a legal integer step | fine | Correct long-term, but it is a **rewrite of every unit stat in the game** and belongs in the balance pass, not here |
| **C** | The draft grants a **flat +1 PEN point** regardless of the named axis (a uniform ×1.2 on damage) | +20% | Cheapest, integer-exact, but collapses R111's four distinct axes into one |

⚠ **Do not implement a float multiplier and round it.** That is the exact defect the fifths system
exists to prevent, and the rounding would differ nowhere visibly until a host and a worker disagreed.

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
7. **⛔ THE FOUR-SITES WARNING.** `state/blueprints.ts` documents that a change here touches four
   places and that doing three of four leaves the tests green. It caught two separate priorities in
   S158 alone. Read it before every tower.
8. **⛔ THE FOOTER PORCH CONSTRAINT.** `render/footerBand.ts:7-24` documents, and its test asserts,
   that chips are centred because the `QUADRANTS_4P` seat-2/seat-3 castle porches sit at x=1790 and
   x=130 *inside* the footer band. Anything added to the footer must clear them and carry its own
   porch assertion.
9. **⛔ DO NOT RE-BUCKET THE FOOTER ON BONDS.** R66 settled it: the chip number is the SHAPE count.
   Re-bucketing would move every chip players have already learned.

---

## 11. STILL GENUINELY OPEN — ASK, DO NOT GUESS

Most of the original list was closed by the owner on 2026-09-02. What remains, ranked by when it bites.

### ⛔ BLOCKS BUILDING SOMETHING

1. **The "+10%" magnitude (§9.8).** The general draft track's ORDER is ruled (R111) but percentages
   are not representable in an integer-fifths stat system. Three options are laid out in §9.8 —
   **the owner picks one.** Blocks the tech draft's general option, nothing else.

### ⚠ NEEDED BEFORE THE WAVE THAT USES IT

2. **The five missing race units.** Zombies have the hound. Vampires are named as bats (the
   `goblin-batrider` atlas exists). **Nagas, mummies, orcs and demons have no unit at all** — and each
   race's unit is now needed TWICE over (the castle emits it, the tier-3 tower makes more). Blocks
   W1-C and W2.
3. **The castle spawn cadence and its phase gate.** "~30 s" is a dial. But also: does the castle emit
   during BUILD, during FIGHT, or both? The phase split already stops the quarry in FIGHT and holds
   defenders outside it, so this is a real mechanical choice, not a number. Blocks W1-C.
4. **Race perks for waves 10, 15, 20.** Deliberately deferred by R112 with a named trigger: **ask once
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
