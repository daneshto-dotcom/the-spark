# S191 CANON NOTES — `s191/carry`

`s191/carry` edited ONLY canon §9d item 2 and §10's R182-C entry (+ their `canon.test.ts` pin), per the
brief. Everything below is canon text the merge owner should apply or rule on; none of it is in the
branch's `SPARK_CANON.md`.

## 1 · §7 is now stale about the blast (C-5) — ✅ APPLIED in R2-D (merge owner's round 2)

`SPARK_CANON.md` §7 (~line 1024), the paragraph beginning *"⛔ THE BLAST ITSELF IS UNCHANGED AND IS AN
OPEN QUESTION."*, still says the hub calls `applyRadialClear` and *"Not built. See §10."* That is false
on this branch. Proposed replacement (no new number, so no new assertion):

> ⭐ **THE BLAST IS 120 FIFTHS NOW (R182-C, BUILT S191).** The hub's blast is ladder damage —
> `STRUCTURE_SELFDESTRUCT_FIFTHS` (120) to every enemy entity inside `STRUCTURE_SELFDESTRUCT_RADIUS` —
> not the raze, and S157 P0 still spares the owner. See §9d item 2.

## 2 · §2's overkill sentence is not what the tree does (MEASURED, pre-existing) — ✅ canon REWRITTEN to the tree in R2-D; the rule itself is an OWNER QUESTION (code unchanged)

§2: *"Damage banks structure-wide, and overkill spends into the next connector rather than being
wasted — so a boss's 150 takes the 50, then the 36, then the 24 in a single blow."* (also stated in
`hostTick.ts` ~:1642 and in `damageConnector`'s docblock).

Measured through the real `SEVER_BOND`: 120 on one connector of a 5-connector star banks 70 over the
50-pool — **all of it on the struck bond** (`damageConnector` drains the STRUCK bond first, then the
survivors) — and the caller's sever then deletes that bond, so the survivors hold **0**. One hit fells
exactly one connector however large it is; a boss's 150 takes the 50 and the other 100 is discarded.
`damage.test.ts`'s "overkill carries over" test measures the bank BEFORE the sever, which is why it is
green. `hubSelfDestructLadder.test.ts` pins the measured 0 with a ⚠ note so a fix turns it red.

Fix shape (NOT built — shared `damage.ts`, changes every connector strike in the game, so it is a rule
both peers compute and would ride a bump): move the struck bond's remainder onto the survivors before
reporting "sever", and let a caller keep severing while the carried damage covers the next pool. Owner
question only if the §2 sentence is not already his ruling (R173-B's *"subtract the pool rather than
zeroing, so overkill carries"* reads as if it is).

## 3 · A wide-hash asymmetry on an emptied castle bank (C-1, pre-existing, test-oracle only)

A bank a pull has emptied keeps an all-zero tally in `world.castleBanks`; `hashWorldStateFull` projects
it (`cb0:0.0.0.0.0.0`) but `serializeCastleBanks` (`save.ts` ~:2096) skips zero tallies, so any restore
(worker INIT, save-load, a successor's mirror) hashes differently. The narrow `hashWorldState` does not
project banks, so production host-vs-client is unaffected. Not a canon fact; recorded here for the
merge owner. Fix shape: hash-skip zero tallies, or delete the map entry at zero.

## 4 · Decisions that are MINE on this branch (for the owner batch)

- C-5 · the blast is **per connector** (a 5-connector tower wholly inside takes 120 × 5 and falls);
  once-per-structure is the other reading. Flagged at `STRUCTURE_SELFDESTRUCT_FIFTHS`.
- C-5 · the blast is the **unbuffed** drone (a seat that drafted ATK/PEN still blasts 120).
- C-5 · the connector sever's cause is **`'drone'`** (existing; toast "<SEAT>'S DRONE CUT YOUR BOND";
  no SFX arm plays for it — `effects.ts` claims a lightning crackle for `'drone'`, `audioManager` has no
  such arm: a stale comment, not touched).
- C-5 · the zombie boss's R138 blast (same action) is **left a raze** — the ruling names the hub only.
- C-4 · the Pharaoh's **halo** still draws while he channels in BUILD; only the columns are gated.
