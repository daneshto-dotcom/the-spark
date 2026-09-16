# SPARK — THE WHOLE BACKLOG, S180

Written because he asked for it in as many words: *"present to me all the priority backlog. I want to
see everything else that we still haven't priority… give me the whole backlog of priorities and any
bugs still that we still have."*

Every line below is marked **VERIFIED** (I read the code or ran the gate this session) or **CARRIED**
(it comes from a prior session's notes and I have not re-checked it). Four items that had been sitting
in the backlog for sessions turned out to be **already done** — they are listed in §0 so nobody
re-proposes them.

Gates at the time of writing: typecheck exit 0 · vitest **4569 / 290 files** exit 0 ·
`check:atlas` exit 0 (31 clean) · `verify-deploy` 4/4 · master `db440ab`, 0 unpushed.

---

## 0 · ⭐ ALREADY DONE — the backlog was stale about these

| | status |
|---|---|
| **The atlas debt** (`BACKLOG.md §6`: *"`check:atlas` is red on 15 atlases"*, *"RED on every master run since S171"*) | **VERIFIED CLOSED.** The guard exits 0, 31 atlases clean on scenery / white-leak / edge-fringe / letterbox. The last five master CI runs are all `success`. |
| **The Orc Warlord** (`BACKLOG.md §1`, *"his pick for first"*) | **VERIFIED DONE.** Red rage tint (`creatureSpriteTint`), 2× attack + 2× move, direwolf summon (3 at a time, every 30 s, cap 3), and his own *"enrage at 49 calm at 50"*. |
| **The four boss numbers** | **VERIFIED DONE** (`2c46d53`): Vlad 2 saps, Archdemon 10%, locusts 50, rage at 50. |
| **R173-B, the structure pool per connector** | **VERIFIED DONE** — `structurePoolFifths`, one connector costs the full pool. |

---

## 1 · ⛔ BUGS — LIVE RIGHT NOW

### B1 · ⛔⛔ NOTHING CAN ATTACK A BUILDING — **the bug he reported, and it is far wider than bosses**

**VERIFIED, with the commit that caused it.** This is a regression I shipped yesterday in the
lone-shape rule (`00e02bf`), and it is live on `spark-online.space` now.

His S179 ruling was *"A creature stops targeting shapes that have connectors… He targets the
connectors."* The first half was built. **The second half was not.** The shape scan now skips every
shape that has a connector, and the very same code path sets the connector target to `null` — so a
standing building is invisible to the attacker and there is nothing left in its list but your keep.

Affected — every type that marches on buildings (`targetsStructures: true`):

> the six goblins (melee · archer · shield · hound · bat · suicide) · the castle's race unit ·
> the six tier-3 tower units · **all six tier-9 bosses** · the Pharaoh's locust cloud

**20 of the 23 creature types in the game cannot damage a building today.** Only Voltkin, the pencil
chewer, the lightning drone and the direwolf still can — they take a different branch that does
target connectors.

*Why it reads as "they beeline the castle":* units dead + buildings unhittable ⇒ the castle march is
the only remaining entry in the steering list.

### B2 · The laser turret cannot shoot buildings, though the rule says it does

**VERIFIED.** R72 (his ruling): *"laser torretr does both"*. The table records `BOTH`. The beam only
ever damages creatures — there is no structure arm at the fire site. The table has been recording an
intention as if it were behaviour. Balance change, so it is his call.

### B3 · Two MEDIUM findings from the S179 sweep that were never hand-checked

**CARRIED, explicitly labelled unverified in S179's own notes:**
- the castle gun acquires a target without testing that it is already dead, inside the one-tick
  deferred-death window — claim: it spends a 4-second shot on a corpse. *(He cancelled this: "I did
  not see it fire at a corpse because corpses disappear usually." Listed for completeness, not
  proposed.)*
- the tier-9 boss release razes its ring without the orphan sweep. *(Declined; and now moot — an
  orphan is a lone shape and dies to anything under the S179 rule.)*

### B4 · `nextPulledSparkId` is hashed and simulated but never saved

**CARRIED + VERIFIED as real by S179.** Latent, never observed in play. He declined fixing it. Here
because he asked for *all* the bugs, not as a proposal.

---

## 2 · ⛔ THE TARGETING TABLE — he is going to rule on it

His spec, said this session:

> Default: everything prefers **units** in its radius; with no unit in radius it attacks **the
> closest building, whatever it is**. · Pencil chewers: **connectors only**. · The goblin suicide
> bomber: **buildings only; if no buildings, people**. · Helga: **units only**. · The demon boss:
> **prefers lone creatures**. *"I want the table of all the units, all the buildings to see who
> they're targeting, what's their preferences, and I will fix it for you."*

The full census is in **`S180_TARGETING_TABLE.md`** — every unit and every building, what it targets
today in order, with the ranges. What is already known to disagree with his rule:

1. **B1 above** — the units-then-buildings fallback is broken for 20 of 23 types.
2. **The suicide goblin** is declared "units and structures" with no building-first preference.
3. **The turret** (B2).
4. **"Closest building" is not directly expressible today** — a tower has no health of its own; it
   dies through its connectors. So "attack the closest building" has to mean "attack the nearest
   connector of the nearest enemy structure". That is a ruling he should make knowingly.

---

## 3 · THE BOSSES — what is left

- **KRAKEN TENTACLES** — the only genuinely unbuilt boss skill. *"up to like six"* (S178) supersedes
  R139's three. He said the whole Kraken needs rework **including its video**, and deferred it.
- **BOSS ABILITY ART — nothing draws anything.** Every one of the six bosses is mechanically live and
  **visually silent**: no ability VFX atlas has ever been packed for this game. The Warlord's rage now
  has its red tint; the rest draw nothing at all.
- **AUDIT ALL SIX ABILITIES FOR IMPACT** — S178 measured that only 2 of 6 change a fight. Open.
- **The literal *"returns to the castle"* walk** — never built. There is no retreat locomotion for a
  boss; it holds position and resumes next FIGHT.

---

## 4 · ART DEBT

- **THE VOLTKIN TV — two transition videos, ~€20** each-ish (his measured clip cost is ~$20, not
  ~$4.50): (1) the TV breaks open and Voltkin **climbs out** — *he already has the climbing-out
  still, so wire it rather than generate it*; (2) damaged → destroyed explosion. No video is needed
  between intact and damaged. ⚠ He says **Voltkin needs reworking on a lot of things** — ask first.
- **12 FRAMES PER STATE IS NOT ENOUGH** — he has said it twice. Raising it costs atlas width × sheet
  size against a 105.8 MiB static payload. Decide against a measured sheet, not by feel.
- **General / goblin tower art** — still owed.
- ⭐ **PER-RACE BORDER WALL ART — new, he raised it in S180.** *"We wanted the border wall to be a
  racial art, so for every race the border needs to look — not just the color. Now it's just like a
  line with the color. It has to be like a general, we'll generate like a cool line looking for every
  race."* Six border treatments, one per race. He asked for it to be logged as a priority for a later
  session.
- **8 veo clips** — packing owed; 3 need re-rolling at a smaller subject size.

---

## 5 · FEATURES RULED BUT NOT BUILT

- **CHARACTER SHEETS** — *this session*. See the PDR.
- **END-OF-MATCH STAT BOARD** — researched and costed this session, then parked when he redirected.
  What the reconnaissance established, so it is not re-derived: the game tracks **none** of the five
  obvious stats; the finishing order is already computed correctly and consumed only by a log line;
  *damage taken* is cheap and *damage done* is 14 call sites (not 18) **all of which already have the
  attacker in scope**; structure damage threads no attacker at all and would need its own pass;
  counters ride the wire with no version bump. Today the whole end-of-match screen is **one line of
  text**.
- **CONNECTOR HIDING** — phase the shapes out while the tower stands, back when it breaks. Specified
  across three sessions (S170 P11 / R169), renderer-only, still unbuilt. **VERIFIED absent.**
- **NO DAMAGE NUMBERS ON SCRAP** — ruled, design settled, ~20 min.
- **NONET STAGES** — *"ten stages, then a harder level of sudoku."* Difficulty is already a live
  parameter nothing passes. Arcade-only ladder = free; in-match ladder needs a wire field. Eight
  questions still open for him.
- **BUILDING A CONTINUOUS CITY** — structures keeping their function when extended. He allowed it
  *"starting like a future session… not in the next session though"*. Needs one ruling first: can one
  shape belong to two recipes?
- **CODEX TIER ORDER** + the discovery tests that were never written.
- **R145 — "castle spawn units one point weaker than the tier-3 units"** — costed in
  `UNIT_STAT_TABLE.md §4` and blocked on **two answers only he can give**: (a) the vampire and zombie
  tier-3 units tie their highest value on both HP and ATK, and taking the point off one makes a glass
  cannon while the other makes a cheap body — the wording doesn't choose; (b) it turns one shared
  castle unit into six distinct ones, which is a large free-power increase (orc castle unit would
  out-hit a goblin melee, forever) and costs a version bump. Art already exists per race.

---

## 6 · PARKED BY HIM — do not re-litigate unprompted

| | his words |
|---|---|
| The untargetable freeze | Shipped S179 so units drop a phased-out target; he then said showing `0,0,0` *"makes total sense"*. *"We'll bring that up later."* One-line revert is ready. |
| Vlad's life sap looks wrong | *"kinda looks like shit for now, but whatever."* Deprioritised, not withdrawn. |

## 7 · ⛔ DECLINED — do not raise

Boss-ring orphan · castle gun firing at a corpse · `nextPulledSparkId` · a protocol bump for stale
browser tabs (*"Nobody cares. They'll just figure it out."*) · the potato blast (archived; no potato
can exist in a shipped match).

---

## 8 · PROCESS DEBT

- **The character-sheet research he remembers asking for was never actually done** — its lane died to
  the org spend limit in S178 and the session recorded it as owed. Run properly in S180.
- **`BACKLOG.md` is 3 359 lines and is now wrong in at least four places** (§0 above). It should be
  cut down to the forward list plus a link to the archive.
