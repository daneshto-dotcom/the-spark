# SPARK — WHO TARGETS WHAT. The table he asked for.

> *"I want the table of all the units, all the buildings to see who they're targeting, what's their
> preferences, and I will fix it for you. I will tell you."* — owner, S180

**Every row was read out of the code by hand this session**, not copied from a design note. Where a
row disagrees with his stated rule it says so in the last column.

---

## HIS RULE, as he gave it

- **Default, everything:** prefer **units** inside its radius. With no unit in radius, attack the
  **closest building, whatever it is.** *"Because units are attacking you, so if someone is
  attacking, you're gonna want to attack them back… Same with buildings. If there's a defensive
  building like a stink tower, you know you want to attack it."*
- **Pencil chewer** — connectors ONLY.
- **Goblin suicide bomber** — buildings only; with no buildings, people.
- **Helga** — units only.
- **The demon boss (Archdemon)** — prefers LONE creatures.

---

## ⛔ READ THIS BEFORE THE TABLE: the rule is currently broken for 21 of 24 unit types

Since yesterday's lone-shape commit, the scan that picks a structure to attack **skips every shape
that has a connector**, and the same code path **sets the connector target to null**. So for
everything in GROUP A below, a standing building is not a target at all — and the castle march is
the only thing left in the list.

> **Only Voltkin, the pencil chewer and the lightning drone can damage a building today.**

That is one bug, in one place, and fixing it is what makes his rule expressible at all.

---

## GROUP A — the 21 that march on buildings

They all run the SAME steering ladder. Only the ranges differ.

```
1. GO HOME            (the last ~3 s of FIGHT — outranks everything)
2. an enemy UNIT      acquired within 220 px, held on a 300 px leash
3. a landed STINK BAG within 220 px
4. an enemy SHAPE     ⛔ BROKEN — only a shape with NO connectors qualifies
5. the enemy CASTLE   the march, when nothing above matched
```

And when it swings, the strike order is: **enemy unit → Helga → shape → stink bag → castle**.

| Unit | reach | notes |
|---|---|---|
| Goblin melee | 35 px | true melee, 1 s per swing |
| Goblin archer | 220 px | holds range — shoots without closing |
| Goblin shield | 35 px | the defensive one: 3 DEF, 1 ATK |
| Goblin hound | 35 px | |
| Goblin bat | 150 px | holds range |
| **Goblin suicide** | 70 px blast | ⛔ **no building preference at all** — see below |
| Castle race unit | 35 px | one shared type, all six races |
| t3 Bat · Piranha · Scarab · Hound · Warband · Souleater | 35 px | |
| **Vlad · Kraken · Pharaoh · Whopper · Warlord · Archdemon** | 35 px | all six bosses are in this group |
| Direwolf (Warlord's pack) | 35 px | inherits the tier-3 config wholesale |
| Locust cloud (Pharaoh) | 40 px | cannot be targeted back |

## GROUP B — the 3 that go for connectors

| Unit | targets | reach | notes |
|---|---|---|---|
| **Pencil chewer** | nearest **enemy** connector; commits and chews it; marches on the keep only when no enemy connector exists anywhere | 35 px | ✅ matches his rule |
| **Voltkin** | nearest connector, **enemy or its own**; plus it opportunistically zaps any enemy unit already inside 180 px — it never walks toward one | 180 px | ⚠ the own-connector fallback is a real behaviour, see Q3 |
| **Lightning drone** | nearest **enemy** connector, re-picked every tick; detonates on arrival | 110 px blast | a homing missile |

---

## BUILDINGS

| Building | targets today | range | vs his rule |
|---|---|---|---|
| **Laser turret** | **creatures only** | 420 px | ⛔ **R72 says *"laser torretr does both"*.** There is no structure arm in the beam at all. The table has recorded your ruling as if it were behaviour since S151. |
| **Stink tower** | acquires **creatures only**; the bag it lobs **splashes** and that splash damages shapes | 260 px | ~ it breaks buildings by accident, not by aim |
| **Helga** | **units only** | 380 px | ✅ matches his rule exactly — the one unambiguous entry |
| **Castle gun** | **creatures only**, nearest enemy in range | 300 px | fires every 4 s |
| Goblin / race / tier-3 / tier-9 towers | nothing — they **emit units**, they do not shoot | — | |

⚠ **A tower has no health of its own.** It dies through its connectors. So *"attack the closest
building"* has to mean *"attack the nearest connector of the nearest enemy structure"*. That is the
one thing in his rule that is not directly expressible today, and he should rule on it knowingly.

---

## ⛔ WHAT DISAGREES WITH HIS RULE — the list he has to fix

| # | actor | he wants | code today |
|---|---|---|---|
| **1** | 21 of 24 unit types | units first, then the closest building | **buildings are invisible; they march on the keep** |
| **2** | goblin suicide bomber | buildings only; people only if no buildings | declared "units and structures", with the **unit preferred first** — the exact opposite |
| **3** | laser turret | *"does both"* | creatures only |
| **4** | the Archdemon | prefers **lone** creatures | ✅ **mostly already true, don't rebuild it.** His teleport picks its destination by *fewest allies within the loneliness radius* — a genuine three-deep isolation sort — and having jumped there, the nearest-unit rule makes that straggler his target. What loneliness does *not* influence is the hell-grab (that is purely "below 10% health") or his ordinary swing. |
| **5** | every unit | *"the closest building, whatever it is"* | there is no "nearest building" concept — only nearest *shape* and nearest *connector* |

---

## ⛔ THREE THINGS ONLY HE CAN DECIDE

**Q1 · What is "the closest building"?** ✅ **THE COUNCIL ANSWERED THIS, and the answer is cheaper
than either option I was going to put to you.**

I had two: (a) every unit behaves like a chewer and commits to one joint; (b) units hit a member
shape — which needs your S179 ruling relaxed and would give one building two disagreeing health
systems. Both external seats attacked (b) hard: it re-creates the exact defect your ruling was
written to kill. But GEMINI proposed a third neither I nor GROK had — **walk to the building and aim
at the building, but land the damage on its connectors.**

**And the load-bearing half of that is already built.** I checked the code: connector damage already
banks **structure-wide**, and an overkill hit already **spends** the pool instead of wasting it — so
a boss's 150 against a 5-connector tower takes the 50, then the 36, then the 24 in one blow, and the
collapse accelerates. That is exactly the "cascade" the Council proposed as new work.

So what is actually owed is small: give those 21 types a connector target again, aimed at the nearest
enemy **structure** rather than at a bare joint. Your ruling holds unchanged — they target the
connectors — they just walk to the building to do it, and they spread around it instead of piling
onto one joint. **This is my recommendation. Say no and I'll build (a).**

**Q2 · Does "prefer units" mean prefer them at any distance, or only inside the radius?** Today the
radius is 220 px to acquire and 300 px to stay committed. Your words were *"in his immediate
vicinity, in the radius"* — so 220 px is the number unless you want it wider.

**Q3 · Voltkin falls back to chewing YOUR OWN connectors when no enemy connector exists.** That has
shipped for a long time and nobody has raised it. Intended, or a bug?
