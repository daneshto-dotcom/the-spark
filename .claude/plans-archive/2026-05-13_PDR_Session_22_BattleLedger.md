# Battle Ledger — S22 Full-tier Council (PDR Batch P1+P2+P3+P4)

**Date:** 2026-05-13 | **PDR:** `.claude/plans/PDR_Session_22.md` | **Tier:** Full (2 rounds + quality gate)
**Signals fired:** `security_sensitive` (host-validated cooldown, anti-cheat), `external_user_facing` (Codex, cinematic), `novel_mechanism` (godlyRecipes folder, GODLY_TRIGGER msg, cooldown state)
**Participants:** Claude (Prime Architect 1.75 on impl), Grok (Disruptor 1.75 on risk/logic), Gemini (Auditor 1.75 on quality/creative)
**R1 status:** GROK 5+ challenges + 7 new risks ✓ | GEMINI scorecard + 4 creative props ✓ | **Quality Gate PASS**

---

## Triumvirate Positions (1-line)

- **Claude:** "Carry S21 D1-D12 locks faithfully. Folder architecture supports Anvil/Pac-Predator at S24+. Effects-drain hook preserves reducer purity."
- **Grok:** "P3 over-engineered for 1 recipe; collapse 8 files to 1 godlyManager. Tick cooldowns lag-fragile. Use Rive/Lottie. Replace TV-frame bbox with primitive tag. R13 bundle, R15 trigger race, R17 mp4 fail unmitigated."
- **Gemini:** "P1/P2 5/5/5 — pure refactor wins. P3 sound architecture 4/3/5. P4 quality CAP=3 because rect-bbox heuristic is fragile. Creative ceiling: Imagen silhouette mask + Imagen pre/post sprite sheets + WaveNet voice retake → B+ → A+. ROI mostly worth it."

---

## Battle Ledger

