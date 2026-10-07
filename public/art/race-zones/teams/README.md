# Team backdrops

Two kinds of picture live here. Both are the owner's Grok images.

- **Pairs (2v2 / 2v1 / 1v1v2):** `<top>-<bottom>.webp`, 480x540. These are the 36 `{Top}X{Bottom}.jpg` files.
- **Trios (3v1):** `<ne>-<se>-<sw>.webp`, 960x540. Each one is the whole board at half resolution, with its
  NW quarter painted black. The solo player owns NW, and the game never draws that quarter of a trio picture.

## Adding a new trio picture (one line)

1. Work out the card. On `SPARK_Team3_Backdrop_Prompts.html`, card N tells you which race goes NE, SE and SW.
   The races are always in the order demons < mummies < nagas < orcs < vampires < zombies.
2. Transcode it:
   `python .claude/plans/s195-team3-gen/transcode_trios.py C:\Users\onesh\Downloads\<file>.jpg <ne> <se> <sw>`
   This cover-crops the image to 16:9, resizes it to 960x540, blacks out NW and writes
   `public/art/race-zones/teams/<ne>-<se>-<sw>.webp` (WebP q75). Also add the file to the script's `MAPPING`.
3. **The one line:** add `'<ne>-<se>-<sw>'` to `TEAM_TRIO_ART` in `src/render/zoneBackgroundRenderer.ts`.

`src/render/teamTrioArt.test.ts` fails in two cases: a listed key has no file (or the file is not 960x540),
or a trio `.webp` sits here unlisted.

The key is **positional**. The game seats a 3v1 trio NE, then SE, then SW by lobby slot, not by race. A trio
whose races do not stand in the card's order shows today's single-race art with the seams cross-faded.
