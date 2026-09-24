# S188 · `s188/racial-b` — canon text for the merge owner to land (with its assertions)

Proposed home: `SPARK_CANON.md` §3d, replacing the three racial-b items in "WHAT IS SPECIFIED BUT
NOT BUILT" (zombie kill-to-spawn, demon chewer split, mummy pharaoh-per-1000). Every number below
names its constant; the suggested `canon.test.ts` assertion is under each.

---

### ⭐ THREE RACIALS ARE LIVE (S188): THE RISEN · HELLSPAWN · ENDLESS DYNASTY

**THE RISEN — `zombies.l0`.** *"Every unit you kill is spawned like a one, one, one, one zombie from
the castle."* When one of a zombie seat's RACIAL units — the castle soldier (`raceUnit`), the hound
(`RACE_TOWER_UNIT.zombies`) or the zombie boss (`T9_BOSS_TYPE.zombies`) — kills an ENEMY creature, one
`raceUnit` (R125's 1/1/1/1, pool **6**) rises at that seat's keep through the castle emitter's own
spawn (`spawnRaceUnitAtCastle`). ⛔ A Voltkin, a chewer or a goblin the zombie seat owns does NOT count
(his *"so not like Voltkin or Helga or Pencil Chewers"*). ⚠ MINE: a kill with no creature attacker
(castle gun, raid, area damage) and a raze (the boss's R138 blast) raise nobody; a fallen keep raises
nobody; one corpse struck twice in a tick raises ONE.

```ts
expect(isZombieRacialType('raceUnit') && isZombieRacialType('t3Hound') && isZombieRacialType('t9BossZombies')).toBe(true);
expect(isZombieRacialType('voltkin') || isZombieRacialType('chewer') || isZombieRacialType('goblinMelee')).toBe(false);
expect(unitPoolFifths(RACE_UNIT_HP, RACE_UNIT_DEF)).toBe(6);
```

**HELLSPAWN — `demons.l5`.** *"when a pencil chewer dies, it spawns two more pencil chewers with half
the stats in each … And when those die, each one of those spawn two more with 25% stats each."* A
demon seat's chewer that DIES (lethality decided — ⚠ MINE: ageing out is not dying) splits into
`HELLSPAWN_CHILDREN` = **2** at the death spot; generation 1 at **50 %**, generation 2 at **25 %**
(`HELLSPAWN_PCT_BY_GEN`), and generation 2 splits no further (`HELLSPAWN_MAX_GEN` = **2**) — **at most 6
descendants per chewer**. Pool = floor-at-one(50 % of the parent's pool): **5 → 2 → 1**. Strike =
floor-at-one of the generation's share of the chewer's `attackFifths(1, 2)`: **7 → 3 → 1**. The chewers
and the pentagram are drawn red/black (⚠ MINE, placeholder until he supplies art); a child is drawn
0.8× / 0.62×.

```ts
expect(HELLSPAWN_CHILDREN).toBe(2);
expect(HELLSPAWN_PCT_BY_GEN).toEqual({ 0: 100, 1: 50, 2: 25 });
expect(HELLSPAWN_MAX_GEN).toBe(2);
expect(hellspawnChildPool(unitPoolFifths(CHEWER_HP, CHEWER_DEF))).toBe(2);
expect(hellspawnStrikeFifths({ hellspawnGen: 1 }, attackFifths(CHEWER_ATK, CHEWER_PEN))).toBe(3);
expect(hellspawnStrikeFifths({ hellspawnGen: 2 }, attackFifths(CHEWER_ATK, CHEWER_PEN))).toBe(1);
```

**ENDLESS DYNASTY — `mummies.l5`.** *"every time a castle loses 1,000 points, it spawns a pharaoh …
from now on and until the end of the game."* From the moment the perk is taken, every HP the keep
ACTUALLY loses (after its purchased DEF, and not the overkill of a killing blow — ⚠ MINE) is added to
`Player.dynastyHpLost`; each whole `DYNASTY_HP_PER_PHARAOH` = **1000** raises one Pharaoh
(`T9_BOSS_TYPE.mummies`) at the keep, owned by the seat. One hit crossing two thousands raises two.
Regeneration never un-counts a loss (⚠ MINE). ⚠ MINE, a performance sentinel and never a gameplay cap
(Council A3): `DYNASTY_LIVE_PHARAOH_SENTINEL` = **40** live Pharaohs per seat — past it the Pharaoh is
not born and its 1,000 is still consumed.

```ts
expect(DYNASTY_HP_PER_PHARAOH).toBe(1000);
expect(DYNASTY_LIVE_PHARAOH_SENTINEL).toBe(40);
expect(pharaohsOwed(950, 2100)).toBe(2);
```

⛔ **ALL THREE ARE BORN AFTER THE DEATH SWEEP** (Council A5, `racial/racialTick.ts`'s queue) and are
proven byte-identical host vs `?worker=1` over a full BUILD → FIGHT → BUILD with all three firing
(`racial/racialB.differential.test.ts`).

---

### §6 THE WIRE — two additive-optional fields for the PROTOCOL 50 docblock

- `SerializedCreature.hellspawnGen?: 1 | 2` — emitted only when set; validated on the way in (anything
  but 1/2 is dropped). Hashed (`CreatureHashed` + `:hg`). The joiner needs it: the renderer derives the
  child's size and the demonic look from it.
- `SerializedPlayer.dynastyHpLost?: number` — emitted only when > 0; rehydrated FROM the wire, floored
  and clamped ≥ 0. Hashed (the `pl{seat}:` part, `,dy`).
- Both ride the 49 → 50 bump the substrate took for the racial RULES; neither earns one alone.
