# SPARK — RACE ZONE BACKGROUNDS & TIER-9 BOSS TOWERS

**Status:** OWNER-DIRECTED 2026-09-03 · **NOT SCHEDULED** · captured in S162, unbuilt
**Owner's own scheduling:** *"this is not for the current session and not for the next one but maybe
for the one after"* — so this file exists to hold the brief, not to start it.
**Depends on:** races W1-A (shipped S160) + W1-B (shipped S161) — both landed, so both features are
buildable on top of the race token, the six castle atlases and the race picker.

---

## The brief, verbatim

Quoted in full because the owner's rulings are the specification, and paraphrase is how they drift.

> 1) each players quarter (zone) needs to have the background art style in its race's art (you know
> what i mean)? or at least so they can turn in on and off between their race's background and the
> black space we have now. Instead of all being deep black space we would have something like
> zombies - ruins/swamp, orcs barracks in badlands, demons - hell. nagas - atlantis but more military
> and cruel looking cuz they all mean. mummies - desert. and all the art needs to look in the current
> style (we have already generated cool looking player tags for the lobbies (when choosing race) so
> in that style but it doesnt have to all be so colorful... a little more realistic with some details
> in the color of the player. it all has to look epic and sick and really intense (according to the
> races style and lore and you get it i think). it adds interest. background is partially transparent
> thorugh so that you can still see your towers, structures & connectors built and creatures spawned.
> we will have to generate lots of new images!

> 2) Need more unique towers for the races, we will build a tier 9 tower for each of them !! it will
> take 9 of the same shape to buuild - the race shape and it will create a "boss" tower that spawns
> the boss. the tower would spawn 1 boss and then the tower would crumble with a cool video generated
> effect - not NOT lokie voltkin! the effect should not be a cutscene like voltkin but in-game tower
> that spawns-releases the boss, and then crymbnles down in a cool video cinematic! should take no
> more than 8 sec for the whole shebang. vamps would spawn - Vlad (obv), Mummies - Pharaoh, etc
> etc.... the bosses will have 2 unique attacks and skills and will like untill they die. if they
> dont die by end of this turns fight phase they go back to castle and attack again next phase until
> they die. i will give boss specs and skills later.

---

## A · PER-RACE ZONE BACKGROUNDS

Each seat's quarter of the board is painted in its race's world instead of deep black space.

| Race | Owner's brief | Colour (`RACE_COLORS`) |
|---|---|---|
| Zombies | ruins / swamp | green `0x44ff5e` |
| Orcs | barracks in badlands | orange `0xff8c1a` |
| Demons | hell | magenta `0xd73bff` |
| Nagas | *"atlantis but more military and cruel looking cuz they all mean"* | cyan `0x3bd7ff` |
| Mummies | desert | yellow `0xffe23b` |
| Vampires | *not stated by the owner* — **deduced in §D Q1: Carpathian mountain night, mist, dead trees, iron fencing, a blood moon** (the grounds of the keep already in the picker banner) | crimson `0xff3b6b` |

**Art direction, from the brief:**

- Same style as the **race banner tiles already generated for the picker** (`RACE_BANNER_SRC`,
  `public/art/banners/banner-<race>.jpg`), which the owner calls out as the reference — *"we have already
  generated cool looking player tags for the lobbies"*.
- **Less colourful than those banners.** *"a little more realistic with some details in the color of
  the player."* So: desaturated ground, with the seat's identity colour surviving as accents.
- *"epic and sick and really intense"*, true to each race's lore.
- ⛔ **Partially transparent**, so towers, structures, connectors and creatures stay readable on top.
  This is a legibility constraint, not a style note.
- **Toggleable**: *"or at least so they can turn in on and off between their race's background and
  the black space we have now."* The black board must remain a first-class option.

### What this touches

- The board is quartered per seat already — `radialSpawnPos(seat, total)` places seats and
  `MAX_PLAYERS = 4`, but there are **six races**, so six backgrounds are needed regardless of the
  four-seat cap (any seat may pick any race since S161 P6).
- Fog of war interacts with this. S162 measured (CF-S161-b) that an **enemy-side castle already
  renders dimmer than your own — 30 vs 50 mean lit-pixel value on identical art**. A detailed
  background under fog will lose more than a black one did; the lever is sprite alpha/tint under fog,
  not the art itself.
