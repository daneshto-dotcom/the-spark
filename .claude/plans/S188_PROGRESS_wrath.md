# S188 P11 · `s188/wrath` — WRATH OF RA (mummies.l10) + the WoW-style skill icon — running progress

Branch starts at racial-c's tip 3b63c92 (POWER OF RA). Updated with every wip commit.

## DONE
- `mummies.l10` WRATH OF RA in `src/state/racialPerks.ts`: union, IDS, mummies row 3rd entry,
  `// ── s188/wrath ──` BUILT block (true), COPY (card `l10-mummies`, art pending), generic
  `perkDraftIndex` (level / 5), `RACIAL_PERK_REQUIRES = { 'mummies.l10': 'mummies.l0' }` read by BOTH
  `racialPerkFor` (offer; new optional `picks`) and `seatHoldsPerk` (holding).
- `src/state/draftEvent.ts`: `autoPickFor` / `pickIsOffered` / `draftOptionsFor` pass the seat's
  picks. `src/render/draftOverlay.ts`: ONE line passes `pl.draftPicks` (⚠ s188/cards also edits
  this file — merge owner reconciles).
- Charges: `Player.raStrike` → `Player.raStrikes: RaStrike[]` (four sites + reset + save + hash);
  `raChargesFor` (3 WRATH / 1 POWER / 0), `raCastsInWave`, `raChargesLeft`, `raStrikesFromWire`;
  reducer prunes earlier-wave strikes then appends; strikes may overlap; charge index seeds the
  pattern (`seat + MAX_PLAYERS × charge`, charge 0 = P6's pattern).
- Icon: `scripts/cut-skill-icon.py`; `public/art/skills/power-of-ra.webp` (128 px, 8.7 KB) cut
  `--top 310 --side 700` from `assets-source/upgrade-cards/l0-mummies.png`.
- typecheck 0; the racial-c suites migrated to `raStrikes` and pass.

- racialPerks.test.ts registry assertions updated (12 → 13; `l10-mummies` card in a PENDING_ART
  set; conditional perks excluded from the no-picks offer check) — 13 green.
- `src/state/racial/wrathOfRa.test.ts` — 15 green: conditional offer for BOTH seats (holder offered
  + deadline takes it; general-at-L0 seat COMING SOON, refused, deadline gives the general), no-picks
  safe default, other races, sandworm-index guard, end-to-end draft; 3 charges + 4th no-op + refill
  next fight + POWER alone still once; per-charge patterns; REACH of three overlapping strikes via
  runHostTick; save round-trip, capped/validated rehydrate, order hashed.
- MUTATIONS (by hand, restored): requirement check removed from seatHoldsPerk → 1 red; WRATH line
  removed from raChargesFor → 3 red.

- FOOTER ICON (`footerBand.ts`): the slot is a 46 px SQUARE showing the skill's picture (Sprite,
  lazy `Assets.load`), edge + WRATH pips on an overlay Graphics above it; ready gold / aiming green /
  refused dimmed grey + reason beneath; name on hover; compact 20 px square beside the collapsed
  tab; sun glyph fallback until the texture loads. WRATH uses `/art/upgrade-cards/l10-mummies.webp`
  (s188/ra-vfx ships it) cut at runtime by `CARD_PICTURE_WINDOW`, falling back to power-of-ra.webp.
  S182 fill count 8 → 9 (the pip). `getUiPoints().raSlot`. Footer suites green, typecheck 0.

- AUDIT F1 DONE: the column's connector sever calls `applySeverBond` directly (not `dispatch`), so a
  caster benched/eliminated mid-strike no longer has the sever refused by the actor gates. Test with
  a LONG connector (shapes outside the circle) — the first draft passed over the bug via shape
  razing; mutating the fix back to `dispatch` now turns 2 tests red.

- AUDIT F4 DONE: `handleRaAimClick` moved one line down in `onDown`, BELOW `handleSheetActionClick`
  (the card's FIX/SCRAP/FEED act while aiming, as with a held tower) and still ABOVE the castle click
  (aiming at your own keep casts). 2 tests; moving the line back turns the FIX test red.

- AUDIT F2 DONE: `src/bots/botRa.ts` `botRaAction` (pure over synced state, total order: most
  column hits on enemy creatures + connector midpoints, tie → nearer own castle → id order; casts at
  ≥ 3 hits, or ≥ 1 in the last ~12 s of the fight; one strike in the air at a time; eval every 30
  ticks phase-spread by seat), called from `BotController.tick` as a castle command. 6 tests through
  runHostTick + a real BotManager; removing the send turns 4 red. Bot + host/worker suites green.

## IN PROGRESS / NEXT
- canon notes (SANDWORM ruled-not-built); gates

## KNOWN-BROKEN
- nothing known (the footer still draws P6's sun button until the icon commit lands).
