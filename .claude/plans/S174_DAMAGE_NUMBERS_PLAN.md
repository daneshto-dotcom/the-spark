# S174 — B7 (damage numbers must STACK) + B8 (powers take damage silently)

**RESEARCH AND PLAN ONLY. No production file was touched by the session that wrote this.** The owner
asked for the two big playtest items to be researched and planned rather than implemented, so this
document is the deliverable: the constraint proved from the code, the real options honestly costed,
one recommendation, the questions that are HIS and not ours, and a step-by-step order for the
session that executes.

Source of the two items: `.claude/plans/S173_PLAYTEST_BUGS.md` B7 and B8, captured verbatim from a
live 2-player internet playtest.

---

## 0 · THE TWO ITEMS, IN HIS WORDS

**B7 — the numbers must stack, one per hit.**

> *"we have the damage showing in numbers, right? But it doesn't show every attack ... it should be
> stackable. You know what I mean? Like in MapleStory — if there's six enemies attacking a boss,
> it's only showing one of the damages every time. It doesn't show damage over it. But any new
> damage that's hitting the same target should just layer above. Like, boom boom boom boom. Damage,
> damage, damage. It should be as many damages as the unit receives. That's as much as it shows. It
> could show the actual total damage received by unit."*

**B8 — powers take damage silently.**

> *"powers don't show damage, but they should. You should also do this damage output — the red with
> the white outline font — on powers as well, not just on enemies. Not just on spawn."*

His diagnosis in B7 is **correct and exact**. He is not describing a drawing bug; he is describing
the observable consequence of how the feature derives its values. That is established below from the
code rather than asserted.

---

## 1 · THE CONSTRAINT — GROUND TRUTH, WITH FILE:LINE

### 1.1 What actually samples, and how

`main.ts:3677` — `damageNumbers.sync(world)`, once per **rendered frame**, inside the render block,
after both creature renderers.

`damageNumbers.ts:258-294` — `sync()` walks `world.creatures`, compares the remembered pool to the
current one and emits the difference. The load-bearing line is **`damageNumbers.ts:267`**:

```ts
const delta = prev.ehp - c.ehp;
```

**The only observable is a scalar subtraction between two samples of one number.** There is no
per-hit record anywhere in the state the watcher can see, on either machine. Everything else in this
section follows from that one fact.

Watched state is `{ ehp, x, y, owner }` per creature (`damageNumbers.ts:196-215`), and a
DISAPPEARANCE is treated as the killing blow (`:287-291`), which is why the last hit shows at all.

### 1.2 The two sampling rates, and they are not the same

| | rate | why |
|---|---|---|
| **HOST** | ~1 sim tick per observation, up to **3** | `main.ts:2337` `const dtSec = Math.min(tickerObj.deltaMS / 1000, 0.05)` — a fixed-step accumulator clamped to 0.05 s, i.e. **≤3 ticks per frame** at `PHYSICS_HZ = 60` (`constants.ts:219`). At a healthy 60 fps it is exactly one tick per frame. |
| **PEER** | **6 sim ticks per observation** | A client runs no authoritative sim. `applySnapshotCore` does `world.creatures.clear()` (`save.ts:1359`) and rebuilds from the snapshot, and snapshots leave at `NET_SNAPSHOT_HZ = 10` (`constants.ts:835`) — `SNAPSHOT_INTERVAL_TICKS = round(PHYSICS_HZ / NET_SNAPSHOT_HZ) = 6` (`main.ts:252`). Between snapshots a peer's `ehp` does not move at all: 5 frames in 6 observe a delta of zero. |

This is already documented as an accepted limitation in the shipped file
(`damageNumbers.ts:38-42`): *"several hits inside one 100 ms window merge into a single larger
number."*

### 1.3 ⛔ CAN IT TELL "ONE 30-DAMAGE HIT" FROM "THREE 10-DAMAGE HITS"? **NO.** Three proofs.

1. **The observable is one scalar.** `damageNumbers.ts:267` is a subtraction of two integers. Three
   10s and one 30 produce byte-identical state. Nothing downstream can recover information the
   input never carried.
2. **Same-tick coalescing happens even on the host**, so this is not only a peer problem. A creature
   strikes when `ticksInState === attackFireTick` inside its ATTACKING state
   (`creature.ts:217-226`); the phase of that cadence is set by **when the unit entered ATTACKING**,
   not spread by entity id. Six units that reach a boss on the same tick enter ATTACKING on the same
   tick and therefore fire on the same tick. Those six `damageEntity` calls all land inside one host
   tick ⇒ **one delta**, even at 1-tick resolution. The shipped docblock's claim that *"only a crowd
   focusing a single victim merges"* is right, and a crowd focusing a single victim is precisely the
   scenario he reported.
