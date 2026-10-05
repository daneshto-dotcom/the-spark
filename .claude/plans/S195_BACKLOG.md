# S195 BACKLOG — what S194 leaves owed (written at S194 close, 2026-10-02)

Owner order (R194-33): *every bug/inconsistency he reports, plus T9 coherence findings, becomes an S195 priority in its own
worktree, written into the S195 backlog at close.* This file is that list. Every open item from the S194 reports is either a
priority in a tree below (§A), a question (§B) or a logged LOW (§C). Nothing was dropped silently.

⛔ Read first: `SPARK_CANON.md`, `.claude/plans/S194_OWNER_RULINGS.md` (R194-1..35, ALL RULED, never re-ask),
`.claude/plans/S194_DISPATCH_LOG.md` (every landing, audit verdict, seam, the CI-red verdicts),
`.claude/plans/S194_AGENT_RULES.md` (copy to `S195_AGENT_RULES.md` with the new master SHA, hand to every tree agent),
`S192_OWNER_RULINGS_teams_magic.md`, `S192_TEAMS_SPEC.md` §c.
⛔ Pitch Masters (`src/arcade/**`, `public/pitch-masters/**`, `pm-*`) is OFF-LIMITS. The arcade GAMES stay untouched
(R194-24); only T13 may read NONET code, and it only reads it until the owner picks.
⛔ Bumps: six sites + canon §6 + CLAUDE.md, scripted (memory: protocol-bump-is-six-sites). READ THE CONSTANT, not this file.

## §0 · LIVE STATE

DEPLOY: S194-#6 `e9855ba9` LIVE · PROTOCOL **66** (`src/net/protocol.ts:1076`, read at handoff) · verify-deploy 4/4 at handoff (re-run after the S194 handoff push; RUN/VERDICT inherited from e9855ba9, docs-only commits since)

- Last logged in S194 (from the dispatch log, for orientation only): deploy S194-#6 `e9855ba9`, PROTOCOL **66**, entry
  1165.4 KiB / 1250 (84.6 headroom), verify-deploy 4/4. Deploys #1–#6 landed: mres-card (63), intentStamp security fix +
  visuals-3, bots-tune, fixes + ui r1/r2 (64), entropy + teams (65), coherence + weld-rebuild + rage + matchboard (66).
- Branches NOT on master when this file was written (`git merge-base --is-ancestor <b> master` = NO):

| branch | tip | ahead | state | if still unmerged at S195 boot |
|---|---|---|---|---|
| `s194/rules` (T11) | `80aaa870` | 46 | quick-check fix round COMMITTED, gates NOT re-run (top of its progress file); last full gates on `95e56eaf` green (8640 / 1166.8 KiB / gating 74). BUMP. | §A0 step 1 |
| `s194/visuals-6` (T4) | `acda8b05` | 29 | re-audit round (a)(b)(c) DONE, merged `e9855ba9`, gates green (8695 / 1180.4 KiB / gating 74/74). No bump. | §A0 step 2 |
| `s194/ui-upgrade` r3 (T5) | `3d6c5696` | 2 | DONE; merge owner-approved R194-35 (was refused by the permission classifier). No bump. | §A0 step 3 |
| `s194/mp` (T17) | `c44708f4` | 5 | harness only (`scripts/live-mp/`), no src. | §A0 step 4 |
| `s194/team-music` (T14) | `ab7f6237` | 2 | notes + `assets-source/team-music/` only. | T12+T14 tree branches from it |

## §A0 · THE MERGE OWNER'S FIRST JOB (before any tree opens) — land what S194 left in flight, then fix shared infra

1. **`s194/rules` (T11)**: run its owed gates on its tip (typecheck · `vitest --maxWorkers=3` · build, exit codes to files),
   light re-audit of the 3-item quick-check round (save.ts LF bytes + 2 simMemo lines; `applyReturnToTitle` bumps
   `simMemo.generation`; MED-1 halves pinned separately in `endgameAudit.test.ts`), merge, **BUMP 66→67** (porch row 74→42 +
   `CASTLE_PORCH_BUILD_CLEAR_RADIUS` 17 in `zones.castleKeepOutHitsBox` (R194-16); pants window 30/45/60/90/120 (R194-17);
   mega pants = 251st (R194-26); live cap 360 total (R194-27)). Re-record the FFA golden if it moves (`teams.ffaDifferential`).
   ⛔ CRLF check: `git ls-files --eol src/state/save.ts src/state/endgameMonsters.ts` must read `i/lf`.
2. **`s194/visuals-6` (T4)**: merge (it has master `e9855ba9` in it; master since moved by docs only + T11). Seams:
   `towerCover.ts` group registry + every `markTowerCover` caller passes a foot; `structureRepair.ts` exports
   `fallenTowerFixCanRegister`; `healthBar.ts drawBar` trailing `ghostKey`. Entry ≈ 1180 KiB → **~70 KiB headroom left for all
   of S195** — say so in every brief.
3. **`s194/ui-upgrade` r3 (T5)**: merge (`uiScreenChrome.ts`, `codexCardFx.ts`, lazy `titleBackdrop` chunk).
4. **`s194/mp` (T17)**: decide — merge the harness (`scripts/live-mp/live-2peer.mjs`, `live-blip.mjs`, `live-teams.mjs`) so the
   net tree can use it; it touches no src. Recommend merge.
