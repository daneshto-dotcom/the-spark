# W1-C — A.0 STATE-DISCOVERY FINDINGS (S165)

Produced by a 43-agent probe-then-adversarially-verify pass over the live tree, run **before** any
W1-C code was written. Every row carries a `file:line` that was opened, not remembered.

> ⛔ **READ THIS BEFORE WIRING THE CASTLE EMITTER.** The S164 handoff described W1-C as "both
> blockers gone, no protocol bump owed". That description is **materially wrong in six places**, and
> two of the corrections are the difference between a working feature and a silent one.

---

## 1. THE PRIOR PLAN'S COORDINATES ARE WRONG — every one of these was a stated edit site

| The plan said | The tree says |
|---|---|
| `src/state/creatureLifecycle.ts:147-156` | **`src/state/creatures/creatureLifecycle.ts:155-165`.** `ls` on the old path returns *No such file or directory*. Line 147 is inside a docblock. |
| `world.spawners` | **`world.creatureSpawners`** (`worldTypes.ts:260`). `grep -rn 'world\.spawners' src` → **zero hits**. A grep on the wrong name reports a clean lane. |
| `recallArmies` at `hostTick.ts:395` | **Definition is `hostTick.ts:184`**; `:395` is the CALL site. The docblock the snapshot calls authority is at `:170-183`. |
| `recipeStillSatisfied` is a touch site | **It is not.** Two functions of that name exist and **neither takes a `SpawnerId`** — `spawners/spawnerLifecycle.ts:109` takes the spawner OBJECT, reached only by iterating `world.creatureSpawners`. A sentinel absent from that map is unreachable. **Drop it from the edit list.** |
| `ownHomePos` must be taught the sentinel | **No change needed.** `creatures/creatureAI.ts:726-738` already guards `spawner !== undefined` and falls back to `castleAnchor(seat, world.layout)` — which is exactly where a castle-born unit should retreat. The existing miss-path is the semantically correct path. |
| "No protocol bump owed — it rides P1's 40→41" | **41 IS ALREADY SPENT AND LIVE.** See §2. |

---

## 2. ⛔ A PROTOCOL BUMP **IS** OWED — 41 → 42

`protocol.ts:523` — `export const PROTOCOL_VERSION = 41 as const;`. The bump commit `641783c`
(S164 P1, castle regen) is an **ancestor of `origin/master`** with six commits after it, and this
project's rule is that pushing master **is** shipping to production. So **v41 peers are live in the
wild right now, and none of them knows any race-unit `CreatureType`.**

The "rides P1's bump" reasoning was only ever valid while P1 and W1-C landed in the *same* session.
P1 shipped; W1-C's wiring did not. The premise expired.

- **Three unbroken precedents** for exactly this class in `protocol.ts` itself: 13→14
  (`lightningDrone`, `:98`), 17→18 (`goblinMelee`, `:128`), 29→30 (five goblin literals, `:304`).
- ⛔ **There is no switch to fall through — it is worse than that.** `grep` for
  `switch (c.type|switch (creature.type|switch (s.type)` across non-test `src/` returns **zero hits**.
  `deserializeCreature` assigns `type: s.type` **straight through**, so a stale peer accepts the
  unknown literal and then hits `CREATURE_CONFIGS[unknown] === undefined` on its own mirror.
- ⚠ **The six-site gate is not six sites.** `protocol.ts:748` states plainly that
  `protocolVersionSync.test.ts` enforces **sites 1, 2, 3 and 5 only**. Site 4 (`readonly
  protoVersion: 41` at `:751`) fails `tsc`. **Site 6 (the session label) is enforced by NOTHING.**

⭐ The one design that avoids the bump: **reuse an existing serialized `CreatureType`** and carry the
race in an already-wire-borne field. If a new literal ships, 42 is owed.

---

## 3. ⛔ THE SENTINEL ALONE DOES NOT MAKE THE CASTLE EMIT

R133 clears the *gate* and the *caps*. It supplies **no cadence**. The emit loop is
`hostTick.ts:580-581`, iterating `world.creatureSpawners`; its three arms (`:714/:743/:763`) all read
`sp.nextSpawnTick` off a **real record**. A sentinel id is by construction absent from that map, so
**the castle is never polled and never emits.** The emitter needs its own explicit call site.

## 4. ⛔ THE SENTINEL MUST BE PER-SEAT, AND IT MUST NOT RIDE THE GOBLIN CAP

`underGoblinCaps` (`creatures/creatureLifecycle.ts:265-278`) counts
`if (c.sourceSpawnerId === sourceSpawnerId) perSpawner++` **with no `ownerPlayerId` term**, and
increments a **global** counter with no owner filter either.

- **One shared sentinel ⇒ `GOBLIN_MAX_PER_SPAWNER = 10` (`constants.ts:1355`) becomes a CROSS-SEAT
  cap.** Seat 0's tenth race unit blocks every other seat's castle. Silent, deterministic, and
  gameplay-fatal — it looks exactly like "late game, no race units".
