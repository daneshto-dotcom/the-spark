# BRANCH A — "YOU ONLY SEE THE TOWER"

Branch `s183/only-the-tower` · base `fresh` (origin/master) · merge owner: the main S183 session.

Two halves of one feature: the owner's four new tower damage ramps, and the shapes underneath them
finally disappearing. They ship together because the second is what the first is *for*.

---

## 1 · THE OWNER'S WORDS

On the pilot he already played and approved:

> *"A low creature attacks, you can see the tower actively get more and more destroyed until it gets
> completely destroyed. So very well done with the lightning hub. Keep it like that for now."*

On what is still wrong:

> *"Once the building is built, I don't wanna see the shapes and connectors behind it. I just wanna
> see the building because it looks messy."*

> *"When you place it, you can see the tower art, but you also see, like, the old triangles and
> connectors between them and that little graphic that have it, like, radiate or whatever. That's
> what I'm having issue with. It should disappear within, like, two seconds after this tower is
> built, like, phase out. And then you can only see the tower art."*

⛔ **AND THE REVEAL RULE HE CORRECTED IN THIS SESSION — GET THIS RIGHT, THE OLD BEHAVIOUR IS WRONG:**

> *"It does not come back when the building starts dying so you can still repair it. No — because
> you can see the tower is damaged. You can just click the tower and repair it. You don't have to
> see the connectors. The connectors come back when the tower is being destroyed, like when it hits
> zero health and you can see it crumble and fall. That's when they phase back in within like a
> second."*

So: hidden from ~2 s after it is built, through **all** damage states, until the structure actually
**crumbles**. Then back over ~1 s. **NOT on the first connector break** — that is today's behaviour
and it is what he ruled out.

---

## 2 · THE ART — MEASURED THIS SESSION, DO NOT RE-DERIVE

Four RGBA contact sheets, 8 cols × 3 rows = 24 frames, reading order, frame 1 pristine → 24 rubble.

| tower | source file (`~/Downloads`) | sheet | frame numbers baked? |
|---|---|---|---|
| goblin tower | `ChatGPT Image Sep 18, 2026, 08_54_43 AM.png` | 1983×793 | no |
| laser turret | `ChatGPT Image Sep 18, 2026, 08_54_24 AM.png` | 1983×793 | no |
| pentagram | `ChatGPT Image Sep 18, 2026, 08_54_06 AM.png` | 1983×793 | **yes (1–24)** |
| Helga | `ChatGPT Image Sep 19, 2026, 08_34_44 AM.png` | 1995×788 | no |

Identified by opening frame 1 of each, not by inference. The three cream 1536×1024 **RGB** boards are
REFERENCE ONLY — they carry baked text labels. Do not pack them.

### ⛔ THE HUB'S INTAKE CANNOT READ THESE. WRITE A SIBLING.

`scripts/build-sheet-atlas.mjs` keys a near-BLACK background, detects cells from DRAWN RULES, and
requires a baked frame number in every cell. These are alpha-matted, have no rules, and three of four
have no numbers. ⭐ Everything DOWNSTREAM is identical and must be reused unchanged: one union bbox
across every frame, height-fit into the cell, bottom-centre foot anchor, `<name>-atlas.png` +
`<name>-anim.json`, 2 rows of 12. A sheet-sourced building must not disagree with a clip-sourced one
about where the ground is.

**Verified parameters — a prototype built all four successfully. Re-verify; do not re-invent.**

- **Cell detection: alpha ≤ 48.** A gutter must be clear across the WHOLE axis, so this is safe
  against smoke. At 32 the laser sheet loses a row gutter; at 48 all four give exactly 7 column
  gutters and 2 row gutters.
- ⛔ **CELLS ARE UNEVEN ON ALL FOUR — A UNIFORM STRIDE CLIPS FRAMES.** Measured row heights:
  goblin 285/263/216 · laser 258/250/211 · pentagram 260/240/206 · Helga 272/240/234. A 793/3 = 264
  stride visibly cuts row 1 of the goblin sheet (confirmed by eye). `grid: {cols:8, rows:3}` is an
  ASSERTION against detection, never its source.
- ⛔ **THE ALPHA IS DIRTY; SHIPPING IT RAW GIVES EVERY TOWER A TRANSLUCENT BOX.** Essentially ZERO
  pixels are fully opaque (α=255 is 0.0–0.1% on all four) and 19–53% of each canvas sits at α 1–31 —
  a ghost wash. Floor α ≤ 24 → 0, ceil α ≥ 244 → 255. Measured on the goblin atlas after the fix:
  64.6% at exactly 0, 23.7% at exactly 255, 9.7% mid-range (real soft edges and smoke). Before the
  fix: 3% at 0, 0% at 255. This is the "visible square box" defect the owner rejected on the Voltkin.
