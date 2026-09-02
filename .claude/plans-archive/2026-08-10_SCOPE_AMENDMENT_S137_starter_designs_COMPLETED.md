# SCOPE AMENDMENT (Rule 16) — S137: the three free starter designs

**STATUS: COMPLETED** (stamped S159 P4) — all three starter designs SHIPPED, across S138–S158 rather than in the single "Session A" this document planned for, which is why its own STATUS line went stale and the SessionStart pre-flight warned about it every boot for weeks. Evidence, re-probed at the stamp:
· **Goblin Swordsman** — `goblinMelee`, and `creatureLifecycle.ts:143` records it as a FREE STARTER protected by the blueprint Q10 invariant (*"each seat is granted one goblin of each kind"*).
· **Goblin Archer** — `goblinArcher`, `GOBLIN_ARCHER_CONFIG` registered at `voltkin-config.ts:728`, stats at `constants.ts:1433-1439`, and he has had a real arrow since S153 P2 (`render/creatureProjectile.ts`).
· **Stink Tower** — `DefenderKind` includes `'stinkTower'`, its recipe is `blueprints.ts:183 star('stinkTower')` at `STINK_TOWER_SIZE`, and S157/S158 took it all the way to landed bags that are destructible and burst.
⚠ The S138 amendment box below ("THE CONSEQUENCE ABOVE WAS FALSE FOR 2 OF THE 3 UNITS") is the reason this took ten sessions instead of one, and it is worth reading before costing any "it is just config + art" claim.

**Trigger:** owner request, 2026-08-10, after the round-2 build-space rulings. This is a scope
EXPANSION beyond the S137 batch PDR and beyond `CASTLE_BUILD_SPACE_DESIGN.md`, so it gets its own
amendment before any code — no ad-hoc build.

**Status:** ART SPIKED + DESIGNED. **Not implemented.** Art shown to the owner first, per their
standing instruction from the Voltkin/HELGA session ("spike art + show owner before wiring").

---

## 1. OBJECTIVE

Author the free, non-godly starter designs that C6 proved do not exist. Every player gets all three,
free, every match, whether or not anything is unlocked in the Codex. Three roles, owner-specified:

| # | role | unit |
|---|---|---|
| 1 | offence, melee | **Goblin Swordsman** |
| 2 | offence, ranged (short) | **Goblin Archer** |
| 3 | defence, short-range area | **Stink Tower** |

## 2. ⭐ A.0 — THE MACHINERY ALREADY EXISTS (this is what makes it a few sessions, not many)

| need | already ships | where |
|---|---|---|
| unit FSM | `DefenderState = IDLE / WALK / WINDUP / FIRE / RECOVER` | `defenders/defender.ts:55` |
| unit kinds | `DefenderKind = 'turret' \| 'princess'` — a union to extend | `defender.ts:42` |
| a unit that WALKS AND PURSUES | HELGA already does: `walkTarget` refreshed each WALK tick toward the victim, Verlet `prevPos`, serialized additive-optional | `defender.ts:66-79` |
| a STATIONARY turret | `turret` kind, pinned to its anchor primitive | `defender.ts:62` |
| recipe → unit minting | `REGISTER_DEFENDER` on topology change; `REMOVE_DEFENDER` when the recipe breaks (the shipped counterplay) | `godlyMatcherCore.ts:150-170`, `hostTick.ts:301-315` |
| **50% slow debuff** | `POOP_SLOW_MULTIPLIER = 0.5`, `POOP_SLOW_TICKS = 15s`; cruiser variant too | `constants.ts:993-994, 1014` |
| character art pipeline | veo atlas + manifest, lazy-loaded, **with a procedural-puppet fallback until it resolves / if it fails** | `princessRenderer.ts:2-12, 51-52` |
| per-character audio | `public/godly/helga/audio/*.ogg` | shipped |

**Consequence:** all three units are **new `DefenderKind`s with per-kind config + art**, not new
systems. The swordsman is HELGA's pursue-and-strike behaviour retuned; the archer is that plus a
projectile; the tower is the `turret` kind plus an aura and a death effect.

