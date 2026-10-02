# S194 BACKLOG — what S193 leaves owed (written at S193 close, 2026-10-02)

⛔ Read first: `SPARK_CANON.md`, `.claude/plans/S193_DISPATCH_LOG.md` (every report, audit verdict, agent id),
`.claude/plans/S193_AGENT_RULES.md` (hand to every worktree agent), `S194_OWNER_QUEUED.md` (his verbatim asks),
`S193_OWNER_RULINGS_2.md`, `S193_OWNER_ENDGAME_ANSWERS.md`, `S193_OWNER_PLAYTEST_2.md`.
⛔ Pitch Masters (`src/arcade/**`, `public/pitch-masters/**`, `pm-*`) is OFF-LIMITS. ⛔ Bumps via `scratchpad/gates/bump2.py`-style six-site edits.
⛔ Process that worked in S193: one independent auditor per branch (≤3 concurrent), fix-only rounds to the SAME agent, merge one
branch at a time with typecheck + full vitest between, ONE fresh-server e2e per deploy; run long gate chains DETACHED (nohup) —
the 600 s tool cap killed one; commit the log only AFTER verify-deploy (a local commit trips its REMOTE carrier).

## 0 · LIVE: deploy #23 `77e2a00` (+ bookkeeping `cf054ba`), PROTOCOL **62**, verify-deploy 4/4, bundle 1121.9 / 1250 KiB
#17 units-ai · #18 zombies + blasts · #19 CI health + relays · #20 endgame pants · #21 visuals-2 · #22 train (magic, bots, autobuild,
visuals-4, visuals-5, carry-fwd, endstats, weld) · #23 playtest3 (castle keep-out 61 disc, nearest enemy first).

## A · WORKTREE PLAN FOR S194 — 8 trees, priorities per tree (open as slots free; the first 8 start at boot)
| # | worktree / branch | priorities in it | state at S193 close | lands |
|---|---|---|---|---|
| T1 | `s192/teams` (exists) | teams v1 land: merge final master; zombie-blast + Pharaoh/R138 spare → sameTeam; bots `leaderTargetSeat` sameTeam + bot-lobby 4-chip re-layout; FFA golden re-record; 2-peer lobby e2e; bump | round 2 done 5f8074e; HELD | LAST |
| T2 | `s193/visuals-racial` (exists) | visuals-3 land: COMBINED re-bench master+v3 (v4/v5 now on master) vs +1.0 ms; if over → HIGH opt-in; then fold its shimmer into visuals-2's `fxDisplace` (LOW) | perf round 05fd639, audit FIX FIRST resolved on its own tree | early |
| T3 | `s193/mres-card` (exists) | audit (never audited) → land; card ART: gcp-vertex Imagen returns 404 for every model — owner fixes the server/model list, else generate by another approved route; MINE Qs (what +10 % MRES means, DEF lost at 26, "WARDED") | built d429f1c, +1.2 KiB, BUMP | mid |
| T4 | `s194/visuals-6` NEW | (a) Q1 the building AURA rework — wrap the footprint, not a disc behind it (zombies' green goo etc.), per race; keep the build-time sparkle he likes; (b) V28 health-bar ghost segment (weld has landed, so healthBar.ts is free); (c) lightning-hub arc fx (V07 leftover) | not started | mid |
| T5 | `s194/ui-upgrade` NEW (owner, S193 close) | **UPGRADE EVERY CLICKABLE SURFACE + THE HOME SCREEN**: tier chips + footer, castle panel rows (stats, MRES, FIX ALL, regen, gatherer), tower/character sheets, goblin-tower FEED + auto-build chips, draft cards, skill squares, lobby + bot-lobby chips, title/home screen — research + a visual spec + before/after mockups first, then build on the Pixi fx substrate; keep every hit-test mechanical (the S182 fill-count rule) | not started | mid |
| T6 | `s194/entropy` NEW | Q2 "Anthropic tax": entropy rising with structure complexity — RESEARCH + 2–3 options with arithmetic on his two examples (145c/65s ≈ 20 000; 54c/24s ≈ 3 100) + Council → put to him → build the pick (deterministic, shared rule, bump) | not started | late |
| T7 | `s194/bots-tune` NEW | bots: IMBA FORTRESS identity lost after nearest-first targeting (re-tune); ~40 territory-refused PLACE/s retry spam in normal play; bots never FIX (REPAIR_STRUCTURE / FIX_ALL); Q-E Warmonger≈Tycoon at IMBA; owner Q "leftovers feed race towers" | not started | mid |
| T8 | `s194/fixes` NEW | small carries: archer/harpoon flight + impact use unscaled fire tick under rage (`ragedFireTick` in `creatureProjectile.resolveShotIn`); Helga spin `world.tick / PHYSICS_HZ`; worker-heap soak 2 reds (heap-snapshot diff); remaining quarantine specs (smoke Sym A/C/D/G, reconnect-hard-blip, nplayer S63:74); CI L2 SLOWEST_CI_TICKS_PER_S 6→5 + lane minutes; tripwire backtick hole (done? verify) | not started | early |

## B · OWNER QUESTIONS OWED (ONE plain-words HTML on his Desktop, each with a recommendation — the merge owner writes it at S194 boot)
- Endgame: mega pants 240 s + HP500/DEF20/ATK60/PEN20; pants pace waits on the slowest seat (coupled lanes); pants killed by zombie
  racial units raise free zombies?; Q9 PEN 5 vs hit 40; bounty off waves 27–31; fallen seat's un-emerged pants dropped.
- Blasts: the 2:1 creature:tower weight for blasts other than the zombie's?; Ra column a "blast" (distance falloff)?; full-hit edge
  floor 50 %; stink-tower death chain from a zombie blast hits his side?; Helga kill raises a zombie?
- Targeting: chewer + lightning drone also nearest-first ("simple creatures")?; building over your own porch allowed (pull no-op + sound).
- Visuals: the plan's softer number pop 0.6→1.15→1 (not built — shipped pop kept); all fx tuning (look at Desktop/SPARK_Visuals_Pilot/*).
- Magic: per-race MRES table; boss MRES; Voltkin zap magic; RESIST look; draft Q1 (DEF pick raises MRES?); MRES card meaning/wording.
- Teams spec Qs (Desktop/SPARK_Teams_Spec.html); points race per seat vs per team; shared vision.
- Bots: personality names; S154 IMBA goblin-first for every style.
- Older: zombie RISEN reading A; CORPSE EATER eats buildings?; Voltkin welded TV stops re-summoning (S48); net FIX-2 second clause.

## C · CARRY-FORWARDS (LOW, logged)
gcp-vertex Imagen 404 (owner infra) · constitution STALE + env-diff hook drift WARN at boot (owner's OS) · infra alerts (nightly mirror,
MinIO) — owner, another session · statusline dead (token reading unavailable) · `.tmp-audit/` folders left untracked in worktrees ·
main-checkout `.tmp-magic-gates/ .tmp-raColumn.bak .tmp-rep.py` (delete denied twice — owner) · temp dir `…\Temp\m663` (owner OK to delete).
