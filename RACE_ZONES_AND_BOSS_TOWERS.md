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
| Vampires | Triangle | **Vlad** (owner-named) |
| Nagas | Square | TBD |
| Mummies | Line | **Pharaoh** (owner-named) |
| Zombies | Circle | TBD |
| Orcs | Dot | TBD |
| Demons | Spiral | TBD |

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

## ⛔ C · THE ONE COLLISION I FOUND, AND IT IS REAL

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

### ⚠ Q4 — THE NONET COLLISION. STILL OPEN, but with a recommendation.

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
