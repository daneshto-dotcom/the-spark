# SPARK — Handoff S21 → S22
**Generated:** 2026-05-13 (post-S21 close)
**Branch:** master | **Last commit:** `f641b38` S21 Council deliberation + Voltkin scaffold
**Working dir:** `C:\Users\onesh\OneDrive\Desktop\The Spark`
**Live URL:** **https://spark-online.space/** (HTTPS, cert exp 2026-08-10 auto-renew)

═══════════════════════════════════════════════════════════
## QUICK SUMMARY

SPARK S21 was a **pure-deliberation session** — Full-tier Council ran on godly combo blueprint, user VETO'd D1 (Voltkin first), parallel-session scaffold built. Zero PDCA priorities executed; no `src/` code changes. The 1v1 retest GATE (S20 P0 outcome) is still open from S21 boot — brother had not playtested yet. S22 starts the real pipeline: §XV cleanups (transport.ts + lobbyScreen.ts), then godly infrastructure (godlyRecipes/, cutsceneOverlay.ts, GODLY_TRIGGER msg, cooldown, input-lock, Codex). S23 ships Voltkin (first godly) after side session delivers asset pack via `assets-source/godly-voltkin/READY.md`. S24 ships Anvil (second godly, full destruction Option A). S25+ Pac-Predator.

═══════════════════════════════════════════════════════════
## CURRENT STATE
- Build: passing (1m1s CI deploy) | Tests: 401/401 | Typecheck: exit 0 | Bundle: 397.65 KB
- Deployment: LIVE at https://spark-online.space/ | Latest deploy run `25780647334` success
- Git: master synced with origin/master at `f641b38`

═══════════════════════════════════════════════════════════
## SESSION COST (S21)
- Grok: 1 call (~$0.01) — DISRUPTOR R1 for godly blueprint
- Gemini: 1 call (~$0.02) — AUDITOR R1 for godly blueprint (gemini-2.5-pro)
- Total API: ~$0.03
- Real context at close: 184,315 / 1,000,000 (18.43% GREEN)
- Statusline dead at session start (statusline.pid stale 816736s); cost via direct MCP-call accounting

═══════════════════════════════════════════════════════════
## SESSION PIPELINE REPORT (S21 — deliberation-only)
Pipeline: Session PDCA v2 | Priorities: 0/0 executed | 184K/1M (18.43% GREEN)
- (none — S21 was Council deliberation + scaffold preparation, not PDCA execution)
- Council deliberation: Full-tier R1+R2 on godly combo blueprint, Battle Ledger amended by user VETO
- Scaffold: `assets-source/godly-voltkin/` 5 files (448 lines) committed `f641b38`

═══════════════════════════════════════════════════════════
## REFLEXION ENTRIES (S21 — 5 new + S13 pruned)
- S21 #full-tier-council-deliberation-without-pdca-priority-execution
- S21 #user-veto-on-domain-weighted-vote-is-supreme
- S21 #parallel-sessions-with-disjoint-paths-and-single-writer-state
- S21 #gen-ai-asset-pipeline-promoted-to-in-scope-tooling
- S21 #ip-safe-character-design-needs-upfront-anti-checklist-not-deferred-legal-review

═══════════════════════════════════════════════════════════
## CHANGED FILES (S21 cumulative)
```
assets-source/README.md                                          | NEW 0.9KB
assets-source/godly-voltkin/HANDOFF.md                          | NEW 7.6KB
assets-source/godly-voltkin/DESIGN_BRIEF.md                     | NEW 8.4KB
assets-source/godly-voltkin/ASSET_MANIFEST.md                   | NEW 2.2KB
assets-source/godly-voltkin/SIDE_SESSION_BOOT.md                | NEW 3.4KB
assets-source/godly-voltkin/{sprites,cinematic,audio,notes}/     | NEW empty dirs
.claude/session-state.json                                       | S20 → S21 rotation (empty priorities[], session_kind=deliberation+scaffold-only)
reflexion_log.md                                                 | +5 S21 entries, -5 S13 entries (50 cap maintained)
HANDOFF_2026-05-13.md                                            | NEW (this file); S20 handoff archived
boot-snapshot.md                                                 | regenerated for S22
```
**No `src/` changes this session.**

═══════════════════════════════════════════════════════════
## OPEN ISSUES / CARRY-FORWARD (S22+)

