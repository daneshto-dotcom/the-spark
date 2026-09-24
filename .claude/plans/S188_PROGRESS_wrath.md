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

- GATES on cba78b1: TYPECHECK_EXIT=0 · VITEST_EXIT=0 (349 files / 5726 tests) · BUILD_EXIT=0
  (928.2 KiB, +2.6 KiB over racial-c's 925.6; 71.8 KiB headroom). Snapshot file re-written
  content-identically by the suite (benign, as on racial-c).
- BROWSER LOOK (vite :39975, own tab only — the pane is shared with other agents): WRATH seat at
  wave 11 → the picture icon left of chip 3; aim → green edge + AIMING beneath; cast → slot
  {charges 3, left 2}; the second aim's circles show charge 1's own pattern. Server stopped, tab closed.

## STATUS: COMPLETE — see the final report

## S190 — PHASE 2 (fix agent; the merge owner audited the branch, 2 lenses, all confirmed)
Fix ONLY the confirmed findings, one commit each. Not mine (merge owner, train B): PROTOCOL 51 +
docblock (WRATH-L1-01 / W-2), canon text/tests, botRa census note (L1-05), doc rot (L1-07 / W-9).

- [x] MERGE master 5934d3b (deploy #3: ra-vfx + input-layer + canon). Conflicts:
  · `src/render/draftOverlay.ts` — master's render block kept, the pre-cards hunk dropped; W-1 applied
    in the resolution: `DraftOverlayDeps.optionsFor` + the private field widened to
    `(waveNumber, race, picks?: readonly DraftPick[])`, called with `pl.draftPicks`.
  · `src/state/save.ts` — imports only: master's castleUpgrades line + `raStrikesFromWire` (W-8).
  · NOT a textual conflict but a compile break: master's `src/render/raStrikeArt.test.ts` (ra-vfx)
    read `Player.raStrike` twice → `.raStrikes[0]!` / `toEqual([])`, as its own MERGE NOTE said.
  · Hotspot hunks: save.ts (import line only).
  · Gates on the merge: typecheck 0; vitest 1 (2 red): `canon.test.ts` §3d/§3e registry (MERGE OWNER's,
    red by design — WRATH OF RA has no §3e row yet) and draftOverlay cards-on-disk 16→17 (W-3, next).
- [x] W-1 / WRATH-L1-02 TEST — `draftOverlay.test.ts` "S190 W-1": the REAL DraftOverlay, no
  `optionsFor` injected, mummies seat at wave 11: ['racial','def'] → WRATH tile live ('RA × 3', no
  mark), click sends 'racial'; ['hp','def'] → COMING SOON, racial tap sends nothing, general sends
  'atk'. MUTATION (by hand, restored): dropping `pl.draftPicks` from `this.optionsFor(...)` → 1 red.
- [x] W-3 / WRATH-L1-03 — `draftOverlay.test.ts` cards-on-disk: ra-vfx's `AHEAD_OF_THEIR_PERK` allowance
  + its `expectedShipped` union DELETED; the count is DERIVED (`GENERAL_PICKS.length +
  RACIAL_PERK_IDS.length` = 17 now, 18 with swarm), shipped == referenced exactly, `l10-mummies`
  asserted referenced. `racialPerks.test.ts`: the S188 P11 `PENDING_ART` skip deleted (the source PNG is
  on master). Both files 68/68 green.
- [x] W-4 / WRATH-L1-04 — the joiner's preview could show charge 0's pattern while the host landed
  charge 1's. Client-side only, NO wire field, the shared rule untouched: `src/render/raAimPreview.ts`
  keeps the casts this client has SENT and not yet seen synced (keyed to its World, seat and wave;
  clears on catch-up, a wave change, or `RA_PENDING_TIMEOUT_TICKS` = 90 synced ticks ⚠ MINE, so a
  cast the host refused frees its charge). `raCastsInWaveLocal` / `raLocalCastRefusal` /
  `raChargesLeftLocal` are read by the aim preview (`bossAuras.ts`), the footer slot (`footerBand.ts`)
  and the gesture (`controls.ts`, which notes the cast BEFORE dispatching). `raCastRefusal` (the
  reducer's) is unchanged. Docblocks at powerOfRa.ts:73-76 and bossAuras.ts corrected.
  Tests (`controls.powerOfRa.test.ts`, a joiner rig whose dispatch only SENDS): the second aim's
  circles == the host's index-1 strike; pips 3→2 at once; three unsynced casts → USED + refused cue;
  a never-applied cast expires at 91 ticks. MUTATION: removing `noteRaCastSent` → 3 red. The first
  cut leaked a record from one test's World into the next (`controls.draftPanel.test.ts` went 19 red)
  — hence the World key.
- [x] WRATH-L1-06 — `src/bots/botRa.ts`: each candidate family is ordered by squared distance to the
  bot's castle anchor, then id (total order), BEFORE the `BOT_RA_MAX_CANDIDATES` slice (was: ids
  ascending = the 64 oldest). Every enemy still counts as a hit. Test (`botRa.test.ts` S190 L1-06,
  through runHostTick + a real BotManager): 66 older lone enemies on a 145 px grid far away + 8 newer
  stacked beside the castle (not among the 64 oldest — asserted) → the strike lands on the cluster.
  MUTATION (restored): ordering by id first → red (aimed 355 px away). The census note (L1-05) is the
  merge owner's — the scan form is unchanged.
