# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-07 | Session: S72

## Next Steps
1. **(CONFIRM CI — Rule 22)** P3 (`76af09a`) + P4 (`309024c`) post-push CI **E2E were IN-FLIGHT at handoff** (local Playwright 27/27 green; same specs). Confirm both E2E lanes green at boot. P2 (`97e4616`) CI already confirmed green (deploy + e2e). Deploy lanes for P3 green; P4 deploy was running.
2. **(PRE-EXISTING BACKLOG — prioritized; deliberately NOT started S72 — ORANGE budget + each is multi-session)** Pick ONE as a single-priority Standard PDR next session: **#1 STABLE LOBBY SEATS** (non-compacting; most tractable + highest user-value, bounded scope) OR **#3 EYES fog fuzzy-edge + CVD shape-icons** (self-contained render/a11y). **#2 CONTROL-MESSAGE SENDER-AUTH** (security; raises the threat model past friends-only; bounded). **#4 LIVE-PLAY NETCODE INFRA** (host-migration / reconnect / 6p delta) is the LARGEST — needs its OWN multi-session plan; also the home for spawner-rng-serialization + the no-bump cross-version work.
3. **(OPTIONAL tunables, post-playtest)** Fork E potato fuse is from-SPAWN ("hot potato", user) → ONE-LINE flip to Council's from-placement (`makePotato` + `applyPlacePotato`, both commented) if too punishing. Hunter MAX_SPEED/ACCEL/CATCH_RADIUS, BOMB/POTATO fractions+radii+cadence are all tunable constants in `src/constants.ts`.
4. **(LOGGED CHECK carry-forwards — not dropped)** (a) no-bump cosmetic mixed-version gap (a stale-v5 client sees prims vanish from a potato AoE without rendering it — accepted friends-only; revisit the S52 new-client-intent→bump precedent for a future cross-version feature); (b) centralized PLAYING-exit teardown (cleaner if the FSM grows past WIN-only end); (c) hunter disconnect-fade (PDR locks immediate despawn — optional polish).

## Blockers
None code-side. All 4 S72 priorities shipped + pushed on `master` (P2 `97e4616`, P3 `76af09a`, P4 `309024c`; P1 bomb was S71 `f500b78`). P3+P4 CI E2E were in-flight at handoff — confirm green (Rule 22).

## Pending Backlog
BACKLOG.md has no forward `- [ ]` items (historical session log). Forward work = the prioritized PRE-EXISTING backlog in Next Steps #2 + the `carry_forward` in `.claude/session-state.json` (full prioritization + logged CHECK carry-forwards).

## Gotchas (carried + new)
- **`e2e/` NOT in tsconfig** → a wire/colour/constant/gameplay change can pass `tsc`+unit yet fail Playwright. ALWAYS run the gating lane (`npx playwright test --grep-invert "@quarantine-flaky"`) on lobby/layout/net/gameplay changes. (S72 ran it on every priority — 27/27.)
- **PROTOCOL_VERSION is 5** (UNCHANGED S72 — the S71 v4→5 bump covers the WHOLE bomb+hunter+potato batch; Council "single bump", both S72 CHECK reviewers validated no-bump). The protocol-mismatch e2e hardcode v2(older)/v6(newer) — a FUTURE bump must update those.
- **New stochastic content gets a SEPARATE seeded RNG stream** (spark `rng` / `bombRng` / `potatoRng`, distinct xor consts) so existing spark-sequence tests + `save.replay` byte-equivalence stay green.
- **The 3 hazards (bomb/hunter/potato) are SEPARATE `world.*` Maps** (Voltkin creatures LOCKED + untouched). Teardown clears ALL on WIN_TRIGGER + RETURN_TO_TITLE + START_GAME (start-of-match invariant).
- **session-state.json** = atomic Node `.cjs` read-modify-write (PS mangles quotes/em-dash; `type:module` → helpers MUST be `.cjs`; delete after — knip scans `.claude/`).
- **`rm -rf` is guardrail-blocked** → `rmdir` (empty) or `rm <file>` then `rmdir`.
- **`pre-handoff-review.py`** = GLOBAL advisory OS card (teeth 2026-07-15) — don't `--approve`/`--clear` from a project session.

## Recent Reflexion (last 2 sessions)
**S72** — hunter (P2 `97e4616`) + potato bomb (P3 `76af09a`) + detonation-boom/bomb-clear (P4 `309024c`): the S71-carried batch FULLY shipped autonomously (user GO), each DO→Triumvirate/Micro CHECK→commit→push. Hunter = 75%-trigger host-authoritative chase, catch→30s bench (avatar hidden + input locked) + DROP_SPARK, juke-able; SEPARATE world.hunters Map; CRITICAL target-disconnect crash-guard; solo-avatarPos fix; no bump. Potato = carryable from-SPAWN-fuse radial-AoE; SEPARATE potatoRng; deterministic position-based AoE (squared-dist + sorted-ID); carrier-disconnect force-detonate; no bump. P4 = boom SFX (one synth covers bomb+potato) + start-of-match bomb-clear. CHECK DISCIPLINE: 4 reviewer BLOCKER-class findings across P2+P3 — ALL triaged false-positive against the ACTUAL code, defensive hardening adopted + tested. Gates green throughout (vitest 1054→1096, Playwright 25→27, save.replay byte-equiv held). Handed off ORANGE 76% post-batch (deliberately no new pre-existing item — quality-first).
**S71** — pickup BOMB hazard (P1; Full Council; P2+P3 carried): host spawner drops a stationary orb every 8–15 sparks (separate bombRng → spark stream byte-identical); grab = instant deterministic leaf-first self-sever ~25% via §VIII.4; PROTOCOL_VERSION 4→5. f500b78.
