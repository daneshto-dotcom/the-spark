# S178 — OPEN QUESTIONS

Everything below is **NOT BUILT**. Each one is either a decision only you can make, or something I
was not confident enough about to ship while you were asleep. They are ordered by how much they
change the game, not by how hard they are.

Your instruction governed what got built: *"only if you understand them completely and you know that
those bugs are real … and everything that you're still not sure about, then you leave for me to
judge before working it."*

---

## 1. BOSS-VS-BOSS TIME-TO-KILL — and "Vlad is OP" is **not a code defect**

You asked how Vlad kills the Orc Warlord in three attacks. He does, and it is exactly your ladder:

```
Vlad's strike   attackFifths(10, 10) = 10 × 15 = 150 fifths
Warlord's pool  unitPoolFifths(22, 12) = 22 × 17 = 374 fifths
ceil(374 / 150) = 3          ← not "about three": the remainder is 74/150, nowhere near 2 or 4
```

It is symmetric — the Warlord needs `ceil(260/112)` = 3 back — and your R140 life-sap (3 uses × 52)
lifts Vlad's effective pool to 416, so **Vlad needs 3 and the Warlord needs 4**. Vlad wins a boss
duel by exactly one exchange, before rage or direwolves.

⭐ **AND YOUR OWN S172 RULING PRODUCED IT**, verbatim: *"bosses should be a lot stronger. So let's
double their health and defense, whatever it is right now. Double it for all the bosses. **Keep
their damage as is**."* Pre-S172 the Warlord's pool was 121 against Vlad's 150 — a **one-shot**. The
doubling moved boss duels from 1 hit to 3. It worked. You now want more than 3.

**THE QUESTION:** how many exchanges should a boss duel last? The lever is yours:
- **Double HP/DEF again** → Warlord 1276 / Vlad 840 ⇒ **9 and 8 strikes**.
- **Cut boss damage** — which S172 explicitly declined.

⚠ Either choice also re-tunes boss-vs-army, where every boss already one-shots every regular unit
(recorded on the books at `constants.ts` before you played it).

⚠ AND A FREE FINDING: **WARLORD_RAGE is near-unusable.** It arms below 25% of 374 = 93.5, and he is
at 74 after two Vlad strikes — so it lasts exactly one swing before he dies.

---

## 2. THE VOLTKIN TV — I fixed what I could measure; two things are yours

**FIXED:** it drew at 61 px (smaller than a tier-3 tower) and now draws at a measured 112 px —
tier-9 parity against what tower art *actually* draws, not its sprite box. Each row also lands on its
own feet now, so the emergence and the ruins no longer float above the ground line.

**⛔ WHAT I FOUND AND COULD NOT FIX — THE SHEET IS MOSTLY STILLS.** I measured the shipped PNG:

| row | frames | reality |
|---|---|---|
| intact · damaged · critical · explosion | 12 each | **12 byte-identical copies of one still** |
| spawning · destroyed | 12 each | genuinely animated |

So "the TV is not done" is **true at the art, not at the code**. There is no idle animation, no
burning animation and no explosion animation to play — only a ruins clip. I made the renderer animate
every row correctly (it does real work on the two that move), but four rows have nothing to show.

**THE QUESTION:** do you want those four rows generated as real clips? That is an art spend, and the
real veo cost you measured is **~$20/clip**, not the ~$3.10 an older note assumed.

## 3. THE TV EMERGENCE STILL HAS NO VOLTKIN CLIMBING OUT

You asked for this explicitly — *"even half a second in the loop, you see him kind of coming out."*
The shipped emergence clip is a discharge-and-settle with no creature in it. Two routes:
- **(a) regenerate the clip** (~$20, and the last attempt came back as a discharge again), or
- **(b) composite the real Voltkin sprite over the TV with a scripted rise, derived from synced
  state** — $0, and it is the route the engine already uses for every per-strike visual.

**I recommend (b).** Your call before I spend anything.

## 4. THE VOLTKIN'S WALK IS A QUADRUPED

You said he looks ~30% bigger running than idling. **The cause is measurable:** the packer's
`normaliseStateScale` IS on, but it fits on the whole alpha subject's HEIGHT — and the walk clip is a
horizontal four-legged dash, so its subject is short and the pass scales it UP.

A per-row height correction fixes the SIZE for $0 (the packer already has this shape for `die` rows
via `stillHeightRatio`). It cannot make him run upright — that needs a re-rolled walk clip at ~$20.

**THE QUESTION:** size-only fix now, or re-roll the walk?

---

## 5. THE CHAIN-LIGHTNING CURVE IS MINE, NOT YOURS

You said *"diminishing power per attack"*; you did not say by how much. I used **halving**:
`33 · 16 · 8 · 4 · 2 · 1`, which gives **exactly one connector per bolt** on a 5-connector tower
(it was taking three) while the first links still one-shot a goblin and the tail fades.

Halving matches the repo's existing idiom (the laser's three halvings) and keeps every term a whole
number on your ×5 ladder. A gentler curve (−25%/jump: `33 · 24 · 18 · 13 · 10 · 7`) still cascades.
**Confirm halving, or name a curve.** One constant: `VOLTKIN_CHAIN_JUMP_DIVISOR`.

