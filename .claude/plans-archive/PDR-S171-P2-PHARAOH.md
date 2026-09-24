# PDR — S171 · P2 · THE PHARAOH (R142)

**Tier: FULL** (new CreatureType + protocol bump + a new lifecycle phase + 7 acquisition sites).
Deliberation: 3-way Council (Claude / Grok-4.20-reasoning / Gemini-3.1-pro) — done, recorded below,
with the disagreements named rather than averaged. A.0 state-discovery: 7-lane probe + hand-run
verification of every load-bearing claim.

**Owner direction:** *"lets start with P2 and work it well making sure it landed correctly and
deployed."* So the deliverable is a VERIFIED LIVE DEPLOY, not a green local suite.

---

## OBJECTIVE

Ship R142 — the Pharaoh's two skills — to production, verified.

> *"for pharao the skills we will give him are - locust attack - he lunches a cone of locusts that
> fly around in locust clouds targeting units and building for 15 sec. he lunches it when the first
> enemy is in range. locusts attack with 10 atk and 10 pen and they cannot be targeted. also he can
> summon the god RA to bring down columns of burning light (he is the god of sun afterall) that
> attacks with upto 15 atk and 15 pen per culumn. each column only lasts 2 sec cinematic and he
> launches like 5 of them one after another. he does that right before he dies- when he hits 1hp or
> about to die he stops does a cool attack form / ritual calling down the colums. he cant be killed
> while he is doing that but when the ultimate attack is finished then he dies."*
> — R142, `RACE_ZONES_AND_BOSS_TOWERS.md:457`

Art is **out of scope** — R143 wants a locust-release stance and column VFX generated on your own
accounts. This ships the code half with procedural VFX, exactly as S170 shipped the other five
bosses' abilities.

---

## WHAT A.0 FOUND THAT CHANGES THE PLAN

Six findings, each verified against the tree in this session. Three of them move the design.

**1. ⭐ "LOCUST CONE" IS A DRIFT, AND EVERY CARRIER REPEATS IT.** You said he *"lunches a **cone** of
locusts that **fly around** in locust **clouds**"*. The cone is the **LAUNCH**; after that they are
clouds that roam and hunt. `boot-snapshot.md:27`, `session-state.json:620` and the S170 PDR all
compressed this to "the locust cone" (the PDR even hardened it to "wedge"), which describes a static
cone volume — a different mechanic. **Built to your words, this is much closer to the Warlord's
direwolf summon than to the Kraken's sonar cone.** The cone only decides where they are launched.

**2. ⛔ THE "SIX BYPASS PATHS" WERE SEVEN, AND THE MOST IMPORTANT ONE WAS NEVER ON THE LIST.** The
carried list named the input-layer raid picker but not `world.ts:668` — the **authoritative**
`RAID_TARGET` reducer that actually spends the raid point and deals the damage. Gating the picker
alone would leave the real hole open. Also new: `render/creatureProjectile.ts:106`. And three of the
six recorded paths had **wrong file paths or line numbers** (`src/controls.ts` is
`src/input/controls.ts`; `voltkinChain` is under `creatures/`; `seagullLifecycle` is under
`seagulls/`). I located every one by content, not by the recorded number.

**3. ⛔ AN UNKILLABLE GUARD IN `damageCreature` WOULD NOT WORK.** There are **eight** production
`world.creatures.delete(` sites and at least four bypass `damageCreature` entirely — the potato's
radial blast (its own docstring: *"it obliterates regardless of hp"*), the structure self-destruct,
the Archdemon's doom list, and a drone path. A channelling Pharaoh would still be deleted. This is
the codebase's signature "three of four call sites" defect, and it is the engineering headline —
the spec doc says so itself.

**4. The existing untargetable tests are weaker than they read.** Of 6 tests, only 2 exercise the
gate as a gate; one is a `readFileSync` substring check that passes on a *comment* mentioning the
function name. The flag is also completely dead — nothing in `src/` sets `untargetable: true`.

