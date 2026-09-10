# BOOT SNAPSHOT — after S172 (2026-09-10)

Read `HANDOFF_S172_2026-09-10.md` for the full picture; this is the 30-second version.

## Where the code is
`master`, clean, **0 unpushed**. Live at spark-online.space, `verify-deploy` 4/4.
`PROTOCOL_VERSION` **46** — unchanged all session (nothing S172 shipped needed a bump).
Gates at close, every one from a captured `$?`: typecheck 0 / vitest **4296 across 274 files** /
e2e:gating 0 / build 0 (~822 KiB of the 900 charter) / MCV 0 with 35 assertions.
⚠ `check:atlas` still exits 1 ON PURPOSE (6 size-mismatched + 9 fringed atlases = the art polish
pass). It does NOT gate the deploy.

## ⛔ FIRST: THE DISPLAY UNIT IS THE STORED INTEGER — S171's LESSON IS SUPERSEDED
S171 said "report POINTS, not fifths". The owner has since formalised the ×5 **into** the stat
definition: *"you multiply it by five, so we have fifths"*, and confirmed for the damage numbers
*"there's no conversion ... everything's gonna be whole numbers"*.
**`lv 3 atk × lv 1 pen = 3 × 1.2 = 3.6 × 5 = 18`** — and `attackFifths(3,1)` returns exactly 18.
Use his form. `node scripts/stat-table.mjs` still prints the roster.

## What shipped in S172
The fight is readable now. All live and play-tested by him.
- **Health bars actually move.** TWO separate causes: the 9px floor was applied to the FILL as well
  as the track (six unit types frozen at 100%), and `drawHealthBars` was handed a sprite map holding
  only goblins, so every boss/t3/Voltkin/Helga bar was drawn at a 26px fallback INSIDE the body.
- **Floating damage numbers**, Kanit 900 Italic, red + white outline. Every hit including the
  killing blow; heals in green. Derived from `ehp` deltas — no new synced field, no protocol bump,
  DoT covered free.
- **Bosses doubled** (HP *and* DEF, damage untouched) — pools ~×3, Vlad 90→260.
- **The stat retune is PARKED, not lost** — patch + a readable chart (links in the handoff).

## The next things, in order
1. **TOWER HEALTH BARS** — the only *partial* item. Helga is done; towers are skipped because their
   durability is in the CONNECTORS (R76), not a pool. Needs a connector-derived aggregate.
2. **THE PHARAOH (P4)** — respecified by him in S172: Ra's giant HEAD from thunder clouds at the top
   of the screen, mouth opens, then FIVE beams with growing ground shadows. Beam included and
   reusable. >12 frames ⇒ `framesPerState` scalar → per-state, 5 sites.
3. **VLAD'S LIFE SAP VFX (P9)** — *"looks like shit"*, wants it generated. ⚠ R140 as ruled has NO
   victim, so a tether would paint a relationship that does not exist — his decision first.
4. **THE ART POLISH PASS** — `check:atlas` red on 15 atlases. The scarab needs its WALK CLIP
   RE-GENERATED (a repack cannot fix a 0.74× width).
5. **ATTACK SPEED** — still 3 distinct cadences across 22 units. Not a design dimension yet.

## One question to settle in a sentence
He said *"red without white outline is the damage"* one breath after praising the shipped look,
which **is** red WITH a white outline. Treated as a slip and left as shipped. Just ask.

## Traps that bit this session
- ⛔ **Fixing the first cause is not evidence there is only one.** The health bar had two, in
  different files, and he re-reported it after the first fix shipped.
- ⛔ **Believe his observation over your model.** *"It took him a good thirty seconds to die"*
  demolished my one-shot-combat explanation and relocated the bug.
- ⛔ **A missing WIRE between two modules cannot be caught by a unit test of either.** Pin it with a
  source-text assertion.
- ⛔ **Comments that lie are a defect class — three found in one session**, including one that had
  lied for sixteen sessions and caused the S167 accident.
- ⛔ **The acquisition census has a cast blind spot** (now fixed): writing
  `(o.ownerPlayerId as number) === mine` made a real enemy scan invisible to the guard.
- ⛔ **Author `verification[]` at priority close, before announcing done.** MCV hard-failed on
  UNCOVERED because both arrays were empty. And grep every needle against disk first.
- ⛔ **Do not derive a newline from a sample of the file** — it left two files mixed-ending. Patch
  with `newline=''`.
