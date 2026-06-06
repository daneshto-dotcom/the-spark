# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-06 | Session: S70

## Next Steps
1. **(QUEUED — lobby continuation) Stable non-compacting lobby seats** — Council-recommended (S70 Grok+Gemini convergent) but DEFERRED from P3: it needs touching the AUTHORITATIVE Begin seating path (out of P3's net-free scope). Today seats COMPACT on leave (a peer can shift seat 3→2), consistent with Begin. To make seats stable, assign a persistent per-peer seat that survives an earlier peer's departure AND change `createBeginMatchHandler` so lobby-seat == Begin-seat. Own PDR + Council (net-sensitive). Low urgency — only the rare leave-during-lobby edge differs.
2. **(EYES)** fog fuzzy-edge + memory-shade live look (VISION_FADE 40→20 if too soft).
3. **(EYES/design)** CVD shape-icons + first-run visual-regression baselines — the S69 P2 accessibility glyph + S70 roster-driven per-seat colour partially de-risk this.
4. **(LIVE-PLAY)** netcode infra — host-migration / reconnect-to-seat / 6p snapshot delta / 3+-player host-loss (main.ts connectionLost gap). NOTE: S70 surfaced a lobby host-LOSS edge — a joiner keeps a stale presence rack behind the connection-lost path — which folds into this.
5. **(SECURITY / later)** control-message sender-authentication — LOBBY_PRESENCE (like the pre-existing START_GAME_SIGNAL/ENDGAME) is trusted from any peer; harmless under v1 friends-only + cosmetic, but a future adversarial-peer-resistance pass should add host-peerId verification across ALL control messages.
6. **(PRE-EXISTING)** main.ts Pixi/DOM shell hypertrophy — needs live-play.

## Blockers
None code-side. S70 shipped P1 (lobby presence broadcast, `57ee6b1`). Deploy + E2E CI BOTH SUCCESS (gating lane 24/24; the quarantine-lane exit-1 annotation is by-design continue-on-error). tsc PASS, knip 0, vitest 1039, build 512.54KB.

## Pending Backlog
BACKLOG.md has no forward `- [ ]` items (historical session log). Forward work = Next Steps above + session-state `carry_forward`.

## Recent Reflexion (last 2 sessions)
**S70** — lobby presence broadcast (P3 from S69, Full, Council-vetted):
- P1: host→peer `LOBBY_PRESENCE{roster}` on peer join/leave + LOCAL self-dispatch → joiners see their OWN seat (own-seat glow, real colour, accurate drop-on-leave). Closed P2's Gemini-C1 + Grok-1. Net-free, **NO version bump** (cosmetic; v4 peer null-rejects + falls back). State-discovery found the render was already roster-ready → pure data-path. Council FLIPPED my Fork-B bump→no-bump + caught the host-self-dispatch bug (send() excludes self). CHECK Grok FAIL triaged (spoof = cosmetic + existing trust model; only the length-clamp sub-finding fixed). 57ee6b1.
- SESSION: single clean Full priority; Council ROI proven (flipped a decision + caught a bug). #improve carried: (1) feed Gemini the CURRENT shipped-UI on UX asks (it advocated already-shipped labels); (2) put the v1-friends-only threat scope in Grok's CHECK prompt so its FAIL-severity calibrates to scope.

**S69** — saveToLocalStorage drop (P1) + lobby 6-seat seat-UX (P2, Full Council):
- P2: replaced the 1v1 two-pane with a 6-seat fill-the-room rack (blueprint look, net-free); the lobby-construction e2e EMPIRICALLY caught an over-eager CHECK fix (drop-to-zero) that tsc + 1013 unit tests passed → reverted. e7190b8.

## Gotchas (carried)
- **`e2e/` NOT in tsconfig** → a wire/colour/layout/constant change passes `tsc` but can silently fail Playwright. ALWAYS run Playwright on lobby/layout/net changes (S69 P2 + S70 both relied on it).
- **Preview screenshot tool times out on the Pixi/WebGL canvas** (eval works; Playwright screenshots work headless). Boot-smoke via `preview_eval` or the Playwright `getSeats`/`getDebugState` accessors, NOT `preview_screenshot`.
- **session-state.json** = atomic Node read-modify-write via a `.cjs` helper (PS mangles quotes/em-dash; package.json is type:module → helpers must be `.cjs`). Delete the helper after (knip scans `.claude/`).
- **Bash tool routes to git-bash** (POSIX) despite the env banner.
- **e2e gating vs quarantine lanes** (e2e.yml): a GATING lane (`--grep-invert "@quarantine-flaky"`, red == real regression) + a NON-GATING `continue-on-error` quarantine lane (`--grep "@quarantine-flaky"`, real-WebRTC). A quarantine-lane **exit-1 annotation is BY DESIGN** (job conclusion stays `success`). New real-WebRTC tests MUST carry the `@quarantine-flaky` tag (else they gate by default).
- **`pre-handoff-review.py`** = GLOBAL S157 OS card (advisory until 2026-07-15) — don't `--approve`/`--clear` from a project session.
- **LOBBY_PRESENCE is cosmetic + NO version bump (S70)**: the authoritative roster still ships only at Begin via `START_GAME_SIGNAL`. A pre-S70 peer null-rejects `LOBBY_PRESENCE` + falls back to count-based seats (graceful, no desync). Do NOT "fix away" the count-based fallback in `lobbyView` — it's the degradation path + the pre-beacon window.
