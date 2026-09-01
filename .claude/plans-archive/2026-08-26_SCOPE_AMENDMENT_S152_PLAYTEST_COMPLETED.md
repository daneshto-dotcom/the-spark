> ## ⭐ ARCHIVED AT S158 — EVERY ITEM SHIPPED, AND THE FILE WAS LYING ABOUT IT
>
> This amendment sat in `.claude/plans/` marked **IN-PROGRESS** for six sessions after its work was
> done, so every boot's pre-flight announced live plan work that did not exist. Verified at the S158
> boot before archiving:
>
> | | shipped |
> |---|---|
> | A1 goblin tower emits chewers | S152 P2 — the `else` default was replaced by an explicit per-recipe branch |
> | A2 the green-circle hound | S153 P7 — all six FEED outputs have atlas art; `drawGoblin` is a load-failure fallback only |
> | A3 goblins 75% larger | S152 — `GOBLIN_SPRITE_BASE_SCALE` |
> | A4 the title screen under the modal | S152 A4 — pinned by `e2e/modal-layering.spec.ts`, green today |
> | A5 the affordance pass | S152 A5 (title) + S155 P2 (`buttonFeedback.ts`, one shared grammar) |
>
> The S157 handoff also recorded that the review gate's "HELD / NEEDS A HUMAN DECISION" card reads a
> stale snapshot. This file was part of what made that card wrong. Left in the archive, not deleted:
> the diagnoses in it are still the best account of why each defect existed.

---

# SCOPE AMENDMENT — S152 PLAYTEST CORRECTIONS (Rule 16)

Date: 2026-08-26 | Session: S152 | Entry commit: 6fb47af | Tier: **Full**
Trigger: owner playtest of the live build, five defects reported verbatim.
Status: **AWAITING OWNER APPROVAL** — no code written yet.

⚠ Raised as an amendment rather than fixed ad-hoc because the owner's report carries urgency
("it is all broken!"). The URGENCY PROTOCOL is explicit that this makes the scope gate *more*
important, not less. Every item below is already diagnosed empirically, so approval is the only
thing between this and execution.

---

## A1 — THE GOBLIN TOWER PASSIVELY EMITS PENCIL CHEWERS ⛔ MY REGRESSION

Owner: *"goblin tower is passively generating pencil chewers. i think you have made this tower also
have same specs as pentagram... WRONG."*

**The owner's diagnosis is exactly correct.** `hostTick.ts:354` branches the spawner emit as:

```
if (sp.recipeId === 'lightningHub') { …drones… }
else if (world.tick >= sp.nextSpawnTick && underChewerCaps(…)) { …SPAWN chewer… }
```

That `else` **is** the pentagram behaviour, and it is a DEFAULT — so it catches every recipeId that
is not `lightningHub`. My S152 P2 fix made the goblin tower register a spawner for the first time,
and it fell straight into the chewer arm.

FIX: the goblin tower is FEED-ONLY and must emit nothing on a cadence. And the real flaw is the
`else` default itself — a new producing recipe silently inherits chewers. Replace it with an
explicit per-recipe branch so the next recipe added cannot inherit anything by accident.

SIZE: ~1 file, ~20 lines + a test that a goblin tower emits NOTHING over a full cadence window.

---

## A2 — NOT EVERY FEED OUTPUT HAS ART (the "green circle")

Owner: *"you didnt use the most current generated awesome looking goblin but the brevious gay green
circle. MAKE SURE ALL THE COORECT GOBLINS that we have decided on HAVE ACTUALLY BEEN ADDED."*

MEASURED — five of six FEED outputs have atlas art, one does not:

| Shape | Creature | Art |
|---|---|---|
| Dot | goblinSuicide | atlas |
| Line | goblinArcher | atlas |
| Triangle | goblinMelee | atlas |
| Square | goblinShield | atlas |
| **Circle** | **goblinHound** | ⛔ **procedural puppet — drawn in green** |
| Spiral | goblinBat | atlas |

The puppet is the green blob. FIX: generate the HOUND (design PNG → 3 veo clips → atlas) so all six
outputs are real characters.

⚠ SECOND HALF, OWNER TO CONFIRM: the melee and archer atlases are S151-era and were built before
this session's two matte fixes, so they carry the defects those fixes removed. Regenerating them
would put the whole roster at one quality. That is 6 more veo clips — worth it if the owner wants
the roster uniform, skippable if the hound alone closes the complaint.

SIZE: hound = 1 design + 3 clips + 1 atlas + 1 ATLASES line. Optional melee/archer = 6 more clips.
LATENCY: veo is ~100 s/clip at 4 concurrent — the long pole of this amendment.

---

## A3 — GOBLINS 75% LARGER

