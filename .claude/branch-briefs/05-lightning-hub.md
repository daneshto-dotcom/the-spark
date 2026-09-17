# BRANCH 5 — `s182/lightning-hub`

## ⭐ THIS IS A PILOT. BUILD THE PATH, NOT THE ONE-OFF.

The owner has art for the goblins, the pencil chewer, the pentagram, the laser turret and more. He is
holding it back deliberately:

> *"I already have art for goblins and for pencil chewers and pentagram and for laser tower, for
> everything else, but I first want to see you implement this before I give you all the rest."*

So the deliverable is **a reusable damage-state path proven on the lightning hub**, with a documented
"add the next tower in N lines" seam. The Voltkin TV already has a bespoke intact/damaged/destroyed
state machine — that is one. The hub would be two. **Two is when you generalise, not the sixth.**

⛔ **BUT DO NOT MIGRATE THE OTHER TOWERS.** The owner ruled explicitly:
> *"We're gonna do this one at a time. We're not gonna do all of them because it's not gonna work,
> you're gonna get confused, you're gonna get things wrong. Currently you're just gonna focus on the
> lightning hub. I will present them one after another."*

Build the seam. Use it once. Leave the other twelve alone.

---

## THE ART — ALREADY IN THE REPO

Committed as `a84c851`:
- `assets-source/lightning-hub/hub-transitions-24.png` — **1908×824, 8 cols × 3 rows = 24 frames.**
  Frames 1–12 intact→damaged, 13–24 damaged→destroyed.
- `assets-source/lightning-hub/hub-drone-states.png` — 1536×1024, 2 rows × 3 cols. Top: hub full /
  damaged / destroyed. Bottom: drone healthy / hurt / explosion.

### ⛔ TWO ART FACTS, MEASURED, THAT WILL COST YOU A DAY IF YOU GUESS

1. **The grid does NOT divide evenly.** 1908/8 = 238.5, 824/3 = 274.67, and the frames are separated
   by drawn rules. **Cell bounds must be DETECTED, never computed from a uniform stride.** A naive
   slice clips every frame slightly and the drift shows as jitter.
2. **Both images are RGB with no alpha**, background `(0,10,17)`. A real matte is required.
   ⚠ The sheet has a **white frame NUMBER baked into every cell** and light-blue cell borders; the
   states plate has engraved label plates, grass tufts, a rubble skirt, and **a health bar drawn over
   the HURT drone**. The packer's matte keys near-white connected to the border
   (`build-sprite-atlas.mjs:203-221`) and will treat all of that as subject.

> ⛔ **GATE — ASK FOR A CLEAN RE-EXPORT FIRST.** Flat background, no frame numbers, no borders, no
> label plates, no health bar. It is cheap for him and it makes this dramatically better. If he
> declines or is unavailable, proceed with a detection-based slice and matte, and **report the
> quality cost honestly.**

**Pipeline:** `ART_PIPELINE.md` — *"The pipeline does not need video. It needs 12 frames."* 12 frames
per row; his 24 is exactly two rows. Stage 5 begins with `node scripts/check-clip.mjs`, **never** with
the packer. Then `build-sprite-atlas.mjs`. `npm run check:atlas` must stay green (needs
`pip install numpy scipy Pillow`; without them it exits **3**, which is not a crash).

---

## THE MECHANIC — THE OWNER'S RULINGS, VERBATIM

### R182-A — self-destruct below 33%, **HUB ONLY**
> *"From thirty two percent it will just get self destroyed, but it is a suicide drone building, so
> it makes sense. We won't do it for every building."*

The **ramp** generalises. The **self-destruct threshold does not** — it is earned by the hub being a
suicide-drone building. Do not propagate it.

### R182-B — the percentage is scoped to the hub's OWN star
> *"A hub welded into a big lattice can reach thirty three percent on its own bonds. The sim still
> considers the wider structure healthy, but we don't care about that. If its own bonds are destroyed,
> then he will blow up. Neighbouring shapes are protecting it then, and it's fine."*

⭐ **The divergence is DELIBERATE and ACCEPTED. Do not "reconcile" it** by making the trigger
component-scoped.