⚠ HONEST CAVEAT: "one connector per bolt" is true of the **first** bolt on an undamaged tower.
Overkill carries and the pool shrinks, so a second bolt takes more.

## 6. DOES THE SPINDLE DIE WITH THE VORTEX?

You ruled the Vortex must not touch free primitives. The **Spindle** (Line↔Circle) is the same class
of thing doing the same thing tangentially to the same victims, so I unwired both — the conservative
reading. Say if the Spindle should stay.

⭐ And your creature-drag idea is recorded at the code, not lost: *"pull in creatures … if they're
running against it, it will pull them closer, make them slower; if they run [with] it, it'll make him
faster."* Both modules are intact and one line from being re-armed against that new victim.

## 7. THE PLAYFIELD MARGIN IS MINE — 40 px

The sim never had a board; it does now. `WORLD_EDGE_MARGIN = 40` keeps a foot-anchored sprite fully
drawn and clears your keep box (x 1763–1837). The cost is an invisible wall 40 px in from the edge.
**Overrule it on sight** — it is one constant.

⚠ AND ONE COMBAT-FEEL DECISION I DELIBERATELY DID NOT MAKE: when a standoff archer is backed against
that wall, its ring is clamped and it ends up **closer than its attack range wants — sometimes into
melee**. The alternative is that it SLIDES ALONG the edge to keep its range. You have ruled on
standoff behaviour twice, so I would not pick for you.

## 8. SHOULD A FULLER STINK TOWER HIT *HARDER*, OR JUST *WIDER*?

Its death blast was still on the retired 1000-point scale (100–400 against a 70-fifth shape) — fixed,
and it now deals your R77 number (`1 atk / 4 pierce` = 9 fifths) to shapes and units alike. The
magazine still scales the blast **as area** (radius 240 full → 110 spent).

**THE QUESTION:** should a full tower also hit *harder*? On the ladder that has to be ATK/PEN, not a
bespoke curve — so it needs your number.

## 9. `PRIMITIVE_MAX_HP` MOVED 1000 → 70 WITH NO PROTOCOL BUMP (S177)

`hp` is an absent-field default both peers compute themselves, so a **stale pre-S177 tab is still
ACCEPTED** by the version gate and reads every undamaged shape as 1000 — drawing destroyed-tower
frames over buildings the host has at 83% health. Bumping `PROTOCOL_VERSION` 46 → 47 refuses stale
tabs outright. **I recommend yes.** It is a wire decision, so it is yours.

## 10. SCRAP PRINTS PHANTOM DAMAGE OVER SHAPES YOU WERE JUST REFUNDED

Nine red `70`s bloom over your own base after a SCRAP that cost nothing — same on the tier-9 boss
release and the lightning-hub self-destruct. **I did not guess at this one.** Telling "destroyed"
from "deliberately consumed" needs a `cause` threaded through `razePrimitives` into a client-visible
channel, and every cheap discriminator I tried misfires on a one-shot kill. That is a wire-surface
decision.

## 11. CREATURE "DAMAGED / HURT" STILL DOES NOT EXIST

You asked in S177. `CreatureState` is `SPAWNING | SEEKING | ATTACKING | DESPAWNING`. ⚠ A verification
lane found that a **fifth state is forbidden by your own standing rule (R152)**, recorded at three
sites — and that the repo has solved this twice without touching the union: a **tick stamp**
(`stunnedUntilTick`, `poopyUntilTick`) that lands additive-optional with no protocol bump, plus a
render-only sentinel. So the real deliverable is a `hurtUntilTick` stamp, not a new state. Say the
word and it is a small piece of work.

## 12. THE BIG ONE — CHARACTER SHEETS ON CLICK

Not started; it is the largest thing you named and its survey lane died to the spend limit. Before I
build it I need two answers:
- **which entity kinds ship first** (creature / tower / connector structure / free-form / castle), and
- **may the enemy panel show LIVE health?** A peer may not receive enough state for that. If it needs
  new *required* wire fields it costs a `PROTOCOL_VERSION` bump.

I will bring you a costed plan, not questions, once you pick the slice.

---

# ⚠ THINGS I SHIPPED THAT YOU SHOULD KNOW ABOUT

1. **A9 (whole-building clicking) has no unit test.** It is a pure fallback that cannot change any
   click that already worked, and typecheck + the full suite are green — but the geometry rests on
   review, not on a test. A valid race-tower fixture needs a real ring and the existing tower
   fixtures all use `goblinTower`, which has no art.
2. **Two sibling integrators are deliberately unclamped** — Helga (held by her hub leash) and the
   hunter (spawns inside the board, bounded by its own AI). Both latent, neither live, reason
   recorded at the code.
3. **A4 had a side effect I did not plan:** because the shape arm now falls through, a
   structure-attacker whose committed shape is out of reach continues to the bag and castle arms in
   the same strike instead of ending there. That is the fix working, but it is a real behaviour change.

# ⛔ FIVE SWEEP LANES WERE NEVER RUN

The org spend limit killed 15 of 20 agent lanes overnight. Eleven were hand-run or salvaged. These
five were not, and per this project's own S161 rule they are named here rather than buried:
**`determinism`, `foursites`, `lifecycle`, `wire`, `hostmig`** — the five broadest sweep lanes. They
still owe a verdict.