**TOP PRIORITY S22 P0 — 1v1 CONNECT user retest (still gated):**
S20 P0 commit `ed090fd` deployed; brother had not retested as of S21 close (it was night-time for them). F12 console output classifies outcome (GREEN/YELLOW/RED — see boot prompt for branching).

**S22 P1 — transport.ts §XV extraction (Standard, carry from S20):**
317 → ≤280 LOC. Options: extract `[net]` diagnostic + ICE-poll → `transport-debug.ts` (~80-100 LOC), OR extract `ICE_SERVERS` + `classifyJoinError` → `iceConfig.ts` (~50 LOC), OR codify §XV relaxation for net-layer.

**S22 P2 — lobbyScreen.ts §XV extraction (Standard, carry from S19):**
565 → ≤500 LOC. Extract candidates: HTML input overlay (~80 LOC), connection-lost overlay (~30 LOC), pure helper exports (~20 LOC).

**S22 P3 — Godly infrastructure (Standard, batch w/ P1/P2):**
Per S21 Council Battle Ledger (in this handoff §GODLY BLUEPRINT below):
- `src/state/godlyRecipes/` folder + spatial-hash matcher + per-recipe predicate API
- `src/render/cutsceneOverlay.ts` (≤280 LOC, asset-loader + skippable lifecycle)
- `GODLY_TRIGGER` message in `protocol.ts` + host-side validator + 60s cooldown state (tick-based)
- `controls.ts` asymmetric input-lock gate (active player input-locked during own cinematic only)
- `codexOverlay.ts` top-level screen + title-screen entry

**S23 P0 — Voltkin ship** (gated on side session `assets-source/godly-voltkin/READY.md`):
Wire Voltkin assets into cutsceneOverlay + define recipe (lightning-bolt silhouette + TV-frame silhouette adjacency within 200px) + counter recipe (3 Triangles in ground/rock arc → zap redirects to nearest neutral).

