# S191 CANON NOTES — `s191/addons` (for the merge owner)

⭐ **S192: the §3e text below (and the §4b Alt rule) is APPLIED to `SPARK_CANON.md` on this branch, with its
`canon.test.ts` assertions, under the merge owner's one-time exception; the cooldown is now HIS number. §6 is not.**

## A-1 · §3e — the Warlord's rage is now a 25 s clock, then a cooldown

**Stale text in `SPARK_CANON.md` §3e once this merges:**

- The BLOOD FRENZY guard paragraph (under "WHAT THE S188 AUDITS ESTABLISHED"): *"a source is a Warlord
  raging by his OWN latch (below `WARLORD_RAGE_TRIGGER_PCT` of his pool)"* — the source is now **his own
  25 s window** (`isOwnRageActive`, off `Creature.rageStartTick`), NOT his health and NOT the bare
  `enraged` bit. (Superseded by the S191 owner ruling below: the frenzy no longer touches a Warlord at all; only his own latch sets or lowers his bit.)

**Proposed canon text (a new sub-paragraph in §3e, beside BLOOD FRENZY) — ⭐ rewritten S191 round 2 to
the pattern that actually ships (RAGE-5), and to his RAGE-1 ruling:**

> ⭐⭐ **THE WARLORD'S RAGE LASTS 25 SECONDS, THEN "COOLDOWN FIRST" (S191).** *"let's do it like 25
> seconds"* — once his own latch fires (strictly below `WARLORD_RAGE_TRIGGER_PCT` **50** % of his own
> max, in FIGHT) he rages for `WARLORD_RAGE_TICKS` = **1500** ticks **regardless of healing** — R151's
> heal-above-50 exit is retired (`WARLORD_RAGE_CLEAR_PCT` is kept, unread). Then, *"cooldown first"*: he is
> calm for `WARLORD_RAGE_COOLDOWN_TICKS` = **1500** ticks whatever his health (⚠ MINE — he gave no length;
> 25 s mirrors the rage), and after it, below the line, he rages again at once. Both windows derive from
> ONE stamp, `Creature.rageStartTick`, written only by `runWarlordRage` — serialized, hashed, on the wire.
> ⭐ **THE PATTERN, RULED (S191):** the latch runs only in FIGHT, so a rage still running at the whistle
> stays red through the whole BUILD and the next FIGHT's first tick fires afresh — *"Yeah, that's fine.
> Who cares? You can't really see the creatures anyways."* A hurt Warlord therefore rages from each
> FIGHT's first tick, again every `WARLORD_RAGE_TICKS + WARLORD_RAGE_COOLDOWN_TICKS` inside
> `FIGHT_PHASE_TICKS` (today: 0–25 s, then from 50 s through the whistle and all of BUILD). Goblins never
> rage; another Warlord is never raised by his frenzy (below).

**Assertions to land with it in `canon.test.ts`** (derive, never hard-code — no "25 s on / 25 s off" pin;
that sentence was wrong and is gone from the constant too):

