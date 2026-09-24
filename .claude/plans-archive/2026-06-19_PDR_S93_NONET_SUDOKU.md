---
STATUS: AWAITING_USER_GO
session: S93
created: 2026-06-19
tier: Full (>30K — new event subsystem: trigger + generator + paused game-mode + netcode + scoring mutation + overlay/input)
item: NONET — connect 9 squares → synced Sudoku race → winner ×2 / others ÷2
gate: REQUIRES fresh explicit user `go` THIS session. The session-state `pdr_approved:true` is STALE
      from S92 (completed hygiene Micro) and does NOT authorize this feature. Do NOT write any code,
      set no gate flags, until the user types `go` on THIS plan. (Scope Amendment / URGENCY protocol:
      "GO!" was the concept green-light; this PDR is the gate.)
deliberation: Full tier formally wants a 3-way Council (2 rounds). Offered to user as a choice —
      run Council pre-build, OR proceed on this plan + run the Triumvirate CHECK after build.
defaults_locked: user waved off the 4 design questions → my recommended options are LOCKED below
      (D1 6×6 · D2 freeze-the-duel · D3 resume-after · D4 exactly-9 pure squares, once/match).
---

# PDR — NONET: the 9-Square Sudoku Lock

**One line:** when any player closes a structure of **exactly 9 connected Squares and nothing else**,
the duel **freezes for everyone** and the **same** seeded **6×6 Sudoku** appears; the **first** player to
solve it has their score **doubled** and **every other** player's score **halved**, then the duel resumes.

