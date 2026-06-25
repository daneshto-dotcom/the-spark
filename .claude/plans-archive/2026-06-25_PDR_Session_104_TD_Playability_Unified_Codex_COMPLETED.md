# PDR — Session 104: TD Playability + Unified In-Game Codex (FULL tier, batch)

Generated: 2026-06-25 · Branch: master · Base commit: 384e3de
Tier: **Full** (>30K, multi-file, determinism + protocol + new input layer + new UI). Batch of 5 priorities, one approval, executed sequentially.
Unlock: `unlock_source: user` — owner directive "do all of that this session and the carry forward … work thoroughly and methodically … highest quality" (S104 boot message).
Deliberation: 3-lens adversarial council (determinism / gameplay / architecture) + PRIME-AUDIT. Verdict **ADOPT-WITH-FIXES**.

---

## FIELD 1 — OBJECTIVE
Make the S103 tower-defense suite **actually work and feel alive in a real playtest**, and give the player an in-game reference for how to build everything:
1. The chewer structure **continuously produces** chewers (~1 / 15s) instead of hard-stopping at 2, and **every chewing chewer is audible**.
2. The **turret (and HELGA / Voltkin-zap) visibly works in vs-bots** — because the bot now produces *enemy* chewers for the defenders to kill.
3. A single **in-game CODEX** (G+C chord) with 3 tabs — **GODLY COMBOS / COMBOS / TOWERS & STRUCTURES** — each entry showing what it is + **how to build it**, unlock-gated.
4. Carry-forward: register the orphaned PENTAGRAM_RECIPE, a light recipe-build hint, and the deferred Tier-1 **G4 build-feel juice**.

## FIELD 2 — ROOT CAUSES (verified by direct code trace)
- **Stops-at-2:** `CHEWER_MAX_PER_SPAWNER=2` (constants.ts:788) is a **concurrent** cap (underChewerCaps, creatureLifecycle.ts:157) AND `CHEWER_CONFIG.lifetimeTicks=1e9 + persistent:true` (voltkin-config.ts:220) ⇒ chewers **never despawn**. Nothing kills them in vs-bots ⇒ permanent block at 2. Spawn poll: main.ts:1108 (`nextSpawnTick += 900`).
- **Turret vs-bots:** botBrain.ts never builds a spawner/godly/defender ⇒ **zero enemy chewers** ⇒ defenders (enemy-only targeting) have nothing to shoot.
- **No chew sound:** `playGnawSFX` exists (audioManager.ts:1010) but fires only on actual connector-bites via a host-local `CHEW_BITE` — sparse + client-silent.
- **Codex:** two overlays + two startup buttons; godly recipe `kind` already partitions into the 3 tabs; gaps = no in-game keybind layer + spawner/defender ignition never calls `unlockGodly`.

## FIELD 3 — SCOPE (priorities, sequential)
**P1 — Chewer continuous production + audible chewing**
- Give chewers a **finite lifetime** (churn) so the 15s cadence keeps producing; reconcile with the `persistent` despawn gate (trace it first — MUST-FIX D2) keeping the despawn tick-pure + the green-goo death VFX.
- Raise `CHEWER_MAX_PER_SPAWNER 2→5`, `CHEWER_MAX_GLOBAL 8→16` (sanctioned playtest raise per TOWER_DEFENSE_DESIGN.md; note 1v1 wire cost).
- **Render-driven chewing-loop SFX** in chewerRenderer (mirror playSplatSFX death-watcher): each chewer in its chewing state gnaws on a per-creature debounced cadence — host + client, zero wire.
- DETERMINISM: re-record chewer-present golden baselines (2-seed verified each); no-chewer / Voltkin-only replays stay byte-identical.

**P2 — vs-bots TD playability**
- Teach the bot to construct a **chewer spawner** (deterministic pentagram ring of 5 triangles near home, seeded RNG fixed draw-order) so ENEMY chewers exist and the player's turret/HELGA/Voltkin visibly work. Gate on bot difficulty (not beginner).