**And it is free to compute.** `isStarAt` (`state/godlyRecipes/starShape.ts:104`, via
`isLightningHubComponent`, `godlyRecipes/lightningHub.ts:38`) asserts `hub.bonds.size === degree` and
that every bond reaches a Circle leaf. **So `world.primitives.get(anchorId).bonds` IS the star's five
arms and nothing else** — `n = hub.bonds.size`, `pool = structurePoolFifths(n) = n × (n+5) = 50`.
No BFS.

**Deterministic on both peers:** `Primitive.bonds` is serialized as an array (`save.ts:1802`) and
rebuilt as a Set (`:1626`); `Bond.damageFifths` is on the wire (`save.ts:1836`, additive-optional,
emitted only when > 0; restored `:1665`) and hashed in both sites (`stateHashFull.ts:278` union,
`:547` projection). `damageFifths` are **integers by construction**, so summing over a Set is exact
and order-independent — **no sort needed for the sum** (anything *ordered* still needs an ascending-id
sort).

### R182-D — the ramp PLAYS THROUGH, it never snaps
> *"It runs through a loop. You just make like a video from seventy six to fifty two, however many
> cutouts that is, in a shot. You don't skip them, you just run them through. It makes it look like a
> video. The more damage is done, the more it looks like a whole video loop. If he destroys a whole
> structure in one hit, within like one second it looks like a whole structure got destroyed."*

The health fraction gives a **target frame**. The renderer **animates** from the current frame to the
target, playing every frame between. A big hit plays a longer run; a one-shot kill plays all 24.

⛔ **The frame cursor is CLIENT-LOCAL PRESENTATION STATE. Never sim state, never on the wire.**
Two machines animating a beat apart must not be a divergence.

### The mapping

| health | frame | state |
|---|---|---|
| 100% | 1 | pristine |
| 50% | 12 | the "damaged" plate |
| 34% | 16 | barely standing, repairable |
| **<33%** | **17→24** | death run ~1 s, then self-destruct |

8 of 24 frames = 33.3%. **His threshold and his frame count are the same boundary.**

⚠ Reuse `TOWER_DAMAGED_BELOW` (`render/towerFrames.ts:79`, 0.5) rather than minting a second constant.
`buildingTint` (`healthBar.ts:152`) already switches green→amber at > 0.5 and amber→red at > 0.25, so
the health bar and the art will agree for free.

---

## ⛔ THE BALANCE CHANGE — MEASURED, AND IT IS REAL

Moving the trigger from "star breaks" (banked ≥ 50) to "below 33%" (banked ≥ 34):

| attacker | fifths/hit | hits TODAY | hits NEW |
|---|---:|---:|---:|
| melee goblin | 12 | **5** | **3** |
| pencil chewer | 7 | **8** | **5** |
| goblin hound | 21 | 3 | 2 |
| suicide drone | 30 | 2 | 2 |
| Vlad | 150 | 1 | 1 |

**~40% faster death to swarm units — exactly the class the hub's own drones counter.** Nothing
changes for one-shot attackers. The counterweight: it also *detonates* 40% sooner.

## ⛔ GATE — R182-C, THE SELF-DESTRUCT DAMAGE. DO NOT BUILD UNTIL HE ANSWERS.

He ruled *"four times a drone's damage"* = 4 × `attackFifths(DRONE_ATK 5, DRONE_PEN 1)` = 4 × 30 =
**120 fifths** — **believing it was undefined. It is not.**

`applyStructureSelfDestruct` (`state/potatoLifecycle.ts:370`) calls **`applyRadialClear`** — it
**deletes** every enemy creature and shape inside `STRUCTURE_SELFDESTRUCT_RADIUS` (240 px) outright.
An instant-kill radius, not a number on the ladder. **120 fifths would not kill a tier-9 boss**
(pools 260–462) where today's blast deletes one.

