# S195 PROGRESS — team-tiles (N19)

**NEXT STEP:** item 2 — prototype side-by-side boards (Playwright on own port) + screenshots to Desktop/SPARK_S195_TeamTiles.

Branch `s195/team-tiles` from master 2ab8e73a (deploy S195-#8, PROTOCOL 69). npm install running.

## Items
1. [x] 29 trio images — identify + judge
2. [ ] side-by-side prototype + screenshots -> Desktop/SPARK_S195_TeamTiles
3. [ ] six-tile Grok prompt sheet -> Desktop/SPARK_Six_Race_Tiles_Prompts.html
4. [ ] tile path behind a manifest (render-only, no bump)

## Item 1 — the 29 trio files (viewed by eye via contact sheets `.tmp-gates/trio/sheet1-7.jpg`)

**He generated in the sheet's card order**: download time (oldest first) matches card 1, 2, 3 … exactly,
verified by eye on every image (NE / SE / SW race read from the terrain: demons = black cracked rock +
violet fissures + ribcage; mummies = amber sand + step pyramids; nagas = teal drowned ruins + wreck;
orcs = rust earth + palisade camp; vampires = misty pine mountains + red glints; zombies = green bog).

| # | file | card (NE · SE · SW) | notes |
|---|---|---|---|
| 1 | qwb0Y | Demons · Demons · Demons | one continuous hell; small drawn quarry disc at centre |
| 2 | Y209P | Demons · Demons · Mummies | good |
| 3 | 7u6BS | Demons · Demons · Nagas | good, nagas a bit faint |
| 4 | Xn4YJ | Demons · Demons · Orcs | good |
| 5 | Cti5A | Demons · Demons · Vampires | good |
| 6 | GIlwP | Demons · Demons · Zombies | good |
| 7 | mTNsB | Demons · Mummies · Mummies | good (one sand sea across the south) |
| 8 | F9nFS | Demons · Mummies · Nagas | good |
| 9 | bxt40 | Demons · Mummies · Orcs | good |
| 10 | gOsXj | Demons · Mummies · Vampires | big drawn disc |
| 11 | b0OyK | Demons · Mummies · Zombies | good |
| 12 | CMK8y | Demons · Nagas · Nagas | good |
| 13 | OsCDw | Demons · Nagas · Orcs | drawn disc |
| — | hqBp3 | (card 14: Demons · Nagas · Vampires) | ⛔ **0-byte file — failed download, card 14 MISSING** |
| 14 | T7xpW | Demons · Nagas · Zombies (card 15) | good |
| 15 | 9vbUs | Demons · Orcs · Orcs (card 16) | ⚠ quarry disc drawn at BOTTOM-centre (on the S seam), not canvas centre |
| 16 | O8ULO | Demons · Orcs · Vampires (17) | drawn disc |
| 17 | 06oWF | Demons · Orcs · Zombies (18) | drawn disc |
| 18 | XFhrY | Demons · Vampires · Vampires (19) | one forest across the south; faint disc low |
| 19 | 00Z0A | Demons · Vampires · Zombies (20) | good |
| 20 | Vafnh | Demons · Zombies · Zombies (21) | good |
| 21 | XEOoT | Mummies · Mummies · Mummies (22) | good |
| 22 | 0nA6Y | Mummies · Mummies · Nagas (23) | good |
| 23 | KHeex | Mummies · Mummies · Orcs (24) | big drawn crater |
| 24 | EeN9B | Mummies · Mummies · Vampires (25) | 1712×1152 (all others 1168×784); big soft disc |
| 25 | oLzl8 | Mummies · Mummies · Zombies (26) | big drawn disc |
| 26 | l5Ren | Mummies · Nagas · Nagas (27) | good |
| 27 | mLOs2 | Mummies · Nagas · Orcs (28) | good |
| dup | mLOs2 (1) | = mLOs2 | byte-identical (md5 607616cc), re-download |

**Summary:** 29 files = 27 usable unique + 1 duplicate + 1 empty. Cards 1–13 and 15–28 done; card 14 and
cards 29–56 (28 more) not generated. **Every image kept the NW quarter plain** (dark, low-detail). Quality is
consistent and on-style; the regions BLEND naturally across the quadrant lines (the thing tiles cannot do for
free). Defects: ~9 images paint a dark "quarry" disc far larger than the game's 72 px portal hole (so a dark
blob would sit around the portal), one (9vbUs) puts it on the south seam; aspect 1168×784 = 1.49 vs the
board's 1.78, so cover-scale crops ~8 % top and bottom.