| # | Decision | Claude | Grok | Gemini | Authority (1.75) | Resolution | Tok Δ | Risk Δ |
|---|----------|--------|------|--------|------------------|------------|-------|--------|
| 1 | P1 extraction (transport.ts 317→≤280) | KEEP | CHALLENGE "pointless micro-churn" | KEEP (5/5/5) | Impl (Claude) + §XV policy | **KEEP** — §XV is locked project rule; Grok's YAGNI valid in vacuum but the rule predates this PDR | 0 | 0 |
| 2 | P2 extraction (lobbyScreen → 565→≤500) | KEEP | AGREE | KEEP (5/5/5) | unanimous | **KEEP** | 0 | 0 |
| 3 | godlyRecipes folder (D2 from S21) | KEEP 4 files | COLLAPSE to 1 godlyManager.ts | KEEP (4/3/5) | Impl (Claude); S21 D2 user-VETO locked | **KEEP folder** but **DROP spatialHashMatcher.ts** (1v1 ≤100 structures = O(n²) brute-force <1ms). 3 files: index.ts + types.ts + voltkin.ts. Matcher inlined ~30 LOC in main.ts effects-drain. | −90 LOC, −1 file | −1 (less surface) |
| 4 | Cooldown: tick-based vs wall-clock | tick-based | wall-clock | (silent) | **Solomon split**: Risk (Grok 1.75) ⟷ Impl-determinism (Claude 1.75) | **SYNTHESIS** — KEEP tick-based for authoritative state (cooldown is part of host-validated game state + must replay-deterministically through save.ts:netSnapshot()). Add wall-clock-derived UI hint for the seconds-remaining display. Both 1.75 domains satisfied. (PRIME-AUDIT Δ4 procedural correction.) | +5 LOC (UI conv) | 0 |
| 5 | BOND_FORMED hook site | effects-drain in main.ts | reducer with deferred dispatch | (silent) | Impl (Claude) + existing pattern | **KEEP effects-drain.** AudioManager + effectsRenderer already drain effects → adding one more consumer = consistent pattern. Reducer stays pure. Documented §4. | 0 | 0 |
| 6 | TV-frame recipe predicate (R11) | crude rect-bbox v1 | explicit `GodlyTarget` primitive tag | Imagen silhouette mask | Risk + Quality (Grok 1.75 + Gemini 1.75 = 3.5 vs Claude 1.0) — **OVERRULED** | **ADOPT silhouette-component approach.** SPARK already has `src/render/effects/silhouettes/` infrastructure (S17). Register a "TV_FRAME" silhouette pattern there. Predicate matches by silhouette-component ID, NOT by geometric bbox heuristic. Cheaper than Imagen-mask (no new asset), cleaner than primitive-tag (no UI extension), uses existing infra. | +30 LOC silhouette pattern | −3 (R11 mostly eliminated) |
| 7 | mp4 mobile Safari fail (Grok R17) | PDR R2 timeout→fallback | "no fallback coded" | (silent) | Risk (Grok 1.75) | **ADOPT** + sharpen: HTMLVideoElement playsinline + muted=false with .catch fallback; 5s load-timeout; on fail → instant SEVER_BOND + skip cinematic, log warn. Test added. | +15 LOC + 1 test | −2 |
| 8 | Async cinematic test coverage (Grok R19) | implied | "no async cinematic timeout/perf assertions" | (silent) | Risk (Grok 1.75) | **ADOPT** — add `cutsceneOverlay.test.ts` covering: 5s timeout, skip via Space/Esc, asset-load failure path. | +2 tests | −1 |
| 9 | Client-side trigger races (Grok R15) | PDR R4 (client queues) | host-only predicate but client cinematic on broadcast — desync if lag > RTT/2 | (silent) | Risk (Grok 1.75) | **CODIFY** — client NEVER runs the recipe predicate locally. Predicate is host-only. Client renders cinematic ONLY on receiving host-broadcast GodlyTriggerMsg. No client-side detection path at all. (PDR already implies this — make it explicit.) | 0 (clarification) | −2 |
| 10 | Bundle bloat (Grok R13) | static via public/ | "3.62MB bundle killer" | (silent) | Risk (Grok 1.75) | **CLARIFY** — Vite serves `public/godly/voltkin/` as static files, NOT bundled into JS. Initial JS bundle stays ~398KB. mp4 lazy-loaded on first eligible BOND_FORMED (host-side trigger). Risk dismissed with documented evidence. | 0 | 0 |
| 11 | Counter-window UX cue (Gemini Q6) | not addressed | (silent) | "Color tint, timer ring, screen vignette" | Quality (Gemini 1.75) | **ADOPT minimal** — 8s screen-edge vignette in Voltkin yellow (#FFD60A) at low alpha (0.15) for opponent during sustained-effect window. Cheap (~20 LOC in main.ts using existing Pixi Graphics). | +20 LOC | −1 (better UX) |
| 12 | Codex tile from idle-2 sprite (Gemini Q4) | undefined | (silent) | reuse idle-2 (256×256) | Quality (Gemini 1.75) | ~~**ADOPT** — locked tile = idle-2 alpha-0.15 + grayscale filter; unlocked tile = full-color idle-2. Pixi handles client-side resize from 512→256.~~ **INVALIDATED by row 21 user directive 2026-05-13.** idle-2 is off-model. Codex tile uses `voltkin-zap.png` canonical (locked = grayscale α 0.15, unlocked = full color). | 0 (uses shipped assets) | 0 |
| 13 | Imagen pre/post cinematic sprite sheets (Gemini Q1, Q2) | particle-system code-only | (silent) | "Imagen 12-frame shatter + reality-overload sprite sheets" | Quality (Gemini 1.75) | **DEFER** — recognized as B+ → A+ uplift, but adds 30+ min asset session + new lazy-load step + breaks "1 batch this session" cadence. Track as S24 follow-up backlog item ("Voltkin polish v1.1: pre/post-cinematic sprite sheets via Imagen"). | 0 (deferred) | 0 |
| 14 | WaveNet voltkin-voice retake (Gemini Q3) | reuse shipped Puck OGG | (silent) | "GCS TTS WaveNet + Audacity pre-process" | Quality (Gemini 1.75) | **DEFER** — side session already shipped Puck + archived Fenrir/Kore alternates. Re-roll reserved for post-playtest dissatisfaction signal. ConvolverNode at runtime stays the v1 reverb path. | 0 (deferred) | 0 |
| 15 | Imagen Codex button (Gemini Q5) | match existing Settings button | (silent) | "yellow crystalline button with cyan arc" | Quality (Gemini 1.75) | **DEFER** — low-ROI polish vs token cost. Match existing button style in v1; revisit in S24 cinematic-polish pass. | 0 (deferred) | 0 |
| 16 | Rive/Lottie cinematic alt (Grok alt-approach) | Pixi+mp4 | "LottieFiles or Rive — 70% smaller buttery cinematics" | (silent) | Risk + dependency_risk | **REJECT** — adds new top-level dep + Pixi-Rive plugin + asset re-authoring (Veo mp4 already shipped). Dependency_risk signal would force +1 round. Cost-benefit: rebuild what side session already delivered. Track as S25+ exploration if mp4 perf becomes blocker. | 0 | 0 |
| 17 | Nostr relay rate-limit on GODLY_TRIGGER (Grok R18) | not addressed | "spam = rate-limit/toxicity flags" | (silent) | Risk (Grok 1.75) | **CLARIFY low concern** — 60s host-validated cooldown × 2 players → max 2 msgs/120s. Nostr relays handle 1000s msg/sec. Risk dismissed. | 0 | 0 |
| 18 | WebWorker matcher offload (Grok alt) | main thread | "offload to WebWorker, zero main thread impact" | (silent) | Risk (Grok 1.75) | **REJECT** — 1v1 ≤100 structures × predicate O(n²) brute-force <1ms. WebWorker adds postMessage overhead + serialization cost > matcher cost. YAGNI. | 0 | 0 |
| 19 | Reducer-purity violation on effects-drain hook (Grok R16) | "effects-drain not reducer" | "future maintainer nightmare" | (silent) | Impl (Claude 1.75) | **REJECT** — effects-drain consumer pattern is established (audioManager + effectsRenderer). Adding godly matcher as third consumer = consistent. Not a purity violation; it's a SIDE-effect of an effect-drain (CQS-clean by design). | 0 | 0 |
| 20 | Codex empty default on first 1v1 (D8 + PRIME-AUDIT-S21 #4) | KEEP | (silent) | (silent) | unanimous lock | **KEEP** | 0 | 0 |
| 21 | **Voltkin canonical sprite lock** (user feedback 2026-05-13 post-R2) | n/a | n/a | n/a | **USER directive (supreme over Council)** | **LOCK `voltkin-zap.png` as v1 canonical.** Other 5 character poses (idle-1, idle-2, charge, victory, hurt) fail consistency gate — at least 4 distinct designs across the 6 character sprites. Move off-model to `assets-source/godly-voltkin/sprites/off-model-v1/` + README. v1 ships ONE canonical sprite + the cinematic. Codex tile uses voltkin-zap.png (invalidates Battle Ledger row 12's idle-2 plan). | 0 (uses 1 of 9 shipped) | 0 |
| 22 | **Cinematic white background fix** (user feedback) | mp4-as-is | (silent) | (silent) | **USER directive** | **ADOPT luma-key shader.** CREATE `src/render/cinematicLumaKey.ts` (≤80 LOC) — PixiJS Filter with fragment shader converting luma>0.88 → alpha=0, soft 5% edge fade. White bg→transparent, yellow body preserved (luma ≈ 0.77). Reusable for all future cinematics. Preview-verify threshold at exec. NO asset re-roll needed. | +80 LOC, +1 file | −1 (whitespace artifact eliminated cleanly) |
| 23 | **"Make it actually GOOD" — walk/attack/proper animation** (user feedback) | n/a | n/a | n/a | **USER directive — defer with explicit roadmap** | **DEFER to S24 Voltkin v2 asset pack.** Side session task: regenerate full pose set (walk 4-frame, attack-charge 4-frame, idle bob 2-frame, matched victory+hurt) all locked to Round-Zap canonical. ~$5-10 Imagen + 1-2 hrs. v1 ships canonical-sprite-only + cinematic-IS-the-animation. Backlog row added. | 0 (S22) / future side session | 0 |

---

## Quality Scorecard (Gemini, post-synthesis)

| Dimension | R1 | R2 (post-synthesis) |
|---|---|---|
| Quality | 4 | 4.5 (silhouette-pattern lifts P4 from 3 to 4.5; Imagen creative deferred not subtracted) |
| Efficiency | 3 | 3.5 (−1 file, −90 LOC, no new deps) |
| Tool Utilization | 3 | 3 (Imagen/Veo/TTS deferred — defer ≠ failure) |
| Completeness | 5 | 5 |

---

## Veto Log

No vetoes used. Vetoes preserved for execution-time PRIME-AUDIT or unforeseen scope creep.

---

## Risk Consensus (Post-Synthesis)

**Agreed (mitigated in PDR):**
- R1 multi-bond race (ordering by tick+bondId + cooldown gate)
- R2/R17 mp4 load failure (5s timeout → SEVER_BOND fallback + playsinline + test)
- R3 input-lock race (host-auth `activeCinematicPlayerId`)
- R4/R15 client trigger desync (client queues msg; client NEVER runs predicate)
- R5 codex spoilers (empty default + unlock on success only)
- R6 trademark (5 fallback names ready, code uses `'voltkin'` string literal)
- R7 60Hz hot-path (effects-drain, host-only, O(n²) <1ms)
- R8 bundle (static via public/, no JS bundle delta)
- R9 protoVersion bump narrowing (parseNetMessage validator + tests)
- R10 D5 reinterpret OK (no world.tick exists; main.ts loop unchanged)
- R11 TV-frame predicate (→ silhouette-component pattern; bbox eliminated)
- R12 reducer purity (→ effects-drain, consistent with existing pattern)
- R13 bundle clarified static
- R14 60Hz throttle moot (effect-driven)
- R16 reducer purity reject (CQS pattern preserved)
- R18 Nostr rate-limit moot (cooldown gate)
- R19 async test coverage (added cutsceneOverlay.test.ts)

**Unresolved → carry to PRIME-AUDIT:**
- Imagen polish opportunity (creative ceiling) — explicit backlog row, not blocking S22

---

## Joint Plan (PDR Amendments)

The following edits land in `.claude/plans/PDR_Session_22.md` (synthesis-merged scope):

1. **§2 P3 NEW FILES** — DROP `spatialHashMatcher.ts`. Replace with: "matcher inlined in main.ts effects-drain (~30 LOC, host-only gate)." Net: 3 files in godlyRecipes/ instead of 4.
2. **§2 P3 NEW FILES** — ADD `src/render/effects/silhouettes/tvFrame.ts` (~40 LOC) registering the TV_FRAME silhouette pattern in existing infra.
3. **§2 P4** — REPLACE "crude rect-bbox heuristic" with: "predicate matches by silhouette-component IDs (lightning-bolt + tv-frame), centroid-distance <200 px between components, triggerer-owns-lightning gate."
4. **§2 P3 MODIFY** — ADD `src/render/cinematicVignette.ts` (~30 LOC) — opponent-side yellow vignette overlay during 8s sustained window.
5. **§2 P3 cooldown** — ADD note: UI displays seconds-remaining via wall-clock conversion in render layer; authoritative cooldown stays tick-based.
6. **§5 risks** — ADD R20 (mobile Safari mp4 autoplay block, mitigated playsinline+catch+fallback), R21 (Codex spoiler-on-unlock — only unlocks on host-validated success, never on local detection).
7. **§6 testing** — ADD `cutsceneOverlay.test.ts` (5s timeout + skip + asset-fail), `parseNetMessage.test.ts` (protoVersion 2 + GODLY_TRIGGER narrowing).
8. **§9 context budget** — −5K from P3 (file drop); +5K reallocated to PRIME-AUDIT + Triumvirate CHECK overhead.

**Backlog carry-forwards (NOT this session):**
- **S24 "Voltkin v2 asset pack" (user-driven, NEW)**: side-session Imagen task regenerating walk cycle + attack-charge + idle bob + matched victory/hurt poses all locked to `voltkin-zap.png` Round-Zap canonical. Strict consistency gate this time. ~$5-10 + 1-2 hrs.
- S24+ "Voltkin polish v1.1": Imagen pre/post sprite sheets, Imagen Codex button, WaveNet voice re-roll if playtest signals dissatisfaction.
- S25+ "Rive/Lottie cinematic exploration": only if mp4 perf becomes a blocker.

---

## Confidence

**HIGH.** All R1 dissent addressed via SYNTHESIS or documented REJECT. Sole quality-ceiling concern (Imagen polish) explicitly deferred not silently dropped. Architecture preserves S21 D1-D12 locks while incorporating Grok's load-bearing risks (R15/R17/R19) and Gemini's quality-lift (silhouette pattern). No SPLIT items.

---

## User Decision Gate

**APPROVE / VETO / ADJUST [specific row #]** required before execution.

**Rule 21 A.0:** Complete (§0 of PDR).
**Rule 16 Scope Amendment:** Not yet triggered (no follow-up user request).
**Rule 17 Deliberation:** R1 + Quality Gate ✓ + R2 ✓. PRIME-AUDIT next.