> ### ⛔ AMENDED S138 — THE CONSEQUENCE ABOVE WAS FALSE FOR 2 OF THE 3 UNITS
>
> S138's A.0 verified, by grep, that when this was written **nothing in the game could be damaged
> except a creature**: `damageCreature` (`creatureLifecycle.ts:243`) was the ONLY exported damage
> function in `src/`; `DEFENDER_HP` was a `1e9` sentinel; primitives had no `hp`; `CONNECTOR_HP` is
> the *attacker's* `chewProgress` counter, not hp; and a defender could only ever target a creature
> (`targetCreatureId: CreatureId | null`, acquisition solely via `findNearestEnemyCreatureFrom`).
>
> So **"walks toward the nearest enemy structure"** (swordsman + archer) and **"each bag is its own
> destructible part with its own HP"** (§4b B) were not "config + art" — they needed a damage
> substrate that did not exist, which `BACKLOG.md` V6-2.1 R6 already filed as an *unbuilt
> prerequisite slot*. Only a defence-flavoured reading (goblins fight chewers, like HELGA) was ever
> as cheap as this table claims.
>
> **✅ RESOLVED — the prerequisite SHIPPED in S138 P1**, on the owner's "dispatcher first, starters
> after" ruling: `Primitive.hp` + `PRIMITIVE_MAX_HP` (1000), real per-kind defender hp replacing the
> sentinel, and `state/damage.ts damageEntity` as the one damage path. The rest of §2 stands, and
> the FSM/art/slow/atlas reuse claims were all re-verified as correct. Read §2b before Session A.

## 2b. WHAT S138 P1 HANDED SESSION A (and the three questions it left open)

**Available now** — `import { damageEntity } from 'state/damage.ts'`:

| piece | detail |
|---|---|
| `damageEntity(world, target, amount, source)` | `target` is `{kind:'creature'\|'primitive'\|'defender', id}`. Returns `true` iff the target died. THE one damage path — `damageCreature` is delegated to, never bypassed |
| `PRIMITIVE_MAX_HP = 1000` | chosen so % authoring is INTEGER: 1% = 10, 2.5% = 25, 5% = 50. Integer damage cannot drift ⇒ no float-determinism risk on the host/worker differential |
| `TURRET_DEFENDER_MAX_HP` 3000 / `PRINCESS_DEFENDER_MAX_HP` 2000 | ⚠ FIRST-PASS, unvalidated by play — nothing dealt damage when they were written. **Tune them in Session A**, against the attacker that first exercises them |
| `razePrimitives(world, primIds, alsoBonds?)` | the ONE way a primitive leaves the world (bonds off both endpoints → bonds deleted → prims deleted → `snapPrevPosForUnbonded` → `reconcileFouledPrimitives`). Never hand-roll it |
| integer guard | a fractional `amount` THROWS, naming the cause. This is the S137 "5% per tick" footgun made impossible to reintroduce silently |

**Three open questions S138 could not answer, carried deliberately:**

1. **⚠ "Nearest enemy structure" is undefined** now that primitives die independently. Is a structure
   the largest connected component, any primitive with hp, or the defender's anchor?
   `findNearestEnemyCreatureFrom` **cannot** be reused — it is creature-typed. The goblins need a
   new acquisition function, and `Defender.targetCreatureId` is `CreatureId | null`, so widening it
   to a target union is a **serialized** change (a bump, folded into the starters bump).
2. **⚠ AoE vs the 5 bags.** With per-primitive hp, one AoE hit damages all 5 bags at once, so the
   Stink Tower absorbs **5× the AoE damage** of a single-primitive structure. Decide whether that is
   a feature (it is fragile to splash) or needs a per-structure damage cap.
3. **Killing a defender razes its ANCHOR** (S138, verified: `runDefenderIgnition` re-mints any recipe
   match whose anchor has no live defender on ANY topology change, so a plain delete yields an
   IMMORTAL defender). Confirm that reads right for the goblins, which are *units*, not emplacements —
   a unit whose "anchor" is razed on death may want a different rule.

## 3. UNIT SPECS

### 3.1 Goblin Swordsman — offence, melee
Walks toward the nearest enemy structure/unit, closes to melee range, WINDUP → FIRE → RECOVER.
Reuses HELGA's pursuit wholesale. Cheap, fast, fragile; the pressure unit.

