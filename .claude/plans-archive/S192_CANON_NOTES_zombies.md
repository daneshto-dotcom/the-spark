# S192 CANON NOTES — `s192/zombies` (for the merge owner to fold into SPARK_CANON.md)

Each block names the canon section it amends. Numbers are pinned to their constants in this branch's tests; when
folding into the canon, add the matching `canon.test.ts` assertions in the same commit.

## §3e CORPSE EATER row — T12 (S192)

Append to the MINE column and the S188 audit notes:

⭐ **S192 (owner T12) — HE VISIBLY HEALS, PULSE BY PULSE.** *"It should show that he's healing over time … every tick
of healing should show above him."*
- ⚠ MINE: a **feed bite skips the S156 P4 initiative coin** (`creatureAttack.ts`, predicate `isCorpseEaterFeeding`).
  Under retaliation every bite was a mutual collision; measured: 6 of 6 mutual bites refused, 2 heals in 8 s. Now 8
  bites in the 8 s window (one per 60-tick cycle). The victim's own strike on him still rolls.
- ⚠ MINE: each landed bite's heal is **banked** (`Creature.corpseEaterHealBank`) and paid in
  `CORPSE_EATER_HEAL_PULSES` = **6** pulses `CORPSE_EATER_HEAL_PULSE_TICKS` = **10** ticks apart (one bite cycle),
  `floor(owed / pulsesLeft)`, the last pulse takes the rest: a 104 bite pays **17 17 17 17 18 18**. Each pulse is
  capped at his max and is its own green number. A stun does not stop the payout; a bank still owed when the FIGHT
  ends is forfeited (the F5 "cut short" rule).
- Heal numbers (every heal, not only his) are drawn **straight above** the healed unit, no lean, no sideways fling
  (`healAnchor`, render-only). R185-D still governs hits.

## §6 THE WIRE — T12

- `Creature.corpseEaterHealBank?: { fifths, untilTick }` — serialized (disk + wire, only while set, validated on
  read), hashed in the wide oracle (`:cb`), rebuilt by the worker from the same serializer. A required-to-agree sim
  field → part of this branch's BUMP.
- The feed bite's coin exemption is a rule both peers compute → part of this branch's BUMP.

## §3e THE RISEN row — T2 (S192)

Replace the MINE cell's "a kill with no creature attacker (castle gun, raid, area) or a raze raises nobody" with:
⭐ S192 (owner T2) *"every zombie that kills another unit, doesn't matter if it's through an explosion, through an
ability, or through … physical damage, that creates a regular zombie from the castle."* — the zombie boss's death blast
now raises one soldier per ENEMY it kills; the kill credit `{seat, type}` is captured at the blow (`racial/killCredit.ts`),
so a dead dealer still counts. Castle gun and raid still raise nobody. ⚠ MINE pending his confirmation: "every zombie" =
the three racial types (Reading A); `THE_RISEN_ANY_SEAT_UNIT` (false) widens it.

## §3e / §9d — the zombie boss DEATH BLAST — T3 (S192)

New row/section: the blast is no longer a raze. ONE pool `T9_ZOMBIE_DEATH_BLAST_POOL_FIFTHS` = **312** (3 ×
`attackFifths(8, 8)`, ⚠ AWAITING OWNER — alternatives 208 / 416), split over everything within
`T9_ZOMBIE_DEATH_BLAST_RADIUS` **380** px (⚠ AWAITING OWNER, MINE since S168) by linear falloff `max(1, floor(380 − d))`,
integer shares, floor of one, summing exactly, remainder nearest-first. A structure is ONE target; its share lands on its
nearest connector. Owner-agnostic (`T9_ZOMBIE_DEATH_BLAST_HITS_OWN_SIDE`, ⚠ AWAITING OWNER). Worked: 3 victims at
50 / 190 / 330 px take 180 / 104 / 28. A Warlord (374) adjacent survives. canon.test pins owed: 312, 380, the two levers.

## §6 THE WIRE — T2/T3

No wire field. BUMP: the blast's damage and THE RISEN raises are rules both peers compute (host-migration successor).
