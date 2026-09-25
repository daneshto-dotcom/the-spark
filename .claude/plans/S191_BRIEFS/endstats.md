# S191 BRIEF — `s191/endstats` (the owner's item 3: end-of-game stats)

**Worktree:** `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark\.claude\worktrees\s191-endstats` · **branch** `s191/endstats` from master `5f22e1d` (src = deploy #4, PROTOCOL 51).
**Rules:** `.claude/plans/2026-09-25_S191_BATCH_PDR.md` §4 (read it first). Progress `.claude/plans/S191_PROGRESS_endstats.md`.
**Step 0:** `npm ci` (captured `$?`); progress skeleton committed.

His words: *"we're gonna start working on the end of game stats we've already researched other games like dota like the command and conquer like red alert … how they finish and there's the stat graphs and everything … if we haven't designed already the specs of it In this session, we will also do that … And if we have designed … the specs, then we might as well implement it … and actually build them."*

## Step 1 — FIND THE EXISTING RESEARCH (he says it exists; the merge owner's quick grep of repo plans, handoffs and BACKLOG.md found nothing — so search wider before concluding it does not exist)
Search, case-insensitive, for `end of game|end-game|endgame|post-?game|stats screen|score screen|scoreboard|match summary|stat graph|timeline|Dota|Red Alert|Command (and|&) Conquer|StarCraft|Age of Empires`:
- the whole main checkout's `*.md` (incl. `.claude/plans`, `.claude/plans-archive`, `.handoff-archive`, `.claude/reflexion_log.md`, `BACKLOG.md`, `SPARK_TD_SESSION_SPECS.md`, `SPARK_RACES_SPEC*`), and `C:\Users\onesh\.claude\projects\C--Users-onesh-OneDrive-Desktop-Claude-Founder-DNA-Extension-Projects-The-Spark\memory\`;
- `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\BRAIN\` (grep only, read-only);
- `src/` for any existing stat counters (what is already counted: score, kills, `dynastyHpLost`, `healedFifths`, the draft picks, castle upgrades …).
Record every hit (path:line) in the progress file. Commit.

## Step 2a — IF a spec exists: implement it (follow Step 3's engineering rules), one commit per slice, then report.

## Step 2b — IF it does not: RESEARCH + SPEC (no product code)
Research how Dota 2, Command & Conquer / Red Alert, StarCraft II and Age of Empires II/IV end a match (score screen, per-player tables, graphs over time, awards/"MVP" lines) — WebSearch/WebFetch are fine; cite sources. Then write `.claude/plans/S191_ENDGAME_STATS_SPEC.md`:
1. **What SPARK should show** — a per-seat table and 2–4 graphs over time (per WAVE is the natural x-axis here) that fit THIS game: score / victory points, shapes gathered, structures built / lost, creatures spawned / killed, damage dealt / taken (on the ONE ladder, fifths), castle HP over time, the draft path (general + racial picks per wave), racial perk moments (Ra casts, dynasty Pharaohs, HELLSPAWN splits …). Mark each stat: already in state / needs a counter / needs sampling.
2. **Determinism + wire:** counters live host-side in the sim (no `Math.random`, no wall clock), sampled at wave edges; how the client gets them (e.g. one additive message at POSTGAME, or riding the final snapshot) and what that costs (protocol bump? size?). The worker mirror and host migration must keep them (four-sites).
3. **UI:** where it appears (the POSTGAME state — find how POSTGAME renders today: `grep -rn POSTGAME src`), an ASCII mock, and the bundle cost estimate (≤ 10 KiB budget).
4. **Build plan:** file-by-file, with the cost in hours — *"what does it cost, file by file"* (S182 lesson 8).
5. **Questions for the owner**, 3–6, each with a recommendation.
Commit, then **STOP and report**. The merge owner shows him the spec; implementation starts on his go, by message.

## Step 3 — implementation rules (when released)
Counters and samples on the ONE ladder; every new field through its four sites; the POSTGAME screen staged by its construction line (no zIndex — canon §7b); tests: counters through the real host tick over a scripted match, a host-vs-worker wide hash, the screen's model; the protocol verdict reported.

## File boundary
New files for the recorder and the screen; POSTGAME wiring (`main.ts` construction line only — hotspot rule); the four sites for any new field. Not `src/net/**` beyond one additive message if the spec needs it (report it), not `PROTOCOL_VERSION`, not the canon.