### 3.2 Goblin Archer — offence, ranged (short)
Same pursuit, but stops at its (short) range band and fires instead of closing. Needs one thing the
codebase does not have for defenders: a **travelling projectile**. Cheapest honest option is the
shipped FIRE-hold pattern (damage applied at FIRE entry, held `DEFENDER_FIRE_HOLD_TICKS` so a client
reliably renders the effect) plus a render-only arrow streak — i.e. **hitscan with a drawn arrow**,
no new physics entity, no new wire surface.

### 3.3 Stink Tower — defence, short-range area
Stationary. A scrap tesla-pylon hung with lit 1990s brown paper bags.

- **Aura (passive):** everything hostile inside its radius takes a small damage-over-time — owner:
  *"2% dot dmg … real low damage"*.
- **Taunt:** owner's reasoning is that it is offputting enough that everyone will want to switch it
  off. Two readings, and they stack: (a) *emergent* — players want it gone; (b) *mechanical* — enemy
  units preferentially target it. **(b) needs an owner ruling** (see §5 Q2).
- **Death burst:** when destroyed or touched, it bursts and covers whoever is close —
  **−50% speed** (reuse `POOP_SLOW_MULTIPLIER`, already exactly 0.5) plus a heavier DoT.
- The bags, flies and green fumes are the read: you should not *want* to stand near it.

## 4. ART — spiked, owner-facing

Generated with Imagen 4 Ultra, matched to HELGA's house style (thick ink outlines, flat saturated
cel shading, exaggerated proportions). **All original** — "goblin" is a generic fantasy archetype;
no Dota or other franchise likenesses (the S95 Totoro rework is why this is explicit).
Delivered to `C:\Users\onesh\OneDrive\Desktop\SPARK_S137_starter_designs`.

⚠ **Defect found by looking, and it is the known one.** Prompting for "sticker-style clean cut edges"
produced a literal **white die-cut halo** on one archer variant — which is precisely the *"visible
square box"* artefact the owner rejected on the old Voltkin/HELGA sprite. The clean variant was taken
instead, and **"sticker" must not appear in any future prompt for this pipeline**. Two of the three
picks still carry a small ground-shadow ellipse that must be matted out before atlasing.

**Remaining art work (next session):** per-state veo image-to-video loops (idle / walk / attack /
death) → frame extraction → one atlas PNG + manifest per unit, following
`public/godly/helga/anim/`. Owner ruling on file: **real video loops, not procedural sprite
transforms.**

## 4b. OWNER RULINGS — ROUND 2 (2026-08-10). §5 is now ANSWERED; kept below as the record.

### A. The damage-tick model (owner: "make the tick rate logical, look at Legion TD 2")

Six rules, chosen so the numbers stay honest regardless of engine tick rate:

1. **Balance in TOTALS, never per-engine-tick.** Every DoT is authored as *"X% of max HP over N
   seconds"* and the per-application value is derived. This is the single fix for the footgun that
   made "5% per tick" mean death in 0.33 s.
2. **A DAMAGE CADENCE decoupled from `PHYSICS_HZ`.** One application every **30 physics ticks
   (0.5 s)** — 2/sec. The WC3/Legion-TD lineage uses ~1 s; 0.5 s reads smoother and still costs
   nothing.
3. **% of MAX HP, never current HP.** Percent-of-current can never actually kill (Zeno) — a classic
   DoT bug.
4. **REFRESH, do not STACK.** Re-entering the field refreshes the remaining duration; it never adds
   a second instance. Otherwise camping in the aura is instant death and two towers are 2× lethal.
5. **Tick-domain and deterministic.** Store `stinkUntilTick` + `lastStinkApplyTick`; never
   wall-clock. Exactly how `benchedUntilTick` and `poopyUntilTick` already work.
6. **The burst's "random directions" must NOT use `Math.random`, and should not draw from the seeded
   RNG stream either** — perturbing draw order is a documented desync hazard (S128). Use a PURE
   function of `(defenderId, tick, index)`, the pattern already shipped in `gathererMorphShape` and
   `keepRainbowTint`. Same on every peer, zero RNG cost, cannot desync.

**Resulting numbers**

