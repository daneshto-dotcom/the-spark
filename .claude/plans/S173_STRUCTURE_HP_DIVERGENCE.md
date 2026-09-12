# ⛔ STRUCTURE HP — THE OWNER'S MODEL vs THE SHIPPED CODE

**STATUS: NEEDS TWO OWNER RULINGS. No code changed.** Raised S173 when he corrected my damage-scale
question and, in doing so, described the structure HP model he believes is already built.

He is right that it is predefined, and right that there is no scale problem for towers — a tower's
pool is in FIFTHS, the same unit as a creature's, so a damage number on a tower needs no conversion.
**My question was wrong**: I had lumped towers together with bare `Primitive.hp` (a 1000-point scale)
and `CASTLE_MAX_HP` (1500). Those are different systems. For towers, his answer is simply "the same
number you'd see on a creature", and that closes the scale question.

But laying his arithmetic against the code turned up two divergences.

---

## HIS MODEL, from this session, verbatim

> *"each connector adds a one HP level and one defense level … five connectors in total means five HP
> and five defense. Five defense is two, so it's five times two and then times five. So that's fifty.
> That means that the lightning hub has fifty HP … when an enemy force attacks it, it needs to take
> down fifty HP … Once fifty HP is depleted, the tower gets crushed, gets destroyed with the
> cinematic. And now we're left with … just the connectors that we can either fix or scrap during
> build phase … And then the next connector to destroy it … we'll have four connectors left, then
> it's four HP times level four def. That's one point eight. So four times one point eight and then
> times five. Now we have only thirty six HP … then boom, another connector gets destroyed. We're
> left with three connectors. That's three HP times one point six times five. That's twenty four."*

His three worked examples are perfectly self-consistent: **pool(n) = n × (5 + n) fifths**, i.e. DEF
level == connector count.

| n | his | his arithmetic |
|---|---|---|
| 5 | **50** | 5 × 2.0 × 5 |
| 4 | **36** | 4 × 1.8 × 5 |
| 3 | **24** | 3 × 1.6 × 5 |

---

## DIVERGENCE 1 — THE DEF LADDER IS OFF BY ONE LEVEL  *(small, but it contradicts his own earlier ruling)*

`connectorCapacityFifths(n) = n + (FIFTHS − 1) = n + 4`, which is `multiplierFifths(n − 1)`. So the
code gives a structure **DEF = connectorCount − 1**, and the docblock records that as his ruling:

> *"the structure's **DEF = connectorCount − 1** (1 connector → 0, 2 → 1, 3 → 2)"*
> *"Verified against every owner example: 1 → 5 (×1.0) · 2 → 6 (×1.2) · 3 → 7 (×1.4) · 11 → 15 (×3.0)"*

And his OWN earlier words are pinned as assertions in `src/state/stats.test.ts`:

```
expect(asDecimal(structureDefenceFifths(2))).toBe(2.4); // "2HPx1.2DEF which makes it 2.4"
expect(asDecimal(structureDefenceFifths(3))).toBe(4.2); // "3hpx1.4 = 4.2"
```

⇒ **He said 3 connectors → ×1.4 then, and ×1.6 now.** Same quantity, two different rulings, both his.

| n | code (DEF = n−1) | his today (DEF = n) |
|---|---|---|
| 5 | 45 | **50** |
| 4 | 32 | **36** |
| 3 | 21 | **24** |
| 2 | 12 | **14** |

Difference is exactly `n` fifths. ⚠ The health bar shipped in S173 P1 reads the CODE's number.

---

## DIVERGENCE 2 — THE POOL IS PER-CONNECTOR, NOT PER-STRUCTURE  ⛔ **THIS IS THE BIG ONE**

This is the one he believes is already built, and it is not.

- **HIS model:** the whole structure holds one pool. You must deplete **all 50** before the FIRST
  connector is lost; then the survivors re-form at 36; deplete that for the second; then 24; and so on.
- **THE CODE:** `damageConnector` banks damage on **one individual bond** and severs it the moment
  that bond alone reaches `connectorCapacityFifths(n)`. For a 5-connector hub that is **9 fifths**,
  not 50. The docblock states the intent plainly: *"per-connector = total / connectors = mult — the
  HP term cancels exactly."*

| | to lose the 1st connector | total to level a 5-connector hub |
|---|---|---|
| **his model** | **50** fifths | **130** fifths |
| **shipped code** | **9** fifths | **35** fifths |

⇒ **Towers are currently ~3.7× weaker than the model he described**, and the first connector goes
after about a fifth of the damage he expects. A chewer bites for 7 fifths: under the code it severs a
5-connector hub's first connector on its **second bite**; under his model it would need **eight**.

This also explains his playtest sentence *"they would just, like, die"* about health bars stepping —
the bar is honest, but the thing it measures collapses far faster than intended.

---

## AND A THIRD THING HE DESCRIBED THAT DOES NOT EXIST YET

> *"the next connector to destroy… the one closest to where the creature is attacking from — depends
> where he's attacking from is what connector will be destroyed."*

The code has no "nearest connector to the attacker" selection; damage lands on whichever bond the
attacker targeted. If the pool becomes per-structure (Divergence 2), something must then CHOOSE which
connector pops, and that choice must be a **total order** (squared distance, then an explicit id
compare) or it is a desync — `Map` iteration order deciding it is the S155 N1 defect exactly.

---

## THE TWO RULINGS NEEDED

1. **DEF ladder** — is a structure's DEF its connector count (today's statement, 5 → ×2.0) or
   count − 1 (R76 as recorded and shipped, and his own "3hp x 1.4")? His newer statement is the more
   recent, but the older one is pinned in tests as his words, so this is a genuine conflict rather
   than a bug.
2. **Pool shape** — does the WHOLE structure pool have to be depleted to lose ONE connector (his
   description, ~3.7× tougher towers), or does each connector carry its own share (shipped)? This is
   a large balance change and touches `damageConnector`, every raid/chew path, and the health bar.

⚠ Both are BALANCE rulings with wide blast radius. Neither should be changed on inference.
