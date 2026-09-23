# S188 canon notes — `s188/wrath` — WRATH OF RA (`mummies.l10`), the skill icon, and the SANDWORM

For the merge owner to land in `SPARK_CANON.md` §3d with the assertions below in `src/canon.test.ts`,
same commit. This branch did NOT edit the canon, `canon.test.ts` or `PROTOCOL_VERSION`.

## 1 · WRATH OF RA — mummies, level 10 (draft index 2, wave 11) — BUILT

> *"at level 10, they will have the power of Ra, but times three. So you can use it three times per
> fight phase, just by clicking the skill on the bottom left … It's only if you've chosen Power of
> Ra level zero, you can upgrade it to Power of Ra level three … you can choose where it lands … it
> lands in an area, in the same area of attack, and just does those multiple beams, just like the
> Pharaoh does before he dies … damages everything between structures and creatures … we already
> have the damage stats for it."* — owner, S188

| | |
|---|---|
| offered to | a MUMMIES seat whose level-0 pick was `'racial'` (it holds POWER OF RA) — `RACIAL_PERK_REQUIRES` |
| what it changes | ONE number: **3 casts per FIGHT** (`WRATH_OF_RA_CHARGES`), refilled every fight |
| each cast | exactly POWER OF RA's strike: 5 columns × `attackFifths(15,15)` = 300 fifths, 70 px, one every 2 s |
| overlap | the three may be in the air at once (⚠ MINE — refusing a cast while one falls would read as a broken button) |
| pattern | seeded `seat + MAX_PLAYERS × charge`; charge 0 is POWER OF RA's pattern exactly (⚠ MINE) |
| bots | a bot WRATH seat casts all three, one strike in the air at a time (⚠ MINE, audit F2) |

## 2 · ⛔ THE SANDWORM — mummies, level 10, for a seat WITHOUT Power of Ra — RULED, NOT BUILT

> *"if the mummies did not choose Power of Ra level zero then instead at level 10 they will receive
> something else completely, which is a sandworm … Just record it for now and don't implement that
> part yet."* — owner, S188

His description: a **tier-4 tower that spawns an underground sandworm**. The worm is **untargetable
except when it surfaces to strike**, and it is **visible by the ground moving above it**. Art pending.

⚠ **STATE TODAY:** no perk id exists for it. A mummies seat that took the GENERAL at level 0 sees the
level-10 racial tile as **COMING SOON** and cannot take it (`racialPerkFor` → null, `pickIsOffered`
refuses, the deadline gives the general). `seatHoldsPerk(…, 'mummies.l10')` checks the requirement too,
so the day the sandworm ships, a racial pick at index 2 without POWER OF RA can never read as WRATH.

## 3 · THE SKILL SLOT — the WoW icon

> *"the skill has to have the art of the picture, just like a lot smaller, right? It's like a little
> square. Just like … World of Warcraft? You can see your skills in like little squares on the bottom
> left."*

- A 46 px square left of the tier chips (20 px beside the tab when the footer is collapsed).
- POWER OF RA shows `public/art/skills/power-of-ra.webp`: `l0-mummies.png` cut at x 277..977,
  y 310..1010 (below the baked title band) → 128 px WebP, by `scripts/cut-skill-icon.py --top 310 --side 700`.
- WRATH OF RA shows `public/art/upgrade-cards/l10-mummies.webp` (shipped by `s188/ra-vfx`), cut to the
  same picture window at runtime; until it exists, the POWER OF RA picture.
- Ready: full colour, gold edge · aiming: green edge · refused: dimmed grey + reason beneath
  (FIGHT ONLY / USED / BENCHED / OUT) · the name on hover · WRATH: one pip per charge, lit while unspent.

## Assertions for `src/canon.test.ts`

```ts
import { RACIAL_PERK_BUILT, RACIAL_PERK_REQUIRES, perkDraftIndex } from './state/racialPerks.ts';
import { WRATH_OF_RA_CHARGES } from './state/racial/powerOfRaRules.ts';

expect(RACIAL_PERK_BUILT['mummies.l10']).toBe(true);
expect(perkDraftIndex('mummies.l10')).toBe(2);
expect(RACIAL_PERK_REQUIRES['mummies.l10']).toBe('mummies.l0');
expect(WRATH_OF_RA_CHARGES).toBe(3);
```

## For the PROTOCOL 50 docblock (the merge owner writes it)

- `SerializedPlayer.raStrike?` (racial-c) is **replaced** by `SerializedPlayer.raStrikes?: RaStrike[]`
  (at most 3, cast order, emitted only when non-empty, entries validated and capped on rehydrate).
  Wide hash: `,ra_` or `,ra<w>,<x>,<y>,<until>;…` in cast order. Neither shipped, so one field in 50.
- `CHOOSE_DRAFT.pick = 'racial'` now also means WRATH OF RA at draft index 2 for a seat holding
  `mummies.l0` — a new sim rule both peers compute (the offer and the charges), inside the same 50.
- No new intent, no new discriminant.

## Audit fixes applied on this branch (from the racial-c audit)

- **F1** — a column's connector sever is resolved inline (`applySeverBond`), so a caster benched or
  eliminated mid-strike still breaks what the column drained.
- **F2** — bots cast (`src/bots/botRa.ts`).
- **F4** — aiming yields to the character card's FIX / SCRAP / FEED, like a held tower.