- Only the pentagram sheet needs the corner-label erase. The other three must NOT run it.

### ⛔ THE SELF-DESTRUCT DOES NOT GENERALISE

R182-A: *"From thirty two percent it will just get self destroyed, but it is a suicide drone
building, so it makes sense. **We won't do it for every building.**"* These four take the RAMP and
**not** `STAR_SELFDESTRUCT_BELOW_FRAC`. Frames 17–24 are their death run; they die when the recipe
breaks, like any structure. **Owe a test that proves they do not self-destruct** — a generalised ramp
is exactly how that would leak.

### THE `RAMP_SPECS` CONTRACT

`RAMP_SPECS` has ONE entry today and **two tests assert it** — `canon.test.ts:191` and
`structureRamp.test.ts:38`, both `toEqual(['lightningHub'])`. `SPARK_CANON.md` §7 records that adding
the second is the owner's call. **He has now made it, for all four.** Re-pin both assertions in the
same commit. `structureRampAtlas.test.ts` is `describe.each(RAMP_SPECS)` and should extend for
free — CONFIRM that it does rather than assuming.

---

## 3 · WHY THE SHAPES ARE STILL VISIBLE — THREE CAUSES, ALL VERIFIED

Connector hiding SHIPPED in S175 (`b10e772`): renderer-only, no sim change, no protocol bump, shapes
stay simulated / raidable / chewable, only alpha moves. It is not missing. It is defeated three ways.

Cover is published by whoever COMMITS A SPRITE, never re-derived. There are exactly THREE publish
sites, and **all three iterate `world.creatureSpawners`**:

| site | covers |
|---|---|
| `towerRenderer.ts:313` | spawners in `RACE_TOWER_IDS` / `T9_TOWER_IDS` only |
| `structureRampRenderer.ts:242` | spawners in `RAMP_SPECS` — the hub alone |
| `voltkinTowerRenderer.ts:576` | the Voltkin TV |

**CAUSE 1 — A SECOND RENDERER PAINTS THE CONNECTORS BACK ON.** This is the big one and it affects
every tower, including the ones where cover works. `spawnerZoneRenderer.ts:95–143` redraws, every
frame, with **no reference to `towerCover` or `coverAlpha` anywhere in the file**: a breathing tint
disc under the structure, `RING_COUNT` radiating rings, a bright stroke **over every bond**, a white
spark bead at each bond midpoint, and a glowing core at the anchor. Its own comment admits the
layering — *"traced over each spawner bond (on top of the normal bond visual `structureRenderer`
already drew)"*. `structureRenderer` fades the real connectors to nothing and this draws charged
copies of them straight back.

**CAUSE 2 — TWO OF THE FOUR TOWERS HAVE NO PUBLISH SITE AT ALL.** The goblin tower and the pentagram
are spawners but are not in `RACE_TOWER_IDS`/`T9_TOWER_IDS`, so `towerRenderer` skips them
(`towerRenderer.ts:220`, comment: *"pentagram / goblin tower / lightning hub have no structure art"*).
⭐ Adding them to `RAMP_SPECS` routes them through `structureRampRenderer`, which already calls
`markTowerCover` at its sprite commit — ramp AND hiding, one entry each.

**CAUSE 3 — DEFENDERS ARE A DIFFERENT COLLECTION ENTIRELY.** The laser turret (`turret`) and Helga
(`princess`) live in `worldTypes.ts:403` `defenders: Map<DefenderId, Defender>`, not in
`creatureSpawners`. `RAMP_SPECS` will never reach them. **No cover publish site for defenders exists
anywhere in the tree.** R175-B parked exactly this: *"connector hiding includes defenders — but they
have no art yet, so focus on the race ones we have."* They have art now. This is real work, not a
switch: the ramp renderer (or a sibling) must walk `world.defenders` and resolve a defender's
structure members and bonds the way the spawner path resolves a star.

### ⭐ THE OWNER'S AURA RULING — FADE ON EVERYTHING

Asked whether the aura should fade on all towers, only his own, or return on hover, he chose **fade
on everything**, with his reasoning:

> *"It doesn't matter if you know what connectors to cut. You can't control your spawn. They're just
> attacking based on their mechanics, their attack mechanics and target acquisition mechanics… you
> can't control your characters anyways."*

So the disc, the rings, the bond strokes, the beads and the core all fade on the same ramp as the
cover, on **every** tower, friendly and enemy alike.

