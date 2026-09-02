═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-08-19
Session: S148 — the quadrants, a rebuild-vs-adapt audit, and the playtest fixes
═══════════════════════════════════════════════════════════

## PROJECT
- Name: SPARK (Founder DNA extension project)
- Working directory: `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark`
- Git branch: `master` · Latest commit: `986b8b5` pre-handoff coherence audit
- Tech stack: TypeScript · Pixi.js · Vite · Vitest · Playwright · Trystero/WebRTC · GitHub Pages
- Codebase: 51,181 LOC across 193 source files; 185 test files
- **PROTOCOL_VERSION 25** (bumped 24→25 this session)

## CURRENT STATE
- Build: **PASS** — entry `index-DMU7pb7t.js` 689.1 KiB, cap 900 KiB, 210.9 KiB headroom
- Tests: **2,506 passing / 162 files** · tsc **0 errors** · e2e:gating **45/45**
- Deployment: **LIVE, deploy-verified 4/4** (REMOTE/RUN/VERDICT/LIVE all agree at `986b8b5`)
- Multiplayer: 3-peer host-migration and 2-peer reconnect **PASS over real WebRTC**; 4-peer FFA times
  out at the connection stage (CF-S148-d, non-gating quarantine lane)

## SESSION COST
- Model split: all-Opus (ALWAYS-STRONGEST policy) — no routing telemetry beyond tier
- Context at close: **~570K / 1,000,000 (57% YELLOW)**
- External API: Grok 0 calls ($0.00) · Gemini 0 calls ($0.00) — no Council ran (owner ruled skip)

## THIS SESSION'S WORK

**P1 — THE QUADRANTS (protocol 24→25), live.** New `src/state/zones.ts`: `PITCH_2P` (vertical split,
goalmouth castles) and `QUADRANTS_4P` (cross split, corner castles in clock order). `zoneOf` is TOTAL —
every pixel returns a zone or `null` for the shared quarry, which is evaluated first by squared
distance and belongs to nobody. `layout` became a hashed, wire-carried World field across all nine
sites (only FIELD_COVERAGE is tsc-forced; the other eight are silent). `castleAnchor` is now a zone
lookup across 13 consumers; `KEEP_RING_SEATS`/`KEEP_RING_RADIUS` deleted. Economy MEASURED, not
guessed: the haul goes 295→800.7 px (2.71×), `GATHERER_BASE_SPEED` 1.9→2.6.

**P0 — REBUILD-VS-ADAPT AUDIT (owner-demanded).** Artifact:
https://claude.ai/code/artifact/cb2ef411-646f-451b-82ee-55dda87e4ecf
Verdict: **do NOT rebuild, but stop adapting incrementally — run a deliberate demolition pass.**
~16,491 LOC of infrastructure a rebuild forfeits (2,498 tests, 25 protocol versions, 989 commits since
May) and none of the playtest defects live there. But ~4,051 LOC is already dead or dormant. **Audited
the S146 audit that justified ADAPT and found it unreliable**: 3 claims wrong ("3 refusal sites" is
SIX; "420→~1100px" is 295→800.7px; "~40k lines" is 51,369) and 3 problems invisible to it.

