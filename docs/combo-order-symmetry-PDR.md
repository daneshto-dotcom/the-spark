# PDR — Combo Order-Symmetry (S93 carry-forward, drafted S96)

> **Status: NEEDS YOUR DECISION before any code.** This amends a LOCKED decision (§ V.1 /
> LOCKED_DECISIONS §6) and changes game balance. S96 deliberately did **not** auto-change it
> (autonomous overnight session) — the fix requires a design call only you can make. Read §4, pick
> an option, say go, and a follow-up session executes it.

## 1 · The complaint (yours, S93)
Connecting a **Triangle and a Spiral** gives the magic **Warped Anchor** in one placement order
(Triangle→Spiral) but a dull **functional placeholder** in the other (Spiral→Triangle). To a player
this feels broken/arbitrary — they connected "the same two shapes" and got magic only by luck of
which piece they were carrying. You flagged it as systemic.

## 2 · Why it's NOT a simple bug — the LOCKED reality
The table is **intentionally order-dependent**, and that intent is wired into many places:
- `src/combos.ts:3` — *"Spec § V.1 LOCKED: order-dependent (A->B != B->A)."*
- `LOCKED_DECISIONS.md §6` — the Magic-14 seed is an *ordered* key list.
- **Three invariant tests assert it**: `combos.test.ts:52` (*"order-dependence: at least one A→B
  differs from B→A"*), `scoring.test.ts:126` (Line→Dot is a placeholder, no Filament trickle),
  `vortex.test.ts:125` (Spiral→Dot is not a Vortex).
- **Scoring** re-derives magic-ness in carried→target order (`scoring.ts` MAGIC_BONUS + Filament
  trickle). **Discovery** counts the ordered Magic-14 ("Combos N/14" HUD). **Behavior helpers**
  (`isVortexCombo`, `isFilamentCombo`, Anchor/Spindle) all key off the forward order.
- The **S91 win-score rebalance** (`PHASE_1_WIN_SCORE` 210→630) was tuned around *exactly these 14
  keys* to hold the canonical combo build's match length ~157.5s.

**The killer detail:** Triangle+Circle is *deliberately* two DIFFERENT magics —
**Triangle→Circle = Wheel** (MID, 3.0×) vs **Circle→Triangle = Star** (MID, 2.0×). A blanket
"make it commutative" fix would have to *delete one of them*. So commutativity is a genuine design
trade-off, not a typo.

## 3 · The full symmetry map (6 types → 15 unordered distinct-type pairs + 6 self-pairs)

| Unordered pair | Forward | Reverse | Class |
|---|---|---|---|
| Dot–Line | **Filament** (M) | placeholder | one-way magic |
| Dot–Square | **Anchor** (M) | placeholder | one-way magic |
| Dot–Spiral | **Vortex** (M) | placeholder | one-way magic |
| Line–Triangle | **Bracket** (M) | placeholder | one-way magic |
| Line–Circle | **Spindle** (M) | placeholder | one-way magic |
| Line–Spiral | **Whip** (M, Spi→Line) | placeholder | one-way magic |
| Triangle–Spiral | **Warped Anchor** (M) | placeholder | one-way magic ← your example |
| Square–Circle | **Capsule** (M) | placeholder | one-way magic |
| **Triangle–Circle** | **Wheel** (M, 3.0×) | **Star** (M, 2.0×) | **dual magic (intentional)** |
| Dot–Triangle | placeholder | placeholder | none |
| Dot–Circle | placeholder | placeholder | none |
| Line–Square | placeholder | placeholder | none |
| Triangle–Square | placeholder | placeholder | none |
| Square–Spiral | placeholder | placeholder | none |
| Circle–Spiral | placeholder | placeholder | none |

Self-pairs (always symmetric): Line–Line=Cable, Triangle–Triangle=Diamond, Square–Square=Lattice,
Circle–Circle=Orbital are magic; Dot–Dot, Spiral–Spiral are placeholders.

**Counts:** 8 one-way-magic pairs (the real confusion source) · 1 dual-magic pair (Wheel/Star) ·
6 none · 4 magic self-pairs. Ordered magic keys = 8 + 2 + 4 = **14** ✓ (matches Magic-14).

## 4 · Options (pick one)

**Option A — Full commutativity (canonical sorted key).**
`lookupCombo` sorts (a,b) so order never matters.
- ✗ Forces a winner for Triangle+Circle → **lose Wheel or Star**.
- ✗ The 8 one-way magics fire in BOTH orders → magic occurrence ~doubles → income inflation →
  **needs a full S91-style rebalance** to restore ~157s matches.
- ✗ Breaks `combos.test.ts:52`, `scoring.test.ts:126`, `vortex.test.ts:125` (rewrite as symmetric).
- Simplest code, biggest balance + feature impact.

**Option B — Mirror the 8 one-ways, KEEP Wheel/Star (recommended if you want symmetry).**
Add reverse rows for the 8 one-way pairs so both orders yield the *same* magic (Spiral→Triangle also
= Warped Anchor, etc.); leave Triangle↔Circle as the intentional Wheel/Star duality.
- ✓ Fixes the confusing "dud reverse" for the 8 pairs you actually hit.
- ✓ Preserves the Wheel/Star feature.
- ✗ Still ~doubles magic occurrence for those 8 → **rebalance needed** (re-tune PHASE_1_WIN_SCORE like
  S91; I can derive the new value + verify match length).
- ~ "Combos N/14" semantics: keep counting *unordered* (stays /14) — cleanest for the HUD.
- Medium code; preserves design intent; the honest "make connecting two shapes feel consistent" fix.

**Option C — Keep order-dependence; fix the UX instead.**
Don't touch the table. When a player forms the *reverse* of a magic pair, surface a hint (subtle
"flip the order" cue) or auto-orient the carried piece toward the magic order.
- ✓ Zero balance/spec/test churn; respects § V.1 as-is.
- ✗ Adds input/UI work; doesn't make the two orders identical (some players may still find it fiddly).
- Smallest semantic risk; treats the asymmetry as a teaching problem, not a table problem.

## 5 · Recommendation
**Option B**, paired with a derived rebalance — it removes the genuine confusion (8 one-way pairs)
while keeping the Wheel/Star duality you intentionally built, and the rebalance is a known, tested
procedure (S91 did the same dance). If you'd rather not touch balance at all right now, **Option C**
is the zero-risk stopgap. **Option A** only if you've decided the Wheel/Star split isn't worth keeping.

**To proceed, tell me:** (1) which option, (2) for B: confirm "same magic both orders" (vs. inventing
new reverse magics), (3) for A/B: approve a rebalance pass. Then a session executes + re-verifies
(tsc, vitest incl. updated invariant tests, match-length check).
