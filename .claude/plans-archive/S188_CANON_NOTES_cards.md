# S188 · canon notes from `s188/cards` — for the merge owner to land in `SPARK_CANON.md` §3d

Per the brief, this branch did NOT edit `SPARK_CANON.md` or `src/canon.test.ts`. Below is the text I
would add, each number with its constant and the assertion that should land beside it.

## 1 · Two lines in §3d are now stale

**(a) The table row `racial track | every race is COMING SOON and NOT choosable`** — replace with:

> | racial track | the tile follows `RACIAL_PERK_BUILT` through `draftOptionsFor(wave, race).racial`: a **built** perk is choosable (in the hit-test, hover detail from `RACIAL_PERK_COPY`, sends `'racial'`, draws its card); an unbuilt one — and every race at levels 10+ — is the dimmed COMING SOON tile, **absent from the hit-test** |

**(b) `the panel is 560 × 270`** — the constant says **559**: `PANEL_W = Math.round(PANEL_H * 2.07)`
= `Math.round(558.9)`. The tile it yields is **251 × 242**, which is the number the card art and the
build script are sized to.

Assertions (`src/canon.test.ts`):

```ts
import { PANEL_W, PANEL_H, generalTileRect, draftHitTest, racialTileRect } from './render/draftOverlay.ts';
expect([PANEL_W, PANEL_H]).toEqual([559, 270]);
expect([generalTileRect().w, generalTileRect().h]).toEqual([251, 242]);
// the dead tile is absent from the hit-test; a live one answers
const r = racialTileRect(); const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
expect(draftHitTest(c.x, c.y, { general: 'hp', racial: null })).toBeNull();
expect(draftHitTest(c.x, c.y, { general: 'hp', racial: 'vampires.l0' })).toBe('racial');
```

## 2 · New paragraph for §3d — THE CARDS (S188)

> ⭐ **EVERY TILE DRAWS ITS CARD.** The general tile shows `general-<axis>` (four cards serve every
> level forever); the racial tile shows `RACIAL_PERK_COPY[perk].card` while its perk is on offer.
> The cards ship as `public/art/upgrade-cards/<name>.webp`, **502 × 484** (2× the tile), built by
> `scripts/build-upgrade-cards.py`, and are fetched **lazily** — a slow or missing card leaves the
> tile on its text title; the panel is never blocked on art.
>
> ⛔ **A TILE SHOWING ITS CARD DRAWS NO OVERLAY TITLE** — the name is baked into the art and the two
> collided (MANIFEST's "one wiring decision"). The effect line and the hover detail stay.
>
> ⛔ **`drawAxisGlyph` IS DELETED** — owner: *"just a hand drawn heart that looks gay"*.
>
> ⛔ **`l10-vampires` IS NOT SHIPPED** — level 10 has no mechanic.

Constants and assertions:

| number | constant | where | whose |
|---|---|---|---|
| card URL `/art/upgrade-cards/<name>.webp` | `UPGRADE_CARD_DIR`, `upgradeCardUrl` | `render/draftOverlay.ts` | MINE |
| 502 × 484 | `CARD_W`, `CARD_H` = 2 × tile | `scripts/build-upgrade-cards.py` | MINE (2× for HiDPI, per the brief) |
| WebP q82 | `QUALITY` | `scripts/build-upgrade-cards.py` | MINE |
| 150 KB per-card bound | `MAX_CARD_BYTES` | `render/draftOverlay.test.ts` | MINE (payload sanity; largest shipped is 86.6 KB) |
| idle card tint `0xd2d2d2` | `CARD_IDLE_TINT` | `render/draftOverlay.ts` | MINE (the hovered card lifts to full brightness) |

```ts
import { upgradeCardUrl } from './render/draftOverlay.ts';
expect(upgradeCardUrl('general-hp')).toBe('/art/upgrade-cards/general-hp.webp');
expect(existsSync('public/art/upgrade-cards/l10-vampires.webp')).toBe(false);
```

(`draftOverlay.test.ts` already pins every shipped card's existence, 502 × 484 dimensions, the
≤ 150 KB bound, and that nothing else — no l10, no alternates — is in the folder.)

## 3 · One behaviour change worth a canon line

The panel now also hides when `world.gameState !== 'PLAYING'`. Before S188 it keyed only on
`world.draft` + the seat owing a pick. Only `applyStartGame` and `applyReturnToTitle` clear
`world.draft`, and `tickDraft` returns early outside PLAYING — so IF a match can end (WIN /
POSTGAME) while a draft is open with a pick still owed, the old panel would have stayed painted over
the end screen until the return to title. I did not construct that case end-to-end; the gate is
cheap and pinned in `draftOverlay.test.ts` ("is hidden … on any screen but PLAYING").
