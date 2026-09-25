# THE SIX TIER-9 BOSSES — every stat and every ability

Read straight out of the code at S178 (`T9_BOSS_STATS`, `makeT9BossConfig`, the nine `runXxx` skill
functions). Nothing here is remembered or estimated.

⛔ **CORRECTION TO SOMETHING I TOLD YOU EARLIER.** I said *"only 2 of the 6 bosses have an ability
that changes a fight."* **That was wrong.** All six have abilities, all nine skill functions are
called every host tick (`hostTick.ts:1830-1848`). I had only looked at Vlad and the Warlord because
those were the two in your duel.

---

## STATS

| Boss | HP | DEF | ATK | PEN | **Pool** | **Damage/hit** | Move speed | Attack speed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **Vlad** (Vampires) | 20 | 8 | 10 | 10 | **260** | **150** | 139 px/s | 1.0 s |
| **Archdemon** (Demons) | 20 | 8 | 9 | 10 | **260** | **135** | 146 px/s | 1.0 s |
| **Whopper** (Zombies) | 24 | 10 | 8 | 8 | **360** | **104** | 117 px/s | 1.0 s |
| **Warlord** (Orcs) | 22 | 12 | 8 | 9 | **374** | **112** | 131 px/s | 1.0 s |
| **Kraken** (Nagas) | 24 | 12 | 7 | 8 | **408** | **91** | 95 px/s | 1.0 s |
| **Pharaoh** (Mummies) | 22 | 16 | 6 | 8 | **462** | **78** | 109 px/s | 1.0 s |

`Pool = HP × (5 + DEF)` · `Damage = ATK × (5 + PEN)` — your ×5 ladder, in fifths.

⚠ **ATTACK SPEED IS IDENTICAL FOR ALL SIX** — 60 ticks (1.0 s), inherited from
`GOBLIN_ATTACK_CADENCE_TICKS`. No boss has its own attack speed. **Only the Warlord's rage changes
it, and only for himself.** If you want attack speed to be a per-boss identity, that is a new dial —
you have mentioned wanting per-unit attack speed before ("the only real solution").

## STRIKES TO KILL — attacker down the side, victim across the top (abilities ignored)

| | Vlad | Kraken | Pharaoh | Whopper | Warlord | Archdemon |
|---|---:|---:|---:|---:|---:|---:|
| **Vlad** | – | 3 | 4 | 3 | 3 | **2** |
| **Kraken** | 3 | – | 6 | 4 | 5 | 3 |
| **Pharaoh** | 4 | 6 | – | 5 | 5 | 4 |
| **Whopper** | 3 | 4 | 5 | – | 4 | 3 |
| **Warlord** | 3 | 4 | 5 | 4 | – | 3 |
| **Archdemon** | **2** | 4 | 4 | 3 | 3 | – |

Reading it: the raw ladder is fairly tight — most pairings are 3–5 strikes. The two glass cannons
(Vlad, Archdemon) kill each other in **2**. The Pharaoh is the wall (462 pool) and the slowest killer
(78/hit), taking 6 strikes to drop the Kraken.

---

## ABILITIES — all six, all live

| Boss | Ability | What it does | Built? |
|---|---|---|---|
| **Vlad** | **Life-sap** (R140) | Heals **20% of max HP**, **3 uses**, once he drops below **40%**. Pure self-heal — nothing is drained from the victim. Effective pool **260 → 416 (+60%)**. | ✅ |
| **Warlord** | **Rage** | Below **25%** health his attack speed **doubles**; clears again above 50%. | ✅ |
| **Warlord** | **Direwolves** (R149) | Up to **3 per warlord**, stats 3/3/3/3. | ✅ |
| **Archdemon** | **Taken to hell** (R150) | Any enemy within **170 px** that drops below **5% health** is dragged under and killed outright. | ✅ |
| **Archdemon** | **Teleport** (R150) | Every **7 s** he blinks to a target, preferring the **loneliest** enemy (fewest friends within 260 px). | ✅ |
| **Kraken** | **Sonar wave** (R139) | A **60° cone**, range **260 px**, every **9 s**: **stuns for 2 s** and shoves **70 px** (`KRAKEN_SONAR_KNOCKBACK_PX` = 2 × the 35 px melee arm; ⚠ this said 26 px until S189 C10 — a per-substep velocity that flung units ~11,000 px, off the map). | ✅ |
| **Pharaoh** | **Locust clouds** (R142) | **2 clouds** every **30 s**, 15 s lifetime, each **10 ATK / 10 PEN = 150 damage**, 1.35× speed. | ✅ |
| **Pharaoh** | **Ra ritual** (R142/R171) | At death he becomes **unkillable**, calls down **5 columns** at **15 ATK / 15 PEN = 300 each**, then dies. | ✅ |
| **Whopper** | **Rot aura** | **2.5% of max per pulse** to everything within **170 px**. | ✅ |
| **Whopper** | **Death blast** | Explodes on death across **380 px** — owner-agnostic, so it can kill his own side. | ✅ |

---

## ⚠ WHAT THE TABLE SHOWS ABOUT YOUR VLAD COMPLAINT

The **stats** are not the problem — Vlad and the Warlord are 3 strikes apart in both directions.

The **abilities** are wildly uneven in what they are worth in a straight duel:

- **Vlad's sap is +60% effective health, unconditionally.** It is the only ability in the game that
  makes a boss straightforwardly *harder to kill*.
- **The Warlord's rage almost never fires against a hard hitter.** It arms below 25% of 374 = 93.5
  fifths, and Vlad hits for 150 — so the Warlord falls 224 → 74 in one blow, **straight past his own
  window**. Against Vlad specifically, rage is close to dead weight.
- The Kraken's stun, the Archdemon's teleport and the Pharaoh's locusts are all strong — but they are
  **positioning and crowd tools**. In a toe-to-toe boss duel they do much less than a flat +60% health.

So the honest summary: **six bosses, six real abilities, but only one of them wins a duel by itself.**
That is what you felt when Vlad walked away from the Warlord.