- ⚠ **Bundle charter.** Big art goes to `public/`, never the bundle (LOCKED_DECISIONS.md § Bundle
  charter). Six full-board backgrounds are large; they must be lazy-loaded per race actually in play,
  not all six on boot.

---

## B · TIER-9 BOSS TOWERS

One per race. **Nine of the race's own shape** builds it; it releases exactly one boss and then
crumbles.

The race shape is already defined and load-bearing — `RACE_FEED_SHAPE` in `src/state/races.ts`:

| Race | Shape | Boss |
|---|---|---|
| Vampires | Triangle | **Vlad** |
| Nagas | Square | **Kraken** |
| Mummies | Line | **Pharaoh** |
| Zombies | Circle | **Whopper** — see the naming note below |
| Orcs | Dot | **Chieftain / Warlord** |
| Demons | Spiral | **Lucifer** |

⭐ **ALL SIX ARE NOW OWNER-NAMED (S166).** The four that were TBD were ruled verbatim:

> *"Nagas -Kraken. Zombies - Whopper (like in resident evil), Orcs - Chieftain/Warlord, Demons -
> Lucifer. they all need to look absolutely terrifying and fucking epic and we will give them all
> unique skills and awwesome graphics for those skills and for their movements and all!"*

So the ART BRIEF is part of the ruling and not a later decision: **terrifying and epic**, with unique
skills, and generated graphics for the skills AND the movement — not just an idle/walk/attack sheet.
That is a bigger art bill than the tier-3 units carried (which are 4 rows each); budget for
per-skill effect sequences on top of per-boss locomotion.

⚠ **TWO NAMING RISKS TO SETTLE BEFORE ART, and they are different from each other.**

· **"Whopper" is a live Burger King trademark**, and it is a food-and-beverage mark rather than a
  game one — but a shipped, publicly-hosted game putting it on a creature is a trademark exposure
  rather than a copyright one, which is the more awkward kind to argue about. The owner's INTENT is
  clear and unambiguous from the reference: the Resident Evil 2 "Whopper" is a hugely bloated,
  swollen zombie brute. That CREATURE CONCEPT is fine to build — giant bloated undead is generic
  — and it is only the word that carries the risk. Cheap alternatives that keep the intent: **BLOAT**,
  **GLUTTON**, **THE SWOLLEN**, **TUMOR**. ⛔ Owner's call, not mine; recorded here so it is a
  decision rather than a discovery after 18 assets are generated.