5. Gates after EACH merge, one fresh-server e2e per deploy (gating + races + lobby + teams-lobby), `verify-deploy` 4/4. The owner
   tests live, so **deploy every landing** (§D).
6. Shared infra BEFORE the split (S182 rule 4): write `S195_AGENT_RULES.md`; if the CI tree's `e2e.yml` lane split is ready
   early, land it first so every branch's PR run uses it.

## §A · TREES FOR S195 — 8 trees (≤ 8 open at once; each its own worktree, own branch, own progress file `S195_PROGRESS_<tree>.md`)

| # | branch | what | bump? | lands |
|---|---|---|---|---|
| T12+T14 | `s195/teams-2v2-art` | 2v2 backdrops (36 JPGs) + team music (owner's tracks) + lobby seat order | no (render + assets; lobby layout render-only) | after the tracks arrive; mid |
| T13 | `s195/nonet-home` | NONET as its own game: research ×3 → owner picks | no (research) | report only this session |
| T18 | `s195/ui-4` | UI follow-ups after r3 | no | mid |
| T19 | `s195/coherence-2` | T9's routed gaps + the welded-tower bar | probably no (Helga cue: see below) | after T18 if `controls.ts` shared |
| T20 | `s195/net-mp` | reconnect hard-blip, RECONNECTING heading, TURN, quarantine Sym F/I, e2e-lobby STUN | likely no | early (owner plays MP) |
| T21 | `s195/ci-perf` | CI e2e reds, worker-typecheck, lane split, CI frame profile, T4 re-bench | no | FIRST (unblocks every PR run) |
| T22 | `s195/fixes` | test flakes, worker-heap metric, chewer-at-keep, entropy follow-ups | YES if the chewer ruling lands | early |
| T23 | `s195/art` | MRES card art, stink-tower damage-ramp art, mega pants art | no | when the owner delivers stills |

---

### T12+T14 · `s195/teams-2v2-art` — ONE worktree, TWO agents in parallel (R194-29)

**Agent A — 2v2 backdrops (R194-19).**
- Inputs: 36 owner JPGs `C:\Users\onesh\Downloads\{Race}X{Race}.jpg` (784×1168 portrait, **11 MB total**: 30 ordered pairs + 6
  same-race; made on xAI/Grok). **Name = TOP race X BOTTOM race** of the team half.
- Ruled geometry (R194-19, verified S194): board zones are clock order TL=seat0, TR=seat1, BR=seat2, BL=seat3.
  `arrangeTeamSeats` (`src/state/teams.ts:141`; called at `src/main.ts:1751` for bots and `src/net/lobbyRoster.ts:158` for MP)
  puts the host's team on the LEFT = seats 0 (top) + 3 (bottom); right team = seats 1 (top) + 2 (bottom).
  **WEST** half = `{race(seat0)}X{race(seat3)}.jpg` AS-IS. **EAST** half = `{race(seat1)}X{race(seat2)}.jpg` **MIRRORED on the
  vertical axis** (left↔right flip, top/bottom kept). ⛔ NOT a 180° rotation — he corrected that the same turn.
- Today's art path: `src/render/zoneBackgroundRenderer.ts:284` `zoneArtUrl(race, layout)` → `/art/race-zones/zone-{race}-{2p|4p}.png`
  (~230 KB each), used at `:667`. The pair art replaces the two quadrants of a 2-seat team half (R192-T2: no wall between
  teammates, "one continuous zone").
- Fix shape: transcode to webp/png at the half's real pixel size (measure the 4p half rect; do not ship 11 MB of JPG — the static
  payload is reported by `check-bundle-size.mjs`, not gated, but keep it lean); ship 36 files once and mirror the EAST half at
  runtime (`scale.x = -1` about the half's centre), not 72 files. Pure resolver `teamBackdropFor(world, side)` + REACH through
  the real renderer sync for a 2v2 world (`world.teams`), FFA negative (no `world.teams` → per-race quadrants byte-identical),
  mutation (mirror dropped → red).
- Hazards (known): the per-seat ember wash for SCORCHED GROUND (`zoneBackgroundRenderer.ts` ~:84–95) and fog concealment are
  per SEAT quadrant — they must still apply per quadrant on top of a half-sized sprite. A team of ONE (2v1, or 3 seats) keeps its
  race quadrant (⚠ MINE until §B-29). fog.spec's layer roll call must not change (new art goes inside the existing zone layer).
- **Lobby seat order (R194-19 coherence finding, RULED: "the lobby must match the board").** `src/render/lobbyGeometry.ts:35`
  `SEAT_COLS = 2` and `getSeatRect` (`:238`) lays seats ROW-major (0 NW, 1 NE, **2 SW, 3 SE**) while the board is CLOCK order
  (**2 = SE, 3 = SW**). Change the rack to clock order (seat 2 bottom-right, seat 3 bottom-left); check the bot lobby
  (`botSetupOverlay.ts`, `PANEL_W` 960, 4-chip rows) reads the same. Render-only; re-pin any seat-rect test; `uiSkinCensus` /
  `uiSkinReach.teams.test` hit tests must still pass (seat chip moves with its cell).

**Agent B — team music (T14 wiring).**
- Inputs: `assets-source/team-music/README.md` + `SPARK_Team_Music_Prompts.html` on branch `s194/team-music` (all six race songs
  measured 123 BPM, key of F). **The owner presents the tracks at S195 start** (R194-29) — the agent wires and tests with
  placeholders until they arrive, then drops them in.
- File naming the game expects: `public/audio/teams/{a}-{b}.ogg`, **a,b alphabetical** (one file serves both orders);
  same-race `{race}-{race}.ogg` optional → fallback `public/audio/races/{race}.ogg`. Transcode like the race tracks
  (Ogg Vorbis ~80 kb/s, 48 kHz stereo, ~-13.7 LUFS). Loop points derived at runtime.
- Fix shape: `TEAM_MUSIC_SRC` + resolver beside `RACE_MUSIC_SRC` (`src/render/raceMusic.ts:38`); a player in a 2-seat team hears
  his team's pair track; FFA and any missing file → today's race track (R194-19: "each player's own race music for now").
  Render-only, no bump. Tests: resolver table (15 mixed + 6 same-race), fallback on a missing file, FFA negative; the S165
  `@races` lane spec (`settings-toggles` race-music fallback) must stay green.
- File boundary: A = `zoneBackgroundRenderer.ts`, `lobbyGeometry.ts`, `seatRack.ts`, `public/art/race-zones/teams/**`;
  B = `raceMusic.ts`, `audioManager.ts` (if needed), `public/audio/teams/**`. Disjoint → the two agents never merge-conflict.
- Lands: A as soon as audited; B when the tracks are in (or B lands the resolver with fallback first and the files later).

### T13 · `s195/nonet-home` — NONET as its own game (R194-25), RESEARCH FIRST
- Ruled shape: one worktree, three agents, research → owner picks → build. Clicking NONET today drops straight into the puzzle;
  he wants a game HOME screen (levels, campaigns, modes, competitive/PvP — "just like in Tetris"), eventually its own Steam game.
- Agent 1 — NONET as it is: read `src/render/nonet*.ts`, `sudokuOverlay.ts`, `src/render/arcade*.ts`, `public/art/nonet/`,
  `public/audio/nonet-theme.ogg`, and every prior plan/ruling: `.claude/plans-archive/2026-06-19_PDR_S93_NONET_SUDOKU*.md`,
  `S173_NONET_STAGES.md`, `.claude/branch-briefs/06-arcade.md`; grep the archive for levels/stages/mechanics already predefined.
  ⚠ NONET is ALSO the in-match trial (`sudokuEvent.ts`: a same-type blob of ≥ 12 connectors opens it) — the standalone game
  must not break the in-match one.
- Agent 2 — what to carry: SPARK's Pixi fx substrate (`src/render/fx/*`) and `uiSkin.ts` / `uiScreenChrome.ts` /
  the lazy `titleBackdrop`; Pitch Masters (Godot 4.3) for look/feel LESSONS ONLY — read, never edit.
- Agent 3 — successful puzzle games: Tetris family (Tetris 99 / Effect), Puyo Puyo, top sudoku apps, open-source ones — modes,
  campaign structure, ranked/PvP, progression.
- Deliverable: plain-words options in CHAT (no HTML, per the S194 A1 habit), each with cost; nothing built until he picks.
  Research touches no src → no gates beyond typecheck.

### T18 · `s195/ui-4` — UI after round 3 (T5)
- State: T5 COMPLETE through r3 (R194-32 delivered: CODEX / VS BOTS / LOBBY living backdrop + glowing title + own accents; codex
  tower/structure cards reworked). Owner had r1/r2 "looks gorgeous" (R194-24); **r3 still awaits his live look** (§B-24).
- Priorities (follow-ups only):
  1. Whatever he says after looking at r3 live.
  2. Census hardening: `src/render/uiSkinCensus.test.ts` is a SOURCE-TEXT claim list (SKINNED / EXEMPT). Per S182 rule 2 a claim
     proves the line exists, not that it is reached — every SKINNED row without a `uiSkinReach.*` REACH test gets one (rows with
     REACH today: footer, castle, sheet, chips, teams, arcade). Fold in the specific census items the r3 auditors noted (merge
     owner: copy them from the r3 audit verdict into the brief).
  3. Not skinned by design (art-led): race-picker tiles, seat-rack banners, codex combo tiles — only if he asks (§B-24).
  4. Pre-existing R81: a hovered footer chip/card grows `HOVER_GROW` px past its hit rect — make the grow stay inside the hit
     rect, or pin it as intended (owner LOOK).
  5. World-space hover/selection highlight is absent for EVERY family (T9 matrix, routed to T5) — propose one shared highlight;
     build only after he says yes.
  6. Nit: `botSetupOverlay.ts` ~:521 docblock says steppers "shouldn't pop … makeSmallButton untouched" — now false.
- File boundary: `src/render/ui*.ts`, `titleScreen.ts`, `codex*.ts`, `footerBand.ts`, `castlePanel.ts`, `characterSheet.ts`,
  `botSetupOverlay.ts` (⚠ T12 agent A may touch the bot lobby rows — T18 waits for T12's seat-order change or they agree the
  file split up front), `buttonFeedback.ts` (keep T8's `hitRectAtScale` semantics: the REST-size plate is the hit target).

### T19 · `s195/coherence-2` — T9's routed gaps + the welded tower bar
Inputs: `s194-coherence/.claude/plans/S194_PROGRESS_coherence.md` (parity matrix + "Routed gaps"), T15 report.
1. **Helga death beat** — she vanishes with no beat: a kill and the turn-boundary sweep both leave `world.defenders` via
   `destroyDefender`, and a peer cannot tell them apart without the host-local `structureKillHits`. Options: (a) host-only beat;
   (b) an additive-optional synced cue (e.g. a `diedAtTick`/cause on the departing defender) — additive-optional = no bump by the
   project rule, but run the S186 test. Owner decision §B-7; build the default (b) if unanswered and report.
2. **Chewer / goblin corpse onto the ONE shared departure rule** (`src/render/coherence/unitDeparture.ts`
   `classifyCreatureDeparture`): `chewerRenderer.ts` death watcher still keeps a private `wasState !== 'DESPAWNING'` test —
   move it to the rule and move it in `unitDeath.census.test.ts` from the allow-list to the consumer list (3 → 4);
   `goblinRenderer.ts` corpse must skip an EXPIRY (last seen DESPAWNING) and a CONCEALED spot through the same helper.
3. **Chewer stun stars**: `drawStunStars` passes alpha 1 and no scale (every other family is scaled) → same call as the others.
4. **Missing sounds list** (owner taste, §B-6): no fire SFX for the stink tower and the castle gun; no death SFX for any unit
   except chewer, Voltkin and pants. Wire the slots (silent until he auditions one generic "unit falls" .ogg and one "keep
   fires" .ogg) so dropping a file in is the whole change.
5. **Stink tower damage-ramp art**: the only tower with no damage-ramp art (matrix row "damage-ramp art"). Art comes from T23;
   T19 wires `stinkTowerRenderer.ts` to a ramp sheet behind a manifest check, legacy = today.
6. **Refused-placement silence** (T9 → T5): verify, do not assume — T5 r1 says both refused cues were added in `controls.ts onUp`
   (the illegal release is gated there, not in `dragPreview.ts`); confirm the blueprint-stamp `!canStampAt` branch (~`controls.ts`
   :1504 at `18560cd8`) plays `playUiRefusedSFX()` with a REACH test; fix if not.
7. **Welded tower bar — gated on §B-1.** T15 (`src/render/towerHealthHold.ts`, `structureBarHealth.heldOwnPoolAt`,
   `characterSheetModel.shownOwnHealth`, `structureRampRenderer`) holds a welded tower's OWN reading through a re-form. Root cause
   it fixed: `damageConnector`'s drain (`damage.ts` ~:681–692) spends the welded pool from the struck bond then survivors by
   ascending id, so the tower's own (oldest) bonds empty first. If he rules the bar/art should show the WHOLE weld pool, the
   change is the bar + ramp-art source in those four consumers; if he keeps own-pool, nothing to do but pin the ruling.
8. **"Repaired" sparkle** (T4 L2 LOOK, §B-3): a FIX that re-stands a fallen tower plays no sparkle (its shapes were already seen
   standing → re-reveal). If he wants one: its own trigger off the repair job finishing (synced `world.repairJobs`), render-only.
- File boundary: `src/render/coherence/**`, `fx/unitDeathFx.ts`, `chewerRenderer.ts`, `goblinRenderer.ts` (corpse path only),
  `stinkTowerRenderer.ts`, `princessRenderer.ts`/defender renderers, `towerHealthHold.ts`, `structureBarHealth.ts`,
  `audioManager.ts` slot table (⚠ shared with T12 agent B — agree the hunk). `towerCover.ts` stays T4's (landed).

### T20 · `s195/net-mp` — multiplayer robustness (owner plays with his wife + friends)
Inputs: `s194-mp/.claude/plans/S194_PROGRESS_mp.md` (T17), T8 report item 4, `TURN_SETUP.md`, `RELAY_HEALTH.md`.
Known (T17, live deploy #4/#5): code join, quick match, relay-only, teams T1 v T2, 4 players all PASS. Hard blip: 5 live runs
recovered by themselves in 10.6–34.5 s; 1 of 5 showed CONNECTION LOST (17.6 s → 34.5 s) then auto-cleared.
1. **Reconnect hard-blip root cause** (real, quarantined `e2e/reconnect-hard-blip.spec.ts`): locally 3/3 recover in 20.3 / 25.3 /
   31.2 s vs `RECONNECT_GRACE_MS` 15 000 (`src/net/reconnectPolicy.ts:29`); S189 measured ~6.3 s. Timeline: joiner rejoins at
   1.35 s, relays attached at 1.9 s, then NO RTCPeerConnection on either side for 20+ s; both show terminal CONNECTION LOST at
   ~15.3 s. Suspect (T8): Trystero per-peer state for the same selfId after a remote close — the signal handler's
   `connectedPeer/offerAnswered` early-return on announce. Reproduce with `scripts/live-mp/live-blip.mjs` + the spec, fix, then
   un-quarantine.
2. **Keep the "RECONNECTING…" heading** (T17 suggestion) while a rejoin is demonstrably in progress instead of flipping to the
   terminal CONNECTION LOST at 15 s (`src/render/connectionLostOverlay.ts:103`, plan in `reconnectPolicy.ts` ~:297) — a
   recovery that lands at 25 s should never have shown "lost". Owner §B-13.
3. **TURN secrets — OWNER ACCOUNT ACTION, agents never paste secrets.** Live bundle carries ONE url
   `turn:global.relay.metered.ca:80` and the secret is still WRAPPED (`urls: "…"`; `parseTurnConfig` unwraps it with a console
   warning — the S-memory "malformed TURN paste killed all multiplayer" shape). T17 measured that `:80?transport=tcp`, `:443`
   and `turns:443?transport=tcp` all allocate with the same creds. → Write the exact re-paste text into `TURN_SETUP.md`
   (unwrapped; add `?transport=tcp` and `turns:global.relay.metered.ca:443?transport=tcp`), the owner pastes it into the repo
   secret, then a live `scripts/live-mp/live-2peer.mjs RELAY=1` proves each transport.
4. **Quarantine smoke Sym F / Sym I** — not investigated in S194 (red in one older quarantine run). Run each `--repeat-each=3`
   locally; verdict per spec: stale harness (port like Sym A/C/G to `placeFreeSparkAndConfirm` / `pullFromBank`), flake, or real.
5. **e2e-lobby STUN timeouts on CI** (deploy #5 run): `join-stall.spec.ts:85/109` + `nplayer.spec.ts:140` late 4th joiner,
   `Binding request timed out` then the 1320 s cap; local lobby 5/5. Both are `@quarantine-flaky` by tag but in the lobby lane by
   grep. Decide: CI-network-only → route the lane grep change to T21 (it owns `e2e.yml`), or give the specs a TURN-only path on CI.
- File boundary: `src/net/**`, `connectionLostOverlay.ts`, `e2e/reconnect*.spec.ts`, `e2e/smoke.spec.ts`, `e2e/join-stall*`,
  `e2e/nplayer*`, `scripts/live-mp/**`, `TURN_SETUP.md`. ⛔ NOT `e2e.yml` (T21's).

### T21 · `s195/ci-perf` — CI reds, lane split, frame profile, the T4 re-bench (land FIRST)
Inputs: dispatch log "S195 FINDING", T4 + T9 + T2 perf notes, T8 item 5.
1. **CI e2e gating red on deploys #4/#5 while local is green** — `fog.spec.ts:484` ghost pixel 0 (> 50), `fog.spec.ts:133` potato
   pixel 0 (> 90), `hunter.spec.ts:68` 120 s `mouse.move` timeouts ×3 retries, then the 900 s suite cap cut 16 tests. Local
   `--repeat-each=3` 21/21 PASS. First seen #4 (T8+T5 UI). Verdict so far: CI-only — the software-GL runner starves the renderer
   (pixel reads 0 + input timeouts). Do: (a) **CI frame profile** — `__SPARK__.frameMs` over 300 frames on the runner, master vs
   `?fx=legacy`, to see whether fx quality should drop under CI (an explicit `fxQuality` for CI, never silently); (b) give fog +
   hunter their own lane (pattern: `e2e:races` S165 + `src/ci.e2eLanes.test.ts` pins the mapping), so one starved spec cannot
   eat the shared cap.
2. **`worker-typecheck` job: `actions/checkout` timed out after 3 min** (deploy #5) — infra; add a retry / longer
   `timeout-minutes` on the checkout step, and a test in `ci.*` if the yml shape is pinned.
3. **e2e-lobby lane** grep change if T20 rules the STUN reds CI-network-only.
4. **Re-bench T4 backgrounds on a quiet machine or a real GPU** — T4's numbers were swiftshader on a shared box: final HIGH
   **+0.58 ms** render+syncs / **+0.50** whole frame, LOW +0.12 / +0.05 (contract +1.0 MET), but batch-2 cycles swung −0.8..+2.9
   ms. Harness: T4's `.tmp-gates/fx/bench2.spec.ts` (interleaved master/branch). If HIGH > +1.0 on the merged tree: next cuts are
   the vampire sigil star (15 sprites/tower) and the demon embers. Also re-bench the WHOLE S194 visual stack (visuals-3 +0.54
   HIGH, coherence +0.26 forced worst case, T4) combined — no one measured all three together.
- Report every gate's exit code from a file (S165/S161 rule). Deploy workflow is independent of `e2e.yml`, so none of this ever
  blocked shipping — keep it that way.
- File boundary: `.github/workflows/**`, `playwright.config.ts`, `src/ci.*.test.ts`, `e2e/fog.spec.ts`, `e2e/hunter.spec.ts`,
  `src/render/fx/fxRuntime.ts` (CI quality only), bench harness under `.tmp-gates/`.

### T22 · `s195/fixes` — small fixes + gated sim items
1. **`draftOverlay.test.ts` wall-clock flake** (deploy #5: 8480/8481): the hover-sheen test (`src/render/draftOverlay.test.ts:921`)
   reads `skinSheen`, which takes `performance.now()`; the band clamps out ~0.4 % of its 1600 ms cycle. Pin `t` (inject the clock
   or `vi.spyOn(performance, 'now')`); never loosen the assertion. Grep every other `uiSkinReach*` test that asserts a sheen.
2. **`botFix.test.ts` 60 s timeout under load**: "at least one bot tower is actually restored" (`src/bots/botFix.test.ts:123`,
   cap `60_000` at :127) took 79 s on pure master `814f1871` under 8-tree load; green alone. Measure it alone on a quiet tree; if
   load-only, raise the cap WITH the measurement in the comment (never relax the assertion), or shorten the match while keeping
   the coverage (S177 rule: lengthen/shape the run, never delete the gate).
3. **Worker-heap metric** (`e2e/worker-heap.spec.ts`, `GROWTH_LIMIT_MB` 10 at :28): T8 proved NOT A LEAK — the `usedJSHeapSize`
   delta is a function of window length (2850–4450 ticks → 0.4–3.6 MB; 4689–6039 → 8.3–13.7 MB red); a CDP heap-snapshot diff
   showed +4.34 MB retained, of which +3.56 MB is a second high-water Pixi Graphics batcher. Switch the metric to a CDP heap
   snapshot's retained size (or `HeapProfiler.collectGarbage` + `Runtime.getHeapUsage`) and/or warm past a geometry peak.
   ⛔ Do NOT raise 10 MB. CI went green only because the runner got slower.
4. **Chewer with nothing to chew** (T8 finding, pinned at 0 hits today): it walks to the enemy keep, sits ATTACKING and lands
   nothing. Gated on §B-9; recommended fix = it does not go there (R194-9: buildings/towers/connectors/free shapes only). Sim
   change → BUMP.
5. **Entropy follow-ups** (T6 seams, gated on §B-17/18): a "LOST TO ENTROPY" line on the stat board (inert additive-optional
   counter, no bump); bots taught to stop growing a structure past `ENTROPY_FREE_CONNECTORS` (10) and start a new one (host-only
   bot planning, no bump; bot signature pins are relational — re-measure, never relax).
6. Verify-only: T11's pre-T7 finding "HARD bots send ~6.5k PLACE_PRIMITIVE per seat per 300 s, ~11 land" — T7 measured refused
   PLACE → 0 after its fix; re-measure on the merged tree and close it with the number.
- File boundary: tests named above, `src/state/creatures/creatureAI.ts` (chewer arm only), `src/state/matchStats*`,
  `src/render/matchBoard*` (one row), `src/bots/**`, `e2e/worker-heap.spec.ts`.

### T23 · `s195/art` — art the game is waiting on (owner taste; stills only, no veo without a quoted spend)
1. **MRES card art** — still missing. Imagen returns 404 for every model on gcp-vertex (S193/S194, $0 spent). The owner made the
   2v2 backdrops himself on xAI/Grok and prefers Grok for stills → write the brief (MANIFEST row 4b already holds it + the
   5-step landing recipe), he generates, the agent runs `scripts/build-upgrade-cards.py` + `check-upgrade-cards.mjs`, sets
   `card: 'general-mres'` (`src/render/draftOverlay.ts:173`) and empties `GENERAL_CARDS_AWAITING_ART` (`:191`). Original art
   only (memory: never a franchise look-alike).
2. **Stink tower damage-ramp art** (T9 matrix; T19 wires it) — follow `ART_PIPELINE.md`; run `check-clip`/atlas guard.
3. **Mega pants** own art (R194-1: "reuse the pants sprite scaled up for now; new art later") — brief only unless he asks.
- Output path for anything he reviews: `C:\Users\onesh\OneDrive\Desktop` (never `~/Desktop`).

### Lands order across trees (merge one at a time, full gates between, deploy each landing)
§A0 carries (rules → visuals-6 → ui r3 → mp harness) → **T21** (CI lanes; unblocks PR runs) → **T22** → **T20** →
**T18** → **T19** (after T18 if `controls.ts`/`audioManager.ts` hunks overlap) → **T12 agent A** (backdrops + seat order) →
**T12 agent B** (music, when the tracks are in) → **T23** (when stills arrive) → **T13** (report only).
Bumps this session: T11 (67) at §A0; T22 #4 if ruled; T19 #1 only if the S186 test says so. Ride them as ONE bump per deploy.

## §B · OWNER QUESTIONS (unanswered MINE items from the S194 reports, one line each, with a recommendation)
⛔ Checked against R194-1..35 and S192 teams/magic rulings — nothing below is ruled. Ask in CHAT, no HTML (S194 A1).

**Welded towers / visuals**
1. (T15) Should a welded tower's health bar and damage art show the WHOLE weld pool instead of its own? → **No — keep its own**; his
   R185 card words were "its own HP and then out of how much the total structure has", which the card already shows ("PART OF A
   WELDED STRUCTURE cur / max").
2. (T4) The fix-me sparkle also shows in FIGHT (FIX itself is BUILD-only), at 0.45 intensity with a slow breath? → keep.
3. (T4) A FIX that re-stands a fallen tower plays no sparkle; want a short "repaired" sparkle? → yes (render-only, T19 #8).
4. (T4) Background centred on the sprite's foot, its numbers (pool 0.66× art width, counts, sparkle tail 45 ticks, hub discharge
   every 50 ticks, health-bar ghost 18-tick hold), LOW drops smoke/mist/dust? → keep; judge live.
5. (T9) Death beat (36 ticks, seat-colour flash), hit pop (white core, red rim, cap 20), fog now hiding damage numbers on a hidden
   spot? → keep all three; halve `HIT_POP_MAX_LIVE` if a big scrum reads busy.
6. (T9) Sound gaps: no stink-tower or castle-gun fire sound, no death sound for most units → he auditions one "unit falls" and one
   "keep fires" .ogg; recommend yes.
7. (T9) Helga's death shows no beat on peers; add a small synced death cue (no bump expected) or show it on the host only? → add
   the cue.
8. (T9) Stink tower has no damage-ramp art → yes, generate (T23).

**Units / rules**
9. (T8) A chewer with nothing to chew walks to the enemy keep and swings at nothing; should it chew the keep, or not go there? →
   not go there.
10. (T8) A drone's detonation splash still hurts enemy units near its target connector; OK under "only target buildings"? → keep
    (area effect, not a target).
11. (T16) The Warlord's rage cooldown also runs through BUILD, and an orc appearing in BUILD joins an open BLOOD FRENZY? → keep both.
12. (T11) Pants live cap: 1000 live pants measured 6.1 ms host + 160 KiB/snapshot, so a cap of 360 live (all seats) stays (R194-27
    said cap only if measured necessary) → inform; keep 360.

**Multiplayer**
13. (T8/T17) A hard blip recovers in 20–31 s but the grace is 15 s, so players see CONNECTION LOST before it recovers. Keep showing
    "RECONNECTING…" while a rejoin is in progress, and give it a net session? → yes to both (his S189 complaint).

**Entropy (R194-18/20/21 ruled the rule; these are the leftovers)**
14. Toast "ENTROPY: N CONNECTORS SNAPPED", no sound? → keep (sound = his audition).
15. Inform: a snap that SPLITS a structure deletes its smaller side, so a fight can lose more than the roll (one test wave rolled 16,
    lost 27) — matches "maybe whole parts of it" → keep.
16. The entropy toast reaches a REMOTE human only ~1/6 of the time (the existing limit of every sever toast) → accept for now.
17. Show "lost to entropy" on the end-of-match board? → yes, later (cheap).
18. Teach bots to stop growing one structure past 10 connectors? → yes.

**Bots (T7; names/personalities ruled R194-12)**
19. IMBA goblin-tower-first for every style, leftovers feed race towers, FIX before FEED/TOWER, MID repairs only lost shapes vs
    HARD/IMBA any damage, the hold times, retry back-off 30 ticks → keep all.

**End-of-match board v2 (T10)**
20. One badge per row, only for a stat the row leads outright, ties get none → keep.
21. UNITS LOST counts every death a hit or skill caused; a self-detonation (suicide goblin, drone) is neither a loss nor a kill →
    keep.
22. Charts: score race (lines), damage/kills per wave, built-standing (stacked area) → he swaps any after seeing them live.
23. Keys ← / → / Tab page the board → keep.

**UI**
24. Round 3 is live (Codex, VS Bots and Lobby chrome; codex tower cards): look and say what to change. Skin the race-picker tiles,
    seat-rack banners and codex combo tiles too? → leave them (they are card art).

**Teams (S192 spec Q1/Q5/Q8 + T1 MINEs, never ruled)**
25. The Pharaoh's ultimate spares teammates but still burns his OWN seat, while the zombie death blast now spares his own side
    (R193-B3) → align the Pharaoh with R193-B3 (spare own side too).
26. Points race: the first SEAT to the bar wins for its team (not a shared team total) → keep per-seat.
27. Shared vision between teammates → yes (one line in `vision.ts`; check the bump).
28. Smaller team defaults: endgame wipe banner names the team; Begin dims to 0.4 while one-sided; the overkill carry stays on the
    connector's owner; you may scorch a teammate's zone (only enemies burn); teammates sit side by side; bot chip order
    difficulty/personality/race/team; a teammate-end weld is no Voltkin target → keep all.
29. 2v2 backdrops when a side has ONE player (2v1) or three seats → the solo side keeps its race quadrant; pair art only for a
    2-seat half.

**Older, still unruled (grep the archive before asking; ask only what is still open)**
30. Zombie blast → stink-tower death chain: does the chain hit his own side? → spare own side, like R193-B3.
31. Voltkin TV with an extra shape welded on stops re-summoning (canon ~:1125, ⚠) → keep.
32. CORPSE EATER heals the whole bite, overkill included (canon ~:738, ⚠ MINE) → keep.
33. The softer number pop (0.6→1.15→1) from the S193 plan was never built → drop it (the T9 hit pop covers it).

## §C · CARRY-FORWARDS (LOW, logged)
- gcp-vertex Imagen 404 for every model (owner infra; T23 routes around it via Grok).
- Owner's OS: constitution STALE + env-diff hook drift WARN at boot; infra alerts (nightly mirror, MinIO); statusline dead
  (token reading unavailable).
- `pentagramBuildability.test.ts.snap` gets an EOL-only rewrite from vitest on Windows after EVERY full run (benign, reverted by
  every tree in S194) → normalise (snapshot serializer or `.gitattributes eol=lf` for `*.snap`) so it stops costing a revert.
- Nits: `voltkin-config.ts` ~:1243 "drone row is BOTH" (stale since R194-9); `monstersDueBy` docblock (verify after T11 lands).
- Canon owes the stat-board v2 section (T10 seam: lost / dealtTo / keep-structure split / `v` per wave point; wire 2,503 B totals,
  11,101 B history) — check `SPARK_CANON.md` before writing; add with pins if missing.
- T1: welded building cards covered by the census pin only, no REACH test.
- T8: smoke Sym D is `test.fixme` (unconstructible through the UI; invariant in `world.test.ts:319`); quarantine lane still hits
  its 1020 s cap (18 tests; A/C/G now pass but cost ~2 m each).
- T10: unit portraits on the board not verified live (atlases were not loaded in the injected screenshots).
- R194-28: the owner's 70k TAKEN/DEALT was REAL — do not re-investigate.
- R192-T3 v2 (one buildable half per team) — future, not S195 unless he raises it.
- 15 worktrees under `.claude/worktrees/` + `x2block.ts` stray file there; `.tmp-audit/` folders; main-checkout
  `.tmp-magic-gates/ .tmp-raColumn.bak .tmp-rep.py` (delete denied twice — owner); temp dir `…\Temp\m663` (owner OK to delete).
  `/handoff` STEP 1.1 prunes merged branches/worktrees — keep the five unmerged ones in §0 until they land.

## §D · PROCESS — what S194 learned (keep doing it)
- **An integrator agent does the landings** (merge → bump → gates → fresh-server e2e → push → verify-deploy → log) so the merge
  owner stays free to route, audit and talk to the owner. Note: the auto-mode permission classifier can REFUSE a merge
  ("Modify Shared Resources", T5 r3) — get the owner's explicit OK in chat (R194-35) and log it.
- **≤ 3 auditors at once**, each read-only and independent of the branch, trial-merging against CURRENT master. **Light
  re-audits** for fix rounds (only the delta), full audit for a first landing.
- **CRLF checks in every audit**: `git ls-files --eol <touched files>` must be `i/lf`; T1 shipped 641 CR in `hostHandlers.ts`
  (LOW-1) and T11 needed `save.ts` restored to LF bytes. Python writes `newline=''`; `git checkout` can flip a file to CRLF.
- **The owner tests live, so deploy every landing** — a train only when two branches land back to back; one bump per deploy.
- Merge one branch at a time and run the suite between (S182 rule 3); defects BETWEEN branches are the merge owner's (S194: the
  teams census vs T9's identity check; T8 × T11 `endgameMonsters.ts` — using `living` in `due` would have stopped the mega pants).
- Every brief carries: file boundary, known seams with line numbers, the shared headroom (~70 KiB after §A0), "fix ONLY this".
- Pause/resume works: every agent keeps its exact next step at the TOP of its progress file; RESUME by SendMessage, or a fresh
  agent from the brief + progress file. Commit every 5–10 minutes.
- A timeout-only red under shared load is re-run alone and ruled with the measurement (firstTowerSpeed 34.7 s, botFix 79 s) —
  never silenced, never relaxed.

## §E · S195 FINDINGS LOGGED DURING THE RUN (routed, not dropped)
- **F1 possible render leak** (s195/ci-perf report): a local full 4401-tick render-heap soak failed its census — display objects 1778 → 2017 (+239 vs limit 51), textures 115 → 144. Not caused by ci-perf; never visible on CI (window always too short). Maybe fx pools filling to their caps (S192–S194), unconfirmed. → T19 polish (render) — measure pool caps first.
- **F2 unframed stage pixel reads** (same drift fog.spec had: title embers widen the stage each frame): `e2e/nplayer.spec.ts:379`, `e2e/rainbow-castle.spec.ts:70` → T20 multiplayer (nplayer) / T19 (rainbow-castle): hide title + pin extract to 1920×1080 like fog.spec.
- **F3 visual stack over its perf contract** (~+1.4–1.5 ms HIGH vs +1.0, noisy machine): re-measure on a quiet machine; candidate cuts visuals-6 ground fx (~190 sprites), vampire sigil star, demon embers → owner LOOK before cutting; T19.
- **F4 CLAUDE.md gates section** must gain the `e2e-render` lane, the new budgets, and `e2e-protocol` non-gating (S142 escape hatch) — merge owner, after ci-perf lands.
- **F5 verify-deploy short-SHA false FAIL** (S195): `--sha e06fab28` (abbreviated) reports REMOTE FAIL 'remote is e06fab28 but expected e06fab28' — the script compares the full remote SHA to the literal argument. Normalise with `git rev-parse` inside the script. Tiny tool fix; any tree touching scripts/.