3. **Heals cancel damage inside a window and can invert the sign.** `sync()` takes the NET delta
   (`:267-269`), so Vlad's life-sap landing in the same 100 ms as two hits shows a smaller number, or
   a green one. The S171 pressure-test already found this
   (`S171_HUD_RESEARCH.md` §2: *"false whenever a heal lands inside a sampling window — `ehp` is not
   monotone"*).

⇒ **"Make them stack" cannot be satisfied by changing the drawing.** The per-hit granularity he
wants does not exist in the data the renderer is reading. It has to be created upstream or invented
downstream, and inventing it is a lie (see option (a)).

### 1.4 Why the obvious upstream fix is banned — and the crack in the ban

`world.effects` is wiped **every rendered frame**: `effectsRenderer.ts:98` `world.effects.length = 0`.
The snapshot is built at most once per 100 ms (`main.ts:2827`, wall-clock gated). So only whatever
happens to be in the array at send time reaches the wire — **~5 of every 6 one-shot pushes are lost
on a peer**. Cited independently at `save.ts:738-739`, `stunStars.ts:28`, `bossAuras.ts:12`,
`severToastRenderer.ts:33`, `severBond.ts:93`.

⭐ **AND HERE IS THE CRACK, WHICH IS THE WHOLE REASON B7 IS SOLVABLE AT ALL: the loss is a property
of LIFETIME, not of the effects array.** A record that lives **≥ 6 ticks** is guaranteed to be
present when the next snapshot is built. Nothing about the transport forbids per-hit data; what
forbids it is that `world.effects` is deliberately a one-frame channel. A second, longer-lived
channel does not inherit that defect. Option (b′) is that channel.

### 1.5 What a new `GameEffect` kind actually costs (for the record, since it is the obvious idea)

**Four exhaustive switches** — `serializeEffect`, `deserializeEffect`, `effectLifetime`,
`effectsRenderer.draw` — named together at `creatureAttack.ts:264` — **and a `PROTOCOL_VERSION`
bump**. `deserializeEffect` has **no default arm** (`protocol.ts:333`, `save.ts:524`), so a peer
handed an unknown kind is a hard failure, which is why the bump is not optional for a new kind.

- **Current `PROTOCOL_VERSION` is 46** — `src/net/protocol.ts:667`.
- ⚠ **STALE DOC FOUND:** the project `CLAUDE.md` says *"`PROTOCOL_VERSION` … (44 at S167)"*. It is
  46. Fix the doc in the same session (a one-line change, not scope creep).

### 1.6 The four sites, priced against this codebase's actual forcing functions

For any **new `World` field**: factory + serialize + hash + worker.

| site | file | tsc-forced? |
|---|---|---|
| factory | `makeWorld` (`state/world.ts`) | **YES** — a required field on `World` fails `tsc` until it is constructed |
| hash policy | `FIELD_COVERAGE` (`state/stateHashFull.ts`) | **YES** — *"keyed on `keyof World`, so EVERY field of ANY shape must be classified or `tsc` fails by name"* (`stateHashFull.ts:44-54`) |
| serialize / apply | `NetSnapshot` + `applySnapshotCore` (`state/save.ts`) | **NO** — `NetSnapshot` is a separate type; omitting the field compiles and ships a silently broken feature on the peer |
| worker mirror | `state/workerSim.ts` | **NO**, and this is the one that has been missed twice. The batch payload is assembled by hand (`workerSim.ts:118-122` carries `effects?: GameEffect[]` for exactly this reason; `:521` makes a non-empty `effects` array force a STRUCTURAL batch; `:529-549` slices and attaches it; `:540` wipes). A new short-lived field must be mirrored at all three of those spots, and **nothing will fail if it is not** — `?worker=1` would simply show no numbers. |

---

## 2 · THE OPTIONS, HONESTLY COSTED

| | option | wire cost | proto bump | four-sites exposure | determinism risk | delivers "boom boom boom"? |
|---|---|---|---|---|---|---|
| **a** | split one observed delta into N invented sub-numbers | none | no | none | none | **fake** — looks right, teaches a false number |
| **a′** | keep one number per observation, improve the STACK rule | none | no | none | none | partially — only when observations are genuinely separate |
| **b** | new per-hit `GameEffect` kind | 1 new kind | **YES** (46→47) | 4 exhaustive switches | none | **NO** — still ~5/6 lost; the lifetime is the problem |
| **b′** | ⭐ per-hit ring buffer in `World`, sampled into the snapshot | `hits?: []`, ≤~1.2 KB worst case | **no** (additive-optional) | all four; **two not tsc-forced** | low, `'acknowledged'` | **YES, exactly** |
| **c** | per-victim accumulated total | **zero — already derivable** | no | none | none | no — answers his fallback sentence only |
| **d** | host-side per-hit log sampled into the snapshot | = (b′) | = (b′) | = (b′) | = (b′) | only if it has a TTL and a seq — see below |

### (a) — render one observed delta as a stack of layered numbers

**Wire** 0 · **bump** no · **sites** 0 · **determinism** none · **cost** ~30 lines.

It would have to *guess* the split — divide the delta by the most common `attackFifths`, or by the
count of adjacent enemies. **It is a lie, and the feature's own specification is what convicts it.**
The numbers exist as a TEACHING CHANNEL — the owner, S172, quoted at `damageNumbers.ts:1-11`:

> *"you can see exactly how much damage was received. And that way you can estimate how much attack
> certain creatures have. That way people can learn how to play it."*

A player who reads three invented 10s learns that those units hit for 10. If the real composition
was 18+6+6, the game has taught them something false, in the one channel built to teach them
something true. **Do not ship this.** It is also self-defeating on the peer: a 6-tick window can
contain hits from units of different types, so no single divisor is ever right.

### (a′) — keep one number per observation, but make the stacking rule what he described

**Wire** 0 · **bump** no · **sites** 0 · **determinism** none · **cost** ~20 lines.

Half-built already: `emit()` (`damageNumbers.ts:308-319`) counts coincident live floaters within
12 px / `ROW_STACK_PX = 14` and offsets the new one upward, and `flip` alternates the sideways drift
(`:218`, `:318`). What is missing from the MapleStory look is that the column does not read as a
column: `LIFE_FRAMES = 45` (750 ms) with a fixed 14 px row means two numbers 100 ms apart are 14 px
and 23 px of rise apart — they cross. **This is a real, cheap improvement and it is worth shipping
alongside (b′)**, because (b′) will produce genuinely separate numbers and they need somewhere
legible to go. On its own it changes nothing about the six-attacker case.

### (b) — per-hit events on the wire as a new `GameEffect` kind

**Wire** one new serialized kind · **bump** YES, 46→47 · **sites** the four exhaustive switches of
§1.5 · **determinism** none (presentational) · **cost** medium.

**REJECT.** It pays the entire bill and does not buy the thing: an effect's lifetime is one frame
(`effectsRenderer.ts:98`), so ~5/6 of the pushes never reach a peer — the exact finding that made
S172 choose deltas in the first place. Adding the kind without also extending its lifetime is paying
for a protocol bump to keep the bug.

### (b′) ⭐ — per-hit ring buffer carried in the snapshot (the recommended design)

This is the parent question *"can it be solved with a small ring buffer carried in the snapshot
instead of `world.effects`?"* — and the answer from the code is **yes**, because §1.4's loss is a
lifetime property.

**Shape.** A bounded array on `World`, written at the damage site, pruned by tick age:

```
world.recentHits: HitRecord[]          // capped, pruned each host tick
world.hitSeq: number                   // monotonic, host-authored
HitRecord = { seq, kind, id, amount, tick, x, y }
```

**The two properties that make it work — and without either it degenerates into (b):**

1. **TTL ≥ 2 × `SNAPSHOT_INTERVAL_TICKS` (≥ 12 ticks).** One interval guarantees every record is
   seen by at least one snapshot; two gives redundancy against a dropped or late one. (Reliability
   of the data channel is **not** explicitly configured anywhere in `src/net/` — I grepped; Trystero's
   default channel is reliable/ordered, so this is insurance, not a load-bearing assumption. Verify
   it in A.0 rather than trusting this sentence.)
2. **A monotonic `seq` per record**, so the peer can dedupe. The renderer keeps `lastSeqRendered` and
   draws only records above it. This is what makes the redundancy free instead of producing doubled
   numbers.

**Wire cost.** An additive-optional `hits?: SerializedHit[]` on `NetSnapshot`, modelled *exactly* on
the existing `effects?: SerializedEffect[]` — declared `save.ts:304`, emitted `save.ts:1112-1116`,
applied `save.ts:1559-1563`. ~20–25 B of JSON per record. At a hard cap of 48 records that is
≤~1.2 KB per snapshot worst case (~12 KB/s at 10 Hz) and near zero in ordinary play; the snapshot is
already >1 KB. ⚠ **Measure it against a real snapshot before shipping** rather than trusting this
estimate — `constants.ts:1292` shows this project prices wire additions in bytes/snapshot and has
been wrong about one before.

**Protocol bump: NO.** Project rule, quoted: *"An **additive-optional** field, or a field **stripped
from the wire**, costs no bump."* An older peer ignores `hits` and simply draws no numbers, which is
degraded picture, not divergence — and mismatched builds are refused at HELLO anyway
(`detectProtocolMismatch`). **This is our decision, not the owner's**; if the executing session
wants the belt-and-braces bump it is one line and harmless, but the rule does not require it.

**Four-sites exposure — the real risk of this option.** Two of the four are not tsc-forced (§1.6):
`save.ts` serialize/apply, and `workerSim.ts`. The worker miss is silent and this codebase has eaten
it twice. Mitigation is not care, it is a **test**: assert that a `World` with a non-empty
`recentHits` survives a `serializeWorld` → `applySnapshotCore` round-trip, and that `workerSim`'s
batch predicate treats a non-empty `recentHits` as structural (mirroring `workerSim.ts:521`).

**Hash policy.** Classify `'acknowledged'` in `FIELD_COVERAGE`, with an honest justification: it is
presentational telemetry that **no sim branch reads**, in the family of `pendingCinematics` /
`comboToastTick` — **not** in the family of `effects`, whose justification is *"lifetime shorter
than a tick"*, which will not be true here (TTL 12 ticks). Writing the wrong justification is how a
future session mis-reasons about it.

**Determinism risk: LOW.** The buffer is written only by the host's reducers, read only by a
renderer, and hashed by nothing. It cannot desync the sim. The residual risks are (i) the worker
four-sites miss above, and (ii) unbounded growth — which the cap and the TTL close, and which should
have a test.

**Emission site — and this is the part that makes (b′) also solve B8 for free.** Record at the
**dispatcher**, not at the call sites:

- `damageEntity` (`damage.ts:104`) — covers all five arms: creature, primitive, castle, defender,
  stinkCloud.
- `damageConnector` (`damage.ts:279`) — covers bonds, i.e. tower/structure durability.

Every production damage path goes through one of those two. Enumerated by hand (the cheapest lane
the project CLAUDE.md names, and it paid again here):

```
bossSkills.ts:203 · castleGuns.ts:120 · creatureAttack.ts:183,295,322,366,406,431
suicideBlast.ts:150 · voltkinChain.ts:194,196 · damage.ts:495,510,513
defenderLifecycle.ts:439 · world.ts:693,718,758
```

⚠ **RECORD THE CLAMPED AMOUNT, NOT THE REQUESTED ONE.** The dispatcher knows what was *asked for*;
the shipped semantics (`damageNumbers.ts:281-285`, owner-blessed) is *"the honest count of damage
actually dealt TO THAT CREATURE … the numbers over a creature's whole life sum to precisely its
pool."* So a 7-point goblin hit for 30 must still record **7**. This has to be written into the
recorder, not discovered later.

**What it looks like:** exactly what he asked for. Six attackers on a boss produce six records with
six sequence numbers, and six numbers layer up the boss, newest on top. Host and peer see the same
six (the peer sees them arrive in one batch, so they appear together rather than 16 ms apart — an
acceptable and honest difference, and (a′)'s stacking is what keeps it readable).

**What it costs to ALSO keep the delta watcher:** nothing, and the executing session should think
carefully before deleting it. The delta watcher covers damage-over-time and anything that edits
`ehp` without going through `damageEntity`. **Running both would double-count.** Recommended
posture: `recentHits` becomes the primary channel, and the delta watcher is **narrowed to the
killing blow / disappearance case** (which the ring buffer also covers, since the fatal
`damageEntity` call is recorded before removal — so verify before keeping it, and if the ring buffer
covers it, delete the watcher rather than leave two sources). **This is an explicit decision the
executing session must make and record, not leave ambiguous.**

### (c) — a per-victim accumulated total, his own fallback

> *"It could show the actual total damage received by unit."*

**Wire 0 · bump no · sites 0 · determinism 0 — because it already exists.** Total damage received by
a creature **is** `unitPoolFifths(config.hp, config.def) − c.ehp`, and both halves are already
computed for the health bar (`healthBar.ts`, `stats.ts:145`). Nothing needs to be added to the wire
or to the state to display a running total today.

But it answers the *smaller* of his two sentences. He described a MapleStory column of per-hit
numbers and then offered the total as a fallback. Shipping the fallback as the answer would be
answering the question he asked second. **Good as a cheap additive extra** (e.g. a small cumulative
figure by the bar on a boss), **bad as the primary**.

### (d) — host-side per-hit log sampled into the snapshot

This **is** (b′), and naming it separately is worth doing only to state the trap: a "log" without a
TTL ≥ one snapshot interval and without a dedupe key is (b) with extra steps — it loses ~5/6 on a
peer, or double-draws. The two properties in (b′) are what turn a log into a working design.

---

## 3 · RECOMMENDATION

### Ship **(b′)**, with **(a′)** as its presentation layer, and hold **(c)** as an optional extra.

**Why (b′):**

1. **It is the only option that delivers what he described.** (a) fakes it, (a′) cannot un-merge,
   (b) does not survive the wire, (c) answers the fallback.
2. **It costs no protocol bump** by the project's own rule, which removes the single most expensive
   line item people assume this feature carries.
3. **It solves B7 and B8 in one change.** Recording at `damageEntity` + `damageConnector` covers all
   five arms plus bonds. The alternative — extending the *delta watcher* to structures — is
   **actively worse**, and §4 shows why with arithmetic.
4. **It removes the heal-cancellation and same-tick-coalescing defects as a side effect**, because a
   record is per-call, not per-window.
5. Its risk concentrates in a place the project already knows how to defend: the two non-tsc-forced
   sites, closed by two named tests.

**What I am NOT recommending, and why:**

- **(a)** — it invents data in the one channel whose stated purpose is to teach the player true
  numbers. His own S172 quote is the argument against it.
- **(b)** — a new `GameEffect` kind buys a protocol bump and four exhaustive switches and still loses
  ~5/6 of the hits, because an effect's lifetime is one frame. It pays the bill for the wrong fix.
- **(c) as the primary** — free and true, but it is a running total, not *"boom boom boom"*. Offer
  it; do not substitute it.
- **Deleting the delta watcher blindly** — it currently covers DoT and the killing blow. Prove the
  ring buffer covers both before removing it, and if both channels stay live, **damage will
  double-count**, which is a worse bug than the one being fixed.

---

## 4 · B8 SPECIFICALLY

### 4.1 What "powers" means in his vocabulary — worked out, not guessed

**Verdict: "powers" = the recipe-built towers / godly structures — the buildings that have an
ability.** Evidence, in order of strength:

1. **He has used the word this way before.** `.claude/plans-archive/2026-08-22_PDR_S151_BATCH_COMPLETED.md:206`,
   quoted verbatim in the connector-defence ruling:
   > *"the reason players wont want to do only that though that super complex towers dont have
   > powers … youd have to chose the tactic."*
   A structure that is not a recipe match has **no power**. So a "power" is what a built tower HAS,
   and by metonymy the towers themselves.
2. **The game's own UI calls them that, in copy he approved.** Every godly recipe carries a `power`
   epigraph (`codexPresentation.ts:32,48,62,69,78,89,113,120,127`), the Codex tile renders it as the
   POWER line (`codexOverlay.ts:773-782`), and the build card uses it as the tagline
   (`castlePanel.ts:484` `tagline: copy.power`). When he looks at a tower in the UI, the word next to
   it is *power*.
3. **His own sentence contrasts it with the two families that already show numbers**: *"on powers as
   well, not just on **enemies**. Not just on **spawn**."* Enemies = creatures; spawn = spawned
   units. The remaining damageable family is the buildings.

**Where it is genuinely ambiguous and needs him** — see Q2 in §5: does "powers" reach (i) the raw
SHAPES a structure is made of, (ii) the CASTLE, (iii) HELGA (a defender, not a tower)?

### 4.2 What the numbers cover today — and the S171 note undercounts it

⛔ **Correction to the record.** `S171_HUD_RESEARCH.md` §2 says the design *"covers 3 of
`damageEntity`'s 5 arms — bonds and primitives are skipped."* **What actually shipped covers ONE
family:** `sync()` walks `world.creatures` and nothing else (`damageNumbers.ts:261`). Castle,
defenders (Helga), primitives and stink bags are all silent, and so are bonds. B8 is therefore wider
than the S171 note implies, not narrower.

### 4.3 The five arms, plus bonds — what each would need

| target | where the pool lives | on the wire? | delta-watchable today? |
|---|---|---|---|
| **creature** | `Creature.ehp` | yes — emitted when damaged (`save.ts:1948-1957`), rehydrated from config when omitted (`save.ts:2322-2324`) | ✔ shipped |
| **defender** (Helga) | `Defender.ehp`, `null` for every tower | yes (`save.ts:2057`, applied `:2097`) | ✔ cheap |
| **primitive** (a shape) | `Primitive.hp`, seeded `PRIMITIVE_MAX_HP = 1000` | yes — emitted when `< MAX` (`save.ts:1804`), rehydrated (`save.ts:1629`) | ✔ cheap |
| **castle** | `Player.castleHp`, max `CASTLE_MAX_HP = 1500` | yes — emitted only below max, rehydrated as max (`damage.ts:117-122`) | ✔ but it is per-SEAT, not per-entity: one anchor point, no attacker line |
| **stinkCloud** (a landed bag) | `StinkCloud.ehp` | yes (`save.ts:992`, unconditional) | ✔ cheap |
| **bond / connector** | `Bond.damageFifths` — **accumulated damage, not a pool** | yes — emitted when non-zero (`save.ts:1832`), rehydrated (`save.ts:1661`), and already hashed | ⚠ **see 4.4 — a trap** |

### 4.4 ⛔ THE BOND SIGN INVERSION IS REAL — AND IT IS THE SMALLER HALF OF THE TRAP

**The claim checks out.** `damage.ts:290`:

```ts
bond.damageFifths += amountFifths;
```

Damage **RISES**. There is no stored "current"; the structure bar derives it
(`healthBar.ts:251` `drawStructureBars`) as `structureDefenceFifths(n) − Σ damageFifths`, where
`structureDefenceFifths(n) = n × (n + 4)` (`stats.ts:236-237`, `:224`).

⛔ **But a delta watcher on that derived value would print PHANTOM NUMBERS, because the MAX moves.**
Capacity is a function of the component's **current** connector count, so severing one bond shrinks
the whole structure's pool with nobody having dealt damage. Worked:

```
n = 5 connectors → max = 5 × 9  = 45
one bond severs
n = 4 connectors → max = 4 × 8  = 32
```

A derived-current watcher sees a **13-fifth drop with no damage event** — plus a second, opposite
artefact as the severed bond's banked `damageFifths` leaves the sum. Both are invisible to a test
that only checks "damage makes the bar go down". The owner's own R76 ruling makes this shrinkage
*intended behaviour* for the bar (*"it also scales down in defense"*, `healthBar.ts`), so it cannot
be "fixed" — it simply must not be read as damage.

⇒ **This is, on its own, a sufficient reason to prefer (b′).** Recording at `damageConnector` reports
the 5 fifths that were actually dealt and never sees the phantom 13.

### 4.5 ⛔ THE SCALE PROBLEM — THE REAL B8 DESIGN QUESTION, AND IT IS HIS CALL

There are **four damage scales** in this game and they are not interchangeable:

| family | unit | one goblin strike |
|---|---|---|
| units (creatures, Helga, stink bags) | fifths, pool 7–143 | **5** (`attackFifths(1,0)`) |
| shapes (primitives) | `PRIMITIVE_MAX_HP = 1000` per shape (`constants.ts:2784`) | **167** (`constants.ts:2806`, *"6 × 167 = 1002 ≥ 1000"* — his *"6 attacks"*) |
| connectors (structures) | fifths, capacity `n + 4` **per bond** | **5** |
| castle | `CASTLE_MAX_HP = 1500` (`constants.ts:1796`) | **6** (`constants.ts:1955`) |

Printing raw values puts a **167** over a shape and a **5** over the goblin that hit it, in the same
frame, in the same font. That directly attacks the feature's stated purpose — *"you can estimate how
much attack certain creatures have"* — because the same goblin would appear to have three different
attack values depending on what it is punching. The scales themselves are load-bearing and ruled
(the `damageEntity` docblock spends a page on why they must not be conflated, `damage.ts:431-443`),
so **the display cannot be fixed by changing the sim.** It must be a presentation ruling, and it is
his. See Q1.

---

## 5 · WHAT NEEDS AN OWNER RULING (and what does not)

**HIS — do not decide these for him:**

- **Q1 — the scale.** A goblin punching a shape deals 167 of 1000; punching a goblin it deals 5. What
  should the number over a shape/tower/castle say? (i) the raw stored number — honest, but "167"
  next to "5" reads as incoherent; (ii) a **percentage of the thing's own pool** — comparable across
  families, but no longer his "no conversion" rule; (iii) **normalise buildings onto the fifths
  ladder** so all numbers live in one unit — coherent, but the printed number is then not the stored
  one, which is exactly the property he chose in S172 (*"there's no conversion"*,
  `damageNumbers.ts:15-23`). **Bring him the three, with the worked "167 vs 5" example.**
- **Q2 — what "powers" covers.** Towers only, or also: the bare SHAPES a structure is built from; the
  CASTLE; HELGA? (My reading: towers certainly; shapes probably, since that is where the damage
  actually lands; the castle already has a bar he asked for so a number is natural; Helga is a unit
  and should arguably follow the creature rules.) **Ask; do not assume.**
- **Q3 — does a SEVER show a number?** When a connector finally breaks, the structure loses ~13
  fifths of pool with nobody dealing damage (§4.4). Silence is honest about damage; a number is
  honest about the collapse he is watching. His call.
- **Q4 — "Not just on spawn."** My reading is *spawn = spawned units*, i.e. "not only on the units
  the castle emits". Confirm, because the other reading — "not just at spawn-time" — would be about
  timing and would change nothing.
- **Q5 — how many numbers at once before it is noise?** `MAX_LIVE = 64` today
  (`damageNumbers.ts:109`). Does he want a per-victim cap (a boss with 12 attackers is a 12-high
  column), or is *"as many damages as the unit receives"* literal?
- **Q6 — damage over time.** The stink aura and the zombie rot tick continuously. One number per tick
  is a spam column. Per-second accumulation is readable but is a conversion. His call, and it
  interacts with Q1.

**OURS — decide and record, do not spend his time:**

- Whether to bump `PROTOCOL_VERSION` (rule says no for an additive-optional field; §2 (b′)).
- The ring buffer's TTL, cap, and dedupe key.
- Whether the delta watcher survives, is narrowed, or is deleted — and the double-count risk.
- Fixing the stale `PROTOCOL_VERSION` line in the project `CLAUDE.md` (44 → 46).

---

## 6 · IMPLEMENTATION ORDER FOR NEXT SESSION

**Tier: Full** (>30K — two features, a wire field, four sites, two renderers, and an owner ruling in
the middle). Standard-tier treatment would under-serve the four-sites exposure.

### Step 0 — PDR + A.0 STATE-DISCOVERY probes (before any code)

Probe, do not assume:

1. `grep -n "PROTOCOL_VERSION = " src/net/protocol.ts` — confirm it is still 46.
2. `npx vitest run` and `npm run typecheck` — capture `$?` into a variable and echo it. **Never read
   a trailing `[exited with code 0]` from the wrapper** (project CLAUDE.md, burned in S159 and S165).
3. Confirm `damageNumbers.sync` is still called once per frame at `main.ts:3677` (line will drift).
4. Measure a real `NetSnapshot` byte size in a busy match, so the `hits` budget is measured, not
   estimated (§2 (b′)).
5. Confirm the Trystero data-channel reliability posture — `src/net/` configures none explicitly.
6. **Get Q1–Q6 answered.** Q1 and Q2 BLOCK the B8 half; B7 can proceed without them.

### Step 1 — the recorder (host-side, one place)

- `src/state/worldTypes.ts` — add `recentHits: HitRecord[]` and `hitSeq: number`; define
  `HitRecord`.
- `src/state/world.ts` — `makeWorld` initialises both. *(tsc-forced.)*
- `src/state/damage.ts` — record inside `damageEntity` (all five arms) and `damageConnector`.
  ⚠ Record the **clamped** amount, per §2 (b′). ⚠ `damageEntity`'s castle arm returns early above the
  `switch` (`damage.ts:132-141`) — the recorder must sit where **every** arm reaches it, or the
  castle is silently uncovered. This is the same shape as the S164 P3 hole documented in that
  docblock.
- Prune by TTL on the host tick (`state/hostTick.ts`), and cap the array.
- ⚠ No `Math.random`, no wall clock, no float: `seq` is an integer counter, `tick` is `world.tick`.

### Step 2 — the hash policy *(tsc-forced, will fail the build until done)*

- `src/state/stateHashFull.ts` — classify both new fields in `FIELD_COVERAGE` as `'acknowledged'`,
  with the `pendingCinematics`-style justification, **not** the `effects` "shorter than a tick" one
  (§2 (b′)).

### Step 3 — the wire *(NOT tsc-forced — the silent half)*

- `src/state/save.ts` — `hits?: SerializedHit[]` on `NetSnapshot` (model on `effects?`,
  `save.ts:304`); emit in `buildSnapshot` (beside `save.ts:1112-1116`); apply in `applySnapshotCore`
  (beside `save.ts:1559-1563`). **Replace, do not append** — a peer must not accumulate.
- **No `PROTOCOL_VERSION` bump** (§2 (b′)) — and write the reason at the field, with the rule quoted.

### Step 4 — the worker *(NOT tsc-forced — the half that has been missed twice)*

- `src/state/workerSim.ts` — mirror `recentHits` exactly as `effects` is handled: the batch payload
  type (`:118-122`), the structural-batch predicate (`:521`), the slice+attach (`:529-549`), the wipe
  (`:540`). Then **run `?worker=1` and confirm numbers still appear** — a static read will not catch
  this (project CLAUDE.md: *"Static parse ≠ runtime validation"*).

### Step 5 — the renderer

- `src/render/damageNumbers.ts` — consume `world.recentHits`, dedupe on `seq` via `lastSeqRendered`,
  emit one floater per record. Reuse `damageAnchor` unchanged for creatures.
- **Decide and record** the fate of the `ehp` delta watcher (§2 (b′)): narrowed, or deleted. Two live
  channels = double numbers.
- (a′) stacking polish: make a column of 4+ readable — row height vs `RISE_PX_TOTAL = 23` over
  `LIFE_FRAMES = 45` currently lets rows cross.
- **B8 anchors**: a structure/shape record has no "attacker line" the way a creature does. Simplest
  honest placement is above the victim (the existing `TOWARD_ATTACKER` fallback at
  `damageNumbers.ts:158-159` already does exactly this when no enemy is on the board). For towers,
  `towerArtForRecipe(recipeId).sizePx` is the measured height — ⛔ **do NOT use
  `FALLBACK_SPRITE_H = 26`**; that exact constant put the bar *inside* the building in S173 and
  inside Helga in S172, both documented at length in `healthBar.ts:261-291`. **Third time is not a
  charm.**
- ⚠ If a NEW renderer file iterates `world.creatures` **and** compares `ownerPlayerId`, it joins the
  acquisition census and `src/state/untargetableCallSites.test.ts` will fail until it is given a
  verdict in `NOT_ACQUISITION` (`:81-89` is the existing `damageNumbers.ts` entry to model on).

### Step 6 — tests (the two that close the non-forced sites)

1. **Round-trip**: a `World` with non-empty `recentHits` → `serializeWorld`/snapshot →
   `applySnapshotCore` → records present, identical, and **not** duplicated on a second apply.
2. **Worker parity**: a batch carrying `recentHits` is STRUCTURAL and arrives on the mirror.
3. TTL/cap: the buffer never grows unbounded; a record survives ≥ 1 snapshot interval.
4. Dedupe: the same record delivered in two consecutive snapshots draws **one** number.
5. Sign/clamp: an overkill hit records the clamped amount (preserves *"they sum to the pool"*).
6. Bond arm: a `damageConnector` call records 5, and a **SEVER records nothing extra** (the §4.4
   phantom) — unless Q3 says otherwise.

### Step 7 — gates, read from a captured `$?`

```
npm run typecheck        ; echo "TSC_EXIT=$?"
npx vitest run           ; echo "UNIT_EXIT=$?"
npm run e2e:gating       ; echo "GATING_EXIT=$?"
npm run e2e:races        ; echo "RACES_EXIT=$?"
npm run build            ; echo "BUILD_EXIT=$?"
```

⛔ Never pipe a gate into `tail`/`head` and read that status. ⛔ A trailing `[exited with code 0]`
from the wrapper is **not** the gate's exit code. Bundle charter is 900 KiB with 784.8 KiB used at
S165 — this change is small, but if it ever binds, **raise the charter, never contort the code, and
never let it block a live deploy**.

### Step 8 — ship

Commit to `master`, push (pushing IS shipping), then `npm run verify-deploy` and require **4/4 with
content-hash equality**. `gh api .../pages` is stale and must not be used.

---

## 7 · ORDER-OF-WORK NOTE

**B7 and B8 are one change, not two.** The recorder at `damageEntity` + `damageConnector` produces
per-hit records for every family in the same commit. Splitting them would mean building the
delta-watcher extension for structures first — which §4.4 shows is the *wrong* mechanism, phantom
numbers and all — and then throwing it away. Do them together.

The only part that can be started before the owner answers anything is **B7's transport** (Steps
1–5 for creatures). **Q1 (the scale) and Q2 (what "powers" covers) block the B8 display**, and
nothing else does.