**P3 — Unified in-game CODEX + G+C chord**
- One lazy tabbed overlay: **GODLY COMBOS** (cinematic recipes) / **COMBOS** (Magic-14) / **TOWERS & STRUCTURES** (spawner+defender recipes); per-tab unlock gating; **human-readable "how to build"** per entry (shape arrangement).
- **unlock-on-build** for spawner/defender (render-loop mirror of world.creatureSpawners/defenders, host+client; + host ignition unlock) — closes the never-unlocks gap.
- **G+C held-chord** input layer in main.ts (pressed-set keydown/keyup, fire-once latch; guard input fields / NONET / cinematic; works during PLAYING).
- Startup: remove the COMBOS button; keep ONE CODEX button → opens the unified overlay (also via G+C in-game).

**P4 — Carry-forward (light):** register PENTAGRAM_RECIPE; lightweight TD recipe-build hint (highlight/"connect to the hub").
**P5 — Tier-1 G4 build-feel juice:** bond-formation burst + in-world leader crown (pure render, synced-tick deterministic).

**Out of scope (deferred, logged):** TD connector visible-damage (Bond.hp render); death-VFX recentDeaths fallback (conditional on playtest misses); wire delta-encoding; host-migration. Art = ORIGINAL (no franchise copying).

## FIELD 4 — TUNING DEFAULTS (owner retunes by feel)
- `chewer lifetimeTicks ≈ 3600` (60s) · `CHEWER_MAX_PER_SPAWNER = 5` · `CHEWER_MAX_GLOBAL = 16`.
- Rationale: steady-state ≈ lifetime/cadence = 60/15 ≈ 4 concurrent/spawner (cap 5 headroom); 60s lets a chewer sever ~9 connectors so churn doesn't weaken the siege; global 16 = the sanctioned next playtest step (orig design intended 14).

## FIELD 5 — MUST-FIXES (council)
- **D1** Re-baseline chewer-present goldens (2-seed each); keep no-chewer replays byte-identical.
- **D2** Trace `persistent` semantics before changing lifetime; ensure despawn stays tick-pure + targeting unchanged.
- **D3** Bot spawner construction deterministic (seeded RNG, computed ring, fixed draw order).
- **G1** Bot spawner gated on difficulty (no beginner swarm-stomp).
- **A1** Global cap 16 + note 1v1 wire cost (lower or delta-encode later if perf degrades).
- **A2** Keep unified overlay LAZY (off the 750 KiB entry); chord lives in main.ts, not controls.ts.

## FIELD 6 — TESTING / VERIFICATION
- tsc 0; full vitest green (+ new tests: chewer lifetime/despawn determinism, raised-cap behavior, bot-spawner formation + 2-seed determinism, chord-decision pure fn, unlock-on-build, codex tab/data).
- Re-recorded chewer goldens 2-seed byte-identical (HARD gate stays green).
- `npm run build` exit 0, entry < 750 KiB.

## FIELD 7 — PRIME-AUDIT (boot-then-smoke, runtime-verifiable)
1. vs-bots: bot builds a pentagram → enemy chewers spawn → player builds Line+7-Spirals turret → turret charges + beams + **kills** chewers (visible).
2. Spawner emits a chewer ~every 15s **continuously** (not stuck at 2); each chewing chewer **audibly gnaws**.
3. **G+C** in-game opens the unified codex; 3 tabs navigable; locked entries hidden/??? until unlocked; building a turret **unlocks** its TOWERS tile.
4. Startup shows **ONE** CODEX button (no separate COMBOS).
5. Determinism gate GREEN on the new baselines; build under cap.

## FIELD 8 — ROLLBACK
Per-priority commits; each priority independently revertable. Tuning numbers are 1-line reverts. Bot-spawner gated behind a config flag (disable = pre-S104 bot). Unified overlay is additive (old stores/keys preserved).
