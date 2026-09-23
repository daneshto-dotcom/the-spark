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

## IN PROGRESS / NEXT
- footer: square icon sprite + pips + states; collapsed compact icon; fill enumeration
- canon notes (SANDWORM ruled-not-built); gates

## KNOWN-BROKEN
- nothing known (the footer still draws P6's sun button until the icon commit lands).
