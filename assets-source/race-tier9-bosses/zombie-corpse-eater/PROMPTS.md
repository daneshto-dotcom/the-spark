# CORPSE EATER — generation prompts (zombie boss, the Whopper)

**Seed image for every one of these:** `SPARK-zombie-boss-idle-transparent.png` (on the desktop).
Attach it every time. The pipeline is image-seeded, never text-only — that is what stops the
character drifting between sheets.

**Why three sheets instead of two.** A seamless loop can only be judged inside ONE image. Your last
pair mixed the crouch-down, the feeding and the stand-up across two sheets, and the frames that did
not transition cleanly were exactly the ones that straddled the boundary. Sheet 2 below is the only
one that has to loop, and it loops within itself.

---

## THE FIXED BLOCKS — paste these into all three, unchanged

> **STYLE.** Animate the attached character exactly as drawn — same colours, same line weight, same
> proportions, same scale. Bold clean cel-shaded 2D game art, thick dark outlines, flat saturated
> colour, no gradients, no photorealism, no new details invented. Pure solid white background, edge
> to edge.
>
> **SHEET.** One image laid out as a uniform grid, **8 columns × 3 rows = 24 frames**, read left to
> right, top row first. Every cell exactly the same size. No gutters, no borders, no numbering, no
> captions, no drop shadows outside the character.
>
> **FRAMING — this is the part that failed last time, so it is strict.** Static locked camera. No
> zoom, no pan, no camera shake. The character is the same size in all 24 frames and stands on a
> constant baseline. **The character must occupy about 75% of the cell height and must never touch
> any edge of its cell — leave clear empty margin above the head, below the feet, and on both
> sides, in every single frame.** Nothing may be cropped: not the head, not a claw, not a strand of
> slime. If a pose would reach an edge, draw the character smaller rather than cropping it.

⛔ **The two bolded rules are the two defects measured in your last sheets.** 22 of 24 frames on the
second sheet touched a cell edge, and five of them touched the TOP — which is where his head gets
cut off. And the subject there was 177–250 px against a shipped boss atlas of 245–293, so he would
have visibly changed size the moment the skill fired.

---

## SHEET 1 — `crouch-in` · one-shot, 24 frames

> **ACTION.** A huge bloated zombie drops to all fours to feed. Frames 1–4: standing, he notices the
> corpse pile at his feet. Frames 5–14: he bends and lowers, spine curling, both arms reaching down.
> Frames 15–22: hands land on the pile, knees fold, he settles into a deep hunched crouch. Frames
> 23–24: settled, both claws on the meat, head lowered toward it, holding still.
>
> **⛔ CONTINUITY: frame 24 must be the exact pose that frame 1 of the feeding loop starts from —
> deep crouch, both claws on the pile, head down.** This sheet does NOT loop; it is a one-way
> movement that ends in the feeding pose and holds there.

---

## SHEET 2 — `eat-loop` · ⛔ THE SEAMLESS LOOP, 24 frames

This is the one that matters. It plays roughly three and a half times inside the eight seconds.

> **ACTION.** A huge bloated zombie crouched on all fours over a pile of corpses, feeding in a
> frenzy. He stays in the SAME deep crouch for all 24 frames — the body never rises, the feet never
> move, the camera never moves. Only the arms, the head and the jaw work. One claw grabs from the
> pile and shoves meat into the mouth while the other claw digs; then they swap; then both feed at
> once; then both dig. The jaw chews continuously throughout. Gore and green slime drip from the
> mouth and the meat.
>
> **⛔ THIS MUST LOOP SEAMLESSly: frame 24 flows straight back into frame 1 with no jump.** The pose,
> the arm positions and the head angle in frame 24 must lead naturally into frame 1. Treat frames
> 1 and 24 as neighbours. The pile of corpses on the ground stays the same size and in the same
> place in every frame — it does not shrink, grow or move.

---

## SHEET 3 — `stand-and-burp` · one-shot, 24 frames

> **ACTION.** A huge bloated zombie finishes feeding and rises. Frames 1–4: still deep in the crouch,
> last mouthful going in. Frames 5–14: he slowly stands, spine unbending, arms coming up off the
> ground, belly swollen and dripping. Frames 15–19: standing hunched, chest swelling, jaw
> tightening — the build-up. Frames 20–24: a huge open-mouthed BURP, jaw wide, a blast of chewed
> meat and green slime erupting outward and splattering down.
>
> **⛔ CONTINUITY: frame 1 must be the same deep-crouch pose that the feeding loop's frame 1 is in**,
> so the loop can cut to this sheet at any moment. This sheet does NOT loop — it is a one-way finish
> and frame 24 is the last thing the player sees.
>
> ⚠ Even at full burp, the spray must stay inside the cell with clear margin. Draw him smaller if
> that is what it takes — a spray clipped at the frame edge is the one defect that cannot be fixed
> afterwards.

---

## After you send them back

I run `node scripts/check-clip.mjs` first, then pack. ⛔ These pack as **extra rows in the existing
`t9boss-zombies` atlas**, not as a separate file, so all his states share one union bounding box and
he cannot change size when the skill fires.

**Timing, already worked out:** 8 s = 480 ticks at the shipped 5 ticks/frame (12 fps) = 96 frames of
playback. `crouch-in` 24 → `eat-loop` × ~2.6 → `stand-and-burp` 24, with the finish scheduled to END
at 8.00 s so the burp always lands on the last frame.

⚠ And the mechanic needs a renderer as well as art: no boss skill in this game currently draws
anything, and a one-shot effect push is lost ~5/6 of the time — it has to be derived per frame from
synced state.
