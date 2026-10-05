# S195 CLOUD DISPATCH LOG — continuation run on Claude Code cloud, 2026-10-05

**For the desktop merge owner on Saturday: READ THIS FIRST.** The owner opened this run while his desktop S195 session
was paused on the weekly limit (R195-0g had landed ci-perf as deploy S195-#5 `7ceae8eb`; `s195/teams` and `s195/lag`
were still in flight on the desktop and were NOT touched here — their file sets were declared off-limits in
`S195_CLOUD_AGENT_RULES.md`).

- Integration branch: **`ccr-26eaab43-fa9mg3`** (origin). It branches from master `f1ff4c6b` (the Pitch Masters
  Hebrew catch-up commit, = origin/master at 06:14 UTC 2026-10-05). Every tree that lands here is merged into it ONE AT
  A TIME with gates between, as the desktop integrator does on master. **Nothing on this run touches `master`.**
- Each landed tree is a merge commit `merge(s195/<tree>)` on the integration branch, so `git log --merges` lists them.
- Trees run here (owner's queue after ci-perf/teams/lag; see `S195_BACKLOG.md` §A and `S195_OWNER_RULINGS.md`):
  rules-2 (T25 + B-9/B-25/B-30/B-31 + N11) · fixes (T22 + B-17/B-18/B-19) · coherence-2 (T19 + N4 + sound slots) ·
  ui-4 (T18 + N5 + N14) · nonet-home (T13, report only) · then controls-macros (N6) · info-ui (N7 + N12 UI) · net-mp (T20).
- Environment caveats: Playwright runs on the container's Chromium 1194 (symlinked into the 1223 slot Playwright 1.60
  expects); no live relay network is assumed. Full e2e lanes on the desktop remain the final verdict.
- Bump verdicts are REPORTED per tree below; the bump itself (six sites + canon §6 + CLAUDE.md) is applied once on the
  integration branch by this run's merge owner before the final push, and is listed here.

