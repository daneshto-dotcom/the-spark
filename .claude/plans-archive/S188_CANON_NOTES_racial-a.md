# S188 · `s188/racial-a` — canon text for the merge owner to land (with its assertions)

Branch `s188/racial-a`. Nothing here edits `SPARK_CANON.md` or `src/canon.test.ts`; each block below
is proposed text plus the constant it must be pinned to, so it can land in one commit with its test.

Suggested home: canon §3d, replacing the "**The substrate carries them; none of the mechanics exist.**"
sentence for these six perks, and a one-line addition to §2's rage note.

---

## Proposed canon text — §3d "THE RACIALS THAT ARE BUILT" (racial-a's six)

| perk | name | what the code does | constants (pin these) |
|---|---|---|---|
| `vampires.l0` | BLOOD DEBT | Every creature the seat owns heals `max(1, floor(hit × 20 / 100))` fifths of every hit that LANDS — on a creature, a connector (building), a lone shape, a stink bag, Helga or a castle — capped at its own `creatureMaxEhp`. The hit is the amount SWUNG (overkill included; for a castle, before castle DEF): the number the floater prints. A tower swing, a fallen castle, a channelling Pharaoh, a corpse, a dead attacker: no heal. | `BLOOD_DEBT_LIFESTEAL_PCT = 20` (owner) — `src/state/racial/lifesteal.ts` |
| `vampires.l5` | CRIMSON TIDE | The rate becomes 50 %. It REPLACES 20 (a seat with both is at 50, and L5 without L0 is also 50). | `CRIMSON_TIDE_LIFESTEAL_PCT = 50` (owner) |
| `orcs.l0` | BLOOD FRENZY | While any of the seat's Warlords is raging BY HIS OWN LATCH (enraged AND below `WARLORD_RAGE_TRIGGER_PCT`), every ORC RACIAL creature of that seat — `raceUnit`, `t3Warband`, other Warlords — is enraged (×2 move, ×2 attack). ⛔ Goblins pass ownership and FAIL the type test: they never rage, never tint. The frenzy only ever SETS a Warlord; only his own latch calms him. Direwolves are not orcs (MINE). | none new — `WARLORD_RAGE_MULTIPLIER` (2), `WARLORD_RAGE_TRIGGER_PCT` (50) |
| `orcs.l5` | THE HORDE GROWS | That seat's `goblinTower` spawners hold 20 live goblins instead of 10 (raised, never removed; the global 200 is untouched); its castle emits its race unit every 15 s instead of 30, same phase (every 30-s tick is also a 15-s tick). | `HORDE_GOBLIN_MAX_PER_SPAWNER = 20`, `HORDE_CASTLE_EMIT_SPEEDUP = 2` (owner) — `src/state/racial/hordeGrows.ts` |
| `demons.l0` | SCORCHED GROUND | Every ENEMY creature with `zoneOf(pos) === zoneOwner(seat)` takes 1 fifth on the zombie-aura cadence at 20 per-mille — 2 % of its own pool a second, ~50 s to burn anything down. FIGHT only; the quarry never burns; attacker `null`, source `'aura'`. The zone backdrop is washed ember (MINE, placeholder). | `SCORCHED_GROUND_PER_MILLE = 20` (owner) — `src/state/racial/scorchedGround.ts`; `SCORCHED_ZONE_TINT = 0xff6a3a` (MINE) |
| `nagas.l0` | DEEP CURRENT | The HAULING leg is a snap: one tick after the claim the gatherer stands on its deposit point, the shape banked. The outbound walk is unchanged. A swirl opens at both ends, derived from the jump. | `DEEP_CURRENT_JUMP_PX = 200` (MINE — render threshold) — `src/render/gathererRenderer.ts` |

## Proposed canon text — §2 / rage (a correction, not a new rule)

> ⛔ **S188 — RAGE HALVES THE WHOLE SWING, NOT ONLY ITS END.** From S168 until S188 an enraged
> creature NEVER LANDED A BLOW: rage halved `attackCadenceTicks` (60 → 30) and left `attackFireTick`
> at 30, so the FSM left ATTACKING at tick 30, one tick before `hostTick`'s `=== attackFireTick`
> fire check. `ragedFireTick(fireTick, c)` (`creatures/creature.ts`) now halves the fire tick too,
> read at the `hostTick` fire check and the FSM's `targetGoneEarly`. Measured on a 20-connector
> building over 600 real ticks: t3Warband 162 → 324, raceUnit 54 → 108 (before the fix: 0).

Pin: `ragedFireTick(GOBLIN_ATTACK_FIRE_TICK, { enraged: true }) === 15` and
`< Math.round(GOBLIN_ATTACK_CADENCE_TICKS / WARLORD_RAGE_MULTIPLIER)`.

## Suggested `canon.test.ts` assertions (same commit as the text)

```ts
import { BLOOD_DEBT_LIFESTEAL_PCT, CRIMSON_TIDE_LIFESTEAL_PCT, lifestealFifths } from './state/racial/lifesteal.ts';
import { HORDE_GOBLIN_MAX_PER_SPAWNER, HORDE_CASTLE_EMIT_SPEEDUP } from './state/racial/hordeGrows.ts';
import { SCORCHED_GROUND_PER_MILLE } from './state/racial/scorchedGround.ts';
import { ragedFireTick } from './state/creatures/creature.ts';
expect(BLOOD_DEBT_LIFESTEAL_PCT).toBe(20);
expect(CRIMSON_TIDE_LIFESTEAL_PCT).toBe(50);
expect(lifestealFifths(20, 20)).toBe(4); // his example: "20 a hit … healed by 4"
expect(lifestealFifths(1, 20)).toBe(1); // floor-at-one
expect(HORDE_GOBLIN_MAX_PER_SPAWNER).toBe(20);
expect(HORDE_CASTLE_EMIT_SPEEDUP).toBe(2);
expect(SCORCHED_GROUND_PER_MILLE).toBe(20);
expect(ragedFireTick(GOBLIN_ATTACK_FIRE_TICK, { enraged: true })).toBe(15);
```

## For the PROTOCOL docblock (49 → 50, substrate) — racial-a's reasons

No new serialized field, no new discriminant, no hash-projection change on this branch. Sim RULES
both peers compute (the S186 "can two builds that shake hands disagree" test):
1. lifesteal in `damageEntity` / `damageConnector` (`damageConnector` gained a required `attacker`);
2. BLOOD FRENZY writing `Creature.enraged` on orc racial creatures;
3. `ragedFireTick` — an enraged creature's fire tick halves (a pre-existing S168 defect, fixed);
4. per-seat goblin-tower cap 20 and castle emit interval 900 ticks;
5. SCORCHED GROUND zone DoT;
6. DEEP CURRENT gatherer snap.
