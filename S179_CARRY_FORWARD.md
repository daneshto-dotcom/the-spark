# S179 — WHAT TO DO NEXT, in priority order

Everything here was ruled by the owner in S178 and is **NOT BUILT**. His words are quoted so the
next session does not re-ask.

---

## 1 · ⛔ THE LONE-SHAPE RULE — HIS TOP ASK, ATTEMPTED TWICE AND REVERTED TWICE

**HIS RULE, final:** *"a single primitive placed in a player's quadrant has ONE health, no defense,
no attack, no penetration. Just stands there and one hit to destroy by anyone."* · *"For every time
there's a single shape, it's always worth five."* · *"Similarly with a poop bag. Poop bag is just
like one shape, same system."*

**Scope, which he stated twice:** *"You're not to touch the whole system we've built so far"* — the
connector algebra, tower stats and structure pools stay exactly where they are.

**THE DESIGN IS SETTLED. DO NOT REDESIGN IT:**

```ts
// constants.ts — a NEW constant. PRIMITIVE_MAX_HP stays 70 for connected shapes.
export const LONE_PRIMITIVE_POOL_FIFTHS = 5;   // unitPoolFifths(1, 0) — same as a stink bag

// damage.ts, case 'primitive', immediately after the undefined guard:
if (prim.bonds.size === 0) prim.hp = Math.min(prim.hp, LONE_PRIMITIVE_POOL_FIFTHS);
```

A `Math.min` CAP, not an assignment, so an already-chipped shape is not healed by being hit. Gated on
the LIVE connector count, so it also covers the case he named — *"anyone that has his tower destroyed
and has one shape left on the screen without any connectors"*.

### ⛔ WHAT WAS TRIED AND FAILED — so S179 does not repeat it

1. **Retuning `PRIMITIVE_MAX_HP` 70 → 5.** REVERTED. A tower's member shapes share that field and
   `razePrimitives` erases a dead shape's bonds with it. **Measured:** one 12-fifth goblin swing took
   a 3-shape triangle from **3 primitives / 3 bonds to 2 / 1** — two of three connectors gone in a
   single swing — while its `structurePoolFifths(3)` = 24 pool never applied at all. Every building
   in the game becomes one-swing paper.
2. **Marking test fixtures "connected" with a sentinel bond id** (`new Set([asBondId(9178)])`).
   REVERTED, and it made things worse: 13 red → **28 red**, because `isLightningHubComponent` and the
   recipe gates WALK `prim.bonds`, and a bond id with no bond behind it corrupts them.

### ⭐ THE REAL WORK IS THE FIXTURES, AND IT IS THE WHOLE JOB

The two-line rule is trivial. ~13 tests across 7 files place a LONE shape as a damage target and
assert it survives — which the rule correctly makes false. Each needs a **real partner shape and a
real bond**, never a sentinel:

| file | what it asserts about a lone shape |
|---|---|
| `state/lightningDrone.test.ts` | drone blast damages a shape by owner atk |
| `state/creatures/goblin.test.ts` | a goblin closes and REDUCES a shape's hp |
| `state/creatures/standoff.test.ts` (×4) | archer / bat hold distance from a shape target |
| `state/creatures/strikeOrderAndRecall.test.ts` | a goblin by the keep damages its committed shape |
| `state/creatures/suicideGoblin.test.ts` (×3) | three blasts fell a shape; blast radius |
| `state/defenders/stinkCloud.test.ts` | a landed bag damages a shape on its cadence |
| `state/defenders/stinkTower.test.ts` (×2) | radial DAMAGE not radial CLEAR — a shape survives |

Then a new guard file (it was drafted and reverted with the rest — re-create it): a lone shape dies
to one hit; a lone shape PLACED at 70 still dies to one hit; a tower survivor with no connectors dies
to one hit; the bag and the lone shape share one number. **And the counter-guards, which are the
point:** a connected shape still has 70 and survives a swing, one swing does NOT dismantle a
3-connector tower, and `structurePoolFifths` is still 6 / 14 / 24 / 50 / 66.

---

## 2 · THE BOSS REWORK — his numbers, recorded exactly as he said them

> *"Record everything I said... Move all of those adjustments as is. As I said them, hundred percent,
> don't change what I said."*