| effect | per application | rate | duration | hits |
|---|---|---|---|---|
| **Stink aura** | 1% max HP / 0.5 s | **2 %/s** | while inside + 2 s lingering | **enemies only** |
| **Death burst DoT** | 2.5% max HP / 0.5 s | **5 %/s** | **50% of the aura's lingering** (owner ruling) | **everyone, incl. the owner's own troops** |
| **Death burst slow** | — | **−50% speed** — reuse `POOP_SLOW_MULTIPLIER` (already exactly 0.5) | `POOP_SLOW_TICKS` | everyone |

Sanity: a unit that never leaves the aura dies in ~50 s — genuinely "real low damage". The burst is
~10% max HP plus a heavy slow: punishing, not lethal on its own.

### B. REAL AGGRO — the bags are destructible, and that IS the mechanic

Owner: *"real aggro. real enemy spawn that come within range try to destroy the bags of shit and then
eventually the tower itself, losing time and health while doing it."*

- The tower carries **5 hanging bags** — matching the spiked art exactly.
- **Each bag is its own destructible part with its own HP.** Enemy units acquire the nearest bag.
- **The core is untargetable while any bag remains.** That is what converts the tower into a
  time-sink instead of a single health bar.
- **Popping a bag costs the attacker**: a small local splash on the popper. So clearing the tower
  bleeds you — the owner's "losing time and health while doing it", made mechanical.
- Only once all 5 bags are gone does the core become attackable; killing it fires the full burst.

This is real aggro (targeting is forced onto the bags), not merely emergent annoyance.

### C. Recipes — ⚠ Q3 is RESOLVED: the 4-shape space is FREE

Measured, not assumed: `src/combos.ts` defines `type ComboKey = \`${SparkType}->${SparkType}\`` —
the **Magic-14 combos are two-shape PAIRS**, so they occupy only the 2-shape space. The godly
recipes are 5–9 shapes. **Nothing in the game currently uses a 4-shape recipe**, so the owner's
"4 shapes each, not colliding with the TD towers or the godlies" is satisfiable with zero collision
risk. Exact triples/quads to be assigned in Session A against the live registry.

### D. Animation — "move like real characters, not like stickers"

Owner ruling reaffirmed: **real veo image-to-video loops, not procedural sprite transforms** (the
S96 "PowerPoint spin" rejection). **PIPELINE PROVEN THIS SESSION** on the swordsman: veo 3.1,
image-to-video from the key art, 4 s @ 720p, 96 frames @ 24 fps. Camera stayed locked, the character
stayed centred, the ink outlines and cel shading survived, and the background stayed flat white —
i.e. it is atlas-able through exactly the HELGA path.

⚠ **Two defects found by LOOKING at the frames, both fixable in-prompt:**
1. **He lets go of the cleaver.** Around frame 4 veo reads "swing" as partly a *throw*: the blade
   detaches and flies off with a motion puff. A melee unit must never release its weapon — the
   prompt must state that the weapon stays gripped at all times.
2. **Scale/position drift** between frames. Normal for veo; handled at extraction by cropping every
   frame to a consistent bounding box + anchor before atlasing.

States to generate per unit: goblins **idle / walk / attack / death**; tower **idle (bags sway,
flies circle) / lob / burst**.

⚠ **SECOND TAKE, AND THE HONEST RESULT: veo does NOT reliably hold character/prop consistency across
a full 4 s clip at this style.** A re-run with an explicit "the cleaver stays GRIPPED, never thrown"
instruction plus a personality direction improved grip retention in most frames — **but one frame
still shows the blade detached, and veo additionally hallucinated a TAIL the source art does not
have.** Prompting alone did not close it.

**The fix is not a better prompt — it is FRAME-LEVEL CURATION.** An atlas state needs only ~6-10 good
frames, not a flawless 4 s. So the animation session should: generate 2-3 takes per state (~$0.50
each), extract at 24 fps, and hand-pick a clean, consistent subset — rejecting any frame where the
weapon detaches, a limb/prop drifts, or scale jumps. Budget takes accordingly; do not assume one
generation per state.

### E. Audio — grunts, sparingly (owner: "not too many but enough for it to be interesting")

