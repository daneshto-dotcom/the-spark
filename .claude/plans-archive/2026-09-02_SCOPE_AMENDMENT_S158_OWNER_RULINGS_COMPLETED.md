> **STATUS: COMPLETED** (S158, archived at handoff)
>
> A1/A2/A3/A4 shipped, plus the four B-items from the live playtest (B1-B4) and the P3b ruling. The one property NOT done is NAVIGATION aggro for landed stink bags - carried forward with its reason.

---

# SCOPE AMENDMENT — S158, owner review of the autonomous batch (Rule 16)

Date: 2026-09-02 | Session: S158 | Entry commit: 7a8d466 | Tier: **Standard**
Trigger: the owner reviewed the batch and sent me back to the record. Their words:

> *"p6. ive already defined how the towers aura should be when we first spoke about their aura and
> everything (i gave you the stats of the aura and everything). p7. a raid should hit anything, it
> holds a certain attack strenght and stats of its own — again ive already explained it when we
> worked the unit and tower stats. look back at what i said."*

**They are right on both, and the record proves it. I asked for rulings that already existed.**

---

## WHAT THE RECORD ACTUALLY SAYS

`.claude/plans-archive/2026-08-22_PDR_S151_BATCH_COMPLETED.md` § "Deferred from R77 — new MECHANICS":

> Voltkin **chain lightning** · terrorist-goblin **AoE** · drone AoE sizing · destructible stink
> **bags** as entities with aggro and on-destroy damage · the stink tree's **0.2 atk/sec** aura model.

And `constants.ts` on R78, already written down:

> The whole R78 kill table falls out of `attackFifths(2,0) = 10` against `HP × (5 + DEF)` … it does
> NOT one-shot shield goblin(16, needs 2), **HELGA(54, needs 6)** or voltkin(64, needs 7).

So the raid kill table has ALWAYS included Helga. S152 could not implement it because defenders had
no `ehp`; S158 P7 gave them one. Nothing new is being decided here — two shipped rulings are being
finished.

---

## A1 — THE AURA IS 12× THE OWNER'S NUMBER, AND HAS BEEN SINCE S157

MEASURED, not inferred. `stinkAuraTick` fires every `DOT_CADENCE_TICKS` (30 ticks = 0.5 s) and
applies `attackFifths(STINK_BAG_ATK 1, STINK_BAG_PEN 1)` = **6 fifths** to units.

> 6 fifths = 1.2 atk, twice a second ⇒ **2.4 atk/sec.**  Owner: **0.2 atk/sec.**

`STINK_AURA_DAMAGE = 20` is likewise mine, not theirs — its own comment says "2 % of max hp per
application", authored in S141 with no owner number behind it.

⚠ **THIS IS A PRE-EXISTING DEFECT I INHERITED AND THEN PROPAGATED.** S157 B9 made the aura
unconditional (a loaded tower stinks too), and S158 P6 gave the landed bag the same numbers on the
argument that they were "numbers the owner already ruled on". They were not. The reasoning was sound
and the premise was false, which is exactly why the owner sent me back to the record.

FIX: an aura beat of **1 second applying exactly 1 fifth** = 0.2 atk/sec precisely, and integral
(`damageEntity` throws on fractions, so 0.5 fifths per half-second is not expressible). Structures
scale down by the same factor. One shared rate for the tower and the landed bags, since they are the
same smell.

## A2 — A LANDED BAG IS DESTRUCTIBLE, PULLS AGGRO, AND HURTS WHEN KILLED

R77, verbatim from the deferred list: *"destructible stink bags as entities with aggro and
on-destroy damage"*, and `STINK_BAG_ATK`'s own comment: a bag deals *"1atk 1pierce when destroyed"*.

S158 P6 shipped the entity, the wire, the hash and the art — and made it PASSIVE. Three properties of
the owner's spec are missing:

1. **destructible** — it needs a pool and a damage arm;
2. **aggro** — enemy units should come for it (the depleted tower already has `stinkAggroTargets`);
3. **on-destroy damage** — 1 atk / 1 pierce when it pops.

## A3 — A RAID HITS ANYTHING

`RAID_TARGET` today discriminates `creature | bond`. Add `defender`, and add the defender arm to the
right-click precedence in `controls.ts` (which already does creature-first, bond-second — R78's
stated order). No new balance number: `attackFifths(RAID_ATK 2, RAID_PEN 0)` = 10 fifths against
Helga's 54 pool ⇒ **6 raids**, which is the number `constants.ts` already published.

Towers stay unraidable: `ehp === null` means no pool, so `damageEntity` returns false for them — R75
is not reopened by this either.

## A4 — CF-S157-g IS MOOT, AND THE OWNER SPOTTED IT

They asked *"we dont have area hazards right? didnt we remove those?"* Correct:
`HAZARD_SPAWN_ENABLED = false` (constants.ts:446, S147 Step 0), and `physicsLoop` gates all four
hazard dispatch sites on it. Bombs, potatoes, rainbows and seagulls cannot spawn. The carry-forward
asked whether area hazards should raze orphaned shapes; there are no area hazards. **Closed as moot**,
with a note so it re-opens correctly if the flag is ever flipped back.

---

## OUT OF SCOPE (still needs a ruling, not guessed)

- Voltkin **chain lightning** and **drone AoE sizing** — the other two deferred R77 mechanics. Listed
  so they are not lost, not started.
- Whether the aura correction should also move `STINK_BAG_DAMAGE` (the impact splash). The owner's
  0.2 atk/sec is about the AURA; the impact is a separate, unchallenged number.

## TESTING

`npx tsc --noEmit` · `npx vitest run` (3309 baseline) · `npm run e2e:gating` (exit code via redirect)
· `npm run build` · `npm run verify-deploy`. Every item gets a test that FAILS before the fix.