## LANDED (on the integration branch)
- **L1 `s195/nonet-home` (T13)** — merge b07b038, docs only (2 files, no src, no gates owed). Report: `.claude/plans/S195_NONET_HOME_OPTIONS.md` — recommends Option B "Home + campaign" inside the arcade (`src/nonet/`, ~5–7 agent-days, no bump, match trial untouched); 10 owner questions in its §d. Nothing built — the owner picks.
- **L2 `s195/ui-4` (T18 + N5)** — tip 5c4f0d32, merge 03495d4b, no conflicts. Independent audit: 1 MED (footer collapse tab was a bare `'rest'` with no hover/press while `controls.ts:641` hit-tests it first — the census vouched for it at file level) + 1 LOW (seatRack CENSUS-REACH marker backed by a vacuous test) → fix round, delta re-audited by the merge owner. Content: `uiPressCensus.test.ts` (mechanical: every SKINNED row must carry a verified press mechanism; bare-`'rest'` controls fail unless exempted with a reason), press wired on all 10 `attachChipHover` sites + castle panel rows/slots/tiles + draft tiles + collapse tab; `uiSkinCensus.reach.test.ts` CENSUS-REACH markers + new codex/draft REACH; R81 `HOVER_GROW` 2→0 (⚠ MINE: drawn rect ⊆ hit rect; alternative = grow the HIT with the picture). NO bump (render-only). Merged-tree gates: tc 0 · build 0 **1184.7 KiB (65.3 headroom)** · full vitest exit 0 (8800 passed / 12 skipped, 580 files, --maxWorkers=1 on the loaded box). Branch e2e (Chromium 1194): 14/15, the 1 red = `feed-tower.spec.ts:218` console `ERR_CERT_AUTHORITY_INVALID` from the relay WSS through the proxy → environment, expect green on the desktop. SEAMS for other trees (full hunks at the top of `S195_PROGRESS_ui-4.md`): characterSheet press latch (info-ui tree) · matchBoard press latch (info-ui) · `main.ts` HUD gear press (merge owner) · settingsOverlay `:active` CSS (desktop lag tree) · botSetupOverlay docblock text (desktop teams tree) · hover-highlight PROPOSAL (owner: ring vs glow; hover rule = click rule).
- **L3 `s195/fixes` (T22 + B-17/B-18/B-19)** — tip ab2b16f9, merge 70fff9eb, no conflicts. Independent audit CLEAN (verified by RUNNING: ffa golden moved for the `:le` hash string only — merged tree minus the `:le` part is byte-identical to BASE at all 86 checkpoints; C5 four-seat harness unchanged; freshStructurePos bounded by `isLegalBuildPos`/`canBuildAt`). Content: botFix cap 60→150 s (measured 18.7 s alone / 79 s under 8-tree load); `e2e/worker-heap.spec.ts` metric = CDP heap-snapshot live size on MAIN (Σ self_size), `GROWTH_LIMIT_MB` 10 kept, `SETUP_AND_SAMPLES_MS` 240→300 (soak budget 56.0 ≤ 58 min re-derived); `SeatMatchStats.lostToEntropy` (writer `recordEntropyLoss`, wire `le` absent at zero, wide-hash `:le{n}`, recorded in `applyEntropyTax` as each seat's standing-bond delta so a split's deleted chunk counts) — NO bump (inert, nothing in the sim reads it); bots: `entropyAwareness` NOOB none / MID towers / HARD+IMBA all, `entropyMaxConnectors` DERIVED from `entropyBreakEvenConnectors(lossPerFight)` (⚠ MINE per personality: BALANCED/SABOTEUR 1 → 37, FORTRESS 2 → 50, WARMONGER/TYCOON 0.5 → 27; the brief's flat 10 was MEASURED to lose all three HARD castles by tick 17 665 on C5 — pool grows n², tax grows n), `freshStructurePos` 8 rings × 9 angles; F2: nplayer/rainbow-castle pixel reads framed 1920×1080 with the title hidden. Items 1 (draftOverlay sheen) and 7 (race-music fallback) were ALREADY landed by ci-perf (b9f2143 / d6806da) — verified, nothing to do. PLACE-refused re-measured 0/0/0 (MID/HARD/IMBA) → CLOSED. Branch e2e (Chromium 1194): rainbow-castle 1/1 · nplayer FULL-TABLE 1/1 · settings-toggles ×3 9/9 · worker-heap 2/2 (Δ4.28 MB td-heavy, Δ0.92 MB bots). Merged-tree gates: tc 0 · build 0 **1185.0 KiB (65.0 headroom)** · full vitest: see below. SEAM for info-ui: board row reads `world.matchStats.seats.get(seat)?.lostToEntropy`, owner-only (B-17). Owner question: how many connectors a fight may a bot afford to lose before starting a new structure (recommend the derived limits).


## IN FLIGHT (wave 1, opened 06:30 UTC 2026-10-05, each on `.claude/worktrees/s195-<tree>` in the cloud container)
- `s195/rules-2` — T25 + B-9 chewer attacks the keep · B-10 drone splash = one pool 30 split · B-32 corpse-eater loop · B-31 welded TV keeps summoning (+ new welded TV mints) · B-25/B-30 every blast spares own side (enumerated) · N11 smarter chasing. BUMP expected YES.
- `s195/coherence-2` — T19: B-7 Helga death cue (additive-optional) · shared departure rule (chewer + goblin corpse) · chewer stun-star scale · SILENT sound slots (unit-death, stink fire, castle gun, entropy boing owner-only) · N4 Helga-heard-by-two-seats verify · stink ramp wiring behind manifest · refused-placement REACH · B-3 repaired sparkle · B-1 pin · §E F1 render-leak measurement.
- Wave 2 (opens as wave-1 trees land): `s195/controls-macros` (N6) · `s195/info-ui` (N7 + N12 UI + N14 board polish + the entropy board row) · `s195/net-mp` (T20).

## SAFETY NET — `.claude/cloud-bundles/s195-cloud-unmerged-2026-10-05.bundle`
At 10:23 UTC the spend limit killed every running agent (two auditors + the coherence-2 tree). The three branches that had not
yet landed (`s195/rules-2` 9a2e56e2, `s195/fixes` ab2b16f9, `s195/coherence-2` 59650a93) live only in this container, so their
commits were bundled (164 KB) and committed here UNMERGED and UNAUDITED. If this run dies before they land, the desktop merge
owner recovers them with `git fetch .claude/cloud-bundles/s195-cloud-unmerged-2026-10-05.bundle 's195/*:refs/heads/*'` and
audits them as any tree. Once a branch lands here, its merge commit supersedes the bundle copy; the bundle is deleted at close.

## NOT DONE / FOR THE DESKTOP SESSION
_(filled at close)_