Per the established audio taste (dry and punchy beats noisy; deep beats high; **audition the .ogg on
the desktop before wiring**): **2 attack grunts + 1 death cry per goblin**, alternating so repetition
does not set in, plus a tower idle burp and a burst splat. ~8 clips total.

### F. Personality — each one distinct (owner: "give them personality of their own")

- **Goblin Swordsman — the reckless one.** Over-eager, charges first, cackles mid-swing, over-commits
  and stumbles on recovery. Cocky little bruiser.
- **Goblin Archer — the sly coward.** Keeps his distance, takes potshots, smug when one lands,
  visibly panics and backpedals when something closes on him.
- **Stink Tower — the obnoxious one.** Not a character but full of attitude: it burps, sags, perks
  up when someone approaches, flies orbiting it. Gleefully repellent.

## 5. OPEN QUESTIONS — ANSWERED IN §4b (record retained)

**Q1 — the DoT numbers do not survive contact with the tick rate.** `PHYSICS_HZ` is 60. Taken
literally, *"5% dot hp per tick"* kills a full-health target in **20 ticks = 0.33 seconds**, and the
2% aura kills in 50 ticks = 0.83 s. Both are almost certainly meant per *damage tick*, not per
physics tick. Proposal: a damage cadence of one application every 30 ticks (0.5 s), giving the aura
~4%/s and the burst ~10%/s over a bounded window. **Owner to confirm the intended time-to-kill.**

**Q2 — is the taunt mechanical or emergent?** Should enemy units be *forced* to prefer the tower as
a target (real aggro), or is it purely that players hate it and choose to remove it?

**Q3 — recipe shapes, and a collision risk.** Each starter needs a shape combo to build. Godly
recipes are 5–9 shapes; starters should be smaller (3–4) to stay "simple". ⚠ **But small combos may
already carry meaning** — `comboDiscovery.ts` + the Combo Codex track discovered combos, so a 3-shape
starter recipe could collide with an existing Magic-14 combo. This must be checked against the live
registry before any recipe is assigned. **Not resolved here; do not guess it.**

**Q4 — friendly fire.** Does the Stink Tower's aura hurt its owner's own units, or only enemies?
Hurting everyone is funnier and matches the fiction; hurting only enemies is kinder.

## 6. RISKS

| # | risk | mitigation |
|---|---|---|
| R1 | Three new `DefenderKind`s expand a serialized union → wire + hash surface | `DefenderKind` is already serialized; adding members follows the shipped `turret`/`princess` precedent. Needs a `PROTOCOL_VERSION` bump — **fold into the ONE bump the build space already forces**, not a second one |
| R2 | The art does not read at in-game size | HELGA shipped at `PRINCESS_SPRITE_BASE_SCALE 0.34`; check these at that scale **on the dark board**, not on white, before atlasing |
| R3 | Atlas fails to load on a peer | The shipped pattern already answers this: procedural-puppet fallback (Voltkin/HELGA precedent) — do not skip it |
| R4 | The tower's aura + slow touches the damage and movement paths every tick | Reuse `POOP_SLOW_*`; do not invent a parallel slow |
| R5 | Scope creep into godly territory | These are explicitly NON-godly, free, and simple. If a starter starts needing bespoke effects, it has become a godly and belongs in a different slot |

## 7. SEQUENCING (owner said "a few sessions" — this is the split)

1. **Session A** — answer §5; assign recipes; extend `DefenderKind` + per-kind config; implement the
   three behaviours against the existing FSM; procedural-puppet art as placeholder. Ship playable.
2. **Session B** — veo animation loops → atlases + manifests + audio; swap the placeholders.
3. **Session C** — free-design tier wired into the build space / Codex library (depends on the build
   space landing first).

⚠ **The build space must land before step 3**, and it carries the `PROTOCOL_VERSION` 16→17 bump. Do
these in one bump, not two.

## 8. TESTING

- Unit: per-kind FSM transitions; aura damage cadence; slow application + expiry; death burst radius.
- **Real-physics acceptance** (S136 standing lesson): spawn each unit, run the actual physics loop
  for several frames, assert it is where it should be and its target took the expected damage.
- Determinism: `hashWorldState` identical host vs `?worker=1` with all three units alive.
- **Look at the render** at `0.34` scale on the dark board — state assertions cannot see legibility.
- Gating lane stays green.
