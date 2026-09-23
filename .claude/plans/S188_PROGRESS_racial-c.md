# S188 P6 · `s188/racial-c` — POWER OF RA — running progress

Updated with every wip commit. The merge owner can salvage from here if this session is cut off.

## DONE (committed)
- `src/state/racial/powerOfRaRules.ts` (NEW, true leaf): `RaStrike`, `CastPowerOfRaAction`,
  `raCastRefusal` (the ONE predicate: NO_SEAT/NOT_HELD/NOT_PLAYING/ELIMINATED/BENCHED/NOT_FIGHT/USED),
  `raAimPoint` (Council A1: finite, on-canvas, Math.round + clamp; else null), `raStrikeFromWire`.
- `src/state/racial/powerOfRa.ts` (NEW): `applyCastPowerOfRa` reducer, `runPowerOfRa` (racialTick
  slot), `raStrikeColumnPos` (= Pharaoh's `raColumnPos` re-centred, seeded by seat),
  `RA_STRIKE_FIFTHS = attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN)`. Connector arm first, then the
  Pharaoh's `applyRadialDamage` with `sparePlayerId = caster`.
- `Player.raStrike: RaStrike | null` — player.ts type + factory + both carry rebuilds; gameMode.ts
  applyStartGame reset; save.ts SerializedPlayer + serialize (emit when non-null) + deserialize
  (validated); stateHashFull.ts `,ra…` projection.
- `CAST_POWER_OF_RA`: both protocol.ts records, benchGate 'deny', elimination 'deny', world.ts union
  + reducer arm. racialTick.ts racial-c slot filled.
- typecheck green at this point.
- `src/state/racial/powerOfRa.test.ts` — 41 tests GREEN: every reducer refusal as a whole-world
  no-op (19 cases + missing seat + second cast), REACH through `runHostTick` (5 columns × 300 to an
  enemy creature, 0 to own; enemy connector breaks with a 300 hit, own connector 0; a 16-connector
  enemy banks 300; no column lands after FIGHT→BUILD), once-per-FIGHT across two real fights,
  rematch reset, carry FSM, both allowlists + wire parser, bench/elimination deny through dispatch,
  save/net round-trip, absent-when-null, malformed rehydrate, hash per field, 2-run determinism.
- MUTATION TESTS (run by hand, restored): spare `caster`→`null` → 2 red; delete the USED line in
  `raCastRefusal` → 2 red.
- `'mummies.l0': true` in RACIAL_PERK_BUILT (racial-c block only).

- RENDER (verified after the e587460 salvage: typecheck 0, 33 tests green incl. bossAuras +
  Pharaoh ritual suites): `drawRaRitual`'s column loop extracted VERBATIM into `drawRaColumns`
  (Pharaoh behaviour unchanged, pinned by a new regression test); `drawPowerOfRa` draws every seat's
  strike (FIGHT-gated like the sim) + the local aim (5 full-radius circles via raCastRefusal +
  raAimPoint + raStrikeColumnPos); `src/render/raAimPreview.ts` client-local aim context;
  `src/render/powerOfRaRender.test.ts`.

- FOOTER BUTTON (`footerBand.ts`): `layoutRaButton` (left of the chip row; compact 44x20 beside the
  collapse tab when collapsed), `raButtonCaption` (exhaustive), `drawRaButton`, `isOverRaButton`
  asked first in `isOverChip` + `isOverBandSurface` (both states); carry readout anchored left of the
  button (`layoutCarryBill` 3rd param); stale aim dropped in sync; `getUiPoints().ra`. S182 fill
  count 6 -> 8 (plate + sun disc, both hit-tested by isOverRaButton). `footerRaButton.test.ts` drives
  the REAL FooterBand (Pixi constructs fine headless). Footer tests green, typecheck 0.

- TARGETING (`input/controls.ts`): `toggleRaAim` / `handleRaAimClick`; button press aims, board
  click casts at `raAimPoint(cursor)`, RMB / Esc / second press cancel, card + footer surfaces
  swallow while aiming, refused press → refused cue, tower pick drops aim, aim disarms a held tower,
  crosshair cursor. `src/input/controls.powerOfRa.test.ts` (9 green) drives the REAL Controls
  handlers + REAL FooterBand.

## IN PROGRESS / NEXT
- DONE: canon notes (`.claude/plans/S188_CANON_NOTES_racial-c.md`); full gates — TYPECHECK_EXIT=0,
  VITEST_EXIT=0 (347 files / 5699 tests), BUILD_EXIT=0 (925.6 KiB, +5.8 KiB over the 919.8 KiB
  substrate at 87f3dc4, headroom 74.4 KiB).
- NEXT: browser look (dev server on a random port, never 5173)

## KNOWN-BROKEN
- nothing known. The UI has landed, so the flip is no longer ahead of the mechanic.