Owner: *"make all the goblins about 75% larger than they are."*

`GOBLIN_SPRITE_BASE_SCALE` is `PRINCESS_SPRITE_BASE_SCALE / 2` = 0.17. ×1.75 → **0.2975**.

FIX: state it as an explicit constant with the owner's ruling recorded, and keep the derivation
comment honest — it is no longer "half of Helga", it is 1.75× the old half. One line, one test
update if any pins the value.

SIZE: 1 file, ~6 lines.

---

## A4 — THE START SCREEN IS NOT BROKEN THE WAY IT LOOKS, AND THE REAL BUG IS WORSE ⛔ PRE-EXISTING

Owner: *"you broke the starting screen only singleplayer and multiplayer works. when i click bots it
takes me to muiltiplayer - it is all broken!"*

MEASURED ON THE LIVE SITE: clicking VS Bots **does** open the correct VS BOTS overlay. But
`main.ts:1052` calls `botSetupOverlay.setVisible(true)` and **nothing hides `titleScreen`** — so the
whole menu stays drawn underneath the overlay AND its buttons stay `eventMode:'static'`. The
screenshot shows "1 Player / Multiplayer / VS Bots / CODEX" ghosting through the bot rows.

So a click aimed at the overlay, or at what still looks like a live menu, lands on a title button —
and clicking the visible "Multiplayer" really does start multiplayer. Exactly the reported symptom.
NOT caused by this session; the layering has been this way since the overlay was added (S87).

FIX: a modal overlay must hide the title screen (or at minimum disable its interactivity) for its
whole lifetime. Audit the codex and arcade overlays for the same defect — they use the same pattern.

SIZE: ~2 files, ~30 lines + an e2e that asserts the title buttons are non-interactive while a modal
is up (the assertion that would have caught this).

---

## A5 — NOTHING LOOKS CLICKABLE, AND A CLICK GIVES NO FEEDBACK

Owner: *"everything that is clickable doesnt show that it is clickable from the starting screen game
modes to the in-game towers, gatherer upgrades, castle, towers. it all need to either pop out, be
highlighted, make a sound or all at once so we know when we have clicked something and it simply
didnt work or that we also know inherently what is clickable and what is not!"*

WHAT EXISTS TODAY: title buttons alone have `cursor:'pointer'` + a `pointerover` tint of `0xddddee`
— a ~13% lightening, which is close to invisible on a dark plate. Nothing has a PRESS state and
nothing makes a sound. In-game surfaces (footer tower chips, castle panel, gatherer upgrades, the
FIX/SCRAP/FEED popover) are drawn on a raw canvas with hand-rolled hit tests and have no hover
concept at all.

FIX, as one shared treatment so the whole game speaks one language:
1. **Hover** — a clear accent outline + lift, not a 13% tint.
2. **Press** — a visible depress/scale-down on pointerdown, released on tap. This is the half that
   answers "did my click register".
3. **Sound** — one click SFX on accept, a distinct refused SFX when a control is disabled, so "it
   didn't work" is audible rather than guessed.
4. **Disabled** — visibly different from enabled AND from absent (the codebase already has this
   contract in words: a refused control must SAY why; this makes it also LOOK refused).

⚠ THIS IS THE ONLY ITEM HERE THAT IS A DESIGN CHOICE RATHER THAN A DIAGNOSED DEFECT, and it is the
largest. If approved I will deliberate it (3-way Council) before writing it; A1–A4 are mechanical
fixes to measured faults and need no deliberation.

SIZE: the big one. A shared affordance helper + application across ~6 surfaces, ~2 new SFX.

---

## RECOMMENDED ORDER (highest value first, so partial completion still helps)

1. **A1** — a broken core mechanic, and my regression.
2. **A4** — broken navigation; the "it is all broken" report.
3. **A3** — one constant; instant.
4. **A2** — the hound; long veo latency, so start it early in the background if approved with A1.
5. **A5** — the affordance pass; largest, and the only design item.

## ⚠ CONTEXT BUDGET, STATED HONESTLY

Session context is ~72% (YELLOW). A1 + A3 + A4 are comfortably reachable. A2 is mostly waiting on
veo. **A5 is unlikely to fit in this session** — I would rather hand it off with this diagnosis
intact than start it and leave it half-applied across six surfaces. Owner to decide whether to
split it out.

## TESTING (all items)

`npm run build` · `npx vitest run` (2968 baseline) · `npm run e2e:gating` (47 baseline, exit code
read from a redirect, never a pipe) · `npm run verify-deploy`. Plus per item: A1 a cadence test that
a goblin tower emits nothing; A4 an e2e that title buttons are inert behind a modal; A2 a contact
sheet audition before wiring; A3 a live screenshot at the new scale.
