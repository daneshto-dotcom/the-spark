# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-07 | Session: S71

## Next Steps
1. **(CARRIED — Council-vetted, re-approval per Rule 11) P2 PAC-MAN HUNTER** — when the leading player FIRST reaches 75% (37/50), spawn ONCE a hunter that chases that player's `avatarPos` for 30s; catch (dist<CATCH_RADIUS) → `benchedUntilTick` (avatar hidden + input locked via the existing `isInputLocked` gate) + reuse `DROP_SPARK`; no catch in 30s → despawn (juke-able via Verlet momentum vs instant cursor). SEPARATE `world.hunters` Map (Voltkin LOCKED+untouched; reuse its pure arrive-steering). **CRITICAL (design-locked):** target disconnect/eliminate → IMMEDIATE despawn + guard EVERY `avatarPos` access (Gemini's #1 crash-class fix). once/game non-resettable flag; teardown clears hunters + hunterSpawned + every `benchedUntilTick`. additive-optional `hunters[]` + `benchedUntilTick` snapshot. Full scope = PDR SCOPE items 15–24.
2. **(CARRIED — Scope-Amendment, Council-reviewed) P3 POTATO BOMB** — carried offensive weapon. SEPARATE `world.potatoes` Map; PICKUP_POTATO (carry-slot exclusive w/ spark) → carry → PLACE_POTATO onto a structure → ARMED; ~23s fuse **FROM SPAWN (USER decision — Council preferred from-placement; CONFIRM/flip with the user before building P3)**. POTATO_DETONATE = deterministic radial AoE (squared-dist `dx*dx+dy*dy<=R*R`, iterate prims in SORTED PrimitiveId order, delete prims + incident bonds + cleanup); owner-agnostic, position-based area-denial; carrier-disconnect → FORCE-DETONATE at last pos; DROP_POTATO. Protocol already v5 (covers P2/P3 wire adds). PDR SCOPE items 25–35.
3. **(CHECK carry-forward — logged, not dropped)** bomb detonation SFX (silent visual-only in v1 — add a boom); OPTIONAL defensive `world.bombs.clear()` in `applyStartGame` (belt-and-suspenders; RETURN_TO_TITLE already covers); spawner rng/bombRng not serialized → save/load resets spawn cadence (PRE-EXISTING spark-spawner posture, not bomb-introduced; folds into netcode/save-determinism backlog).
4. **(pre-existing)** EYES fog fuzzy-edge + CVD shape-icons; LIVE-PLAY netcode infra (host-migration / reconnect / 6p delta); stable non-compacting lobby seats; control-message sender-auth; main.ts Pixi/DOM shell hypertrophy.

## Blockers
None code-side. S71 P1 (bomb) shipped `f500b78` + pushed. Post-push CI (deploy + e2e) triggers on the push — confirm green at boot (Rule 22 end-of-session audit pending CI). **P3 Fork E (fuse-from-spawn vs from-placement) is a flagged USER decision before building P3.**

## Pending Backlog
BACKLOG.md has no forward `- [ ]` items (historical session log). Forward work = Next Steps above + session-state `carry_forward` + the S71 PDR (P2/P3): `.claude/plans/2026-06-06_PDR_S71_bomb-hunter.md` (full 3-feature scope + Council Battle Ledger + PRIME-AUDIT).

## Gotchas (carried + new)
- **`e2e/` NOT in tsconfig** → a wire/colour/layout/constant change passes `tsc` but can silently fail Playwright. ALWAYS run Playwright on lobby/layout/net changes. (S71: the v4→5 bump broke 2 protocol-mismatch e2e — only Playwright caught it; tsc+unit were green.)
- **New real-WebRTC e2e MUST carry `@quarantine-flaky`** (else it gates by default). The protocol-mismatch tests are real-WebRTC + in the gating lane (they pass deterministically once version numbers are right).
- **PROTOCOL_VERSION is now 5** (S71, for TRIGGER_BOMB). A v4 peer is hard-rejected at HELLO.
- **session-state.json** = atomic Node `.cjs` read-modify-write (PS mangles quotes/em-dash; package.json type:module → helpers MUST be `.cjs`). Delete the helper after (knip scans `.claude/`).
- **`rm -rf` is blocked by the destructive guardrail** — use `rmdir` (empty dirs) or leave untracked clutter for `/handoff` prune. (A stray `.claude/session-state.json.lockdir.zombie.*` may exist — untracked, safe to `rmdir`.)
- **Bomb determinism** = a SEPARATE `bombRng` stream + selection over the FROZEN pre-state. Do NOT route bomb decisions through the spark `rng` (would perturb the spark stream + break save.replay).
- **`pre-handoff-review.py`** = GLOBAL advisory OS card (teeth 2026-07-15) — don't `--approve`/`--clear` from a project session.

## Recent Reflexion (last 2 sessions)
**S71** — pickup BOMB hazard (P1; Full Council; P2+P3 carried): host spawner drops a stationary orb every 8–15 sparks (separate bombRng → spark stream byte-identical); grab = instant deterministic leaf-first self-sever ~25% via §VIII.4 (new cause 'bomb'); PROTOCOL_VERSION 4→5. Fork B R1-split → synthesized a third position both Council models converged on (deterministic blast-capped leaf-first over frozen pre-state). CHECK Triumvirate SHIP (Grok PASS, Gemini CONDITIONAL edges logged). f500b78.
**S70** — lobby presence broadcast (P3 from S69, Full): host→peer LOBBY_PRESENCE on join/leave + local self-dispatch → joiners see their own seat. NO version bump (cosmetic). Council flipped Fork B + caught the host-self-dispatch bug. 57ee6b1.
