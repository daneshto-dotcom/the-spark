# PDR — S114 · G4 in-world leader crown + roadmap reconcile

**Tier:** Micro (<10K, 3 source files + 2 test files + docs) · render-only, no wire/protocol/save change
**Deliberation:** Micro user-path — auto-waived once `pdr_approved` + `unlock_source=user` (global Rule 17). CHECK = RALPH:PATROL.
**Roadmap:** Tier-1 **G4** (build-feel juice). The genuinely-open, non-gated, non-subjective remaining G-series item.

---

## OBJECTIVE
Render a small gold **crown above the current score-leader's avatar** on the field so "who's winning"
reads at the action point — not only in the top-left HUD leaderboard (which today is the *only* leader
cue: `ui.ts:326` marks rank-0 with `*`). Plus **reconcile the stale BACKLOG roadmap**: G3b (Codex
silhouettes) shipped S97 and the G4 bond-formation juice shipped as `bondCommit.ts`, but the roadmap
still lists both as "next" — correct it so the roadmap stops mis-listing done work.

## STATE-DISCOVERY (done pre-PDR, against the code)
- `world.scoreByPlayer: Map<PlayerId,number>` is the synced per-seat score (HUD leaderboard source). ✓
- `world.localPlayerId` exists; `isNetworked(world) = gameMode !== 'solo'` (covers `bots` + `1v1`). ✓
- `AvatarRenderer.sync(world, controls)` already iterates `world.players`, has each avatar's `x,y`, a
  benched-skip, a `players.size > 1` nameplate gate, and a lazily-created shared `pointerGhost` Graphics
  — the crown follows that exact pattern. ✓
- Render-only: touches **no** sim/snapshot/scoring logic ⇒ no `PROTOCOL_VERSION` bump (held 14),
  replay byte-identical by construction (S113 save.replay proof unaffected). ✓
- G3b already shipped (`comboCodexStore.ts` header "S97 G3b"; `codexOverlay.ts` renders undiscovered as
  `???` + dim silhouettes); G4 bond-juice already shipped (`bondCommit.ts` expanding-ring pop). ✓

## SCOPE
1. **`src/state/scoring.ts`** — NEW exported pure `leaderPlayerId(world): PlayerId | null`: the seat with
   the strictly-highest `scoreByPlayer` where score > 0, tie-break by `world.players` insertion order (so
   it agrees with the HUD's stable sort); `null` when no seat has scored.
2. **`src/render/avatarRenderer.ts`** —
   - NEW exported pure `shouldShowCrown(isLeader, playersSize, isBenched, gameState): boolean` (mirrors
     `shouldShowPointerGhost`) — true iff leader && size>1 && !benched && gameState==='PLAYING'.
   - One lazily-created shared crown `Graphics` (pointerGhost pattern). Per `sync`, compute `leaderId`
     once; draw a **static** gold crown `CROWN_OFFSET_Y` above the leader's avatar core; cleared/hidden
     otherwise. Module-local constants (pure UI feel, not gameplay-tunable): `CROWN_OFFSET_Y`,
     `CROWN_W`, `CROWN_COLOR` (GOLD), `CROWN_ALPHA`. **No animation/bob** (informational, per the
     "no procedural juice" taste rule — owner has rejected procedural motion before).
3. **`BACKLOG.md`** — mark G3b SHIPPED (S97), G4 bond-formation-juice SHIPPED (`bondCommit.ts`), G4
   in-world leader crown SHIPPED (S114); note the pooped-reject cue stays playtest-gated (logged owner
   semantic: silent reject unless playtest asks).

## NON-GOALS
- **No `ui.ts` change** — the HUD `*` logic stays as-is (no regression to the tested leaderboard string).
- No crown in solo, no crown while POSTGAME/WIN/LOBBY, no animation, no fog change (crown lives in the
  avatar layer → inherits the same fog occlusion as the avatar+nameplate; no new info leak).
- Pooped-reject cue NOT added (playtest-gated).

## TESTING
- **Unit `scoring.test.ts`:** `leaderPlayerId` — one clear leader; tie → first insertion seat; all-zero
  → null; one scorer among zeros → that seat.
- **Unit `avatarRenderer.test.ts`:** `shouldShowCrown` truth table — leader/networked/PLAYING/not-benched
  → true; benched leader → false; solo (size 1) → false; non-leader → false; non-PLAYING → false.
- **Gates:** tsc 0 · full vitest green (≥1734 + new) · build entry < 750 KiB.
- **In-browser (preview, `app.ticker.update` drive per S113):** inject scores so a bot seat leads → crown
  over that avatar; raise another seat → crown moves; solo → no crown; 0 console errors.
- **CHECK:** RALPH:PATROL.

## DEPLOY
MANUAL `npm run deploy` (gh-pages classic Pages; GitHub Actions dead = account billing lock). `git push` ≠ deploy.

## RISK — LOW
Render-only, additive, deterministic from synced state, fully reversible (delete the crown draw + the two
pure helpers). Worst case = a crown at a wrong offset = cosmetic, zero sim/score/replay impact.
