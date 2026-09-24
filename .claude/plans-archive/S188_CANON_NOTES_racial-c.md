# S188 canon notes — `s188/racial-c` — POWER OF RA (`mummies.l0`)

For the merge owner to land in `SPARK_CANON.md` §3d (replacing "mummy Power of Ra" in the NOT BUILT
list) WITH the assertions below in `src/canon.test.ts`, same commit. Every number is tied to its
constant; the right-hand column is the assertion to add.

## Proposed canon text (§3d, under the racial track)

### ⭐ POWER OF RA — mummies, level 0 (S188)

> *"once per fight, you can use the power of Ra. So it adds you a skill button … to the left of the
> tier three tower … It gives you a skill to call Ra that hits like the lightning beams from the sky,
> kind of like Pharaoh has. But you get to choose where it lands."* — owner, S187

| | |
|---|---|
| who | a MUMMIES seat whose pick at draft index 0 (pre-wave-1) is `'racial'` |
| when | **FIGHT only, once per FIGHT** (one cast per `waveNumber`; the wave turns on entry into BUILD) |
| the gesture | footer button left of the tier chips → the five circles follow the cursor → click the board. RMB / Esc / a second press cancel |
| the strike | **the Pharaoh's own columns**, re-centred on the aimed point: `RA_COLUMN_COUNT` = 5 columns, one every `RA_COLUMN_TICKS` = 120 ticks (2 s), the first 2 s after the cast |
| each column | `attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN)` = **300 fifths** over `RA_COLUMN_RADIUS` = **70 px** |
| hits | enemy creatures, enemy Helga, enemy shapes (area damage), **and enemy connectors** — a building dies through its connectors (§4) |
| spares | **everything the caster owns** (MINE — the Pharaoh's own columns spare nobody) |
| sunset | a column due after the FIGHT → BUILD edge **never lands** (MINE) |

⚠ MINE, and each is flagged at its code: the landing pattern is seeded by the SEAT (so the preview
under the cursor is exact before the click); the caster is spared; connector severs use
`cause: 'raid'` (player-attributed, no charge, the player-sever SFX); the collapsed footer keeps a
compact 44 × 20 sun beside the tab so the skill survives the collapse.

## Assertions for `src/canon.test.ts`

```ts
import { RA_STRIKE_FIFTHS } from './state/racial/powerOfRa.ts';
import { RACIAL_PERK_BUILT } from './state/racialPerks.ts';
import { RA_COLUMN_ATK, RA_COLUMN_COUNT, RA_COLUMN_PEN, RA_COLUMN_RADIUS, RA_COLUMN_TICKS, PHYSICS_HZ } from './constants.ts';
import { attackFifths } from './state/stats.ts';

expect(RACIAL_PERK_BUILT['mummies.l0']).toBe(true);
expect(RA_COLUMN_COUNT).toBe(5);
expect(RA_COLUMN_TICKS).toBe(2 * PHYSICS_HZ);
expect(RA_COLUMN_RADIUS).toBe(70);
expect(RA_STRIKE_FIFTHS).toBe(attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN));
expect(RA_STRIKE_FIFTHS).toBe(300);
```

## For the PROTOCOL 50 docblock (the merge owner writes it; this branch did NOT touch it)

- **New CLIENT INTENT `CAST_POWER_OF_RA { playerId, x, y }`** — in `KNOWN_GAME_ACTION_TYPES_RECORD`
  and `CLIENT_INTENT_TYPES_RECORD`. A v49 host has no row for it and would drop a v50 joiner's cast
  silently while the host seat's own worked (the 40→41 `UPGRADE_CASTLE_REGEN` precedent). Bench
  `'deny'`, elimination `'deny'`. The host normalises the aim (Council A1): `Math.round` + clamp to
  the canvas, NaN / ±Infinity / non-number / off-canvas → no-op.
- **New serialized field `SerializedPlayer.raStrike?: { wave, x, y, untilTick }`** — additive-optional,
  emitted only once a seat has cast, validated on rehydrate (`raStrikeFromWire`). Hashed in the wide
  oracle's `pl{seat}:` part as `,ra_` / `,ra<wave>,<x>,<y>,<untilTick>`.
- **A new sim rule both peers compute** — the columns land in `runRacialPerksFight` (FIGHT-gated).
  `structuralSignature` needs no term: `raStrike` is only ever written by the intent, and a batch with
  an intent is structural by definition (`workerSim.ts`).