⚠ **And it already spares the owner.** S157 P0, on his own ruling (*"lightning hubs blow up own
structures or nearby friendlies … they shouldnt be able to hit friendlies in friendly territory"*),
the blast exempts the owner's shapes and units. His *"he will also bring down some of his own
connectors"* is **not current behaviour** — making it so **reverses S157**.

**Two answers needed: (a) 120 fifths replacing the raze, or keep the raze? (b) should it damage his
own connectors?** If unanswered: **build everything else, leave the blast exactly as it is, report.**

---

## ⛔ REPAIR — R182-E, AND TWO LIMITS HE SHOULD SEE IN PRACTICE

> *"If there's only an amount of HP missing but no connector destroyed, so it's still intact and
> producing characters, then it takes one shape. So far it takes NO shape — that's not correct. It
> takes one shape. Whether it's one HP or fifty HP."*

- **Case 1 — intact, damaged, nothing missing: ONE shape, flat.** Today this is **FREE**:
  `planStructureRepair` returns an empty bill and `planPaymentForTypes(world, seat, [])` returns `[]`
  (`structureRepair.ts:239`), so FIX clears every `damageFifths` for nothing.
- **Case 2 — missing nodes: the missing shapes themselves.** Already shipped. No change.

**Which shape for case 1?** He dismissed the table as over-thinking (*"whatever shape is missing is
the shape that you need to rebuild"*), so **the type is YOURS and must say so at the constant.**
Derive it from the blueprint: the most numerous `SparkType`, hub type as tie-break. ⛔ **Derive it,
never hand-list it** — a copied table is the drift defect this repo is built around. Assert all seven
recipes in a test. (Derived: pentagram→Triangle and goblinTower→Circle, which match his own two
examples; lightningHub/stinkTower→Circle; laserTurret→Spiral; helga and voltkin tie.)

⚠ **Two limits, both confirmed, both worth reporting to him:**
1. **Repair only works during BUILD** (`canBuildNow` requires `matchPhase === 'BUILD'`, R19). He has
   accepted this. So "repairable wreck" means *repairable between rounds*.
2. ⛔ **`blueprintGroupOf` (`structureRepair.ts:161-166`) returns null if ANY member of the connected
   component has `origin === null`** — and `seatStructureAt` walks the **whole component**. So **one
   friendly hand-placed shape auto-bonded onto one hub leaf makes that hub permanently unrepairable.**
   S158 fixed this lattice problem for the RECIPE (`isStarAt` walks the hub's own bonds) and never
   fixed it for REPAIR. **Report it; do not silently widen the scope to fix it.**

---

## THE DEATH PATH TODAY — WHAT YOU ARE CHANGING

`state/hostTick.ts:696-707`: the hub is **the one recipe with a bespoke death branch**. On a
revalidation poll (`REVALIDATE_INTERVAL_TICKS = 30`, so up to 0.5 s after its star breaks) it
dispatches `STRUCTURE_SELFDESTRUCT` and then `razePrimitives(world, selfIds)` over its **whole
remaining component**. The trigger becomes star-scoped and threshold-based; the ~1 s death run must
complete before the raze.

⛔ **The Voltkin TV's `destroyedAt` / `dying` maps (`voltkinTowerRenderer.ts:333-352`) are
CLIENT-LOCAL and empty on a reload or a joiner.** Use that shape for the transition beat only — never
for anything the sim must agree on.

## PRECEDENT TO COPY

`src/render/voltkinTowerRenderer.ts` — atlas manifest shape, state machine, and **two gates a new
renderer needs**: the fog gate (`:474`, `isConcealed`) and the `manifest === null` bail (`:476`).
Also `towerCover.ts` — the hub's shapes should phase out under the new sprite and back in when a
connector breaks (R169; `towerCover.ts:40-50` was written anticipating exactly this).

## GATES

`typecheck` · `vitest` · `build` · **`e2e:gating`** · **`npm run check:atlas`** (needs
`pip install numpy scipy Pillow`).

## FILE BOUNDARY

**Yours:** a new hub renderer + frame module under `src/render/` · `render/towerFrames.ts` ·
`state/hostTick.ts` *(the hub death branch only)* · `state/potatoLifecycle.ts`
*(`applyStructureSelfDestruct` only)* · `state/structureRepair.ts` · `assets-source/lightning-hub/` ·
`public/art/lightning-hub/` · `SPARK_CANON.md` + `src/canon.test.ts`

⚠ `src/constants.ts` shared with branch 3 — append in your own section.
⚠ `src/main.ts` shared with 1 and 2 — you own the **hub renderer registration** line only.
⛔ **`SPARK_CANON.md` — you are the only branch editing it.** Any number you add lands **with its
constant and its `canon.test.ts` assertion in the same commit.** Also: canon §6 omits
`Bond.damageFifths` from the "already on the wire" list, which is an error — fix it while you are there.

## REPORT BACK

The reusable seam — **exactly how many lines the next tower costs.** The art quality outcome and
whether you got a clean re-export. Whether R182-C was answered or left alone. And the two repair
limits, stated plainly for him.