- **Riding the goblin family at all also STARVES THE GOBLIN TOWERS**, because race units increment
  `GOBLIN_MAX_GLOBAL = 200` (`constants.ts:1332`).
- ⇒ **Add a third cap family**: `RACE_UNIT_MAX_*` on the `CHEWER_MAX_* = 10_000` sentinel-backstop
  shape (`constants.ts:1294-1296`) plus an `underRaceUnitCaps` sibling, and extend the two-way
  ternary at `creatureLifecycle.ts:236` to a three-way route. This is also what R123/R124 actually
  require — "no per-player cap, but a sentinel backstop".

## 5. ⛔ `nearestChewer` WILL MAKE EVERY BOT FLEE RACE UNITS

`bots/botBrain.ts:1014-1027`. Its docblock claims *"Only chewers (`sourceSpawnerId !== null`)"*, and
the body's **only** filter is `if (c.sourceSpawnerId === null) continue;` — **no `c.type` check and no
owner comparison.** Any sentinel-carrying race unit satisfies it and feeds the chewer-avoid in
`chooseGoal`, so bots flee their **own** units.
⇒ Fix the filter to `if (c.type !== 'chewer') continue;` — which is what the name and docblock
already assert — and test it.

## 6. ⛔ THE FROZEN DIFFERENTIAL GATE BREAKS ON TICK 1

