# SPARK — the complete unit stat table

Generated S168 by reading `CREATURE_CONFIGS` (`state/creatures/voltkin-config.ts`) directly, not
copied from any earlier document. Every derived column is computed with the shipped functions in
`state/stats.ts`, so this page and the sim cannot disagree.

---

## 1. Your DEF arithmetic is exactly what the game implements

> Owner: *"remember def affects the total defensive stat (hp x def) so if voltkin has 8 hp and 3def
> (thats 1.6) then he has a total defensive stat of 8 x 1.6 = 12.8"*

Correct, and it is the code:

```ts
multiplierFifths(points) = 5 + points           // the 1 + 0.2n ladder, in fifths
unitPoolFifths(hp, def)  = hp * (5 + def)       // what damage is subtracted from
```

Voltkin: `8 x (5 + 3) = 64` fifths = **12.8 points**. Your number to the decimal.

It is **LINEAR, not compounding** — DEF 3 is x1.6, not 1.2³ = 1.728 — and that matches your own
earlier ruling quoted in `stats.test.ts` (*"if an enemy has 2 hp and one def his total defensive stat
is 2.4"*). Nothing needs changing.

## 2. Where the 180 came from

**It is not a defensive stat, and it is not wrong — it is Voltkin's attack RANGE in pixels.**
`voltkin-config.ts:373` reads `attackRange: 180`. It sits in the same config object as HP/DEF/ATK/PEN
and was almost certainly read out alongside them. There is no 180 anywhere in the stat arithmetic;
the defensive number for Voltkin is your 12.8 (64 fifths).

---

## 3. The complete table

`POOL` is effective HP in fifths (`hp x (5+def)`), `DMG` is damage per swing in fifths
(`atk x (5+pen)`). Divide either by 5 for "points".

### Castle spawn unit — what the castle emits free, every ~30 s (R107/R120)

| Unit | HP | DEF | ATK | PEN | POOL | DMG |
|---|---|---|---|---|---|---|
| `raceUnit` | 1 | 1 | 1 | 1 | **6** | **6** |

⚠ **There is exactly ONE castle unit type today, shared by all six races** (R125: *"1 HP · 1 DEF ·
1 ATK · 1 PEN, identical for all six races"*). Only its ART is per-race —
`goblinRenderer.ts:200` picks `/art/race-units/unit-<race>` off the owner's race. So the bat, the
piranha, the scarab and so on already LOOK different while being statistically identical.

### Tier-3 tower units — one per race, fed or (since S168) emitted on the castle's clock

| Race | Unit | HP | DEF | ATK | PEN | POOL | DMG |
|---|---|---|---|---|---|---|---|
| Vampires | `t3Bat` | 2 | 0 | 2 | 1 | 10 | 12 |
| Nagas | `t3Piranha` | 3 | 0 | 2 | 1 | 15 | 12 |
| Mummies | `t3Scarab` | 4 | 2 | 1 | 0 | 28 | 5 |
| Zombies | `t3Hound` | 2 | 0 | 2 | 0 | 10 | 10 |
| Orcs | `t3Warband` | 4 | 1 | 3 | 1 | 24 | 18 |
| Demons | `t3Souleater` | 3 | 1 | 2 | 2 | 18 | 14 |

### Tier-9 bosses — your R141 band (HP 10–12, DEF 4–8, ATK 6–10, PEN 8–10, varied speed)

| Race | Boss | HP | DEF | ATK | PEN | POOL | DMG | Speed |
|---|---|---|---|---|---|---|---|---|
| Vampires | Vlad | 10 | 4 | 10 | 10 | 90 | **150** | 0.95 |
| Nagas | Kraken | 12 | 6 | 7 | 8 | 132 | 91 | 0.65 |
| Mummies | Pharaoh | 11 | 8 | 6 | 8 | **143** | 78 | 0.75 |
| Zombies | Whopper | 12 | 5 | 8 | 8 | 120 | 104 | 0.80 |
| Orcs | Warlord | 11 | 6 | 8 | 9 | 121 | 112 | 0.90 |
| Demons | Archdemon | 10 | 4 | 9 | 10 | 90 | 135 | 1.00 |

### Everything else on the board

| Unit | HP | DEF | ATK | PEN | POOL | DMG |
|---|---|---|---|---|---|---|
| Voltkin | 8 | 3 | 3 | 6 | 64 | 33 |
| Pencil chewer | 1 | 0 | 1 | 2 | 5 | 7 |
| Lightning drone | 2 | 0 | 5 | 1 | 10 | 30 |
| Goblin melee | 1 | 2 | 2 | 1 | 7 | 12 |
| Goblin archer | 1 | 1 | 2 | 2 | 6 | 14 |
| Goblin shield | 2 | 3 | 1 | 0 | 16 | 5 |
| Goblin hound | 1 | 0 | 3 | 2 | 5 | 21 |
| Goblin bat | 2 | 0 | 1 | 3 | 10 | 8 |
| Goblin suicide | 2 | 0 | 4 | 0 | 10 | 20 |

---

## 4. R145 — "castle spawn units one point weaker than the tier-3 units"

> Owner: *"they should be weaker by 1 point (off their strongest stat) then the tier 3 units"*

Applying that literally to each tier-3 unit gives:

| Race | Tier-3 unit | Strongest stat | Castle unit would be | POOL | DMG |
|---|---|---|---|---|---|
| Vampires | 2/0/2/1 | ⚠ **HP 2 and ATK 2 tie** | 1/0/2/1 *or* 2/0/1/1 | 5 / 10 | 12 / 6 |
| Nagas | 3/0/2/1 | HP 3 | **2**/0/2/1 | 10 | 12 |
| Mummies | 4/2/1/0 | HP 4 | **3**/2/1/0 | 21 | 5 |
| Zombies | 2/0/2/0 | ⚠ **HP 2 and ATK 2 tie** | 1/0/2/0 *or* 2/0/1/0 | 5 / 10 | 10 / 5 |
| Orcs | 4/1/3/1 | HP 4 | **3**/1/3/1 | 18 | 18 |
| Demons | 3/1/2/2 | HP 3 | **2**/1/2/2 | 12 | 14 |

### ⛔ Two things need you before this can be built

**1. The two ties.** Vampires and Zombies have their highest value on *both* HP and ATK. Taking the
point off HP makes a glass-cannon; taking it off ATK makes a cheap body. They play completely
differently and the wording does not choose. *(A general rule would also do — e.g. "always take it
off HP" — and would settle both at once.)*

**2. This turns one castle unit into six, and that is a real change, not a number edit.** Today all
six races share a single `raceUnit` type at 1/1/1/1. The table above would make each race's castle
unit statistically distinct — and far stronger than today (POOL 5→21, DMG 6→18 for orcs). Three
consequences worth knowing before you say yes:

- **The art already exists**, per race, and is already selected by the owner's race. No new art.
- **It costs the four-sites tax** (factory + serialize + hash + worker) and a `PROTOCOL_VERSION`
  bump, because a creature's type is on the wire.
- **It is a large power increase to the free unit.** The castle emits one every ~30 s at no cost;
  an orc castle unit at DMG 18 would out-hit a goblin melee (12) for free, forever. If that is the
  intent, good — but it is a much bigger balance move than "one point weaker", and it is worth
  saying out loud before it ships.

Nothing here is blocked on anything but those two answers.
