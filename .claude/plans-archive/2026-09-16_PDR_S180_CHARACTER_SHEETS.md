# PDR — S180 · CHARACTER SHEETS v1 (+ the targeting fix)

Tier: **Full** (>30K — a new render surface plus the first seat-agnostic click path in `controls.ts`).
Status: **AWAITING OWNER APPROVAL.** Nothing has been implemented.

Research: 5 lanes + 5 adversarial critiques (RTS panels · MOBA/RPG examine screens · Total War / CK3
card craft · what SPARK's code can supply · how it gets built here). The synthesis agent and 2 of the
critiques died to the org spend limit; **that half was done by hand this session**, per the S161 rule
that a dead agent run is not a completed lane.

---

## 1 · OBJECTIVE

> *"Little picture of the character, like we have the little little fucking health bar, stats, done.
> Any skills that he has, maybe. Players can learn about the characters."* · *"Clickable ones."*
> · and today: an enemy's sheet shows **live health**, not stats only.

Click a unit — yours or theirs — and a card tells you what it is and how it is doing. Five things on
screen. If it needs a second screenshot to explain, it is wrong.

---

## 2 · WHAT HE SEES

A fixed card, always in the same place (left edge, sitting above the footer band). Clicking a
different unit re-targets it; it does not float around after a moving goblin.

```
┌────────────────────────────────┐
│ VLAD                    T9 ·  │   name, largest text · tier chip
│ ──────────────────────────────│
│ ┌────────┐  VAMPIRES           │   race line
│ │        │  ███████████░░  198 │   live health bar + the number
│ │portrait│              / 260  │
│ └────────┘                     │
│ ──────────────────────────────│
│  ATK   10          150 a swing │   the four stats, one fixed order,
│  PEN   10                      │   with the ladder result beside them
│  HP    20                      │
│  DEF    8              260 pool│
└────────────────────────────────┘
```

**Why exactly this and nothing else** — every classic RTS panel converges on it. StarCraft shows a
name, a wireframe and `cur/max` and *no combat stats at all*. StarCraft II added exactly two numbers
(damage, armour) and stopped. Age of Empires II put the extended stats behind a toggle that is **off
by default**. Warcraft III is the richest of them and is still about five lines. The genre's own
evidence is that the default card is deliberately thin.

**The health number is in fifths — the same integer your damage floaters print.** No conversion
anywhere, which is the whole promise of the stat ladder.

---

## 3 · SCOPE

**IN:** every creature — the six goblins, the race unit, the six tier-3 units, **all six bosses**,
Voltkin, the chewer, the drone, the direwolf, the locust cloud. Yours and theirs alike.

**OUT of v1, each for a stated reason:**

| | why |
|---|---|
| **Skills row** | ⛔ **There is not one line of ability text anywhere in the tree.** Six `bossSkills*.ts` files, zero display strings. A row of blank icons reads as broken, and inventing prose for 30+ abilities is how this becomes the wall of numbers you rejected. See Q2. |
| **Speed** | `speedMul` exists on only 6 of 24 configs. And no RTS panel in the genre prints a multiplier. |
| **A 1–12 pip track** | Looked good until measured: `STAT_POINT_MAX` is 12 but the Kraken runs HP 24 / DEF 16. A fixed 12-pip track would either lie or need two scales. |
| **Buildings** | See Q3 — you already ruled something that collides with this. |
| **Derived combat maths** (DPS, swings-to-kill) | Spectator-grade. Belongs in the debug overlay. |

---

## 4 · ⛔ THREE DECISIONS I NEED FROM YOU

**Q1 · Click your OWN tower — FIX/SCRAP as today, or the sheet?**
That gesture is already taken: clicking your own shape opens the FIX/SCRAP popover, and clicking your
own gatherer does something else again. Without a ruling, the *same click* produces a different UI
depending on who owns the thing. My recommendation: **leave FIX/SCRAP exactly as it is** and give the
sheet only to creatures in v1.

**Q2 · Skills — leave them out, or do you want to name them?**
There is no ability text in the game at all. Either the row waits until boss ability art exists, or
you give me the names and one line each. *"Maybe"* plus no data equals me inventing 30-odd
descriptions, which I would rather not do without your word. My recommendation: **out of v1.**

**Q3 · Does a BUILDING get a sheet at all?**
In S174 you ruled that Helga and Voltkin must show **their connectors**, not their character art.
A building sheet walks straight back into that. Creature-only sidesteps it.

⭐ **And one thing worth knowing before you answer.** Your original complaint about not being able to
read a unit's strength was *comparative* — *"how the fuck do I know if your Kraken has so much more
health than my [unit]"*. One card at a time does not answer that. **A UNITS page in the codex, all 24
side by side in the same card language, does.** It is a natural follow-on and I have not scoped it —
say the word if it should be in this batch instead of a sheet.

---

## 5 · THE BUILD

| file | what | lines | risk |
|---|---|---|---|
| `src/render/characterSheet.ts` **NEW** | a pure `characterSheetModel(world, seat, target)` returning what to draw, plus a thin Pixi class with `sync()/select()/getUiPoints()`. `sync()` re-derives every frame and clears its own selection when the model returns null — so a dead unit's card vanishes with no death listener. | ~400 | low |
| `src/render/characterSheet.test.ts` **NEW** | pure-model tests: card vanishes when the subject dies · an enemy card shows live health · every printed number derives from the ladder · geometry clamps at the screen edge | ~230 | low |
| `src/input/controls.ts` | a new seat-agnostic pick, added as the **last** left-click arm so it cannot swallow a spark, a hazard or the FIX/SCRAP gesture. Right-click stays the raid. | ~110 | ⚠ **highest** |
| `src/main.ts` | construct · wire · bring-to-front · clear · sync — six existing sites | ~22 | low |
| `src/render/healthBar.ts` | export the existing bar-drawing helper instead of drawing a second one | ~8 | low |
| `src/render/goblinRenderer.ts` | hand back one idle frame as a portrait from the atlas **already in memory** | ~28 | low |

**≈630 new lines, ≈170 lines of edits across 5 existing files.**

### What it costs on the wire: nothing

Every number the card needs is already synced. Creature health, tower health, shape health and castle
health all ride the wire today (emitted only when damaged; absent means full, which both peers
compute). **No new field, no `PROTOCOL_VERSION` bump, no refused tabs.** Selection is render-only and
never enters the world — the same argument the FIX/SCRAP popover already makes.

### What it costs in bundle

834.1 KiB used against a 900 KiB self-imposed charter; a ~20 KiB overlay lands inside the warning
band. **I will raise the charter to 1000 in the same commit** rather than let a UI panel ever
hard-fail a live deploy.

---

## 5b · COUNCIL — what changed because of it

3-way (me · GROK-ANALYST · GEMINI-AUDITOR). Both external seats: **ADOPT-WITH-CHANGES**. Five
changes adopted, one challenge refuted.

**ADOPTED — the card no longer vanishes.** GEMINI's best catch, and it is better than what I wrote:
*"the player is punished for successfully killing the unit they were trying to learn about."* The
card now **keeps its stats and freezes the health** when its subject dies or walks into fog, until
you click away. That also kills GROK's fog-edge flicker — a unit stepping in and out of concealment
no longer opens and closes the panel. Fog is still honoured: a frozen bar is last-seen, never live.

**ADOPTED — a bracket on the selected unit.** GROK is right that a card in a fixed corner can be
misread as belonging to the wrong creature in a messy fight. The genre's own answer is the C&C /
StarCraft corner bracket: mark the unit itself. Cheap, and it removes the objection without chasing
a moving goblin around the screen with a popover.

**ADOPTED — the selection is an id, never an object.** A snapshot clears and rebuilds the world's
maps every 10 Hz, so a held reference would quietly become a ghost. The card stores an id and
re-looks-it-up, and a test pins that across a snapshot apply.

**ADOPTED — the pick reads sim positions, not sprite bounds.** Sprite bounds are interpolated at
60 Hz and untestable headlessly. The existing shape pick already uses sim position + radius; this
follows it, so the click is testable without Pixi.

**ADOPTED — the bundle charter moves in its OWN commit**, with the note, before the feature lands.
Both seats called raising it inside the feature commit constraint-evasion, and they are right that
it hides the cost — even though the project rule does sanction raising it.

**REFUTED — GROK's claim that live enemy health "demands per-frame polling" and risks divergence,
and that it therefore needs a protocol bump.** It does not. The card reads the same mirrored
`ehp` the health bars already draw over every creature on screen today, at the same 10 Hz the
snapshot stream already maintains. There is no new data demand of any kind, and a render-only read
cannot diverge a simulation by construction. Recorded because it is the recurring shape of external-
reviewer error in this project: a confident claim about execution that the tree refutes.

**NOT ADOPTED — GROK's "make it a popover instead".** A structure popover floats because a structure
stands still. A card chasing a moving unit is worse, and every panel in the genre it names
(StarCraft, Warcraft III, Age of Empires) is fixed. The bracket above answers the real objection.

---

## 6 · ⛔ THE THREE THINGS THAT COULD GO WRONG

1. **A live enemy health bar reads straight through fog.** S170's concealment is something you asked
   for by name. The card calls the existing concealment test every frame and **freezes** the bar at
   last-seen when the subject is hidden (it does not close — see §5b). Missing this silently undoes a
   shipped feature.
2. **A bespoke number on the card.** `UNIT_STAT_TABLE.md` — the repo's own stat document — is **stale
   by roughly 3× on the bosses**: it lists Vlad at 90 pool; the code says **260**. Every figure on the
   card is read at runtime from the configs through the ladder, never from that document. This is the
   `GOBLIN_DAMAGE_VS_PRIMITIVE` defect class, and a character sheet is the single most likely place
   in this codebase for one to be born.
3. **The click.** It is the only part touching a file two sessions were spent tuning. Ordered last,
   and the existing gestures get their own regression test.

---

## 7 · TESTING

`npx vitest run` (4569 green today) · `npm run typecheck` · `npm run e2e:gating` · `npm run build`
incl. the charter check. Every exit code captured from `$?`, never read off a pipe or a wrapper line.
New: the pure-model tests above, plus a click-precedence test that a sheet click cannot steal a
spark pickup, a hazard, or FIX/SCRAP.

⚠ **Every expected number in those tests is DERIVED from the constant, never typed as a literal** —
the S177 lesson, and the direct answer to the Council's sharpest testing challenge: a hand-typed
table of 24 units drifts exactly the way the stat document already has. The suite walks all 24
configs rather than sampling, so a new unit cannot ship without a card that reads correctly.

---

# PART B — THE TARGETING FIX

Ruled by you today; the full table is in `S180_TARGETING_TABLE.md`. **It is blocked on your Q1 there**
(what "the closest building" means), so it is scoped here and not designed:

- restore a connector target for the 21 unit types that lost one yesterday;
- give the suicide bomber a building-first preference;
- decide whether the laser turret gets the structure arm your R72 says it has.

I would take the character sheet first and the targeting fix second **in the same session**, because
the targeting bug is live and the sheet is not. Say which order you want.