`hostTick.differential.test.ts:641-648` asserts `hashWorldStateFull` equality **every tick** and a
full `snapshot()` byte-compare against `referenceHostTick` — a **verbatim frozen transcription** of
the pre-S119 host tick that will never contain a castle emitter. Adding the emitter to `runHostTick`
breaks **every scenario on its first tick**.
⇒ Decide the strategy **in the PDR, before writing the emitter**: either transcribe it into the
reference (which the file's S159 P9 note explicitly forbids) **or** give the emitter one call site
behind a gate the scenarios leave false.

---

## 7. "THE WHOLE CREATURE FAN-OUT IS FIGHT-GATED" IS FALSE — Blocker 8's argument is weaker than recorded

The dissolution of Blocker 8 rested on this sentence. It does not survive contact with the tree:

- **Locomotion is NOT phase-gated.** `physics/physicsLoop.ts:207` runs 8 substeps and `:241-244`
  calls `creatureVerletStep` for every creature with **no `matchPhase` guard**; its caller is invoked
  from `hostTick.ts:241` on `gameState === 'PLAYING'` alone. Only the **FSM/AI/attack** fan-out
  (`hostTick.ts:925`) is FIGHT-gated. Creatures are frozen in **decision**, not in **motion**.
- **`recallArmies` does not cover every creature.** `hostTick.ts:187` — `if (home === null) continue;`
  skips any creature whose owner is absent from `world.players`. Combined with un-gated Verlet, such a
  unit keeps walking for the whole 90 s BUILD.
- **There is no BUILD→FIGHT "release" edge at all** — the block at `:296` has no `else`. Release is
  *implicit*: recall nulls the three target ids and forces ATTACKING→SEEKING (`:197-216`), so the
  `:925` fan-out re-acquires on the first FIGHT tick. The outcome is right; the mechanism is not the
  one the claim describes.
- **Seagulls mutate creature state during BUILD.** `SEAGULL_TICK` is dispatched on `gameState` alone
  (`hostTick.ts:1463-1466`) and `seagulls/seagullLifecycle.ts:254-262` writes `poopyUntilTick`.

⇒ The conclusion (no `SHELTERED` state needed) still holds, but **the safety argument must be
restated correctly** or the next session will rely on a sentence that is not true.

---

## 8. ART AND RENDER FINDINGS

- ⭐ **REGENERATE THE ART BEFORE TUNING ANY RENDER CONSTANT.** `build-sprite-atlas.mjs:297-306`
  builds ONE union bbox across every frame of every state, `:314-316` sets `scale = (ch/bh)*pad`
  (**height-fit**), `:330` pastes bottom-aligned, and `:339` **hardcodes**
  `footAnchor.y = (ch-1)/ch` rather than measuring it. A baked ground shadow extends the union bbox
  *below the feet*, so removing it **changes sprite scale and foot placement**. Any size constant
  tuned against the old atlases is wasted work.
- ⛔ **Directory convention violated.** `render/castleFrames.ts:83-87` is explicit: race art belongs
  under `public/art/…`, **not** `public/godly/`, because `/godly/` means *"a combo shipped this"*.
  All six race-unit atlases were written to `public/godly/unit-*/anim/` (hard-coded `outDir` in
  `atlas-specs.json`). A castle-spawned race unit is board furniture, the same category as a castle.
- ⛔ **Do not reuse `goblinRenderer.ensureAtlases` as-is:** it loads **every** entry in `ATLASES` on
  first sync, unconditionally. The six new PNGs are **8,970,745 bytes (8.55 MiB)** measured, ≈46.9 MB
  decoded. `gathererRenderer` already refused exactly this and went **lazy and per-race** — a 1v1
  match needs two of the six.
- ⚠ **The ground mark is a FILL, not a ring.** `creatureLift.ts:104` `drawGroundMarker` is a filled
  owner-tinted ellipse under every atlas-backed creature; the stroked ring
  (`goblinRenderer.ts:385-389`) is drawn only `if (lift > 0)` and `GOBLIN_LIFT` has exactly one entry.
  A **fourth** renderer would get neither — `creatureLift.ts:70` says universality is enforced *by
  there being nothing else to call*.
- ⚠ **A new creature TYPE is not caught by the coverage contract; a new FIELD is.** `stateHashFull.ts`
  `NoUncovered` fails `tsc` by name for a new field. A new type slips through.
- ⚠ **The worker's two serialization sites are NOT tsc-forced** — `workerSim.ts:317-320` says so in
  its own words.

---

## 9. WHAT IS ACTUALLY OPEN — AND ONE THAT WAS NOT

### ⛔ CLOSED. A dead seat's units KEEP FIGHTING. Already ruled, and I asked anyway.

> `ruling_cf_s161_a` — *"Keep fighting (status quo) — a fallen seat's towers/creatures/spawners keep
> acting until razed. OF-3 therefore closes as ruled-intentional: the castle gun is silent because
> the castle is DESTROYED, not because the seat is eliminated."*

The A.0 lane raised this as an open owner question and **I put it to the owner without grepping the
archive first** — which this project's CLAUDE.md forbids in as many words: *"Before asking for a
ruling, grep the archive for it."* S158 was pulled up for exactly this and it cost the owner the
same annoyance twice.

⚠ **And the lane's underlying observation was correct while its conclusion was wrong.**
`state/elimination.ts` really does contain zero references to `creature`, and `isEliminated` really
does have only two consumers. But that is not a gap — **it is what "keep fighting" looks like when
it is implemented.** Nothing needs to reap them because nothing is supposed to. The kingmaker
consequence was named in the ruling's own discussion and accepted.

⇒ For W1-C this means: the castle emitter must stop emitting when the castle is destroyed (the
castle is gone), but the units already on the board are **left alone**. No despawn pass, no freeze
flag, no new state. That is less work, not more.

### ⛔ ALSO CLOSED. The snapshot size is accepted as-is.

> Owner, 2026-09-06: *"about the 65kb question if it ever causes lag then we will talk about what to
> do but for now we're good."*

⇒ **R123's uncapped race units stand, and the wire cost is not a blocker.** Do not re-raise it, do
not add a cap, and do not "defensively" trim the creature payload on this account. If lag is ever
observed in a real match, the conversation reopens then — and the cheap lever at that point is to
send fewer bytes per creature, not to limit how many a player may have.

⚠ Recorded here so a later session reading `constants.ts:1263-1267` — where the guard is honestly
labelled *"FIXTURE-scoped and not a runtime budget"* — does not read that comment as an open
invitation and re-litigate a settled call.

### Still genuinely open

1. **The tier-3 stat numbers (R135).** The owner asked for *"slightly different stats and more
   varied"* and supplied no figures, while R125 fixes the castle unit at 1/1/1/1. Art is done; any
   stat line written before he rules would be MINE, and per this project's rule a number that is
   mine has to say so at the constant with the measurement behind it. Wave 2 work.

## 10. THINGS TO BUILD THAT NOBODY HAD LISTED

- **`spreadTargetPos` at the emit site.** Creatures have **no separation force** — they are excluded
  from the constraint solver (`physicsLoop.ts:233-243`) — so every emitted unit stacks on one pixel.
  Derive both `pos` and `targetPos` deterministically from `(castleAnchor, id)`. No `Math.random`, no
  accumulated remainder.
- **`src/render/raceUnitFrames.test.ts`**, modelled on `castleFrames.test.ts:93-109`: for every race,
  atlas + manifest exist, `cellH` identical across all six, every state the renderer can request is
  present, `frames > 0`. ⭐ **Write it BEFORE the regeneration so the regeneration has a gate.** The
  loader's failure arm is a bare `catch {}` (`goblinRenderer.ts:198-200`), so a bad atlas ships
  invisibly — and exactly one test file anywhere reads `public/godly`.
- **Quote R120 at the emitter's phase branch.** "Castle produces in BOTH phases" is the *first*
  deliberate exception to an owner-driven invariant pinned by `spawnerPhaseGate.test.ts:31-33`
  (*"Nothing is emitted or decremented outside FIGHT"*). Without a note naming it as the one
  exception, the next phase-gate audit will "fix" it back.