⚠ **RECORD THIS CONSEQUENCE AT THE CONSTANT, because his premise has one exception and he was told:**
the **raid** IS player-directed — `world.ts:769` lets a player right-click a *specific* bond and pay
a raid point for it. Verified safe: the raid pick in `controls.ts` never consults `coverAlphaForBond`,
so an invisible connector stays clickable and raidable. The mechanic works; the player simply aims
blind at an enemy tower. He accepted that knowingly. One line reverses it if play says otherwise.

⚠ **AND A GAP TO REPORT, NOT SILENTLY FIX:** the cover set is only the recipe's ring members. A
hand-placed shape WELDED onto a tower is not a ring member and stays fully visible under the sprite
forever. Measure it, report it, let the owner rule.

---

## 4 · DETERMINISM AND WIRE — WHAT THIS BRANCH MUST NOT TOUCH

- The frame cursor is **client-local presentation state** and must never reach the wire (R182-D).
- **No `PROTOCOL_VERSION` bump.** Renderer-only, exactly as S175 and S182's ramp were.
- The ramp anchors on `Bond.createdTick`, NOT `CreatureSpawner.ignitedAtTick` — `trimMirrorSpawner`
  strips the latter and `deserializeSpawner` re-seeds it from the client's own tick, so a ramp
  anchored on it restarts ~10× a second on a joiner. Documented trap; do not re-enter it.
- `starHealthFrac` reads the structure's OWN star (R182-B), not its connected component. Do NOT
  reconcile that with the health bar — `SPARK_CANON.md` §10 R182-F records the divergence
  deliberately.
- ⛔ **With connectors invisible, clicking the TOWER BODY becomes the only way to reach FIX/SCRAP.**
  That path exists (S152) but is now load-bearing. **Owe a test that proves it**, or an invisible
  tower is an unrepairable one.

---

## 5 · TESTS OWED

- `canon.test.ts` + `structureRamp.test.ts` re-pinned to the new `RAMP_SPECS`.
- Frame/threshold equivalence at every integer fifth, per tower, as the hub has.
- The four new towers do **not** self-destruct.
- Reveal fires on **crumble**, not on first sever — the rule the owner corrected.
- Clicking the tower body reaches FIX/SCRAP.
- ⛔ **A MECHANICAL enumeration, not a source-text grep.** Count the cover publish sites and pin the
  total, naming which building class each serves; and count the draw sites that consume cover alpha.
  S182's lesson: *a source-text guard proves a line EXISTS, never that it is REACHED* — one was green
  over a live bug twice. `spawnerZoneRenderer` is precisely a draw site that existed and never
  consumed. A sixth publish site or a new un-consuming draw site must fail a test.

---

## 6 · GATES

⛔ Read every exit code from a **captured `$?`**. Never through a pipe, and never the wrapper's
trailing `[exited with code 0]` — that line is the harness's, not the gate's. S159 shipped past a
hard fail exactly that way; S165 did it again.

`npm run typecheck` · `npx vitest run` (5240 tests / 319 files on master) · `npm run build`
(bundle charter **875.0 / 1000 KiB, 125.0 KiB headroom measured this session — SHARED with the other
two open branches**) · `npm run check:atlas` (needs `pip install numpy scipy Pillow`; exits **3**
without them, that is not a crash) · `npm run e2e:gating`.

⚠ An asset-quality opinion must never block a live deploy — `check:atlas` runs as its own CI job, not
inside `build`. Keep it that way.

---

## 7 · FILE BOUNDARY — nothing outside this list

`src/render/structureRamp.ts` · `src/render/structureRampRenderer.ts` · `src/render/spawnerZoneRenderer.ts`
· `src/render/towerCover.ts` · the defender cover publish site · `scripts/` (the new intake) ·
`public/art/<tower>/*` · `assets-source/<tower>/*` · `src/canon.test.ts` (the `RAMP_SPECS` assertion
ONLY) · `src/render/structureRamp*.test.ts` · `src/render/towerCover.test.ts`.

⛔ Do NOT edit `SPARK_CANON.md`, `CLAUDE.md`, `playwright.config.ts`, `src/ci.e2eLanes.test.ts`, or
anything in `src/state/` beyond reading it. The canon and the shared infrastructure belong to the
merge owner — **report rulings, do not write them.** Branch B is in `src/state/creatures/` and
`damage.ts`; branch C is in `characterSheet.ts`, `arcadeLeaderboard.ts`, `server/` and
`structureRepair.ts`. Do not touch their files.

⛔ **DO ONLY THIS. Do not refactor, do not tidy, do not fix unrelated things you notice** — report
them instead. S182 measured that defect rate tracked how much a branch changed, not how hard the task
was.