```ts
expect(WARLORD_RAGE_TICKS).toBe(25 * PHYSICS_HZ);
expect(WARLORD_RAGE_COOLDOWN_TICKS).toBe(WARLORD_RAGE_TICKS); // ⚠ MINE until he names a length
expect(canonSays(`\`WARLORD_RAGE_TICKS\` = **${WARLORD_RAGE_TICKS}**`)).toBe(true);
expect(canonSays(`\`WARLORD_RAGE_COOLDOWN_TICKS\` = **${WARLORD_RAGE_COOLDOWN_TICKS}**`)).toBe(true);
expect(canonSays('stays red through the whole BUILD and the next FIGHT')).toBe(true);
```

## S191 owner ruling (answers the audit's RAGE-2) · §3e — the frenzy never raises another Warlord

**Stale sentence in §3e ("WHAT THE S188 AUDITS ESTABLISHED"):** *"Two more guards: the frenzy only ever
SETS a Warlord — only his own latch calms him — and a source is a Warlord raging by his OWN latch …"*

**Replacement:**

> ⛔ **THE FRENZY NEVER TOUCHES A WARLORD (S191).** *"I don't think each warlord should be able to enrage
> the other warlord. Yes, the warlord enrages all the orc units, but still rage for himself is … warlord
> specific."* — owner, S191. BLOOD FRENZY raises the seat's orc racial units — the castle soldier and the
> orc tier-3 unit — and NEVER a Warlord: a Warlord rages only by his own 25 s clock (`rageStartTick`,
> written only by `runWarlordRage`), and when a second Warlord enters his own rage he frenzies the orc
> units, not the first Warlord. A source is a Warlord whose own window is open.

Table row (BLOOD FRENZY) "the rule" column: *"… every ORC RACIAL creature it owns rages too"* → *"… the
seat's castle soldiers and orc tier-3 units rage too (never another Warlord — S191)"*.

Assertion to land with it (`bloodFrenzy.ts` behaviour is pinned in `warlordRageClock.test.ts` and
`bloodFrenzy.test.ts`; the canon pin is the sentence): `expect(canonSays('THE FRENZY NEVER TOUCHES A WARLORD')).toBe(true)`.

## A-1 · §6 — the wire: the FINISHED bump docblock (S192; the merge owner pastes it into `protocol.ts`)

Verdict **BUMP**. Written as 52 → 53 on the assumption it rides its own deploy; if it shares a bump with
other branches, keep this list as one numbered group under that bump's header (S182 lesson 6) and renumber.
The canon §3e text and its `canon.test.ts` assertions already landed on this branch (S192, merge-owner
exception); canon §6 and its pin are the merge owner's.

```ts
/**
 * ⭐⭐ S192 — **BUMPED 52 -> 53: `s191/addons` — THE WARLORD'S 25 s RAGE CLOCK.** Each item earns it alone
 * (the S186 test: two builds that shake hands would disagree about something either computes):
 *   1. `Creature.rageStartTick?` — a NEW additive-optional field, the ONE stamp both rage windows derive
 *      from; written only by `runWarlordRage`; SERIALIZED (only when stamped; restore takes a non-negative
 *      integer, nothing else), rides `snapshot` AND `netSnapshot` (`trimMirrorCreature` keeps it), and is
 *      wide-hashed (`:rs`). A v52 successor promoted by host migration drops it and loses every clock.
 *   2. a CHANGED SHARED RULE — the latch: once fired (strictly below `WARLORD_RAGE_TRIGGER_PCT`, in FIGHT)
 *      he rages `WARLORD_RAGE_TICKS` (1500) REGARDLESS OF HEALING, then is calm `WARLORD_RAGE_COOLDOWN_TICKS`
 *      (1500, the owner's, S192) whatever his health — R151's heal-above-50 exit is retired. A v52 peer
 *      would calm him only on a heal above half, i.e. never.
 *   3. a CHANGED SHARED RULE — the BLOOD FRENZY source (`isFrenzySource`) is a Warlord whose OWN window is
 *      open, not his health; and (owner, S191) the frenzy NEVER sets or clears a Warlord.
 *   Local only, riding without needing it: Alt toggles the footer exactly as the collapse arrow (owner,
 *   S192); the opaque panels and modals swallow right-clicks (R190-G); `Controls.setModalCover` + the
 *   paired-press latch (S192 A-1); the attack row's frame cadence reads the cycle latch (render only).
 */
```

The facts behind it (kept from S191):
- **New additive-optional field `Creature.rageStartTick`** (serialized only when stamped; restore
  validates a non-negative integer — it does NOT refuse a future stamp, `isOwnRageActive` makes one
  harmless). Rides `snapshot` AND `netSnapshot` (only `targetCreatureId` is trimmed from the mirror).
- **Changed shared rules**: the rage latch (`runWarlordRage`), the BLOOD FRENZY source
  (`isFrenzySource`), and (S191 owner ruling) the frenzy no longer touching a Warlord. Additive-optional
  alone would cost none; the rule change is what earns it.
