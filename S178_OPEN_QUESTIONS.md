# S178 — RULINGS GIVEN, AND WHAT IS STILL OPEN

---

# ✅ RULED AND CLOSED THIS SESSION

**CHAIN-LIGHTNING FALLOFF — halving APPROVED, and he confirmed it by re-deriving the consequence
himself.** His `n × (1 + 0.2n) × 5` is exactly `structurePoolFifths(n)`, and the shipped bolt
reproduces both of his numbers: **1 bolt** takes the first connector of a 3-connector stink tower
(pool 24), **2 bolts** for a 6-connector tower (pool 66). Pinned as a test in his own words — the
strongest kind, because he stated the outcome independently of the implementation.

**THE HURT STATE — NOT WANTED.** *"If I already ruled we must not add a fifth state, then it's fine.
We don't need to add hurt. It's all good for now."* Noted for the future: doing it properly would
mean more video generation (hurt-running, hurt-attacking, healthy-running…), so it is an art cost as
much as a code one. **Closed.**

**THE SPINDLE — visual stays, pull goes.** Already exactly what shipped, now verified rather than
assumed: the spinning spiral is drawn by `bondVisualRenderer → drawSpindle` from the combo table's
`visualEffectId`, and **no renderer references the pull functions at all.** The spiral still spins.
**Closed.**

---

# ✅ RULED, NOT YET BUILT — carried to next session

## C1 · A LONE SHAPE HAS 1 HP, NOT 70 — and this one is bigger than it looks

**His ruling:** *"a primitive by itself has no HP, just one. It's a one shot kill. Just like a poop
bag should be. Definitely not a thousand… and definitely not seventy."*

**And his argument is unanswerable:** a 2-shape building has ONE connector, so its whole durability
is `1 × (5+1)` = **6 fifths** — while a single unconnected shape sitting on the field has **70**.
*"So one primitive would have seventy HP while its counterpart building would have six? How does that
make sense? No. That is completely wrong."* He is right; it is backwards today.

**⛔ WHY I DID NOT JUST CHANGE THE NUMBER — I checked the code and found the consequence.**
`damage.ts` does `prim.hp -= amount` for **any** shape, connected or not, and when a shape dies it
erases its own connectors with it. So shape-HP is a **second, parallel way to kill a tower** that
completely bypasses the connector pool:

| | today (shape = 70) | if I just set shape = 5 |
|---|---|---|
| goblin swing (12) kills a shape in | **6 swings** | **1 swing** |
| same goblin severs a 3-connector tower's first connector in | 2 swings | 2 swings |

So today the connector path is the faster one and shape-HP barely matters. **Drop it to 5 and one
goblin swing deletes a shape out of any tower, taking its connectors with it — towers become paper
and the whole structure-durability system stops mattering.**

**⭐ HIS OWN SENTENCE CONTAINS THE FIX:** *"The defence times HP times five only happens once it's
starting to connect."* — i.e. **once a shape is connected, its durability IS the structure pool.**

✅ **RULED — S178, in his words:** *"Two shapes connected has six fifths of durability. One shape not
connected has one durability, no durability. **New rule. Shape standing by itself with no connectors
has no durability. So just one, literally one hit from anything.**"*

**THE RULE, stated once so it cannot be misread:** **durability comes from CONNECTORS.**
· a shape with **no** connectors → **1 hit from anything** kills it (same as a poop bag);
· a shape **with** connectors → it is defended by its STRUCTURE's pool, `n × (5 + n)`, and its own
  HP must no longer be a second, faster way to kill it.

**BUILD NOTE for next session:** the second half is the real work. `damage.ts` currently does
`prim.hp -= amount` for any shape and erases its connectors when it dies, so the shape arm has to be
re-pointed at `damageConnector` for a CONNECTED shape. Without that half, dropping the constant makes
every tower one-swing paper.

## C2 · NO DAMAGE NUMBERS WHEN YOU SCRAP YOUR OWN BUILDING

**His ruling:** *"We don't need to see the damage done to the towers when scraping it. Scraping it
just erases it, and you get to keep the shapes."*

