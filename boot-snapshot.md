# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-13 | Session: S175 | LIVE + verified 4/4 | PROTOCOL 46

## Next Steps

1. **P7 — THE ATLAS DEBT.** NOT APPROVED yet; explained to him in plain language at S175 close.
   9 sheets carry a one-pixel pale HALO (a matte problem, $0 to fix). 6 more have rows that
   disagree about WIDTH — a POSE difference, measured twice, NOT fixable by scaling.
   ⚠ The tool is NOT `scripts/matte-*.py`. The real matte is embedded python in
   `build-sprite-atlas.mjs:203-286` and has **no tighter-edge knob** (hardcoded erosion at :284),
   so P7 = ADD the knob, then re-cut and eyeball 9 sheets.
   ⭐ The prize is `atlas-guard` going GREEN — it has been red since S171, and a permanently red
   job is where a real failure hides.
2. **THE TV's DESTRUCTION BEAT.** tv-4-critical and tv-5-explosion are flattened in
   `assets-source/voltkin-tv/` and deliberately NOT in the atlas. Frame-driven and client-local,
   copying `TOWER_CRUMBLE_FRAMES` / `crumbleFrameIndex`.
3. **THE WARLORD'S CADENCE TEST.** Movement is behaviourally proven; the attack cadence is pinned
   by arithmetic only. Needs a driven-FSM harness.
4. **GENERAL + GOBLIN TOWER ART** — he will generate it. Connector hiding then covers each with
   ONE `markTowerCover` call at its sprite commit; nothing else changes.
5. R173-B · B7+B8 damage numbers · Pharaoh stances + Ra · Vlad life-sap · NONET stages.

## Blockers

- **P7 needs his word.** Everything else in the batch is done.
- **Voltkin attack + die** need $2.00 of re-rolls at the REAL rate (~$3.10/clip). ⭐ voltkin/walk
  does NOT — it is recoverable at $0 (frames 36-71 clean, `sampleStart:36 + sampleWindow:36`).
- **`ART_VEO_PROTOCOL.md` is STALE and it costs money**: its S173 table condemns `direwolf/walk`
  (measures a clean PASS today) and §5's cost table is ~5x low. Fix before any generation run.

## Recent Reflexion (S175)

## S175 (2026-09-13) — the Warlord finished, the TV became a building, the cutscene went, and three packer defects that every gate passed were caught by opening a PNG.
- P1 #the-backlog-said-owed-and-the-tree-said-shipped: the 2x MOVE speed had been wired since S168.
- P1c #he-asked-for-the-half-i-had-not-planned: "so he LOOKS like he attacks two times faster" — the
  cadence divide existed, the animation frame rate did not, so the swing was being cut off mid-frame.
- P2b #the-contact-sheet-caught-what-no-gate-could: mixed canvas sizes, a still with no standing
  frame 0, and a corpse cut from the DARK sheet the near-white matte could not lift. Three defects,
  green typecheck, green suite, unchanged check:atlas. Only LOOKING found them.
- P2c #the-first-correct-fix-was-still-wrong: exempting a still from normaliseStateScale fixed the
  inflation and caused the exact opposite failure.
- P6 #the-only-test-i-wrote-caught-the-only-bug-i-shipped: lazy flip detection in the alpha getter
  made the ramp read-order dependent — a shape would phase in AS YOU LOOKED AT IT.
- P4b #the-thing-he-said-stops-the-game-never-stopped-the-game: no tick gate exists anywhere; it was
  an opaque rectangle plus an input lock on the summoner only.
- MCV #i-wrote-verification-[]-again-and-my-own-memory-file-warns-about-it: six priorities closed
  with zero assertions; the Stop hook hard-failed with the S149 fabrication class.
- COST #the-7-dollars-was-agent-spend-not-art-spend: zero veo/imagen calls all session.

## Muscle memory (auto)

- **A Pixi tint is a MULTIPLY** — `0xff0000` makes a dark sprite BLACK. Wash it first (S151/S152).
- **A pre-matted still packs inside a black box.** The matte keys near-WHITE; shipped building
  stills are RGB on 254-white. Match that contract.
- **`ignitedAtTick` is STRIPPED on the wire** and re-seeded per snapshot — never anchor a ramp on it.
  `Bond.createdTick` / `Primitive.createdTick` are required and serialized.
- **Reconcile per-frame renderer state at the FRAME BOUNDARY, not on read.**
- **MCV diff-binding needs an ABSOLUTE path**; a relative one passes as an assertion and still fails.
- **Author `verification[]` AT priority close, and grep every needle before asserting it.**
- Shared bundle checklist:
  - [x] boot-snapshot.md (this file)
  - [x] latest HANDOFF: `HANDOFF_S175_2026-09-13.md`
  - [x] `.claude/plans/S175_BATCH_PDR.md`
