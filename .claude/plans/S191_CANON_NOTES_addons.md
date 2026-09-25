# S191 CANON NOTES — `s191/addons` (for the merge owner; this branch never edits the canon)

## A-1 · §3e — the Warlord's rage is now a 25 s clock, then a cooldown

**Stale text in `SPARK_CANON.md` §3e once this merges:**

- The BLOOD FRENZY guard paragraph (under "WHAT THE S188 AUDITS ESTABLISHED"): *"a source is a Warlord
  raging by his OWN latch (below `WARLORD_RAGE_TRIGGER_PCT` of his pool)"* — the source is now **his own
  25 s window** (`isOwnRageActive`, off `Creature.rageStartTick`), NOT his health and NOT the bare
  `enraged` bit. The frenzy still only ever SETS a Warlord; only his own latch lowers the bit.

**Proposed canon text (a new sub-paragraph in §3e, beside BLOOD FRENZY):**

> ⭐⭐ **THE WARLORD'S RAGE LASTS 25 SECONDS, THEN "COOLDOWN FIRST" (S191).** *"let's do it like 25
> seconds"* — once his own latch fires (strictly below `WARLORD_RAGE_TRIGGER_PCT` **50** % of his own
> max) he rages for `WARLORD_RAGE_TICKS` = **1500** ticks (25 s) **regardless of healing** — R151's
> heal-above-50 exit is retired (`WARLORD_RAGE_CLEAR_PCT` is kept, unread). Then, *"cooldown first"*: he
> is calm for `WARLORD_RAGE_COOLDOWN_TICKS` = **1500** ticks whatever his health (⚠ MINE — he gave no
> length; 25 s mirrors the rage), and after it, below the line, he rages again at once. Both windows
> derive from ONE stamp, `Creature.rageStartTick`, written only by `runWarlordRage` — serialized,
> hashed, on the wire. ⚠ Stated consequence: nothing heals a Warlord today, so a hurt Warlord
> alternates **25 s on / 25 s off**, and his seat's frenzied orcs with him. Goblins never rage.

**Assertions to land with it in `canon.test.ts`** (derive, never hard-code):

```ts
expect(WARLORD_RAGE_TICKS).toBe(25 * PHYSICS_HZ);
expect(WARLORD_RAGE_COOLDOWN_TICKS).toBe(WARLORD_RAGE_TICKS); // ⚠ MINE until he names a length
expect(canonSays(`\`WARLORD_RAGE_TICKS\` = **${WARLORD_RAGE_TICKS}**`)).toBe(true);
expect(canonSays(`\`WARLORD_RAGE_COOLDOWN_TICKS\` = **${WARLORD_RAGE_COOLDOWN_TICKS}**`)).toBe(true);
expect(canonSays('25 s on / 25 s off')).toBe(true);
```

## A-1 · §6 — the wire (for the merge owner's ONE bump docblock)

- **New additive-optional field `Creature.rageStartTick`** (serialized only when stamped; restore
  validates non-negative integer). Rides `snapshot` AND `netSnapshot` (only `targetCreatureId` is
  trimmed from the mirror).
- **Changed shared rule**: the rage latch (`runWarlordRage`) and the BLOOD FRENZY source
  (`isFrenzySource`). ⛔ Bump verdict: **YES** — two builds that shake hands disagree about when a
  Warlord's rage ends (an old promoted successor would calm him only on a heal above 50 %, i.e. never,
  and would read the frenzy source off his health). Additive-optional alone would cost none; the rule
  change is what earns it.