**Why "Nonet":** a *nonet* is a group of nine — and in Sudoku each row/column/box IS a nonet. Connecting
9 squares literally forms a nonet → that's the trigger's name and the toast text. (6×6 grid also rhymes
with SPARK's 6 SparkTypes — a happy resonance, not a dependency.)

---

## 1. OBJECTIVE

Add a **wildcard event subsystem** that injects a synchronized single-player-puzzle *race* into the
real-time builder duel, gated behind a deliberate geometric trigger (a pure-9-Square structure), with a
dramatic, reversible scoreboard swing as the payoff. The whole subsystem is **additive and host-authoritative**:
all randomness flows from one broadcast seed (zero cross-client float divergence), and the only edit to an
existing determinism-sensitive loop is a single `if (world.sudoku) return;` gate + one host-only score mutation.

**Out of scope (this ship):** per-player live progress mirroring (you won't see rivals' cells fill in —
only the win moment is synced); difficulty scaling; AI-bot solving (bots simply never solve → they take the
÷2 if a human wins, see RISK 7); a Codex tile for the event.

---

## 2. LOCKED DESIGN DECISIONS (user waved off the questions → my recommendations stand)

| # | Decision | Locked choice | Rationale |
|---|----------|---------------|-----------|
| D1 | Grid size | **6×6** (digits 1–6, 2×3 boxes) | ~30–90 s solve fits the ~157 s match. 9×9 can outlast the match; 4×4 is trivial. Resonates with 6 SparkTypes. |
| D2 | Duel during race | **Freeze for all** | Cleanest read of "everyone solves individually, first wins." Physics + building + scoring all pause. |
| D3 | After first solve | **Resume the duel** | ×2/÷2 is a momentum swing, not a finisher. Match continues from mutated standings (may instantly cross WIN — see RISK 5; that's a fine, dramatic outcome). |
| D4 | Trigger | **Exactly 9 pure Squares, once per match** | Connected component of exactly 9 `SparkType.Square` prims, no other-typed prim in it. `world.sudokuFiredThisMatch` guard (mirrors `hunterSpawned`). Anti-spam, unambiguous. |

These are reversible knobs (constants), not architecture — trivially re-tunable post-playtest.

---

## 3. SCOPE — files to CREATE / TOUCH

### NEW files
- **`src/state/sudoku.ts`** — deterministic 6×6 generator + validator. `generateSudoku(seed): {givens: (0|1..6)[36], solution: (1..6)[36]}` via `mulberry32(seed)` (seeded fill by randomized backtracking + symmetric dig to a target clue count). `isSolved(entries, solution): boolean`. **Pure, seed-driven → identical on every client.** Self-contained, no world deps.
- **`src/state/sudokuEvent.ts`** — event lifecycle: `detectNonet(world, seedPrimId): PlayerId | null` (BFS via `componentOf`, returns owner iff exactly-9-pure-Square), `startSudoku(world, seed)`, `resolveSudoku(world, winnerId)` (the ×2/÷2 mutation + `scoreProgress` recompute + clear `world.sudoku`). Host-authoritative.
- **`src/render/sudoku/` overlay module** (`sudokuOverlay.ts` + `nonetArt.ts`) — Pixi modal overlay (mirrors `settingsOverlay.ts`/`codexOverlay.ts` container pattern): the retro arcade-Tetris board (beveled jewel cells, CRT scanlines, gold cloisonné frame, chunky bitmap numerals), givens (locked) vs player entries (editable), selected cell, the "NONET!" title plate + "first to solve · winner ×2 · rivals ÷2" banner, the cascade-in / drop-and-squash cell animations, the kami guardian + kodama + dusk-sky ambiance, and the resolve flash. Renders purely from `world.sudoku` + local entry buffer. **Phase 1 = fully Pixi-Graphics code-drawn (zero asset-bundle cost); Phase 2 swaps the spirit/sky placeholders for illustrated sprites loaded off-bundle from `public/art/nonet/`.** See §6 (art direction) + §7 (phasing).

### TOUCHED files
- **`src/state/worldTypes.ts`** — add `sudoku: SudokuEvent | null` and `sudokuFiredThisMatch: boolean` to `World`. `SudokuEvent = { seed, givens, solution, startTick, solvedBy: PlayerId | null }`.
- **`src/state/world.ts`** — initialize both new fields in `createWorld` (null / false).
- **`src/state/gameMode.ts`** — clear both fields in `applyStartGame` **and** `applyReturnToTitle` (the all-hazards start-of-match invariant the file already enforces for bombs/hunters/potatoes/rainbows/seagulls).
- **Trigger hook** — in the bond-formation path (`placePrimitive.ts` `makeBond`, or a host-only post-tick sweep in `main.ts`): on each new bond touching a Square, host-only, if `!world.sudokuFiredThisMatch && world.sudoku===null`, call `detectNonet`; on hit → `startSudoku` + broadcast (see §4).
- **`src/state/scoring.ts`** `tickScoring` — guard `if (world.sudoku !== null) return;` (freeze income during the race). The physics/build freeze is the same gate in the main loop.
- **Main loop (`main.ts`)** — gate the physics step + win check on `world.sudoku === null`; drive overlay show/hide off the field (mirror of the cinematic transition watcher).
- **`src/net/protocol.ts`** — extend `NetSnapshot` with a compact `sudoku` field (seed + solvedBy + active flag; clients regenerate givens/solution from seed) **and** add `SUDOKU_SOLVED` to the client→host intent union + `CLIENT_INTENT_TYPES` allowlist. (Snapshot-carried lifecycle = robust to packet loss + matches the "clients render serialized state, never compute" philosophy; the solve is the only client intent. `PROTOCOL_VERSION` bumps.)
- **`src/net/hostHandlers.ts`** — handle inbound `SUDOKU_SOLVED`: validate the submitted grid against the host-side solution; first valid wins → `resolveSudoku`. (Host re-derives solution from seed = cheat-resistant.)
- **`src/net/clientHandlers.ts`** — apply the snapshot `sudoku` field (enter/exit overlay; show resolve).
- **`src/input/controls.ts`** — while `world.sudoku!==null` (and unsolved for the local player): cell select (pointer) + digit 1–6 entry (`onKeyDown`, ~line 588); on local completion → send `SUDOKU_SOLVED` (or host dispatches locally). Suppress the normal build/carry input during the freeze.
- **`src/render/audioManager.ts`** — the realm-shift hooks (§6.6): on Nonet enter → duck/pause `musicGainNode` (S51 machinery) + start the looping Nonet theme; per-cell + invalid + solve/halve SFX; idle-blip scheduler; on exit → fade theme + resume main music. New consts for the theme + SFX URLs.

**NEW off-bundle assets** (served from `public/`, lazy-loaded on first Nonet — zero JS-bundle cost): `public/audio/nonet-theme.ogg` (transcode of the staged `assets-source/audio/cloudstep-caravan.mp3`), `public/audio/nonet/*.ogg` (anime SFX), and — Phase 2 — `public/art/nonet/*` (illustrated Ghibli sprites).

### TESTING (new + touched)
- `src/state/sudoku.test.ts` — generator determinism (same seed → byte-identical givens+solution across calls), every generated puzzle has a valid full solution, `isSolved` accepts the solution / rejects a one-cell-off grid, givens are a subset of solution.
- `src/state/sudokuEvent.test.ts` — `detectNonet` fires on exactly-9-pure-Square, rejects 8, rejects 10, rejects 9-with-a-Dot, rejects a second time same match (guard); `resolveSudoku` doubles winner, halves others, recomputes `scoreProgress=max`, clears `world.sudoku`.
- protocol roundtrip test — `SUDOKU_SOLVED` intent + snapshot `sudoku` field serialize/deserialize; `PROTOCOL_VERSION` bump asserted.
- `gameMode` start/return clears the two fields (extend the existing all-hazards invariant tests).
- Ship gate: `tsc` 0 · full `vitest` green · bundle < 550 KiB (overlay is the main weight risk — see RISK 10).

---

## 4. NETCODE & DETERMINISM (the load-bearing design)

**Pattern = GODLY_TRIGGER** ([godlyOrchestration.ts:66](src/state/godlyOrchestration.ts)): host detects, host acts, host serializes.

1. **Seed** — host mints one `seed` (next draw off a `mulberry32` stream or `world.tick`-derived), the ONLY entropy. `generateSudoku(seed)` is pure → host and every client produce the identical givens+solution. No grid is ever sent — just the seed. (Same trick the spawner/collision streams already rely on, rng.ts §10.5 LOCKED.)
2. **Start** — host sets `world.sudoku`; the field rides the next `NetSnapshot`. Clients see it appear → open the overlay (clientHandlers). No fragile fire-and-forget START packet; snapshot-carried = self-healing on loss.
3. **Solve** — each client (incl. host-local) collects entries locally; on a full grid the client sends `SUDOKU_SOLVED {grid}` intent. Host validates against its own solution; **first valid** wins.
4. **Resolve** — host runs `resolveSudoku` (×2 winner / ÷2 others on `scoreByPlayer`, recompute `scoreProgress`, clear `world.sudoku`). All float math is **host-only**; clients receive the new scores + cleared event via the already-serialized snapshot → **zero divergence**.
5. **Freeze** — while `world.sudoku!==null`: `tickScoring` early-returns, the main physics/win step is gated, build/carry input suppressed. Frozen, not torn down — resume is just the gate reopening.

**Determinism invariants:** (a) only the seed is broadcast; (b) the ×2/÷2 mutation runs only on host; (c) `detectNonet` runs only host-side (clients never trigger); (d) generator uses only `mulberry32` (no `Date`, no unseeded `Math.random`).

---

## 5. RISKS & MITIGATIONS

| # | Risk | Mitigation |
|---|------|------------|
| 1 | **Desync** — any non-host RNG or non-host score math diverges. | Seed-only broadcast; generator pure-`mulberry32`; ×2/÷2 + `detectNonet` host-only; clients render serialized snapshot. Same model as all existing hazards. |
| 2 | **PROCESS GATE (blocking)** — stale S92 `pdr_approved:true` is NOT S93 authority. | No code, no flag writes until fresh `go` on this plan. |
| 3 | **Nobody can solve it → permanent freeze / softlock.** | A **timeout** (`SUDOKU_TIMEOUT_TICKS`, default ~120 s): on expiry with no solver, `resolveSudoku(null)` = no score change, just resume. Host-driven, serialized. (Add to §3 constants.) |
| 4 | **Frozen duel = inbound hazards/bombs/hunters mid-air.** | The freeze gates the WHOLE physics/lifecycle step (not just building), so hazards freeze too; nothing advances while `world.sudoku` is set. Verify no lifecycle runs outside the gate. |
| 5 | **×2 instantly crosses `PHASE_1_WIN_SCORE` → match ends right after resume.** | Intended/dramatic (D3). Resolve runs, snapshot carries new scores, the normal WIN gate fires next ungated tick. No special-case needed — just documented. |
| 6 | **Cheating** — a client claims a solve it didn't earn. | Host validates the submitted grid against its own seed-derived solution; a bogus grid is rejected, race continues. |
| 7 | **AI bots (mode 'bots') can't solve a Sudoku.** | Bots simply never send `SUDOKU_SOLVED` → a human wins (or timeout RISK 3). Acceptable v1; bot-solver is explicitly out of scope. |
| 8 | **Late-joiner mid-race.** | Snapshot-carried `sudoku` field → a joiner regenerates the puzzle from the seed and joins the race in progress. Free from the design, not a special path. |
| 9 | **`PROTOCOL_VERSION` bump** breaks cross-version play. | Bump once; assert in the protocol test. Solo unaffected. |
| 10 | **Bundle < 550 KiB ceiling** (currently 548.3). | Phase 1 is 100% Pixi-`Graphics` code (board, frame, vector spirits) — a few KiB of draw logic, measured before ship. The illustrated Ghibli art (Phase 2) is **off-bundle** (`public/art/nonet/`, lazy-fetched) → it cannot touch the JS budget. Measure `tsc`/bundle each phase. |
| 11 | **"No other connectors" ambiguity.** | Locked interpretation (D4): the connected component contains ONLY Square primitives. Bonds between squares ARE the connections (allowed); any non-Square prim in the component disqualifies. Stated in the toast/tests so intent is unmistakable. |
| 12 | **Colorblind** — digits encoded by the 6 spark colors. | The **numeral is the primary token**; color is secondary decoration (never color-alone). Meets the engine's "pair color with a second cue" norm. |
| 13 | **Motion/readability** — cascade + particles + scanlines could obscure the grid or hurt low-end FPS. | Gate all ambiance on the existing `cinematicsEnabled` flag (like every other cinematic); board legibility is the priority layer drawn on top; particle counts capped. The freeze means no physics competes for frame budget. |
| 14 | **Art tone drift** — "Ghibli kami" is subjective; Phase-2 sprites could miss. | Lock the look via AI-generated concept sprites (gcp-vertex `imagen_generate`) reviewed BEFORE Phase-2 build (OPEN ITEM 3); Phase 1 ships charming-but-safe vector spirits in the meantime. |

---

## 6. VISUAL & ART DIRECTION — "The Nonet Trial"

**Aesthetic target:** late-90s / early-2000s arcade-Tetris visual language fused with a Ghibli/Miyazaki dusk world. The *puzzle* is Sudoku; the *look & feel* is Tetris-era arcade.

### 6.1 Concept framing (diegetic justification)
Locking 9 Squares into a perfect lattice **summons a kami** — a forest-spirit guardian of order. The world dims (the freeze = the spirit pulling everyone into its trial), a glowing lattice grid materializes, and the kami sets the puzzle. This is why a Sudoku interrupts a builder duel: it's a *summoned trial*, not a bolt-on minigame. The guardian is the on-screen narrator of the ×2/÷2 stakes.

### 6.2 The board — retro arcade-Tetris language (100% code-drawn)
- **Beveled jewel cells:** light-top-left / dark-bottom-right edges (the Game Boy / TGM / Tetris-Worlds block look), glossy top sheen, rounded.
- **CRT vibe:** scanline overlay, faint vignette, subtle bloom on lit cells.
- **Gold cloisonné frame:** dark lacquer panel, gold inlay border, brass corner rivets, a beveled "NONET" title plate (chunky bitmap letters).
- **Box separators:** thick gold lines split the 6×6 into six 3×2 boxes.
- **Motion (the "Tetris" DNA):** board **cascades in** block-by-block on summon; each player entry **drops-and-squashes** into its cell; a shimmer rides the scanlines; resolve = a light burst.

### 6.3 Digits = the six SparkType colors (the coherence keystone)
Each digit is rendered as a jewel in its SparkType color and carries the numeral: **1 Dot white · 2 Line yellow · 3 Triangle red · 4 Square blue · 5 Circle green · 6 Spiral purple** (`SPARK_COLORS`, constants.ts:28-33). The Nonet is a **color-logic puzzle in SPARK's own alphabet** — not a foreign mechanic. The **numeral is the colorblind-safe secondary cue** (never color alone). Optional toggle: render the spark *glyph* instead of the numeral (codex-style) — Phase 2.

### 6.4 The Ghibli layer — characters & world
- **Guardian kami** (Totoro/kodama-adjacent forest spirit): perched beside the board, idle-breathing + blink loop; **reacts** — leans in as cells fill, beams + raises its lantern for the winner, droops for the halved.
- **Kodama** (little white forest spirits) dot the frame + drift in the sky, rattling/reacting to progress.
- **Dusk sky world:** parallax gradient sky (indigo→rose→gold), soft clouds, a hazy moon, floating paper lanterns, falling sakura petals — Miyazaki ambiance behind the frame.
- **Per-player status chips:** chibi faces in each player's color showing solving / ✓ solved.

### 6.5 Juice — making the ×2 / ÷2 *felt*
On resolve: the **winner's color floods the frame** + light burst + kami blessing + triumphant audio sting + a "×2" stamp on their chip; the **losers' kodama wilt** + a soft "deflate" + "÷2" stamp. Screen-shake pulse (reuse `screenShake.ts`). This is the emotional payload of the whole feature — budget real polish here.

### 6.6 Audio & the "different realm" genre-shift (the signature beat — reuse `audioManager.ts`)
The Nonet doesn't just freeze the duel — it **yanks everyone into another universe with its own music, sounds and genre**, then drops them back. The audio sells the realm shift:

- **Enter (summon):** main match track **ducks to silence** (reuse the S51 `musicGainNode` auto-duck) + a kami "pull" whoosh; the world dims/desaturates and the bright Nonet realm irises in.
- **During (the realm):** the **Nonet theme loops** — a bouncy, MapleStory-esque track (**user-provided: `Cloudstep Caravan`**, staged at `assets-source/audio/cloudstep-caravan.mp3`) on a looping `AudioBufferSourceNode` (`loop=true`) on the music bus. Over it, a palette of **funny anime SFX**: boing/pop on cell entry, kawaii "correct!" chime, comedic bonk on an invalid digit, and a randomized **idle-blip ambient loop** (kami/kodama giggles) so the realm feels alive. Deliberately cartoon/playful — the opposite genre to the tense duel.
- **Exit (resolve):** triumphant arpeggio (winner) + comedic deflate (halved); Nonet theme fades, realm wipes out, **main match music resumes**, world re-saturates, duel unfreezes.

**Implementation:** Nonet theme → `public/audio/nonet-theme.ogg` (transcode the MP3 to opus 64k via the project's documented recipe `ffmpeg -c:a libopus -b:a 64k -application audio`; 2.7 MB → ~1 MB; ffmpeg 8.1 confirmed available). Anime SFX → short `.ogg` in `public/audio/nonet/`. **All audio is off-bundle** (static `public/`, lazy-loaded on first Nonet via `decodeAudioData`) → **zero JS-bundle cost**. Bussed through the existing music/sfx gain nodes so master mute/volume + `cinematicsEnabled` already govern it. The S51 duck/resume machinery does the realm cross-fade.

### 6.7 Implementation mapping (art → buildable, honest split)
| Layer | How it's built | Bundle cost |
|-------|----------------|-------------|
| Board, cells, frame, scanlines, numerals, box lines | Pixi `Graphics` + `BitmapText` (reuse `shapes.ts`/`ui.ts`) | **zero** (code) |
| Cascade / drop-squash / resolve flash / shake | existing effects + tween + `screenShake.ts` | zero |
| Sky gradient, lanterns, sakura, scanline shimmer | Pixi `Graphics` + particle layer | ~zero |
| **Kami + kodama + portraits — Phase 1** | **stylized vector spirits drawn in `Graphics`** (charming, on-brand, ship now) | **zero** |
| **Kami + kodama + sky — Phase 2** | **illustrated sprite/WebP assets lazy-loaded from `public/art/nonet/`** (true Ghibli look) | **off-bundle** (static files, fetched only when a Nonet fires — never touch the 550 KiB JS budget) |

The off-bundle asset path is the load-bearing trick: illustrated raster art lives in `public/` and is served as separate static files, lazy-fetched on first Nonet — so the Ghibli upgrade **cannot** blow the JS bundle ceiling (RISK 10 retired). Phase-2 sprites can be AI-generated (gcp-vertex `imagen_generate`) to prototype, then refined/commissioned.

---

## 7. PHASING (mirrors the G2-PROMO Phase 1/2 split)

**Phase 1 — Mechanic + retro board + vector spirits (this PDR's `go`).** Generator, event, trigger, netcode, scoring mutation, freeze, timeout, full retro arcade-Tetris board with the six-color jewels + all motion/juice + audio, and **vector** kami/kodama/portraits. Fully playable, fully code-drawn, **zero asset-bundle risk** — playtest-ready fast. This is the whole mechanic + ~85% of the vibe.

**Phase 2 — The illustrated Ghibli upgrade (separate PDR).** Swap vector spirits for illustrated sprite assets (off-bundle `public/art/nonet/`), parallax sky layers, richer character animation (idle/react/bless/wilt), spark-glyph cell mode, optional portrait art. Carries its own asset-pipeline + bundle-of-static-assets review. Not covered by this PDR's `go`.

---

## 8. OPEN ITEMS (confirm or override at `go`)
1. **Deliberation:** run the full 3-way Council now (Full-tier protocol), or `go` on this plan and I run the Triumvirate CHECK after build? (Recommend: plan-`go` + post-build CHECK — greenfield-additive; the determinism surface is the only real risk and it's fully addressed.)
2. **D1–D4** locked as my recommendations — say the word to flip any (e.g. "make it 9×9", "let it end the match", "repeatable").
3. **Art pipeline:** confirm the Phase-1 (vector spirits, code-drawn) → Phase-2 (off-bundle illustrated sprites) split. Or want me to AI-generate Ghibli concept sprites *now* (gcp-vertex `imagen_generate`) to lock the character look before I build?
4. **Digits vs glyphs:** ship numerals in Phase 1 (a11y-safe), spark-glyph mode as a Phase-2 toggle — OK?
5. **Solve input feel:** pointer-select-cell + digit-key 1–6 entry. OK, or want on-screen number-pad buttons (mobile-friendly)?
6. **Timeout (RISK 3):** ~120 s default acceptable?
