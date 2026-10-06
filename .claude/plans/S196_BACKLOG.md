# S196 BACKLOG — what S195 leaves owed (written at S195 close, 2026-10-06)

⛔ Read first: `SPARK_CANON.md` · `.claude/plans/S195_OWNER_RULINGS.md` (R195-* + N1–N20, ALL recorded — never re-ask a ruled item) ·
`.claude/plans/S195_DISPATCH_LOG.md` (every landing, gate, CI verdict) · `.claude/plans/S195_CLOUD_DISPATCH_LOG.md` (the owner's 11-tree cloud run) ·
`.claude/plans/S195_AGENT_RULES.md` (copy to `S196_AGENT_RULES.md` with the new master SHA; ⛔ its top rule: **commit every ≤5 min**).
⛔ Pitch Masters off-limits (`src/arcade/**`, `public/pitch-masters/**`, `pm-*`, `F:/pm-s2-work`). ⛔ A protocol bump is **TEN sites** (S195 cloud finding; `protocolVersionSync.test.ts`). READ THE CONSTANT.

## §0 · LIVE STATE
Deploy **S195-#10 `81dfb8d3`** · PROTOCOL **70** · entry 1235.5 / **1350** KiB (charter raised 1250→1350 in S195) · verify-deploy 4/4.
Ten S195 deploys: #1 s194/rules (67) · #2 s194/visuals-6 · #3 s194/ui-upgrade r3 · #4 s194/mp harness · #5 s195/ci-perf · #6 cloud train (11 trees, 68) ·
#7 graphics tiers HIGH/LOW/MINIMAL · #8 teams (69) · #9 team tiles (dormant) · #10 network A+B codec (70).
Unmerged, preserved: `s194/team-music` (owner's tracks pending) + `pm-*` (other project).

## §A · OWNER DECISIONS OWED (ask in chat, one line each, recommendation first)
1. **N20 character art** — yes to Blender-rendered sprites as a production tool + install Blender (agents may not) for the **Voltkin pilot** (~$20; `.claude/plans/S195_CHARACTER_ART_RESEARCH.md`). Rec: yes.
2. **Team-tile seam blend** — approve `Desktop\SPARK_S195_TeamTiles\COMPARE_*` → flip `TEAM_SEAM_BLEND_LEGACY_ART` true (one line). Rec: look first.
3. **Six race tiles** — he generates them from `Desktop\SPARK_Six_Race_Tiles_Prompts.html` (Grok) → a session converts to 480×270 webp in `public/art/race-zones/tiles/` + lists them in `TEAM_TILE_RACES`. His 27 trio images (card 14 empty, 29–56 not made) stay a fallback.
4. **NONET home** — pick an option + answer the 10 questions in `.claude/plans/S195_NONET_HOME_OPTIONS.md` (rec: Option B home + campaign).
5. Cloud-run MINE defaults to confirm (each flagged at its constant; recs in the named progress files on master): drone pool 30 · Voltkin path rules · chase ratio 1 · N6 two-stroke digit reading + key badge · tooltip delay 180 ms / wording · Helga audience (teammates?) · hover-highlight ring vs glow · bot entropy loss limits (37/50/27).
6. Network MINE: `KEYFRAME_INTERVAL` 100 · uncompressed fallback for browsers without DecompressionStream · card wording "~N snap/fight". Rec: keep all.
7. **TURN re-paste** — owner account action; exact text in `TURN_SETUP.md` § "THE RE-PASTE" (4 unwrapped urls incl. tcp/443).
8. Team music tracks (folds `s194/team-music`); MRES card art + stink-tower damage-ramp stills (Grok).

## §B · TREES / WORK READY TO RUN
- **Verify the lag fix live** (cheap, first): owner + brother play one match, both `?debug=1`; brother on Settings → Graphics → MINIMAL; read `snap rx` / `snap gap` (joiner) and `net out` (host) at waves 8–10. Expected ~0.5 Mbit/s per joiner (was 14). If still laggy → profile his PC.
- **CI tree** (`s196/ci`): F6 runner 15-min queue cancellation (auto-rerun zero-step cancels / alert) · `tickClock.spec:21` CI starvation (red #1/#3/#6/#10) · F8 `nplayer.spec:140` late-4th-joiner page-load red on CI (#1/#6/#10 — watch now snapshots are binary) · quarantine real-WebRTC reds · e2e-protocol (non-gating) · F5 `verify-deploy` short-SHA false REMOTE FAIL.
- **Net follow-ups**: F7 host CPU with 3+ joiners on distinct acked bases (profile in-browser; lever = delta vs the newest frame all peers acked) · hard-blip silent-drop reproduction (block UDP one side; candidate fix named in `S195_PROGRESS_net-mp.md`).
- **Render**: §E F1 render-heap census (not reproduced since; watch the soak lane) · settings/lobby census REACH rows.
- **N18 entropy readability** — "N SNAPPED, M LOST" shipped (#10); rule stays per connector (R195-E2, closed).

## §C · STALE / CORRECTED CLAIMS (do not re-chase)
- "race-music `settings-toggles:140` still open" (integrator reports) is STALE — ci-perf (#5) fixed the product bug (`playMusic` follows `desiredMusicUrl`, REACH-tested).
- Workstation 2 as host does NOT help the brother (same home uplink) — `S195_LAG_REPORT.md`.
- Hunyuan3D is unusable (licence excludes the EU; owner in France).

## §D · PROCESS (what S195 proved — keep doing it)
- Every branch audited by a non-author; **every fix round re-audited** — net-delta's first fix round introduced a NEW security MED (non-host delta-base eviction).
- Commit every ≤5 min, exact next step at the top; limits hit 6+ times and every agent resumed without salvage.
- A parallel cloud session is safe when it integrates on ONE branch with per-tree audits and the desktop runs the final e2e verdict.
- Bind `verification[]` at every priority close to the permanent record of what was delivered (a changelog line), never a value later work will move.
- A visible change the owner has not seen ships OFF behind a one-line flag (team-tile blend).