| Boss | Change |
|---|---|
| **Vlad** | Life-sap **TWICE, not three times**. |
| **Warlord** | Rage triggers at **50% health, not below 25%** — and at rage, **attack speed AND movement speed both double**. |
| **Warlord** | Direwolves keep those stats, **up to 3 at a time**, and he can **only summon them every 30 seconds**. |
| **Archdemon** | "Taken to hell" threshold **below 10%**, not 5%. |
| **Kraken** | Keeps the sonar, and **gains tentacles** — *"tentacles that come out from different areas damaging things and attacking things, up to like six tentacles."* NEW MECHANIC, not yet designed. |
| **Pharaoh** | Locusts **too strong — 50 damage each, not 150.** ⚠ He then said *"still very strong"* and trailed off, so re-check with him after he plays it. |
| **Whopper** | *"Whopper looks sick."* No change. |

**⚠ CORRECTION HE NEEDS AT THE TOP OF S179 — he believes several of these are unbuilt. They are built
and live, all called every host tick (`hostTick.ts:1830-1848`):** the Archdemon's hell AND teleport,
the Kraken's sonar, and the Pharaoh's Ra ritual. So S179 **adjusts numbers**; it does not build them.
The only genuinely NEW item is the Kraken's tentacles.

**⚠ AND ONE THING THE TABLE SURFACED:** attack speed is **identical for all six bosses** (1.0 s,
inherited from `GOBLIN_ATTACK_CADENCE_TICKS`). No boss has its own, and only the Warlord's rage
changes it. He has previously called per-unit attack speed *"the only real solution"*.

Full stats and abilities: **`BOSS_STATS_TABLE.md`**.

---

## 3 · THE VOLTKIN TV — two transition videos, ~€20

The stills are BY DESIGN (his own images) and they ARE the states. What is missing is the **video
between** them:

1. **The TV appearing** — electricity in the background, the TV appears / breaks open, **Voltkin
   climbs out**, then stands idle beside it. ⭐ **He already has a still of the climbing-out pose —
   wire that in rather than generating it.**
2. **Damaged → destroyed** — the explosion.

**No video is needed between intact and damaged** — that is a straight state swap.

## 4 · NO DAMAGE NUMBERS WHEN YOU SCRAP

*"We don't need to see the damage done to the towers when scraping it. Scraping it just erases it,
and you get to keep the shapes."*

Design settled: `pendingCreatureDeaths` is the precedent — a per-tick world field that `save.ts`
never serializes, so it costs nothing on the wire. `razePrimitives` gains a reason; the consumed
paths (SCRAP, tier-9 boss release, lightning-hub self-destruct) record their ids; `damageNumbers`
skips the death-number for them. Only open bit: the set's lifetime. ~20 minutes.

## 5 · CHARACTER SHEETS — deferred explicitly

*"Character sheets, we're not gonna do this session."* Before building, two answers are needed:
**which entity kinds first** (creature / tower / structure / castle), and **may an enemy's sheet show
LIVE health** — if yes it may need new required wire fields and a protocol bump; "stats only, not
live health" is far cheaper.

## 6 · ⛔ FIVE SWEEP LANES NEVER RUN

Killed by the overnight org spend limit and never hand-run: **determinism, four-sites, creature
lifecycle, wire/protocol, host-migration.** They still owe a verdict.

---

# ✅ RULED CLOSED IN S178 — do not re-open

- **Chain-lightning falloff** — halving, APPROVED, and he re-derived the consequence himself
  (24 / 14 / 66; one bolt for a 3-connector tower, two for a 6-connector one). Pinned in his numbers.
- **Hurt / damaged creature state** — NOT wanted. R152 stands. *"It's all good for now."*
- **The Spindle** — visual stays, pull goes. Already shipped, and verified rather than assumed.
- **The map edge** — approved. *"They shouldn't be able to leave the map. That's ridiculous."*
- **The cornered archer** — no new mechanic. *"He still shoots just from melee range."* Nothing to build.
- **The stink tower** — *"It has a good explosion. It does damage. Everything is fine for now."*
- **Protocol bump for stale browser tabs** — **NO.** *"Nobody cares. They'll just figure it out."*