**5. e2e DOES NOT GATE THE DEPLOY.** `deploy.yml` and `e2e.yml` are separate workflows with no
`needs:` edge, and `master` has **no branch protection**. A red e2e lane still publishes. So the
gates that matter are the ones I run locally with a captured `$?`. (`e2e-quarantine` is currently
failing, masked by `continue-on-error` — pre-existing, not mine, not in scope.)

**6. Bundle headroom is 85.1 KiB** (814.9 of the 900 KiB charter); the guard starts warning at 60.
This change is logic, not assets, so it should cost single-digit KiB.

---

## THE ARITHMETIC, BECAUSE IT DECIDES THE ONLY OPEN NUMBER

`attackFifths(atk,pen) = atk × (5+pen)` · `unitPoolFifths(hp,def) = hp × (5+def)`

| | |
|---|---|
| Your locust, R142 | 10 × (5+10) = **150 fifths per strike** |
| Your Ra column, R142 | 15 × (5+15) = **300 fifths per column** |
| The Pharaoh's own strike | 6 × (5+8) = 78 |
| Every boss pool | Pharaoh 143 · Kraken 132 · Warlord 121 · Whopper 120 · Vlad 90 · Archdemon 90 |
| A regular unit's pool | 7–16 |

⭐ **A locust strike at 150 one-shots every unit AND every boss in the game** (the largest pool is
the Pharaoh's own 143). So for the locusts, **strikes = kills**, and the only thing that decides how
strong this ability is, is **how many strikes land** — which is cloud count × cadence, the two
numbers R142 does not rule on. Your 10/10 is untouched; balance lives entirely in my two dials.

---

## SCOPE — three stages, each independently committable and shippable

### STAGE A · Close the acquisition bypasses (prerequisite, no gameplay change)

Nothing sets `untargetable` today, so this is behaviour-neutral until Stage B — which is exactly why
it lands first and alone.

| # | site | what it is | verdict |
|---|---|---|---|
| 1 | `state/world.ts:671` | **the authoritative raid reducer** — guard before `raidPoints--`, to keep the documented "paid but got nothing is unrepresentable" atomicity | CLOSE |
| 2 | `input/controls.ts:1448` | the raid cursor pick (the aiming half of #1) | CLOSE |
| 3 | `state/bossSkillsKraken.ts:85` | `nearestEnemyFor` — the sonar's **aim** pick | CLOSE |
| 4 | `state/bossSkillsArchdemon.ts:127` | the teleport "loneliest enemy" scan | CLOSE |
| 5 | `state/creatures/voltkinChain.ts:109` | the chain-lightning hop | CLOSE |
| 6 | `render/creatureProjectile.ts:106` | renderer victim scan; route through the chokepoint | CLOSE |
| 7 | `state/defenders/defenderLifecycle.ts:137` | `targetValid` — **retention** | CLOSE (below) |
| — | `state/seagulls/seagullLifecycle.ts:254` | poop victim | **LEAVE** (below) |

**#7 retention — closing it even though it is latent for R142.** A locust is untargetable *from
birth*, so the guarded chokepoint never acquires one and retention can never hold one. It is dead
for the Pharaoh. I am closing it anyway because it is one line, because `SPARK_RACES_SPEC.md:533`
predicted this exact hole in writing and it shipped unactioned, and because R121's submerged naga
(untargetable as a *state*, entered after acquisition) makes it live the moment that lands.

**Seagull poop — LEAVE, and this is a verdict, not an oversight.** The project rule is explicit that
untargetable is *not* invulnerable: area sweeps still reach an untargetable unit, deliberately,
"else a 15-second locust cloud would be unkillable by anything at all". A poop falls on a position
and slows whatever is under it — an area hit, not an acquisition. Gating it would erode the rule
that gives the player their only counterplay against the clouds.

**Plus the structural guard, which is the part that lasts.** `damage.wired.test.ts` already
establishes the pattern: a filesystem scan of the import graph, written after a perfect, fully
tested `damageEntity` sat with *zero* production call sites for an entire session, because "that is
a property of the import graph, so the guard has to read the import graph." I am reusing it — a
call-site allowlist test asserting these are the only ungated creature scans, so an eighth path
added next year turns the suite red instead of silently shipping. I am also upgrading the
`readFileSync`-substring test into a real behavioural one.

### STAGE B · The locust attack

- **New `CreatureType: 'locustCloud'`** with `untargetable: true`. This forces **PROTOCOL_VERSION
  45 → 46** and there is no way around it: `serializeCreature` emits `hp` only when a creature is
  damaged, so an undamaged one carries no stats and the peer rebuilds them from its *own* config
  keyed by type — distinct stats are only expressible as a distinct type. Same grounds as
  `direwolf` 44→45. The bump is a documented **six** sites, four of them machine-gated.
- **`lifetimeTicks: 900`** (15 s × 60 Hz) — the existing `despawnAtTick` mechanism, already
  serialized and host-migration-safe. No new machinery for the 15 seconds.
- **`CREATURE_TARGETS: BOTH`** — units *and* buildings, per your words.
- **`runPharaohLocusts(world)`** in a new `bossSkillsPharaoh.ts`, wired into `hostTick.ts:1836`,
  modelled line-for-line on `runWarlordDirewolves`: corpse guard, stun guard (R152 — *"cant do
  anything"*), cadence phase-spread by boss id, deterministic fixed-angle placement, no `Math.random`.
- **The launch cone**: clouds placed on fixed angles across a forward arc aimed at the first enemy
  in range. Then they roam and hunt on their own — per finding #1.
- Needs the same **exemption from the one-live-unit-per-(owner,type) spawn gate** the direwolf
  needed; a summon that arrives in a fan cannot pass a one-per-type bound.

### STAGE C · The Ra ritual

- **`raRitualUntilTick?: number`** — additive-optional, **no protocol bump**, exactly the shape of
  `stunnedUntilTick` and last session's `sapFlashUntilTick`, with one reader and an apply-max helper.
- **The trigger, stated deterministically.** *"when he hits 1hp or about to die"* cannot be read
  literally — a single 150-fifth hit exceeds his whole 143 pool, so 1 HP is never observed. The
  honest translation, and all three Council seats converged on it: **"about to die" = "the deferred
  death sweep is about to remove him."** The sweep is the one place a death is *realised*, it runs
  once per tick after the whole strike batch, and it already exists to make mutual kills simultaneous.
  Firing there is exactly once, immune to overkill magnitude, and cannot double-fire when four
  systems hit him in the same tick.
- **The unkillable guard: one `removeCreature()` chokepoint** that every removal routes through,
  plus the same call-site allowlist test as Stage A so a ninth site cannot appear silently.
  I rejected both external seats here: Grok wanted `world.creatures` made private (a large refactor
  smuggled into a feature) and `ehp = 9999` (which is hashed and drives the health bar — it would
  corrupt the desync oracle and spike the UI); Gemini wanted to monkey-patch `Map.delete` at world
  init (fragile, invisible, and the worker-sim path would not inherit it). Gemini was right that
  Grok's two ideas were wrong; its own replacement was worse. The chokepoint plus the import-graph
  test is this codebase's own established answer.
- **5 columns × 2 s = 600 ticks**, 300 fifths each, then he dies.

---

## THE NUMBERS THAT ARE MINE, NOT YOURS

Every one of these is a dial you can overrule in one sentence.

| dial | mine | the arithmetic |
|---|---|---|
| **Cloud count** | **3** | matches the direwolf pack, the only other boss summon |
| **Strike cadence** | **one strike / 5 s** (300 ticks) | 15 s ÷ 5 s = 3 strikes per cloud |
| ⇒ **total** | **9 strikes = up to 9 kills** | 3 clouds × 3 strikes; each 150 one-shots anything |
| **Cloud HP** | low, killable by AoE | so 9 is a *ceiling* — your counterplay reduces it |
| **Launch arc** | 60° forward | 3 clouds at −30° / 0° / +30° |

The Council split hard here and it is worth seeing: Grok proposed 1 strike/second — **45 strikes,
6750 fifths, forty-seven Pharaohs' worth of damage from one ability.** Gemini proposed 5 s and
called Grok's number absurd. I went with the slower one: at 150 fifths a strike, the cadence *is*
the ability, and 9 guaranteed kills from one boss skill is already enormous.

---

## FOUR THINGS ONLY YOU CAN DECIDE — none block, all have a default

1. **⚠ R78 vs R142 collide, and this is a real conflict, not an ambiguity.** At the raid picker your
   own ruling is quoted: *"a raid should hit anything, it holds a certain attack strenght and stats
   of its own."* R142 says the locusts *"cannot be targeted."* Can a player right-click-raid a
   locust cloud? **My default: no** — I read R78 as "raids aren't restricted to chewers" rather than
   "raids ignore untargetability", and letting a raid pick them would make "cannot be targeted" mean
   nothing where the player is concerned. One word settles it.
2. **Do the Ra columns hit an area, or one target?** *"up to 15 atk and 15 pen per culumn"* — a
   column of light falling reads as an area to me. **My default: a small area per column**, so five
   columns can catch a cluster.
3. **What does "up to" mean in "up to 15 atk"?** **My default: exactly 15/15** — the plain reading.
4. **Do the clouds roam freely, or stay near him?** **My default: they hunt freely** within the
   fight area — *"fly around ... targeting units and building"*. They are his reach, not his escort.

---

## RISKS, AND WHAT CATCHES EACH

| risk | catch |
|---|---|
| Protocol bump done partially → stale peers REFUSED with no degraded path | `protocolVersionSync.test.ts` machine-gates 4 of the 6 sites; I do all 6 and read the exit code |
| A ninth removal site appears later and bypasses the ritual | the call-site allowlist test (the `damage.wired.test.ts` pattern) |
| Locusts one-shot the whole board and the game stops being fun | the two dials above; and they are AoE-killable, so 9 is a ceiling |
| The new hashed field desyncs host vs worker | the three hash sub-sites; `CreatureHashed` is a compile-time contract that fails `tsc` until done |
| A new display object shifts `fogHiddenLayer` indices and breaks `tower-art.spec.ts` (hardcoded 6 and 11 — they moved four times last session) | draw into `bossAuras.ts`'s **existing** Graphics; four renderers carry this warning |
| Enemy VFX leaks position through the fog | `isConcealed(x, y, owner)` — the same leak I introduced and fixed last session |
| A gate reads as passing when it failed | every gate redirected to a file, exit code from a captured `$?`, never a pipe, never the wrapper's trailing line |

---

## VERIFICATION — how each claim gets proven

1. `npm run typecheck` · `npx vitest run` · `npm run e2e:gating` · `npm run e2e:races` ·
   `npm run build` · `npm run check:atlas` — each redirected, each `$?` echoed and reported.
2. New unit tests per stage: the seven gates asserted **as gates** (spawn an untargetable unit and
   prove each path refuses it); the ritual firing exactly once under overkill and under a same-tick
   multi-source kill; the locust cadence pinned against `world.tick`; the protocol chain.
3. Push `master` → Actions builds and publishes → **`npm run verify-deploy` 4/4 by live content
   hash**, which is the only trustworthy proof a deploy landed.
4. `verification[]` bindings authored per stage; `verify-session-claims.py` run to exit 0.
5. ⛔ What I will NOT claim: that the locusts *look* right. That is your eyes, like the fog.

---

## ROLLBACK

Three independent commits. Stage A is behaviour-neutral and safe to keep even if B and C revert.
The protocol bump lands with Stage B; reverting B reverts the bump with it.


---

# ⭐ SCOPE AMENDMENT — OWNER ANSWERS, 2026-09-09 (Rule 16)

Approved with: *"Let's get cooking approved."* All four questions answered. Two answers CHANGE the
design; both make it better and one of them makes a "latent" item live.

## R171-A — THE RITUAL PHARAOH LEAVES THE WORLD, HE DOES NOT MERELY REFUSE TO DIE

> *"while he's doing the ritual, he's, like, in a different dimension, so between realities. Right?
> So he's not really in the game. Like, his picture's there, there's, like, his chanting or whatever
> he's doing, the ritual, like, video loop, but he's not attackable. He's not targetable. He's,
> like, just take out the targetable place."*

This supersedes the PDR's "unkillable creature" framing. He is **visually present, mechanically
absent** for the duration.

⭐ **AND IT IS THE MECHANISM THE CODE ALREADY PREDICTED.** `voltkin-config.ts:995` says of the
single `untargetable` read: *"R121's submerged naga is untargetable only WHILE SUBMERGED — a state
test, not a type test — so when that lands, this becomes `flag || <the state test>` in ONE place and
every acquisition path inherits it."* That is exactly this. So:

- `isUntargetableType(type)` becomes `isUntargetable(creature, tick)` =
  `config.untargetable === true || isChannellingRa(creature, tick)` — **one function, one place**,
  and all seven Stage-A sites inherit it for free.
- Damage must also pass through him, which plain untargetability does NOT give (the project rule is
  explicit that untargetable is not invulnerable). So the ritual adds a second, narrower guard at
  the damage entry and at the removal chokepoint — "not in the game" is stronger than "hard to aim at".

⛔ **CONSEQUENCE — RETENTION IS NOW LIVE, NOT LATENT.** My pre-approval analysis said
`defenderLifecycle.ts:137` was dead for R142 because a locust is untargetable *from birth* and so is
never acquired. The Pharaoh is the opposite case: defenders lock onto him during the fight and he
phases out *afterwards*. That is verbatim the case `SPARK_RACES_SPEC.md:533` predicted and which
shipped unactioned — *"a defender that has ALREADY COMMITTED to a naga which then submerges
mid-windup."* It was already in Stage A; it is now load-bearing rather than pre-emptive.

## R171-B — THE RA COLUMNS ARE AN AREA, WITH A GROWING GROUND TELEGRAPH

> *"it should be an area, but that hits that the column, like, anything that the column lands on...
> kind of like when you see the shading when the meteor falls... it starts, like, a little shaded
> area, and it gets bigger and bigger, and then it lands and kills everything in that circle that it
> lands on. The column comes from the sky."*

NEW SCOPE, not in the original PDR: each column is telegraphed by a **ground circle that grows** over
the wind-up, then the column lands and damages everything inside it. Derived per frame from
`world.tick` and the column index — no stored animation state, same rule as every other VFX here.

## R171-C — "up to 15 atk" is just what they do

> *"I don't know what's the up to fifteen attack that you said. That's what they'll be doing."*

Confirmed: **exactly 15 ATK / 15 PEN = 300 fifths per column.** My default stands.

## R171-D — the clouds roam freely

> *"The clouds roam freely for, I don't know, like, what, ten seconds."*

Roaming confirmed. ⚠ **DURATION FLAG:** he said *ten* seconds here, hedged (*"I don't know, like,
what"*); **R142 in writing says 15 sec.** I am building to **R142's 15 s** because it is his explicit
written number, and putting it behind ONE constant (`LOCUST_LIFETIME_TICKS`) so "make it ten" is a
one-word change. Flagged rather than silently resolved.

## ⚠ WHAT HE DID NOT ANSWER

Q1 as asked was *"can a player right-click-raid a LOCUST CLOUD?"* He opened with *"A raid should hit
an number of HP"* and then moved to solving the Pharaoh's case by phasing him out. So the locust half
is still unruled. **Proceeding on my default — a raid cannot pick an untargetable unit** — because
R142 says the locusts *"cannot be targeted"* in as many words, and I read R78 as "raids are not
restricted to chewers" rather than "raids ignore untargetability". One word overrules it.


---

# ⭐ PRIME-AUDIT DELTA — the internal design panel, landed after Stage A shipped

The 4-framing proposal/critique/synthesis panel (`wf_ba7fc269-e7a`) returned after Stage A was
committed. ⛔ **TWO OF ITS FOUR PROPOSAL LANES DIED** — `minimal-surface` and `delivery-realist` both
hit the StructuredOutput retry cap (the delivery-realist one on unescaped backslashes in Windows
paths inside its JSON). 7 of 9 agents completed. Per the standing rule that a hunt returning nothing
is not a completed hunt, those two lanes are **NOT DONE** and their angles — minimum-surface and
sequencing/risk — were covered by hand instead, not by an agent.

Everything below was **hand-verified against the tree** before being recorded.

## Δ1 — `inCone` IS A MEMBERSHIP TEST, NOT A PLACEMENT PRIMITIVE. My PDR was half wrong.

The PDR said *"the locust cone is a REUSE, not new geometry."* `inCone(apex, axis, pos, cosHalf,
rangeSq)` answers *"is this point inside the wedge"*. The launch does not ask that — it **places** N
clouds inside a wedge, which is `cos`/`sin` at fixed angles. `inCone` earns its place as the **test
oracle** (assert every launched cloud is inside the wedge) and as a renderer bound, not as the launch
code. Recorded because "it's a reuse" would have let a later session write ad-hoc trigonometry and
believe it was covered.

## Δ2 — THE EIGHT REMOVAL SITES ARE NOT EIGHT THREATS. Five can reach a channelling Pharaoh.

`suicideBlast.ts:155` and `droneLifecycle.ts:227` delete **the actor itself** and can never hold a
Pharaoh. `creatureLifecycle.ts:585` is gated behind `!config.persistent`, and `makeT9BossConfig` sets
`persistent: true`, so it cannot reach a boss either. The guard still goes in ONE place for all of
them — but the PDR's "at least four bypass `damageCreature`" was loose accounting, and loose
accounting is what produces the next bug.

## Δ3 — ⭐ A NINTH REMOVAL CLASS THE PDR MISSED ENTIRELY: `world.creatures.clear()`

Three production sites — `state/gameMode.ts:441`, `state/godlyActions.ts:113`, `state/save.ts:1359`
(the panel said 1353; verified at 1359). They bypass any per-id guard completely, and they are
**correct** to: a reset is not a death. The codebase already knows this class —
`hostTick.ts:2032` carries *"Three production paths call `world.creatures.clear()` with nobody
dying"*, written after a host detonated a blast into its own base on connection loss. ⇒ Stage C must
NAME and PIN these so a fourth `.clear()` cannot leak ritual state, and the removal chokepoint must
not try to guard them.

## Δ4 — ⛔⛔ THE POPULATION LATCH IS THE HIGHEST-PROBABILITY SILENT BUG IN STAGE B

`applySpawnCreature` refuses a second live creature of the same `(owner, type)` unless exempt. The
exemption list is at `creatures/creatureLifecycle.ts:215-216` and reads
`action.creatureType !== 'direwolf' && !isT9BossType(action.creatureType)`.

**A multi-cloud cone is N−1 SILENT NO-OPS without an exemption** — no error, no effect, no red test.
That exact failure has shipped **three times**: the tier-3 tower, the direwolf (whose own comment
predicted it), and the boss tower — the one the owner hit himself when his wife's second Pharaoh
waited for the first to die. ⇒ The locust literal and its exemption land in the SAME commit, and the
first assertion written is that the cone produces N clouds, before any behaviour is tested.

## Δ5 — TWO MORE STAGE-B TRAPS, both hand-checked as real

- **R83 retreat.** `targetsStructures: true` puts the cloud on the goblin nav branch, which carries
  *"run home 2-3 s before the end of fight"* at top precedence. **A summoned cloud has no home**, so
  one launched late in a FIGHT would fly backwards for its last third. Needs an explicit exemption.
- **The DESPAWNING fade.** A non-persistent creature is forced into DESPAWNING at
  `despawnAtTick − 60`, so a 900-tick locust only *strikes* for 840. Good-looking (the cloud thins
  out) and worth keeping — but the balance arithmetic must use 840, not 900.

## Δ6 — nothing may be built on `bossRoster`

It is a host-local `Map` in `HostTickState`; a promoted successor rebuilds it empty. Every piece of
the Pharaoh must be a synced field or `world.tick`-derived.

## WHAT THIS DOES NOT CHANGE

Stage A as shipped stands unaltered — no finding touches it. The Ra-channel mechanism (a deadline
field read through `isUntargetable`, stamped in the deferred-death sweep) survived every critique;
the panel converged on it independently.