**S24 — Anvil ship (Standard, full destruction Option A per user):**
Recipe: rope-coil silhouette + pulley silhouette adjacency. Counter: 3 Triangles downward arc (trampoline → bounces to attacker's territory). Effect: target structure + all bonds vaporized (full destruction, parity with Voltkin). Imagen-generated b/w ACME-style sprite.

**S25+ — Pac-Predator** (autonomous AI entity, deferred — biggest build).

**Other carry-forward:**
- P0' Manual playtest verification (audio overlay + gradient + 1v1)
- P3 NET enhancements: client prediction + delta NetSnapshot + host migration + live cursor sync (Standard, playtest-signal-gated)
- P5 Phase-2 next mechanic (user picks: D/E/A/G)
- P7 Bond-hover cost preview (Standard — needs hit-test infra)
- P9 OGG compression (10 MB MP3 → ~2 MB OGG)
- PannerNode + auto-duck (S18 Grok#5 audio polish)
- HTTP-80 redirect on spark-online.space may 404 (non-blocking)

═══════════════════════════════════════════════════════════
## GODLY BLUEPRINT — Council Battle Ledger (S21 R2 synthesis, post-VETO)

**First-ship picks (in order):** Voltkin (S23, max hype) → Anvil (S24, full destruction) → Pac-Predator (S25+).
**Bluescreen:** DROPPED (both R1 reviewers killed it — too weak for hype-bomb).

**Locked decisions per Battle Ledger:**
- D1 First godly: **Voltkin** (user VETO override of Anvil synthesis)
- D2 Recipe arch: **new `src/state/godlyRecipes/` folder** with per-recipe sub-files + barrel `index.ts`
- D3 Cutscene render: **separate `src/render/cutsceneOverlay.ts`** (asset-driven, full-screen, ≤280 LOC)
- D4 Net sync: **`GODLY_TRIGGER` message** in protocol.ts; HOST validates recipe + cooldown server-side
- D5 Pause semantics: **NO freeze of world.tick** (cinematic uses wall-clock overlay); world keeps ticking to avoid 10Hz net desync
- D6 Counter window: **full sustained-effect window** (8-10s), not just cinematic 3s
- D7 Cooldown state: **`player.godlyCooldownEndsAtTick`** (tick-based)
- D8 Codex UI: **new `codexOverlay.ts`** top-level screen (MK-style); title-screen entry
- D9 Asset loading: **per-godly mode** — Anvil preload (~50KB), Voltkin lazy-load (video 1-3MB)
- D10 IP threshold: **vibe-not-likeness** as policy + Voltkin design constraints (chunky blob, no pointy ears, no red cheeks, no zigzag tail)
- D11 Gen-AI pipeline: **Imagen for sprites, Veo for cinematics, TTS for voice** — first-class tools now
- D12 Recipe matcher: **spatial-hash + per-recipe predicate**, detection on BOND_FORMED event only (not every tick)

**PRIME-AUDIT catches (7 items, all addressed):**
- Asymmetric input-lock during cinematic (active player only, opponent can still build counter)
- Counter-recipe rate-limit during opponent's godly window
- USPTO TESS check on "Voltkin" name (Phase-1 task in side session)
- Cooldown enforcement HOST-side (anti-cheat)
- Anvil counter recipe defined (3 Triangles downward arc → trampoline bounce-back)
- Empty Codex on first-ever 1v1 (zero locked tiles) to preserve brother-surprise
- §XV existing violations addressed first (S22 P1/P2 before P3 godly infra adds new modules)

**User-locked behaviors:**
- ≤3s pause for cinematic, CONTINUE during sustained 8-10s effects
- 60s cooldown per godly per player
- NO in-game hints (discovery is meta-game), Codex unlocks in pre-game settings (MK-style)
- Each combo own art language/genre: Voltkin = Pokémon Origins colorful cartoon, Pac-Predator = pixelart, Anvil = b/w Looney Tunes hand-drawn

═══════════════════════════════════════════════════════════
## PARALLEL SESSION COORDINATION (NEW S21 WORKFLOW EXCEPTION)

**Authorized exception to CLAUDE.md "solo workflow / one session per project" rule, scoped to asset generation only.**

**Two sessions running in parallel:**
| | Main session | Side session |
|---|---|---|
| Identity | S22 linear pipeline | "Voltkin pack" task-scoped (no S## number) |
| Scope | `src/` only | `assets-source/godly-voltkin/` only |
| State file | Owns `.claude/session-state.json` | None (writes own `notes/iteration-log.md`) |
| Handoff doc | `HANDOFF_<date>.md` canonical | None — `READY.md` signal at end |
| Git push | Frequent (per priority) | ONCE at end after `READY.md` |
| Pull-rebase | At boot only | Immediately before final push |
| Reflexion log | Writes here | None |

**Why this works:** Disjoint paths + single-writer state files = zero merge-conflict surface. Side session pushes once → minimal push-race window. If race occurs: pull-rebase is conflict-free because paths don't overlap.

**Side session entry:** `assets-source/godly-voltkin/SIDE_SESSION_BOOT.md` has paste-ready first message.

═══════════════════════════════════════════════════════════
## SESSION RULES (S21 — no LOCKED amendments this session)
- §13.1 v5, §7 module tree, §13.14 audio, §13.11 SEVER_BOND semantics — all stable from S20
- §XV anti-bloat: transport.ts 317 LOC (S22 P-extract), lobbyScreen.ts 565 LOC (S22 P-extract)
- Git: master only, push at every commit, identity = daneshto@gmail.com
- GitHub Pro upgraded 2026-05-12 — 3,000 Actions min/mo, larger runners, LFS 1GB available
- Parallel-session workflow exception authorized — see above table

═══════════════════════════════════════════════════════════
## QUICK COMMANDS
```bash
curl -sI https://spark-online.space/                                    # HTTP 200 ✓
gh run list --limit 3                                                   # latest deploys
npx vitest run                                                          # 401/401
npx tsc -b --noEmit                                                     # exit 0
npm run dev                                                             # port 15842
ls assets-source/godly-voltkin/READY.md 2>/dev/null && echo "side ready" || echo "side in progress"
```
═══════════════════════════════════════════════════════════
## FULL ARCHIVES
→ This file at root.
→ `.claude/plans-archive/2026-05-12_PDR_Session_20_COMPLETED.md` (S20 PDR)
→ `.claude/plans-archive/2026-05-12_PDR_Session_20_Council_P{0,1,3}_BattleLedger.md` (S20 Council)
→ `.handoff-archive/HANDOFF_2026-05-12_S20close_archived_at_S21.md` (prior S20 handoff)
═══════════════════════════════════════════════════════════
1v1 retest is the gate. Side session may be in progress in parallel. Two boot prompts follow.
═══════════════════════════════════════════════════════════
