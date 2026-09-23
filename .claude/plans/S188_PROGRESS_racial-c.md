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

## IN PROGRESS / NEXT
- render: refactor `drawRaRitual` column loop into a shared `drawRaColumns`; player strikes +
  aim preview in `drawBossAuras` (`bossAuras.ts`); `src/render/raAimPreview.ts` client-local context
- footer: Ra button left of the chip row (`footerBand.ts`), carry readout shifts left of it; S182
  fill count 6 → 7 in `footerBand.test.ts`
- controls: button → targeting; LMB casts; RMB/Esc cancel (`input/controls.ts`)
- flip `'mummies.l0': true` ONLY after the tests pass; canon notes file; gates; browser look

## KNOWN-BROKEN
- ⚠ IF SALVAGING BEFORE THE UI COMMIT LANDS: `mummies.l0` is choosable in the draft but there is
  NO button and NO targeting yet, so a player could pick it and have no way to use it. Either land
  the UI or revert the one-line flip in `src/state/racialPerks.ts` (and the draft-live test).