Design is settled: the game needs to tell "destroyed by an enemy" from "dismantled on purpose".
There is already a precedent for exactly this — `pendingCreatureDeaths` is a per-tick world field
that `save.ts` never serializes, so it costs nothing on the network. Same shape:
`razePrimitives` gains a reason, the consumed paths (SCRAP, tier-9 boss release, lightning-hub
self-destruct) record their ids, and `damageNumbers` skips the death-number for them.
**Not built — the only open bit is the set's lifetime (who clears it, and when), which I would not
guess at tonight. ~20 minutes next session.**

## C3 · THE VOLTKIN TV — two transition videos, ~€20

His correction, and he was right: **the stills are BY DESIGN** — they are the states, from his own
images. Nothing is broken about them. What is missing is the **video between states**:

1. **The TV appearing** — electricity in the background, the TV appears / breaks open, **Voltkin
   climbs out**, then stands idle beside it. *(He already has a still of the climbing-out pose — we
   wire that in rather than generating it.)*
2. **Damaged → destroyed** — the explosion.

**No video is needed between intact and damaged** — that is a straight state swap.

## C4 · CHARACTER SHEETS — next session, explicitly

When we do it I need: **which things get a sheet first** (creatures / towers / structures / castles),
and **may an enemy's sheet show LIVE health** — if yes it may need new network data and a version
bump; if "stats only, not live health", it is far cheaper.

---

# ⛔ STILL NEEDS HIS ANSWER

### Q-A · VLAD vs THE WARLORD — the abilities, not the stats
Measured: 6.1 s, **Vlad wins 12/12**. He takes 66% damage and **heals 20% back**, ending at 46% —
which is exactly the bar you read as "the Warlord only did 25%".

- Vlad's life-sap = **+60% free effective health** (3 × 20% of max, pure self-heal, no victim).
- The Warlord's rage triggers below **25%** — but Vlad's 150-damage strike drops him 224 → 74 in one
  blow, so **he leaps straight over his own rage window into death.** The ability effectively never fires.

**Pick:** (a) rage triggers at 50% so it can actually fire · (b) cut Vlad's healing · (c) give the
Warlord his own survival ability · (d) leave it, Vlad is meant to be the scary one.
*(Only 2 of the 6 bosses have an ability that changes a fight at all — worth auditing all six.)*

### Q-B · OLD BROWSER TABS — bump the version number?
A shape's health is only sent over the network when damaged; otherwise each player's copy fills it in
itself. An old tab from before S177 still thinks a healthy shape is 1000 and would draw your healthy
towers as **ruins**. The version gate should refuse such tabs but wasn't bumped, so they get in.
**Bump it?** Cost: anyone with a stale tab refreshes. **I recommend yes.**

### Q-C · THE CORNERED ARCHER *(the wall itself is RULED — see below)*
✅ **THE WALL IS APPROVED.** *"Do you mean around the edges of the map? Yeah. I mean, sure. They
shouldn't be able to leave the map. That's ridiculous. So definitely."* The 40 px edge stays as shipped.

✅ **AND THE ARCHER IS RULED TOO — no new mechanic.** *"Cornered archer is not dragged into melee.
He still shoots just from melee range, obviously. You don't need to make new mechanics. It's stupid."*
**Nothing to build:** a ranged unit already fires from wherever it stands, so an archer pressed
against the wall simply keeps shooting from closer. The shipped behaviour is already what he wants.
**Closed.**

### Q-D · THE STINK TOWER — ✅ **RULED: LEAVE IT.**
*"Did I tell you something about the Stink Tower? It has a good explosion. It does damage. Everything
is fine for now."* Correct — and I muddled this by listing it as a question at all. The S178 fix was
to its death-blast SCALE (it was one-shotting shapes on a retired scale); the tower itself is fine
and no further change is wanted. **Closed.**

---

# ⛔ FIVE SEARCHES NEVER RUN — carried forward

The overnight agent budget died and killed 15 of 20 lanes. Eleven were re-run by hand. **Five never
ran at all** and still owe a verdict: **determinism, the four-sites check, creature lifecycle, the
network protocol, host-migration.** Named rather than quietly dropped.