· **The DESIGN must be original for all six regardless of name**, per §F below. "Whopper" and
  "Kraken" both have specific studio-authored looks (Capcom's and, for the kraken, several); this
  project already reworked a Totoro look-alike in S95. Public-domain lore is safe (Vlad, Lucifer,
  Pharaoh, Kraken as a myth); a studio's *rendering* of it is not.

**Behaviour, from the brief:**

1. Build nine of the race shape → the tier-9 tower exists.
2. It spawns **one** boss.
3. The tower then **crumbles**, with a generated video effect.
4. ⛔ **NOT a Voltkin-style cutscene.** *"the effect should not be a cutscene like voltkin but in-game
   tower that spawns-releases the boss, and then crymbnles down in a cool video cinematic"* — the
   game keeps running underneath it. That rules out the `godlyOrchestration` freeze/vignette path.
5. **≤ 8 seconds** for spawn + release + crumble, total.
6. The boss has **2 unique attacks/skills** and **lives until it dies**.
7. **It persists across phases**: if it survives to the end of that turn's FIGHT phase it **returns
   to the castle** and attacks again the next phase, until killed.
8. Owner will supply per-boss specs and skills later.

---

## ✅ C · THE ONE COLLISION I FOUND — **SETTLED S164 BY OWNER R132**

> **⭐ RESOLVED, AND THIS BANNER EXISTS BECAUSE THE FILE KEPT SAYING OTHERWISE.** Owner R132
> moved the NONET trigger to **12** of one shape and left **9** to the tier-9 boss tower, so the
> two mechanics no longer compete for the same shape count. `src/state/sudokuEvent.ts` reads
> `export const NONET_SHAPE_COUNT = 12;` and `hostTick.ts` cites R132 at the sweep.
>
> ⚠ Everything below is kept as the ANALYSIS that produced the ruling — it is why 12 was
> chosen — but it must not be read as open work. S165 found this file and `BACKLOG.md` both
> still asking the owner to decide something he had already decided, which is the exact failure
> the project CLAUDE.md warns about: *"Before asking for a ruling, grep the archive for it."*
> The line number cited just below is also stale: the sweep is at `hostTick.ts:512` today.

## ⛔ C · THE ANALYSIS THAT PRODUCED R132 (historical)

**"Nine of one shape" is ALREADY a trigger in this game, and it summons the sudoku minigame.**

`src/state/hostTick.ts:431`:

> `// S94 — NONET trigger sweep (host-only, once/match): a connected component of EXACTLY 9`
> `// shapes of ONE type summons the trial.`

So as specced, **building your first boss tower would also summon the NONET trial**. The NONET sweep
is once-per-match, which makes it worse rather than better: it means *the first boss of every match*
collides, and later ones do not — an inconsistency players would read as a bug.

Four ways out, for the owner to pick (Q4):

1. **Qualify the boss recipe** — nine of the race shape *plus* something NONET cannot match (anchored
   to the castle, or a required topology). Cleanest: the two triggers stop overlapping by construction.
2. **Exclude the builder's own race shape from the NONET sweep.** One condition, but it silently
   makes NONET unreachable for whichever shape you are playing.
3. **Order them** — boss wins, NONET only fires on a 9-component that is *not* a boss recipe.
4. **Let both fire.** Simplest, and probably wrong: a sudoku trial interrupting your boss summon.

---

## D · THE QUESTIONS, MOSTLY ANSWERED BY DEDUCTION

The owner's instruction when handing this over: *"if you have any questions for me about the 2
artistic directions i gave you earlier keep them for when we will be building those two things in a
few sessions - and also if tyhose questions are dumb then just think about it. you might be able to
deduce your own answer."*

Five of the six were deducible from the brief or from the tree. They are answered here as
**working assumptions** — they are MINE, not owner rulings, and any of them can be overridden with
one word when this gets built. Only **Q4** is left genuinely open, and even that has a recommendation.

### ✅ Q1 — Vampires' zone. ANSWERED: the grounds of the castle already in the picker.

Every other race got its home terrain, and the vampire race banner already shipped: a crimson gothic
keep with bats and an iron gate under a red sky (`public/art/banners/banner-vampires.jpg`, visible in
the picker — note `assets-source/race-banners/` is the SOURCE folder, not the shipped one).
The zone is the ground that castle stands on — **Carpathian mountain night: mist, dead trees, iron
fencing, a blood moon, bats.** No new decision was needed; the art direction already exists.

### ✅ Q2 — Is the tier-9 shape `RACE_FEED_SHAPE`? ANSWERED: yes.

The owner said *"9 of the same shape - the race shape"*. `RACE_FEED_SHAPE` in `src/state/races.ts` is
documented as exactly that — *"one race, one shape, one unit"* — and is the only race→shape mapping in
the codebase. Vampires Triangle, nagas Square, mummies Line, zombies Circle, orcs Dot, demons Spiral.
There was nothing to ask.

### ✅ Q3a — Does a returning boss heal? ANSWERED: no, it keeps its damage.

*"they will live until they die"* and *"go back to castle and attack again next phase until they die"*.
If it healed at the castle each phase, *"until they die"* would be unreachable for anything the
defender can out-damage in one phase — the boss would be effectively immortal, which contradicts the
same sentence. **Damage persists across phases.**

### ⚠ Q3b — One boss per match, or rebuildable? WORKING ASSUMPTION: rebuildable, one ALIVE at a time.

The tower crumbles after releasing the boss, so a second boss already costs a fresh nine of the race
shape — a real price, which is the natural cap the design already contains. Assumption:
**a seat may build it again, but may not have two of its bosses alive at once.** Flagging rather than
asserting, because it is a balance lever and the owner has boss specs coming.

### ✅ Q4 — THE NONET COLLISION. **CLOSED by owner R132 (S164): NONET is 12, the boss keeps 9.**

⚠ The four options below are the menu that was PUT to the owner. Read them as the record of a
decision, not as a question still waiting for one.

The one thing here that is not deducible, because it changes a SHIPPED feature and only the owner
gets to do that. See §C for the collision.

**My recommendation: option 3 — the boss recipe wins; NONET only fires on a 9-component that is not a
boss recipe.** It is the only option that honours the brief *verbatim* (nine of the race shape, no
extra qualifier bolted on) while keeping the sudoku trial reachable through the other five shapes.
Option 1 is cleaner in the abstract but edits the owner's own recipe, and option 2 silently kills
NONET for whichever race you happen to be playing.

### ✅ Q5 — Toggle scope. ANSWERED: per-viewer, local.

*"so they can turn in on and off"* — the subject is the player looking at the screen, not the room.
A local preference costs nothing on the wire, cannot desync two peers, and needs no protocol bump. A
match-wide setting would need all three and buys nothing.

### ✅ Q6 — Is the boss attackable during the 8-second crumble? ANSWERED: yes.

The owner ruled it directly: *"the effect should not be a cutscene like voltkin but in-game tower
that spawns-releases the boss"*. Not a cutscene means the sim never stops, so the boss is a live
entity from the moment it is released and the crumble is a renderer effect over continuing play.
⛔ This is the load-bearing constraint of feature B: it rules out the `godlyOrchestration` freeze +
vignette path entirely, and it means the 8 seconds is an ART budget, never a sim pause.

## E · WHAT ALREADY EXISTS THAT THESE BUILD ON

- `RACE_COLORS`, `RACE_FEED_SHAPE`, `defaultRaceForSeat` — `src/state/races.ts`.
- Six castle atlases + three states each — `public/art/castles/`, wired via `castleFrames.ts`.
- Race banner art in the picker — `RACE_BANNER_SRC` / `raceBanners.ts`; **the named style reference**.
- Per-race motifs (keep roofline, gatherer mark, shot VFX) — `raceMotifs.ts`, which since S162 has
  `never` guards, so adding a seventh race now fails `tsc` at every motif site.
- The tower/defender family — `defenderLifecycle.ts`; and `stats.ts`'s `DEFENDER_TARGETS` matrix,
  which S162 found is **declared but not enforced** (`defenderCanTarget` has zero callers). Worth
  settling before adding a tier-9 tower whose targeting will want to be in that table.
- ⛔ **Not** `godlyOrchestration.ts` — that is the Voltkin cutscene path the owner explicitly excluded.

---

## F · ART GENERATION NOTES (project memory, applies to both features)

- **Original style only.** Never a recognisable franchise — a Totoro look-alike shipped in S95 and had
  to be reworked. "Atlantis", "hell", "badlands" are all safely generic; a boss named **Vlad** is
  public-domain Dracula lore, but keep the *design* original rather than any studio's version.
- **Clean transparent matte.** The old sprite shipped with a visible square box, worst on attack.
- **Spike the art and show the owner before wiring it.**
- Backgrounds are `public/` assets, lazy-loaded per race in play — never bundled.

---

## ⭐ OWNER ADDENDUM, S164 — **TWO BACKGROUNDS PER RACE, ONE PER BOARD** (R137)

> *"for the players zones background art priority that we have defined before we would need to
> generate 2 backgrounds for each race (one for the 2 player map and one for the 4 player map). they
> should be very similar but still a tad different."*

**So the count is 12, not 6.** This was missed in the original brief and it is not a cosmetic
preference — the two boards partition the canvas into **different shapes**, measured against
`src/state/zones.ts`:

| Board | Split | A zone is | Aspect |
|---|---|---|---|
| `PITCH_2P` | one VERTICAL line at x=960 | **960 × 1080** | portrait, 8:9 |
| `QUADRANTS_4P` | a CROSS at (960, 540) | **960 × 540** | landscape, 16:9 |

A single image cannot serve both: stretched to fit it distorts, letterboxed it leaves dead ground,
and cropped it loses whatever the composition was built around. **Same world, different framing** —
which is exactly the owner's *"very similar but still a tad different"*.

⚠ **AND THE CASTLE SITS SOMEWHERE DIFFERENT IN EACH.** `ANCHORS` puts the 2P keeps in the
GOALMOUTHS (mid-height, hard against the left/right touchline: `{120, 540}` / `{1800, 540}`) and the
4P keeps in the OUTER CORNERS (`{130,130}`, `{1790,130}`, `{1790,950}`, `{130,950}`). So each
background's focal point — the race's keep, its gate, its approach — belongs in a different part of
the frame per board. A 4P background composed for a centred castle will put the keep in a corner of
dead sky.

⚠ **BOTH MUST STILL READ AS THE SAME PLACE.** The two are one race's homeland seen at two framings,
not two locations. Generate the 4P (landscape) one FIRST and seed the 2P (portrait) one off it via
`refImages`, the way the race units were seeded off their banners — that is what makes them siblings
rather than cousins.

⚠ **PARTIAL TRANSPARENCY IS STILL BINDING** (brief item A): towers, structures, connectors and
creatures have to stay readable on top, and the seat colour must survive as an accent.

---

## ⭐ OWNER RULINGS, S167 — **THE BOSS SKILLS** (three of six given; the rest reserved)

Given mid-session, unprompted, and quoted verbatim because the wording carries the design. Owner:

> *"zombie needs to have an aura that damages enemies around him - 3% health per second. when he
> dies he explodes in a huge radius hurting everything radius. We will discuss their player and
> skill stats after you provide me with the current stat list of all other enemies. I will think
> about all the other boss skills in the meanwhile. also their skills need a generated video or art
> (explosion for zombie boss and stinky deadly aura around him). for Kracken his skills will be
> tentacles come out of the ground and attack diffferent enemies or structures. 3 tentacles at a
> time. he also spits sonar wave from his mouth stunning and pushing back all enemies in a cone
> around him. for Vlad when he kills an enemy that enemy becomes alive again with full stats but
> becomes a vampire and joins vlad (he sticks to vlad and targets what vlad targets. Also vlad can
> use a life sap ability that heals him 20% of his health. He can use it 3 times when his health
> drops below 40%. the rest iil think about while you give me the stats. we would need to generate
> cool graphics for those abilities"*

### R138 — ZOMBIE BOSS: the rot aura, and the death explosion

| | |
|---|---|
| **Aura** | Damages every enemy around him for **3% of health per second**. ⚠ *Whose* health — the victim's max, the victim's current, or the boss's — is NOT stated and changes the mechanic completely (percent-of-current never kills; percent-of-max does). **Open.** |
| **Death** | He **explodes in a huge radius, hurting everything** — explicitly *everything*, which reads as owner-agnostic like `STRUCTURE_SELFDESTRUCT` rather than enemy-only. |
| **Art** | *"stinky deadly aura around him"* + an explosion. Both generated. |

⭐ **A PERCENT-BASED AURA IS THE FIRST NON-INTEGER DAMAGE IN THIS GAME**, and that is a real
engineering note rather than a quibble: `damageEntity` **THROWS on a fraction by design** and the
whole DoT model is authored in whole units on the fifths ladder (`stats.ts`). 3%/s of a 7-fifth
goblin is 0.21 fifths per second. This needs either an accumulator (⛔ forbidden — float
accumulators are banned in the sim) or a tick-quantised integer rule. **Solvable, not free.**

### R139 — KRAKEN: tentacles and the sonar cone

| | |
|---|---|
| **Tentacles** | Come **out of the ground** and attack enemies *or structures*. **3 at a time.** |
| **Sonar wave** | Spat from his mouth: **stuns and pushes back** all enemies in a **cone** around him. |

⚠ **STUN AND KNOCKBACK ARE BOTH NEW VERBS.** Nothing in the creature FSM today has a stunned state,
and nothing applies an impulse to a creature from a non-collision source. A cone test is also new —
every existing acquisition scan is a radius. This is the largest engineering surface of the three.

### R140 — VLAD: conversion on kill, and life sap

| | |
|---|---|
| **Conversion** | When Vlad KILLS an enemy, that enemy **comes back with full stats as a vampire on Vlad's side**, sticks to Vlad, and **targets what Vlad targets**. |
| **Life sap** | Heals him **20% of his health**, usable **3 times**, only **below 40% health**. |

⛔ **CONVERSION IS THE MOST DANGEROUS SKILL OF THE SIX TO BALANCE**, and it is worth saying before
the stats are set: it converts the ENEMY'S army into Vlad's, so its value scales with how many units
the opponent fields. Against a big push it compounds. It is also the only skill that changes a
creature's OWNER mid-life — `ownerPlayerId` is serialized and hashed, so this is a wire-visible
mutation, not a visual.

### STILL RESERVED BY THE OWNER

**Pharaoh · Warlord · Archdemon** — *"the rest iil think about while you give me the stats."*

### ART OWED FOR THE SKILLS

*"their skills need a generated video or art"* — named explicitly so far: the zombie's **explosion**
and his **stinky deadly aura**. The Kraken's tentacles and sonar cone and Vlad's conversion and life
sap will each want one too (*"we would need to generate cool graphics for those abilities"*).
