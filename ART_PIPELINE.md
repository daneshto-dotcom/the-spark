# SPARK — THE ART PIPELINE (characters, towers, ability VFX)

Written S169, at the owner's request: *"the new protocol moving forward with a video design for new
heroes or new towers or new everything."*

The point of this document is that **generation is the expensive step and everything else is cheap**,
so every rule here exists to stop a clip being paid for twice.

---

## ⭐ THE ONE FACT THAT CHANGES THE ECONOMICS

**The pipeline does not need video. It needs 12 frames.**

`scripts/build-sprite-atlas.mjs` decodes a clip, takes a stride of frames, mattes them, computes one
union bounding box across every state, and packs **12 frames per row**. Everything else in the mp4 is
discarded. A 5-second generation is paying for ~90 frames to keep 12.

Consequences:
- **Image-to-video, never text-to-video.** Seeding from the owner's own still pins the style, so there
  is nothing to re-roll for. The goblins were done this way: *"seeded IMAGE-TO-VIDEO off the owner's
  own character art, so idle, walk and attack are the same character rather than three drawings of
  one."*
- **Short clips are fine.** ~2 seconds is enough for 12 usable frames.
- **Motion can be reused across races.** "The tower rises out of the ground" is one motion; only the
  skin differs. Six bespoke generations buy the same six seconds.

---

## THE STAGES

| # | Who | What |
|---|---|---|
| 1 | **Owner** | Generates the character art — ONE clean image, character only, plain background. |
| 2 | **Claude** | Cuts it out, mattes to transparency, fixes framing, hands back a single reference PNG + one prompt per state. |
| 3 | **Owner** | Pastes reference-image + prompt into the video generator. One clip per state. |
| 4 | **Owner** | Sends the clips back. |
| 5 | **Claude** | `node scripts/check-clip.mjs <clips-dir>` → packs the atlas → wires the renderer → ships. |

⚠ **Stage 5 begins with the checker, never with the packer.** See below.

---

## WHAT TO ASK FOR — how many clips, and of what

**A UNIT** (creature) needs MOTION: `idle`, `walk`, `attack`, `die` — 12 frames each, 4 clips.

**A BUILDING** (tower) needs DAMAGE STATES: `intact`, `damaged`, `destroyed` — plus, ideally, a
`spawning` build-up.

⚠ **These are not interchangeable, and confusing them wastes a whole round.** A three-panel
"healthy / hurt / dead" sheet is a BUILDING sheet. Handing that in for a unit gives you none of the
four things a unit sheet needs.

⭐ **The tier-3 sheets already ship a `spawning` row that no code can draw.** `T3_TOWER_STATE_ROWS`
maps intact→0, damaged→2, destroyed→3 and deliberately skips row 1. The art pipeline authored a build
animation for all six races and the sim never had a way to play it — so the owner's "pulsate, then it
rises out of the ground" cinematic is already half-paid-for.

---

## ⭐ THE PROMPT

One **fixed style block**, one **fixed framing block**, one **action clause** that changes. Do not
re-describe the style per clip — that is where consistency drifts and money leaks.

> `[ACTION CLAUSE]`. Animate the attached character exactly as drawn — same colours, same line
> weight, same proportions. Bold clean cel-shaded 2D game art, thick dark outlines, flat saturated
> colour, no gradients, no photorealism. Pure solid white background, edge to edge. **Fill the entire
> frame — no black bars on any side, no letterboxing or pillarboxing.** Static locked camera, no zoom,
> no pan, no camera shake. Character centred, feet on a constant baseline. **The whole character
> including every limb, tail and effect must stay fully inside the frame at all times, with clear
> margin on all four sides — nothing may touch or cross the frame edge.** Seamless loop, ~2 seconds.

**Action clauses**
- *idle* — breathing, small idle motion, weight shifting, settles back to neutral
- *walk* — side-on walk cycle, moving in place
- *attack* — winds up, releases the strike, returns to neutral
- *die* — staggers, collapses, settles motionless (⚠ NOT a loop)

⛔ **The two bolded sentences are the two failures that cost the Kraken twice.** They are not padding.

---

## ⛔ STAGE 5 STARTS WITH THE CHECKER

```bash
node scripts/check-clip.mjs assets-source/<family>/clips/<character>/
```

It separates the only two questions that matter, because **only one of them is recoverable**:

**PILLARBOXING — recoverable.** Black bars down the left and right. The packer already crops them and
already has a `sampleStart` escape hatch. If the bars are present throughout, nothing to do. If they
**change mid-clip**, the checker prints the exact `sampleStart` to put in the atlas spec — the packer
is documented as NOT handling that case (*"veo's letterbox is fixed for a whole clip"* is false for
such a clip, and averaging then picks a column wrong for both halves).

**EDGE AMPUTATION — not recoverable.** The subject runs off the side of the source frame. Those pixels
were never generated; widening the cell just adds empty space around a limb that ends in a flat
stump. **Regenerate, framed smaller.** This is what happened to the Kraken's tentacles.

⚠ The checker is a REPORT, never a deploy gate. It reads `assets-source/`, which the shipped build
does not. (S165 wired an asset opinion into `npm run build` and the live site sat stale.)

---

## KNOWN TRAPS, EACH PAID FOR ONCE ALREADY

- **veo pillarboxes, and not always consistently within one clip.** Budget a `sampleStart`, not a
  re-roll.
- **The matte is connected-component from the border**, not "white becomes transparent" — enclosed
  white (eyes, highlights) survives. Do not ask for a background that is *nearly* white.
- **ONE union bbox per character**, across every state. A character framed differently in one clip
  makes the sprite grow or hop between states.
- **A `Partial<>` art table means a missing entry is SILENT** — the unit falls through to the green
  procedural puppet. That is what the owner saw as *"this silly goblin warrior"*.
- **Race-keyed sheets are LAZY** (S169). A new race-keyed atlas must be reachable from
  `EAGER_ATLAS_TYPES` or `preloadRaceKit`, or it will never be fetched at all.
- **12 frames is sparse for a large character.** The owner's *"the arch demon looks ridiculous... too
  fast"* is frame sparsity, not a timing bug: measured 12 frames × 5 ticks = exactly 60 ticks against
  an attack cadence of exactly 60. Bosses want more frames, not a slower cadence.

---

## ⛔ AND THE THING NO AMOUNT OF ART FIXES

**No boss skill in this game currently draws anything at all.** Not the zombie rot aura, not Vlad's
life sap, not RAGE, not the direwolf summon, not the Archdemon's take-to-hell or teleport, and not
the Kraken's sonar wave. Every one is mechanically live and visually silent. The stun's "seeing
stars" (S169) is the first derived boss-skill visual in the codebase.

So "ability art" is **two** deliverables per ability, and the second is code: the VFX itself, and a
renderer that draws it from synced state. ⚠ Derive it per frame from world state — a one-shot
`world.effects` push is lost ~5/6 of the time, because effects are sampled into snapshots at 10 Hz
while the renderer wipes them every frame at 60.