**P2 — THE OPENING IS FAIR AND WEAPONS DIFFER, live.** Root defect was not the goblin: every defender
dealt a shared `CREATURE_HIT_DAMAGE = 1` at one call site, so HELGA needed six slaps and the "slow
heavy beam" laser needed six too — **no weapon could be stronger than any other**. `damageVsCreature`
is now per-kind on the compile-time-exhaustive `DefenderConfig` (HELGA 2 strikes, laser 1, stink stays
area). Deleted the bots-only free pentagram + lightning hub (436 LOC module) and the starter-goblin
grant (R49 reverses the owner's own S139 ruling, confirmed). Opening is now castle + one gatherer +
100 points, symmetric.

**Pre-handoff coherence audit.** Wrote `layoutWire.test.ts` because the wire path had ZERO coverage —
now proves a joiner adopts the host board and every castle POSITION matches. Corrected the two refuted
figures at source in both roadmaps and stamped S147/S148 as shipped. Fixed 3 stale comments pointing
at deleted files.

## OPEN ISSUES
- **CF-S148-a (real, unfixed):** R22 is violated on disk — the quarry keeps producing sparks during
  FIGHT because the spawner never reads `world.matchPhase`. One guard at the dispatch site.
- **CF-S148-b:** `creatureSpawners` is an acknowledged hole in the differential HARD GATE (was seeded
  only by the deleted pentagram; an injected spawner is torn down within a tick). Proper fix = the
  goblin tower's own geometry.
- **CF-S148-c:** `e2e/bomb.spec` intermittently flaky (~2 failures in 7 runs, 44s–1.2m runtime, near
  its timeout). Failed before P2 existed, so not a regression.
- **CF-S148-d:** 4-peer `nplayer` FFA times out at peer connection. NOT proven pre-existing.
- **CF-S147-b:** the 5-site protocol-bump checklist still lives only in a test comment; drift 5×.
- CF-S147-c/e, CF1, CF3 inherited unchanged.
- **P5 build legality attempted and REVERTED** — see NEXT STEPS #2.

## BLOCKED ON
Nothing. ⚠ Owner is playtesting **2-player multiplayer with a friend** next session and will report
defects mid-build — expect an interrupt-driven session.

## NEXT STEPS (priority order)
**Immediate**
1. **P3 — THE CASTLE BECOMES REAL** (R29/R10/R20): HP, guns, elimination, placings. Protocol 25→26.
   The piece that gives the match stakes. Start fresh — it is the biggest remaining item.
2. **P5 — OWN-ZONE BUILD LEGALITY.** ⚠ Attempted and reverted: six one-line edits, typechecks clean,
   **breaks 17 tests across 8 files** because the behaviour is correctly new (seat 1 owns the RIGHT
   half; the quarry is unbuildable). Budget a full priority.

**Short-term**
3. **P4 — DEMOLITION (R52):** delete hazards / NONET / probe harness (~4,051 LOC + ~20 World fields).
4. **P6 walls** (R5/R17/R39) → **P7 colour-is-a-race lobby picker** (R45).

**Medium/long**
5. Towers + target preference (R8/R31/R40) → FIX/SCRAP (R13) → **travelling projectiles that get
   blocked** (R35/R37/R38 — the one that makes walls pay off twice) → goblin tower + six goblins →
   roster → modes → balance (R30).

## CHANGED FILES
41 files changed this session. Headlines: `src/state/zones.ts` (+218 new), `zones.test.ts` (+28 cases),
`layoutWire.test.ts` (new), `defenderDamage.test.ts` (new), `zoneEconomy.test.ts` (new),
`gatherers/gatherer.ts`, `gameMode.ts`, `save.ts`, `stateHashFull.ts`, `workerSim.ts`, `worldTypes.ts`,
`net/protocol.ts`, `constants.ts`, `defenders/defender.ts` + `defenderLifecycle.ts`;
**deleted** `spawners/botSpawnerSeed.ts` + its test.

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: **3 completed / 8 total** | ~570K/1M (YELLOW)
- P1 THE QUADRANTS — completed — `4620caa` — deploy 4/4
- P0 REBUILD-VS-ADAPT AUDIT — completed — documentation + artifact
- P2 OPENING FAIR + WEAPONS DIFFER — completed — `5975876` — deploy 4/4
- P3 castle HP · P4 demolition · P5 legality · P6 walls · P7 races — pending

## REFLEXION ENTRIES (this session)
20 entries appended to `.claude/reflexion_log.md` (pruned to 47). Highest signal:
- the owner was right that my adapt-verdict came too fast — audit the EVIDENCE a verdict rests on
- the root defect was not the thing the owner named (goblin → shared defender damage)
- three families were only ever tested by accident
- the destructive guardrail caught a real loss, not a false positive
- my own verification needles broke the gate that guards verification
- I reported a failure as a flake, then checked and it reproduced

## CARRY-FORWARD PRIORITIES
1. **P3 Castle HP + elimination** — not started (context) — amendment drafted, PC section
2. **P5 Own-zone build legality** — attempted, reverted, blast radius measured and recorded
3. **P4 Demolition** — approved by owner (R52), not started
4. **P6 Walls · P7 Races** — planned, not started

═══════════════════════════════════════════════════════════
